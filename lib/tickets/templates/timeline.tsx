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
// TIMELINE — "Timeline"
// ---------------------------------------------------------------------------
// A faithful @react-pdf reproduction of reference/templates/05-timeline.html.
// Like EDITORIAL / PREMIUM / BOLD / WALLET it reads every color from the
// resolved palette catalog entry (brand / brand2 / tint / ink / muted / line /
// paper / bg).
//
// The look: a full-height brand-colored side rail on the left edge carrying a
// plane/ship mark, a vertical "Billet Électronique" label and the vertical PNR;
// to its right a header, a passenger band, then a *vertical chronological
// timeline* — a thin line with circular nodes for each event (departure /
// arrival / port), bordered flight-detail cards between nodes, and a distinct
// dashed-ring "wait" node for layovers. Then a brand summary band, a tinted
// footer, and a centered generation line. Display text is Work Sans; codes /
// numbers / times use IBM Plex Mono.
//
// Sizing convention (shared with the other templates): the reference is a 760px
// screen sheet that prints to A4. Carry px to pt with 1px = 0.75pt for fixed
// values and let flex / percent widths reflow into the 595pt A4 width.

// ---------------------------------------------------------------------------
// Font registration — local TTFs to avoid remote URL breakage at render time
// ---------------------------------------------------------------------------

const fontsDir = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Work Sans",
  fonts: [
    { src: path.join(fontsDir, "work-sans-400.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "work-sans-500.ttf"), fontWeight: 500 },
    { src: path.join(fontsDir, "work-sans-600.ttf"), fontWeight: 600 },
    { src: path.join(fontsDir, "work-sans-700.ttf"), fontWeight: 700 },
    { src: path.join(fontsDir, "work-sans-800.ttf"), fontWeight: 800 },
    {
      src: path.join(fontsDir, "work-sans-400-italic.ttf"),
      fontWeight: 400,
      fontStyle: "italic",
    },
  ],
});

Font.register({
  family: "IBM Plex Mono",
  fonts: [
    { src: path.join(fontsDir, "ibm-plex-mono-500.ttf"), fontWeight: 500 },
    { src: path.join(fontsDir, "ibm-plex-mono-600.ttf"), fontWeight: 600 },
  ],
});

// ---------------------------------------------------------------------------
// French months + date / number / duration helpers (mirrors premium.tsx)
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

function legDuration(leg: FlightLeg): string {
  return leg.duration
    ? formatDurationString(leg.duration)
    : leg.departureTime && leg.arrivalTime
      ? formatDuration(leg.departureTime, leg.arrivalTime, leg.departureDate, leg.arrivalDate)
      : "";
}

function maritimeLegDuration(leg: MaritimeLeg): string {
  return leg.duration
    ? formatDurationString(leg.duration)
    : leg.departureTime && leg.arrivalTime
      ? formatDuration(leg.departureTime, leg.arrivalTime, leg.departureDate, leg.arrivalDate)
      : "";
}

function isNextDay(depDate?: string | null, arrDate?: string | null): boolean {
  if (!depDate || !arrDate) return false;
  return arrDate > depDate;
}

// Whole-trip duration = sum of each direction's own legs plus the layovers
// BETWEEN legs of the same direction. A turnaround between two directions (a
// return is not a connection) is never counted. Works for flight and maritime
// directions alike.
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

const RAIL_W = r(60);

