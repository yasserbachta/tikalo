"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { TicketFieldsForm } from "./TicketFieldsForm";
import { PdfSourcePanel } from "./PdfSourcePanel";
import { TicketDetail, TicketVersion } from "@/types/tickets";
import { TicketData, migrateTicketData } from "@/lib/tickets/schema";
import { saveTicket, confirmTicket, savePdfEdits } from "@/actions/tickets";
import type { PdfEdit } from "@/lib/tickets/pdf-edits";
import { queryKeys } from "@/lib/query/keys";
import { cn } from "@/lib/utils";
import { CheckCircle, FileDown, Loader2, FileText } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const PDF_PANEL_STORAGE_KEY = "tikalo:pdf-panel";

// pdfjs is browser-only; keep it out of SSR and out of the main bundle.
const MaritimePdfEditor = dynamic(
  () => import("./pdf-editor/MaritimePdfEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 grid place-items-center py-16">
        <Loader2 className="size-6 animate-spin text-brand" />
      </div>
    ),
  },
);

interface TicketEditorProps {
  ticket: TicketDetail;
  version: TicketVersion;
  onUnsavedChangesChange: (hasChanges: boolean) => void;
}

export function TicketEditor({
  ticket,
  version,
  onUnsavedChangesChange,
}: TicketEditorProps) {
  const queryClient = useQueryClient();
  const formRef = useRef<{ getValues: () => Partial<TicketData> } | null>(null);
  const [formDirty, setFormDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  // Maritime PDF editor (feature flag): text edits made on the original PDF.
  // Reset from the server copy whenever another version is selected.
  const [pdfEditsState, setPdfEditsState] = useState({
    versionId: version.id,
    edits: version.pdfEdits ?? [],
    dirty: false,
  });
  if (pdfEditsState.versionId !== version.id) {
    setPdfEditsState({
      versionId: version.id,
      edits: version.pdfEdits ?? [],
      dirty: false,
    });
  }
  const pdfEdits = pdfEditsState.edits;
  const editsDirty = pdfEditsState.dirty;
  const hasUnsavedChanges = formDirty || editsDirty;

  useEffect(() => {
    onUnsavedChangesChange(hasUnsavedChanges);
  }, [hasUnsavedChanges, onUnsavedChangesChange]);

  // Desktop PDF panel state, persisted across visits.
  const [pdfOpen, setPdfOpen] = useState(true);
  const [pdfWide, setPdfWide] = useState(false);
  const panelHydrated = useRef(false);

  useEffect(() => {
    // Read after mount (not in a lazy initializer) so SSR markup matches the
    // client's first render; the one-frame default is invisible in practice.
    try {
      const raw = localStorage.getItem(PDF_PANEL_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { open?: boolean; wide?: boolean };
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPdfOpen(saved.open ?? true);
        setPdfWide(saved.wide ?? false);
      }
    } catch {}
    panelHydrated.current = true;
  }, []);

  useEffect(() => {
    if (!panelHydrated.current) return;
    try {
      localStorage.setItem(
        PDF_PANEL_STORAGE_KEY,
        JSON.stringify({ open: pdfOpen, wide: pdfWide })
      );
    } catch {}
  }, [pdfOpen, pdfWide]);

  const pdfUrl = `https://${process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME}/${version.originalStoragePath}`;

  const handleFormChange = useCallback(
    (_values: Partial<TicketData>, isDirty: boolean) => {
      setFormDirty(isDirty);
    },
    []
  );

  const handleEditsChange = useCallback((edits: PdfEdit[]) => {
    setPdfEditsState((s) => ({ ...s, edits, dirty: true }));
  }, []);

  const invalidateTicket = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticket.id) });
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<TicketData>) => {
      const result = await saveTicket(ticket.id, data);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      setFormDirty(false);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const saveEditsMutation = useMutation({
    mutationFn: async () => {
      const result = await savePdfEdits(ticket.id, version.id, pdfEdits);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      setPdfEditsState((s) => ({ ...s, dirty: false }));
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const result = await confirmTicket(ticket.id);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      toast.success("Ticket confirmed");
      invalidateTicket();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const newTab = window.open("about:blank", "_blank");
      const res = await fetch(`/api/tickets/${ticket.id}/export`, {
        method: "POST",
      });
      if (!res.ok) {
        newTab?.close();
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Export failed");
      }
      const data = await res.json();
      return {
        url: data.url,
        newTab,
        priceOverlay: data.priceOverlay,
        editResult: data.editResult as {
          requested: number;
          applied: number;
          failed: { text: string; reason: string }[];
        } | null,
      };
    },
    onSuccess: ({ url, newTab, priceOverlay, editResult }) => {
      // Maritime resale: warn loudly if we tried to overwrite the carrier's
      // printed price but couldn't, so it never silently ships the old price.
      if (editResult && editResult.failed.length > 0) {
        // Maritime PDF editor: never let an edit silently not ship.
        toast.warning(
          `PDF généré, mais ${editResult.failed.length} modification(s) n'ont pas pu être appliquées : ${editResult.failed
            .map((f) => `« ${f.text} » (${f.reason})`)
            .join(", ")}.`,
        );
      } else if (priceOverlay?.attempted && !priceOverlay.applied) {
        toast.warning(
          `PDF généré, mais le prix imprimé n'a pas pu être remplacé${
            priceOverlay.error ? ` (${priceOverlay.error})` : ""
          }.`,
        );
      } else {
        toast.success("PDF generated");
      }
      if (newTab) newTab.location.href = url;
      invalidateTicket();
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const saveAll = async () => {
    if (formRef.current)
      await saveMutation.mutateAsync(formRef.current.getValues());
    if (editorMode && editsDirty) await saveEditsMutation.mutateAsync();
  };
  const handleConfirm = async () => {
    await saveAll();
    confirmMutation.mutate();
  };
  const handleExport = async () => {
    await saveAll();
    exportMutation.mutate();
  };

  const rawData = version.confirmedData ?? version.extractedData;
  const defaultValues: Partial<TicketData> = migrateTicketData(rawData) ?? {};
  const editorMode =
    ticket.maritimeEditorEnabled && defaultValues.type === "MARITIME";
  const isPending =
    saveMutation.isPending ||
    saveEditsMutation.isPending ||
    confirmMutation.isPending ||
    exportMutation.isPending;

  const fileName = version.originalFileName?.split("/").pop() ?? "PDF";

  return (
    <div className="flex flex-col flex-1 lg:min-h-0">
      {editorMode ? (
        // Maritime PDF editor (feature flag): the PDF itself is the editing
        // surface, so it takes the full width — no details form, no source
        // panel. Extracted data still feeds lists/search/Excel untouched.
        <div className="paper flex-1 flex flex-col h-[75vh] lg:h-auto lg:min-h-0 overflow-hidden">
          <MaritimePdfEditor
            ticketId={ticket.id}
            versionId={version.id}
            edits={pdfEdits}
            onEditsChange={handleEditsChange}
            disabled={isPending}
          />
        </div>
      ) : (
        <div
          className={cn(
            "flex-1 lg:min-h-0 grid grid-cols-1 gap-4 lg:gap-5",
            pdfOpen
              ? pdfWide
                ? "lg:grid-cols-[minmax(0,1fr)_minmax(380px,52%)]"
                : "lg:grid-cols-[minmax(0,1fr)_minmax(360px,42%)]"
              : "lg:grid-cols-[minmax(0,1fr)_2.75rem]"
          )}
        >
          {/* Form column */}
          <div className="paper flex flex-col lg:min-h-0 overflow-hidden">
            <div className="flex-1 lg:min-h-0 lg:overflow-y-auto">
              <div className="max-w-3xl mx-auto">
                <TicketFieldsForm
                  key={version.id}
                  defaultValues={defaultValues}
                  onChange={handleFormChange}
                  formRef={formRef}
                />
              </div>
            </div>
          </div>

          {/* Source PDF column — desktop only */}
          <div className="hidden lg:flex lg:flex-col lg:min-h-0">
            <PdfSourcePanel
              pdfUrl={pdfUrl}
              fileName={fileName}
              versionNumber={version.versionNumber}
              open={pdfOpen}
              wide={pdfWide}
              onToggleOpen={() => setPdfOpen((v) => !v)}
              onToggleWide={() => setPdfWide((v) => !v)}
            />
          </div>
        </div>
      )}

      {/* On-demand source PDF — slide-over */}
      <Sheet open={previewOpen} onOpenChange={setPreviewOpen}>
        <SheetContent side="right" className="p-0">
          <SheetHeader>
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="size-4 text-muted-foreground shrink-0" />
              <SheetTitle className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground truncate">
                Source · {fileName}
              </SheetTitle>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground/70 mr-9">
              v{version.versionNumber}
            </span>
          </SheetHeader>
          <iframe
            src={pdfUrl}
            className="flex-1 w-full bg-muted/20"
            title="Source PDF"
          />
        </SheetContent>
      </Sheet>

      {/* Action bar — static footer on desktop, sticky on mobile */}
      <div className="shrink-0 mt-3 lg:mt-4 paper p-3 flex flex-wrap items-center gap-2 sticky bottom-3 z-20 lg:static lg:bottom-auto lg:z-auto">
        <div className="text-[12px] text-muted-foreground hidden sm:flex items-center gap-2">
          {hasUnsavedChanges ? (
            <>
              <span className="size-1.5 rounded-full bg-brand animate-pulse" />
              <span>Changes will save automatically when you confirm or export.</span>
            </>
          ) : (
            <>
              <span className="size-1.5 rounded-full bg-[oklch(0.62_0.12_160)]" />
              <span>All changes captured.</span>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setPreviewOpen(true)}
            hidden={editorMode}
            className="lg:hidden h-9 px-4 rounded-xl border border-border bg-background hover:bg-muted hover:text-foreground transition-colors text-sm font-medium text-muted-foreground inline-flex items-center gap-2 cursor-pointer"
          >
            <FileText className="size-4" />
            <span className="hidden sm:inline">Source PDF</span>
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              (!version.confirmedData &&
                !version.extractedData &&
                !hasUnsavedChanges) ||
              isPending
            }
            className="h-9 px-4 rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-105 transition-all text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle className="size-4" />
            )}
            Confirm
          </button>
          <button
            onClick={handleExport}
            disabled={ticket.status === "DRAFT" || isPending}
            className="h-9 px-4 rounded-xl border border-brand/40 bg-brand-soft/50 hover:bg-brand-soft transition-colors text-sm font-medium text-brand inline-flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exportMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}
            Export PDF
          </button>
        </div>
      </div>
    </div>
  );
}
