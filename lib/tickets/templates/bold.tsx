import React from "react";
import path from "path";
import {
  Document,
  Page,
  View,
  Text,
  Font,
  StyleSheet,
  Svg,
  Path,
  Circle,
} from "@react-pdf/renderer";
import {
  TicketData,
  FlightLeg,
  MaritimeLeg,
  FlightDirection,
  MaritimeDirection,
  getFlightDirections,
  getMaritimeDirections,
  getDirectionLabel,
} from "../schema";
import { TemplateProps } from "./types";
import type { PaletteColors } from "./palettes";

// ---------------------------------------------------------------------------
// BOLD — "Modern Bold"
// ---------------------------------------------------------------------------
// A faithful @react-pdf reproduction of reference/templates/03-modern-bold.html.
// Like EDITORIAL / PREMIUM it reads every color from the resolved palette catalog
// entry (brand / brand2 / tint / ink / muted / line / paper / bg).
//
// The look is punchy and confident: a full-bleed brand-colored header band, a
// white passenger card that floats up to overlap the band, flight details laid
// out as a tinted "bento" grid of rounded cells, and a dark summary bar. One
// font family (Manrope) carries everything through its weight range.
//
// Sizing convention (shared with EDITORIAL / PREMIUM): the reference is a 760px-
// wide screen sheet that prints to A4. Carry px to pt with 1px = 0.75pt for
// fixed values and let flex / percent widths reflow into the 595pt A4 width.

// ---------------------------------------------------------------------------
// Font registration — local TTFs to avoid remote URL breakage at render time
// ---------------------------------------------------------------------------

const fontsDir = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Manrope",
  fonts: [
    { src: path.join(fontsDir, "manrope-400.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "manrope-500.ttf"), fontWeight: 500 },
    { src: path.join(fontsDir, "manrope-600.ttf"), fontWeight: 600 },
    { src: path.join(fontsDir, "manrope-700.ttf"), fontWeight: 700 },
    { src: path.join(fontsDir, "manrope-800.ttf"), fontWeight: 800 },
  ],
});

// ---------------------------------------------------------------------------
// French months + date / number / duration helpers (mirrors editorial.tsx)
// ---------------------------------------------------------------------------

