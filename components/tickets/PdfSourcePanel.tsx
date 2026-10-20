"use client";

import {
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  FileText,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";

interface PdfSourcePanelProps {
  pdfUrl: string;
  fileName: string;
  versionNumber: number;
  open: boolean;
  wide: boolean;
  onToggleOpen: () => void;
  onToggleWide: () => void;
}

const iconButtonClass =
  "size-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PdfSourcePanel({
  pdfUrl,
  fileName,
  versionNumber,
  open,
  wide,
  onToggleOpen,
  onToggleWide,
}: PdfSourcePanelProps) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggleOpen}
        aria-label="Show source PDF"
        className="paper w-full flex-1 min-h-48 flex flex-col items-center gap-3 py-4 hover:bg-muted/40 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <PanelRightOpen className="size-4 text-muted-foreground" />
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground [writing-mode:vertical-rl]">
          Source PDF
        </span>
      </button>
    );
  }

  return (
    <div className="paper flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="shrink-0 px-3 py-2 border-b border-border/60 bg-muted/30 flex items-center gap-2">
        <FileText className="size-3.5 text-brand shrink-0" />
        <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground truncate">
          Source · {fileName}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground/70 shrink-0">
          v{versionNumber}
        </span>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <a
            href={pdfUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open source PDF in new tab"
            className={iconButtonClass}
          >
            <ExternalLink className="size-3.5" />
          </a>
          <button
            type="button"
            onClick={onToggleWide}
            aria-label={wide ? "Narrow PDF panel" : "Widen PDF panel"}
            className={`${iconButtonClass} hidden xl:grid`}
          >
            {wide ? (
              <ChevronsRight className="size-3.5" />
            ) : (
              <ChevronsLeft className="size-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onToggleOpen}
            aria-label="Hide source PDF"
            className={iconButtonClass}
          >
            <PanelRightClose className="size-3.5" />
          </button>
        </div>
      </div>
      <iframe
        src={pdfUrl}
        title="Source PDF"
        className="flex-1 w-full bg-muted/20"
      />
    </div>
  );
}
