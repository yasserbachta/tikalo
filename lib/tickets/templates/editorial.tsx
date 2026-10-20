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
// EDITORIAL — "Document Élégant"
// ---------------------------------------------------------------------------
// A faithful @react-pdf reproduction of reference/templates/01-editorial-document.html.
// Unlike CLASSIC (which brands off agency.primaryColor/secondaryColor), this
// template reads every color from the resolved palette catalog entry.
//
// Sizing convention: the reference uses px on a 760px-wide screen sheet that
// prints to A4. We carry px → pt 1:1 for fixed values (paddings, font sizes,
// gaps, letter-spacing) and let flex/percent widths reflow the layout into the
// 595pt A4 width. Letter-spacing em values are converted to pt proportionally
// (e.g. .2em on an 8.5px label ≈ 1.7pt).

// ---------------------------------------------------------------------------
// Font registration — local TTFs to avoid remote URL breakage at render time
// ---------------------------------------------------------------------------

const fontsDir = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Hanken Grotesk",
  fonts: [
    { src: path.join(fontsDir, "hanken-grotesk-400.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "hanken-grotesk-500.ttf"), fontWeight: 500 },
    { src: path.join(fontsDir, "hanken-grotesk-600.ttf"), fontWeight: 600 },
    { src: path.join(fontsDir, "hanken-grotesk-700.ttf"), fontWeight: 700 },
    { src: path.join(fontsDir, "hanken-grotesk-800.ttf"), fontWeight: 800 },
  ],
});

// ---------------------------------------------------------------------------
// French months + date / number / duration helpers (mirrors classic.tsx)
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
  const formatted = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(num)
    .replace(/ | /g, " ");
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
// in-direction layovers). A layover is only ever counted between consecutive
// legs of the SAME direction — never across two directions.
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

const TYPE_TITLES: Record<string, string> = {
  ONE_WAY: "Aller Simple",
  ROUND_TRIP: "Aller-Retour",
  MULTI_LEG: "Multi-Escale",
  MARITIME: "Traversée Maritime",
};

// ---------------------------------------------------------------------------
// Styles — colors are applied inline from the palette; static layout lives here
// ---------------------------------------------------------------------------

// CSS px → PDF pt: the reference is a 760px-wide screen sheet that prints to
// A4. At 96dpi screen / 72pt inch, 1px = 0.75pt. Carrying every dimensional
// value through r() reproduces the reference's printed proportions exactly and
// keeps each ticket on a single A4 page.
const K = 0.75;
const r = (n: number) => n * K;

