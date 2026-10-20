"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  startOfDay,
  subDays,
  isSameDay,
  format,
  formatDistanceToNowStrict,
  parseISO,
} from "date-fns";
import {
  Inbox,
  Clock,
  CheckCircle2,
  Plane,
  Ship,
  ArrowUpRight,
  Upload,
  TrendingUp,
  Route as RouteIcon,
  Activity,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

import { useTicketsQuery } from "@/hooks/use-query-tickets";
import { TicketListItem } from "@/types/tickets";
import { cn } from "@/lib/utils";

// ── Palette (CSS vars so it tracks light/dark) ──────────────────────────────
const C = {
  brand: "var(--brand)",
  amber: "var(--sunset)",
  tide: "var(--tide)",
  emerald: "oklch(0.72 0.13 160)",
  ink: "var(--ink-soft)",
};

const TYPE_META: Record<
  string,
  { label: string; icon: typeof Plane; color: string }
> = {
  ONE_WAY: { label: "One-way", icon: Plane, color: C.brand },
  ROUND_TRIP: { label: "Round trip", icon: Plane, color: C.tide },
  MULTI_LEG: { label: "Multi-leg", icon: Plane, color: C.amber },
  MARITIME: { label: "Maritime", icon: Ship, color: C.emerald },
};

function toIata(segment: string) {
  const match = segment.match(/\(([A-Z]{3})\)|([A-Z]{3})/);
  return (match?.[1] || match?.[2] || segment.slice(0, 3)).toUpperCase();
}

// Hydration-safe "now": server snapshot is null, client snapshot is a single
// stable Date — so server HTML and first client render agree, and date-derived
// charts only fill in after mount (no setState-in-effect, no mismatch).
const subscribeNoop = () => () => {};
function useClientNow(): Date | null {
  const ref = useRef<Date | null>(null);
  return useSyncExternalStore(
    subscribeNoop,
    () => {
      if (!ref.current) ref.current = new Date();
      return ref.current;
    },
    () => null,
  );
}

// ── Aggregation ─────────────────────────────────────────────────────────────
function useMetrics(tickets: TicketListItem[] | undefined, now: Date | null) {
  return useMemo(() => {
    const list = tickets ?? [];
    const total = list.length;
    const drafts = list.filter((t) => t.status === "DRAFT").length;
    const confirmed = list.filter((t) => t.status === "CONFIRMED").length;
    const exported = list.filter((t) => t.status === "EXPORTED").length;
    const processing = list.filter(
      (t) => t.extractionStatus === "PROCESSING",
    ).length;
    const failed = list.filter((t) => t.extractionStatus === "FAILED").length;

    // Itinerary type breakdown
    const byType = Object.keys(TYPE_META).map((key) => ({
      key,
      ...TYPE_META[key],
      count: list.filter((t) => t.type === key).length,
    }));

    // 14-day throughput from createdAt
    const days: { date: Date; label: string; count: number }[] = [];
    let last7 = 0;
    let prev7 = 0;
    if (now) {
      const today = startOfDay(now);
      for (let i = 13; i >= 0; i--) {
        const date = subDays(today, i);
        const count = list.filter((t) =>
          isSameDay(parseISO(t.createdAt), date),
        ).length;
        days.push({ date, label: format(date, "MMM d"), count });
        if (i < 7) last7 += count;
        else prev7 += count;
      }
    }
    const trend =
      prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100);

    // Top routes
    const routeCounts = new Map<string, number>();
    for (const t of list) {
      if (!t.routeSummary) continue;
      routeCounts.set(t.routeSummary, (routeCounts.get(t.routeSummary) ?? 0) + 1);
    }
    const topRoutes = [...routeCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([route, count]) => {
        const [o, d] = route.split(/[→\->]+/).map((s) => s.trim());
        return {
          route,
          count,
          origin: o ? toIata(o) : "—",
          dest: d ? toIata(d) : "—",
        };
      });

    const recent = [...list]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6);

    return {
      total,
      drafts,
      confirmed,
      exported,
      processing,
      failed,
      byType,
      days,
      last7,
      trend,
      topRoutes,
      recent,
    };
  }, [tickets, now]);
}

