import type { PageItems, PriceBox, RawItem } from "./overlay-price";
import { buildPriceBoxesForPage } from "./overlay-price";

// OCR fallback for the price overlay: photographed tickets are image-only PDFs
// (no text layer), so the printed price can't be located via getTextContent.
// Instead we render each textless page, OCR it with tesseract.js, adapt the
// recognized words into the same RawItem shape the text-layer matcher
// consumes, and reuse buildPriceBoxesForPage unchanged — mask geometry,
// alignment and format mimicry all behave exactly as for born-digital PDFs.

// 2x (~144 dpi) is enough for tesseract on ticket-sized print and halves the
// recognition time vs the 4x patches use.
const OCR_SCALE = 2;

// Wall-clock budget across all pages: ~3.5s/page locally can be 2-3x on a
// serverless CPU, and the export route has 60s total. Stop starting new pages
// past this point and keep whatever was found so far.
const OCR_BUDGET_MS = 25_000;

// Tesseract bboxes are glyph-tight — for digit runs that's the cap height,
// not the em box a PDF font size describes. Divide to approximate the font
// size the run would have had as real text.
const CAP_TO_EM = 0.7;

interface OcrBBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface OcrWord {
  text: string;
  bbox: OcrBBox;
  baseline?: OcrBBox & { has_baseline?: boolean };
}

// pdfjs viewport: only the two conversion methods are needed here.
interface ViewportLike {
  convertToPdfPoint(x: number, y: number): number[];
}

// Flatten tesseract's blocks → paragraphs → lines → words tree in reading
// order (defensively: every level may be null on empty regions).
function collectWords(blocks: unknown): OcrWord[] {
  const words: OcrWord[] = [];
  if (!Array.isArray(blocks)) return words;
  for (const block of blocks as Array<Record<string, unknown>>) {
    const paragraphs = block?.paragraphs;
    if (!Array.isArray(paragraphs)) continue;
    for (const para of paragraphs as Array<Record<string, unknown>>) {
      const lines = para?.lines;
      if (!Array.isArray(lines)) continue;
      for (const line of lines as Array<Record<string, unknown>>) {
        const lineWords = line?.words;
        if (!Array.isArray(lineWords)) continue;
        for (const w of lineWords as OcrWord[]) {
          if (w && typeof w.text === "string" && w.bbox) words.push(w);
        }
      }
    }
  }
  return words;
}

/**
 * Adapt one OCR word into the RawItem shape buildPriceBoxesForPage expects:
 * transform carries the font size and the baseline origin in PDF user space.
 * Exported for tests.
 */
export function ocrWordToRawItem(
  word: OcrWord,
  viewport: ViewportLike,
): RawItem | null {
  if (!word.text.trim()) return null;
  const { x0, y0, x1, y1 } = word.bbox;
  if (!(x1 > x0) || !(y1 > y0)) return null;

  // Baseline from tesseract when it found one; the glyph-box bottom otherwise
  // (close enough for digits, which have no descenders).
  const basePx =
    word.baseline && word.baseline.has_baseline !== false
      ? (word.baseline.y0 + word.baseline.y1) / 2
      : y1;

  const [pdfX, pdfBase] = viewport.convertToPdfPoint(x0, basePx);
  const [pdfRight] = viewport.convertToPdfPoint(x1, basePx);
  const [, pdfTop] = viewport.convertToPdfPoint(x0, y0);
  const [, pdfBottom] = viewport.convertToPdfPoint(x0, y1);

  const size = Math.abs(pdfTop - pdfBottom) / CAP_TO_EM;
  if (!(size > 0)) return null;

  return {
    // Trailing space keeps concatenated matchedText readable ("181.896 DZD")
    // — digit matching and the cents/currency regexes are whitespace-tolerant.
    str: `${word.text} `,
    transform: [size, 0, 0, size, pdfX, pdfBase],
    width: Math.abs(pdfRight - pdfX),
    height: size,
  };
}

/**
 * OCR the given (textless) pages into text-layer-shaped items, one entry per
 * page actually recognized (pages past the time budget are skipped). Throws
 * are left to the caller, which treats OCR as best-effort.
 */
export async function ocrPageItems(
  pdfBytes: Buffer,
  pageIndexes: number[],
): Promise<PageItems[]> {
  if (pageIndexes.length === 0) return [];

  const { getDocumentProxy, renderPageAsImage, createIsomorphicCanvasFactory } =
    await import("unpdf");
  const canvasImport = () => import("@napi-rs/canvas");
  const { createWorker } = await import("tesseract.js");
  const path = await import("node:path");

  // Rendering needs a CanvasFactory (see buildBoxPatches) — tiling patterns
  // fail without one.
  const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport);
  const doc = await getDocumentProxy(new Uint8Array(pdfBytes), {
    CanvasFactory,
  });

  // Language data is vendored so production never depends on a CDN download.
  const worker = await createWorker("eng", 1, {
    langPath: path.join(process.cwd(), "lib", "tickets", "tessdata"),
    gzip: false,
    cacheMethod: "none",
  });

  const pages: PageItems[] = [];
  const budgetStart = Date.now();
  try {
    for (const [i, pageIndex] of pageIndexes.entries()) {
      if (Date.now() - budgetStart > OCR_BUDGET_MS) {
        console.warn(
          `[OCR] budget exceeded, skipping ${pageIndexes.length - i} of ${pageIndexes.length} pages`,
        );
        break;
      }
      const started = Date.now();
      const png = await renderPageAsImage(doc, pageIndex + 1, {
        canvasImport,
        scale: OCR_SCALE,
      });
      const { data } = await worker.recognize(
        Buffer.from(png),
        {},
        { blocks: true },
      );
      const words = collectWords(
        (data as unknown as Record<string, unknown>).blocks,
      );

      const page = await doc.getPage(pageIndex + 1);
      const [x1, y1, x2, y2] = page.view;
      const viewport = page.getViewport({
        scale: OCR_SCALE,
      }) as unknown as ViewportLike;
      const items = words
        .map((w) => ocrWordToRawItem(w, viewport))
        .filter((it): it is RawItem => it !== null);
      pages.push({
        pageIndex,
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        items,
      });
      console.log(
        `[OCR] page=${pageIndex + 1} words=${words.length} ms=${Date.now() - started}`,
      );
    }
  } finally {
    await worker.terminate();
    // destroy() exists at runtime on the pdfjs proxy, but unpdf's bundled pdfjs
    // types don't always declare it — call through an optional shape so this
    // compiles across unpdf versions.
    await (doc as { destroy?: () => Promise<void> }).destroy?.();
  }
  return pages;
}

/**
 * OCR the given (textless) pages and locate the printed price on them.
 * Same contract as the text-layer path: empty array = not found. Throws are
 * left to the caller, which treats OCR as best-effort.
 */
export async function locateOcrPriceBoxes(
  pdfBytes: Buffer,
  target: string,
  pageIndexes: number[],
): Promise<PriceBox[]> {
  if (pageIndexes.length === 0 || target.length < 2) return [];
  const boxes: PriceBox[] = [];
  for (const { pageIndex, items } of await ocrPageItems(pdfBytes, pageIndexes)) {
    const found = buildPriceBoxesForPage(items, target, pageIndex);
    for (const box of found) box.fromOcr = true;
    boxes.push(...found);
  }
  return boxes;
}
