"use client";

import { useState, useEffect, useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { supabase } from "@/lib/supabase-client";
import { uploadTicketPdf } from "@/lib/tickets/client-upload";
import { useTicketDetailQuery } from "@/hooks/use-query-tickets";
import { queryKeys } from "@/lib/query/keys";
import type { TicketDetail, TicketVersion } from "@/types/tickets";
import { TicketEditor } from "./TicketEditor";
import { TicketCompactHeader } from "./TicketCompactHeader";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Upload,
  Sparkles,
  Compass,
} from "lucide-react";
import { PageContainer } from "@/components/layout/AppShell";

interface TicketDetailViewProps {
  ticketId: string;
}

export function TicketDetailView({ ticketId }: TicketDetailViewProps) {
  const queryClient = useQueryClient();
  const { data: ticket, isLoading, isError } = useTicketDetailQuery(ticketId);
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const version = ticket?.versions[selectedVersionIndex];

  useEffect(() => {
    if (!version || version.extractionStatus !== "PROCESSING") return;
    const channel = supabase
      .channel(`version-${version.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "TicketVersion",
          filter: `id=eq.${version.id}`,
        },
        (payload) => {
          const row = payload.new as Partial<TicketVersion>;
          if (!row.extractionStatus || row.extractionStatus === "PROCESSING") {
            return;
          }
          // Show the extracted fields straight from the realtime row instead
          // of waiting for a refetch round-trip; the refetch below reconciles.
          queryClient.setQueryData<TicketDetail>(
            queryKeys.ticket(ticketId),
            (old) =>
              old && {
                ...old,
                versions: old.versions.map((v) =>
                  v.id === row.id
                    ? {
                        ...v,
                        extractionStatus: row.extractionStatus!,
                        extractedData: row.extractedData ?? v.extractedData,
                        modelUsed: row.modelUsed ?? v.modelUsed,
                        wasRetried: row.wasRetried ?? v.wasRetried,
                        processingMs: row.processingMs ?? v.processingMs,
                      }
                    : v,
                ),
              },
          );
          queryClient.invalidateQueries({
            queryKey: queryKeys.ticket(ticketId),
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [version?.id, version?.extractionStatus, ticketId, queryClient]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges]);

  const reuploadMutation = useMutation({
    mutationFn: (file: File) => uploadTicketPdf(file, { ticketId }),
    onSuccess: () => {
      toast.success("New version uploaded", { position: "top-center" });
      queryClient.invalidateQueries({ queryKey: queryKeys.ticket(ticketId) });
      setSelectedVersionIndex(0);
    },
    onError: (err: Error) => {
      toast.error(err.message, { position: "top-center" });
    },
  });

  const handleRetryFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    reuploadMutation.mutate(file);
    e.target.value = "";
  };

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1400px] px-5 lg:px-8 py-4 lg:py-5 flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden reveal">
        <div className="shrink-0 h-9 w-72 bg-muted/60 rounded-full animate-pulse" />
        <div className="flex-1 min-h-0 mt-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,42%)] gap-4 lg:gap-5">
          <div className="paper animate-pulse h-[480px] lg:h-auto" />
          <div className="paper animate-pulse hidden lg:block" />
        </div>
      </div>
    );
  }

  if (isError || !ticket) {
    return (
      <PageContainer>
        <Link
          href="/tickets"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="size-4" />
          Back to tickets
        </Link>
        <div className="paper p-12 text-center">
          <AlertTriangle className="size-10 text-destructive mx-auto mb-3" />
          <h2 className="display text-xl mb-2">Could not load this ticket</h2>
          <p className="text-muted-foreground text-sm">
            We couldn&apos;t retrieve this ticket. Please try again.
          </p>
        </div>
      </PageContainer>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 lg:px-8 py-4 lg:py-5 flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
      <TicketCompactHeader
        ticket={ticket}
        version={version}
        selectedVersionIndex={selectedVersionIndex}
        onVersionChange={setSelectedVersionIndex}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      <div className="flex-1 min-h-0 mt-3 lg:mt-4 flex flex-col">
        {version && version.extractionStatus === "PROCESSING" && (
          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto grid place-items-center py-6">
            <div className="paper relative overflow-hidden p-8 lg:p-10 text-center grain max-w-lg w-full">
              <div className="relative">
                <div className="mx-auto size-16 rounded-2xl bg-gradient-to-br from-brand-soft to-brand/40 grid place-items-center mb-5">
                  <Compass className="size-7 text-brand compass" />
                </div>
                <p className="eyebrow text-brand mb-2">Extracting</p>
                <h3 className="display text-2xl font-medium mb-2">
                  Reading your ticket
                </h3>
                <p className="text-muted-foreground text-sm max-w-md mx-auto">
                  Passengers, segments, fees — every detail is being lifted from
                  the PDF. This page will turn the moment we&apos;re done.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 text-[12px] font-mono uppercase tracking-wider text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin text-brand" />
                  Live · auto-refresh
                </div>
              </div>
            </div>
          </div>
        )}

        {version && version.extractionStatus === "FAILED" && (
          <div className="flex-1 lg:min-h-0 lg:overflow-y-auto grid place-items-center py-6">
            <div className="paper p-8 lg:p-10 text-center max-w-lg w-full">
              <div className="mx-auto size-16 rounded-2xl bg-destructive/10 grid place-items-center mb-5">
                <AlertTriangle className="size-7 text-destructive" />
              </div>
              <p className="eyebrow text-destructive mb-2">Extraction failed</p>
              <h3 className="display text-2xl font-medium mb-2">
                We couldn&apos;t read this ticket
              </h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
                The PDF may be scanned at low quality or password-protected. Try
                uploading a sharper copy.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={reuploadMutation.isPending}
                className="group inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:brightness-105 transition-all disabled:opacity-50 cursor-pointer"
              >
                {reuploadMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Upload a new version
                <Sparkles className="size-3.5 text-primary-foreground/80" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleRetryFileSelect}
              />
            </div>
          </div>
        )}

        {version &&
          (version.extractionStatus === "EXTRACTED" ||
            version.confirmedData) && (
            <TicketEditor
              ticket={ticket}
              version={version}
              onUnsavedChangesChange={setHasUnsavedChanges}
            />
          )}
      </div>
    </div>
  );
}
