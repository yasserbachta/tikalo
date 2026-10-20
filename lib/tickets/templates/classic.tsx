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
  Fee,
  getFlightDirections,
  getMaritimeDirections,
  getDirectionLabel,
} from "../schema";
import { TemplateProps } from "./types";

// ---------------------------------------------------------------------------
// Agency branding interface
// ---------------------------------------------------------------------------

export interface AgencyBranding {
  name: string;
  slogan?: string | null;  // tagline under the agency name in the header
  logoSrc?: string | null;
  primaryColor: string;    // hex like "#1a2d5a"
  secondaryColor: string;  // hex like "#f0f2f5"
  contactPhone?: string | null;
  contactEmail?: string | null;
  contactWebsite?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
}

// ---------------------------------------------------------------------------
// Font registration — local files to avoid remote URL breakage
// ---------------------------------------------------------------------------

const fontsDir = path.join(process.cwd(), "public", "fonts");

Font.register({
  family: "Montserrat",
  fonts: [
    { src: path.join(fontsDir, "montserrat-400.ttf"), fontWeight: 400 },
    { src: path.join(fontsDir, "montserrat-500.ttf"), fontWeight: 500 },
    { src: path.join(fontsDir, "montserrat-600.ttf"), fontWeight: 600 },
    { src: path.join(fontsDir, "montserrat-700.ttf"), fontWeight: 700 },
    { src: path.join(fontsDir, "montserrat-800.ttf"), fontWeight: 800 },
  ],
});

// ---------------------------------------------------------------------------
// Default Colors (used when no agency branding is provided)
// ---------------------------------------------------------------------------

const c = {
  navy: "#1a2d5a",
  navy2: "#243d7a",
  sky: "#f0f2f5",
  sky2: "#e2e6ed",
  blue: "#3a6da8",
  muted: "#4a5d78",
  rule: "#d0d6e0",
  white: "#ffffff",
};

const categoryColors: Record<string, { bg: string; text: string }> = {
  port: { bg: "#dbeafe", text: "#1e40af" },
  security: { bg: "#fee2e2", text: "#991b1b" },
  fuel: { bg: "#fef3c7", text: "#92400e" },
  cabin: { bg: "#ede9fe", text: "#5b21b6" },
  vehicle: { bg: "#ccfbf1", text: "#115e59" },
  passenger: { bg: "#f3f4f6", text: "#374151" },
  tax: { bg: "#fce7f3", text: "#9d174d" },
  other: { bg: "#f3f4f6", text: "#374151" },
};

// ---------------------------------------------------------------------------
// Branded colors helper — overrides navy/sky with the resolved palette
// ---------------------------------------------------------------------------

interface BrandedColors {
  navy: string;
  navy2: string;
  sky: string;
  sky2: string;
  blue: string;
  muted: string;
  rule: string;
  white: string;
}

function getBrandedColors(palette: {
  brand: string;
  tint?: string;
}): BrandedColors {
  return {
    ...c,
    navy: palette.brand,
    sky: palette.tint ?? c.sky,
  };
}

// ---------------------------------------------------------------------------
// French months
// ---------------------------------------------------------------------------