const MOIS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Jun",
  "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc",
];

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${day} ${MOIS[month - 1]} ${year}`;
}

function formatPrice(price: string, currency: string): string {
  const num = parseFloat(price.replace(/\s/g, "").replace(",", "."));
  if (isNaN(num)) return `${price} ${currency}`;
  // Intl groups fr-FR with a narrow no-break space (U+202F); normalize all
  // nbsp variants to a plain ASCII space so the font renders the grouping.
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(num)
    .replace(/\s/g, " ");
  return `${formatted} ${currency}`;
}

function parseMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function computeDurationMinutes(
  depTime: string,
  arrTime: string,
  depDate?: string | null,
  arrDate?: string | null,
): number {
  let diff = parseMinutes(arrTime) - parseMinutes(depTime);
  if (depDate && arrDate && arrDate !== depDate) {
    const d1 = new Date(depDate).getTime();
    const d2 = new Date(arrDate).getTime();
    const dayDiff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    diff += dayDiff * 24 * 60;
  } else if (diff < 0) {
    diff += 24 * 60;
  }
  return diff;
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

function formatDuration(
  depTime: string,
  arrTime: string,
  depDate?: string | null,
  arrDate?: string | null,
): string {
  return formatMinutes(computeDurationMinutes(depTime, arrTime, depDate, arrDate));
}

function formatDurationString(dur: string): string {
  const [h, m] = dur.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return dur;
  return formatMinutes(h * 60 + m);
}

function isNextDay(depDate?: string | null, arrDate?: string | null): boolean {
  if (!depDate || !arrDate) return false;
  return arrDate > depDate;
}

// Whole-trip duration = sum of each direction's own duration (legs +
// in-direction layovers). Layovers never span two directions.
function computeTripDuration(
  directions: { legs: (FlightLeg | MaritimeLeg)[] }[],
): string {
  let total = 0;
  for (const dir of directions) {
    for (const leg of dir.legs) {
      if (leg.duration) {
        total += parseMinutes(leg.duration);
      } else if (leg.arrivalTime) {
        total += computeDurationMinutes(
          leg.departureTime,
          leg.arrivalTime,
          leg.departureDate,
          leg.arrivalDate,
        );
      }
    }
    for (let i = 0; i < dir.legs.length - 1; i++) {
      const prev = dir.legs[i];
      const next = dir.legs[i + 1];
      if (!prev.arrivalTime) continue;
      total += computeDurationMinutes(
        prev.arrivalTime,
        next.departureTime,
        prev.arrivalDate ?? prev.departureDate,
        next.departureDate,
      );
    }
  }
  return total > 0 ? formatMinutes(total) : "";
}

// Full airport itinerary across every direction, e.g. "ALG → CDG → JFK".
function getItinerary(directions: FlightDirection[]): string {
  const legs = directions.flatMap((d) => d.legs);
  if (legs.length === 0) return "";
  const codes = [legs[0].departureAirport];
  for (const leg of legs) codes.push(leg.arrivalAirport);
  return codes.join(" → ");
}

function getMaritimeTitle(directions: MaritimeDirection[]): string {
  if (directions.length === 1) return "Traversée Maritime";
  if (directions.length === 2 && directions.some((d) => d.kind === "RETURN")) {
    return "Traversée Aller-Retour";
  }
  if (directions.length >= 3) return "Traversée Multi-Étapes";
  return "Traversée Maritime";
}

// The per-leg heading: "Aller — Alger → Paris" (bound label from the direction's
// kind, city pair from the leg). A one-way trip has no bound label.
function getLegHeading(
  directions: { kind: FlightDirection["kind"] }[],
  directionIndex: number,
  leg: { departureCity: string; arrivalCity: string },
): string {
  const label = getDirectionLabel(directions, directionIndex);
  const route = `${leg.departureCity} → ${leg.arrivalCity}`;
  return label ? `${label} — ${route}` : route;
}

const TYPE_TITLES: Record<string, string> = {
  ONE_WAY: "Aller Simple",
  ROUND_TRIP: "Aller-Retour",
  MULTI_LEG: "Multi-Escale",
  MARITIME: "Traversée Maritime",
};

// ---------------------------------------------------------------------------
// px to pt scale (see header note)
// ---------------------------------------------------------------------------

const K = 0.75;
const r = (n: number) => n * K;

const s = StyleSheet.create({
  page: {
    fontFamily: "Manrope",
    fontSize: r(10),
    flexDirection: "column",
  },

  // header band — bleeds edge to edge
  band: {
    paddingTop: r(30),
    paddingHorizontal: r(40),
    paddingBottom: r(52),
  },
  bandTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { flexDirection: "row", alignItems: "center", gap: r(12) },
  mk: {
    width: r(42),
    height: r(42),
    borderRadius: r(12),
    alignItems: "center",
    justifyContent: "center",
  },
  bName: { fontSize: r(16), fontWeight: 800, color: "#ffffff" },
  bSlogan: {
    fontSize: r(9),
    fontWeight: 500,
    letterSpacing: r(1.8),
    textTransform: "uppercase",
    marginTop: r(2),
    color: "rgba(255,255,255,0.8)",
  },
  bandPill: {
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: r(30),
    paddingVertical: r(7),
    paddingHorizontal: r(16),
    fontSize: r(10),
    fontWeight: 700,
    letterSpacing: r(0.6),
    color: "#ffffff",
  },
  bandTitle: { marginTop: r(22) },
  bandEt: {
    fontSize: r(10),
    fontWeight: 600,
    letterSpacing: r(2.4),
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.8)",
  },
  bandH1: {
    fontSize: r(34),
    fontWeight: 800,
    letterSpacing: r(-0.7),
    marginTop: r(4),
    color: "#ffffff",
  },

  // floating passenger card — overlaps the band
  floatwrap: { paddingHorizontal: r(28), marginTop: r(-40) },
  paxCard: {
    borderRadius: r(16),
    paddingVertical: r(20),
    paddingHorizontal: r(28),
    flexDirection: "row",
    justifyContent: "space-between",
    gap: r(18),
    flexWrap: "wrap",
  },
  f: { flexShrink: 1 },
  fK: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(1.4),
    textTransform: "uppercase",
    marginBottom: r(4),
  },
  fV: { fontSize: r(14), fontWeight: 700 },
  fVbig: { fontSize: r(20), fontWeight: 800 },

  // passenger card — table variant (multi)
  paxCardTab: {
    borderRadius: r(16),
    paddingVertical: r(20),
    paddingHorizontal: r(28),
  },
  paxCap: { flexDirection: "row", alignItems: "center", gap: r(9), marginBottom: r(12) },
  cbadge2: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(0.7),
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: r(3),
    paddingHorizontal: r(10),
    borderRadius: r(20),
  },
  paxRow: { flexDirection: "row", paddingVertical: r(9), alignItems: "center" },
  paxRowHd: { flexDirection: "row", paddingVertical: r(9), alignItems: "center" },
  paxRowBd: { borderTopWidth: r(1) },
  paxColName: { flex: 2, paddingRight: r(14) },
  paxColTicket: { flex: 1.6, paddingRight: r(14) },
  paxColCompany: { flex: 1.4 },
  paxHdCell: {
    fontSize: r(8),
    fontWeight: 700,
    letterSpacing: r(1.2),
    textTransform: "uppercase",
  },
  paxNmCell: { fontSize: r(15), fontWeight: 800 },
  paxVvCell: { fontSize: r(13), fontWeight: 600 },

  // segment label
  seg: {
    paddingTop: r(20),
    paddingHorizontal: r(40),
    flexDirection: "row",
    alignItems: "center",
    gap: r(12),
  },
  segNo: {
    fontSize: r(10),
    fontWeight: 800,
    paddingVertical: r(5),
    paddingHorizontal: r(12),
    borderRadius: r(8),
  },
  segDir: { fontSize: r(12), fontWeight: 700 },

  // flight card
  flight: {
    marginTop: r(12),
    marginHorizontal: r(40),
    borderWidth: r(1.5),
    borderRadius: r(18),
    paddingVertical: r(20),
    paddingHorizontal: r(28),
  },
  route: { flexDirection: "row", alignItems: "center", gap: r(16) },
  end: { minWidth: r(90) },
  endR: { minWidth: r(90), alignItems: "flex-end" },
  iata: { fontSize: r(34), fontWeight: 800, letterSpacing: r(-0.7), lineHeight: 1 },
  cty: { fontSize: r(10), fontWeight: 500, marginTop: r(5) },
  tm: { fontSize: r(18), fontWeight: 800, marginTop: r(6) },
  tmSup: { fontSize: r(11), fontWeight: 800 },
  mid: { flex: 1, alignItems: "center", gap: r(8) },
  dur: {
    color: "#ffffff",
    fontSize: r(10),
    fontWeight: 700,
    paddingVertical: r(5),
    paddingHorizontal: r(14),
    borderRadius: r(20),
  },
  midline: { width: "100%", flexDirection: "row", alignItems: "center" },
  bar: { flex: 1, borderTopWidth: r(2), borderTopStyle: "dashed" },

  // bento grid
  bento: { flexDirection: "row", flexWrap: "wrap", gap: r(8), marginTop: r(14) },
  cell: {
    flexGrow: 1,
    flexBasis: r(70),
    minWidth: r(70),
    borderRadius: r(12),
    paddingVertical: r(11),
    paddingHorizontal: r(12),
  },
  cellK: {
    fontSize: r(7.5),
    fontWeight: 700,
    letterSpacing: r(0.9),
    textTransform: "uppercase",
    marginBottom: r(4),
  },
  cellVwrap: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  cellV: { fontSize: r(12.5), fontWeight: 700 },
  cbadge: {
    fontSize: r(7.5),
    fontWeight: 700,
    letterSpacing: r(0.5),
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: r(2),
    paddingHorizontal: r(7),
    borderRadius: r(6),
    marginLeft: r(5),
  },

  // layover
  layover: {
    marginTop: r(12),
    marginHorizontal: r(40),
    borderRadius: r(12),
    paddingVertical: r(12),
    paddingHorizontal: r(20),
    flexDirection: "row",
    alignItems: "center",
    gap: r(10),
  },
  layoverT: { fontSize: r(11), fontWeight: 700 },
  layoverD: { marginLeft: "auto", fontSize: r(11), fontWeight: 800 },

  // extra grid (maritime)
  extra: {
    marginTop: r(10),
    marginHorizontal: r(40),
    flexDirection: "row",
    flexWrap: "wrap",
    gap: r(8),
  },

  grow: { flexGrow: 1, minHeight: r(24) },

  // summary — dark bar
  summary: {
    marginVertical: r(16),
    marginHorizontal: r(40),
    borderRadius: r(18),
    paddingVertical: r(22),
    paddingHorizontal: r(28),
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: r(16),
  },
  sBlock: { flexShrink: 1 },
  sK: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(1.4),
    textTransform: "uppercase",
    marginBottom: r(5),
    color: "rgba(255,255,255,0.55)",
  },
  sV: { fontSize: r(15), fontWeight: 700, color: "#ffffff" },
  sPrice: { fontSize: r(24), fontWeight: 800, color: "#ffffff" },

  // footer
  foot: {
    paddingVertical: r(20),
    paddingHorizontal: r(40),
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: r(16),
  },
  footN: { fontSize: r(12), fontWeight: 800 },
  footA: { fontSize: r(10), marginTop: r(4), lineHeight: 1.6 },
  cts: { alignItems: "flex-end", gap: r(5) },
  ct: { flexDirection: "row", alignItems: "center", gap: r(6), justifyContent: "flex-end" },
  ctText: { fontSize: r(10), fontWeight: 700 },
  gen: {
    fontSize: r(8),
    textAlign: "center",
    paddingTop: r(10),
    paddingBottom: r(16),
    paddingHorizontal: r(40),
  },
});

// ---------------------------------------------------------------------------
// SVG icons (path data lifted from the reference HTML)
// ---------------------------------------------------------------------------

const PLANE_D =
  "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z";

function PlaneIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d={PLANE_D} fill={color} />
    </Svg>
  );
}

function ShipIcon({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M3 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M5 16l2-7h10l2 7M9 9V6h6v3M11 6V4h2v2"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function ClockIcon({ color }: { color: string }) {
  return (
    <Svg width={r(16)} height={r(16)} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} fill="none" stroke={color} strokeWidth={2} />
      <Path d="M12 7v5l3 2" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function PhoneIcon({ color }: { color: string }) {
  return (
    <Svg width={r(12)} height={r(12)} viewBox="0 0 24 24">
      <Path
        d="M6.62 10.79a15 15 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"
        fill={color}
      />
    </Svg>
  );
}

function EmailIcon({ color }: { color: string }) {
  return (
    <Svg width={r(12)} height={r(12)} viewBox="0 0 24 24">
      <Path
        d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
        fill={color}
      />
    </Svg>
  );
}

function WebIcon({ color }: { color: string }) {
  return (
    <Svg width={r(12)} height={r(12)} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} fill="none" stroke={color} strokeWidth={2} />
      <Path
        d="M2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20"
        fill="none"
        stroke={color}
        strokeWidth={2}
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Band({
  agency,
  title,
  p,
}: {
  agency: TemplateProps["agency"];
  title: string;
  p: PaletteColors;
}) {
  const name = agency.name ?? "Tikalo";
  const slogan = agency.slogan ?? "Agence de Voyages";
  return (
    <View style={[s.band, { backgroundColor: p.brand }]}>
      <View style={s.bandTop}>
        <View style={s.logo}>
          <View style={[s.mk, { backgroundColor: "rgba(255,255,255,0.16)" }]}>
            <PlaneIcon size={r(24)} color="#ffffff" />
          </View>
          <View>
            <Text style={s.bName}>{name}</Text>
            {slogan ? <Text style={s.bSlogan}>{slogan}</Text> : null}
          </View>
        </View>
        <Text style={s.bandPill}>Billet Électronique</Text>
      </View>
      <View style={s.bandTitle}>
        <Text style={s.bandEt}>Confirmation de voyage</Text>
        <Text style={s.bandH1}>{title}</Text>
      </View>
    </View>
  );
}

type Field = { k: string; v: string; big?: boolean };

function PassengerCard({ fields, p }: { fields: Field[]; p: PaletteColors }) {
  return (
    <View style={s.floatwrap}>
      <View style={[s.paxCard, { backgroundColor: p.paper ?? "#ffffff" }]}>
        {fields.map((f, i) => (
          <View key={i} style={s.f}>
            <Text style={[s.fK, { color: p.muted }]}>{f.k}</Text>
            <Text style={[f.big ? s.fVbig : s.fV, { color: p.ink }]}>{f.v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PassengerTableCard({ data, p }: { data: TicketData; p: PaletteColors }) {
  const passengers = data.passengers ?? [];
  const airline =
    getFlightDirections(data)[0]?.legs[0]?.airline ??
    getMaritimeDirections(data)[0]?.legs[0]?.company ??
    "";
  return (
    <View style={s.floatwrap}>
      <View style={[s.paxCardTab, { backgroundColor: p.paper ?? "#ffffff" }]}>
        <View style={s.paxCap}>
          <Text style={[s.fK, { color: p.muted, marginBottom: 0 }]}>Passagers</Text>
          <Text style={[s.cbadge2, { backgroundColor: p.brand }]}>
            {passengers.length} Voyageur{passengers.length > 1 ? "s" : ""}
          </Text>
        </View>
        <View style={s.paxRowHd}>
          <Text style={[s.paxColName, s.paxHdCell, { color: p.muted }]}>Nom</Text>
          <Text style={[s.paxColTicket, s.paxHdCell, { color: p.muted }]}>Billet No.</Text>
          <Text style={[s.paxColCompany, s.paxHdCell, { color: p.muted }]}>Compagnie</Text>
        </View>
        {passengers.map((pax, i) => (
          <View key={i} style={[s.paxRow, s.paxRowBd, { borderTopColor: p.line }]}>
            <Text style={[s.paxColName, s.paxNmCell, { color: p.ink }]}>{pax.name}</Text>
            <Text style={[s.paxColTicket, s.paxVvCell, { color: p.ink }]}>
              {pax.ticketNumber ?? "—"}
            </Text>
            <Text style={[s.paxColCompany, s.paxVvCell, { color: p.ink }]}>{airline}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type Cell = { k: string; v: string; badge?: string };

function BentoCell({ item, p }: { item: Cell; p: PaletteColors }) {
  return (
    <View style={[s.cell, { backgroundColor: p.tint ?? "#f1f5f4" }]}>
      <Text style={[s.cellK, { color: p.muted }]}>{item.k}</Text>
      <View style={s.cellVwrap}>
        <Text style={[s.cellV, { color: p.ink }]}>{item.v}</Text>
        {item.badge ? (
          <Text style={[s.cbadge, { backgroundColor: p.brand }]}>{item.badge}</Text>
        ) : null}
      </View>
    </View>
  );
}

function SegmentLabel({ no, dir, p }: { no: string; dir: string; p: PaletteColors }) {
  return (
    <View style={s.seg} wrap={false}>
      <Text style={[s.segNo, { color: p.brand, backgroundColor: p.tint ?? "#f1f5f4" }]}>
        {no}
      </Text>
      <Text style={[s.segDir, { color: p.muted }]}>{dir}</Text>
    </View>
  );
}

function Route({
  depCode,
  depCity,
  depTime,
  arrCode,
  arrCity,
  arrTime,
  arrNextDay,
  durText,
  isMaritime,
  p,
}: {
  depCode: string;
  depCity: string;
  depTime: string;
  arrCode: string;
  arrCity: string;
  arrTime: string;
  arrNextDay: boolean;
  durText: string;
  isMaritime: boolean;
  p: PaletteColors;
}) {
  return (
    <View style={s.route}>
      <View style={s.end}>
        <Text style={[s.iata, { color: p.ink }]}>{depCode}</Text>
        <Text style={[s.cty, { color: p.muted }]}>{depCity}</Text>
        <Text style={[s.tm, { color: p.brand }]}>{depTime}</Text>
      </View>
      <View style={s.mid}>
        {durText ? (
          <Text style={[s.dur, { backgroundColor: p.brand }]}>{durText}</Text>
        ) : null}
        <View style={s.midline}>
          <View style={[s.bar, { borderTopColor: p.line }]} />
          {isMaritime ? (
            <ShipIcon size={r(20)} color={p.brand} />
          ) : (
            <PlaneIcon size={r(20)} color={p.brand} />
          )}
          <View style={[s.bar, { borderTopColor: p.line }]} />
        </View>
      </View>
      <View style={s.endR}>
        <Text style={[s.iata, { color: p.ink, textAlign: "right" }]}>{arrCode}</Text>
        <Text style={[s.cty, { color: p.muted, textAlign: "right" }]}>{arrCity}</Text>
        <Text style={[s.tm, { color: p.brand, textAlign: "right" }]}>
          {arrTime}
          {arrNextDay ? <Text style={s.tmSup}>+1</Text> : null}
        </Text>
      </View>
    </View>
  );
}

function FlightSegment({
  leg,
  legNo,
  totalLegs,
  heading,
  isMultiPax,
  passengerCount,
  p,
}: {
  leg: FlightLeg;
  legNo: number;
  totalLegs: number;
  heading: string;
  isMultiPax: boolean;
  passengerCount: number;
  p: PaletteColors;
}) {
  const nextDay = isNextDay(leg.departureDate, leg.arrivalDate);
  const rawDuration = leg.duration;
  const duration = rawDuration
    ? formatDurationString(rawDuration)
    : leg.departureTime && leg.arrivalTime
      ? formatDuration(
          leg.departureTime,
          leg.arrivalTime,
          leg.departureDate,
          leg.arrivalDate,
        )
      : "";

  const segNo = `Vol ${legNo}/${totalLegs}`;

  // Bento cells mirror the reference: multi-pax drops "Compagnie" (it lives in
  // the passenger table) and shows a "Passagers" cell instead.
  let cells: Cell[];
  if (isMultiPax) {
    cells = [
      { k: "Vol", v: leg.flightNumber },
      { k: "Date", v: formatDate(leg.departureDate) },
      { k: "Cabine", v: leg.cabin ?? "Economy" },
      { k: "Passagers", v: `${passengerCount} adulte${passengerCount > 1 ? "s" : ""}` },
      {
        k: "Bagages",
        v: leg.baggageAllowance ? `${leg.baggageAllowance} / p.` : "—",
      },
    ];
  } else {
    cells = [
      { k: "Compagnie", v: leg.airline },
      { k: "Vol", v: leg.flightNumber },
      { k: "Date", v: formatDate(leg.departureDate) },
      { k: "Cabine", v: leg.cabin ?? "Economy" },
      { k: "Bagages", v: leg.baggageAllowance ?? "—" },
    ];
  }

  return (
    <>
      <SegmentLabel no={segNo} dir={heading} p={p} />
      <View style={[s.flight, { borderColor: p.line }]} wrap={false}>
        <Route
          depCode={leg.departureAirport}
          depCity={`${leg.departureCity} · ${leg.departureAirport}`}
          depTime={leg.departureTime}
          arrCode={leg.arrivalAirport}
          arrCity={`${leg.arrivalCity} · ${leg.arrivalAirport}`}
          arrTime={leg.arrivalTime ?? ""}
          arrNextDay={nextDay}
          durText={duration}
          isMaritime={false}
          p={p}
        />
        <View style={s.bento}>
          {cells.map((c, i) => (
            <BentoCell key={i} item={c} p={p} />
          ))}
        </View>
      </View>
    </>
  );
}

function MaritimeSegment({
  leg,
  legNo,
  totalLegs,
  heading,
  p,
}: {
  leg: MaritimeLeg;
  legNo: number;
  totalLegs: number;
  heading: string;
  p: PaletteColors;
}) {
  const nextDay = isNextDay(leg.departureDate, leg.arrivalDate);
  const rawDuration = leg.duration;
  const duration = rawDuration
    ? formatDurationString(rawDuration)
    : leg.departureTime && leg.arrivalTime
      ? formatDuration(
          leg.departureTime,
          leg.arrivalTime,
          leg.departureDate,
          leg.arrivalDate,
        )
      : "";

  const cells: Cell[] = [
    { k: "Compagnie", v: leg.company },
    { k: "Navire", v: leg.shipName },
    { k: "Date départ", v: formatDate(leg.departureDate) },
    {
      k: "Classe",
      v: leg.cabinType ?? leg.cabinNumber ?? "—",
      badge: leg.cabinType && leg.cabinNumber ? leg.cabinNumber : undefined,
    },
    {
      k: "Véhicule",
      v: leg.hasVehicle ? (leg.vehicleType ?? "Véhicule") : "Sans véh.",
    },
  ];

  // Extra detail cells appear when the maritime data carries cabin / deck info.
  const extra: Cell[] = [];
  if (leg.cabinNumber) extra.push({ k: "Numéro de cabine", v: leg.cabinNumber });
  if (leg.deckNumber) extra.push({ k: "Pont", v: leg.deckNumber });

  return (
    <>
      <SegmentLabel
        no={totalLegs > 1 ? `Traversée ${legNo}/${totalLegs}` : "Traversée 1/1"}
        dir={heading}
        p={p}
      />
      <View style={[s.flight, { borderColor: p.line }]} wrap={false}>
        <Route
          depCode={leg.departurePort}
          depCity={`Port de ${leg.departureCity}`}
          depTime={leg.departureTime}
          arrCode={leg.arrivalPort}
          arrCity={`Port de ${leg.arrivalCity}`}
          arrTime={leg.arrivalTime ?? ""}
          arrNextDay={nextDay}
          durText={duration}
          isMaritime
          p={p}
        />
        <View style={s.bento}>
          {cells.map((c, i) => (
            <BentoCell key={i} item={c} p={p} />
          ))}
        </View>
      </View>
      {extra.length > 0 ? (
        <View style={s.extra} wrap={false}>
          {extra.map((c, i) => (
            <BentoCell key={i} item={c} p={p} />
          ))}
        </View>
      ) : null}
    </>
  );
}

function LayoverBlock({
  prev,
  next,
  p,
}: {
  prev: FlightLeg;
  next: FlightLeg;
  p: PaletteColors;
}) {
  if (!prev.arrivalTime) return null;
  const prevArrDate = prev.arrivalDate ?? prev.departureDate;
  const dur = formatDuration(
    prev.arrivalTime,
    next.departureTime,
    prevArrDate,
    next.departureDate,
  );
  return (
    <View style={[s.layover, { backgroundColor: p.tint ?? "#f1f5f4" }]} wrap={false}>
      <ClockIcon color={p.brand} />
      <Text style={[s.layoverT, { color: p.ink }]}>
        Escale à {prev.arrivalCity} · {prev.arrivalAirport}
      </Text>
      <Text style={[s.layoverD, { color: p.brand }]}>Attente {dur}</Text>
    </View>
  );
}

function Summary({
  blocks,
  total,
  p,
}: {
  blocks: { k: string; v: string }[];
  total: { k: string; v: string };
  p: PaletteColors;
}) {
  return (
    <View style={[s.summary, { backgroundColor: p.ink }]} wrap={false}>
      {blocks.map((b, i) => (
        <View key={i} style={s.sBlock}>
          <Text style={s.sK}>{b.k}</Text>
          <Text style={s.sV}>{b.v}</Text>
        </View>
      ))}
      <View style={s.sBlock}>
        <Text style={s.sK}>{total.k}</Text>
        <Text style={s.sPrice}>{total.v}</Text>
      </View>
    </View>
  );
}

function Footer({
  agency,
  isMaritime,
  p,
}: {
  agency: TemplateProps["agency"];
  isMaritime: boolean;
  p: PaletteColors;
}) {
  const name = agency.name ?? "Tikalo";
  const addr = [agency.addressLine1, agency.addressLine2].filter(Boolean);
  const phone = agency.contactPhone ?? "";
  const email = agency.contactEmail ?? "";
  const website = agency.contactWebsite ?? "";
  const today = formatDate(new Date().toISOString().split("T")[0]);
  const ending = isMaritime
    ? "lors de l'embarquement au port"
    : "lors de l'enregistrement";

  return (
    <>
      <View style={[s.foot, { backgroundColor: p.tint ?? "#f1f5f4" }]} wrap={false}>
        <View>
          <Text style={[s.footN, { color: p.ink }]}>{name}</Text>
          {addr.length > 0 ? (
            <Text style={[s.footA, { color: p.muted }]}>{addr.join("\n")}</Text>
          ) : null}
        </View>
        <View style={s.cts}>
          {phone ? (
            <View style={s.ct}>
              <PhoneIcon color={p.brand} />
              <Text style={[s.ctText, { color: p.ink }]}>{phone}</Text>
            </View>
          ) : null}
          {email ? (
            <View style={s.ct}>
              <EmailIcon color={p.brand} />
              <Text style={[s.ctText, { color: p.ink }]}>{email}</Text>
            </View>
          ) : null}
          {website ? (
            <View style={s.ct}>
              <WebIcon color={p.brand} />
              <Text style={[s.ctText, { color: p.ink }]}>{website}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <Text style={[s.gen, { color: p.muted }]}>
        Généré le {today} — Confirmation électronique. Veuillez présenter ce
        document {ending}.
      </Text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Main template
// ---------------------------------------------------------------------------

export function BoldTemplate({ data, agency, palette }: TemplateProps) {
  const p = palette;
  const isMaritime = data.type === "MARITIME";
  const isMultiLeg = data.type === "MULTI_LEG";
  const flightDirections = getFlightDirections(data);
  const maritimeDirections = getMaritimeDirections(data);
  const passengers = data.passengers ?? [];
  const isMultiPax = passengers.length > 1;
  const passengerCount = passengers.length;

  const title =
    isMaritime && maritimeDirections.length > 0
      ? getMaritimeTitle(maritimeDirections)
      : (TYPE_TITLES[data.type] ?? data.type);

  // Single-passenger card: the third field is the itinerary for multi-leg,
  // otherwise the ticket type.
  const lastField: Field = isMultiLeg
    ? { k: "Itinéraire", v: getItinerary(flightDirections) }
    : { k: "Type", v: title };
  const cardFields: Field[] = [
    { k: "Passager", v: passengers[0]?.name ?? "", big: true },
    { k: "Billet No.", v: passengers[0]?.ticketNumber ?? "—" },
    lastField,
  ];

  // Summary blocks vary by ticket type (mirrors EDITORIAL / PREMIUM).
  let totalDuration = "";
  if (isMultiLeg && flightDirections.length > 0) {
    totalDuration = computeTripDuration(flightDirections);
  } else if (isMaritime && maritimeDirections.length > 0) {
    totalDuration = computeTripDuration(maritimeDirections);
  }

  const priceStr =
    data.price && data.currency ? formatPrice(data.price, data.currency) : "—";

  const summaryBlocks: { k: string; v: string }[] = [];
  let summaryTotal: { k: string; v: string };

  if (isMultiPax) {
    let perPax = "—";
    if (data.price && data.currency) {
      const num = parseFloat(data.price.replace(/\s/g, "").replace(",", "."));
      if (!isNaN(num)) {
        perPax = formatPrice(
          String(Math.round(num / passengerCount)),
          data.currency,
        );
      }
    }
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—" });
    summaryBlocks.push({ k: "Prix / passager", v: perPax });
    summaryTotal = { k: `Prix total (×${passengerCount})`, v: priceStr };
  } else if (isMultiLeg) {
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—" });
    summaryBlocks.push({ k: "Durée totale", v: totalDuration || "—" });
    summaryTotal = { k: "Prix total", v: priceStr };
  } else if (isMaritime) {
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—" });
    const durLabel = maritimeDirections.length >= 2 ? "Durée totale" : "Durée traversée";
    summaryBlocks.push({ k: durLabel, v: totalDuration || "—" });
    summaryTotal = { k: "Prix total", v: priceStr };
  } else {
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—" });
    summaryBlocks.push({
      k: "Date d'émission",
      v: data.issuedDate ? formatDate(data.issuedDate) : "—",
    });
    summaryTotal = { k: "Prix total", v: priceStr };
  }

  // Global leg numbering ("Vol X/Y") runs across ALL directions in order.
  const totalFlightLegs = flightDirections.reduce((n, d) => n + d.legs.length, 0);
  const totalMaritimeLegs = maritimeDirections.reduce(
    (n, d) => n + d.legs.length,
    0,
  );
  let flightLegNo = 0;
  let maritimeLegNo = 0;

  return (
    <Document>
      <Page size="A4" style={[s.page, { backgroundColor: p.bg ?? "#eef1f0", color: p.ink }]}>
        <Band agency={agency} title={title} p={p} />

        {isMultiPax ? (
          <PassengerTableCard data={data} p={p} />
        ) : (
          <PassengerCard fields={cardFields} p={p} />
        )}

        {/* Body — iterate directions, then the connecting legs within each
            direction. Layovers only appear BETWEEN legs of the SAME direction
            (li > 0); a new direction opens a fresh bound. The Aller/Retour label
            comes from the direction's kind, never the leg's array position. */}
        {isMaritime && maritimeDirections.length > 0
          ? maritimeDirections.map((dir, di) =>
              dir.legs.map((leg, li) => {
                maritimeLegNo += 1;
                return (
                  <MaritimeSegment
                    key={`${di}-${li}`}
                    leg={leg}
                    legNo={maritimeLegNo}
                    totalLegs={totalMaritimeLegs}
                    heading={getLegHeading(maritimeDirections, di, leg)}
                    p={p}
                  />
                );
              }),
            )
          : flightDirections.map((dir, di) =>
              dir.legs.map((leg, li) => {
                flightLegNo += 1;
                return (
                  <React.Fragment key={`${di}-${li}`}>
                    {li > 0 ? (
                      <LayoverBlock prev={dir.legs[li - 1]} next={leg} p={p} />
                    ) : null}
                    <FlightSegment
                      leg={leg}
                      legNo={flightLegNo}
                      totalLegs={totalFlightLegs}
                      heading={getLegHeading(flightDirections, di, leg)}
                      isMultiPax={isMultiPax}
                      passengerCount={passengerCount}
                      p={p}
                    />
                  </React.Fragment>
                );
              }),
            )}

        {/* A flex spacer pushes the summary + footer to the bottom of the page,
            so the colored page fills behind them regardless of content length. */}
        <View style={s.grow} />

        <Summary blocks={summaryBlocks} total={summaryTotal} p={p} />
        <Footer agency={agency} isMaritime={isMaritime} p={p} />
      </Page>
    </Document>
  );
}
