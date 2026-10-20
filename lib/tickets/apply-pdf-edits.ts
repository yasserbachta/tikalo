import type { PDFDocument, PDFFont } from "pdf-lib";
import type { PriceBox } from "./overlay-price";
import { buildBoxPatches, drawPriceOverlay } from "./overlay-price";
import { assignOverlayFonts } from "./overlay-font";
import { isEffectiveEdit, type PdfEdit } from "./pdf-edits";

// Export side of the maritime PDF editor: each edit the agent made in the
// browser becomes a PriceBox — the overlay engine's unit of "mask this run,
// draw that text" — and goes through the exact pipeline the price overlay
// uses: inpainted background patch, metrics-matched font, sampled ink color.
// The only difference is WHO decides where: the agent's click instead of a
// content search, so a carrier layout change can no longer break it.

export interface PdfEditResult {
  requested: number; // edits whose text actually changed
  applied: number;
  failed: { id: string; text: string; reason: string }[];
}

export function editToBox(edit: PdfEdit): PriceBox {
  return {
    pageIndex: edit.pageIndex,
    maskX: edit.maskX,
    maskY: edit.maskY,
    maskWidth: edit.maskWidth,
    maskHeight: edit.maskHeight,
    align: edit.align,
    drawX: edit.drawX,
    drawRight: edit.drawRight,
    textMaxWidth: edit.textMaxWidth,
    baselineY: edit.baselineY,
    fontSize: edit.fontSize,
    matchedText: edit.text,
    replacement: edit.newText.trim(),
    fromOcr: edit.fromOcr,
  };
}

export async function applyPdfEdits(
  pdf: PDFDocument,
  fallbackFont: PDFFont,
  originalPdf: Buffer,
  edits: PdfEdit[],
): Promise<PdfEditResult> {
  const effective = edits.filter(
    (e) => isEffectiveEdit(e) && e.pageIndex < pdf.getPageCount(),
  );
  const result: PdfEditResult = {
    requested: effective.length,
    applied: 0,
    failed: [],
  };
  if (effective.length === 0) return result;

  const boxes = effective.map(editToBox);
  // Both best-effort: on failure boxes fall back to flat-color masks and the
  // fallback font.
  await buildBoxPatches(originalPdf, boxes);
  await assignOverlayFonts(pdf, boxes);

  for (const [i, box] of boxes.entries()) {
    const edit = effective[i];
    // Standard fonts only encode WinAnsi; check BEFORE drawing so an
    // unencodable character never leaves a masked-out hole with no text.
    try {
      (box.font ?? fallbackFont).encodeText(box.replacement ?? "");
    } catch {
      result.failed.push({
        id: edit.id,
        text: edit.newText,
        reason: "unsupported characters",
      });
      continue;
    }
    try {
      await drawPriceOverlay(pdf, fallbackFont, [box], "");
      result.applied++;
    } catch (err) {
      result.failed.push({
        id: edit.id,
        text: edit.newText,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return result;
}