const s = StyleSheet.create({
  page: {
    fontFamily: "Hanken Grotesk",
    fontSize: r(10),
    flexDirection: "column",
  },

  // masthead
  masthead: { paddingTop: r(30), paddingHorizontal: r(46) },
  mhTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  brandline: { flexDirection: "row", alignItems: "center", gap: r(12) },
  mk: {
    width: r(34),
    height: r(34),
    borderRadius: r(9),
    alignItems: "center",
    justifyContent: "center",
  },
  bName: { fontSize: r(15), fontWeight: 700, letterSpacing: r(0.15) },
  bSlogan: {
    fontSize: r(8.5),
    fontWeight: 600,
    letterSpacing: r(1.9),
    textTransform: "uppercase",
    marginTop: r(2),
  },
  mhRight: { alignItems: "flex-end" },
  mhK: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(1.9),
    textTransform: "uppercase",
  },
  mhRef: { fontSize: r(14), fontWeight: 700, marginTop: r(3), letterSpacing: r(0.3) },
  rule: { height: r(2), marginTop: r(18) },

  // title row
  titlerow: {
    paddingTop: r(22),
    paddingHorizontal: r(46),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  eyebrow: {
    fontSize: r(9),
    fontWeight: 700,
    letterSpacing: r(2.3),
    textTransform: "uppercase",
  },
  docTitle: {
    fontSize: r(34),
    fontWeight: 800,
    letterSpacing: r(-0.7),
    marginTop: r(6),
    lineHeight: 1,
  },
  paxblock: { alignItems: "flex-end", maxWidth: r(240) },
  paxK: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(1.7),
    textTransform: "uppercase",
    marginBottom: r(4),
  },
  paxNm: { fontSize: r(19), fontWeight: 700, textAlign: "right" },
  paxSub: { fontSize: r(11), marginTop: r(3), textAlign: "right" },

  // passenger table (multi)
  paxtab: { paddingTop: r(20), paddingHorizontal: r(46) },
  paxCap: { flexDirection: "row", alignItems: "center", gap: r(9), marginBottom: r(10) },
  pbadge: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(0.5),
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: r(3),
    paddingHorizontal: r(9),
    borderRadius: r(20),
  },
  paxRow: { flexDirection: "row", paddingVertical: r(9), alignItems: "baseline" },
  paxRowHd: {
    flexDirection: "row",
    paddingVertical: r(9),
    alignItems: "baseline",
    borderBottomWidth: r(2),
  },
  paxRowBd: { borderTopWidth: r(1) },
  paxColName: { flex: 2, paddingRight: r(16) },
  paxColTicket: { flex: 1.6, paddingRight: r(16) },
  paxColCompany: { flex: 1.3 },
  paxHdCell: {
    fontSize: r(8),
    fontWeight: 700,
    letterSpacing: r(1.3),
    textTransform: "uppercase",
  },
  paxNmCell: { fontSize: r(16), fontWeight: 700 },
  paxVvCell: { fontSize: r(13), fontWeight: 500 },

  // segment
  segment: { paddingTop: r(20), paddingHorizontal: r(46) },
  seghd: { flexDirection: "row", alignItems: "center", gap: r(14), marginBottom: r(6) },
  segno: {
    fontSize: r(9.5),
    fontWeight: 800,
    letterSpacing: r(1.5),
    textTransform: "uppercase",
  },
  segrule: { flex: 1, height: r(1) },
  segdir: {
    fontSize: r(9.5),
    fontWeight: 600,
    letterSpacing: r(1.1),
    textTransform: "uppercase",
  },

  // route
  route: {
    flexDirection: "row",
    alignItems: "center",
    gap: r(14),
    paddingTop: r(10),
    paddingBottom: r(6),
  },
  ep: { flexShrink: 0 },
  epR: { flexShrink: 0, alignItems: "flex-end" },
  t: { fontSize: r(42), fontWeight: 800, letterSpacing: r(-1.3), lineHeight: 0.9 },
  tSup: { fontSize: r(14), fontWeight: 800 },
  city: { fontSize: r(14), fontWeight: 700, marginTop: r(8) },
  code: { fontSize: r(10), fontWeight: 500, marginTop: r(3), letterSpacing: r(0.2) },
  mid: {
    flex: 1,
    position: "relative",
    minWidth: r(120),
    height: r(64),
    justifyContent: "center",
  },
  arcs: { width: "100%", height: r(60) },
  pin: {
    position: "absolute",
    left: "50%",
    top: r(2),
    marginLeft: r(-15),
    width: r(30),
    height: r(30),
    borderRadius: r(15),
    alignItems: "center",
    justifyContent: "center",
  },
  dur: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: r(-2),
    textAlign: "center",
    fontSize: r(9.5),
    fontWeight: 700,
    letterSpacing: r(0.5),
    textTransform: "uppercase",
  },

  // dotted-leader facts
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: r(10),
    paddingTop: r(10),
    borderTopWidth: r(1),
  },
  fact: { flexDirection: "row", alignItems: "baseline", paddingVertical: r(6) },
  factK: { fontSize: r(11), fontWeight: 600 },
  factLead: {
    flex: 1,
    marginHorizontal: r(8),
    marginBottom: r(4),
    minWidth: r(14),
    borderBottomWidth: r(1.5),
    borderBottomStyle: "dotted",
  },
  factVwrap: { flexDirection: "row", alignItems: "center" },
  factV: { fontSize: r(13), fontWeight: 700 },
  cbadge: {
    fontSize: r(7.5),
    fontWeight: 700,
    letterSpacing: r(0.5),
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: r(2),
    paddingHorizontal: r(7),
    borderRadius: r(5),
    marginLeft: r(6),
  },

  // layover
  layover: {
    marginTop: r(14),
    marginHorizontal: r(46),
    flexDirection: "row",
    alignItems: "center",
    gap: r(10),
    paddingVertical: r(9),
    borderTopWidth: r(1),
    borderTopStyle: "dashed",
    borderBottomWidth: r(1),
    borderBottomStyle: "dashed",
  },
  layoverT: { fontSize: r(11), fontWeight: 600 },
  layoverD: {
    marginLeft: "auto",
    fontSize: r(10),
    fontWeight: 700,
    letterSpacing: r(0.5),
    textTransform: "uppercase",
  },

  grow: { flex: 1, minHeight: r(24) },

  // summary
  summary: {
    marginTop: r(22),
    marginHorizontal: r(46),
    borderWidth: r(2),
    borderRadius: r(6),
    flexDirection: "row",
    flexWrap: "wrap",
  },
  sblock: { paddingVertical: r(18), paddingHorizontal: r(24), borderRightWidth: r(1), flex: 1, minWidth: r(120) },
  sblockLast: { borderRightWidth: 0 },
  sblockTotal: {
    paddingVertical: r(18),
    paddingHorizontal: r(24),
    flexShrink: 0,
    minWidth: r(190),
    justifyContent: "center",
  },
  sK: {
    fontSize: r(8.5),
    fontWeight: 700,
    letterSpacing: r(1.5),
    textTransform: "uppercase",
    marginBottom: r(5),
  },
  sV: { fontSize: r(15), fontWeight: 700, letterSpacing: r(0.3) },
  sTotalK: { color: "rgba(255,255,255,0.6)" },
  sTotalAmt: { fontSize: r(26), fontWeight: 800, color: "#ffffff" },

  // footer
  foot: {
    marginTop: r(20),
    marginHorizontal: r(46),
    paddingTop: r(16),
    borderTopWidth: r(1),
    flexDirection: "row",
    justifyContent: "space-between",
    gap: r(16),
  },
  footN: { fontSize: r(12), fontWeight: 700 },
  footA: { fontSize: r(10), marginTop: r(4), lineHeight: 1.7 },
  cts: { alignItems: "flex-end", gap: r(4) },
  ct: { flexDirection: "row", alignItems: "center", gap: r(6), justifyContent: "flex-end" },
  ctText: { fontSize: r(10), fontWeight: 600 },
  gen: {
    fontSize: r(8),
    textAlign: "center",
    paddingTop: r(12),
    paddingBottom: r(14),
    paddingHorizontal: r(46),
    letterSpacing: r(0.3),
    marginTop: r(4),
  },
});

