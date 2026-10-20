import type { PDFDocument, PDFFont } from "pdf-lib";
import { rgb } from "pdf-lib";

// Resale overlay for maritime tickets. The carrier (e.g. GNV) prints its own
// price on the PDF; a reselling agency edits the price in Tikalo and wants the
// customer-facing PDF to show *their* price, not the carrier's. We can't rewrite
// text inside an arbitrary PDF, so instead we locate the carrier's printed price
// by its CONTENT (the value originally extracted from this very PDF), mask that
// exact spot, and draw the agency's edited price on top.
//
// This is content-based, so it adapts to any carrier layout — but it is
// best-effort: if the printed format differs too much from what was extracted
// (so we can't find it), we simply skip and leave the original untouched rather
// than risk corrupting the document.

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface PriceBox {
  pageIndex: number;
  // Mask to lay down (PDF user space, origin bottom-left).
  maskX: number;
  maskY: number;
  maskWidth: number;
  maskHeight: number;
  // Where/how to draw the replacement text. Prices in totals columns are
  // right-aligned; inline prices (mid-sentence) are left-aligned.
  align: "left" | "right";
  drawX: number; // left-align anchor: first glyph origin of the matched run
  drawRight: number; // right-align anchor: right edge of the matched run
  // Max width the replacement text may occupy: unlike the mask, this keeps a
  // word-space of breathing room from any flush neighboring text, so the
  // replacement never reads glued to a label ("TOTALEDZD 990.00").
  textMaxWidth: number;
  baselineY: number;
  fontSize: number;
  // Concatenated text of the matched run ("DZD 100180.00", "97.086,16D"...),
  // used to render the replacement in the document's own number format.
  matchedText: string;
  // Sampled from the rendered page (see buildBoxPatches); undefined when
  // sampling was unavailable, in which case drawing falls back to white/dark.
  bg?: RGB;
  ink?: RGB;
  // Rendered background image (original digits inpainted away) to stamp over
  // the mask area — visually "transparent": the patch IS the page background.
  // Falls back to a flat `bg` rectangle when absent.
  patch?: {
    png: Uint8Array;
    // PDF user-space rect matching the patch pixels exactly.
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // Per-box replacement string (format-mimicked); falls back to the caller's
  // generic replacement when absent.
  replacement?: string;
  // Metrics-matched font (see overlay-font.ts); falls back to the caller's
  // font when absent.
  font?: PDFFont;
  // Set when the box came from OCR of a scanned page rather than the text
  // layer: geometry is ink-tight (not advance-based) and the "glyphs" are
  // photographed, so font matching and inpainting adapt (see overlay-font.ts
  // and buildBoxPatches).
  fromOcr?: boolean;
}

const digitsOf = (s: string): string => (s.match(/\d/g) ?? []).join("");

// True when the last `tailDigits` digits of `text` are a decimal fraction, i.e.
// immediately preceded by a ',' or '.' (e.g. the "00" in "12 500,00"). Used to
// distinguish real cents from a longer unrelated number like "125000".
function isDecimalTail(text: string, tailDigits: number): boolean {
  const positions: number[] = [];
  for (let k = 0; k < text.length; k++) {
    if (/\d/.test(text[k])) positions.push(k);
  }
  if (positions.length < tailDigits) return false;
  const firstTailPos = positions[positions.length - tailDigits];
  const prev = text[firstTailPos - 1];
  return prev === "." || prev === ",";
}

const CENTS_RE = /^[.,]\s*\d{1,2}\s*$/; // a trailing ",00" / ".00" run
const CURRENCY_RE = /^\s*(DA|DZD|DT|TND|MAD|EUR|USD|GBP|€|\$|£)\.?\s*$/i;

export interface RawItem {
  str: string;
  // pdfjs transform matrix [a, b, c, d, e, f]; (e, f) is the text origin.
  transform: number[];
  width: number;
  height: number;
}

function itemBox(it: RawItem) {
  const x = it.transform[4];
  const baseline = it.transform[5];
  const size = Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
  return { x, baseline, width: it.width, height: it.height || size, size };
}

// How far the mask reaches around the glyph box. Horizontal padding hides
// antialiasing fringes; vertically we stay within the line box (ascent ~0.8em,
// descent ~0.25em) so we never erase table rules above/below the price.
export const PAD_X = 1.5;
export const ASCENT = 0.8;
export const DESCENT = 0.25;
// Minimum clearance kept between the mask and a neighboring text item.
const NEIGHBOR_GAP = 0.3;
// A same-line item starting within this distance after the run means the price
// sits inline in a sentence (keep left alignment) rather than in a column.
const INLINE_GAP = 20;
// OCR (the scanned-page fallback) costs seconds per page — bound the work.
export const MAX_OCR_PAGES = 6;
// Hard ceiling on the whole OCR fallback. tesseract.js can hang without ever
// settling (a worker-thread spawn failure is silently swallowed by its
// browser-style onerror assignment), and a hang would otherwise eat the whole
// serverless function budget instead of degrading to "overlay skipped".
export const OCR_TIMEOUT_MS = 35_000;

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms}ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * Pure matcher: find every occurrence of `target` (a digit string) in one
 * page's text items and compute mask + draw geometry for each. Exported for
 * unit tests; `locatePriceBoxes` drives it per page.
 */
