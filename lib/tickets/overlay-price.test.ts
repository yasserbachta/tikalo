import { describe, expect, it } from "vitest";
import {
  buildPriceBoxesForPage,
  inpaintInk,
  pickMaskColors,
  type RawItem,
} from "./overlay-price";

// Build a pdfjs-style text item: transform [size, 0, 0, size, x, baseline].
function item(str: string, x: number, y: number, w: number, h: number): RawItem {
  return { str, transform: [h, 0, 0, h, x, y], width: w, height: h };
}

describe("buildPriceBoxesForPage", () => {
  // Real geometry from a GNV ticket: "TOTALE" ends at x=529.3 and the price
  // item starts at x=529.4 — virtually zero gap.
  const gnvItems = [
    item("DZD 176986.14", 542.8, 580.6, 39.7, 8.0), // strikethrough, other line
    item("TOTALE", 503.2, 566.3, 26.1, 10.7),
    item("DZD 100180.00", 529.4, 566.3, 53.0, 10.7),
    item("COUPON", 309.0, 519.2, 22.5, 8.0),
  ];

  it("GNV: right-aligns and never masks the TOTALE label", () => {
    const boxes = buildPriceBoxesForPage(gnvItems, "10018000", 0);
    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    expect(box.align).toBe("right");
    expect(box.drawRight).toBeCloseTo(582.4, 1);
    // Mask must not reach into "TOTALE" (ends at 529.3)...
    expect(box.maskX).toBeGreaterThanOrEqual(529.3);
    // ...but must still cover the price's own first glyph.
    expect(box.maskX).toBeLessThanOrEqual(529.4);
    expect(box.matchedText).toBe("DZD 100180.00");
    // Text must stop a word-space short of "TOTALE" even though the original
    // sat flush against it: 582.4 - (529.3 + 0.25*10.7) ≈ 50.4.
    expect(box.textMaxWidth).toBeCloseTo(50.425, 1);
    // The struck-through older price (different digits) is untouched.
  });

  it("GNV: does not match the unrelated strikethrough amount", () => {
    const boxes = buildPriceBoxesForPage(gnvItems, "10018000", 0);
    expect(boxes.every((b) => !b.matchedText.includes("176986"))).toBe(true);
  });

  // Real geometry from a Corsica Linea confirmation, page 1: the price sits
  // inline in a sentence ("...voyage soit 97.086,16D selon les détails...").
  const corsicaInline = [
    item("Nous avons le plaisir ... voyage soit", 36.5, 559.3, 381.8, 8.0),
    item("97.086,16D", 420.5, 559.3, 41.4, 8.0),
    item("selon les détails ci-dessous.", 464.1, 559.3, 99.5, 8.0),
  ];

  it("Corsica inline: left-aligns and clamps the mask before the next word", () => {
    const boxes = buildPriceBoxesForPage(corsicaInline, "9708616", 0);
    expect(boxes).toHaveLength(1);
    const box = boxes[0];
    expect(box.align).toBe("left");
    expect(box.drawX).toBeCloseTo(420.5, 1);
    // Mask covers the whole price but stops before "selon..." at 464.1.
    expect(box.maskX + box.maskWidth).toBeGreaterThanOrEqual(461.9);
    expect(box.maskX + box.maskWidth).toBeLessThanOrEqual(464.1);
    // Text stops a word-space before "selon..." at 464.1 (size 8 → 2pt gap).
    expect(box.drawX + box.textMaxWidth).toBeLessThanOrEqual(464.1 - 2 + 0.01);
  });

  // Corsica totals column (page 2): label far to the left, nothing after the
  // amount — a right-aligned column.
  const corsicaColumn = [
    item("Total Voyage TTC", 378.7, 554.9, 80.5, 10.0),
    item("97.086,16D", 523.8, 556.6, 51.1, 10.0),
  ];

  it("Corsica column: right-aligns to the amount's right edge", () => {
    const boxes = buildPriceBoxesForPage(corsicaColumn, "9708616", 1);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].align).toBe("right");
    expect(boxes[0].drawRight).toBeCloseTo(574.9, 1);
    expect(boxes[0].pageIndex).toBe(1);
    // The label sits far left, so the replacement may keep its original size
    // and extend past the mask: 574.9 - (459.2 + 0.25*10) ≈ 113.2.
    expect(boxes[0].textMaxWidth).toBeCloseTo(113.2, 1);
  });

  it("keeps the mask within the line box (spares table rules)", () => {
    const [box] = buildPriceBoxesForPage(corsicaColumn, "9708616", 0);
    expect(box.maskY).toBeCloseTo(556.6 - 0.25 * 10, 5);
    expect(box.maskY + box.maskHeight).toBeCloseTo(556.6 + 0.8 * 10, 5);
  });

  it("matches a price split across runs and swallows cents + currency", () => {
    const items = [
      item("12 500", 100, 300, 30, 10),
      item(",00", 130, 300, 10, 10),
      item(" DA", 140, 300, 12, 10),
    ];
    const boxes = buildPriceBoxesForPage(items, "12500", 0);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].matchedText).toBe("12 500,00 DA");
  });

  it("does not treat a longer unrelated number as the target (overshoot guard)", () => {
    const items = [item("125000", 100, 300, 30, 10)];
    expect(buildPriceBoxesForPage(items, "12500", 0)).toHaveLength(0);
  });

  it("accepts a decimal-tail overshoot ('12500,00' for target 12500)", () => {
    const items = [item("12500,00", 100, 300, 40, 10)];
    const boxes = buildPriceBoxesForPage(items, "12500", 0);
    expect(boxes).toHaveLength(1);
  });
});