const MOIS = [
  "Jan",
  "Fév",
  "Mar",
  "Avr",
  "Mai",
  "Jun",
  "Jul",
  "Aoû",
  "Sep",
  "Oct",
  "Nov",
  "Déc",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${day} ${MOIS[month - 1]} ${year}`;
}

function formatPrice(price: string, currency: string): string {
  const num = parseFloat(price.replace(/\s/g, "").replace(",", "."));
  if (isNaN(num)) return `${price} ${currency}`;
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  })
    .format(num)
    .replace(/\u202f|\u00a0/g, " ");
  return `${formatted} ${currency}`;
}

function formatAmount(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace(/\u202f|\u00a0/g, " ");
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
  return formatMinutes(
    computeDurationMinutes(depTime, arrTime, depDate, arrDate),
  );
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

function formatTime(time: string, nextDay?: boolean): string {
  return nextDay ? `${time}+1` : time;
}

// Whole-trip duration = sum of each direction's own duration (flights +
// in-direction layovers). Used for the summary band on connecting/maritime trips.
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

function getMaritimeItinerary(directions: MaritimeDirection[]): string {
  const cityRoute = (legs: MaritimeLeg[]) =>
    `${legs[0].departureCity} → ${legs[legs.length - 1].arrivalCity}`;
  if (directions.length === 1) return cityRoute(directions[0].legs);
  if (directions.length === 2 && directions.some((d) => d.kind === "RETURN")) {
    const out = directions[0].legs;
    return `${out[0].departureCity} ⇄ ${out[out.length - 1].arrivalCity}`;
  }
  const cities = [directions[0].legs[0].departureCity];
  for (const d of directions) cities.push(d.legs[d.legs.length - 1].arrivalCity);
  return cities.join(" → ");
}

// The per-leg heading: "Aller — Alger → Paris" (bound label from kind, city
// pair from the leg). A one-way trip has no bound label.
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

const TYPE_META: Record<string, string> = {
  ONE_WAY: "Aller Simple",
  ROUND_TRIP: "Aller-Retour",
  MULTI_LEG: "Multi-Escale",
  MARITIME: "Aller Simple — Maritime",
};

// ---------------------------------------------------------------------------
// Styles (using default colors — branded colors applied via inline styles)
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  page: {
    backgroundColor: c.white,
    fontFamily: "Montserrat",
    fontSize: 9,
    color: c.navy,
    padding: 0,
    display: "flex",
    flexDirection: "column",
  },

  // Header
  header: {
    backgroundColor: c.navy,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hName: {
    fontSize: 13,
    fontWeight: 800,
    letterSpacing: 1.3,
    textTransform: "uppercase",
    color: c.white,
  },
  hTag: {
    fontSize: 8,
    fontWeight: 500,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: c.sky,
    marginTop: 3,
  },
  hRight: { alignItems: "flex-end" },
  hType: {
    fontSize: 8.5,
    fontWeight: 600,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: c.sky,
  },
  hTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: c.white,
    marginTop: 2,
  },

  // Passenger band — single
  paxBand: {
    backgroundColor: c.sky,
    borderBottomWidth: 1.5,
    borderBottomColor: c.rule,
    paddingVertical: 12,
    paddingHorizontal: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  lbl: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: c.muted,
    marginBottom: 2,
  },
  paxName: { fontSize: 18, fontWeight: 700, color: c.navy },
  paxExtra: { fontSize: 9, fontWeight: 500, color: c.muted, marginTop: 1 },
  metaRow: { flexDirection: "row", gap: 22 },
  metaVal: { fontSize: 11, fontWeight: 600, color: c.navy },

  // Passenger band — multi
  paxBandMulti: {
    backgroundColor: c.sky,
    borderBottomWidth: 1.5,
    borderBottomColor: c.rule,
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  paxMultiTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  paxCountBadge: {
    backgroundColor: c.navy,
    borderRadius: 3,
    paddingVertical: 2.5,
    paddingHorizontal: 8,
  },
  paxCountBadgeText: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: c.white,
  },
  paxTableHeader: {
    flexDirection: "row",
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: c.rule,
    marginBottom: 4,
  },
  paxTableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: c.rule,
    borderBottomStyle: "dashed",
    alignItems: "center",
  },
  paxTableRowLast: {
    flexDirection: "row",
    paddingVertical: 5,
    alignItems: "center",
  },
  paxColName: { flex: 2 },
  paxColTicket: { flex: 1.5 },
  paxColAirline: { flex: 1.2 },
  paxRowName: { fontSize: 13, fontWeight: 700, color: c.navy },
  paxRowVal: { fontSize: 11, fontWeight: 600, color: c.navy },

  // Section badge row
  secRow: {
    paddingTop: 14,
    paddingHorizontal: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  secBadge: {
    backgroundColor: c.navy,
    borderRadius: 2,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  secBadgeText: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: c.white,
  },
  secDir: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: c.muted,
  },

  // Flight card
  card: {
    marginTop: 8,
    marginHorizontal: 36,
    borderWidth: 1.5,
    borderColor: c.rule,
    borderRadius: 6,
    overflow: "hidden",
  },
  fTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 22,
    borderBottomWidth: 1.5,
    borderBottomColor: c.rule,
    borderBottomStyle: "dashed",
  },
  ap: { minWidth: 100 },
  apRight: { minWidth: 100, alignItems: "flex-end" },
  iata: {
    fontSize: 32,
    fontWeight: 800,
    letterSpacing: -0.6,
    color: c.navy,
    lineHeight: 1,
  },
  city: { fontSize: 9, fontWeight: 500, color: c.muted, marginTop: 3 },
  time: { fontSize: 15, fontWeight: 700, color: c.navy, marginTop: 4 },
  mid: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
  },
  durPill: {
    backgroundColor: c.sky,
    borderWidth: 1.5,
    borderColor: c.rule,
    borderRadius: 16,
    paddingVertical: 3,
    paddingHorizontal: 12,
  },
  durPillText: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: c.navy,
  },
  rLine: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
  },
  rBar: { flex: 1, height: 1.5, backgroundColor: c.rule },
  planeIcon: { marginHorizontal: 4 },
  fBot: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 22,
  },
  dc: {
    flex: 1,
    minWidth: 70,
    borderRightWidth: 1.5,
    borderRightColor: c.rule,
    paddingRight: 10,
    marginRight: 10,
  },
  dcLast: {
    flex: 1,
    minWidth: 70,
    borderRightWidth: 0,
    paddingRight: 0,
    marginRight: 0,
  },
  dv: { fontSize: 10.5, fontWeight: 600, color: c.navy },
  cabinBadge: {
    backgroundColor: c.navy,
    color: c.white,
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginTop: 3,
    alignSelf: "flex-start",
  },

  // Layover
  layover: {
    marginTop: 8,
    marginHorizontal: 36,
    backgroundColor: c.sky,
    borderWidth: 1.5,
    borderColor: c.rule,
    borderRadius: 5,
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  layoverText: { fontSize: 9.5, fontWeight: 600, color: c.navy, flex: 1 },
  layoverDur: { fontSize: 9.5, fontWeight: 700, color: c.blue },

  // Extra card (maritime)
  extraCard: {
    marginTop: 8,
    marginHorizontal: 36,
    backgroundColor: c.sky,
    borderWidth: 1.5,
    borderColor: c.rule,
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 22,
    flexDirection: "row",
  },

  // Fee breakdown section
  feeSection: {
    backgroundColor: c.sky,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderTopWidth: 1.5,
    borderTopColor: c.rule,
    borderTopStyle: "dashed",
  },
  feeHeader: {
    fontSize: 8.5,
    fontWeight: 700,
    color: c.muted,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  feeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  feeLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  feeCategoryBadge: {
    fontSize: 6,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    borderRadius: 2,
  },
  feeLabel: {
    fontSize: 12.5,
    fontWeight: 500,
    color: c.navy,
  },
  feeAmount: {
    fontSize: 12.5,
    fontWeight: 600,
    color: c.navy,
  },
  feeSubtotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: c.rule,
  },
  feeSubtotalLabel: {
    fontSize: 12.5,
    fontWeight: 700,
    color: c.navy,
  },
  feeSubtotalAmount: {
    fontSize: 12.5,
    fontWeight: 700,
    color: c.navy,
  },

  // Page spacer
  spacer: { flex: 1 },

  // Summary band
  summary: {
    marginTop: 16,
    marginBottom: 16,
    marginHorizontal: 36,
    backgroundColor: c.navy,
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sLbl: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "rgba(255,255,255,0.55)",
    marginBottom: 3,
  },
  sVal: { fontSize: 13, fontWeight: 700, color: c.white },
  sValPnr: {
    fontSize: 16,
    fontWeight: 700,
    color: c.white,
    letterSpacing: 1.5,
  },
  sValPrice: { fontSize: 16, fontWeight: 700, color: c.sky },

  // Footer
  footer: {
    backgroundColor: c.sky,
    borderTopWidth: 1.5,
    borderTopColor: c.rule,
    paddingVertical: 12,
    paddingHorizontal: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  fName: {
    fontSize: 9.5,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: c.navy,
  },
  fAddr: {
    fontSize: 8.5,
    fontWeight: 400,
    color: c.muted,
    marginTop: 2,
    lineHeight: 1.5,
  },
  fContacts: { alignItems: "flex-end", gap: 3 },
  fContact: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  fContactText: { fontSize: 8.5, fontWeight: 500, color: c.muted },
  fContactBold: { fontSize: 8.5, fontWeight: 600, color: c.navy },

  // Disclaimer
  disclaimer: {
    fontSize: 7,
    color: c.muted,
    textAlign: "center",
    paddingTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 36,
    letterSpacing: 0.3,
  },
});

// ---------------------------------------------------------------------------
// SVG Icons for footer
// ---------------------------------------------------------------------------

function PlaneIcon({ bc }: { bc?: BrandedColors }) {
  const colors = bc ?? c;
  return (
    <Svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      style={[s.planeIcon, { transform: "rotate(90)" }]}>
      <Path
        d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0011.5 2 1.5 1.5 0 0010 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
        fill={colors.navy2}
      />
    </Svg>
  );
}

function ShipIcon({ bc }: { bc?: BrandedColors }) {
  const colors = bc ?? c;
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" style={s.planeIcon}>
      <Path
        d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1 1 0 00-.65 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z"
        fill={colors.navy2}
      />
    </Svg>
  );
}

function PhoneIcon({ bc }: { bc?: BrandedColors }) {
  const colors = bc ?? c;
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Path
        d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"
        fill={colors.navy}
      />
    </Svg>
  );
}

function EmailIcon({ bc }: { bc?: BrandedColors }) {
  const colors = bc ?? c;
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Path
        d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"
        fill={colors.navy}
      />
    </Svg>
  );
}

function WebIcon({ bc }: { bc?: BrandedColors }) {
  const colors = bc ?? c;
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={10} stroke={colors.navy} strokeWidth={2} />
      <Path
        d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20"
        stroke={colors.navy}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Header({
  type,
  maritimeDirections,
  agency,
  bc,
}: {
  type: string;
  maritimeDirections?: MaritimeDirection[];
  agency?: AgencyBranding;
  bc: BrandedColors;
}) {
  const title =
    type === "MARITIME" && maritimeDirections && maritimeDirections.length > 0
      ? getMaritimeTitle(maritimeDirections)
      : (TYPE_TITLES[type] ?? type);

  const agencyName = agency?.name ?? "Tikalo";
  // Editable tagline; fall back to the house default only for the no-agency case.
  const slogan = agency ? agency.slogan : "rester a jour";

  return (
    <View style={[s.header, { backgroundColor: bc.navy }]}>
      <View>
        <Text style={s.hName}>{agencyName}</Text>
        {slogan ? (
          <Text style={[s.hTag, { color: bc.sky }]}>{slogan}</Text>
        ) : null}
      </View>
      <View style={s.hRight}>
        <Text style={[s.hType, { color: bc.sky }]}>Billet Électronique</Text>
        <Text style={s.hTitle}>{title}</Text>
      </View>
    </View>
  );
}

function PassengerBand({ data, bc }: { data: TicketData; bc: BrandedColors }) {
  const passengers = data.passengers ?? [];
  const isMultiPax = passengers.length > 1;

  if (isMultiPax) {
    // Get airline from the first flight leg or maritime crossing
    const airline =
      getFlightDirections(data)[0]?.legs[0]?.airline ??
      getMaritimeDirections(data)[0]?.legs[0]?.company ??
      "";

    return (
      <View style={[s.paxBandMulti, { backgroundColor: bc.sky }]}>
        <View style={s.paxMultiTitleRow}>
          <Text style={s.lbl}>Passagers</Text>
          <View style={[s.paxCountBadge, { backgroundColor: bc.navy }]}>
            <Text style={s.paxCountBadgeText}>
              {passengers.length} Voyageur{passengers.length > 1 ? "s" : ""}
            </Text>
          </View>
        </View>
        <View style={s.paxTableHeader}>
          <View style={s.paxColName}>
            <Text style={s.lbl}>Nom</Text>
          </View>
          <View style={s.paxColTicket}>
            <Text style={s.lbl}>Billet No.</Text>
          </View>
          <View style={s.paxColAirline}>
            <Text style={s.lbl}>Compagnie</Text>
          </View>
        </View>
        {passengers.map((pax, i) => (
          <View
            key={i}
            style={
              i === passengers.length - 1 ? s.paxTableRowLast : s.paxTableRow
            }
          >
            <View style={s.paxColName}>
              <Text style={[s.paxRowName, { color: bc.navy }]}>{pax.name}</Text>
            </View>
            <View style={s.paxColTicket}>
              <Text style={[s.paxRowVal, { color: bc.navy }]}>{pax.ticketNumber ?? "—"}</Text>
            </View>
            <View style={s.paxColAirline}>
              <Text style={[s.paxRowVal, { color: bc.navy }]}>{airline}</Text>
            </View>
          </View>
        ))}
      </View>
    );
  }

  // Single passenger layout
  const first = passengers[0];
  const ticketNumber = first?.ticketNumber;
  const isMultiLeg = data.type === "MULTI_LEG";
  const isMaritime = data.type === "MARITIME";
  const showTypeMeta = isMultiLeg || isMaritime;

  let rightLabel: string;
  let rightValue: string;

  if (isMultiLeg) {
    rightLabel = "Itinéraire";
    rightValue = getItinerary(getFlightDirections(data));
  } else if (isMaritime && getMaritimeDirections(data).length > 0) {
    rightLabel = "Itinéraire";
    rightValue = getMaritimeItinerary(getMaritimeDirections(data));
  } else {
    rightLabel = "Type";
    rightValue = TYPE_META[data.type] ?? data.type;
  }

  return (
    <View style={[s.paxBand, { backgroundColor: bc.sky }]}>
      <View>
        <Text style={s.lbl}>Passager</Text>
        <Text style={[s.paxName, { color: bc.navy }]}>{first?.name ?? ""}</Text>
      </View>
      <View style={s.metaRow}>
        {ticketNumber && (
          <View>
            <Text style={s.lbl}>Billet No.</Text>
            <Text style={[s.metaVal, { color: bc.navy }]}>{ticketNumber}</Text>
          </View>
        )}
        {showTypeMeta && (
          <View>
            <Text style={s.lbl}>{rightLabel}</Text>
            <Text style={[s.metaVal, { color: bc.navy }]}>{rightValue}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function SectionBadge({
  index,
  total,
  direction,
  isMaritime,
  marginTop,
  bc,
}: {
  index: number;
  total: number;
  direction: string;
  isMaritime?: boolean;
  marginTop?: number;
  bc: BrandedColors;
}) {
  const label = isMaritime
    ? `Traversée ${index}/${total}`
    : `Vol ${index}/${total}`;
  return (
    <View style={[s.secRow, marginTop ? { marginTop } : {}]}>
      <View style={[s.secBadge, { backgroundColor: bc.navy }]}>
        <Text style={s.secBadgeText}>{label}</Text>
      </View>
      <Text style={s.secDir}>{direction}</Text>
    </View>
  );
}

function FlightCard({
  segment,
  isMaritime,
  maritime,
  showFees,
  currency,
  passengerCount,
  bc,
}: {
  segment?: FlightLeg;
  isMaritime?: boolean;
  maritime?: MaritimeLeg;
  showFees?: boolean;
  currency?: string;
  passengerCount?: number;
  bc: BrandedColors;
}) {
  // Gather data from either segment or maritime
  const depCode = isMaritime
    ? (maritime?.departurePort?.substring(0, 3).toUpperCase() ?? "")
    : (segment?.departureAirport ?? "");
  const arrCode = isMaritime
    ? (maritime?.arrivalPort?.substring(0, 3).toUpperCase() ?? "")
    : (segment?.arrivalAirport ?? "");
  const depCity = isMaritime
    ? `Port d'${maritime?.departureCity ?? ""}`
    : `${segment?.departureCity ?? ""} · ${segment?.departureAirport ?? ""}`;
  const arrCity = isMaritime
    ? `Port de ${maritime?.arrivalCity ?? ""}`
    : `${segment?.arrivalCity ?? ""} · ${segment?.arrivalAirport ?? ""}`;
  const depTime = isMaritime
    ? (maritime?.departureTime ?? "")
    : (segment?.departureTime ?? "");
  const arrTime = isMaritime
    ? (maritime?.arrivalTime ?? "")
    : (segment?.arrivalTime ?? "");
  const depDate = isMaritime ? maritime?.departureDate : segment?.departureDate;
  const arrDate = isMaritime
    ? (maritime?.arrivalDate ?? null)
    : (segment?.arrivalDate ?? null);

  const nextDay = isNextDay(depDate, arrDate);
  const rawDuration = isMaritime ? maritime?.duration : segment?.duration;
  const duration = rawDuration
    ? formatDurationString(rawDuration)
    : depTime && arrTime
      ? formatDuration(depTime, arrTime, depDate, arrDate)
      : null;

  const IconComponent = isMaritime ? ShipIcon : PlaneIcon;

  // Bottom columns
  const isMultiPax = (passengerCount ?? 1) > 1;
  let columns: { label: string; value: string; badge?: string }[];
  if (isMaritime && maritime) {
    const classVal = maritime.cabinType ? maritime.cabinType : "Standard";
    columns = [
      { label: "Compagnie", value: maritime.company },
      { label: "Navire", value: maritime.shipName },
      {
        label: "Date départ",
        value: maritime.departureDate ? formatDate(maritime.departureDate) : "",
      },
      {
        label: "Classe",
        value: classVal,
        badge: maritime.cabinType ? maritime.cabinType : undefined,
      },
      {
        label: "Véhicule",
        value: maritime.hasVehicle
          ? (maritime.vehicleType ?? "Véhicule")
          : "Sans véhicule",
      },
    ];
  } else if (segment) {
    if (isMultiPax) {
      columns = [
        { label: "Vol", value: segment.flightNumber },
        { label: "Date", value: formatDate(segment.departureDate) },
        { label: "Classe", value: segment.cabin ?? "Economy" },
        {
          label: "Passagers",
          value: `${passengerCount} adulte${passengerCount! > 1 ? "s" : ""}`,
        },
        {
          label: "Bagages",
          value: segment.baggageAllowance
            ? `${segment.baggageAllowance} / pers.`
            : "—",
        },
      ];
    } else {
      columns = [
        { label: "Compagnie", value: segment.airline },
        { label: "Vol", value: segment.flightNumber },
        { label: "Date", value: formatDate(segment.departureDate) },
        { label: "Classe", value: segment.cabin ?? "Economy" },
        { label: "Bagages", value: segment.baggageAllowance ?? "—" },
      ];
    }
  } else {
    columns = [];
  }

  const fees = isMaritime ? maritime?.feeBreakdown : segment?.feeBreakdown;

  return (
    <View style={s.card} wrap={false}>
      {/* Top: airport codes + times + duration */}
      <View style={s.fTop}>
        <View style={s.ap}>
          <Text style={[s.iata, { color: bc.navy }]}>{depCode}</Text>
          <Text style={s.city}>{depCity}</Text>
          <Text style={[s.time, { color: bc.navy }]}>{depTime}</Text>
        </View>
        <View style={s.mid}>
          {duration && (
            <View style={[s.durPill, { backgroundColor: bc.sky }]}>
              <Text style={[s.durPillText, { color: bc.navy }]}>{duration}</Text>
            </View>
          )}
          <View style={s.rLine}>
            <View style={s.rBar} />
            <IconComponent bc={bc} />
            <View style={s.rBar} />
          </View>
        </View>
        <View style={s.apRight}>
          <Text style={[s.iata, { textAlign: "right", color: bc.navy }]}>{arrCode}</Text>
          <Text style={[s.city, { textAlign: "right" }]}>{arrCity}</Text>
          <Text style={[s.time, { textAlign: "right", color: bc.navy }]}>
            {arrTime ? formatTime(arrTime, nextDay) : ""}
          </Text>
        </View>
      </View>

      {/* Bottom: detail columns */}
      <View style={s.fBot}>
        {columns.map((col, i) => (
          <View key={i} style={i === columns.length - 1 ? s.dcLast : s.dc}>
            <Text style={s.lbl}>{col.label}</Text>
            <Text style={[s.dv, { color: bc.navy }]}>{col.value}</Text>
            {col.badge && (
              <Text style={[s.cabinBadge, { backgroundColor: bc.navy }]}>
                {col.badge}
              </Text>
            )}
          </View>
        ))}
      </View>

      {/* Fee breakdown */}
      {showFees && fees && fees.length > 0 && currency && (
        <FeeBreakdownTable fees={fees} currency={currency} bc={bc} />
      )}
    </View>
  );
}