export function buildPriceBoxesForPage(
  items: RawItem[],
  target: string,
  pageIndex: number,
): PriceBox[] {
  const boxes: PriceBox[] = [];

  let i = 0;
  while (i < items.length) {
    if (!/\d/.test(items[i].str)) {
      i++;
      continue;
    }

    // Try to build up the target digit string from a small window of
    // consecutive items (prices are sometimes split into several runs).
    let acc = "";
    let matchedEnd = -1; // last item index that completes the target
    const WINDOW = 5;
    for (let j = i; j < Math.min(i + WINDOW, items.length); j++) {
      acc += items[j].str;
      const ad = digitsOf(acc);
      if (ad.length === 0) break;
      if (target.startsWith(ad)) {
        if (ad === target) {
          matchedEnd = j;
          break;
        }
        continue; // still building toward the target
      }
      if (ad.startsWith(target)) {
        // Overshot: target fully covered plus trailing digits. Accept only if
        // those extra digits are a decimal fraction (cents like ",00"), not a
        // longer unrelated number such as "125000" vs a "12500" target.
        const overshoot = ad.length - target.length;
        if (overshoot >= 1 && overshoot <= 2 && isDecimalTail(acc, overshoot)) {
          matchedEnd = j;
        }
        break;
      }
      break; // this window can't produce the target
    }

    if (matchedEnd === -1) {
      i++;
      continue;
    }

    // Optionally swallow a trailing cents run and a currency token that sit
    // right after the matched integer, so the whole "12 500,00 DA" is masked.
    let end = matchedEnd;
    if (end + 1 < items.length && CENTS_RE.test(items[end + 1].str)) end++;
    if (end + 1 < items.length && CURRENCY_RE.test(items[end + 1].str)) end++;

    boxes.push(runBox(items, i, end, pageIndex));

    i = end + 1;
  }

  return boxes;
}

/**
 * Mask + draw geometry for the text run items[i..end] on one page: the union
 * box of the run, clamped so the mask never bleeds into same-line neighbors,
 * with alignment inferred from the layout (or forced via opts.align).
 * Shared by the price matcher and the maritime PDF editor's text spans.
 * `opts.pageRight` lets left-aligned text with no right neighbor grow up to
 * that x (free text edits) instead of being held to the original width.
 */
