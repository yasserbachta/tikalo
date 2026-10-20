"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Building2,
  ArrowRight,
  Search,
  X,
  ChevronRight,
  ChevronUp,
  ChevronDown,
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
import { PageContainer, PageHeader } from "@/components/layout/AppShell";
import { cn } from "@/lib/utils";
import { queryKeys } from "@/lib/query/keys";
import { fetchJson } from "@/lib/query/fetcher";
import { deleteAgency as deleteAgencyAction } from "@/actions/agencies";

const CDN_HOST = process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME;

interface Agency {
  id: string;
  name: string;
  email: string;
  slug: string;
  status: "ACTIVE" | "SUSPENDED";
  primaryColor: string;
  logoPath: string | null;
  createdAt: string;
  _count: { users: number; tickets: number };
}

type SortKey = "name" | "users" | "tickets" | "createdAt";
type SortDir = "asc" | "desc";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

const STATUS_FILTERS = [
  { value: "", label: "All", hint: "Every tenant" },
  { value: "ACTIVE", label: "Active", hint: "Currently operating" },
  { value: "SUSPENDED", label: "Suspended", hint: "Wound down" },
] as const;

export function AgenciesView() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "ACTIVE" | "SUSPENDED">("");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "createdAt",
    dir: "desc",
  });
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const debouncedSearch = useDebounce(search, 250);

  const { data: agencies, isLoading } = useQuery<Agency[]>({
    queryKey: queryKeys.agencies(),
    queryFn: () => fetchJson<Agency[]>("/api/admin/agencies"),
  });

  const { mutate: deleteAgency, isPending: isDeleting } = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteAgencyAction(id);
      if (!result.ok) throw new Error(result.error);
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agencies() });
      toast.success("Agency dismantled");
      setDeleteTarget(null);
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const totals = {
    agencies: agencies?.length ?? 0,
    active: agencies?.filter((a) => a.status === "ACTIVE").length ?? 0,
    users: agencies?.reduce((s, a) => s + a._count.users, 0) ?? 0,
    tickets: agencies?.reduce((s, a) => s + a._count.tickets, 0) ?? 0,
  };

  const filtered = useMemo(() => {
    if (!agencies) return [];
    const q = debouncedSearch.trim().toLowerCase();
    const rows = agencies.filter((a) => {
      if (status && a.status !== status) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.email.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q)
      );
    });

    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "users":
          return (a._count.users - b._count.users) * dir;
        case "tickets":
          return (a._count.tickets - b._count.tickets) * dir;
        case "createdAt":
          return (
            (new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime()) *
            dir
          );
        default:
          return 0;
      }
    });
  }, [agencies, debouncedSearch, status, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "name" ? "asc" : "desc" }
    );
  };

  const isFiltered = Boolean(search || status);

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Operations"
        title={
          <>
            Manage <span className="text-brand">agencies</span>
          </>
        }
        description="Each agency is a self-contained workspace — its own team, its own tickets. Create new tenants, monitor activity, or wind them down."
        actions={
          <Link
            href="/admin/agencies/new"
            className="group h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center gap-2 shadow-sm hover:brightness-105 transition-all cursor-pointer"
          >
            <Plus className="size-4" /> New agency
            <ArrowRight className="size-3.5 nudge-right opacity-60" />
          </Link>
        }
      />

      <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Agencies" value={totals.agencies} loading={isLoading} hint="Tenants" />
        <Stat label="Active" value={totals.active} loading={isLoading} hint="Currently operating" />
        <Stat label="Operators" value={totals.users} loading={isLoading} hint="Across all agencies" />
        <Stat label="Itineraries" value={totals.tickets} loading={isLoading} hint="Tickets handled" />
      </div>

      {/* Toolbar */}
      <div className="mt-8 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] px-3 h-10 rounded-xl bg-card border border-border focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15 transition-all">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or slug…"
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

        <p className="ml-auto text-[12px] text-muted-foreground tabular-nums">
          {isLoading
            ? "—"
            : isFiltered
              ? `${filtered.length} of ${totals.agencies} agencies`
              : `${totals.agencies} agencies`}
        </p>
      </div>

      {/* Agencies table */}
      <div className="mt-4 paper overflow-hidden p-0">
        {isLoading ? (
          <AgencyTable sort={sort} onSort={toggleSort}>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={7}>
                  <div className="h-9 animate-pulse rounded-md bg-muted/70" />
                </TableCell>
              </TableRow>
            ))}
          </AgencyTable>
        ) : !filtered.length ? (
          <EmptyState filtered={isFiltered} />
        ) : (
          <AgencyTable sort={sort} onSort={toggleSort}>
            {filtered.map((a) => (
              <AgencyRow
                key={a.id}
                agency={a}
                onOpen={() => router.push(`/admin/agencies/${a.id}`)}
                onDelete={() => setDeleteTarget(a.id)}
              />
            ))}
          </AgencyTable>
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">
              Dismantle this agency?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the agency and every user account inside it.
              Agencies with active tickets cannot be deleted — suspend
              them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={() => deleteTarget && deleteAgency(deleteTarget)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Dismantle
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function Stat({
  label,
  value,
  hint,
  loading,
}: {
  label: string;
  value: number;
  hint: string;
  loading: boolean;
}) {
  return (
    <div className="paper p-5 reveal">
      <p className="eyebrow">{label}</p>
      <p className="display text-3xl mt-1 font-medium tabular-nums">
        {loading ? "—" : value}
      </p>
      <p className="text-[12px] text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 cursor-pointer transition-colors hover:text-foreground",
          active ? "text-foreground" : ""
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUp className="size-3.5" />
          ) : (
            <ChevronDown className="size-3.5" />
          )
        ) : (
          <ChevronDown className="size-3.5 opacity-25" />
        )}
      </button>
    </TableHead>
  );
}

