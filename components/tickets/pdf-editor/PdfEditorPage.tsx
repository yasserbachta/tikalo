"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFPageProxy, RenderTask } from "pdfjs-dist";
import { cn } from "@/lib/utils";
import type { PdfEdit, TextSpan } from "@/lib/tickets/pdf-edits";
import {
  PREVIEW_FONT_FAMILY,
  fitFontPx,
  loadPreviewFonts,
  previewFamily,
  pdfRectToCss,
  rgbCss,
  sampleColors,
  DEFAULT_COLORS,
  type ViewportLike,
} from "./geometry";

interface PdfEditorPageProps {
  page: PDFPageProxy;
  cssScale: number;
  spans: TextSpan[];
  edits: PdfEdit[];
  activeId: string | null;
  showZones: boolean;
  disabled: boolean;
  onActivate: (id: string | null) => void;
  onCommit: (target: TextSpan, newText: string) => void;
}

export function PdfEditorPage({
  page,
  cssScale,
  spans,
  edits,
  activeId,
  showZones,
  disabled,
  onActivate,
  onCommit,
}: PdfEditorPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Pixels of the last finished render (original page only — previews are
  // drawn in a separate SVG layer), sampled for the preview colors.
  const [pixels, setPixels] = useState<ImageData | null>(null);
  // Re-measure previews once the condensed preview face is available.
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadPreviewFonts().then(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);
  const pixelRatio =
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2);

  const viewport = useMemo(
    () => page.getViewport({ scale: cssScale }) as unknown as ViewportLike,
    [page, cssScale],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderViewport = page.getViewport({ scale: cssScale });
    canvas.width = Math.floor(renderViewport.width * pixelRatio);
    canvas.height = Math.floor(renderViewport.height * pixelRatio);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    let task: RenderTask | null = page.render({
      canvas,
      canvasContext: ctx,
      viewport: renderViewport,
      transform: pixelRatio !== 1 ? [pixelRatio, 0, 0, pixelRatio, 0, 0] : undefined,
    });
    task.promise
      .then(() => setPixels(ctx.getImageData(0, 0, canvas.width, canvas.height)))
      .catch(() => {
        // Cancelled by a newer render (zoom/resize) — nothing to do.
      })
      .finally(() => {
        task = null;
      });
    return () => task?.cancel();
  }, [page, cssScale, pixelRatio]);

  // Edits replace the span with the same id (when it still reads the same);
  // remaining spans stay clickable.
  const editedIds = useMemo(
    () => new Set(edits.map((e) => `${e.id}\u0000${e.text}`)),
    [edits],
  );
  const freeSpans = spans.filter((s) => !editedIds.has(`${s.id}\u0000${s.text}`));

  const previews = useMemo(() => {
    return edits.map((edit) => {
      const mask = pdfRectToCss(
        viewport,
        edit.maskX,
        edit.maskY,
        edit.maskWidth,
        edit.maskHeight,
      );
      const colors = pixels
        ? sampleColors(pixels, mask, pixelRatio)
        : DEFAULT_COLORS;
      const [x, baseline] = viewport.convertToViewportPoint(edit.drawX, edit.baselineY);
      const [right] = viewport.convertToViewportPoint(edit.drawRight, edit.baselineY);
      const text = edit.newText.trim();
      const basePx = edit.fontSize * viewport.scale;
      const family = previewFamily(
        edit.text,
        basePx,
        (edit.drawRight - edit.drawX) * viewport.scale,
      );
      const fontPx = fitFontPx(
        text,
        basePx,
        edit.textMaxWidth * viewport.scale,
        5 * viewport.scale,
        family,
      );
      return { edit, mask, colors, x, right, baseline, text, fontPx, family };
    });
    // fontsReady: re-measure with the condensed face once it has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, viewport, pixels, pixelRatio, fontsReady]);

  const allTargets: TextSpan[] = [...freeSpans, ...edits];
  const active = allTargets.find((t) => t.id === activeId) ?? null;

  return (
    <div
      className="relative mx-auto bg-white shadow-sm ring-1 ring-foreground/10"
      style={{ width: viewport.width, height: viewport.height }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: viewport.width, height: viewport.height }}
      />

      {/* Live preview of edits: background patch + replacement text. */}
      <svg
        className="absolute inset-0 pointer-events-none"
        width={viewport.width}
        height={viewport.height}
        aria-hidden
      >
        {previews.map(({ edit, mask, colors, x, right, baseline, text, fontPx, family }) => (
          <g key={edit.id}>
            <rect
              x={mask.left}
              y={mask.top}
              width={mask.width}
              height={mask.height}
              fill={rgbCss(colors.bg)}
            />
            {text && edit.id !== activeId && (
              <text
                x={edit.align === "right" ? right : x}
                y={baseline}
                textAnchor={edit.align === "right" ? "end" : "start"}
                fontFamily={family}
                fontWeight={600}
                fontSize={fontPx}
                fill={rgbCss(colors.ink)}
              >
                {text}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Click targets. */}
      {!disabled &&
        allTargets.map((target) => {
          const isEdit = "newText" in target;
          const rect = pdfRectToCss(
            viewport,
            target.maskX,
            target.maskY,
            target.maskWidth,
            target.maskHeight,
          );
          if (target.id === activeId) return null;
          return (
            <button
              key={`${isEdit ? "e" : "s"}-${target.id}`}
              type="button"
              title={isEdit ? `${target.text} → ${(target as PdfEdit).newText}` : target.text}
              onClick={() => onActivate(target.id)}
              className={cn(
                "absolute rounded-[2px] cursor-text transition-colors",
                isEdit
                  ? "ring-1 ring-brand/70 hover:bg-brand/10"
                  : showZones
                    ? "ring-1 ring-brand/25 hover:ring-brand hover:bg-brand/10"
                    : "hover:ring-1 hover:ring-brand hover:bg-brand/10",
              )}
              style={{
                left: rect.left - 1,
                top: rect.top - 1,
                width: rect.width + 2,
                height: rect.height + 2,
              }}
            />
          );
        })}

      {active && !disabled && (
        <InlineEditor
          key={active.id}
          target={active}
          viewport={viewport}
          onCommit={(text) => {
            onCommit(active, text);
            onActivate(null);
          }}
          onCancel={() => onActivate(null)}
        />
      )}
    </div>
  );
}

function InlineEditor({
  target,
  viewport,
  onCommit,
  onCancel,
}: {
  target: TextSpan | PdfEdit;
  viewport: ViewportLike;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const initial = "newText" in target ? target.newText : target.text;
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const rect = pdfRectToCss(
    viewport,
    target.maskX,
    target.maskY,
    target.maskWidth,
    target.maskHeight,
  );
  const fontPx = Math.max(11, target.fontSize * viewport.scale);
  const width = Math.max(rect.width + 24, 140);
  const left =
    target.align === "right"
      ? Math.max(0, rect.left + rect.width - width)
      : Math.min(rect.left, Math.max(0, viewport.width - width));

  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      value={value}
      maxLength={300}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="absolute z-10 rounded-[3px] border border-brand bg-white px-1 text-black shadow-lg outline-none ring-2 ring-brand/30"
      style={{
        left,
        top: rect.top + rect.height / 2 - (fontPx + 8) / 2,
        width,
        height: fontPx + 8,
        fontSize: fontPx,
        fontFamily: PREVIEW_FONT_FAMILY,
        textAlign: target.align,
      }}
    />
  );
}