export function runBox(
  items: RawItem[],
  i: number,
  end: number,
  pageIndex: number,
  opts: { align?: PriceBox["align"]; pageRight?: number } = {},
): PriceBox {
  // Union box across the matched run.
  const first = itemBox(items[i]);
  let minX = first.x;
  let minBaseline = first.baseline;
  let maxRight = first.x + first.width;
  for (let k = i; k <= end; k++) {
    const b = itemBox(items[k]);
    minX = Math.min(minX, b.x);
    minBaseline = Math.min(minBaseline, b.baseline);
    maxRight = Math.max(maxRight, b.x + b.width);
  }

  // Same-line neighbors decide alignment and clamp the mask so it never
  // bleeds into adjacent text (e.g. GNV prints "TOTALE" 0.1pt before the
  // price — an unclamped pad would white out its last letter).
  let leftNeighborRight = -Infinity;
  let rightNeighborX = Infinity;
  for (let k = 0; k < items.length; k++) {
    if (k >= i && k <= end) continue;
    const b = itemBox(items[k]);
    if (Math.abs(b.baseline - minBaseline) > 2) continue;
    const right = b.x + b.width;
    if (right <= minX + 0.5 && right > leftNeighborRight) {
      leftNeighborRight = right;
    }
    if (b.x >= maxRight - 0.5 && b.x < rightNeighborX) {
      rightNeighborX = b.x;
    }
  }

  // Clamp: never cross into a neighbor, but also never expose the original
  // price's own glyphs (mask left edge at most minX, right edge at least
  // maxRight — the pad is sacrificed when a neighbor sits flush against us).
  const maskLeft = Math.min(
    Math.max(minX - PAD_X, leftNeighborRight + NEIGHBOR_GAP),
    minX,
  );
  const maskRight = Math.max(
    Math.min(maxRight + PAD_X, rightNeighborX - NEIGHBOR_GAP),
    maxRight,
  );

  // A same-line item right after the run means the price is inline in a
  // sentence — keep reading flow with left alignment. Otherwise it's a
  // totals column, where numbers are right-aligned.
  const align: PriceBox["align"] =
    opts.align ??
    (rightNeighborX <= maxRight + INLINE_GAP ? "left" : "right");

  const size = first.size;

  // The replacement is anchored at drawRight (right align) or drawX (left
  // align); on the neighbor side it must stop a word-space short of the
  // neighboring text even when the original sat flush against it. It may
  // extend PAST the mask onto plain background (only the old glyphs need
  // masking), so a distant neighbor buys room to keep the original size.
  const breathe = 0.25 * size;
  const textMaxWidth =
    align === "right"
      ? maxRight -
        (leftNeighborRight === -Infinity
          ? maskLeft
          : leftNeighborRight + breathe)
      : (rightNeighborX === Infinity
          ? Math.max(maskRight, opts.pageRight ?? maskRight)
          : rightNeighborX - breathe) - minX;
  return {
    pageIndex,
    maskX: maskLeft,
    maskY: minBaseline - DESCENT * size,
    maskWidth: maskRight - maskLeft,
    maskHeight: (ASCENT + DESCENT) * size,
    align,
    drawX: first.x,
    drawRight: maxRight,
    textMaxWidth,
    baselineY: minBaseline,
    fontSize: size,
    matchedText: items
      .slice(i, end + 1)
      .map((it) => it.str)
      .join(""),
  };
}

export interface PageItems {
  pageIndex: number;
  width: number; // PDF points (page view box)
  height: number;
  items: RawItem[]; // non-blank text-layer items, in content-stream order
}

/**
 * Read every page's text layer (non-blank items only). Pages that come back
 * with no items are image-only (scanned) and need the OCR fallback.
 */
export async function readPageItems(pdfBytes: Buffer): Promise<PageItems[]> {
  // Use unpdf rather than pdfjs-dist directly: it ships a worker-less pdfjs
  // build designed for Node/serverless and bundles cleanly under Turbopack.
  // Raw pdfjs-dist gets inlined into a chunk by the bundler and then throws at
  // runtime (its worker/eval/import.meta.url machinery doesn't survive
  // bundling), which is why the overlay silently no-opped in production.
  // Imported lazily so it only loads for maritime tickets that need it.
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(pdfBytes));

  const pages: PageItems[] = [];
  try {
    for (let p = 0; p < doc.numPages; p++) {
      const page = await doc.getPage(p + 1);
      const [x1, y1, x2, y2] = page.view;
      const content = await page.getTextContent();
      const items = (content.items as unknown as RawItem[]).filter(
        (it) => typeof it.str === "string" && it.str.trim() !== "",
      );
      pages.push({
        pageIndex: p,
        width: Math.abs(x2 - x1),
        height: Math.abs(y2 - y1),
        items,
      });
    }
  } finally {
    await doc.cleanup();
  }
  return pages;
}