function AgencyTable({
  children,
  sort,
  onSort,
}: {
  children: React.ReactNode;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent border-border">
          <SortHeader
            label="Agency"
            sortKey="name"
            sort={sort}
            onSort={onSort}
            className="pl-5"
          />
          <TableHead className="hidden md:table-cell">Email</TableHead>
          <TableHead>Status</TableHead>
          <SortHeader
            label="Operators"
            sortKey="users"
            sort={sort}
            onSort={onSort}
            className="hidden md:table-cell"
          />
          <SortHeader
            label="Tickets"
            sortKey="tickets"
            sort={sort}
            onSort={onSort}
            className="hidden md:table-cell"
          />
          <SortHeader
            label="Created"
            sortKey="createdAt"
            sort={sort}
            onSort={onSort}
            className="hidden lg:table-cell"
          />
          <TableHead className="pr-5 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

function AgencyRow({
  agency,
  onOpen,
  onDelete,
}: {
  agency: Agency;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow onClick={onOpen} className="group cursor-pointer border-border">
      {/* Agency */}
      <TableCell className="pl-5 py-3">
        <div className="flex items-center gap-3">
          {agency.logoPath && CDN_HOST ? (
            <span className="size-9 rounded-lg bg-white overflow-hidden shrink-0 ring-1 ring-inset ring-foreground/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://${CDN_HOST}/${agency.logoPath}`}
                alt={`${agency.name} logo`}
                className="size-full object-cover"
              />
            </span>
          ) : (
            <span
              className="size-9 rounded-lg grid place-items-center text-[12px] font-display font-medium shrink-0 ring-1 ring-inset ring-foreground/10"
              style={{
                background: `${agency.primaryColor}1f`,
                color: agency.primaryColor,
              }}
            >
              {agency.name
                .split(/\s+/)
                .map((s) => s[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-medium text-foreground truncate max-w-[220px] group-hover:text-brand transition-colors">
              {agency.name}
            </p>
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70 mt-0.5">
              /{agency.slug}
            </p>
          </div>
        </div>
      </TableCell>

      {/* Email */}
      <TableCell className="hidden md:table-cell">
        <span className="font-mono text-[12px] text-muted-foreground">
          {agency.email}
        </span>
      </TableCell>

      {/* Status */}
      <TableCell>
        <StatusBadge status={agency.status} />
      </TableCell>

      {/* Operators */}
      <TableCell className="hidden md:table-cell">
        <span className="tabular-nums text-sm text-foreground">
          {agency._count.users}
        </span>
      </TableCell>

      {/* Tickets */}
      <TableCell className="hidden md:table-cell">
        <span className="tabular-nums text-sm text-foreground">
          {agency._count.tickets}
        </span>
      </TableCell>

      {/* Created */}
      <TableCell className="hidden lg:table-cell">
        <span className="font-mono text-[12px] text-muted-foreground">
          {new Date(agency.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        </span>
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
            aria-label="Dismantle agency"
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

function StatusBadge({ status }: { status: "ACTIVE" | "SUSPENDED" }) {
  return (
    <span
      className={cn(
        "stamp",
        status === "ACTIVE"
          ? "border-tide/30 bg-tide-soft/70 text-[oklch(0.36_0.08_220)]"
          : "border-destructive/30 bg-destructive/10 text-destructive"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "ACTIVE" ? "bg-tide" : "bg-destructive"
        )}
      />
      {status.toLowerCase()}
    </span>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="p-12 lg:p-16 text-center">
      <div className="mx-auto size-16 rounded-2xl bg-muted grid place-items-center mb-4">
        <Building2 className="size-7 text-muted-foreground" />
      </div>
      <h3 className="display text-2xl mb-2">
        {filtered ? "No matching agencies" : "No agencies yet"}
      </h3>
      <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
        {filtered
          ? "Try a different search or clear the filter to see every tenant."
          : "Create your first tenant to start onboarding travel agencies."}
      </p>
      {!filtered && (
        <Link
          href="/admin/agencies/new"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm hover:brightness-105 transition-all cursor-pointer"
        >
          <Plus className="size-4" /> Provision first agency
        </Link>
      )}
    </div>
  );
}