export default function DashboardView() {
  const { data: tickets } = useTicketsQuery({ search: "", status: "" });

  const now = useClientNow();
  const m = useMetrics(tickets, now);
  const ready = now !== null && tickets !== undefined;

  if (!ready) return <DashboardSkeleton />;

  if (m.total === 0) return <DashboardEmpty />;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={Inbox}
          label="Total tickets"
          value={m.total}
          hint="In the workspace"
          color={C.brand}
        />
        <Kpi
          icon={Clock}
          label="Drafts"
          value={m.drafts}
          hint="Pending review"
          color={C.amber}
          share={m.total ? m.drafts / m.total : 0}
        />
        <Kpi
          icon={CheckCircle2}
          label="Confirmed"
          value={m.confirmed}
          hint="Ready to issue"
          color={C.tide}
          share={m.total ? m.confirmed / m.total : 0}
        />
        <Kpi
          icon={Plane}
          label="Exported"
          value={m.exported}
          hint="Dispatched"
          color={C.emerald}
          share={m.total ? m.exported / m.total : 0}
        />
      </div>

      {/* Throughput + Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="paper p-5 lg:p-6 lg:col-span-2 reveal">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Throughput</p>
              <h3 className="display text-lg font-medium mt-1">Last 14 days</h3>
            </div>
            <TrendPill trend={m.trend} value={m.last7} />
          </div>
          <div className="mt-5">
            <Throughput days={m.days} />
          </div>
        </div>

        <div className="paper p-5 lg:p-6 reveal">
          <p className="eyebrow">Pipeline</p>
          <h3 className="display text-lg font-medium mt-1">Status split</h3>
          <Pipeline
            total={m.total}
            segments={[
              { label: "Drafts", value: m.drafts, color: C.amber },
              { label: "Confirmed", value: m.confirmed, color: C.tide },
              { label: "Exported", value: m.exported, color: C.emerald },
            ]}
          />
        </div>
      </div>

      {/* Type · Health · Routes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="paper p-5 lg:p-6 reveal">
          <p className="eyebrow">Itinerary type</p>
          <h3 className="display text-lg font-medium mt-1 mb-4">By format</h3>
          <div className="space-y-3.5">
            {m.byType.map((t) => (
              <TypeBar
                key={t.key}
                icon={t.icon}
                label={t.label}
                count={t.count}
                share={m.total ? t.count / m.total : 0}
                color={t.color}
              />
            ))}
          </div>
        </div>

        <ExtractionHealth
          total={m.total}
          processing={m.processing}
          failed={m.failed}
        />

        <div className="paper p-5 lg:p-6 reveal">
          <div className="flex items-center gap-2">
            <RouteIcon className="size-4 text-brand" />
            <p className="eyebrow">Top routes</p>
          </div>
          <h3 className="display text-lg font-medium mt-1 mb-4">Most flown</h3>
          {m.topRoutes.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No routes extracted yet.
            </p>
          ) : (
            <div className="space-y-3">
              {m.topRoutes.map((r) => (
                <RouteRow
                  key={r.route}
                  origin={r.origin}
                  dest={r.dest}
                  count={r.count}
                  share={r.count / m.topRoutes[0].count}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="paper p-5 lg:p-6 reveal">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-brand" />
            <div>
              <p className="eyebrow">Activity</p>
              <h3 className="display text-lg font-medium mt-0.5">Latest tickets</h3>
            </div>
          </div>
          <Link
            href="/tickets"
            className="group text-sm font-medium text-brand inline-flex items-center gap-1 hover:gap-1.5 transition-all cursor-pointer"
          >
            View all
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        <ul className="divide-y divide-border">
          {m.recent.map((t) => (
            <RecentRow key={t.id} ticket={t} />
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── KPI card ────────────────────────────────────────────────────────────────
function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  color,
  share,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  hint: string;
  color: string;
  share?: number;
}) {
  return (
    <div className="paper p-5 reveal">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="eyebrow">{label}</p>
          <p className="display text-3xl mt-1 font-medium tabular-nums">{value}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">{hint}</p>
        </div>
        <span
          className="size-9 grid place-items-center rounded-xl shrink-0"
          style={{ background: `color-mix(in oklab, ${color} 14%, transparent)` }}
        >
          <Icon className="size-4" style={{ color }} />
        </span>
      </div>
      {share !== undefined && (
        <div className="mt-4 flex items-center gap-2">
          <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-[width] duration-700"
              style={{ width: `${Math.round(share * 100)}%`, background: color }}
            />
          </div>
          <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
            {Math.round(share * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}

function TrendPill({ trend, value }: { trend: number; value: number }) {
  const up = trend >= 0;
  return (
    <div className="text-right shrink-0">
      <p className="display text-2xl font-medium tabular-nums leading-none">
        {value}
      </p>
      <span
        className={cn(
          "mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium",
          up ? "text-[oklch(0.55_0.13_160)]" : "text-destructive",
        )}
      >
        <TrendingUp className={cn("size-3", !up && "rotate-180")} />
        {up ? "+" : ""}
        {trend}% vs prev 7d
      </span>
    </div>
  );
}

// ── Throughput area chart (bespoke SVG) ─────────────────────────────────────
function Throughput({
  days,
}: {
  days: { date: Date; label: string; count: number }[];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720;
  const H = 200;
  const padX = 8;
  const padY = 24;
  const max = Math.max(1, ...days.map((d) => d.count));
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const step = days.length > 1 ? innerW / (days.length - 1) : 0;

  const pts = days.map((d, i) => ({
    x: padX + i * step,
    y: padY + innerH - (d.count / max) * innerH,
    ...d,
  }));

  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${pts[pts.length - 1].x},${padY + innerH} L${pts[0].x},${
    padY + innerH
  } Z`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto overflow-visible"
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="throughput-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.brand} stopOpacity="0.22" />
            <stop offset="100%" stopColor={C.brand} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* baseline */}
        <line
          x1={padX}
          y1={padY + innerH}
          x2={W - padX}
          y2={padY + innerH}
          stroke="var(--border)"
          strokeWidth="1"
        />

        <path d={area} fill="url(#throughput-fill)" />
        <path
          d={line}
          fill="none"
          stroke={C.brand}
          strokeWidth="2.25"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {/* points */}
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hover === i ? 4.5 : 2.5}
            fill="var(--card)"
            stroke={C.brand}
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            className="transition-[r]"
          />
        ))}

        {/* hover hit areas */}
        {pts.map((p, i) => (
          <rect
            key={`hit-${i}`}
            x={p.x - step / 2}
            y={0}
            width={step || innerW}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {hover !== null && (
          <line
            x1={pts[hover].x}
            y1={padY - 8}
            x2={pts[hover].x}
            y2={padY + innerH}
            stroke={C.brand}
            strokeWidth="1"
            strokeDasharray="3 3"
            opacity="0.5"
          />
        )}
      </svg>

      {/* x labels: first / mid / last */}
      <div className="flex justify-between mt-2 px-1">
        {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
          <span key={i} className="text-[10px] font-mono text-muted-foreground">
            {days[i]?.label}
          </span>
        ))}
      </div>

      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-lg"
          style={{ left: `${(pts[hover].x / W) * 100}%` }}
        >
          <p className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
            {days[hover].label}
          </p>
          <p className="text-sm font-medium tabular-nums">
            {days[hover].count}{" "}
            <span className="text-muted-foreground font-normal">
              ticket{days[hover].count === 1 ? "" : "s"}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── Pipeline donut ──────────────────────────────────────────────────────────
function Pipeline({
  total,
  segments,
}: {
  total: number;
  segments: { label: string; value: number; color: string }[];
}) {
  const R = 52;
  const SW = 16;
  const C2 = 2 * Math.PI * R;

  // Precompute each arc's length + starting offset (prefix sum) so render stays
  // free of in-place mutation.
  const lengths = segments.map((s) => (total ? (s.value / total) * C2 : 0));
  const arcs = segments.map((s, i) => ({
    ...s,
    len: lengths[i],
    offset: lengths.slice(0, i).reduce((a, b) => a + b, 0),
  }));

  return (
    <div className="mt-5 flex items-center gap-6">
      <div className="relative shrink-0">
        <svg viewBox="0 0 140 140" className="size-32 -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke="var(--muted)"
            strokeWidth={SW}
          />
          {arcs.map((s) => (
            <circle
              key={s.label}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={SW}
              strokeDasharray={`${s.len} ${C2 - s.len}`}
              strokeDashoffset={-s.offset}
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center -rotate-0">
          <span className="display text-2xl font-medium tabular-nums leading-none">
            {total}
          </span>
          <span className="eyebrow mt-1">Total</span>
        </div>
      </div>

      <ul className="space-y-2.5 flex-1 min-w-0">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-2.5 rounded-full shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-medium tabular-nums">{s.value}</span>
            <span className="text-[11px] font-mono text-muted-foreground w-9 text-right">
              {total ? Math.round((s.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Itinerary type bar ──────────────────────────────────────────────────────
function TypeBar({
  icon: Icon,
  label,
  count,
  share,
  color,
}: {
  icon: typeof Plane;
  label: string;
  count: number;
  share: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="flex items-center gap-2">
          <Icon className="size-3.5" style={{ color }} />
          <span className="text-foreground">{label}</span>
        </span>
        <span className="font-medium tabular-nums">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{ width: `${Math.max(share * 100, count > 0 ? 4 : 0)}%`, background: color }}
        />
      </div>
    </div>
  );
}

// ── Extraction health ring ──────────────────────────────────────────────────
function ExtractionHealth({
  total,
  processing,
  failed,
}: {
  total: number;
  processing: number;
  failed: number;
}) {
  const succeeded = Math.max(0, total - processing - failed);
  const rate = total ? Math.round((succeeded / total) * 100) : 100;
  const R = 46;
  const C2 = 2 * Math.PI * R;
  const len = (rate / 100) * C2;

  return (
    <div className="paper p-5 lg:p-6 reveal">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-brand" />
        <p className="eyebrow">Extraction</p>
      </div>
      <h3 className="display text-lg font-medium mt-1 mb-4">Pipeline health</h3>

      <div className="flex items-center gap-5">
        <div className="relative shrink-0">
          <svg viewBox="0 0 120 120" className="size-28 -rotate-90">
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke="var(--muted)"
              strokeWidth="12"
            />
            <circle
              cx="60"
              cy="60"
              r={R}
              fill="none"
              stroke={C.emerald}
              strokeWidth="12"
              strokeDasharray={`${len} ${C2 - len}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 grid place-content-center text-center">
            <span className="display text-xl font-medium tabular-nums leading-none">
              {rate}%
            </span>
            <span className="eyebrow mt-1">Clean</span>
          </div>
        </div>

        <ul className="space-y-2.5 flex-1 text-sm">
          <HealthRow
            color={C.emerald}
            label="Succeeded"
            value={succeeded}
          />
          <HealthRow
            color={C.brand}
            label="Processing"
            value={processing}
            pulse
          />
          <HealthRow
            color="var(--destructive)"
            label="Failed"
            value={failed}
            icon={failed > 0 ? AlertTriangle : undefined}
          />
        </ul>
      </div>
    </div>
  );
}

function HealthRow({
  color,
  label,
  value,
  pulse,
  icon: Icon,
}: {
  color: string;
  label: string;
  value: number;
  pulse?: boolean;
  icon?: typeof AlertTriangle;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={cn("size-2.5 rounded-full shrink-0", pulse && "animate-pulse")}
        style={{ background: color }}
      />
      <span className="text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="size-3.5 text-destructive" />}
        {label}
      </span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </li>
  );
}

// ── Top route row ───────────────────────────────────────────────────────────
function RouteRow({
  origin,
  dest,
  count,
  share,
}: {
  origin: string;
  dest: string;
  count: number;
  share: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="flex items-center gap-1.5 font-mono tracking-tight">
          <span className="text-foreground">{origin}</span>
          <Plane className="size-3 text-muted-foreground/50 rotate-90" />
          <span className="text-foreground">{dest}</span>
        </span>
        <span className="font-medium tabular-nums">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-700"
          style={{ width: `${Math.max(share * 100, 6)}%` }}
        />
      </div>
    </div>
  );
}

// ── Recent activity row ─────────────────────────────────────────────────────
const STATUS_LOOK: Record<
  string,
  { cls: string; label: string }
> = {
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

function RecentRow({ ticket }: { ticket: TicketListItem }) {
  const isMaritime = ticket.type === "MARITIME";
  const Icon = isMaritime ? Ship : Plane;
  const look = STATUS_LOOK[ticket.status];
  const [origin, dest] = (ticket.routeSummary ?? "")
    .split(/[→\->]+/)
    .map((s) => s.trim());

  return (
    <li>
      <Link
        href={`/tickets/${ticket.id}`}
        className="group flex items-center gap-3 py-3 -mx-2 px-2 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
      >
        <span className="size-8 rounded-lg bg-muted grid place-items-center shrink-0">
          <Icon className="size-4 text-brand" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm truncate group-hover:text-brand transition-colors">
            {ticket.passengerName ?? "Unnamed passenger"}
          </p>
          <p className="text-[12px] text-muted-foreground font-mono truncate">
            {origin && dest
              ? `${toIata(origin)} → ${toIata(dest)}`
              : (ticket.reference ?? ticket.id.slice(0, 6).toUpperCase())}
          </p>
        </div>
        <span
          className={cn(
            "stamp shrink-0 hidden sm:inline-flex",
            look?.cls,
          )}
        >
          {look?.label ?? ticket.status}
        </span>
        <span className="text-[11px] text-muted-foreground tabular-nums w-16 text-right shrink-0">
          {formatDistanceToNowStrict(parseISO(ticket.createdAt), {
            addSuffix: false,
          })}
        </span>
      </Link>
    </li>
  );
}

// ── Skeleton / empty ────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="paper p-5 h-[132px] animate-pulse" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="paper lg:col-span-2 h-[300px] animate-pulse" />
        <div className="paper h-[300px] animate-pulse" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="paper h-[240px] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function DashboardEmpty() {
  return (
    <div className="paper p-12 lg:p-16 text-center reveal">
      <div className="mx-auto size-14 rounded-2xl border border-border bg-muted grid place-items-center mb-4">
        <Inbox className="size-6 text-brand" />
      </div>
      <h3 className="display text-xl font-medium mb-2">Nothing to chart yet</h3>
      <p className="text-muted-foreground text-[14px] max-w-md mx-auto mb-6">
        Once you upload your first ticket, this dashboard fills in with throughput,
        pipeline health and route insights.
      </p>
      <Link
        href="/tickets/upload"
        className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand/90 transition-colors cursor-pointer group shadow-sm shadow-brand/20"
      >
        <Upload className="size-4" />
        Upload your first ticket
        <ArrowUpRight className="size-4" />
      </Link>
    </div>
  );
}
