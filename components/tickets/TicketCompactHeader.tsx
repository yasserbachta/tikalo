"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TicketDetail, TicketVersion } from "@/types/tickets";
import { TicketStatusBadge } from "./TicketStatusBadge";
import { TicketVersionHistory } from "./TicketVersionHistory";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TicketCompactHeaderProps {
  ticket: TicketDetail;
  version: TicketVersion | undefined;
  selectedVersionIndex: number;
  onVersionChange: (index: number) => void;
  hasUnsavedChanges: boolean;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function TicketCompactHeader({
  ticket,
  version,
  selectedVersionIndex,
  onVersionChange,
  hasUnsavedChanges,
}: TicketCompactHeaderProps) {
  const reference =
    ticket.reference ?? `Ref ${ticket.id.slice(0, 8).toUpperCase()}`;

  return (
    <header className="shrink-0 flex items-center gap-x-3 gap-y-2 flex-wrap reveal">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1.5 text-[12px] font-mono uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground transition-colors group"
      >
        <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
        Tickets
      </Link>

      <span className="h-5 w-px bg-border" aria-hidden="true" />

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            render={
              <h1 className="display text-lg lg:text-xl font-medium leading-none cursor-default">
                {reference}
              </h1>
            }
          />
          <TooltipContent side="bottom" align="start">
            <div className="font-mono text-[11px] leading-relaxed py-0.5">
              <p>ID · {ticket.id.slice(0, 12).toUpperCase()}</p>
              <p>
                {ticket.versions.length}{" "}
                {ticket.versions.length === 1 ? "version" : "versions"} on file
              </p>
              <p>Created {formatDate(ticket.createdAt)}</p>
              <p>Updated {formatDate(ticket.updatedAt)}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {version && (
        <TicketStatusBadge
          status={ticket.status}
          extractionStatus={version.extractionStatus}
        />
      )}

      {hasUnsavedChanges && (
        <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand">
          <span className="size-1.5 rounded-full bg-brand animate-pulse" />
          Unsaved
        </span>
      )}

      <div className="ml-auto flex items-center gap-3">
        <p className="hidden xl:block text-[11px] font-mono text-muted-foreground tabular-nums">
          Created {formatDate(ticket.createdAt)} · Updated{" "}
          {formatDate(ticket.updatedAt)}
        </p>
        {ticket.versions.length > 1 && (
          <TicketVersionHistory
            versions={ticket.versions}
            selectedIndex={selectedVersionIndex}
            onVersionChange={onVersionChange}
          />
        )}
      </div>
    </header>
  );
}