// ---------------------------------------------------------------------------
// SVG icons (path data lifted from the reference HTML)
// ---------------------------------------------------------------------------

const PLANE_D =
  "M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16z";

function PlaneMark({ color }: { color: string }) {
  return (
    <Svg width={r(20)} height={r(20)} viewBox="0 0 24 24">
      <Path d={PLANE_D} fill={color} />
    </Svg>
  );
}

function PlanePin({ color }: { color: string }) {
  return (
    <Svg width={r(16)} height={r(16)} viewBox="0 0 24 24">
      <Path d={PLANE_D} fill={color} />
    </Svg>
  );
}

function ShipPin({ color }: { color: string }) {
  return (
    <Svg width={r(16)} height={r(16)} viewBox="0 0 24 24">
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
    <Svg width={r(14)} height={r(14)} viewBox="0 0 24 24">
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

function Masthead({
  agency,
  refLabel,
  refValue,
  p,
}: {
  agency: TemplateProps["agency"];
  refLabel: string;
  refValue: string;
  p: PaletteColors;
}) {
  const name = agency.name ?? "Tikalo";
  const slogan = agency.slogan ?? "Agence de Voyages";
  return (
    <View style={s.masthead}>
      <View style={s.mhTop}>
        <View style={s.brandline}>
          <View style={[s.mk, { backgroundColor: p.brand }]}>
            <PlaneMark color="#ffffff" />
          </View>
          <View>
            <Text style={[s.bName, { color: p.ink }]}>{name}</Text>
            {slogan ? (
              <Text style={[s.bSlogan, { color: p.muted }]}>{slogan}</Text>
            ) : null}
          </View>
        </View>
        <View style={s.mhRight}>
          <Text style={[s.mhK, { color: p.muted }]}>{refLabel}</Text>
          <Text style={[s.mhRef, { color: p.ink }]}>{refValue}</Text>
        </View>
      </View>
      <View style={[s.rule, { backgroundColor: p.ink }]} />
    </View>
  );
}

function TitleRow({
  title,
  data,
  p,
}: {
  title: string;
  data: TicketData;
  p: PaletteColors;
}) {
  const first = data.passengers?.[0];
  let sub = "";
  if (data.type === "MULTI_LEG") {
    sub = getItinerary(getFlightDirections(data));
  } else if (data.issuedDate) {
    sub = `Émis le ${formatDate(data.issuedDate)}`;
  }
  return (
    <View style={s.titlerow}>
      <View>
        <Text style={[s.eyebrow, { color: p.brand }]}>Billet Électronique</Text>
        <Text style={[s.docTitle, { color: p.ink }]}>{title}</Text>
      </View>
      <View style={s.paxblock}>
        <Text style={[s.paxK, { color: p.muted }]}>Passager</Text>
        <Text style={[s.paxNm, { color: p.ink }]}>{first?.name ?? ""}</Text>
        {sub ? <Text style={[s.paxSub, { color: p.muted }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function PassengerTable({
  data,
  p,
}: {
  data: TicketData;
  p: PaletteColors;
}) {
  const passengers = data.passengers ?? [];
  const airline =
    getFlightDirections(data)[0]?.legs[0]?.airline ??
    getMaritimeDirections(data)[0]?.legs[0]?.company ??
    "";
  return (
    <View style={s.paxtab}>
      <View style={s.paxCap}>
        <Text style={[s.paxK, { color: p.muted, marginBottom: 0 }]}>Passagers</Text>
        <Text style={[s.pbadge, { backgroundColor: p.brand }]}>
          {passengers.length} Voyageur{passengers.length > 1 ? "s" : ""}
        </Text>
      </View>
      <View style={[s.paxRowHd, { borderBottomColor: p.ink }]}>
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
  );
}

type FactItem = { k: string; v: string; badge?: string };

function Fact({ item, side, p }: { item: FactItem; side: "left" | "right"; p: PaletteColors }) {
  // Emulate the reference's 44px column gap: left column pads right, right pads left.
  const gap = side === "left" ? { paddingRight: r(22) } : { paddingLeft: r(22) };
  return (
    <View style={[s.fact, { width: "50%" }, gap]}>
      <Text style={[s.factK, { color: p.muted }]}>{item.k}</Text>
      <View style={[s.factLead, { borderBottomColor: p.line2 ?? p.line }]} />
      <View style={s.factVwrap}>
        <Text style={[s.factV, { color: p.ink }]}>{item.v}</Text>
        {item.badge ? (
          <Text style={[s.cbadge, { backgroundColor: p.brand }]}>{item.badge}</Text>
        ) : null}
      </View>
    </View>
  );
}

function Route({
  depTime,
  depCity,
  depCode,
  arrTime,
  arrCity,
  arrCode,
  arrNextDay,
  durLabel,
  isMaritime,
  p,
}: {
  depTime: string;
  depCity: string;
  depCode: string;
  arrTime: string;
  arrCity: string;
  arrCode: string;
  arrNextDay: boolean;
  durLabel: string;
  isMaritime: boolean;
  p: PaletteColors;
}) {
  return (
    <View style={s.route}>
      <View style={s.ep}>
        <Text style={[s.t, { color: p.ink }]}>{depTime}</Text>
        <Text style={[s.city, { color: p.ink }]}>{depCity}</Text>
        <Text style={[s.code, { color: p.muted }]}>{depCode}</Text>
      </View>
      <View style={s.mid}>
        <Svg style={s.arcs} viewBox="0 0 320 60" preserveAspectRatio="none">
          <Path
            d="M6 52 Q160 2 314 52"
            fill="none"
            stroke={p.brand}
            strokeWidth={1.5}
            opacity={0.5}
          />
        </Svg>
        <View style={[s.pin, { backgroundColor: p.brand }]}>
          {isMaritime ? <ShipPin color="#ffffff" /> : <PlanePin color="#ffffff" />}
        </View>
        {durLabel ? (
          <Text style={[s.dur, { color: p.muted }]}>{durLabel}</Text>
        ) : null}
      </View>
      <View style={s.epR}>
        <Text style={[s.t, { color: p.ink, textAlign: "right" }]}>
          {arrTime}
          {arrNextDay ? <Text style={s.tSup}>+1</Text> : null}
        </Text>
        <Text style={[s.city, { color: p.ink, textAlign: "right" }]}>{arrCity}</Text>
        <Text style={[s.code, { color: p.muted, textAlign: "right" }]}>{arrCode}</Text>
      </View>
    </View>
  );
}

function SegmentBlock({
  segNo,
  segDir,
  route,
  facts,
  p,
}: {
  segNo: string;
  segDir: string;
  route: React.ReactNode;
  facts: FactItem[];
  p: PaletteColors;
}) {
  return (
    <View style={s.segment} wrap={false}>
      <View style={s.seghd}>
        <Text style={[s.segno, { color: p.brand }]}>{segNo}</Text>
        <View style={[s.segrule, { backgroundColor: p.line2 ?? p.line }]} />
        <Text style={[s.segdir, { color: p.muted }]}>{segDir}</Text>
      </View>
      {route}
      <View style={[s.facts, { borderTopColor: p.line }]}>
        {facts.map((f, i) => (
          <Fact key={i} item={f} side={i % 2 === 0 ? "left" : "right"} p={p} />
        ))}
      </View>
    </View>
  );
}

function FlightSegment({
  leg,
  directions,
  directionIndex,
  legNumber,
  totalLegs,
  ticketType,
  isMultiPax,
  passengerCount,
  p,
}: {
  leg: FlightLeg;
  directions: FlightDirection[];
  directionIndex: number;
  legNumber: number;
  totalLegs: number;
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

  // Duration suffix: multi-pax → "· N adultes", multi-leg → none, else "· Direct".
  let suffix = " · Direct";
  if (isMultiPax) {
    suffix = ` · ${passengerCount} adulte${passengerCount > 1 ? "s" : ""}`;
  } else if (isMultiLeg) {
    suffix = "";
  }
  const durLabel = duration ? `${duration}${suffix}` : "";

  // "Vol X / Y": X is a 1-based global leg index across all directions, Y the
  // total leg count. The bound label (Aller/Retour/Trajet N) comes from the
  // direction's kind — never from leg position — and is null for one-way trips.
  const boundLabel = getDirectionLabel(directions, directionIndex);
  const segNo = boundLabel
    ? `Vol ${legNumber} / ${totalLegs} · ${boundLabel}`
    : `Vol ${legNumber} / ${totalLegs}`;

  // Fact sets mirror the reference: multi-pax & multi-leg show 4 facts (2 rows);
  // one-way / round-trip show the fuller set.
  let facts: FactItem[];
  if (isMultiPax) {
    facts = [
      { k: "Vol", v: leg.flightNumber },
      { k: "Cabine", v: leg.cabin ?? "Economy" },
      { k: "Date", v: formatDate(leg.departureDate) },
      {
        k: "Bagages",
        v: leg.baggageAllowance ? `${leg.baggageAllowance} / pers.` : "—",
      },
    ];
  } else if (isMultiLeg) {
    facts = [
      { k: "Compagnie", v: leg.airline },
      { k: "Cabine", v: leg.cabin ?? "Economy" },
      { k: "Vol", v: leg.flightNumber },
      { k: "Bagages", v: leg.baggageAllowance ?? "—" },
    ];
  } else {
    facts = [
      { k: "Compagnie", v: leg.airline },
      { k: "Cabine", v: leg.cabin ?? "Economy" },
      { k: "Vol", v: leg.flightNumber },
      { k: "Bagages", v: leg.baggageAllowance ?? "—" },
      { k: "Date", v: formatDate(leg.departureDate) },
    ];
    if (leg.aircraft) facts.push({ k: "Appareil", v: leg.aircraft });
  }

  return (
    <SegmentBlock
      segNo={segNo}
      segDir={`${leg.departureCity} → ${leg.arrivalCity}`}
      facts={facts}
      p={p}
      route={
        <Route
          depTime={leg.departureTime}
          depCity={leg.departureCity}
          depCode={`${leg.departureAirport} · ${leg.departureCity}`}
          arrTime={leg.arrivalTime ?? ""}
          arrCity={leg.arrivalCity}
          arrCode={`${leg.arrivalAirport} · ${leg.arrivalCity}`}
          arrNextDay={nextDay}
          durLabel={durLabel}
          isMaritime={false}
          p={p}
        />
      }
    />
  );
}

function MaritimeSegment({
  leg,
  directions,
  directionIndex,
  legNumber,
  totalLegs,
  p,
}: {
  leg: MaritimeLeg;
  directions: MaritimeDirection[];
  directionIndex: number;
  legNumber: number;
  totalLegs: number;
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
  const durLabel = duration ? `${duration} · Par mer` : "";

  const facts: FactItem[] = [{ k: "Compagnie", v: leg.company }];
  if (leg.cabinNumber || leg.cabinType) {
    facts.push({
      k: "Cabine",
      v: leg.cabinNumber ?? "—",
      badge: leg.cabinType ?? undefined,
    });
  }
  facts.push({ k: "Navire", v: leg.shipName });
  if (leg.deckNumber) facts.push({ k: "Pont", v: leg.deckNumber });
  facts.push({ k: "Date départ", v: formatDate(leg.departureDate) });
  facts.push({
    k: "Véhicule",
    v: leg.hasVehicle ? (leg.vehicleType ?? "Véhicule") : "Sans véhicule",
  });

  // "Traversée X / Y" with a 1-based global leg index; the Aller/Retour bound
  // label (if any) comes from the direction's kind, never from leg position.
  const boundLabel = getDirectionLabel(directions, directionIndex);
  const segNo = boundLabel
    ? `Traversée ${legNumber} / ${totalLegs} · ${boundLabel}`
    : `Traversée ${legNumber} / ${totalLegs}`;

  return (
    <SegmentBlock
      segNo={segNo}
      segDir={`${leg.departureCity} → ${leg.arrivalCity}`}
      facts={facts}
      p={p}
      route={
        <Route
          depTime={leg.departureTime}
          depCity={leg.departureCity}
          depCode={`Port d'${leg.departureCity}`}
          arrTime={leg.arrivalTime ?? ""}
          arrCity={leg.arrivalCity}
          arrCode={`Port de ${leg.arrivalCity}`}
          arrNextDay={nextDay}
          durLabel={durLabel}
          isMaritime
          p={p}
        />
      }
    />
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
    <View
      style={[s.layover, { borderTopColor: p.line2 ?? p.line, borderBottomColor: p.line2 ?? p.line }]}
      wrap={false}
    >
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
    <View style={[s.summary, { borderColor: p.ink }]} wrap={false}>
      {blocks.map((b, i) => (
        <View
          key={i}
          style={[s.sblock, { borderRightColor: p.line }]}
        >
          <Text style={[s.sK, { color: p.muted }]}>{b.k}</Text>
          <Text style={[s.sV, { color: p.ink }]}>{b.v}</Text>
        </View>
      ))}
      <View style={[s.sblockTotal, { backgroundColor: p.ink }]}>
        <Text style={[s.sK, s.sTotalK]}>{total.k}</Text>
        <Text style={s.sTotalAmt}>{total.v}</Text>
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
      <View style={[s.foot, { borderTopColor: p.line }]} wrap={false}>
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

export function EditorialTemplate({ data, agency, palette }: TemplateProps) {
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

  // Masthead reference: multi-pax shows the booking reference, otherwise the
  // lead passenger's ticket number (the reference HTML's "Billet · No.").
  const refLabel = isMultiPax ? "Réservation" : "Billet · No.";
  const refValue = isMultiPax
    ? (data.bookingReference ?? "—")
    : (passengers[0]?.ticketNumber ?? data.bookingReference ?? "—");

  // Summary blocks vary by ticket type.
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
    summaryBlocks.push({ k: "Prix / passager", v: perPax });
    summaryBlocks.push({
      k: "Date d'émission",
      v: data.issuedDate ? formatDate(data.issuedDate) : "—",
    });
    summaryTotal = { k: `Prix total (×${passengerCount})`, v: priceStr };
  } else if (isMultiLeg) {
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—" });
    summaryBlocks.push({ k: "Durée totale", v: totalDuration || "—" });
    summaryTotal = { k: "Prix total", v: priceStr };
  } else if (isMaritime) {
    summaryBlocks.push({ k: "Référence (PNR)", v: data.bookingReference ?? "—" });
    const durLabel = maritimeDirections.length === 2 ? "Durée totale" : "Durée traversée";
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

  // Global leg counters power the "Vol X / Y" (and "Traversée X / Y") badges:
  // X is 1-based across ALL directions, Y the total leg count of the trip.
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

  return (
    <Document>
      <Page size="A4" style={[s.page, { backgroundColor: p.paper ?? "#ffffff", color: p.ink }]}>
        <Masthead agency={agency} refLabel={refLabel} refValue={refValue} p={p} />

        {isMultiPax ? (
          <>
            <View style={s.titlerow}>
              <View>
                <Text style={[s.eyebrow, { color: p.brand }]}>Billet Électronique</Text>
                <Text style={[s.docTitle, { color: p.ink }]}>{title}</Text>
              </View>
            </View>
            <PassengerTable data={data} p={p} />
          </>
        ) : (
          <TitleRow title={title} data={data} p={p} />
        )}

        {isMaritime && maritimeDirections.length > 0
          ? maritimeDirections.map((dir, di) =>
              dir.legs.map((leg, li) => {
                maritimeLegNo += 1;
                return (
                  <MaritimeSegment
                    key={`${di}-${li}`}
                    leg={leg}
                    directions={maritimeDirections}
                    directionIndex={di}
                    legNumber={maritimeLegNo}
                    totalLegs={totalMaritimeLegs}
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
                    {/* Layover only BETWEEN consecutive legs of the same
                        direction (li > 0). A new direction is a fresh bound,
                        never an escale. */}
                    {li > 0 ? (
                      <LayoverBlock prev={dir.legs[li - 1]} next={leg} p={p} />
                    ) : null}
                    <FlightSegment
                      leg={leg}
                      directions={flightDirections}
                      directionIndex={di}
                      legNumber={flightLegNo}
                      totalLegs={totalFlightLegs}
                      ticketType={data.type}
                      isMultiPax={isMultiPax}
                      passengerCount={passengerCount}
                      p={p}
                    />
                  </React.Fragment>
                );
              }),
            )}

        {/* A flex spacer pushes the summary + footer to the bottom of the page,
            so the white page fills behind them regardless of content length. */}
        <View style={s.grow} />

        <Summary blocks={summaryBlocks} total={summaryTotal} p={p} />
        <Footer agency={agency} isMaritime={isMaritime} p={p} />
      </Page>
    </Document>
  );
}