/**
 * Locate every place the carrier's price (as originally extracted) is printed.
 * Returns one PriceBox per occurrence. Empty array = not found / not applicable.
 */
export async function locatePriceBoxes(
  pdfBytes: Buffer,
  originalPrice: string,
): Promise<PriceBox[]> {
  const target = digitsOf(originalPrice);
  // Too short to match safely (a lone "5" would match half the document).
  if (target.length < 2) return [];

  const pages = await readPageItems(pdfBytes);
  const boxes: PriceBox[] = [];
  const textlessPages: number[] = [];
  for (const { pageIndex, items } of pages) {
    if (items.length === 0) textlessPages.push(pageIndex);
    boxes.push(...buildPriceBoxesForPage(items, target, pageIndex));
  }

  // Photographed tickets are image-only PDFs: no text layer, so the search
  // above finds nothing. Fall back to OCR on the textless pages and run the
  // recognized words through the same matcher. Best-effort like everything
  // else here — an OCR failure must never break the export.
  if (boxes.length === 0 && textlessPages.length > 0) {
    try {
      const { locateOcrPriceBoxes } = await import("./ocr-price");
      boxes.push(
        ...(await withTimeout(
          locateOcrPriceBoxes(pdfBytes, target, textlessPages.slice(0, MAX_OCR_PAGES)),
          OCR_TIMEOUT_MS,
          "price OCR",
        )),
      );
    } catch (err) {
      console.warn("[PRICE_OVERLAY_OCR]", err);
    }
  }

  // Best-effort: render the page and build a background patch per box so the
  // mask blends into the document (Corsica prints on a colored guilloche — a
  // hardcoded white box would be a visible patch), plus bg/ink colors for the
  // flat-rectangle and text fallbacks.
  await buildBoxPatches(pdfBytes, boxes);

  return boxes;
}

