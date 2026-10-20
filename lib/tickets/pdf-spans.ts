import type { PageItems, RawItem } from "./overlay-price";
import {
  MAX_OCR_PAGES,
  OCR_TIMEOUT_MS,
  readPageItems,
  runBox,
  withTimeout,
} from "./overlay-price";
import type { TextSpan, TextSpansPage } from "./pdf-edits";

// Editable text spans for the maritime PDF editor. pdfjs text items are often
// fragments (a word, a few glyphs, a single digit run — GNV splits prices),
// which would be tedious to click one by one, so consecutive items that sit on
// the same line with word-sized gaps are merged into one span. Geometry comes
// from runBox, the same mask/anchor logic the price overlay has been tuned on.

// Max horizontal gap (in ems) still read as "same phrase". A word space is
// ~0.25–0.3em; table columns are usually much wider apart.
const JOIN_GAP_EM = 0.6;
// Gaps wider than this between joined items get a space in the span text.
const SPACE_GAP_EM = 0.15;
// Free-text right margin: left-aligned edits may grow up to here.
const PAGE_MARGIN = 18;

// A standalone money amount ("DZD 100180.00", "8550.00", "97.086,16D"):
// optional currency, digits with a 1–2 digit decimal tail or a currency.
const CURRENCY = String.raw`(?:[A-Z]{1,3}|€|\$|£)`;
const AMOUNT_RE = new RegExp(String.raw`^\s*${CURRENCY}?\s*\d[\d\s.,]*\s*${CURRENCY}?\s*$`);
const DECIMAL_RE = /\d[.,]\d{1,2}\s*\D{0,4}$/;
const HAS_CURRENCY_RE = new RegExp(String.raw`^\s*${CURRENCY}\s*\d|\d\s*${CURRENCY}\s*$`);

export function isAmount(text: string): boolean {
  return AMOUNT_RE.test(text) && (DECIMAL_RE.test(text) || HAS_CURRENCY_RE.test(text));
}

function itemSize(it: RawItem): number {
  return Math.hypot(it.transform[2], it.transform[3]) || it.height || 10;
}

function continuesLine(prev: RawItem, next: RawItem, fromOcr: boolean): boolean {
  const size = itemSize(prev);
  const nextSize = itemSize(next);
  // OCR sizes come from per-word ink height ("sur" vs "trajets" differ a
  // lot), so scanned pages need looser size/baseline tolerances.
  const sizeTol = fromOcr ? 0.6 : 0.2;
  const baseTol = fromOcr ? 0.35 : 0.15;
  if (Math.abs(size - nextSize) > sizeTol * Math.max(size, nextSize)) return false;
  if (
    Math.abs(prev.transform[5] - next.transform[5]) >
    Math.max(1, baseTol * Math.min(size, nextSize))
  ) {
    return false;
  }
  const gap = next.transform[4] - (prev.transform[4] + prev.width);
  if (gap < -0.3 * size || gap > JOIN_GAP_EM * size) return false;
  // A label printed flush against an amount (GNV: "TOTALE" 0.1pt before
  // "DZD 100180.00") is two things to edit, not one.
  if (!/\d/.test(prev.str) && isAmount(next.str)) return false;
  return true;
}

/**
 * Merge one page's items (content-stream order) into editable spans.
 * Pure — exported for tests.
 */
export function groupIntoSpans(page: PageItems, fromOcr = false): TextSpan[] {
  const { items, pageIndex } = page;
  const spans: TextSpan[] = [];
  let i = 0;
  while (i < items.length) {
    let end = i;
    let text = items[i].str;
    while (end + 1 < items.length && continuesLine(items[end], items[end + 1], fromOcr)) {
      const prev = items[end];
      const next = items[end + 1];
      const gap = next.transform[4] - (prev.transform[4] + prev.width);
      const needsSpace =
        gap > SPACE_GAP_EM * itemSize(prev) && !/\s$/.test(text) && !/^\s/.test(next.str);
      text += (needsSpace ? " " : "") + next.str;
      end++;
    }

    const box = runBox(items, i, end, pageIndex, {
      // Free text grows rightwards; amounts sit in right-aligned price
      // columns, so a longer replacement grows leftwards like the original.
      align: isAmount(text) ? "right" : "left",
      pageRight: page.width - PAGE_MARGIN,
    });
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed) {
      spans.push({
        id: `p${pageIndex}-s${spans.length}`,
        pageIndex,
        text: trimmed,
        maskX: box.maskX,
        maskY: box.maskY,
        maskWidth: box.maskWidth,
        maskHeight: box.maskHeight,
        align: box.align,
        drawX: box.drawX,
        drawRight: box.drawRight,
        textMaxWidth: box.textMaxWidth,
        baselineY: box.baselineY,
        fontSize: box.fontSize,
        ...(fromOcr ? { fromOcr: true } : {}),
      });
    }
    i = end + 1;
  }
  return spans;
}

/**
 * Every editable span of the PDF, page by page. Image-only pages fall back to
 * OCR (best-effort, time-boxed): on failure they simply come back with no
 * spans, and the editor shows them as read-only.
 */
export async function readTextSpans(pdfBytes: Buffer): Promise<TextSpansPage[]> {
  const pages = await readPageItems(pdfBytes);

  const textless = pages
    .filter((p) => p.items.length === 0)
    .map((p) => p.pageIndex)
    .slice(0, MAX_OCR_PAGES);
  const ocrPages = new Map<number, PageItems>();
  if (textless.length > 0) {
    try {
      const { ocrPageItems } = await import("./ocr-price");
      for (const p of await withTimeout(
        ocrPageItems(pdfBytes, textless),
        OCR_TIMEOUT_MS,
        "editor OCR",
      )) {
        ocrPages.set(p.pageIndex, p);
      }
    } catch (err) {
      console.warn("[PDF_SPANS_OCR]", err);
    }
  }

  return pages.map((page) => {
    const ocr = ocrPages.get(page.pageIndex);
    const source = ocr ?? page;
    return {
      pageIndex: page.pageIndex,
      width: page.width,
      height: page.height,
      fromOcr: Boolean(ocr),
      spans: groupIntoSpans(source, Boolean(ocr)),
    };
  });
}
