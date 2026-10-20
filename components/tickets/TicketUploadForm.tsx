"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  X,
  Loader2,
  CheckCircle2,
  ScanLine,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { uploadTicketPdf } from "@/lib/tickets/client-upload";
import { MAX_FILE_SIZE } from "@/lib/tickets/upload-constants";

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STEPS = [
  { icon: Upload, label: "Drop", hint: "PDF ticket" },
  { icon: ScanLine, label: "Extract", hint: "We read it" },
  { icon: Sparkles, label: "Refine", hint: "You polish" },
  { icon: CheckCircle2, label: "Dispatch", hint: "Export PDF" },
];

export default function TicketUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSet = (next: File) => {
    if (next.type !== "application/pdf") {
      toast.error("Only PDF tickets are accepted");
      return;
    }
    if (next.size > MAX_FILE_SIZE) {
      toast.error("File too large — 10MB max");
      return;
    }
    setFile(next);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) validateAndSet(dropped);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSet(selected);
  };

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadTicketPdf(file) as Promise<{
        ticketId: string;
        versionId: string;
        status: string;
      }>,
    onSuccess: (data) => {
      toast.success("Ticket received — extraction in progress");
      router.push(`/tickets/${data.ticketId}`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const activeStep = uploadMutation.isPending ? 1 : file ? 0 : 0;

  return (
    <div className="space-y-8">
      {/* Stepper */}
      <div className="paper px-4 lg:px-6 py-5">
        <div className="grid grid-cols-4 gap-2 lg:gap-4">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = i === activeStep;
            const done = i < activeStep || uploadMutation.isSuccess;
            return (
              <div
                key={s.label}
                className="flex items-center gap-2 lg:gap-3 relative"
              >
                <div
                  className={cn(
                    "size-9 lg:size-10 rounded-xl grid place-items-center shrink-0 transition-all",
                    active
                      ? "bg-foreground text-background ring-4 ring-brand/30"
                      : done
                      ? "bg-brand-soft text-brand"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 hidden lg:block">
                  <p
                    className={cn(
                      "text-[10px] font-mono uppercase tracking-[0.2em]",
                      active ? "text-brand" : "text-muted-foreground"
                    )}
                  >
                    Step 0{i + 1}
                  </p>
                  <p
                    className={cn(
                      "text-[14px] font-medium leading-tight mt-0.5",
                      active || done ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {s.label}
                  </p>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 hidden lg:block w-4 h-px bg-border" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "relative overflow-hidden group cursor-pointer rounded-3xl border-2 border-dashed transition-all duration-300 px-6 py-12 lg:py-16 text-center",
          isDragActive
            ? "border-brand bg-brand-soft/40 scale-[1.005]"
            : "border-border hover:border-brand/60 bg-card"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileInput}
        />

        {/* Decorative crosshair */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, currentColor 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
        {/* corners */}
        {[
          "top-4 left-4",
          "top-4 right-4 rotate-90",
          "bottom-4 right-4 rotate-180",
          "bottom-4 left-4 -rotate-90",
        ].map((pos) => (
          <span
            key={pos}
            aria-hidden
            className={cn(
              "absolute size-5 border-l-2 border-t-2 border-brand/40 transition-colors",
              pos,
              isDragActive && "border-brand"
            )}
          />
        ))}

        <div className="relative">
          <div
            className={cn(
              "mx-auto size-16 rounded-2xl bg-gradient-to-br from-brand-soft to-brand/30 grid place-items-center mb-5 transition-transform duration-300",
              isDragActive && "scale-110 rotate-[-3deg]"
            )}
          >
            <Upload className="size-7 text-brand" />
          </div>
          <p className="eyebrow text-brand mb-3">Upload</p>
          <h3 className="display text-2xl lg:text-[1.8rem] font-medium mb-2 leading-snug">
            {isDragActive ? (
              <>Release to begin extraction</>
            ) : (
              <>
                Drop a ticket PDF, or{" "}
                <span className="italic underline decoration-brand decoration-2 underline-offset-[6px]">
                  browse
                </span>
              </>
            )}
          </h3>
          <p className="text-muted-foreground text-[14px] max-w-md mx-auto">
            One PDF, up to 10MB. We accept e-tickets from any airline or
            maritime carrier. Your file is encrypted in transit.
          </p>

          <div className="mt-6 flex items-center justify-center gap-3 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <span>PDF only</span>
            <span className="size-1 rounded-full bg-border" />
            <span>10MB max</span>
            <span className="size-1 rounded-full bg-border" />
            <span>Single file</span>
          </div>
        </div>
      </div>

      {/* Selected file */}
      {file && (
        <div className="paper p-4 flex items-center gap-4 reveal">
          <div className="size-12 rounded-xl bg-gradient-to-br from-brand-soft to-brand/30 grid place-items-center shrink-0">
            <FileText className="size-5 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate text-foreground">
              {file.name}
            </p>
            <p className="text-[12px] font-mono text-muted-foreground mt-0.5">
              {formatFileSize(file.size)} · ready for extraction
            </p>
          </div>
          <button
            onClick={() => setFile(null)}
            disabled={uploadMutation.isPending}
            className="size-9 grid place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Remove file"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Action */}
      <button
        onClick={() => file && uploadMutation.mutate(file)}
        disabled={!file || uploadMutation.isPending}
        className="group w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm tracking-wide inline-flex items-center justify-center gap-2 shadow-sm hover:brightness-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {uploadMutation.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Extracting your ticket…
          </>
        ) : (
          <>
            Begin extraction
            <ArrowRight className="size-4 nudge-right" />
          </>
        )}
      </button>
    </div>
  );
}