// Median of one channel across a pixel population.
function channelMedian(pixels: number[][], channel: number): number {
  const values = pixels.map((p) => p[channel]).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

/**
 * Split a raw RGBA crop into background vs ink by luminance and return the
 * median color of each population (0..1 channels). `ink` is null when the crop
 * is near-uniform, the dark population is too thin to trust, or the "dark"
 * population isn't actually dark — a textless gradient (e.g. glyphs that never
 * rasterized because the runtime lacks the document's fonts) still splits into
 * two halves, and treating its darker tone as ink is exactly how a production
 * export ended up with a washed-out pale price. Exported for unit tests.
 */
export function pickMaskColors(
  rgba: Uint8Array,
  width: number,
  height: number,
): { bg: RGB; ink: RGB | null } | null {
  const count = width * height;
  if (count < 4 || rgba.length < count * 4) return null;

  const pixels: number[][] = [];
  const lums: number[] = [];
  let minLum = 255;
  let maxLum = 0;
  for (let p = 0; p < count; p++) {
    const r = rgba[p * 4];
    const g = rgba[p * 4 + 1];
    const b = rgba[p * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    pixels.push([r, g, b]);
    lums.push(lum);
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const toRgb = (px: number[][]): RGB => ({
    r: channelMedian(px, 0) / 255,
    g: channelMedian(px, 1) / 255,
    b: channelMedian(px, 2) / 255,
  });

  // Near-uniform crop (glyphs too thin to register, or nothing there): the
  // whole crop is background.
  if (maxLum - minLum < 32) {
    return { bg: toRgb(pixels), ink: null };
  }

  const threshold = (minLum + maxLum) / 2;
  const light = pixels.filter((_, idx) => lums[idx] >= threshold);
  const dark = pixels.filter((_, idx) => lums[idx] < threshold);
  const bg = toRgb(light);

  const median = (v: number[]) => v.sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const bgLum = median(lums.filter((l) => l >= threshold));
  const inkLum = median(lums.filter((l) => l < threshold));
  const inkIsTrustworthy =
    // Under 2% is antialiasing noise, not glyphs...
    dark.length >= count * 0.02 &&
    // ...and real text ink is dark and contrasts hard with its background.
    inkLum < 100 &&
    bgLum - inkLum > 60;

  return { bg, ink: inkIsTrustworthy ? toRgb(dark) : null };
}

// Patches get printed into the final PDF, so render at ~288 dpi.
const SAMPLE_SCALE = 4;

const lumOf = (rgba: Uint8Array, p: number): number =>
  0.299 * rgba[p * 4] + 0.587 * rgba[p * 4 + 1] + 0.114 * rgba[p * 4 + 2];

/**
 * Erase the printed digits from a raw RGBA crop by inpainting them with the
 * surrounding background, in place. Assumes dark text on a light background —
 * true of every carrier ticket we handle. Pixels noticeably darker than the
 * background quartile are filled from their neighbors, so the patch keeps the
 * document's gradient/guilloche instead of flattening it. If the glyphs never
 * rasterized (fonts unavailable in this runtime), nothing is classified and
 * the crop is already pure background — which is exactly what we want.
 *
 * Returns false when the crop doesn't look like text-on-background (mask too
 * large / nothing to anchor the fill), in which case the caller must NOT use
 * the crop as a patch. Exported for unit tests.
 *
 * The defaults suit crisp vector renders (near-black cores, 1px antialiasing
 * halo). Photographed pages need `photo`: JPEG compression smears glyph edges
 * into mid-greys over several pixels, so the ink classification is relaxed
 * and the dilation widened — the photo backgrounds we handle are flat paper,
 * so there is no texture to accidentally flatten.
 */
export function inpaintInk(
  rgba: Uint8Array,
  width: number,
  height: number,
  photo = false,
): boolean {
  const count = width * height;
  if (count < 4 || rgba.length < count * 4) return false;

  const lums = new Float32Array(count);
  for (let p = 0; p < count; p++) lums[p] = lumOf(rgba, p);
  const sorted = Array.from(lums).sort((a, b) => a - b);
  const bgLum = sorted[Math.floor(count * 0.75)];

  // Removable = decisively darker than the background AND dark in absolute
  // terms — a plain gradient's darker end must not qualify, or we'd flatten
  // the background we're trying to preserve. Dilated below to swallow
  // antialiased / JPEG-smeared glyph edges.
  const coreThreshold = photo
    ? Math.min(bgLum - 30, 210)
    : Math.min(bgLum - 60, 140);
  const dilate = photo ? 3 : 1;
  const core = new Uint8Array(count);
  let coreCount = 0;
  for (let p = 0; p < count; p++) {
    if (lums[p] < coreThreshold) {
      core[p] = 1;
      coreCount++;
    }
  }
  if (coreCount === 0) return true; // nothing to erase — crop is background
  if (coreCount > count * 0.6) return false; // not text-on-background

  const masked = new Uint8Array(count);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (core[p]) {
        for (let dy = -dilate; dy <= dilate; dy++) {
          for (let dx = -dilate; dx <= dilate; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              masked[ny * width + nx] = 1;
            }
          }
        }
      }
    }
  }
  const original = masked.slice();

  // Grow the background inward: each pass, every masked pixel adjacent to an
  // unmasked one takes the average of its unmasked 4-neighbors. Bounded by the
  // crop diagonal, which any glyph stroke is far thinner than.
  const maxPasses = width + height;
  for (let pass = 0; pass < maxPasses; pass++) {
    const filled: number[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x;
        if (!masked[p]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const np = ny * width + nx;
          if (masked[np]) continue;
          r += rgba[np * 4];
          g += rgba[np * 4 + 1];
          b += rgba[np * 4 + 2];
          n++;
        }
        if (n === 0) continue;
        rgba[p * 4] = Math.round(r / n);
        rgba[p * 4 + 1] = Math.round(g / n);
        rgba[p * 4 + 2] = Math.round(b / n);
        rgba[p * 4 + 3] = 255;
        filled.push(p);
      }
    }
    if (filled.length === 0) break;
    for (const p of filled) masked[p] = 0;
    let remaining = false;
    for (let p = 0; p < count; p++) {
      if (masked[p]) {
        remaining = true;
        break;
      }
    }
    if (!remaining) break;
  }
  // Isolated pixels the fill couldn't reach (fully masked crop row/column
  // corner cases) — bail rather than ship leftover glyph fragments.
  for (let p = 0; p < count; p++) if (masked[p]) return false;

  // Light 3x3 mean over the filled area only, to soften fill streaks.
  const smoothed = rgba.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (!original[p]) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const np = ny * width + nx;
          r += rgba[np * 4];
          g += rgba[np * 4 + 1];
          b += rgba[np * 4 + 2];
          n++;
        }
      }
      smoothed[p * 4] = Math.round(r / n);
      smoothed[p * 4 + 1] = Math.round(g / n);
      smoothed[p * 4 + 2] = Math.round(b / n);
    }
  }
  rgba.set(smoothed);
  return true;
}

