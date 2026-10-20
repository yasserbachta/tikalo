"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { PDFDocumentLoadingTask, PDFPageProxy } from "pdfjs-dist";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Loader2,
  MousePointerClick,
  RotateCcw,
  ScanText,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchJson } from "@/lib/query/fetcher";
import { queryKeys } from "@/lib/query/keys";
import {
  isEffectiveEdit,
  type PdfEdit,
  type TextSpan,
  type TextSpansPage,
} from "@/lib/tickets/pdf-edits";
import { PdfEditorPage } from "./PdfEditorPage";

// Maritime PDF editor (feature flag maritimeEditorEnabled): the original
// carrier PDF rendered with pdfjs, every printed text run clickable. Typing
// over a run records an edit (span geometry + new text); the export route
// applies the edits with the same patch/font engine as the price overlay and
// adds the agency footer. Edits are controlled by the parent (TicketEditor),
// which persists them with the savePdfEdits action.

const ZOOMS = [1, 1.25, 1.5, 2];
const PAGE_GAP = 16;

interface MaritimePdfEditorProps {
  ticketId: string;
  versionId: string;
  edits: PdfEdit[];
  onEditsChange: (edits: PdfEdit[]) => void;
  disabled?: boolean;
}

function spanFields(target: TextSpan | PdfEdit): TextSpan {
  const { newText: _ignored, ...span } = target as PdfEdit;
  void _ignored;
  return span;
}

