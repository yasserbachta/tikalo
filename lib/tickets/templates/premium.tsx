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
// PREMIUM — "Itinéraire Premium"
// ---------------------------------------------------------------------------
// A faithful @react-pdf reproduction of reference/templates/02-premium-itinerary.html.
// Like EDITORIAL it reads every color from the resolved palette catalog entry
// (brand / brand2 / tint / tint2 / ink / muted / line / paper / bg).
//
// Where EDITORIAL is time-forward on a white page, PREMIUM is city-forward on a
// tinted page: a rounded "sheet" floats on the page background, sections sit on
// soft tint panels, and flight details render as rounded pill "pastilles" rather
// than table rows. Display text is Sora; codes / numbers / durations use DM Mono.
//
// Sizing convention (shared with EDITORIAL): the reference is a 760px-wide screen
// sheet that prints to A4. Carry px to pt with 1px = 0.75pt for fixed values and
// let flex / percent widths reflow into the 595pt A4 width.

// ---------------------------------------------------------------------------
// Font registration — local TTFs to avoid remote URL breakage at render time
// ---------------------------------------------------------------------------

const fontsDir = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Sora",
  fonts: [
    { src: path.join(fontsDir, "sora-400.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "sora-500.ttf"), fontWeight: 500 },
    { src: path.join(fontsDir, "sora-600.ttf"), fontWeight: 600 },
    { src: path.join(fontsDir, "sora-700.ttf"), fontWeight: 700 },
    { src: path.join(fontsDir, "sora-800.ttf"), fontWeight: 800 },
  ],
});

