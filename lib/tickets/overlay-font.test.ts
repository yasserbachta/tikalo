import { describe, expect, it } from "vitest";
import { loadMeasurers, pickCandidateName } from "./overlay-font";

// Real geometry: GNV prints "DZD 100180.00" 53.0pt wide at size 10.7 in a
// condensed Type3 face; Corsica prints "97.086,16D" 51.1pt wide at size 10 in
// base-14 Helvetica-Bold.

describe("pickCandidateName", () => {
  it("selects Helvetica-Bold for a document set in Helvetica-Bold", async () => {
    const measurers = await loadMeasurers();
    const name = pickCandidateName(
      measurers,
      "97.086,16D",
      10,
      51.1,
      "100.000,00D",
    );
    expect(name).toBe("Helvetica-Bold");
  });

  it("selects condensed Oswald for GNV's condensed Type3 face", async () => {
    const measurers = await loadMeasurers();
    const name = pickCandidateName(
      measurers,
      "DZD 100180.00",
      10.7,
      53.0,
      "DZD 990.00",
    );
    expect(name).toMatch(/^Oswald/);
  });

  it("returns null when nothing comes close", async () => {
    const measurers = await loadMeasurers();
    // A run far narrower than any candidate can render.
    expect(
      pickCandidateName(measurers, "DZD 100180.00", 10.7, 10, "990"),
    ).toBeNull();
  });

  it("returns null for degenerate geometry", async () => {
    const measurers = await loadMeasurers();
    expect(pickCandidateName(measurers, "990", 0, 0, "990")).toBeNull();
  });
});
