import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import sharp from "sharp";
import { locatePriceBoxes, drawPriceOverlay } from "./overlay-price";
import { assignOverlayFonts } from "./overlay-font";
import { mimicPriceFormat } from "./price-format";
import { applyPdfEdits, type PdfEditResult } from "./apply-pdf-edits";
import type { PdfEdit } from "./pdf-edits";

// Co-branding footer added to an uploaded carrier PDF (e.g. GNV) for maritime
// tickets. We keep the original PDF content byte-for-byte; carrier tickets often
// fill the whole page down to the bottom edge (GNV prints its legal block there),
// so instead of drawing over that content we EXTEND each page downward by a thin
// band and place the reselling agency's logo + name in the added white space.
// The result reads as a co-branded "GNV × AGENCY" document with no overlap.

const BAND = 48; // pt of white space added below each page for the footer
const SIDE_MARGIN = 40; // pt — where the hairline separator starts/ends
const LOGO_HEIGHT = 20; // pt
const GAP = 7; // pt between logo and name text
const FONT_SIZE = 9; // pt
const PREFIX = "Émis par "; // small lead-in before the agency name

// Outcome of the price-overlay step, surfaced to the API/UI so a silent
// failure (e.g. pdfjs not loading in a given runtime) is observable instead of
// looking like "the price just didn't change".
export interface PriceOverlayResult {
  attempted: boolean; // did we have an original+new price that differ?
  applied: boolean; // did we actually mask+redraw at least one spot?
  matches: number; // how many occurrences were found
  colorSampled: number; // how many spots got a background-matched mask color
  patched: number; // how many spots got a seamless background-image patch
  error: string | null; // runtime error message, if any
}

export interface StampResult {
  bytes: Buffer;
  priceOverlay: PriceOverlayResult;
}

export async function stampAgencyOnPdf(
  originalPdf: Buffer,
  opts: {
    logo: Buffer | null;
    agencyName: string;
    // Resale price overlay: replace the carrier's printed price with the
    // agency's edited one. Only applied when both are present and differ.
    priceOverlay?: {
      originalPrice: string | null | undefined; // what was extracted from this PDF
      newPrice: string | null | undefined; // the agency's edited price
      currency: string | null | undefined;
    } | null;
  },
): Promise<StampResult> {
  const pdf = await PDFDocument.load(originalPdf);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);

  // Replace the carrier's printed price with the agency's, when it changed.
  const priceOverlay = await applyPriceOverlay(
    pdf,
    font,
    originalPdf,
    opts.priceOverlay,
  );

  await drawAgencyFooter(pdf, font, opts.logo, opts.agencyName);

  const bytes = await pdf.save();
  return { bytes: Buffer.from(bytes), priceOverlay };
}

/**
 * Maritime PDF editor export: apply the agent's text edits to the original
 * carrier PDF, then add the same co-branding footer as the classic path. No
 * automatic price search here — the price, like everything else, is whatever
 * the agent typed over the printed text.
 */
export async function stampEditedPdf(
  originalPdf: Buffer,
  opts: { logo: Buffer | null; agencyName: string; edits: PdfEdit[] },
): Promise<{ bytes: Buffer; edits: PdfEditResult }> {
  const pdf = await PDFDocument.load(originalPdf);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const edits = await applyPdfEdits(pdf, font, originalPdf, opts.edits);
  await drawAgencyFooter(pdf, font, opts.logo, opts.agencyName);
  const bytes = await pdf.save();
  return { bytes: Buffer.from(bytes), edits };
}

/**
 * Co-branding footer: extend every page downward by BAND and draw the agency
 * logo + "Émis par {name}" in the new white space. Shared by the classic
 * stamp path and the maritime PDF editor export.
 */