export default function MaritimePdfEditor({
  ticketId,
  versionId,
  edits,
  onEditsChange,
  disabled = false,
}: MaritimePdfEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [showZones, setShowZones] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load the original PDF with pdfjs (browser build + worker). Imported here,
  // not at module scope, so nothing pdfjs-related reaches the server bundle.
  useEffect(() => {
    let cancelled = false;
    // pdfjs v6: tearing down the loading task destroys the document + worker.
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const res = await fetch(
          `/api/tickets/${ticketId}/original?versionId=${encodeURIComponent(versionId)}`,
        );
        if (!res.ok) throw new Error(`PDF introuvable (${res.status})`);
        const data = new Uint8Array(await res.arrayBuffer());
        if (cancelled) return;
        task = pdfjs.getDocument({ data });
        const doc = await task.promise;
        const loaded: PDFPageProxy[] = [];
        for (let i = 1; i <= doc.numPages; i++) loaded.push(await doc.getPage(i));
        if (!cancelled) setPages(loaded);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [ticketId, versionId]);

  const spansQuery = useQuery({
    queryKey: queryKeys.ticketTextSpans(ticketId, versionId),
    queryFn: () =>
      fetchJson<{ pages: TextSpansPage[] }>(
        `/api/tickets/${ticketId}/text-spans?versionId=${encodeURIComponent(versionId)}`,
      ),
    staleTime: Infinity,
    retry: 1,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const commit = useCallback(
    (target: TextSpan | PdfEdit, newText: string) => {
      const span = spanFields(target);
      const rest = edits.filter((e) => e.id !== span.id);
      const next: PdfEdit = { ...span, newText: newText.slice(0, 300) };
      onEditsChange(isEffectiveEdit(next) ? [...rest, next] : rest);
    },
    [edits, onEditsChange],
  );

  const revert = (id: string) => onEditsChange(edits.filter((e) => e.id !== id));

  const zoom = ZOOMS[zoomIndex];
  const spanPages = spansQuery.data?.pages ?? [];
  const scannedPages = spanPages.filter((p) => p.fromOcr).length;
  const emptyPages = spanPages.filter((p) => p.spans.length === 0).length;

  return (
    <div className="flex flex-col lg:min-h-0 h-full">
      {/* Toolbar */}
      <div className="shrink-0 flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground min-w-0">
          <MousePointerClick className="size-4 text-brand shrink-0" />
          <span className="truncate">
            Cliquez sur un texte du billet pour le modifier.
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {spansQuery.isLoading && (
            <span className="mr-2 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin text-brand" />
              Lecture du texte…
            </span>
          )}
          <ToolbarButton
            label={showZones ? "Masquer les zones" : "Afficher les zones modifiables"}
            onClick={() => setShowZones((v) => !v)}
            active={showZones}
          >
            {showZones ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </ToolbarButton>
          <ToolbarButton
            label="Zoom arrière"
            onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
            disabled={zoomIndex === 0}
          >
            <ZoomOut className="size-4" />
          </ToolbarButton>
          <span className="w-11 text-center text-[11px] font-mono tabular-nums text-muted-foreground">
            {Math.round(zoom * 100)}%
          </span>
          <ToolbarButton
            label="Zoom avant"
            onClick={() => setZoomIndex((i) => Math.min(ZOOMS.length - 1, i + 1))}
            disabled={zoomIndex === ZOOMS.length - 1}
          >
            <ZoomIn className="size-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Annuler toutes les modifications"
            onClick={() => onEditsChange([])}
            disabled={disabled || edits.length === 0}
          >
            <RotateCcw className="size-4" />
          </ToolbarButton>
        </div>
      </div>

      {(spansQuery.isError || scannedPages > 0 || emptyPages > 0) && (
        <div className="shrink-0 flex items-start gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground">
          {spansQuery.isError ? (
            <>
              <AlertTriangle className="size-4 shrink-0 text-destructive" />
              Le texte du PDF n&apos;a pas pu être lu ; l&apos;édition est
              indisponible pour ce billet.
            </>
          ) : (
            <>
              <ScanText className="size-4 shrink-0 text-brand" />
              {scannedPages > 0
                ? "Billet scanné : le texte a été reconnu automatiquement (OCR), vérifiez le rendu après export."
                : "Certaines pages ne contiennent pas de texte modifiable."}
            </>
          )}
        </div>
      )}

      {/* Pages */}
      <div className="flex-1 lg:min-h-0 overflow-auto bg-muted/30">
        <div ref={containerRef} className="w-full p-3 sm:p-4">
          {loadError ? (
            <div className="py-16 text-center text-sm text-destructive">
              Impossible d&apos;afficher le PDF : {loadError}
            </div>
          ) : !pages || containerWidth === 0 ? (
            <div className="py-16 grid place-items-center">
              <Loader2 className="size-6 animate-spin text-brand" />
            </div>
          ) : (
            <div className="flex flex-col items-center" style={{ gap: PAGE_GAP }}>
              {pages.map((page, i) => {
                const [x1, , x2] = page.view;
                const pageWidthPt = Math.abs(x2 - x1) || 595;
                const cssScale = (containerWidth / pageWidthPt) * zoom;
                return (
                  <PdfEditorPage
                    key={i}
                    page={page}
                    cssScale={cssScale}
                    spans={spanPages[i]?.spans ?? []}
                    edits={edits.filter((e) => e.pageIndex === i)}
                    activeId={activeId}
                    showZones={showZones}
                    disabled={disabled}
                    onActivate={setActiveId}
                    onCommit={commit}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Edit list */}
      {edits.length > 0 && (
        <div className="shrink-0 max-h-40 overflow-y-auto border-t border-border px-3 py-2">
          <p className="eyebrow mb-1.5 text-muted-foreground">
            {edits.length} modification{edits.length > 1 ? "s" : ""}
          </p>
          <ul className="space-y-1">
            {edits.map((edit) => (
              <li
                key={edit.id}
                className="flex items-center gap-2 text-[12px] min-w-0"
              >
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  p{edit.pageIndex + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setActiveId(edit.id)}
                  disabled={disabled}
                  className="min-w-0 flex-1 truncate text-left cursor-pointer hover:text-brand"
                >
                  <span className="text-muted-foreground line-through">
                    {edit.text}
                  </span>{" "}
                  → <span className="font-medium">{edit.newText.trim() || "(effacé)"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => revert(edit.id)}
                  disabled={disabled}
                  title="Annuler cette modification"
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer disabled:opacity-40"
                >
                  <Undo2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
        active && "bg-brand-soft text-brand",
      )}
    >
      {children}
    </button>
  );
}
