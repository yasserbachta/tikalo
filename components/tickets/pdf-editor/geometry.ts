// Browser-side geometry for the maritime PDF editor. Spans and edits carry PDF
// user-space coordinates (points, origin bottom-left); pdfjs' viewport maps
// them to CSS pixels on the rendered page (handles the y-flip and page origin).

export interface ViewportLike {
  scale: number;
  width: number;
  height: number;
  convertToViewportPoint(x: number, y: number): number[];
}

export interface CssRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function pdfRectToCss(
  viewport: ViewportLike,
  x: number,
  y: number,
  w: number,
  h: number,
): CssRect {
  const [ax, ay] = viewport.convertToViewportPoint(x, y + h);
  const [bx, by] = viewport.convertToViewportPoint(x + w, y);
  return {
    left: Math.min(ax, bx),
    top: Math.min(ay, by),
    width: Math.abs(bx - ax),
    height: Math.abs(by - ay),
  };
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const luma = ({ r, g, b }: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function medianColor(pixels: Rgb[]): Rgb {
  return {
    r: median(pixels.map((p) => p.r)),
    g: median(pixels.map((p) => p.g)),
    b: median(pixels.map((p) => p.b)),
  };
}

export const DEFAULT_COLORS: { bg: Rgb; ink: Rgb } = {
  bg: { r: 255, g: 255, b: 255 },
  ink: { r: 0, g: 0, b: 0 },
};

/**
 * Preview colors for an edit: the background around the original text (mask
 * border pixels) and its ink (pixels clearly darker than that background).
 * The export samples properly server-side; this only drives the live preview.
 */
export function sampleColors(
  pixels: ImageData,
  rect: CssRect,
  pixelRatio: number,
): { bg: Rgb; ink: Rgb } {
  const left = Math.max(0, Math.floor(rect.left * pixelRatio));
  const top = Math.max(0, Math.floor(rect.top * pixelRatio));
  const w = Math.min(pixels.width - left, Math.ceil(rect.width * pixelRatio));
  const h = Math.min(pixels.height - top, Math.ceil(rect.height * pixelRatio));
  if (w < 2 || h < 2) return DEFAULT_COLORS;

  const data = pixels.data;
  const at = (x: number, y: number): Rgb => {
    const i = ((top + y) * pixels.width + (left + x)) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  };

  const border: Rgb[] = [];
  for (let x = 0; x < w; x++) border.push(at(x, 0), at(x, h - 1));
  for (let y = 1; y < h - 1; y++) border.push(at(0, y), at(w - 1, y));
  const bg = medianColor(border);

  const bgLuma = luma(bg);
  const inkPixels: Rgb[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = at(x, y);
      if (luma(p) < bgLuma - 60) inkPixels.push(p);
    }
  }
  const ink = inkPixels.length > 0 ? medianColor(inkPixels) : DEFAULT_COLORS.ink;
  return { bg, ink };
}

export const rgbCss = ({ r, g, b }: Rgb) => `rgb(${r}, ${g}, ${b})`;

// Preview faces, mirroring the export's width-matched candidates
// (overlay-font.ts): Helvetica for regular faces, Oswald for condensed ones
// (GNV prints in a Type3 condensed face).
export const PREVIEW_FONT_FAMILY = "Helvetica, Arial, sans-serif";
const CONDENSED_FAMILY = "TikaloOswaldPreview";
const CONDENSED_STACK = `${CONDENSED_FAMILY}, "Arial Narrow", sans-serif`;

let condensedLoad: Promise<void> | null = null;
/** Load the condensed preview face once (served from public/fonts). */
export function loadPreviewFonts(): Promise<void> {
  condensedLoad ??= (async () => {
    try {
      const face = new FontFace(CONDENSED_FAMILY, "url(/fonts/oswald-500.ttf)");
      document.fonts.add(await face.load());
    } catch {
      // Preview only — fall back to Arial Narrow / sans-serif.
    }
  })();
  return condensedLoad;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function measure(text: string, fontPx: number, family: string): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return 0;
  measureCtx.font = `600 ${fontPx}px ${family}`;
  return measureCtx.measureText(text).width;
}

/**
 * Pick the preview face whose width best reproduces the original printed
 * run (same idea as pickCandidateName on the server).
 */
export function previewFamily(
  originalText: string,
  fontPx: number,
  originalWidthPx: number,
): string {
  if (!originalText || originalWidthPx <= 0) return PREVIEW_FONT_FAMILY;
  const regular = Math.abs(measure(originalText, fontPx, PREVIEW_FONT_FAMILY) - originalWidthPx);
  const condensed = Math.abs(measure(originalText, fontPx, CONDENSED_STACK) - originalWidthPx);
  return condensed < regular ? CONDENSED_STACK : PREVIEW_FONT_FAMILY;
}

/**
 * Font size (CSS px) the replacement renders at in the preview: the original
 * size, shrunk only when the text would overflow its max width, which is the
 * same rule drawPriceOverlay applies at export.
 */
export function fitFontPx(
  text: string,
  fontPx: number,
  maxWidthPx: number,
  minPx: number,
  family: string,
): number {
  if (!text) return fontPx;
  const width = measure(text, fontPx, family);
  if (width <= maxWidthPx || width <= 0) return fontPx;
  return Math.max(minPx, (fontPx * maxWidthPx) / width);
}