export async function drawAgencyFooter(
  pdf: PDFDocument,
  font: PDFFont,
  logo: Buffer | null,
  agencyName: string,
): Promise<void> {
  // pdf-lib only embeds PNG/JPG. Normalize any allowed logo format
  // (PNG/JPG/SVG/WEBP) to PNG via sharp, then embed once and reuse.
  let logoImage: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
  let logoWidth = 0;
  if (logo) {
    try {
      const png = await sharp(logo).png().toBuffer();
      logoImage = await pdf.embedPng(png);
      const dims = logoImage.scale(LOGO_HEIGHT / logoImage.height);
      logoWidth = dims.width;
    } catch {
      // Unreadable logo — fall back to text-only footer below.
      logoImage = null;
    }
  }

  const label = `${PREFIX}${agencyName}`;
  const textWidth = font.widthOfTextAtSize(label, FONT_SIZE);
  const textColor = rgb(0.1, 0.12, 0.18);
  const ruleColor = rgb(0.8, 0.82, 0.86);

  // Width of the centered [logo] [gap] [text] block.
  const blockWidth = (logoImage ? logoWidth + GAP : 0) + textWidth;

  for (const page of pdf.getPages()) {
    const mb = page.getMediaBox();
    const origBottom = mb.y; // original lower edge in user space (usually 0)

    // Grow the visible page downward so the footer lives in fresh white space
    // rather than over the carrier's existing content. Update CropBox too, or a
    // viewer that crops to it would clip the new band away.
    page.setMediaBox(mb.x, mb.y - BAND, mb.width, mb.height + BAND);
    page.setCropBox(mb.x, mb.y - BAND, mb.width, mb.height + BAND);

    // Hairline separator just below the original content, at the top of the band.
    const ruleY = origBottom - 8;
    page.drawLine({
      start: { x: mb.x + SIDE_MARGIN, y: ruleY },
      end: { x: mb.x + mb.width - SIDE_MARGIN, y: ruleY },
      thickness: 0.5,
      color: ruleColor,
    });

    // Center the block horizontally; sit it inside the band with ~10pt padding.
    let cursorX = mb.x + (mb.width - blockWidth) / 2;
    const rowBottom = origBottom - BAND + 11;

    if (logoImage) {
      page.drawImage(logoImage, {
        x: cursorX,
        y: rowBottom,
        width: logoWidth,
        height: LOGO_HEIGHT,
      });
      cursorX += logoWidth + GAP;
    }

    // Vertically center the text against the logo row.
    const textY = rowBottom + LOGO_HEIGHT / 2 - FONT_SIZE / 2;
    page.drawText(label, {
      x: cursorX,
      y: textY,
      size: FONT_SIZE,
      font,
      color: textColor,
    });
  }
}

const sameAmount = (a: string, b: string): boolean => {
  const d = (s: string) => (s.match(/\d/g) ?? []).join("");
  return d(a) === d(b);
};

async function applyPriceOverlay(
  pdf: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  originalPdf: Buffer,
  overlay:
    | {
        originalPrice: string | null | undefined;
        newPrice: string | null | undefined;
        currency: string | null | undefined;
      }
    | null
    | undefined,
): Promise<PriceOverlayResult> {
  const result: PriceOverlayResult = {
    attempted: false,
    applied: false,
    matches: 0,
    colorSampled: 0,
    patched: 0,
    error: null,
  };
  if (!overlay) return result;
  const original = overlay.originalPrice?.trim();
  const next = overlay.newPrice?.trim();
  // Nothing to do unless both exist and the amount actually changed.
  if (!original || !next || sameAmount(original, next)) return result;
  result.attempted = true;

  try {
    const boxes = await locatePriceBoxes(originalPdf, original);
    result.matches = boxes.length;
    if (boxes.length === 0) {
      // Couldn't find the printed price — leave the PDF untouched, but record
      // why so the caller can tell "not found" from "code never ran".
      result.error = `price "${original}" not found in PDF text`;
      return result;
    }
    const currency = overlay.currency?.trim();
    const fallback = currency ? `${next} ${currency}` : next;
    // Render the new amount in each printed occurrence's own style ("DZD ..."
    // prefix, "…,00D" suffix, separators) so the edit reads as native.
    for (const box of boxes) {
      box.replacement = mimicPriceFormat(box.matchedText, next, fallback);
    }
    // Render each replacement in the font that best matches the original
    // printed price (needs the replacements above for glyph-coverage checks).
    await assignOverlayFonts(pdf, boxes);
    result.colorSampled = boxes.filter((b) => b.bg).length;
    result.patched = boxes.filter((b) => b.patch).length;
    await drawPriceOverlay(pdf, font, boxes, fallback);
    result.applied = true;
  } catch (err) {
    // Best-effort: never let a price-overlay failure break the export.
    result.error = err instanceof Error ? err.message : String(err);
    console.error("[STAMP_PRICE_OVERLAY]", err);
  }
  return result;
}
