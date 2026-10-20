// ---------------------------------------------------------------------------
// Unified palette system
// ---------------------------------------------------------------------------
// Every PDF template consumes the same PaletteColors shape, and every palette
// is derived from a single brand color so one selection looks coherent on all
// six templates. An agency picks either:
//   - "custom" → colors derived from agency.primaryColor, with
//     agency.secondaryColor as the tint/background family (the original
//     CLASSIC behavior, now shared by every template), or
//   - a predefined key ("navy", "emerald"…) → colors derived from a curated
//     brand hex.
// The selection persists in Agency.pdfPaletteKey and is template-independent:
// switching templates keeps the same colors.

export type PaletteColors = {
  brand: string; // primary brand color
  brand2: string; // darker brand
  ink: string; // body text
  muted: string; // secondary text
  line: string; // borders
  line2?: string; // alt border (some templates)
  tint?: string; // tinted bg (some templates)
  tint2?: string; // alt tinted bg (premium)
  paper?: string; // sheet background
  bg?: string; // page outer background
  soft?: string; // soft accent (wallet)
};

export type BrandPalette = {
  key: string; // "navy", "emerald"…
  name: string; // display name in French
  brand: string; // hex used for the UI swatch + derivation
  colors: PaletteColors;
};

export const CUSTOM_PALETTE_KEY = "custom";

// --- color math ------------------------------------------------------------

const FALLBACK_BRAND = "#1a2d5a";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

// Linear mix from `a` toward `b`; tolerates invalid hex (mid-typing in a text
// input) by falling back to the default brand.
function mix(a: string, b: string, t: number): string {
  const ra = hexToRgb(a) ?? hexToRgb(FALLBACK_BRAND)!;
  const rb = hexToRgb(b) ?? hexToRgb(FALLBACK_BRAND)!;
  return rgbToHex(
    ra[0] + (rb[0] - ra[0]) * t,
    ra[1] + (rb[1] - ra[1]) * t,
    ra[2] + (rb[2] - ra[2]) * t,
  );
}

const tintOf = (brand: string, t: number) => mix("#ffffff", brand, t);
const shadeOf = (brand: string, t: number) => mix(brand, "#000000", t);

// Derives the full color set from one brand hex. Ratios are calibrated against
// the hand-tuned palettes that shipped with the reference HTML templates
// (e.g. EDITORIAL teal: tint ≈ 6% brand on white, line ≈ 13%, bg ≈ 10%).
export function derivePaletteColors(brand: string): PaletteColors {
  const safe = hexToRgb(brand) ? brand : FALLBACK_BRAND;
  return {
    brand: safe,
    brand2: shadeOf(safe, 0.25),
    ink: mix("#161616", safe, 0.14),
    muted: mix("#6f6f6f", safe, 0.16),
    line: tintOf(safe, 0.13),
    line2: tintOf(safe, 0.22),
    tint: tintOf(safe, 0.07),
    tint2: tintOf(safe, 0.14),
    soft: tintOf(safe, 0.05),
    paper: "#ffffff",
    bg: tintOf(safe, 0.1),
  };
}

// "Custom" = the CLASSIC color logic generalized: primaryColor drives the
// brand family, secondaryColor (a light surface color) becomes the tint /
// background family — exactly how CLASSIC has always used the two.
export function buildCustomPaletteColors(
  primaryColor: string,
  secondaryColor: string,
): PaletteColors {
  const d = derivePaletteColors(primaryColor);
  const surface = hexToRgb(secondaryColor) ? secondaryColor : "#f0f2f5";
  return {
    ...d,
    tint: surface,
    tint2: shadeOf(surface, 0.07),
    soft: surface,
    bg: surface,
  };
}

// --- predefined catalog ------------------------------------------------------

export const BRAND_PALETTES: BrandPalette[] = [
  { key: "navy", name: "Marine", brand: "#1e3a8a" },
  { key: "emerald", name: "Émeraude", brand: "#0f766e" },
  { key: "sapphire", name: "Saphir", brand: "#1d4ed8" },
  { key: "indigo", name: "Indigo", brand: "#3730a3" },
  { key: "forest", name: "Forêt", brand: "#15803d" },
  { key: "copper", name: "Cuivre", brand: "#c2410c" },
  { key: "raspberry", name: "Framboise", brand: "#9d174d" },
  { key: "slate", name: "Ardoise", brand: "#1f2937" },
].map((p) => ({ ...p, colors: derivePaletteColors(p.brand) }));

// Keys saved by the previous per-template catalogs, mapped to their closest
// entry in the unified catalog so existing agencies keep similar colors.
const LEGACY_KEY_MAP: Record<string, string> = {
  teal: "emerald",
  cyan: "emerald",
  green: "forest",
  blue: "sapphire",
  purple: "indigo",
  dark: "slate",
  brown: "copper",
  orange: "copper",
  amber: "copper",
  pink: "raspberry",
  crimson: "raspberry",
  rose: "raspberry",
  default: CUSTOM_PALETTE_KEY,
};

// Maps any stored key (legacy, unknown, or current) to a valid one. Unknown
// keys fall back to "custom" — the historical default behavior.
export function normalizePaletteKey(key: string): string {
  if (key === CUSTOM_PALETTE_KEY) return key;
  if (BRAND_PALETTES.some((p) => p.key === key)) return key;
  return LEGACY_KEY_MAP[key] ?? CUSTOM_PALETTE_KEY;
}

// Single resolution entry point used by both the PDF renderer (server) and
// the live preview UI (client).
export function resolvePaletteColors(
  key: string,
  primaryColor: string,
  secondaryColor: string,
): PaletteColors {
  const normalized = normalizePaletteKey(key);
  if (normalized === CUSTOM_PALETTE_KEY) {
    return buildCustomPaletteColors(primaryColor, secondaryColor);
  }
  return BRAND_PALETTES.find((p) => p.key === normalized)!.colors;
}