function FeeBreakdownTable({
  fees,
  currency,
  bc,
}: {
  fees: Fee[];
  currency: string;
  bc: BrandedColors;
}) {
  const subtotal = fees.reduce(
    (sum, f) => sum + f.amount * (f.quantity ?? 1),
    0,
  );

  return (
    <View style={[s.feeSection, { backgroundColor: bc.sky }]}>
      <Text style={s.feeHeader}>Détail des frais</Text>
      {fees.map((fee, i) => {
        const cat = fee.category ?? "other";
        const colors = categoryColors[cat] ?? categoryColors.other;
        return (
          <View key={i} style={s.feeRow}>
            <View style={s.feeLeft}>
              <Text
                style={[
                  s.feeCategoryBadge,
                  { backgroundColor: colors.bg, color: colors.text },
                ]}
              >
                {cat}
              </Text>
              <Text style={[s.feeLabel, { color: bc.navy }]}>
                {fee.quantity && fee.quantity > 1
                  ? `${fee.quantity}× ${fee.label}`
                  : fee.label}
              </Text>
            </View>
            <Text style={[s.feeAmount, { color: bc.navy }]}>
              {formatAmount(fee.amount * (fee.quantity ?? 1), currency)}
            </Text>
          </View>
        );
      })}
      <View style={s.feeSubtotalRow}>
        <Text style={[s.feeSubtotalLabel, { color: bc.navy }]}>Sous-total</Text>
        <Text style={[s.feeSubtotalAmount, { color: bc.navy }]}>
          {formatAmount(subtotal, currency)}
        </Text>
      </View>
    </View>
  );
}