describe("pickMaskColors", () => {
  function crop(
    w: number,
    h: number,
    fill: (x: number, y: number) => [number, number, number],
  ): Uint8Array {
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = fill(x, y);
        const p = (y * w + x) * 4;
        out[p] = r;
        out[p + 1] = g;
        out[p + 2] = b;
        out[p + 3] = 255;
      }
    }
    return out;
  }

  it("separates black glyphs on white", () => {
    const rgba = crop(10, 10, (x) => (x < 3 ? [0, 0, 0] : [255, 255, 255]));
    const colors = pickMaskColors(rgba, 10, 10);
    expect(colors?.bg).toEqual({ r: 1, g: 1, b: 1 });
    expect(colors?.ink).toEqual({ r: 0, g: 0, b: 0 });
  });

  it("recovers a tinted background (guilloche) and dark ink", () => {
    const rgba = crop(10, 10, (x) =>
      x < 2 ? [20, 20, 60] : [230, 210, 220],
    );
    const colors = pickMaskColors(rgba, 10, 10);
    expect(colors?.bg.r).toBeCloseTo(230 / 255, 2);
    expect(colors?.bg.g).toBeCloseTo(210 / 255, 2);
    expect(colors?.bg.b).toBeCloseTo(220 / 255, 2);
    expect(colors?.ink?.b).toBeCloseTo(60 / 255, 2);
  });

  it("returns null ink for a near-uniform crop", () => {
    const rgba = crop(10, 10, () => [240, 240, 240]);
    const colors = pickMaskColors(rgba, 10, 10);
    expect(colors?.bg.r).toBeCloseTo(240 / 255, 2);
    expect(colors?.ink).toBeNull();
  });

  it("ignores a sub-2% dark population as noise", () => {
    const rgba = crop(10, 10, (x, y) =>
      x === 0 && y === 0 ? [0, 0, 0] : [255, 255, 255],
    );
    const colors = pickMaskColors(rgba, 10, 10);
    expect(colors?.ink).toBeNull();
  });

  it("rejects a crop that is too small", () => {
    expect(pickMaskColors(new Uint8Array(4), 1, 1)).toBeNull();
  });

  // Regression: a production export rendered pages without glyphs (the PDF's
  // base-14 fonts weren't available in that runtime), so the crop was a
  // glyph-free light gradient. The luminance split then called the gradient's
  // darker tone "ink" and the price was drawn in washed-out pale pink.
  it("returns null ink for a textless light gradient", () => {
    const rgba = crop(20, 10, (x) => {
      const v = 200 + Math.round((x / 19) * 55); // lum ~200..255, range > 32
      return [v, v - 10, v];
    });
    const colors = pickMaskColors(rgba, 20, 10);
    expect(colors?.ink).toBeNull();
    expect(colors?.bg.r).toBeGreaterThan(0.8);
  });
});

describe("inpaintInk", () => {
  function crop(
    w: number,
    h: number,
    fill: (x: number, y: number) => [number, number, number],
  ): Uint8Array {
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = fill(x, y);
        const p = (y * w + x) * 4;
        out[p] = r;
        out[p + 1] = g;
        out[p + 2] = b;
        out[p + 3] = 255;
      }
    }
    return out;
  }

  const gradient = (x: number): [number, number, number] => {
    const v = 190 + Math.round((x / 19) * 60);
    return [v, v - 15, v - 5];
  };

  it("erases a dark blob and reconstructs the gradient behind it", () => {
    const withBlob = crop(20, 12, (x, y) =>
      x >= 8 && x <= 11 && y >= 4 && y <= 7 ? [10, 10, 10] : gradient(x),
    );
    expect(inpaintInk(withBlob, 20, 12)).toBe(true);
    // Every former blob pixel should now approximate the local gradient.
    for (let y = 4; y <= 7; y++) {
      for (let x = 8; x <= 11; x++) {
        const p = (y * 20 + x) * 4;
        const [er] = gradient(x);
        expect(Math.abs(withBlob[p] - er)).toBeLessThan(25);
        expect(withBlob[p]).toBeGreaterThan(150); // definitely not dark ink
      }
    }
  });

  it("leaves a glyph-free crop untouched", () => {
    const clean = crop(20, 12, (x) => gradient(x));
    const before = clean.slice();
    expect(inpaintInk(clean, 20, 12)).toBe(true);
    expect(clean).toEqual(before);
  });

  it("bails on a crop that is mostly dark (not text-on-background)", () => {
    const dark = crop(10, 10, (x) => (x < 7 ? [20, 20, 20] : [250, 250, 250]));
    expect(inpaintInk(dark, 10, 10)).toBe(false);
  });
});