const s = StyleSheet.create({
  page: {
    fontFamily: "Work Sans",
    fontSize: r(10),
    backgroundColor: "#ffffff",
    flexDirection: "column",
  },

  // left rail (brand) — absolute, full page height, repeats on overflow pages
  side: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: RAIL_W,
  },
  sideIcon: {
    position: "absolute",
    top: r(22),
    left: 0,
    width: RAIL_W,
    alignItems: "center",
  },
  sidePnrBox: {
    position: "absolute",
    bottom: r(22),
    left: 0,
    width: RAIL_W,
    alignItems: "center",
  },
  // body sits to the right of the rail; flexGrow fills the page height so the
  // footer can be pinned to the bottom (the rail is absolute/fixed)
  body: { marginLeft: RAIL_W, flexGrow: 1 },

  // pushes the summary + footer to the bottom of the page
  grow: { flexGrow: 1 },

  // vertical text (rotated -90°, reads bottom-to-top like the reference)
  vWrap: { width: r(20), alignItems: "center", justifyContent: "center" },
  vText: {
    transform: "rotate(-90deg)",
    transformOrigin: "center",
    textAlign: "center",
    color: "#ffffff",
  },

  // header
  head: {
    paddingTop: r(24),
    paddingHorizontal: r(32),
    paddingBottom: r(18),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: r(1),
  },
  hn: { fontSize: r(16), fontWeight: 800 },
  hs: {
    fontSize: r(9),
    fontWeight: 600,
    letterSpacing: r(1.8),
    textTransform: "uppercase",
    marginTop: r(3),
  },
  headR: { alignItems: "flex-end" },
  chip: {
    fontSize: r(9),
    fontWeight: 700,
    letterSpacing: r(0.7),
    textTransform: "uppercase",
    paddingVertical: r(5),
    paddingHorizontal: r(12),
    borderRadius: r(20),
  },
  ty: { fontSize: r(18), fontWeight: 800, marginTop: r(8) },

  // passenger ribbon (single)
  pax: {
    paddingVertical: r(16),
    paddingHorizontal: r(32),
    flexDirection: "row",
    justifyContent: "space-between",
    gap: r(16),
    flexWrap: "wrap",
  },
  f: { flexShrink: 1 },
  fK: {
    fontSize: r(8),
    fontWeight: 700,
    letterSpacing: r(1.3),
    textTransform: "uppercase",
    marginBottom: r(4),
  },
  fV: { fontSize: r(14), fontWeight: 700 },
  fVbig: { fontSize: r(18), fontWeight: 800 },
  fVmono: { fontFamily: "IBM Plex Mono", fontSize: r(13), fontWeight: 600 },

  // passenger table (multi)
  paxtab: { paddingVertical: r(14), paddingHorizontal: r(32) },
  paxCap: { flexDirection: "row", alignItems: "center", gap: r(9), marginBottom: r(10) },
  pbadge: {
    fontSize: r(8),
    fontWeight: 700,
    letterSpacing: r(0.5),
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: r(3),
    paddingHorizontal: r(9),
    borderRadius: r(20),
  },
  paxRow: { flexDirection: "row", paddingVertical: r(7), alignItems: "center" },
  paxRowBd: { borderTopWidth: r(1) },
  paxColName: { flex: 2, paddingRight: r(14) },
  paxColTicket: { flex: 1.6, paddingRight: r(14) },
  paxColCompany: { flex: 1.3 },
  paxHd: {
    fontSize: r(7.5),
    fontWeight: 700,
    letterSpacing: r(1),
    textTransform: "uppercase",
  },
  paxNm: { fontSize: r(14), fontWeight: 800 },
  paxVv: { fontFamily: "IBM Plex Mono", fontSize: r(12), fontWeight: 600 },
  paxVvTxt: { fontFamily: "Work Sans", fontSize: r(13), fontWeight: 600 },

  // timeline
  tl: {
    position: "relative",
    paddingTop: r(22),
    paddingRight: r(32),
    paddingBottom: r(8),
    paddingLeft: r(56),
  },
  tlLine: {
    position: "absolute",
    left: r(30),
    top: r(30),
    bottom: r(14),
    width: r(2),
  },

  // node
  node: { position: "relative", paddingVertical: r(6) },
  dot: {
    position: "absolute",
    left: r(-26),
    top: r(5),
    width: r(16),
    height: r(16),
    borderRadius: 999,
    borderWidth: r(3),
  },
  nodeTop: { flexDirection: "row", alignItems: "baseline", gap: r(10) },
  city: { fontSize: r(17), fontWeight: 800 },
  iata: {
    fontFamily: "IBM Plex Mono",
    fontSize: r(11),
    fontWeight: 600,
    paddingVertical: r(2),
    paddingHorizontal: r(7),
    borderRadius: r(5),
  },
  time: {
    marginLeft: "auto",
    fontFamily: "IBM Plex Mono",
    fontSize: r(17),
    fontWeight: 600,
  },
  timeSup: { fontFamily: "IBM Plex Mono", fontSize: r(10), fontWeight: 600 },
  sub: { fontSize: r(10), marginTop: r(3) },

  // leg card
  leg: { paddingVertical: r(4) },
  legcard: {
    borderWidth: r(1.5),
    borderRadius: r(12),
    paddingVertical: r(12),
    paddingHorizontal: r(16),
    marginVertical: r(4),
  },
  legdur: {
    flexDirection: "row",
    alignItems: "center",
    gap: r(8),
    fontSize: r(11),
    fontWeight: 700,
    marginBottom: r(10),
  },
  legdurT: { fontSize: r(11), fontWeight: 700 },
  leggrid: { flexDirection: "row", flexWrap: "wrap" },
  lc: { width: "25%", paddingRight: r(8), marginBottom: r(4) },
  lcK: {
    fontSize: r(7.5),
    fontWeight: 700,
    letterSpacing: r(0.9),
    textTransform: "uppercase",
    marginBottom: r(3),
  },
  lcVwrap: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  lcV: { fontSize: r(12), fontWeight: 700 },
  lcVmono: { fontFamily: "IBM Plex Mono", fontWeight: 600 },
  cbadge: {
    fontSize: r(7),
    fontWeight: 700,
    letterSpacing: r(0.4),
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: r(2),
    paddingHorizontal: r(6),
    borderRadius: r(5),
    marginLeft: r(4),
  },

  // wait (layover) node
  wait: { position: "relative", paddingVertical: r(3) },
  waitDot: {
    position: "absolute",
    left: r(-23),
    top: r(4),
    width: r(10),
    height: r(10),
    borderRadius: 999,
    borderWidth: r(2),
    borderStyle: "dashed",
  },
  waitTxt: { fontSize: r(10.5), fontStyle: "italic" },
  waitB: { fontFamily: "IBM Plex Mono", fontStyle: "normal" },

  // maritime extra block
  extra: {
    marginHorizontal: r(32),
    marginTop: r(4),
    borderWidth: r(1.5),
    borderRadius: r(12),
    paddingVertical: r(12),
    paddingHorizontal: r(16),
    flexDirection: "row",
    flexWrap: "wrap",
  },

  // summary
  summary: {
    marginHorizontal: r(32),
    marginVertical: r(18),
    borderRadius: r(12),
    paddingVertical: r(18),
    paddingHorizontal: r(22),
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: r(14),
  },
  sK: {
    fontSize: r(8),
    fontWeight: 700,
    letterSpacing: r(1.3),
    textTransform: "uppercase",
    marginBottom: r(4),
    color: "rgba(255,255,255,0.6)",
  },
  sV: { fontSize: r(14), fontWeight: 700, color: "#ffffff" },
  sVmono: { fontFamily: "IBM Plex Mono", fontWeight: 600 },
  sPrice: { fontSize: r(20), fontWeight: 800, color: "#ffffff" },

  // footer
  foot: {
    paddingVertical: r(18),
    paddingHorizontal: r(32),
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: r(14),
  },
  footN: { fontSize: r(12), fontWeight: 800 },
  footA: { fontSize: r(9.5), marginTop: r(4), lineHeight: 1.6 },
  cts: { alignItems: "flex-end", gap: r(4) },
  ct: { flexDirection: "row", alignItems: "center", gap: r(6), justifyContent: "flex-end" },
  ctText: { fontSize: r(9.5), fontWeight: 600 },
  gen: {
    fontSize: r(8),
    textAlign: "center",
    lineHeight: 1.5,
    paddingTop: r(9),
    paddingBottom: r(14),
    paddingHorizontal: r(32),
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

function PhoneIcon({ color }: { color: string }) {
  return (
    <Svg width={r(11)} height={r(11)} viewBox="0 0 24 24">
      <Path
        d="M6.62 10.79a15 15 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"
        fill={color}
      />
    </Svg>
  );
}

function EmailIcon({ color }: { color: string }) {
  return (
    <Svg width={r(11)} height={r(11)} viewBox="0 0 24 24">
      <Path
        d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
        fill={color}
      />
    </Svg>
  );
}

function WebIcon({ color }: { color: string }) {
  return (
    <Svg width={r(11)} height={r(11)} viewBox="0 0 24 24">
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

// Vertical text rendered with a -90° rotation so it reads bottom-to-top, the
// way the reference's writing-mode: vertical-rl + rotate(180deg) does. The
// wrapper is kept narrow so the rotated text doesn't blow out the rail width.
function VerticalText({
  children,
  fontSize,
  fontFamily,
  letterSpacing,
  height,
}: {
  children: string;
  fontSize: number;
  fontFamily?: string;
  letterSpacing?: number;
  height: number;
}) {
  return (
    <View style={[s.vWrap, { height }]}>
      <Text
        style={[
          s.vText,
          {
            width: height,
            fontSize,
            fontFamily: fontFamily ?? "Work Sans",
            fontWeight: 700,
            letterSpacing,
          },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

function SideRail({
  pnr,
  vertLabel,
  isMaritime,
  p,
}: {
  pnr: string;
  vertLabel: string;
  isMaritime: boolean;
  p: PaletteColors;
}) {
  return (
    <View style={[s.side, { backgroundColor: p.brand }]} fixed>
      <View style={s.sideIcon}>
        {isMaritime ? (
          <ShipIcon size={r(26)} color="#ffffff" />
        ) : (
          <PlaneIcon size={r(26)} color="#ffffff" />
        )}
      </View>
      {/* vertical label, centered roughly in the rail */}
      <View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: RAIL_W,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <VerticalText fontSize={r(10)} letterSpacing={r(1.7)} height={r(170)}>
          {vertLabel}
        </VerticalText>
      </View>
      <View style={s.sidePnrBox}>
        <VerticalText
          fontSize={r(11)}
          fontFamily="IBM Plex Mono"
          letterSpacing={r(1.8)}
          height={r(80)}
        >
          {pnr}
        </VerticalText>
      </View>
    </View>
  );
}

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
    <View style={[s.head, { borderBottomColor: p.line }]}>
      <View>
        <Text style={[s.hn, { color: p.ink }]}>{name}</Text>
        {slogan ? <Text style={[s.hs, { color: p.muted }]}>{slogan}</Text> : null}
      </View>
      <View style={s.headR}>
        <Text style={[s.chip, { backgroundColor: p.tint, color: p.brand }]}>
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

function PassengerTable({
  passengers,
  airline,
  p,
}: {
  passengers: { name: string; ticketNumber?: string | null }[];
  airline: string;
  p: PaletteColors;
}) {
  return (
    <View style={[s.paxtab, { backgroundColor: p.tint }]}>
      <View style={s.paxCap}>
        <Text style={[s.fK, { color: p.muted, marginBottom: 0 }]}>Passagers</Text>
        <Text style={[s.pbadge, { backgroundColor: p.brand }]}>
          {passengers.length} Voyageur{passengers.length > 1 ? "s" : ""}
        </Text>
      </View>
      <View style={s.paxRow}>
        <Text style={[s.paxColName, s.paxHd, { color: p.muted }]}>Nom</Text>
        <Text style={[s.paxColTicket, s.paxHd, { color: p.muted }]}>Billet No.</Text>
        <Text style={[s.paxColCompany, s.paxHd, { color: p.muted }]}>Compagnie</Text>
      </View>
      {passengers.map((pax, i) => (
        <View key={i} style={[s.paxRow, s.paxRowBd, { borderTopColor: p.line }]}>
          <Text style={[s.paxColName, s.paxNm, { color: p.ink }]}>{pax.name}</Text>
          <Text style={[s.paxColTicket, s.paxVv, { color: p.ink }]}>
            {pax.ticketNumber ?? "—"}
          </Text>
          <Text style={[s.paxColCompany, s.paxVvTxt, { color: p.ink }]}>{airline}</Text>
        </View>
      ))}
    </View>
  );
}

// A circular node on the timeline line: city + IATA pill + time, then a sub.
function TimelineNode({
  city,
  code,
  time,
  nextDay,
  sub,
  p,
}: {
  city: string;
  code: string;
  time: string;
  nextDay: boolean;
  sub: string;
  p: PaletteColors;
}) {
  return (
    <View style={s.node} wrap={false}>
      <View style={[s.dot, { backgroundColor: p.brand, borderColor: p.paper ?? "#ffffff" }]} />
      <View style={s.nodeTop}>
        <Text style={[s.city, { color: p.ink }]}>{city}</Text>
        <Text style={[s.iata, { color: p.brand, backgroundColor: p.tint }]}>{code}</Text>
        <Text style={[s.time, { color: p.ink }]}>
          {time}
          {nextDay ? <Text style={s.timeSup}>+1</Text> : null}
        </Text>
      </View>
      {sub ? <Text style={[s.sub, { color: p.muted }]}>{sub}</Text> : null}
    </View>
  );
}

type Fact = { k: string; v: string; mono?: boolean; badge?: string };

// A bordered card between two nodes carrying the leg's flight/crossing detail.
function LegCard({
  durText,
  durMeta,
  isMaritime,
  facts,
  p,
}: {
  durText: string;
  durMeta: string;
  isMaritime: boolean;
  facts: Fact[];
  p: PaletteColors;
}) {
  return (
    <View style={s.leg} wrap={false}>
      <View style={[s.legcard, { borderColor: p.line }]}>
        <View style={s.legdur}>
          {isMaritime ? (
            <ShipIcon size={r(15)} color={p.brand} />
          ) : (
            <PlaneIcon size={r(15)} color={p.brand} />
          )}
          <Text style={[s.legdurT, { color: p.brand }]}>
            {[durText, durMeta].filter(Boolean).join(" · ")}
          </Text>
        </View>
        <View style={s.leggrid}>
          {facts.map((f, i) => (
            <View key={i} style={s.lc}>
              <Text style={[s.lcK, { color: p.muted }]}>{f.k}</Text>
              <View style={s.lcVwrap}>
                <Text
                  style={
                    f.mono
                      ? [s.lcV, s.lcVmono, { color: p.ink }]
                      : [s.lcV, { color: p.ink }]
                  }
                >
                  {f.v}
                </Text>
                {f.badge ? (
                  <Text style={[s.cbadge, { backgroundColor: p.brand }]}>{f.badge}</Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function WaitNode({ city, code, wait, p }: { city: string; code: string; wait: string; p: PaletteColors }) {
  return (
    <View style={s.wait} wrap={false}>
      <View style={[s.waitDot, { backgroundColor: p.paper ?? "#ffffff", borderColor: p.brand }]} />
      <Text style={[s.waitTxt, { color: p.muted }]}>
        Escale à {city} ({code}) — attente{" "}
        <Text style={[s.waitB, { color: p.brand }]}>{wait}</Text>
      </Text>
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
    <View style={[s.summary, { backgroundColor: p.brand }]} wrap={false}>
      {blocks.map((b, i) => (
        <View key={i}>
          <Text style={s.sK}>{b.k}</Text>
          <Text style={b.mono ? [s.sV, s.sVmono] : s.sV}>{b.v}</Text>
        </View>
      ))}
      <View>
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
      <View style={[s.foot, { backgroundColor: p.tint }]} wrap={false}>
        <View style={{ flexShrink: 1 }}>
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
// Timeline builders
// ---------------------------------------------------------------------------

// Builds the ordered list of timeline elements for a flight itinerary by walking
// DIRECTIONS, then the connecting LEGS within each. The bound sublabel
// (Aller/Retour/Trajet N) comes from getDirectionLabel — never leg position — and
// is null for a one-way trip. A dashed wait node appears only between two legs of
// the SAME direction (a connection), never at a turnaround between directions.
function buildFlightTimeline(
  directions: FlightDirection[],
  isMultiPax: boolean,
  passengerCount: number,
  p: PaletteColors,
): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  const allLegs = directions.flatMap((d) => d.legs);
  if (allLegs.length === 0) return items;

  const first = allLegs[0];
  const startLabel = getDirectionLabel(directions, 0);
  const firstSub = startLabel
    ? `${startLabel} · ${formatDate(first.departureDate)}`
    : `Départ · ${formatDate(first.departureDate)}`;
  items.push(
    <TimelineNode
      key="n-start"
      city={first.departureCity}
      code={first.departureAirport}
      time={first.departureTime}
      nextDay={false}
      sub={firstSub}
      p={p}
    />,
  );

  const lastDirIndex = directions.length - 1;
  let g = 0;

  directions.forEach((dir, di) => {
    const boundLabel = getDirectionLabel(directions, di);

    dir.legs.forEach((leg, li) => {
      // Layover wait node between consecutive legs of the SAME direction only.
      if (li > 0) {
        const prev = dir.legs[li - 1];
        if (prev.arrivalTime) {
          const wait = formatDuration(
            prev.arrivalTime,
            leg.departureTime,
            prev.arrivalDate ?? prev.departureDate,
            leg.departureDate,
          );
          items.push(
            <WaitNode
              key={`w-${g}`}
              city={prev.arrivalCity}
              code={prev.arrivalAirport}
              wait={wait}
              p={p}
            />,
          );
        }
      }

      const durText = legDuration(leg);

      // The duration row's trailing meta mirrors the reference. The bound label
      // (when present) supplies the Aller/Retour text; a single-bound connection
      // shows the airline; a lone direct flight shows "Vol direct".
      let durMeta: string;
      if (isMultiPax) {
        durMeta = `${passengerCount} adultes`;
      } else if (boundLabel) {
        durMeta = `${leg.airline} · ${boundLabel}`;
      } else if (dir.legs.length > 1) {
        durMeta = leg.airline;
      } else {
        durMeta = "Vol direct";
      }

      let facts: Fact[];
      if (isMultiPax) {
        facts = [
          { k: "Vol", v: leg.flightNumber, mono: true },
          { k: "Date", v: formatDate(leg.departureDate) },
          { k: "Cabine", v: leg.cabin ?? "Economy" },
          {
            k: "Bagages",
            v: leg.baggageAllowance ? `${leg.baggageAllowance}/p.` : "—",
          },
        ];
      } else if (boundLabel) {
        facts = [
          { k: "Vol", v: leg.flightNumber, mono: true },
          { k: "Date", v: formatDate(leg.departureDate) },
          { k: "Cabine", v: leg.cabin ?? "Economy" },
          { k: "Bagages", v: leg.baggageAllowance ?? "—" },
        ];
      } else {
        // One-way / single-bound connection show the company column.
        facts = [
          { k: "Compagnie", v: leg.airline },
          { k: "Vol", v: leg.flightNumber, mono: true },
          { k: "Cabine", v: leg.cabin ?? "Economy" },
          { k: "Bagages", v: leg.baggageAllowance ?? "—" },
        ];
      }

      items.push(
        <LegCard
          key={`l-${g}`}
          durText={durText}
          durMeta={durMeta}
          isMaritime={false}
          facts={facts}
          p={p}
        />,
      );

      // Only the final arrival of the whole itinerary carries the closing bound
      // label (e.g. "Retour"); every other arrival is a plain "Arrivée".
      const isFinalLeg = di === lastDirIndex && li === dir.legs.length - 1;
      const endLabel = isFinalLeg ? boundLabel : null;
      const arrNextDay = isNextDay(leg.departureDate, leg.arrivalDate);
      const arrSub = endLabel
        ? `${endLabel} · ${formatDate(leg.arrivalDate ?? leg.departureDate)}`
        : leg.arrivalDate
          ? `Arrivée · ${formatDate(leg.arrivalDate)}`
          : "Arrivée";
      items.push(
        <TimelineNode
          key={`n-${g}`}
          city={leg.arrivalCity}
          code={leg.arrivalAirport}
          time={leg.arrivalTime ?? ""}
          nextDay={arrNextDay}
          sub={arrSub}
          p={p}
        />,
      );

      g += 1;
    });
  });

  return items;
}

// Builds the timeline for a maritime itinerary by walking DIRECTIONS, then the
// crossings (legs) within each. A dashed wait node appears only between two legs
// of the SAME direction, never at a turnaround between directions. The bound
// sublabel (Aller/Retour/Trajet N) comes from getDirectionLabel.
function buildMaritimeTimeline(
  directions: MaritimeDirection[],
  p: PaletteColors,
): React.ReactNode[] {
  const items: React.ReactNode[] = [];
  const allLegs = directions.flatMap((d) => d.legs);
  if (allLegs.length === 0) return items;

  const first = allLegs[0];
  const startLabel = getDirectionLabel(directions, 0);
  items.push(
    <TimelineNode
      key="m-start"
      city={first.departureCity}
      code="PORT"
      time={first.departureTime}
      nextDay={false}
      sub={`Port de ${first.departureCity} · ${startLabel ? `${startLabel} · ` : "Embarquement · "}${formatDate(first.departureDate)}`}
      p={p}
    />,
  );

  const lastDirIndex = directions.length - 1;
  let g = 0;

  directions.forEach((dir, di) => {
    const boundLabel = getDirectionLabel(directions, di);

    dir.legs.forEach((leg, li) => {
      // Wait node between consecutive crossings of the SAME direction only.
      if (li > 0) {
        const prev = dir.legs[li - 1];
        if (prev.arrivalTime) {
          const wait = formatDuration(
            prev.arrivalTime,
            leg.departureTime,
            prev.arrivalDate ?? prev.departureDate,
            leg.departureDate,
          );
          items.push(
            <WaitNode key={`mw-${g}`} city={prev.arrivalCity} code="PORT" wait={wait} p={p} />,
          );
        }
      }

      const durText = maritimeLegDuration(leg);
      const facts: Fact[] = [
        { k: "Navire", v: leg.shipName },
        {
          k: "Classe",
          v: leg.cabinType ?? "—",
          badge: leg.cabinNumber ? leg.cabinNumber : undefined,
        },
      ];
      if (leg.deckNumber) facts.push({ k: "Pont", v: leg.deckNumber });
      facts.push({
        k: "Véhicule",
        v: leg.hasVehicle ? (leg.vehicleType ?? "Véhicule") : "Sans véhicule",
      });

      items.push(
        <LegCard
          key={`ml-${g}`}
          durText={durText}
          durMeta={boundLabel ? `${leg.company} · ${boundLabel}` : leg.company}
          isMaritime
          facts={facts}
          p={p}
        />,
      );

      const isFinalLeg = di === lastDirIndex && li === dir.legs.length - 1;
      const endLabel = isFinalLeg ? boundLabel : null;
      const arrNextDay = isNextDay(leg.departureDate, leg.arrivalDate);
      items.push(
        <TimelineNode
          key={`mn-${g}`}
          city={leg.arrivalCity}
          code="PORT"
          time={leg.arrivalTime ?? ""}
          nextDay={arrNextDay}
          sub={`Port de ${leg.arrivalCity} · ${endLabel ? `${endLabel} · ` : ""}Arrivée`}
          p={p}
        />,
      );

      g += 1;
    });
  });

  return items;
}

// ---------------------------------------------------------------------------
// Main template
// ---------------------------------------------------------------------------

export function TimelineTemplate({ data, agency, palette }: TemplateProps) {
  const p = palette;
  const isMaritime = data.type === "MARITIME";
  const isMultiLeg = data.type === "MULTI_LEG";
  const flightDirections = getFlightDirections(data);
  const maritimeDirections = getMaritimeDirections(data);
  const passengers = data.passengers ?? [];
  const isMultiPax = passengers.length > 1;
  const passengerCount = passengers.length;
  // A connection (a direction with >1 leg) also warrants a total-duration readout.
  const hasConnection = flightDirections.some((d) => d.legs.length > 1);

  const title =
    isMaritime && maritimeDirections.length > 0
      ? getMaritimeTitle(maritimeDirections)
      : (TYPE_TITLES[data.type] ?? data.type);

  const priceStr =
    data.price && data.currency ? formatPrice(data.price, data.currency) : "—";
  const pnr = data.bookingReference ?? "—";

  // ---- Passenger band -----------------------------------------------------
  const airline =
    flightDirections[0]?.legs[0]?.airline ??
    maritimeDirections[0]?.legs[0]?.company ??
    "";
  const ribbonFields: Field[] = [
    { k: "Passager", v: passengers[0]?.name ?? "", variant: "big" },
    { k: "Billet No.", v: passengers[0]?.ticketNumber ?? "—", variant: "mono" },
    isMultiLeg || hasConnection
      ? { k: "Durée totale", v: computeTripDuration(flightDirections) || "—" }
      : {
          k: "Émission",
          v: data.issuedDate ? formatDate(data.issuedDate) : "—",
        },
  ];

  // ---- Timeline items -----------------------------------------------------
  const timeline =
    isMaritime && maritimeDirections.length > 0
      ? buildMaritimeTimeline(maritimeDirections, p)
      : buildFlightTimeline(flightDirections, isMultiPax, passengerCount, p);

  // ---- Maritime extra block ----------------------------------------------
  const firstJourney = maritimeDirections[0]?.legs[0];

  // ---- Summary ------------------------------------------------------------
  const summaryBlocks: { k: string; v: string; mono?: boolean }[] = [];
  let summaryTotal: { k: string; v: string };

  if (isMultiPax) {
    let perPax = "—";
    if (data.price && data.currency) {
      const num = parseFloat(data.price.replace(/\s/g, "").replace(",", "."));
      if (!isNaN(num)) {
        perPax = formatPrice(String(Math.round(num / passengerCount)), data.currency);
      }
    }
    summaryBlocks.push({ k: "Référence (PNR)", v: pnr, mono: true });
    summaryBlocks.push({ k: "Prix / passager", v: perPax });
    summaryTotal = { k: `Prix total (×${passengerCount})`, v: priceStr };
  } else if (isMultiLeg || hasConnection) {
    summaryBlocks.push({ k: "Référence (PNR)", v: pnr, mono: true });
    summaryBlocks.push({ k: "Durée totale", v: computeTripDuration(flightDirections) || "—" });
    summaryTotal = { k: "Prix total", v: priceStr };
  } else if (isMaritime) {
    summaryBlocks.push({ k: "Référence (PNR)", v: pnr, mono: true });
    const durLabel = maritimeDirections.length >= 2 ? "Durée totale" : "Durée traversée";
    summaryBlocks.push({
      k: durLabel,
      v: computeTripDuration(maritimeDirections) || "—",
    });
    summaryTotal = { k: "Prix total", v: priceStr };
  } else {
    summaryBlocks.push({ k: "Référence (PNR)", v: pnr, mono: true });
    summaryBlocks.push({
      k: "Émission",
      v: data.issuedDate ? formatDate(data.issuedDate) : "—",
    });
    summaryTotal = { k: "Prix total", v: priceStr };
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <SideRail
          pnr={pnr}
          vertLabel={isMaritime ? "Traversée Maritime" : "Billet Électronique"}
          isMaritime={isMaritime}
          p={p}
        />

        <View style={s.body}>
          <Header agency={agency} title={title} p={p} />

          {isMultiPax ? (
            <PassengerTable passengers={passengers} airline={airline} p={p} />
          ) : (
            <PassengerRibbon fields={ribbonFields} p={p} />
          )}

          <View style={s.tl}>
            <View style={[s.tlLine, { backgroundColor: p.line }]} />
            {timeline}
          </View>

          {isMaritime && firstJourney ? (
            <View style={[s.extra, { borderColor: p.line }]} wrap={false}>
              <View style={s.lc}>
                <Text style={[s.lcK, { color: p.muted }]}>Numéro de cabine</Text>
                <Text style={[s.lcV, s.lcVmono, { color: p.ink }]}>
                  {firstJourney.cabinNumber ?? "—"}
                </Text>
              </View>
              <View style={s.lc}>
                <Text style={[s.lcK, { color: p.muted }]}>Pont</Text>
                <Text style={[s.lcV, { color: p.ink }]}>
                  {firstJourney.deckNumber ?? "—"}
                </Text>
              </View>
              <View style={s.lc}>
                <Text style={[s.lcK, { color: p.muted }]}>Classe</Text>
                <Text style={[s.lcV, { color: p.ink }]}>
                  {firstJourney.cabinType ?? "—"}
                </Text>
              </View>
              <View style={s.lc}>
                <Text style={[s.lcK, { color: p.muted }]}>Véhicule</Text>
                <Text style={[s.lcV, { color: p.ink }]}>
                  {firstJourney.hasVehicle
                    ? (firstJourney.vehicleType ?? "Véhicule")
                    : "Sans véhicule"}
                </Text>
              </View>
            </View>
          ) : null}

          <View style={s.grow} />

          <Summary blocks={summaryBlocks} total={summaryTotal} p={p} />
          <Footer agency={agency} isMaritime={isMaritime} p={p} />
        </View>
      </Page>
    </Document>
  );
}
