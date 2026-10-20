import { z } from "zod";

// Maritime PDF editor data model, shared by the browser editor, the
// savePdfEdits action and the export route (no server-only imports here).
//
// A *span* is one editable run of printed text on the original carrier PDF
// (a word group on one line), located server-side from the text layer (or OCR
// for scanned pages) — see lib/tickets/pdf-spans.ts. All geometry is in PDF
// user space (points, origin bottom-left), exactly the shape the price
// overlay engine draws from (PriceBox in overlay-price.ts).
//
// An *edit* is a span snapshot plus the agent's replacement text. Storing the
// geometry with the edit keeps the export independent from re-reading the PDF.

const coord = z.number().finite().min(-20_000).max(20_000);

export const textSpanSchema = z.object({
  id: z.string().min(1).max(40),
  pageIndex: z.number().int().min(0).max(500),
  text: z.string().max(1000),
  maskX: coord,
  maskY: coord,
  maskWidth: z.number().finite().min(0).max(20_000),
  maskHeight: z.number().finite().min(0).max(20_000),
  align: z.enum(["left", "right"]),
  drawX: coord,
  drawRight: coord,
  textMaxWidth: z.number().finite().min(0).max(20_000),
  baselineY: coord,
  fontSize: z.number().finite().min(1).max(500),
  fromOcr: z.boolean().optional(),
});

export type TextSpan = z.infer<typeof textSpanSchema>;

export const MAX_PDF_EDITS = 200;
export const MAX_EDIT_TEXT = 300;

export const pdfEditSchema = textSpanSchema.extend({
  newText: z.string().max(MAX_EDIT_TEXT),
});

export type PdfEdit = z.infer<typeof pdfEditSchema>;

export const pdfEditsSchema = z.array(pdfEditSchema).max(MAX_PDF_EDITS);

export interface TextSpansPage {
  pageIndex: number;
  width: number;
  height: number;
  fromOcr: boolean;
  spans: TextSpan[];
}

/** Stored JSON → edits; anything malformed is treated as "no edits". */
export function parseStoredPdfEdits(value: unknown): PdfEdit[] {
  const parsed = pdfEditsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** An edit only does something when the text actually changed. */
export function isEffectiveEdit(edit: PdfEdit): boolean {
  return edit.newText.trim() !== edit.text.trim();
}