/**
 * Render each page that contains a box and build, per box: a background image
 * patch (digits inpainted away) plus sampled bg/ink fallback colors. Mutates
 * the boxes; strictly best-effort — any failure (e.g. @napi-rs/canvas
 * unavailable in some runtime) leaves them unset and the caller's flat-white/
 * dark fallback applies.
 */
export async function buildBoxPatches(
  pdfBytes: Buffer,
  boxes: PriceBox[],
): Promise<void> {
  if (boxes.length === 0) return;
  try {
    const { getDocumentProxy, renderPageAsImage, createIsomorphicCanvasFactory } =
      await import("unpdf");
    const canvasImport = () => import("@napi-rs/canvas");
    const { default: sharp } = await import("sharp");

    // A render-dedicated proxy: the text-extraction one is created without a
    // CanvasFactory, which pdfjs needs to paint tiling patterns (exactly what
    // decorative ticket backgrounds tend to be).
    const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport);
    const doc = await getDocumentProxy(new Uint8Array(pdfBytes), {
      CanvasFactory,
    });

    try {
      const pageIndexes = [...new Set(boxes.map((b) => b.pageIndex))];
      for (const pageIndex of pageIndexes) {
        const png = await renderPageAsImage(doc, pageIndex + 1, {
          canvasImport,
          scale: SAMPLE_SCALE,
        });
        const { data, info } = await sharp(Buffer.from(png))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const page = await doc.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: SAMPLE_SCALE });

        for (const box of boxes) {
          if (box.pageIndex !== pageIndex) continue;
          // Map the two mask corners into raster space (handles y-flip, page
          // origin and rotation), then clamp to integer pixel bounds.
          const [ax, ay] = viewport.convertToViewportPoint(
            box.maskX,
            box.maskY + box.maskHeight,
          );
          const [bx, by] = viewport.convertToViewportPoint(
            box.maskX + box.maskWidth,
            box.maskY,
          );
          const left = Math.max(0, Math.floor(Math.min(ax, bx)));
          const top = Math.max(0, Math.floor(Math.min(ay, by)));
          const right = Math.min(info.width, Math.ceil(Math.max(ax, bx)));
          const bottom = Math.min(info.height, Math.ceil(Math.max(ay, by)));
          const w = right - left;
          const h = bottom - top;
          if (w < 2 || h < 2) continue;

          const crop = new Uint8Array(w * h * 4);
          for (let row = 0; row < h; row++) {
            const src = ((top + row) * info.width + left) * 4;
            crop.set(data.subarray(src, src + w * 4), row * w * 4);
          }

          const colors = pickMaskColors(crop, w, h);
          if (colors) {
            box.bg = colors.bg;
            box.ink = colors.ink ?? undefined;
          }

          // Turn the crop into a clean background patch. On failure keep only
          // the flat-color fallback.
          if (!inpaintInk(crop, w, h, box.fromOcr)) continue;
          const patchPng = await sharp(Buffer.from(crop), {
            raw: { width: w, height: h, channels: 4 },
          })
            .png()
            .toBuffer();

          // The patch is drawn at the PDF rect matching the *integer* pixel
          // bounds, so the waves inside line up exactly with the page around
          // them.
          const [px1, py1] = viewport.convertToPdfPoint(left, top);
          const [px2, py2] = viewport.convertToPdfPoint(right, bottom);
          box.patch = {
            png: new Uint8Array(patchPng),
            x: Math.min(px1, px2),
            y: Math.min(py1, py2),
            width: Math.abs(px2 - px1),
            height: Math.abs(py2 - py1),
          };
        }
      }
    } finally {
      // destroy() exists at runtime on the pdfjs proxy, but unpdf's bundled
      // pdfjs types don't always declare it — call through an optional shape so
      // this compiles across unpdf versions.
      await (doc as { destroy?: () => Promise<void> }).destroy?.();
    }
  } catch (err) {
    // Patching is cosmetic; never let it break the export.
    console.warn("[PRICE_OVERLAY_SAMPLING]", err);
  }
}