Font.register({
  family: "DM Mono",
  fonts: [
    { src: path.join(fontsDir, "dm-mono-400.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "dm-mono-500.ttf"), fontWeight: 500 },
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

// Short "28 Avr" form used in the route's departure / arrival labels.
function formatDayMonth(dateStr: string): string {
  const [, month, day] = dateStr.split("-").map(Number);
  return `${day} ${MOIS[month - 1]}`;
}

function formatPrice(price: string, currency: string): string {
  const num = parseFloat(price.replace(/\s/g, "").replace(",", "."));
  if (isNaN(num)) return `${price} ${currency}`;
  // Intl groups fr-FR with a narrow no-break space (U+202F), which Sora lacks
  // and would drop. Normalize all nbsp variants to a plain ASCII space.
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

// Whole-trip duration = sum of each direction's legs plus its in-direction
// layovers, summed across directions. Never adds a cross-direction gap. Works
// for both flight and maritime legs (shared fields).
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

// Full airport itinerary across every direction, e.g. "ALG › CDG › JFK".
function getItinerary(directions: FlightDirection[]): string {
  const legs = directions.flatMap((d) => d.legs);
  if (legs.length === 0) return "";
  const codes = [legs[0].departureAirport];
  for (const leg of legs) codes.push(leg.arrivalAirport);
  return codes.join(" › ");
}

function getMaritimeTitle(directions: MaritimeDirection[]): string {
  if (directions.length === 1) return "Traversée Maritime";
  if (directions.length === 2 && directions.some((d) => d.kind === "RETURN")) {
    return "Traversée Aller-Retour";
  }
  if (directions.length >= 3) return "Traversée Multi-Étapes";
  return "Traversée Maritime";
}

// The per-leg heading: "Aller — Alger › Paris" (bound label from kind, city
// pair from the leg). A one-way trip has no bound label.
function getLegHeading(
  directions: { kind: FlightDirection["kind"] }[],
  directionIndex: number,
  leg: { departureCity: string; arrivalCity: string },
): string {
  const label = getDirectionLabel(directions, directionIndex);
  const route = `${leg.departureCity} › ${leg.arrivalCity}`;
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
    fontFamily: "Sora",
    fontSize: r(10),
    flexDirection: "column",
  },

  // The white sheet fills the whole page edge-to-edge (no page padding, no outer
  // radius) so the design takes the full page like the classic template.
  sheet: { flexGrow: 1 },

  // pushes the summary + footer to the bottom of the sheet
  grow: { flexGrow: 1 },

  // header
  head: {
    paddingTop: r(26),
    paddingHorizontal: r(40),
    paddingBottom: r(20),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { flexDirection: "row", alignItems: "center", gap: r(13) },
  mk: {
    width: r(44),
    height: r(44),
    borderRadius: r(13),
    alignItems: "center",
    justifyContent: "center",
  },
  bName: { fontSize: r(16), fontWeight: 700 },
  bSlogan: {
    fontSize: r(9),
    fontWeight: 500,
    letterSpacing: r(1.8),
    textTransform: "uppercase",
    marginTop: r(3),
  },
  headR: { alignItems: "flex-end" },
  kchip: {
    fontSize: r(9),
    fontWeight: 700,
    letterSpacing: r(0.9),
    textTransform: "uppercase",
    paddingVertical: r(5),
    paddingHorizontal: r(12),
    borderRadius: r(20),
  },
  ty: { fontSize: r(20), fontWeight: 700, marginTop: r(8) },

  // passenger ribbon
  pax: {
    marginHorizontal: r(40),
    paddingVertical: r(16),
    paddingHorizontal: r(22),
    borderRadius: r(14),
    flexDirection: "row",
    justifyContent: "space-between",
    gap: r(16),
    flexWrap: "wrap",
  },
  f: { flexShrink: 1 },
  fK: {
    fontSize: r(8),
    fontWeight: 600,
    letterSpacing: r(1.3),
    textTransform: "uppercase",
    marginBottom: r(5),
  },
  fV: { fontSize: r(14), fontWeight: 600 },
  fVbig: { fontSize: r(19), fontWeight: 700 },
  fVmono: { fontFamily: "DM Mono", fontSize: r(13), fontWeight: 500 },

  // passenger table (multi)
  paxtab: {
    marginHorizontal: r(40),
    paddingVertical: r(16),
    paddingHorizontal: r(22),
    borderRadius: r(14),
  },
  paxCap: { flexDirection: "row", alignItems: "center", gap: r(9), marginBottom: r(12) },
  pbadge: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(0.5),
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
  paxColCompany: { flex: 1.3 },
  paxHdCell: {
    fontSize: r(7.5),
    fontWeight: 700,
    letterSpacing: r(1.1),
    textTransform: "uppercase",
  },
  paxNmCell: { fontSize: r(15), fontWeight: 700 },
  paxVvCell: { fontFamily: "DM Mono", fontSize: r(12.5), fontWeight: 500 },
  paxVvText: { fontFamily: "Sora", fontSize: r(13), fontWeight: 600 },

  // segment label
  seg: {
    marginHorizontal: r(40),
    marginTop: r(16),
    flexDirection: "row",
    alignItems: "center",
    gap: r(12),
  },
  segNo: {
    fontFamily: "DM Mono",
    fontSize: r(11),
    fontWeight: 500,
    paddingVertical: r(4),
    paddingHorizontal: r(10),
    borderRadius: r(7),
  },
  segDir: { fontSize: r(11), fontWeight: 600, letterSpacing: r(0.4) },

  // hero — city-forward route
  hero: {
    marginHorizontal: r(40),
    marginTop: r(9),
    borderWidth: r(1.5),
    borderRadius: r(18),
    paddingTop: r(20),
    paddingHorizontal: r(30),
    paddingBottom: r(16),
  },
  route: { flexDirection: "row", alignItems: "flex-start", gap: r(18) },
  ep: { width: "38%" },
  epR: { width: "38%", alignItems: "flex-end" },
  city: { fontSize: r(29), fontWeight: 700, letterSpacing: r(-0.6), lineHeight: 1.02 },
  iata: {
    fontFamily: "DM Mono",
    fontSize: r(11),
    fontWeight: 500,
    marginTop: r(8),
    letterSpacing: r(0.6),
  },
  apt: { fontSize: r(10), marginTop: r(5) },
  time: { fontSize: r(23), fontWeight: 700, marginTop: r(12) },
  timeSup: { fontSize: r(11), fontWeight: 700 },
  tlbl: {
    fontSize: r(8),
    fontWeight: 600,
    letterSpacing: r(1.3),
    textTransform: "uppercase",
    marginTop: r(3),
  },

  conn: { flex: 1, alignItems: "center", paddingTop: r(6) },
  dur: { fontSize: r(11), fontWeight: 700 },
  cline: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    marginTop: r(10),
    marginBottom: r(6),
  },
  cseg: {
    flex: 1,
    borderTopWidth: r(2),
    borderTopStyle: "dashed",
    opacity: 0.55,
  },
  cplane: {
    width: r(30),
    height: r(30),
    borderRadius: r(15),
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: r(6),
  },
  ftype: {
    fontSize: r(9),
    fontWeight: 500,
    letterSpacing: r(0.9),
    textTransform: "uppercase",
  },

  // detail pastilles
  chips: { flexDirection: "row", flexWrap: "wrap", gap: r(8), marginTop: r(14) },
  chip: { borderWidth: r(1.5), borderRadius: r(11), paddingVertical: r(8), paddingHorizontal: r(13) },
  chipI: {
    fontSize: r(7.5),
    fontWeight: 600,
    letterSpacing: r(1),
    textTransform: "uppercase",
    marginBottom: r(3),
  },
  chipBwrap: { flexDirection: "row", alignItems: "center" },
  chipB: { fontSize: r(12.5), fontWeight: 700 },
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
    marginHorizontal: r(40),
    marginTop: r(12),
    flexDirection: "row",
    alignItems: "center",
    gap: r(10),
    paddingVertical: r(10),
    paddingHorizontal: r(18),
    borderRadius: r(11),
  },
  layoverT: { fontSize: r(11), fontWeight: 600 },
  layoverD: {
    marginLeft: "auto",
    fontFamily: "DM Mono",
    fontSize: r(11),
    fontWeight: 500,
  },

  // summary
  summary: {
    marginHorizontal: r(40),
    marginVertical: r(16),
    borderWidth: r(1.5),
    borderRadius: r(16),
    paddingVertical: r(20),
    paddingHorizontal: r(26),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: r(18),
  },
  sMeta: { flexDirection: "row", gap: r(34), flexWrap: "wrap" },
  sK: {
    fontSize: r(8),
    fontWeight: 600,
    letterSpacing: r(1.1),
    textTransform: "uppercase",
    marginBottom: r(5),
  },
  sV: { fontSize: r(14), fontWeight: 700 },
  sVmono: { fontFamily: "DM Mono", fontWeight: 500 },
  sPrice: { alignItems: "flex-end" },
  sAmt: { fontSize: r(27), fontWeight: 800 },

  // footer
  foot: {
    paddingVertical: r(20),
    paddingHorizontal: r(40),
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: r(16),
  },
  footN: { fontSize: r(12), fontWeight: 700 },
  footA: { fontSize: r(10), marginTop: r(4), lineHeight: 1.6 },
  cts: { alignItems: "flex-end", gap: r(5) },
  ct: { flexDirection: "row", alignItems: "center", gap: r(6), justifyContent: "flex-end" },
  ctText: { fontSize: r(10), fontWeight: 600 },
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
    <Svg width={r(15)} height={r(15)} viewBox="0 0 24 24">
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

function Header({
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
    <View style={s.head}>
      <View style={s.logo}>
        <View style={[s.mk, { backgroundColor: p.brand }]}>
          <PlaneIcon size={r(25)} color="#ffffff" />
        </View>
        <View>
          <Text style={[s.bName, { color: p.ink }]}>{name}</Text>
          {slogan ? (
            <Text style={[s.bSlogan, { color: p.muted }]}>{slogan}</Text>
          ) : null}
        </View>
      </View>
      <View style={s.headR}>
        <Text style={[s.kchip, { backgroundColor: p.tint, color: p.brand }]}>
          Billet Électronique
        </Text>
        <Text style={[s.ty, { color: p.ink }]}>{title}</Text>
      </View>
    </View>
  );
}

type Field = { k: string; v: string; variant?: "big" | "mono" };

function PassengerRibbon({ fields, p }: { fields: Field[]; p: PaletteColors }) {
  return (
    <View style={[s.pax, { backgroundColor: p.tint }]}>
      {fields.map((f, i) => (
        <View key={i} style={s.f}>
          <Text style={[s.fK, { color: p.muted }]}>{f.k}</Text>
          <Text
            style={[
              f.variant === "big" ? s.fVbig : f.variant === "mono" ? s.fVmono : s.fV,
              { color: p.ink },
            ]}
          >
            {f.v}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PassengerTable({ data, p }: { data: TicketData; p: PaletteColors }) {
  const passengers = data.passengers ?? [];
  const airline =
    getFlightDirections(data)[0]?.legs[0]?.airline ??
    getMaritimeDirections(data)[0]?.legs[0]?.company ??
    "";
  return (
    <View style={[s.paxtab, { backgroundColor: p.tint }]}>
      <View style={s.paxCap}>
        <Text style={[s.fK, { color: p.muted, marginBottom: 0 }]}>Passagers</Text>
        <Text style={[s.pbadge, { backgroundColor: p.brand }]}>
          {passengers.length} Voyageur{passengers.length > 1 ? "s" : ""}
        </Text>
      </View>
      <View style={s.paxRowHd}>
        <Text style={[s.paxColName, s.paxHdCell, { color: p.muted }]}>Nom</Text>
        <Text style={[s.paxColTicket, s.paxHdCell, { color: p.muted }]}>Billet No.</Text>
        <Text style={[s.paxColCompany, s.paxHdCell, { color: p.muted }]}>Compagnie</Text>
      </View>
      {passengers.map((pax, i) => (
        <View key={i} style={[s.paxRow, s.paxRowBd, { borderTopColor: p.tint2 ?? p.line }]}>
          <Text style={[s.paxColName, s.paxNmCell, { color: p.ink }]}>{pax.name}</Text>
          <Text style={[s.paxColTicket, s.paxVvCell, { color: p.ink }]}>
            {pax.ticketNumber ?? "—"}
          </Text>
          <Text style={[s.paxColCompany, s.paxVvText, { color: p.ink }]}>{airline}</Text>
        </View>
      ))}
    </View>
  );
}

type Chip = { k: string; v: string; badge?: string };

function Pastille({ item, p }: { item: Chip; p: PaletteColors }) {
  return (
    <View style={[s.chip, { backgroundColor: p.paper ?? "#ffffff", borderColor: p.line }]}>
      <Text style={[s.chipI, { color: p.muted }]}>{item.k}</Text>
      <View style={s.chipBwrap}>
        <Text style={[s.chipB, { color: p.ink }]}>{item.v}</Text>
        {item.badge ? (
          <Text style={[s.cbadge, { backgroundColor: p.brand }]}>{item.badge}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Hero({
  depCity,
  depCode,
  depApt,
  depTime,
  depLabel,
  arrCity,
  arrCode,
  arrApt,
  arrTime,
  arrLabel,
  arrNextDay,
  durText,
  ftype,
  isMaritime,
  chips,
  p,
}: {
  depCity: string;
  depCode: string;
  depApt: string;
  depTime: string;
  depLabel: string;
  arrCity: string;
  arrCode: string;
  arrApt: string;
  arrTime: string;
  arrLabel: string;
  arrNextDay: boolean;
  durText: string;
  ftype: string;
  isMaritime: boolean;
  chips: Chip[];
  p: PaletteColors;
}) {
  return (
    <View style={[s.hero, { backgroundColor: p.tint, borderColor: p.line }]} wrap={false}>
      <View style={s.route}>
        <View style={s.ep}>
          <Text style={[s.city, { color: p.ink }]}>{depCity}</Text>
          <Text style={[s.iata, { color: p.brand }]}>{depCode}</Text>
          {depApt ? <Text style={[s.apt, { color: p.muted }]}>{depApt}</Text> : null}
          <Text style={[s.time, { color: p.ink }]}>{depTime}</Text>
          {depLabel ? <Text style={[s.tlbl, { color: p.muted }]}>{depLabel}</Text> : null}
        </View>
        <View style={s.conn}>
          {durText ? <Text style={[s.dur, { color: p.brand }]}>{durText}</Text> : null}
          <View style={s.cline}>
            <View style={[s.cseg, { borderTopColor: p.brand }]} />
            <View style={[s.cplane, { backgroundColor: p.brand }]}>
              {isMaritime ? (
                <ShipIcon size={r(16)} color="#ffffff" />
              ) : (
                <PlaneIcon size={r(16)} color="#ffffff" />
              )}
            </View>
            <View style={[s.cseg, { borderTopColor: p.brand }]} />
          </View>
          {ftype ? <Text style={[s.ftype, { color: p.muted }]}>{ftype}</Text> : null}
        </View>
        <View style={s.epR}>
          <Text style={[s.city, { color: p.ink, textAlign: "right" }]}>{arrCity}</Text>
          <Text style={[s.iata, { color: p.brand, textAlign: "right" }]}>{arrCode}</Text>
          {arrApt ? (
            <Text style={[s.apt, { color: p.muted, textAlign: "right" }]}>{arrApt}</Text>
          ) : null}
          <Text style={[s.time, { color: p.ink, textAlign: "right" }]}>
            {arrTime}
            {arrNextDay ? <Text style={s.timeSup}> +1</Text> : null}
          </Text>
          {arrLabel ? (
            <Text style={[s.tlbl, { color: p.muted, textAlign: "right" }]}>{arrLabel}</Text>
          ) : null}
        </View>
      </View>
      <View style={s.chips}>
        {chips.map((c, i) => (
          <Pastille key={i} item={c} p={p} />
        ))}
      </View>
    </View>
  );
}

function SegmentLabel({ no, dir, p }: { no: string; dir: string; p: PaletteColors }) {
  return (
    <View style={s.seg} wrap={false}>
      <Text style={[s.segNo, { color: p.brand, backgroundColor: p.tint }]}>{no}</Text>
      <Text style={[s.segDir, { color: p.muted }]}>{dir}</Text>
    </View>
  );
}

function FlightSegment({
  leg,
  legNo,
  total,
  directions,
  directionIndex,
  ticketType,
  isMultiPax,
  passengerCount,
  p,
}: {
  leg: FlightLeg;
  legNo: number;
  total: number;
  directions: FlightDirection[];
  directionIndex: number;
  ticketType: TicketData["type"];
  isMultiPax: boolean;
  passengerCount: number;
  p: PaletteColors;
}) {
  const isMultiLeg = ticketType === "MULTI_LEG";
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

  // Center "ftype" label: multi-pax › "N adultes", multi-leg › airline,
  // otherwise "Vol direct".
  let ftype = "Vol direct";
  if (isMultiPax) {
    ftype = `${passengerCount} adulte${passengerCount > 1 ? "s" : ""}`;
  } else if (isMultiLeg) {
    ftype = leg.airline;
  }

  const segNo = `Vol ${legNo} / ${total}`;
  const segDir = getLegHeading(directions, directionIndex, leg);

  // Pastille sets mirror the reference: multi-pax drops "Compagnie" (it lives in
  // the passenger table) and shows a "Passagers" pill instead.
  let chips: Chip[];
  if (isMultiPax) {
    chips = [
      { k: "Vol", v: leg.flightNumber },
      { k: "Date", v: formatDate(leg.departureDate) },
      { k: "Cabine", v: leg.cabin ?? "Economy" },
      { k: "Passagers", v: `${passengerCount} adulte${passengerCount > 1 ? "s" : ""}` },
      {
        k: "Bagages",
        v: leg.baggageAllowance ? `${leg.baggageAllowance} / pers.` : "—",
      },
    ];
  } else {
    chips = [
      { k: "Compagnie", v: leg.airline },
      { k: "Vol", v: leg.flightNumber },
      { k: "Date", v: formatDate(leg.departureDate) },
      { k: "Cabine", v: leg.cabin ?? "Economy" },
      { k: "Bagages", v: leg.baggageAllowance ?? "—" },
    ];
  }

  return (
    <>
      <SegmentLabel no={segNo} dir={segDir} p={p} />
      <Hero
        depCity={leg.departureCity}
        depCode={leg.departureAirport}
        depApt={leg.departureCity}
        depTime={leg.departureTime}
        depLabel={`Départ · ${formatDayMonth(leg.departureDate)}`}
        arrCity={leg.arrivalCity}
        arrCode={leg.arrivalAirport}
        arrApt={leg.arrivalCity}
        arrTime={leg.arrivalTime ?? ""}
        arrLabel={
          leg.arrivalDate
            ? `Arrivée · ${formatDayMonth(leg.arrivalDate)}`
            : "Arrivée"
        }
        arrNextDay={nextDay}
        durText={duration}
        ftype={ftype}
        isMaritime={false}
        chips={chips}
        p={p}
      />
    </>
  );
}

function MaritimeSegment({
  leg,
  legNo,
  total,
  directions,
  directionIndex,
  p,
}: {
  leg: MaritimeLeg;
  legNo: number;
  total: number;
  directions: MaritimeDirection[];
  directionIndex: number;
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

  const chips: Chip[] = [{ k: "Compagnie", v: leg.company }];
  if (leg.cabinNumber || leg.cabinType) {
    chips.push({
      k: "Cabine",
      v: leg.cabinNumber ?? "—",
      badge: leg.cabinType ?? undefined,
    });
  }
  chips.push({ k: "Navire", v: leg.shipName });
  if (leg.deckNumber) chips.push({ k: "Pont", v: leg.deckNumber });
  chips.push({ k: "Date départ", v: formatDate(leg.departureDate) });
  chips.push({
    k: "Véhicule",
    v: leg.hasVehicle ? (leg.vehicleType ?? "Véhicule") : "Sans véhicule",
  });

  return (
    <>
      <SegmentLabel
        no={`Traversée ${legNo} / ${total}`}
        dir={getLegHeading(directions, directionIndex, leg)}
        p={p}
      />
      <Hero
        depCity={leg.departureCity}
        depCode={leg.departurePort}
        depApt="Gare maritime"
        depTime={leg.departureTime}
        depLabel={`Embarquement · ${formatDayMonth(leg.departureDate)}`}
        arrCity={leg.arrivalCity}
        arrCode={leg.arrivalPort}
        arrApt="Gare maritime"
        arrTime={leg.arrivalTime ?? ""}
        arrLabel={
          leg.arrivalDate
            ? `Arrivée · ${formatDayMonth(leg.arrivalDate)}`
            : "Arrivée"
        }
        arrNextDay={nextDay}
        durText={duration}
        ftype="Par mer"
        isMaritime
        chips={chips}
        p={p}
      />
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
    <View style={[s.layover, { backgroundColor: p.tint }]} wrap={false}>
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
  blocks: { k: string; v: string; mono?: boolean }[];
  total: { k: string; v: string };
  p: PaletteColors;
}) {
  return (
    <View style={[s.summary, { borderColor: p.line }]} wrap={false}>
      <View style={s.sMeta}>
        {blocks.map((b, i) => (
          <View key={i}>
            <Text style={[s.sK, { color: p.muted }]}>{b.k}</Text>
            <Text
              style={
                b.mono
                  ? [s.sV, s.sVmono, { color: p.ink }]
                  : [s.sV, { color: p.ink }]
              }
            >
              {b.v}
            </Text>
          </View>
        ))}
      </View>
      <View style={s.sPrice}>
        <Text style={[s.sK, { color: p.brand }]}>{total.k}</Text>
        <Text style={[s.sAmt, { color: p.brand }]}>{total.v}</Text>
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
      <View style={[s.foot, { backgroundColor: p.tint }]} wrap={false}>
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

export function PremiumTemplate({ data, agency, palette }: TemplateProps) {
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

  // Single-passenger ribbon fields. The fourth field is the itinerary for
  // multi-leg, otherwise the issue date.
  const lastField: Field =
    isMultiLeg
      ? { k: "Itinéraire", v: getItinerary(flightDirections) }
      : {
          k: "Émission",
          v: data.issuedDate ? formatDate(data.issuedDate) : "—",
        };
  const ribbonFields: Field[] = [
    { k: "Passager", v: passengers[0]?.name ?? "", variant: "big" },
    { k: "Billet No.", v: passengers[0]?.ticketNumber ?? "—", variant: "mono" },
    { k: "Référence (PNR)", v: data.bookingReference ?? "—", variant: "mono" },
    lastField,
  ];

  // Summary blocks vary by ticket type (mirrors EDITORIAL).
  let totalDuration = "";
  if (isMultiLeg && flightDirections.length > 0) {
    totalDuration = computeTripDuration(flightDirections);
  } else if (isMaritime && maritimeDirections.length > 0) {
    totalDuration = computeTripDuration(maritimeDirections);
  }

  const priceStr =
    data.price && data.currency ? formatPrice(data.price, data.currency) : "—";

  // Global 1-based leg counters + totals across all directions for "Vol X/Y".
  const totalFlightLegs = flightDirections.reduce(
    (n, d) => n + d.legs.length,
    0,
  );
  const totalMaritimeLegs = maritimeDirections.reduce(
    (n, d) => n + d.legs.length,
    0,
  );
  let flightLegNo = 0;
  let maritimeLegNo = 0;

  const summaryBlocks: { k: string; v: string; mono?: boolean }[] = [];
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
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—", mono: true });
    summaryBlocks.push({ k: "Prix / passager", v: perPax });
    summaryTotal = { k: `Prix total (×${passengerCount})`, v: priceStr };
  } else if (isMultiLeg) {
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—", mono: true });
    summaryBlocks.push({ k: "Durée totale", v: totalDuration || "—" });
    summaryTotal = { k: "Prix total", v: priceStr };
  } else if (isMaritime) {
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—", mono: true });
    const durLabel = maritimeDirections.length >= 2 ? "Durée totale" : "Durée traversée";
    summaryBlocks.push({ k: durLabel, v: totalDuration || "—" });
    summaryTotal = { k: "Prix total", v: priceStr };
  } else {
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—", mono: true });
    summaryBlocks.push({
      k: "Date d'émission",
      v: data.issuedDate ? formatDate(data.issuedDate) : "—",
    });
    summaryTotal = { k: "Prix total", v: priceStr };
  }

  return (
    <Document>
      <Page size="A4" style={[s.page, { backgroundColor: p.bg ?? "#efe9e4", color: p.ink }]}>
        <View style={[s.sheet, { backgroundColor: p.paper ?? "#ffffff" }]}>
          <Header agency={agency} title={title} p={p} />

          {isMultiPax ? (
            <PassengerTable data={data} p={p} />
          ) : (
            <PassengerRibbon fields={ribbonFields} p={p} />
          )}

          {/* Iterate directions, then the connecting legs within each
              direction. A layover only appears BETWEEN legs of the same
              direction (li > 0); a new direction starts a fresh bound. */}
          {isMaritime && maritimeDirections.length > 0
            ? maritimeDirections.map((dir, di) =>
                dir.legs.map((leg, li) => {
                  maritimeLegNo += 1;
                  return (
                    <MaritimeSegment
                      key={`${di}-${li}`}
                      leg={leg}
                      legNo={maritimeLegNo}
                      total={totalMaritimeLegs}
                      directions={maritimeDirections}
                      directionIndex={di}
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
                        total={totalFlightLegs}
                        directions={flightDirections}
                        directionIndex={di}
                        ticketType={data.type}
                        isMultiPax={isMultiPax}
                        passengerCount={passengerCount}
                        p={p}
                      />
                    </React.Fragment>
                  );
                }),
              )}

          <View style={s.grow} />

          <Summary blocks={summaryBlocks} total={summaryTotal} p={p} />
          <Footer agency={agency} isMaritime={isMaritime} p={p} />
        </View>
      </Page>
    </Document>
  );
}
