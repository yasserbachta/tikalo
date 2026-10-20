"use client";

import { cn } from "@/lib/utils";
import { TicketStatus, ExtractionStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";

const ticketStatusConfig: Record<
  TicketStatus,
  { label: string; className: string }
> = {
  DRAFT: {
    label: "Draft",
    className:
      "border-sunset/30 bg-sunset-soft/50 text-[oklch(0.42_0.14_55)]",
  },
  CONFIRMED: {
    label: "Confirmed",
    className: "border-tide/30 bg-tide-soft/60 text-[oklch(0.38_0.10_250)]",
  },
  EXPORTED: {
    label: "Exported",
    className:
      "border-[oklch(0.72_0.13_160)]/30 bg-[oklch(0.94_0.05_160)] text-[oklch(0.38_0.12_160)]",
  },
};

const extractionStatusConfig: Record<
  "PROCESSING" | "FAILED",
  { label: string; className: string }
> = {
  PROCESSING: {
    label: "Extracting",
    className: "border-brand/30 bg-brand-soft text-[oklch(0.50_0.18_33)]",
  },
  FAILED: {
    label: "Failed",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
  },
};

interface TicketStatusBadgeProps {
  status: TicketStatus;
  extractionStatus: ExtractionStatus | null;
}

export function TicketStatusBadge({
  status,
  extractionStatus,
}: TicketStatusBadgeProps) {
  if (extractionStatus === "PROCESSING" || extractionStatus === "FAILED") {
    const config = extractionStatusConfig[extractionStatus];
    return (
      <span className={cn("stamp", config.className)}>
        {extractionStatus === "PROCESSING" && (
          <Loader2 className="size-3 animate-spin" />
        )}
        {config.label}
      </span>
    );
  }
  const config = ticketStatusConfig[status];
  return <span className={cn("stamp", config.className)}>{config.label}</span>;
}