function LayoverBlock({
  prevSegment,
  nextSegment,
  bc,
}: {
  prevSegment: FlightLeg;
  nextSegment: FlightLeg;
  bc: BrandedColors;
}) {
  if (!prevSegment.arrivalTime) return null;

  const prevArrDate = prevSegment.arrivalDate ?? prevSegment.departureDate;
  const dur = formatDuration(
    prevSegment.arrivalTime,
    nextSegment.departureTime,
    prevArrDate,
    nextSegment.departureDate,
  );

  return (
    <View style={[s.layover, { backgroundColor: bc.sky }]} wrap={false}>
      <Svg width={13} height={13} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={10} stroke={c.muted} strokeWidth={2} />
        <Path
          d="M12 6v6l4 2"
          stroke={c.muted}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={[s.layoverText, { color: bc.navy }]}>
        Escale à {prevSegment.arrivalCity} · {prevSegment.arrivalAirport} (
        {prevSegment.arrivalAirport})
      </Text>
      <Text style={s.layoverDur}>Attente : {dur}</Text>
    </View>
  );
}

function MaritimeExtra({ maritime, bc }: { maritime: MaritimeLeg; bc: BrandedColors }) {
  const items: { label: string; value: string }[] = [];
  if (maritime.cabinNumber) {
    items.push({ label: "Numéro de cabine", value: maritime.cabinNumber });
  }
  if (maritime.deckNumber) {
    items.push({ label: "Pont", value: maritime.deckNumber });
  }
  const m = maritime as Record<string, unknown>;
  if (m.meals) {
    items.push({ label: "Repas inclus", value: String(m.meals) });
  }
  if (m.baggageAllowance) {
    items.push({ label: "Bagages", value: String(m.baggageAllowance) });
  }

  if (items.length === 0) return null;

  return (
    <View style={[s.extraCard, { backgroundColor: bc.sky }]} wrap={false}>
      {items.map((item, i) => (
        <View key={i} style={i === items.length - 1 ? s.dcLast : s.dc}>
          <Text style={s.lbl}>{item.label}</Text>
          <Text style={[s.dv, { color: bc.navy }]}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

function SummaryBand({
  data,
  totalDuration,
  bc,
}: {
  data: TicketData;
  totalDuration?: string;
  bc: BrandedColors;
}) {
  const isMaritime = data.type === "MARITIME";
  const isMultiLeg = data.type === "MULTI_LEG";
  const isRoundTripMaritime =
    isMaritime && getMaritimeDirections(data).length === 2;
  const showDuration = isMaritime || isMultiLeg;
  const durationLabel = isRoundTripMaritime
    ? "Durée Totale"
    : isMaritime
      ? "Durée Traversée"
      : "Durée Totale";

  const passengerCount = data.passengers?.length ?? 1;
  const isMultiPax = passengerCount > 1;

  // Compute per-passenger price for multi-passenger tickets
  let perPaxPrice: string | null = null;
  if (isMultiPax && data.price && data.currency) {
    const total = parseFloat(data.price.replace(/\s/g, "").replace(",", "."));
    if (!isNaN(total)) {
      const perPax = Math.round(total / passengerCount);
      const formatted = new Intl.NumberFormat("fr-FR", {
        maximumFractionDigits: 0,
      })
        .format(perPax)
        .replace(/\u202f|\u00a0/g, " ");
      perPaxPrice = `${formatted} ${data.currency}`;
    }
  }

  return (
    <View style={[s.summary, { backgroundColor: bc.navy }]} wrap={false}>
      <View>
        <Text style={s.sLbl}>Référence (PNR)</Text>
        <Text style={s.sValPnr}>{data.bookingReference ?? "—"}</Text>
      </View>
      <View>
        <Text style={s.sLbl}>{"Date d'Émission"}</Text>
        <Text style={s.sVal}>
          {data.issuedDate ? formatDate(data.issuedDate) : "—"}
        </Text>
      </View>
      {showDuration && totalDuration && (
        <View>
          <Text style={s.sLbl}>{durationLabel}</Text>
          <Text style={s.sVal}>{totalDuration}</Text>
        </View>
      )}
      {isMultiPax && perPaxPrice && (
        <View>
          <Text style={s.sLbl}>Prix / Passager</Text>
          <Text style={s.sVal}>{perPaxPrice}</Text>
        </View>
      )}
      <View>
        <Text style={s.sLbl}>
          {isMultiPax ? `Prix Total (×${passengerCount})` : "Prix Total"}
        </Text>
        <Text style={[s.sValPrice, { color: bc.sky }]}>
          {data.price && data.currency
            ? formatPrice(data.price, data.currency)
            : "—"}
        </Text>
      </View>
    </View>
  );
}

function Footer({ agency, bc }: { agency?: AgencyBranding; bc: BrandedColors }) {
  const agencyName = agency?.name ?? "Tikalo";
  const addressLine1 = agency?.addressLine1 ?? "";
  const addressLine2 = agency?.addressLine2 ?? "";
  const phone = agency?.contactPhone ?? "";
  const email = agency?.contactEmail ?? "";
  const website = agency?.contactWebsite ?? "";

  const hasAddress = addressLine1 || addressLine2;
  const addressText = [addressLine1, addressLine2].filter(Boolean).join("\n");

  return (
    <View style={[s.footer, { backgroundColor: bc.sky }]} wrap={false}>
      <View>
        <Text style={[s.fName, { color: bc.navy }]}>{agencyName}</Text>
        {hasAddress && <Text style={s.fAddr}>{addressText}</Text>}
      </View>
      <View style={s.fContacts}>
        {phone ? (
          <View style={s.fContact}>
            <PhoneIcon bc={bc} />
            <Text style={[s.fContactBold, { color: bc.navy }]}>{phone}</Text>
          </View>
        ) : null}
        {email ? (
          <View style={s.fContact}>
            <EmailIcon bc={bc} />
            <Text style={[s.fContactBold, { color: bc.navy }]}>{email}</Text>
          </View>
        ) : null}
        {website ? (
          <View style={s.fContact}>
            <WebIcon bc={bc} />
            <Text style={[s.fContactBold, { color: bc.navy }]}>{website}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Disclaimer({ isMaritime }: { isMaritime: boolean }) {
  const today = formatDate(new Date().toISOString().split("T")[0]);
  const ending = isMaritime
    ? "lors de l'embarquement au port"
    : "lors de l'enregistrement";
  return (
    <Text style={s.disclaimer}>
      Généré le {today} — Confirmation électronique. Veuillez présenter ce
      document {ending}.
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Main template
// ---------------------------------------------------------------------------

// CLASSIC keeps its original rendering logic untouched, but brands off the
// resolved palette like every other template: palette.brand maps to its navy,
// palette.tint to its sky. With the "custom" palette those are exactly the
// agency's primary/secondary colors, preserving historical output.
export function ClassicTemplate({ data, agency, palette }: TemplateProps) {
  const bc = getBrandedColors(palette);

  const isMaritime = data.type === "MARITIME";
  const isMultiLeg = data.type === "MULTI_LEG";
  const flightDirections = getFlightDirections(data);
  const maritimeDirections = getMaritimeDirections(data);
  const showFees = data.showFeeBreakdownInPdf === true;
  const currency = data.currency ?? "";
  const paxCount = data.passengers?.length ?? 1;
  const useSpacer = true;

  // A connection (>1 leg in any direction) or a multi-leg / maritime trip gets a
  // total-duration readout in the summary band.
  const hasConnection = flightDirections.some((d) => d.legs.length > 1);
  let totalDuration: string | undefined;
  if (isMaritime && maritimeDirections.length > 0) {
    totalDuration = computeTripDuration(maritimeDirections);
  } else if (isMultiLeg || hasConnection) {
    totalDuration = computeTripDuration(flightDirections);
  }

  const totalFlightLegs = flightDirections.reduce((n, d) => n + d.legs.length, 0);
  const totalMaritimeLegs = maritimeDirections.reduce((n, d) => n + d.legs.length, 0);
  let flightLegNo = 0;
  let maritimeLegNo = 0;

  return (
    <Document>
      <Page size="A4" style={[s.page, { color: bc.navy }]}>
        {/* 1. Header */}
        <Header
          type={data.type}
          maritimeDirections={isMaritime ? maritimeDirections : undefined}
          agency={agency}
          bc={bc}
        />

        {/* 2. Passenger band */}
        <PassengerBand data={data} bc={bc} />

        {/* 3-6. Body content — iterate directions, then the connecting legs
             within each direction. Layovers only appear BETWEEN legs of the
             same direction; a new direction starts a fresh bound. */}
        {isMaritime
          ? maritimeDirections.map((dir, di) =>
              dir.legs.map((leg, li) => {
                maritimeLegNo += 1;
                return (
                  <React.Fragment key={`${di}-${li}`}>
                    <SectionBadge
                      index={maritimeLegNo}
                      total={totalMaritimeLegs}
                      direction={getLegHeading(maritimeDirections, di, leg)}
                      isMaritime
                      marginTop={maritimeLegNo > 1 ? 10 : undefined}
                      bc={bc}
                    />
                    <FlightCard
                      isMaritime
                      maritime={leg}
                      showFees={showFees}
                      currency={currency}
                      passengerCount={paxCount}
                      bc={bc}
                    />
                    <MaritimeExtra maritime={leg} bc={bc} />
                  </React.Fragment>
                );
              }),
            )
          : flightDirections.map((dir, di) =>
              dir.legs.map((leg, li) => {
                flightLegNo += 1;
                return (
                  <React.Fragment key={`${di}-${li}`}>
                    {li > 0 && (
                      <LayoverBlock
                        prevSegment={dir.legs[li - 1]}
                        nextSegment={leg}
                        bc={bc}
                      />
                    )}
                    <SectionBadge
                      index={flightLegNo}
                      total={totalFlightLegs}
                      direction={getLegHeading(flightDirections, di, leg)}
                      marginTop={flightLegNo > 1 ? (li > 0 ? 16 : 10) : undefined}
                      bc={bc}
                    />
                    <FlightCard
                      segment={leg}
                      showFees={showFees}
                      currency={currency}
                      passengerCount={paxCount}
                      bc={bc}
                    />
                  </React.Fragment>
                );
              }),
            )}

        {/* 7. Page spacer */}
        {useSpacer && <View style={s.spacer} />}

        {/* 8. Summary band */}
        <SummaryBand data={data} totalDuration={totalDuration} bc={bc} />

        {/* 9. Footer */}
        <Footer agency={agency} bc={bc} />

        {/* 10. Disclaimer */}
        <Disclaimer isMaritime={isMaritime} />
      </Page>
    </Document>
  );
}
