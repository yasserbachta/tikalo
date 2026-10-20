import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { RawItem } from "./overlay-price";
import { groupIntoSpans } from "./pdf-spans";
import { applyPdfEdits, editToBox } from "./apply-pdf-edits";
import {
  isEffectiveEdit,
  parseStoredPdfEdits,
  pdfEditsSchema,
  type PdfEdit,
} from "./pdf-edits";

// pdfjs-style text item: transform [size, 0, 0, size, x, baseline].
function item(str: string, x: number, y: number, w: number, h: number): RawItem {
  return { str, transform: [h, 0, 0, h, x, y], width: w, height: h };
}

const page = (items: RawItem[]) => ({ pageIndex: 0, width: 595, height: 842, items });

describe("groupIntoSpans", () => {
  it("merges same-line fragments separated by word gaps", () => {
    const spans = groupIntoSpans(
      page([
        item("MOHAMED", 100, 700, 40, 10),
        item("BENALI", 142.5, 700, 32, 10), // 2.5pt gap (0.25em) → same span
      ]),
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].text).toBe("MOHAMED BENALI");
    expect(spans[0].drawX).toBe(100);
    expect(spans[0].drawRight).toBeCloseTo(174.5);
    expect(spans[0].align).toBe("left");
  });

  it("joins glyph runs with no gap without inserting spaces", () => {
    const spans = groupIntoSpans(
      page([item("DZD 1001", 500, 566, 30, 10.7), item("80.00", 530, 566, 20, 10.7)]),
    );
    expect(spans.map((s) => s.text)).toEqual(["DZD 100180.00"]);
  });

  it("keeps table columns, other lines and other sizes apart", () => {
    const spans = groupIntoSpans(
      page([
        item("Départ", 50, 600, 30, 9),
        item("Tanger Med", 200, 600, 50, 9), // column far away
        item("Arrivée", 50, 588, 32, 9), // next line
        item("TITRE", 84, 588, 30, 16), // different size
      ]),
    );
    expect(spans.map((s) => s.text)).toEqual(["Départ", "Tanger Med", "Arrivée", "TITRE"]);
    expect(new Set(spans.map((s) => s.id)).size).toBe(4);
  });

  it("lets free text grow to the page margin, keeps numbers column-aligned", () => {
    const spans = groupIntoSpans(
      page([item("TOTALE", 503.2, 566.3, 26.1, 10.7), item("100180.00", 540, 566.3, 42, 10.7)]),
    );
    const total = spans.find((s) => s.text === "100180.00")!;
    expect(total.align).toBe("right");
    const label = spans.find((s) => s.text === "TOTALE")!;
    expect(label.align).toBe("left");
    // Right neighbor is close, so label room stops before it.
    expect(label.drawX + label.textMaxWidth).toBeLessThan(540);

    const [lone] = groupIntoSpans(page([item("Cabine", 100, 400, 30, 10)]));
    expect(lone.drawX + lone.textMaxWidth).toBeCloseTo(595 - 18);
  });

  it("produces spans the edit schema accepts", () => {
    const spans = groupIntoSpans(page([item("ABC", 10, 10, 20, 10)]));
    const edits = spans.map((s) => ({ ...s, newText: "XYZ" }));
    expect(pdfEditsSchema.safeParse(edits).success).toBe(true);
  });
});

describe("pdf edits", () => {
  const base = groupIntoSpans(page([item("OLD NAME", 100, 700, 50, 10)]))[0];

  it("ignores no-op edits and malformed stored JSON", () => {
    expect(isEffectiveEdit({ ...base, newText: " OLD NAME " })).toBe(false);
    expect(isEffectiveEdit({ ...base, newText: "" })).toBe(true);
    expect(parseStoredPdfEdits(null)).toEqual([]);
    expect(parseStoredPdfEdits([{ nope: 1 }])).toEqual([]);
  });

  it("maps an edit onto the overlay engine's box", () => {
    const box = editToBox({ ...base, newText: " NEW NAME " });
    expect(box.matchedText).toBe("OLD NAME");
    expect(box.replacement).toBe("NEW NAME");
    expect(box.maskX).toBe(base.maskX);
    expect(box.baselineY).toBe(700);
  });

  it("applies edits to a real PDF and reports unencodable text", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    doc.addPage([595, 842]).drawText("OLD NAME", { x: 100, y: 700, size: 10, font });
    const original = Buffer.from(await doc.save());

    const pdf = await PDFDocument.load(original);
    const fallback = await pdf.embedFont(StandardFonts.HelveticaBold);
    const edits: PdfEdit[] = [
      { ...base, newText: "NEW NAME" },
      { ...base, id: "p0-x", newText: "اسم" }, // not WinAnsi-encodable
      { ...base, id: "p0-same", newText: "OLD NAME" }, // no-op
    ];
    const result = await applyPdfEdits(pdf, fallback, original, edits);
    expect(result.requested).toBe(2);
    expect(result.applied).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe("p0-x");
    expect((await pdf.save()).length).toBeGreaterThan(0);
  }, 30_000);
});
