import path from "node:path";
import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import type { PDFDocument, PDFFont } from "pdf-lib";
import { PDFDocument as PDFDocumentClass, StandardFonts } from "pdf-lib";
import type { PriceBox } from "./overlay-price";

// Font matching for the resale price overlay. The replacement should render
// in the carrier's own typeface; we can't always reuse it directly (GNV embeds
// Type3 fonts — glyphs are inline drawing procedures with no font program to
// extract), so instead we pick, per matched price, the candidate whose metrics
// best reproduce the original: the candidate that renders the matched text at
// the matched font size closest to the width it actually occupies on the page.
// For documents set in base-14 fonts (Corsica prints in Helvetica-Bold) this
// selects the *identical* font; for condensed carrier faces (GNV) it selects
// Oswald, much closer than wide Helvetica.

interface Candidate {
  name: string;
  std?: StandardFonts;
  file?: string; // relative to public/fonts, same convention as the templates
}

// Bold variants first: Helvetica's digits have identical advances in both
// weights, so ties are common — and printed totals are almost always bold.
const CANDIDATES: Candidate[] = [
  { name: "Helvetica-Bold", std: StandardFonts.HelveticaBold },
  { name: "Helvetica", std: StandardFonts.Helvetica },
  { name: "Times-Bold", std: StandardFonts.TimesRomanBold },
  { name: "Times-Roman", std: StandardFonts.TimesRoman },
  { name: "Oswald-500", file: "oswald-500.ttf" },
  { name: "Oswald-600", file: "oswald-600.ttf" },
];

const fontsDir = path.join(process.cwd(), "public", "fonts");

interface Measurer {
  name: string;
  // Returns null when the text contains glyphs this font can't render.
  width: (text: string, size: number) => number | null;
  ttfBytes?: Uint8Array;
  std?: StandardFonts;
}

let measurersPromise: Promise<Measurer[]> | null = null;

/** Exported for unit tests. */
export async function loadMeasurers(): Promise<Measurer[]> {
  const out: Measurer[] = [];

  // Standard-font metrics come from pdf-lib itself; a scratch document is
  // enough to measure without touching the real one.
  const scratch = await PDFDocumentClass.create();
  for (const c of CANDIDATES) {
    if (c.std) {
      const font = await scratch.embedFont(c.std);
      out.push({
        name: c.name,
        std: c.std,
        width: (text, size) => {
          try {
            return font.widthOfTextAtSize(text, size);
          } catch {
            return null; // not encodable in this font
          }
        },
      });
    } else if (c.file) {
      try {
        const bytes = new Uint8Array(await readFile(path.join(fontsDir, c.file)));
        const fk = fontkit.create(Buffer.from(bytes));
        out.push({
          name: c.name,
          ttfBytes: bytes,
          width: (text, size) => {
            for (const ch of text) {
              if (!fk.hasGlyphForCodePoint(ch.codePointAt(0) ?? 0)) return null;
            }
            return (fk.layout(text).advanceWidth / fk.unitsPerEm) * size;
          },
        });
      } catch {
        // Font file unavailable in this runtime — just skip the candidate.
      }
    }
  }
  return out;
}

/**
 * Pick the candidate font that best reproduces the original price's width.
 * Exported for unit tests. Returns null when nothing measures acceptably.
 */
export function pickCandidateName(
  measurers: Measurer[],
  matchedText: string,
  fontSize: number,
  runWidth: number,
  replacement: string,
): string | null {
  if (!(runWidth > 0) || !(fontSize > 0)) return null;
  // Trailing whitespace occupies advance width in the measurement but no ink
  // on the page (runWidth is measured to the last glyph) — drop it, or every
  // candidate reads wider than the original and narrow faces win unfairly.
  const measured = matchedText.replace(/\s+$/, "");
  let best: { name: string; err: number } | null = null;
  for (const m of measurers) {
    const w = m.width(measured, fontSize);
    if (w === null || w <= 0) continue;
    if (m.width(replacement, fontSize) === null) continue; // can't render it
    const err = Math.abs(w - runWidth) / runWidth;
    if (!best || err < best.err) best = { name: m.name, err };
  }
  // Even a mediocre match beats defaulting blind, but past this the metrics
  // say the candidate has nothing to do with the original face.
  return best && best.err < 0.6 ? best.name : null;
}

/**
 * Assign each box the font that best matches the original printed price.
 * Mutates `box.font`; best-effort — boxes keep no font (caller's fallback)
 * when measuring or embedding fails.
 */
export async function assignOverlayFonts(
  pdf: PDFDocument,
  boxes: PriceBox[],
): Promise<void> {
  try {
    measurersPromise ??= loadMeasurers();
    const measurers = await measurersPromise;
    pdf.registerFontkit(fontkit);

    const embedded = new Map<string, PDFFont>();
    for (const box of boxes) {
      // OCR boxes measure ink extents, not advance widths, and every scanned
      // carrier ticket we handle is set in a grotesque — serif metrics can win
      // the width match on noisy OCR geometry while looking obviously wrong on
      // the page, so keep them out of the running.
      const candidates = box.fromOcr
        ? measurers.filter((m) => !m.name.startsWith("Times"))
        : measurers;
      const name = pickCandidateName(
        candidates,
        box.matchedText,
        box.fontSize,
        box.drawRight - box.drawX,
        box.replacement ?? "",
      );
      if (!name) continue;
      let font = embedded.get(name);
      if (!font) {
        const m = measurers.find((c) => c.name === name);
        if (!m) continue;
        font = m.std
          ? await pdf.embedFont(m.std)
          : await pdf.embedFont(m.ttfBytes!, { subset: true });
        embedded.set(name, font);
      }
      box.font = font;
    }
  } catch (err) {
    console.warn("[PRICE_OVERLAY_FONT]", err);
  }
}
