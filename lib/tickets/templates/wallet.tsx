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
// WALLET — "Wallet Pass" (clear single-column boarding pass)
// ---------------------------------------------------------------------------
// A calm, scannable boarding pass read strictly top-to-bottom as full-width
// bands: a solid brand header, a passenger strip, an oversized IATA route, a
// labelled "flight details" grid, a bold price band, and a contact footer.
// No side columns, no barcode, no gradients — solid fills only, high
// ink/paper contrast, full-bleed on a single A4 page. Colors come from the
// resolved palette catalog entry (brand / brand2 / ink / muted / line / soft /
// bg). Display text is Outfit; codes use DM Mono.
//
// Sizing convention (shared with EDITORIAL / PREMIUM / BOLD): the reference is a
// 760px-wide screen sheet that prints to A4. Carry px to pt with 1px = 0.75pt.

// ---------------------------------------------------------------------------
// Font registration — local TTFs to avoid remote URL breakage at render time
// ---------------------------------------------------------------------------

const fontsDir = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Outfit",
  fonts: [
    { src: path.join(fontsDir, "outfit-400.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "outfit-500.ttf"), fontWeight: 500 },
    { src: path.join(fontsDir, "outfit-600.ttf"), fontWeight: 600 },
    { src: path.join(fontsDir, "outfit-700.ttf"), fontWeight: 700 },
    { src: path.join(fontsDir, "outfit-800.ttf"), fontWeight: 800 },
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
// French months + date / number / duration helpers (mirrors bold.tsx)
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

// Whole-trip duration = sum of each direction's own duration (its legs +
// in-direction layovers). Never adds a layover ACROSS two directions. Works for
// both flight and maritime legs. Mirrors classic.tsx's computeTripDuration.
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
  if (directions.length === 1) return "Maritime";
  if (directions.length === 2 && directions.some((d) => d.kind === "RETURN")) {
    return "Maritime A-R";
  }
  if (directions.length >= 3) return "Maritime Multi-Étapes";
  return "Maritime";
}

const TYPE_TITLES: Record<string, string> = {
  ONE_WAY: "Aller Simple",
  ROUND_TRIP: "Aller-Retour",
  MULTI_LEG: "Multi-Escale",
  MARITIME: "Maritime",
};

// ---------------------------------------------------------------------------
// px to pt scale (see header note)
// ---------------------------------------------------------------------------

const K = 0.75;
const r = (n: number) => n * K;

// Translucent whites that composite to a flat tone over the solid brand band,
// so they print cleanly (no real transparency in the output).
const W82 = "rgba(255,255,255,0.82)";
const W70 = "rgba(255,255,255,0.70)";
const W16 = "rgba(255,255,255,0.16)";

const PADX = r(40); // shared horizontal page padding for every band

const s = StyleSheet.create({
  page: {
    fontFamily: "Outfit",
    fontSize: r(10),
    backgroundColor: "#ffffff",
    flexDirection: "column",
  },
  pass: { backgroundColor: "#ffffff", flexGrow: 1, flexDirection: "column" },
  grow: { flexGrow: 1, minHeight: r(20) },

  // ---- header band (solid brand) -----------------------------------------
  hdr: {
    paddingTop: r(28),
    paddingHorizontal: PADX,
    paddingBottom: r(26),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logo: { flexDirection: "row", alignItems: "center", gap: r(12) },
  mk: {
    width: r(40),
    height: r(40),
    borderRadius: r(11),
    backgroundColor: W16,
    alignItems: "center",
    justifyContent: "center",
  },
  bName: { fontSize: r(16), fontWeight: 800, color: "#ffffff", letterSpacing: r(0.2) },
  bSlogan: {
    fontSize: r(8.5),
    fontWeight: 600,
    letterSpacing: r(1.7),
    textTransform: "uppercase",
    marginTop: r(2),
    color: W82,
  },
  hdrR: { alignItems: "flex-end" },
  hdrEyebrow: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(2),
    textTransform: "uppercase",
    color: W82,
  },
  hdrType: { fontSize: r(20), fontWeight: 800, color: "#ffffff", marginTop: r(4) },

  // ---- passenger strip (soft band) ---------------------------------------
  paxBand: {
    paddingVertical: r(16),
    paddingHorizontal: PADX,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: r(22),
    flexWrap: "wrap",
  },
  paxItem: { flexShrink: 1 },
  fldK: {
    fontSize: r(8),
    fontWeight: 700,
    letterSpacing: r(1.3),
    textTransform: "uppercase",
    marginBottom: r(5),
  },
  paxName: { fontSize: r(18), fontWeight: 800, letterSpacing: r(-0.2) },
  fldV: { fontSize: r(13), fontWeight: 700 },
  fldVmono: { fontFamily: "DM Mono", fontSize: r(12.5), fontWeight: 500 },

  // passenger strip — table variant (multi)
  paxTab: { paddingVertical: r(16), paddingHorizontal: PADX },
  paxCap: { flexDirection: "row", alignItems: "center", gap: r(9), marginBottom: r(10) },
  pbadge: {
    fontSize: r(8),
    fontWeight: 700,
    letterSpacing: r(0.6),
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: r(3),
    paddingHorizontal: r(9),
    borderRadius: r(20),
  },
  paxRowHd: { flexDirection: "row", paddingBottom: r(7) },
  paxRow: { flexDirection: "row", paddingVertical: r(7), borderTopWidth: r(1), borderTopStyle: "dashed" },
  paxColName: { flex: 2, paddingRight: r(12) },
  paxColTicket: { flex: 1.6, paddingRight: r(12) },
  paxColCompany: { flex: 1.3 },
  paxHd: { fontSize: r(7.5), fontWeight: 700, letterSpacing: r(1), textTransform: "uppercase" },
  paxNm: { fontSize: r(13.5), fontWeight: 800 },
  paxVv: { fontFamily: "DM Mono", fontSize: r(11.5), fontWeight: 500 },
  paxVvText: { fontSize: r(12), fontWeight: 600 },

  // ---- route hero (white) ------------------------------------------------
  hero: {
    paddingHorizontal: PADX,
    paddingTop: r(32),
    paddingBottom: r(30),
    flexDirection: "row",
    alignItems: "flex-start",
    gap: r(16),
  },
  end: { minWidth: r(96) },
  endR: { minWidth: r(96), alignItems: "flex-end" },
  iata: { fontFamily: "DM Mono", fontSize: r(50), fontWeight: 500, letterSpacing: r(1), lineHeight: 1 },
  city: { fontSize: r(11.5), fontWeight: 600, marginTop: r(9) },
  time: { fontSize: r(21), fontWeight: 800, marginTop: r(12) },
  timeSup: { fontSize: r(11), fontWeight: 800 },
  dlbl: {
    fontSize: r(8),
    fontWeight: 600,
    letterSpacing: r(0.8),
    textTransform: "uppercase",
    marginTop: r(4),
  },
  mid: { flex: 1, alignItems: "center", paddingTop: r(12), gap: r(9) },
  durChip: {
    color: "#ffffff",
    fontSize: r(9.5),
    fontWeight: 700,
    letterSpacing: r(0.3),
    paddingVertical: r(5),
    paddingHorizontal: r(14),
    borderRadius: r(20),
  },
  pathline: { width: "100%", flexDirection: "row", alignItems: "center" },
  pathbar: { flex: 1, borderTopWidth: r(1.5), borderTopStyle: "dashed" },
  ftype: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(1.2),
    textTransform: "uppercase",
  },

  // ---- stacked legs (round-trip / multi-leg / multi-journey maritime) -----
  stack: { paddingHorizontal: PADX, paddingTop: r(26), paddingBottom: r(6) },
  legRow: { paddingVertical: r(13) },
  legRowBd: { borderTopWidth: r(1), borderTopStyle: "dashed" },
  legTop: { flexDirection: "row", alignItems: "center", gap: r(10) },
  legBadge: {
    fontSize: r(8),
    fontWeight: 700,
    letterSpacing: r(0.6),
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: r(3),
    paddingHorizontal: r(9),
    borderRadius: r(5),
  },
  legCodes: { fontFamily: "DM Mono", fontSize: r(20), fontWeight: 500, letterSpacing: r(0.5) },
  legArrow: { fontFamily: "DM Mono", fontSize: r(15), marginHorizontal: r(4) },
  legTimes: { marginLeft: "auto", fontSize: r(12.5), fontWeight: 700 },
  legMeta: { fontSize: r(9.5), marginTop: r(5) },
  legWait: { fontSize: r(9), marginTop: r(3) },

  // ---- details section ----------------------------------------------------
  section: { paddingHorizontal: PADX, paddingTop: r(8) },
  secHead: { flexDirection: "row", alignItems: "center", gap: r(12), marginBottom: r(14) },
  secTitle: {
    fontSize: r(9),
    fontWeight: 800,
    letterSpacing: r(1.6),
    textTransform: "uppercase",
  },
  secRule: { flex: 1, height: r(1) },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  gcell: { width: "33.333%", marginBottom: r(16), paddingRight: r(14) },
  gK: {
    fontSize: r(8),
    fontWeight: 700,
    letterSpacing: r(1.1),
    textTransform: "uppercase",
    marginBottom: r(5),
  },
  gVwrap: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  gV: { fontSize: r(13.5), fontWeight: 700 },
  gVmono: { fontFamily: "DM Mono", fontSize: r(12.5), fontWeight: 500 },
  cbadge: {
    fontSize: r(7.5),
    fontWeight: 700,
    letterSpacing: r(0.5),
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: r(2),
    paddingHorizontal: r(7),
    borderRadius: r(6),
    marginLeft: r(6),
  },

  // ---- price band (solid brand, bottom bookend) --------------------------
  priceBand: {
    backgroundColor: "#000000",
    paddingVertical: r(22),
    paddingHorizontal: PADX,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: r(18),
  },
  pbBlock: { flexShrink: 1 },
  pbK: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(1.4),
    textTransform: "uppercase",
    marginBottom: r(6),
    color: W70,
  },
  pbV: { fontSize: r(15), fontWeight: 800, color: "#ffffff" },
  pbVmono: { fontFamily: "DM Mono", fontSize: r(16), fontWeight: 500, color: "#ffffff", letterSpacing: r(1.2) },
  pbRight: { alignItems: "flex-end" },
  pbPrice: { fontSize: r(28), fontWeight: 800, color: "#ffffff", letterSpacing: r(-0.4) },

  // ---- footer -------------------------------------------------------------
  foot: {
    borderTopWidth: r(1),
    paddingTop: r(16),
    paddingHorizontal: PADX,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: r(12),
    flexWrap: "wrap",
  },
  footN: { fontSize: r(11), fontWeight: 800 },
  footA: { fontSize: r(9), marginTop: r(3), lineHeight: 1.5 },
  cts: { alignItems: "flex-end", gap: r(3) },
  ctB: { fontSize: r(9), fontWeight: 700 },
  ct: { fontSize: r(9) },
  gen: {
    fontSize: r(8),
    textAlign: "center",
    lineHeight: 1.5,
    paddingTop: r(10),
    paddingBottom: r(16),
    paddingHorizontal: PADX,
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({
  agency,
  eyebrow,
  typeLabel,
  p,
}: {
  agency: TemplateProps["agency"];
  eyebrow: string;
  typeLabel: string;
  p: PaletteColors;
}) {
  const name = agency.name ?? "Tikalo";
  const slogan = agency.slogan ?? "Agence de Voyages";
  return (
    <View style={[s.hdr, { backgroundColor: p.brand }]}>
      <View style={s.logo}>
        <View style={s.mk}>
          <PlaneIcon size={r(22)} color="#ffffff" />
        </View>
        <View>
          <Text style={s.bName}>{name}</Text>
          {slogan ? <Text style={s.bSlogan}>{slogan}</Text> : null}
        </View>
      </View>
      <View style={s.hdrR}>
        <Text style={s.hdrEyebrow}>{eyebrow}</Text>
        <Text style={s.hdrType}>{typeLabel}</Text>
      </View>
    </View>
  );
}

type PaxItem = { k: string; v: string; mono?: boolean; big?: boolean };

function PassengerBand({ items, p }: { items: PaxItem[]; p: PaletteColors }) {
  return (
    <View style={[s.paxBand, { backgroundColor: p.soft ?? "#f6f1f2" }]}>
      {items.map((it, i) => (
        <View key={i} style={s.paxItem}>
          <Text style={[s.fldK, { color: p.muted }]}>{it.k}</Text>
          <Text
            style={[
              it.big ? s.paxName : it.mono ? s.fldVmono : s.fldV,
              { color: p.ink },
            ]}
          >
            {it.v}
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
    <View style={[s.paxTab, { backgroundColor: p.soft ?? "#f6f1f2" }]}>
      <View style={s.paxCap}>
        <Text style={[s.fldK, { color: p.muted, marginBottom: 0 }]}>Passagers</Text>
        <Text style={[s.pbadge, { backgroundColor: p.brand }]}>
          {passengers.length} Voyageur{passengers.length > 1 ? "s" : ""}
        </Text>
      </View>
      <View style={s.paxRowHd}>
        <Text style={[s.paxColName, s.paxHd, { color: p.muted }]}>Nom</Text>
        <Text style={[s.paxColTicket, s.paxHd, { color: p.muted }]}>Billet No.</Text>
        <Text style={[s.paxColCompany, s.paxHd, { color: p.muted }]}>Compagnie</Text>
      </View>
      {passengers.map((pax, i) => (
        <View key={i} style={[s.paxRow, { borderTopColor: p.line }]}>
          <Text style={[s.paxColName, s.paxNm, { color: p.ink }]}>{pax.name}</Text>
          <Text style={[s.paxColTicket, s.paxVv, { color: p.ink }]}>
            {pax.ticketNumber ?? "—"}
          </Text>
          <Text style={[s.paxColCompany, s.paxVvText, { color: p.ink }]}>{airline}</Text>
        </View>
      ))}
    </View>
  );
}

function HeroRoute({
  depCode,
  depCity,
  depTime,
  depLabel,
  arrCode,
  arrCity,
  arrTime,
  arrLabel,
  arrNextDay,
  durText,
  ftype,
  isMaritime,
  p,
}: {
  depCode: string;
  depCity: string;
  depTime: string;
  depLabel: string;
  arrCode: string;
  arrCity: string;
  arrTime: string;
  arrLabel: string;
  arrNextDay: boolean;
  durText: string;
  ftype: string;
  isMaritime: boolean;
  p: PaletteColors;
}) {
  return (
    <View style={s.hero}>
      <View style={s.end}>
        <Text style={[s.iata, { color: p.ink }]}>{depCode}</Text>
        <Text style={[s.city, { color: p.muted }]}>{depCity}</Text>
        <Text style={[s.time, { color: p.brand }]}>{depTime}</Text>
        {depLabel ? <Text style={[s.dlbl, { color: p.muted }]}>{depLabel}</Text> : null}
      </View>
      <View style={s.mid}>
        {durText ? <Text style={[s.durChip, { backgroundColor: p.brand }]}>{durText}</Text> : null}
        <View style={s.pathline}>
          <View style={[s.pathbar, { borderTopColor: p.line }]} />
          {isMaritime ? (
            <ShipIcon size={r(18)} color={p.brand} />
          ) : (
            <PlaneIcon size={r(18)} color={p.brand} />
          )}
          <View style={[s.pathbar, { borderTopColor: p.line }]} />
        </View>
        {ftype ? <Text style={[s.ftype, { color: p.muted }]}>{ftype}</Text> : null}
      </View>
      <View style={s.endR}>
        <Text style={[s.iata, { color: p.ink, textAlign: "right" }]}>{arrCode}</Text>
        <Text style={[s.city, { color: p.muted, textAlign: "right" }]}>{arrCity}</Text>
        <Text style={[s.time, { color: p.brand, textAlign: "right" }]}>
          {arrTime}
          {arrNextDay ? <Text style={s.timeSup}>+1</Text> : null}
        </Text>
        {arrLabel ? (
          <Text style={[s.dlbl, { color: p.muted, textAlign: "right" }]}>{arrLabel}</Text>
        ) : null}
      </View>
    </View>
  );
}

type Leg = {
  badge: string;
  depCode: string;
  depTime: string;
  arrCode: string;
  arrTime: string;
  arrNextDay: boolean;
  meta: string;
  wait?: string;
};

function StackedRoutes({ legs, p }: { legs: Leg[]; p: PaletteColors }) {
  return (
    <View style={s.stack}>
      {legs.map((leg, i) => (
        <View
          key={i}
          style={i > 0 ? [s.legRow, s.legRowBd, { borderTopColor: p.line }] : s.legRow}
        >
          <View style={s.legTop}>
            <Text style={[s.legBadge, { backgroundColor: p.brand }]}>{leg.badge}</Text>
            <Text style={[s.legCodes, { color: p.ink }]}>{leg.depCode}</Text>
            <Text style={[s.legArrow, { color: p.muted }]}>→</Text>
            <Text style={[s.legCodes, { color: p.ink }]}>{leg.arrCode}</Text>
            <Text style={[s.legTimes, { color: p.brand }]}>
              {leg.depTime} — {leg.arrTime}
              {leg.arrNextDay ? <Text style={s.timeSup}>+1</Text> : null}
            </Text>
          </View>
          <Text style={[s.legMeta, { color: p.muted }]}>{leg.meta}</Text>
          {leg.wait ? <Text style={[s.legWait, { color: p.brand }]}>{leg.wait}</Text> : null}
        </View>
      ))}
    </View>
  );
}

type Field = { k: string; v: string; mono?: boolean; badge?: string };

function DetailsSection({
  title,
  fields,
  p,
}: {
  title: string;
  fields: Field[];
  p: PaletteColors;
}) {
  if (fields.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.secHead}>
        <Text style={[s.secTitle, { color: p.brand }]}>{title}</Text>
        <View style={[s.secRule, { backgroundColor: p.line }]} />
      </View>
      <View style={s.grid}>
        {fields.map((f, i) => (
          <View key={i} style={s.gcell}>
            <Text style={[s.gK, { color: p.muted }]}>{f.k}</Text>
            <View style={s.gVwrap}>
              <Text style={[f.mono ? s.gVmono : s.gV, { color: p.ink }]}>{f.v}</Text>
              {f.badge ? (
                <Text style={[s.cbadge, { backgroundColor: p.brand }]}>{f.badge}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

function PriceBand({
  blocks,
  priceLabel,
  priceStr,
  p,
}: {
  blocks: { k: string; v: string; mono?: boolean }[];
  priceLabel: string;
  priceStr: string;
  p: PaletteColors;
}) {
  return (
    <View style={[s.priceBand, { backgroundColor: p.ink }]}>
      {blocks.map((b, i) => (
        <View key={i} style={s.pbBlock}>
          <Text style={s.pbK}>{b.k}</Text>
          <Text style={b.mono ? s.pbVmono : s.pbV}>{b.v}</Text>
        </View>
      ))}
      <View style={s.pbRight}>
        <Text style={s.pbK}>{priceLabel}</Text>
        <Text style={s.pbPrice}>{priceStr}</Text>
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
  const addr = [agency.addressLine1, agency.addressLine2].filter(Boolean).join(" — ");
  const phone = agency.contactPhone ?? "";
  const email = agency.contactEmail ?? "";
  const website = agency.contactWebsite ?? "";
  const today = formatDate(new Date().toISOString().split("T")[0]);
  const ending = isMaritime
    ? "Présentez ce billet lors de l'embarquement au port."
    : "Présentez ce billet lors de l'enregistrement.";

  return (
    <>
      <View style={[s.foot, { borderTopColor: p.line }]}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[s.footN, { color: p.ink }]}>{name}</Text>
          {addr ? <Text style={[s.footA, { color: p.muted }]}>{addr}</Text> : null}
        </View>
        <View style={s.cts}>
          {phone ? <Text style={[s.ctB, { color: p.ink }]}>{phone}</Text> : null}
          {email ? <Text style={[s.ct, { color: p.muted }]}>{email}</Text> : null}
          {website ? <Text style={[s.ct, { color: p.muted }]}>{website}</Text> : null}
        </View>
      </View>
      <Text style={[s.gen, { color: p.muted }]}>
        Généré le {today} — Confirmation électronique. {ending}
      </Text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-type leg builder (mirror the reference panels)
// ---------------------------------------------------------------------------

// Build one stacked-row Leg from a single flight leg. The bound badge
// (Aller/Retour/Trajet N) is derived from the enclosing direction via
// getDirectionLabel — never from the row's global position. One-way trips have
// no bound label, so we fall back to "Vol X/Y" numbering (X = 1-based global
// index across ALL directions, Y = total legs across all directions).
function legFromSegment(
  leg: FlightLeg,
  directions: FlightDirection[],
  directionIndex: number,
  globalIndex: number,
  totalLegs: number,
  ticketType: TicketData["type"],
  passengerCount: number,
): Leg {
  const nextDay = isNextDay(leg.departureDate, leg.arrivalDate);
  const duration = leg.duration
    ? formatDurationString(leg.duration)
    : leg.departureTime && leg.arrivalTime
      ? formatDuration(leg.departureTime, leg.arrivalTime, leg.departureDate, leg.arrivalDate)
      : "";

  const flight = `${leg.airline} ${leg.flightNumber}`;
  const date = formatDate(leg.departureDate);
  const label = getDirectionLabel(directions, directionIndex);
  const badge = label ?? `Vol ${globalIndex}/${totalLegs}`;

  let meta: string;
  if (ticketType === "ROUND_TRIP") {
    const tail = passengerCount > 1 ? `${passengerCount} adultes` : duration;
    meta = `${date} · ${flight}${tail ? ` · ${tail}` : ""}`;
  } else {
    meta = `${date} · ${flight}${duration ? ` · ${duration}` : ""}`;
  }

  return {
    badge,
    depCode: leg.departureAirport,
    depTime: leg.departureTime,
    arrCode: leg.arrivalAirport,
    arrTime: leg.arrivalTime ?? "",
    arrNextDay: nextDay,
    meta,
  };
}

// ---------------------------------------------------------------------------
// Main template
// ---------------------------------------------------------------------------

export function WalletTemplate({ data, agency, palette }: TemplateProps) {
  const p = palette;
  const isMaritime = data.type === "MARITIME";
  const isMultiLeg = data.type === "MULTI_LEG";
  const isRoundTrip = data.type === "ROUND_TRIP";
  const flightDirections = getFlightDirections(data);
  const maritimeDirections = getMaritimeDirections(data);
  const passengers = data.passengers ?? [];
  const isMultiPax = passengers.length > 1;
  const passengerCount = passengers.length;

  const totalFlightLegs = flightDirections.reduce((n, d) => n + d.legs.length, 0);
  const totalMaritimeLegs = maritimeDirections.reduce(
    (n, d) => n + d.legs.length,
    0,
  );

  const baseTitle =
    isMaritime && maritimeDirections.length > 0
      ? getMaritimeTitle(maritimeDirections)
      : (TYPE_TITLES[data.type] ?? data.type);
  const typeLabel = isMultiPax ? `${baseTitle} · ${passengerCount} Pax` : baseTitle;
  const eyebrow = isMaritime ? "Titre de transport" : "Carte d'embarquement";

  const priceStr =
    data.price && data.currency ? formatPrice(data.price, data.currency) : "—";

  // ---- Route: single hero OR stacked legs --------------------------------
  // The hero shows a single direct leg; anything with more than one leg (a
  // connection, a return, a multi-leg / multi-crossing itinerary) stacks.
  const useStacked =
    isRoundTrip ||
    isMultiLeg ||
    (isMaritime && totalMaritimeLegs > 1) ||
    (isMultiPax && totalFlightLegs > 1);

  const firstMaritimeLeg = maritimeDirections[0]?.legs[0];
  const firstFlightLeg = flightDirections[0]?.legs[0];

  let routeSection: React.ReactNode;
  if (!useStacked) {
    if (isMaritime && firstMaritimeLeg) {
      const j = firstMaritimeLeg;
      const nextDay = isNextDay(j.departureDate, j.arrivalDate);
      const duration = j.duration
        ? formatDurationString(j.duration)
        : j.departureTime && j.arrivalTime
          ? formatDuration(j.departureTime, j.arrivalTime, j.departureDate, j.arrivalDate)
          : "";
      routeSection = (
        <HeroRoute
          depCode={j.departurePort}
          depCity={`Port de ${j.departureCity}`}
          depTime={j.departureTime}
          depLabel={`Embarquement · ${formatDate(j.departureDate)}`}
          arrCode={j.arrivalPort}
          arrCity={`Port de ${j.arrivalCity}`}
          arrTime={j.arrivalTime ?? ""}
          arrLabel={j.arrivalDate ? `Arrivée · ${formatDate(j.arrivalDate)}` : "Arrivée"}
          arrNextDay={nextDay}
          durText={duration}
          ftype="Par mer"
          isMaritime
          p={p}
        />
      );
    } else {
      const seg = firstFlightLeg;
      const nextDay = isNextDay(seg.departureDate, seg.arrivalDate);
      const duration = seg.duration
        ? formatDurationString(seg.duration)
        : seg.departureTime && seg.arrivalTime
          ? formatDuration(seg.departureTime, seg.arrivalTime, seg.departureDate, seg.arrivalDate)
          : "";
      routeSection = (
        <HeroRoute
          depCode={seg.departureAirport}
          depCity={seg.departureCity}
          depTime={seg.departureTime}
          depLabel={`Départ · ${formatDate(seg.departureDate)}`}
          arrCode={seg.arrivalAirport}
          arrCity={seg.arrivalCity}
          arrTime={seg.arrivalTime ?? ""}
          arrLabel={seg.arrivalDate ? `Arrivée · ${formatDate(seg.arrivalDate)}` : "Arrivée"}
          arrNextDay={nextDay}
          durText={duration}
          ftype="Vol direct"
          isMaritime={false}
          p={p}
        />
      );
    }
  } else if (isMaritime) {
    // Flatten maritime directions → legs in order. Bound badge from the
    // enclosing direction (Aller/Retour/Trajet N), falling back to numbered
    // "Trajet X/Y" for the rare unlabelled case.
    const legs: Leg[] = [];
    let mIndex = 0;
    maritimeDirections.forEach((dir, di) => {
      dir.legs.forEach((leg) => {
        mIndex += 1;
        const nextDay = isNextDay(leg.departureDate, leg.arrivalDate);
        const duration = leg.duration
          ? formatDurationString(leg.duration)
          : leg.departureTime && leg.arrivalTime
            ? formatDuration(leg.departureTime, leg.arrivalTime, leg.departureDate, leg.arrivalDate)
            : "";
        const label = getDirectionLabel(maritimeDirections, di);
        legs.push({
          badge: label ?? `Trajet ${mIndex}/${totalMaritimeLegs}`,
          depCode: leg.departurePort,
          depTime: leg.departureTime,
          arrCode: leg.arrivalPort,
          arrTime: leg.arrivalTime ?? "",
          arrNextDay: nextDay,
          meta: `${leg.company} · ${leg.shipName}${duration ? ` · ${duration}` : ""}`,
        });
      });
    });
    routeSection = <StackedRoutes legs={legs} p={p} />;
  } else {
    // Flatten flight directions → legs in order. A layover/wait is only shown
    // between consecutive legs of the SAME direction — never across a bound
    // (a connection is not a return).
    const legs: Leg[] = [];
    let globalIndex = 0;
    flightDirections.forEach((dir, di) => {
      dir.legs.forEach((leg, li) => {
        globalIndex += 1;
        legs.push(
          legFromSegment(
            leg,
            flightDirections,
            di,
            globalIndex,
            totalFlightLegs,
            data.type,
            passengerCount,
          ),
        );
        if (li > 0) {
          const prev = dir.legs[li - 1];
          if (prev.arrivalTime) {
            const wait = formatDuration(
              prev.arrivalTime,
              leg.departureTime,
              prev.arrivalDate ?? prev.departureDate,
              leg.departureDate,
            );
            // Attach the escale to the earlier leg's row (it sits after it).
            legs[legs.length - 2].wait = `Escale ${prev.arrivalCity} (${prev.arrivalAirport}) — attente ${wait}`;
          }
        }
      });
    });
    routeSection = <StackedRoutes legs={legs} p={p} />;
  }

  // ---- Passenger strip ----------------------------------------------------
  const paxItems: PaxItem[] = [
    { k: "Passager", v: passengers[0]?.name ?? "—", big: true },
    { k: "Billet No.", v: passengers[0]?.ticketNumber ?? "—", mono: true },
    {
      k: "Émission",
      v: data.issuedDate ? formatDate(data.issuedDate) : "—",
    },
  ];

  // ---- Details grid -------------------------------------------------------
  const detailFields: Field[] = [];
  if (isMaritime && firstMaritimeLeg) {
    const j = firstMaritimeLeg;
    detailFields.push({ k: "Compagnie", v: j.company });
    detailFields.push({ k: "Navire", v: j.shipName });
    detailFields.push({
      k: "Cabine",
      v: j.cabinNumber ?? j.cabinType ?? "—",
      badge: j.cabinNumber && j.cabinType ? j.cabinType : undefined,
    });
    if (j.deckNumber) detailFields.push({ k: "Pont", v: j.deckNumber });
    detailFields.push({
      k: "Véhicule",
      v: j.hasVehicle ? (j.vehicleType ?? "Véhicule") : "Sans véhicule",
    });
    if (maritimeDirections.length > 1) {
      detailFields.push({ k: "Durée totale", v: computeTripDuration(maritimeDirections) || "—" });
    }
  } else if (isMultiLeg) {
    detailFields.push({ k: "Itinéraire", v: getItinerary(flightDirections) });
    detailFields.push({ k: "Compagnie", v: firstFlightLeg?.airline ?? "—" });
    detailFields.push({ k: "Cabine", v: firstFlightLeg?.cabin ?? "Economy" });
    detailFields.push({ k: "Durée totale", v: computeTripDuration(flightDirections) || "—" });
    detailFields.push({ k: "Bagages", v: firstFlightLeg?.baggageAllowance ?? "—" });
  } else if (isRoundTrip) {
    detailFields.push({ k: "Compagnie", v: firstFlightLeg?.airline ?? "—" });
    detailFields.push({ k: "Cabine", v: firstFlightLeg?.cabin ?? "Economy" });
    detailFields.push({ k: "Bagages", v: firstFlightLeg?.baggageAllowance ?? "—" });
  } else {
    // ONE_WAY (and multi-pax single leg)
    const seg = firstFlightLeg;
    detailFields.push({ k: "Compagnie", v: seg?.airline ?? "—" });
    detailFields.push({ k: "N° de vol", v: seg?.flightNumber ?? "—" });
    detailFields.push({ k: "Date", v: seg ? formatDate(seg.departureDate) : "—" });
    detailFields.push({ k: "Cabine", v: seg?.cabin ?? "Economy" });
    detailFields.push({
      k: "Bagages",
      v: seg?.baggageAllowance
        ? isMultiPax
          ? `${seg.baggageAllowance} / pers.`
          : seg.baggageAllowance
        : "—",
    });
    if (seg?.aircraft) detailFields.push({ k: "Appareil", v: seg.aircraft });
  }

  // ---- Price band ---------------------------------------------------------
  const priceLabel = isMultiPax ? `Prix total (×${passengerCount})` : "Prix total";
  const priceBlocks: { k: string; v: string; mono?: boolean }[] = [
    { k: "Référence (PNR)", v: data.bookingReference ?? "—", mono: true },
  ];
  if (isMultiPax && data.price && data.currency) {
    const num = parseFloat(data.price.replace(/\s/g, "").replace(",", "."));
    if (!isNaN(num)) {
      priceBlocks.push({
        k: "Prix / passager",
        v: formatPrice(String(Math.round(num / passengerCount)), data.currency),
      });
    }
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.pass}>
          <Header agency={agency} eyebrow={eyebrow} typeLabel={typeLabel} p={p} />

          {isMultiPax ? (
            <PassengerTable data={data} p={p} />
          ) : (
            <PassengerBand items={paxItems} p={p} />
          )}

          {routeSection}

          <DetailsSection
            title={isMaritime ? "Détails de la traversée" : "Détails du vol"}
            fields={detailFields}
            p={p}
          />

          {/* Spacer pins the price band + footer to the bottom of the page. */}
          <View style={s.grow} />

          <PriceBand
            blocks={priceBlocks}
            priceLabel={priceLabel}
            priceStr={priceStr}
            p={p}
          />
          <Footer agency={agency} isMaritime={isMaritime} p={p} />
        </View>
      </Page>
    </Document>
  );
}
