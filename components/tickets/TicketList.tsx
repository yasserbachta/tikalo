"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { deleteTicket as deleteTicketAction } from "@/actions/tickets";
import { queryKeys } from "@/lib/query/keys";
import {
  Search,
  Upload,
  FileSpreadsheet,
  Trash2,
  ArrowRight,
  Plane,
  Ship,
  Inbox,
  X,
  ChevronRight,
  Building2,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTicketsQuery } from "@/hooks/use-query-tickets";
import { TicketListItem } from "@/types/tickets";
import { cn } from "@/lib/utils";

interface AgencyOption {
  id: string;
  name: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const TICKET_TYPE_LABELS: Record<string, string> = {
  ONE_WAY: "One-way",
  ROUND_TRIP: "Round trip",
  MULTI_LEG: "Multi-leg",
  MARITIME: "Maritime",
};

const STATUS_FILTERS = [
  { value: "", label: "All", hint: "Everything" },
  { value: "DRAFT", label: "Drafts", hint: "In progress" },
  { value: "CONFIRMED", label: "Confirmed", hint: "Ready to issue" },
  { value: "EXPORTED", label: "Exported", hint: "Dispatched" },
];

const ALL_AGENCIES = "__all__";

function TicketList({
  isSuperAdmin = false,
  agencies = [],
}: {
  isSuperAdmin?: boolean;
  agencies?: AgencyOption[];
}) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [agencyId, setAgencyId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const { data: tickets, isLoading } = useTicketsQuery({
    search: debouncedSearch,
    status,
    agencyId: isSuperAdmin ? agencyId : undefined,
  });

  const showAgency = isSuperAdmin && agencies.length > 0;
  const columnCount = showAgency ? 8 : 7;

  const { mutate: deleteTicket, isPending: isDeleting } = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteTicketAction(id);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tickets() });
      toast.success("Ticket archived");
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error("Could not archive ticket");
    },
  });

  const handleExportExcel = async () => {
    try {
      toast.loading("Preparing manifest…", { id: "export-excel" });
      const res = await fetch("/api/tickets/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(status && status !== "all" ? { status } : {}),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tickets-manifest-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Manifest ready", { id: "export-excel" });
    } catch {
      toast.error("Export failed", { id: "export-excel" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] px-3 h-10 rounded-xl bg-card border border-border focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15 transition-all">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search passenger, PNR, route…"
            className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted border border-border">
          {STATUS_FILTERS.map((f) => {
            const active = status === f.value;
            return (
              <button
                key={f.value || "all"}
                onClick={() => setStatus(f.value)}
                title={f.hint}
                className={cn(
                  "px-3 h-8 rounded-lg text-[12px] font-medium tracking-wide transition-all cursor-pointer",
                  active
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {showAgency && (
          <Select
            value={agencyId || ALL_AGENCIES}
            onValueChange={(v) => setAgencyId(!v || v === ALL_AGENCIES ? "" : v)}
          >
            <SelectTrigger className="h-10 min-w-[180px] rounded-xl bg-card">
              <Building2 className="size-4 text-muted-foreground shrink-0" />
              <SelectValue placeholder="All agencies" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AGENCIES}>All agencies</SelectItem>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleExportExcel}
            className="h-10 px-3.5 rounded-xl border border-border bg-card hover:bg-muted transition-colors text-sm font-medium inline-flex items-center gap-2 cursor-pointer"
          >
            <FileSpreadsheet className="size-4 text-muted-foreground" />
            Manifest
          </button>
          <Link
            href="/tickets/upload"
            className="group h-10 px-4 rounded-xl bg-brand text-white hover:bg-brand/90 transition-colors text-sm font-medium inline-flex items-center gap-2 cursor-pointer shadow-sm shadow-brand/20"
          >
            <Upload className="size-4" />
            New ticket
            <ArrowRight className="size-3.5 nudge-right opacity-70" />
          </Link>
        </div>
      </div>

      {/* Tickets table */}
      <div className="paper overflow-hidden p-0">
        {isLoading ? (
          <TicketTable showAgency={showAgency}>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={columnCount}>
                  <div className="h-9 animate-pulse rounded-md bg-muted/70" />
                </TableCell>
              </TableRow>
            ))}
          </TicketTable>
        ) : !tickets?.length ? (
          <EmptyState search={search} status={status || agencyId} />
        ) : (
          <TicketTable showAgency={showAgency}>
            {tickets.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                showAgency={showAgency}
                onOpen={() => router.push(`/tickets/${t.id}`)}
                onDelete={() => setDeleteTarget(t.id)}
              />
            ))}
          </TicketTable>
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Archive this ticket?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently retire the ticket and every revision. The
              passenger record cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => deleteTarget && deleteTicket(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archive forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function TicketTable({
  children,
  showAgency = false,
}: {
  children: React.ReactNode;
  showAgency?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-border">
          <TableHead className="pl-5">Passenger</TableHead>
          {showAgency && <TableHead>Agency</TableHead>}
          <TableHead>PNR</TableHead>
          <TableHead className="hidden lg:table-cell">Type</TableHead>
          <TableHead>Route</TableHead>
          <TableHead className="hidden md:table-cell">Departure</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="pr-5 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

function TicketRow({
  ticket,
  showAgency = false,
  onOpen,
  onDelete,
}: {
  ticket: TicketListItem;
  showAgency?: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const isMaritime = ticket.type === "MARITIME";
  const TransportIcon = isMaritime ? Ship : Plane;
  const [origin, destination] = (ticket.routeSummary ?? "")
    .split(/[→\->]+/)
    .map((s) => s.trim());

  return (
    <TableRow
      onClick={onOpen}
      className="group cursor-pointer border-border"
    >
      {/* Passenger */}
      <TableCell className="pl-5 py-3">
        <div className="flex items-center gap-3">
          <span className="size-8 rounded-lg bg-muted grid place-items-center shrink-0">
            <TransportIcon className="size-4 text-brand" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate max-w-[180px] group-hover:text-brand transition-colors">
              {ticket.passengerName ?? "Unnamed passenger"}
            </p>
            <p className="text-[11px] text-muted-foreground lg:hidden">
              {ticket.type ? TICKET_TYPE_LABELS[ticket.type] ?? ticket.type : "—"}
            </p>
          </div>
        </div>
      </TableCell>

      {/* Agency (super-admin only) */}
      {showAgency && (
        <TableCell>
          {ticket.agency ? (
            <span className="inline-flex items-center gap-1.5 text-sm text-foreground">
              <Building2 className="size-3.5 text-muted-foreground shrink-0" />
              <span className="truncate max-w-[160px]">{ticket.agency.name}</span>
            </span>
          ) : (
            <span className="text-sm text-muted-foreground/60 italic">—</span>
          )}
        </TableCell>
      )}

      {/* PNR */}
      <TableCell>
        <span className="font-mono text-[12px] text-muted-foreground">
          {ticket.reference ?? ticket.id.slice(0, 6).toUpperCase()}
        </span>
      </TableCell>

      {/* Type */}
      <TableCell className="hidden lg:table-cell">
        <span className="text-sm text-muted-foreground">
          {ticket.type ? TICKET_TYPE_LABELS[ticket.type] ?? ticket.type : "—"}
        </span>
      </TableCell>

      {/* Route */}
      <TableCell>
        {origin && destination ? (
          <div className="flex items-center gap-1.5 font-mono text-[13px] tracking-tight">
            <span className="text-foreground">{toIata(origin)}</span>
            <ArrowRight className="size-3 text-muted-foreground/50" />
            <span className="text-foreground">{toIata(destination)}</span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground/60 italic">—</span>
        )}
      </TableCell>

      {/* Departure */}
      <TableCell className="hidden md:table-cell">
        <span className="font-mono text-[12px] text-muted-foreground">
          {ticket.departureDate ?? "—"}
        </span>
      </TableCell>

      {/* Status */}
      <TableCell>
        <StatusBadge
          status={ticket.status}
          extractionStatus={ticket.extractionStatus}
        />
      </TableCell>

      {/* Actions */}
      <TableCell className="pr-5 text-right">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="size-8 grid place-items-center rounded-lg text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            aria-label="Archive ticket"
          >
            <Trash2 className="size-4" />
          </button>
          <span className="size-8 grid place-items-center rounded-lg text-muted-foreground/50 group-hover:text-brand transition-colors">
            <ChevronRight className="size-4" />
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}

function toIata(segment: string) {
  const match = segment.match(/\(([A-Z]{3})\)|([A-Z]{3})/);
  return (match?.[1] || match?.[2] || segment.slice(0, 3)).toUpperCase();
}

function StatusBadge({
  status,
  extractionStatus,
}: {
  status: "DRAFT" | "CONFIRMED" | "EXPORTED";
  extractionStatus: string | null;
}) {
  if (extractionStatus === "PROCESSING") {
    return (
      <span className="stamp border-brand/25 bg-brand-soft text-brand">
        <span className="size-1.5 rounded-full bg-brand animate-pulse" />
        Extracting
      </span>
    );
  }
  if (extractionStatus === "FAILED") {
    return (
      <span className="stamp border-destructive/30 bg-destructive/10 text-destructive">
        Failed
      </span>
    );
  }
  const map = {
    DRAFT: {
      cls: "border-sunset/30 bg-sunset-soft/50 text-[oklch(0.42_0.14_55)]",
      label: "Draft",
    },
    CONFIRMED: {
      cls: "border-tide/30 bg-tide-soft/70 text-[oklch(0.40_0.12_250)]",
      label: "Confirmed",
    },
    EXPORTED: {
      cls: "border-[oklch(0.72_0.13_160)]/30 bg-[oklch(0.94_0.05_160)] text-[oklch(0.38_0.12_160)]",
      label: "Exported",
    },
  };
  const c = map[status];
  return <span className={cn("stamp", c.cls)}>{c.label}</span>;
}

function EmptyState({ search, status }: { search: string; status: string }) {
  const filtered = search || status;
  return (
    <div className="p-12 lg:p-16 text-center">
      <div className="mx-auto size-14 rounded-2xl border border-border bg-muted grid place-items-center mb-4">
        <Inbox className="size-6 text-brand" />
      </div>
      <h3 className="display text-xl font-medium mb-2">
        {filtered ? "No matching tickets" : "No tickets yet"}
      </h3>
      <p className="text-muted-foreground text-[14px] max-w-md mx-auto mb-6">
        {filtered
          ? "Try a different search or clear the filter to see everything."
          : "Upload a PDF ticket and we'll extract the details — passengers, segments, fees and all."}
      </p>
      {!filtered && (
        <Link
          href="/tickets/upload"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors cursor-pointer group shadow-sm shadow-brand/20"
        >
          <Upload className="size-4" />
          Upload your first ticket
          <ArrowRight className="size-4 nudge-right" />
        </Link>
      )}
    </div>
  );
}

export default TicketList;
