import { describe, expect, it } from "vitest";
import { mimicPriceFormat, parseAmountCore } from "./price-format";

const FB = "FALLBACK";

describe("parseAmountCore", () => {
  it("parses a plain dot-decimal amount", () => {
    expect(parseAmountCore("100180.00")).toEqual({
      intDigits: "100180",
      decDigits: "00",
      thousandsSep: "",
      decimalSep: ".",
    });
  });

  it("parses dot thousands + comma decimals", () => {
    expect(parseAmountCore("97.086,16")).toEqual({
      intDigits: "97086",
      decDigits: "16",
      thousandsSep: ".",
      decimalSep: ",",
    });
  });

  it("parses space thousands", () => {
    expect(parseAmountCore("12 500,00")).toEqual({
      intDigits: "12500",
      decDigits: "00",
      thousandsSep: " ",
      decimalSep: ",",
    });
  });

  it("treats a single separator with 3 trailing digits as thousands", () => {
    expect(parseAmountCore("1.234")).toEqual({
      intDigits: "1234",
      decDigits: "",
      thousandsSep: ".",
      decimalSep: "",
    });
  });

  it("treats 1-2 trailing digits after a separator as decimals", () => {
    expect(parseAmountCore("990.5")?.decDigits).toBe("5");
    expect(parseAmountCore("990,00")?.decDigits).toBe("00");
  });

  it("parses an integer with no separators", () => {
    expect(parseAmountCore("100000")).toEqual({
      intDigits: "100000",
      decDigits: "",
      thousandsSep: "",
      decimalSep: "",
    });
  });

  it("rejects inconsistent grouping", () => {
    expect(parseAmountCore("12.34.5,00")).toBeNull();
    expect(parseAmountCore("1,23.456")).toBeNull();
  });
});

describe("mimicPriceFormat", () => {
  it("keeps a currency prefix verbatim (GNV style)", () => {
    expect(mimicPriceFormat("DZD 100180.00", "990.00", FB)).toBe("DZD 990.00");
  });

  it("mimics dot thousands + comma decimals with attached suffix (Corsica style)", () => {
    expect(mimicPriceFormat("97.086,16D", "100000", FB)).toBe("100.000,00D");
  });

  it("pads the new price to the document's decimal count", () => {
    expect(mimicPriceFormat("97.086,16D", "990", FB)).toBe("990,00D");
  });

  it("never rounds away extra precision in the new price", () => {
    expect(mimicPriceFormat("48.000D", "990.55", FB)).toBe("990,55D");
  });

  it("keeps spacing of a detached suffix ('12 500,00 DA')", () => {
    expect(mimicPriceFormat("12 500,00 DA", "9900", FB)).toBe("9 900,00 DA");
  });

  it("shows no grouping when the document shows none", () => {
    expect(mimicPriceFormat("DZD 100180.00", "1234567", FB)).toBe(
      "DZD 1234567.00",
    );
  });

  it("parses a new price that itself carries separators/currency", () => {
    expect(mimicPriceFormat("97.086,16D", "12,500.50 DZD", FB)).toBe(
      "12.500,50D",
    );
  });

  it("falls back when the matched text has no digits", () => {
    expect(mimicPriceFormat("TOTAL", "990", FB)).toBe(FB);
  });

  it("falls back when the new price is not numeric", () => {
    expect(mimicPriceFormat("97.086,16D", "abc", FB)).toBe(FB);
  });

  it("falls back when the matched core has inconsistent grouping", () => {
    expect(mimicPriceFormat("12.34.5,00D", "990", FB)).toBe(FB);
  });
});