/**
 * Apply located price boxes onto a pdf-lib document: mask each occurrence and
 * draw the replacement text. The mask is ideally an image patch of the page's
 * own rendered background (seamless on decorated documents), degrading to a
 * flat rectangle in the sampled background color, then to plain white.
 * Assumes MediaBox origin (0,0) per page (true for the carrier PDFs we
 * handle); offsets are added defensively.
 */
export async function drawPriceOverlay(
  pdf: PDFDocument,
  font: PDFFont,
  boxes: PriceBox[],
  fallbackReplacement: string,
): Promise<void> {
  if (boxes.length === 0) return;
  const pages = pdf.getPages();
  const fallbackBg = rgb(1, 1, 1);
  // Carrier tickets print prices in black; when ink sampling was unavailable,
  // black is the closest bet to "same color as the original".
  const fallbackInk = rgb(0, 0, 0);

  for (const box of boxes) {
    const page = pages[box.pageIndex];
    if (!page) continue;
    const mb = page.getMediaBox();

    let patched = false;
    if (box.patch) {
      try {
        const image = await pdf.embedPng(box.patch.png);
        page.drawImage(image, {
          x: mb.x + box.patch.x,
          y: mb.y + box.patch.y,
          width: box.patch.width,
          height: box.patch.height,
        });
        patched = true;
      } catch {
        // Unembeddable patch — fall through to the flat rectangle.
      }
    }
    if (!patched) {
      page.drawRectangle({
        x: mb.x + box.maskX,
        y: mb.y + box.maskY,
        width: box.maskWidth,
        height: box.maskHeight,
        color: box.bg ? rgb(box.bg.r, box.bg.g, box.bg.b) : fallbackBg,
      });
    }

    const text = box.replacement ?? fallbackReplacement;
    const textFont = box.font ?? font;

    // Keep the original font size; shrink only if the replacement would
    // otherwise overflow the room between its anchor and the neighboring text.
    let size = box.fontSize;
    const maxWidth = box.textMaxWidth;
    let textWidth = textFont.widthOfTextAtSize(text, size);
    if (textWidth > maxWidth && textWidth > 0) {
      size = Math.max(5, (size * maxWidth) / textWidth);
      textWidth = textFont.widthOfTextAtSize(text, size);
    }

    const x =
      box.align === "right" ? box.drawRight - textWidth : box.drawX;

    page.drawText(text, {
      x: mb.x + x,
      y: mb.y + box.baselineY,
      size,
      font: textFont,
      color: box.ink ? rgb(box.ink.r, box.ink.g, box.ink.b) : fallbackInk,
    });
  }
}
