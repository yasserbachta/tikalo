import { z } from "zod";

export const ticketTypeEnum = z.enum(["ONE_WAY", "ROUND_TRIP", "MULTI_LEG", "MARITIME"]);
// A "direction" is one bound of travel. Its legs[] are the connecting flights
// within that bound — a connection is NOT a return. OUTBOUND = there, RETURN =
// back, ONWARD = a further bound of a multi-city / open-jaw itinerary.
export const directionKindEnum = z.enum(["OUTBOUND", "RETURN", "ONWARD"]);
export const feeCategoryEnum = z.enum(["port", "security", "fuel", "cabin", "vehicle", "passenger", "tax", "other"]);

// Extraction uses OpenAI strict structured outputs, which emits `null` (never
// undefined) for absent values — so optional fields must be .nullish() here.
export const feeSchema = z.object({
  label: z.string(),
  amount: z.number(),
  quantity: z.number().nullish(),
  category: feeCategoryEnum.nullish(),
});

export type Fee = z.infer<typeof feeSchema>;

export const passengerSchema = z.object({
  name: z.string().min(1),
  ticketNumber: z.string().nullish(),
});

// Titles and GDS passenger-type codes that tickets print around a name
// ("BOUTOUBA / ALLEL MR", "MME SAMIA FEDDAL", "LAIB/THAMEUR (CHD)").
const NAME_NOISE = new Set([
  "MR", "MRS", "MS", "MISS", "MSTR", "MSTER", "MASTER", "DR", "PROF",
  "MME", "MLLE", "MONSIEUR", "MADAME", "MADEMOISELLE",
  "ADT", "CHD", "CNN", "INF", "INS", "YTH", "SRC",
]);

// Tickets print names in GDS form ("LASTNAME / FIRSTNAME TITLE"). Keep the
// printed last-name-first order but drop the "/" separator and the title, so
// "BOUTOUBA / ALLEL MR" → "BOUTOUBA ALLEL". Amadeus glues the title onto the
// first name with no space ("BOUTOUBA/ALLELMR"); that is only unglued right
// after a "/" so a real name ending in those letters is left alone.
// KEEP IN SYNC with the copy in supabase/functions/extract-ticket/index.ts.
export function normalizePassengerName(raw: string): string {
  let name = raw.trim();
  if (!name) return name;
  name = name.replace(/\/\s*([A-Z]+?)(MRS|MSTR|MR)$/, (m, first: string, title: string) =>
    first.length >= 2 ? `/${first} ${title}` : m
  );
  const tokens = name
    .replace(/[/,]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const isNoise = (t: string) =>
    t.toUpperCase() === "M." || NAME_NOISE.has(t.replace(/[.()]/g, "").toUpperCase());
  while (tokens.length > 1 && isNoise(tokens[tokens.length - 1])) tokens.pop();
  while (tokens.length > 1 && isNoise(tokens[0])) tokens.shift();
  return tokens.join(" ");
}

// One flight = one leg. The bound it belongs to (Aller/Retour/…) is expressed by
// the enclosing direction, never by a field on the leg itself.
export const flightLegSchema = z.object({
  flightNumber: z.string().min(1),
  airline: z.string().min(1),
  departureAirport: z.string().min(1),
  departureCity: z.string().min(1),
  arrivalAirport: z.string().min(1),
  arrivalCity: z.string().min(1),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/),
  arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  duration: z.string().nullish(),
  seatNumber: z.string().nullish(),
  cabin: z.string().nullish(),
  baggageAllowance: z.string().nullish(),
  aircraft: z.string().nullish(),
  feeBreakdown: z.array(feeSchema).nullish(),
});

// One maritime crossing = one leg. Same nesting rule as flights.
export const maritimeLegSchema = z.object({
  shipName: z.string().min(1),
  company: z.string().min(1),
  departurePort: z.string().min(1),
  departureCity: z.string().min(1),
  arrivalPort: z.string().min(1),
  arrivalCity: z.string().min(1),
  departureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departureTime: z.string().regex(/^\d{2}:\d{2}$/),
  arrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  arrivalTime: z.string().regex(/^\d{2}:\d{2}$/).nullish(),
  duration: z.string().nullish(),
  cabinType: z.string().nullish(),
  cabinNumber: z.string().nullish(),
  hasVehicle: z.boolean(),
  vehicleType: z.string().nullish(),
  vehiclePlate: z.string().nullish(),
  deckNumber: z.string().nullish(),
  feeBreakdown: z.array(feeSchema).nullish(),
});

export const flightDirectionSchema = z.object({
  kind: directionKindEnum,
  legs: z.array(flightLegSchema).min(1),
});

export const maritimeDirectionSchema = z.object({
  kind: directionKindEnum,
  legs: z.array(maritimeLegSchema).min(1),
});

export type FlightLeg = z.infer<typeof flightLegSchema>;
export type MaritimeLeg = z.infer<typeof maritimeLegSchema>;
export type FlightDirection = z.infer<typeof flightDirectionSchema>;
export type MaritimeDirection = z.infer<typeof maritimeDirectionSchema>;

export const ticketDataSchemaBase = z.object({
  type: ticketTypeEnum,
  passengers: z.array(passengerSchema).min(1),
  bookingReference: z.string().nullish(),
  price: z.string().nullish(),
  currency: z.string().nullish(),
  issuedDate: z.string().nullish(),
  directions: z.array(flightDirectionSchema).nullish(),
  maritimeDirections: z.array(maritimeDirectionSchema).nullish(),
  showFeeBreakdownInPdf: z.boolean().optional().default(false),
});

// `type` is only a display hint. The structure (directions[] + legs[]) is
// authoritative and is validated independently of the type label, so a
// round-trip-with-connections (4 legs / 2 directions) is representable without
// forcing it into a fixed segment count.
export const ticketDataSchema = ticketDataSchemaBase.superRefine((data, ctx) => {
  if (!data.type) return;
  if (data.type === "MARITIME") {
    if (!data.maritimeDirections || data.maritimeDirections.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one maritime direction is required for MARITIME tickets", path: ["maritimeDirections"] });
    }
    if (data.directions && data.directions.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "directions must be empty for MARITIME tickets", path: ["directions"] });
    }
    return;
  }
  if (data.maritimeDirections && data.maritimeDirections.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "maritimeDirections must be empty for non-MARITIME tickets", path: ["maritimeDirections"] });
  }
  if (!data.directions || data.directions.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "At least one direction is required for flight tickets", path: ["directions"] });
    return;
  }
  // Direction counts (not leg counts) map to the type label.
  if (data.type === "ONE_WAY" && data.directions.length !== 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ONE_WAY tickets must have exactly 1 direction", path: ["directions"] });
  }
  if (data.type === "ROUND_TRIP" && data.directions.length !== 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "ROUND_TRIP tickets must have exactly 2 directions", path: ["directions"] });
  }
});

export type TicketData = z.infer<typeof ticketDataSchemaBase>;
export type Passenger = z.infer<typeof passengerSchema>;
export type TicketType = z.infer<typeof ticketTypeEnum>;
export type DirectionKind = z.infer<typeof directionKindEnum>;
export type FeeCategory = z.infer<typeof feeCategoryEnum>;

// ── Shared read helpers ─────────────────────────────────────────────────────
// Consumed by every template + the Excel export so labelling stays consistent.

export function getFlightDirections(data: TicketData): FlightDirection[] {
  return data.directions ?? [];
}

export function getMaritimeDirections(data: TicketData): MaritimeDirection[] {
  return data.maritimeDirections ?? [];
}

// The bound label ("Aller"/"Retour"/"Trajet N") for a direction, derived from
// its kind and the shape of the trip — never from array position. Returns null
// for a one-way trip (a single direction needs no bound badge).
export function getDirectionLabel(
  directions: { kind: DirectionKind }[],
  index: number,
): string | null {
  if (directions.length <= 1) return null;
  const kind = directions[index]?.kind;
  const hasReturn = directions.some((d) => d.kind === "RETURN");
  if (kind === "RETURN") return "Retour";
  if (kind === "OUTBOUND" && hasReturn && directions.length === 2) return "Aller";
  return `Trajet ${index + 1}`;
}

// "Alger → New York" for a bound, using the first leg's origin and the last
// leg's destination (works for both flight and maritime legs).
export function legsCityRoute(
  legs: { departureCity: string; arrivalCity: string }[],
): string {
  if (legs.length === 0) return "";
  return `${legs[0].departureCity} → ${legs[legs.length - 1].arrivalCity}`;
}

export function getDisplayRoute(data: TicketData): string {
  if (data.type === "MARITIME") {
    const dirs = getMaritimeDirections(data);
    if (dirs.length === 0) return "—";
    if (dirs.length === 1) return legsCityRoute(dirs[0].legs);
    if (dirs.length === 2 && dirs.some((d) => d.kind === "RETURN")) {
      const a = dirs[0].legs[0];
      const b = dirs[0].legs[dirs[0].legs.length - 1];
      const back = dirs[1].legs[dirs[1].legs.length - 1];
      if (a.departureCity === back.arrivalCity && b.arrivalCity === dirs[1].legs[0].departureCity) {
        return `${a.departureCity} ⇄ ${b.arrivalCity}`;
      }
    }
    const cities = [dirs[0].legs[0].departureCity];
    for (const d of dirs) cities.push(d.legs[d.legs.length - 1].arrivalCity);
    return cities.join(" → ");
  }

  const dirs = getFlightDirections(data);
  if (dirs.length === 0) return "—";
  const airportsOf = (dir: FlightDirection) => {
    const codes = [dir.legs[0].departureAirport];
    for (const leg of dir.legs) codes.push(leg.arrivalAirport);
    return codes;
  };
  if (dirs.length === 1) return airportsOf(dirs[0]).join(" → ");
  if (dirs.length === 2 && dirs.some((d) => d.kind === "RETURN")) {
    const out = airportsOf(dirs[0]);
    return `${out[0]} ⇄ ${out[out.length - 1]}`;
  }
  const all = [dirs[0].legs[0].departureAirport];
  for (const d of dirs) for (const leg of d.legs) all.push(leg.arrivalAirport);
  return all.join(" → ");
}

export function getDisplayInfo(data: TicketData): { passengerName: string | null; routeSummary: string | null; departureDate: string | null; type: string | null } {
  const passengerName = data.passengers?.[0]?.name ?? null;
  const routeSummary = getDisplayRoute(data);
  const type = data.type ?? null;
  let departureDate: string | null = null;
  if (data.type === "MARITIME") {
    departureDate = getMaritimeDirections(data)[0]?.legs[0]?.departureDate ?? null;
  } else {
    departureDate = getFlightDirections(data)[0]?.legs[0]?.departureDate ?? null;
  }
  return { passengerName, routeSummary, departureDate, type };
}

// ── Backward compatibility ──────────────────────────────────────────────────
// Tickets already in the database (JSONB) use the OLD flat `segments[]` /
// `maritimeJourneys[]` shape (or an even older single-flight shape). These
// helpers adapt any stored shape into the current nested `directions[]` model
// on read. There is no DB migration — the adapter runs at every read boundary.

type LegacySegment = {
  segmentType?: "OUTBOUND" | "RETURN" | "CONNECTING";
  [k: string]: unknown;
};

function stripSegmentType(seg: LegacySegment): FlightLeg {
  const { segmentType: _omit, ...rest } = seg;
  void _omit;
  return rest as unknown as FlightLeg;
}

// Group a flat legacy segment list into directions: OUTBOUND/RETURN start a new
// bound, CONNECTING extends the current one.
function segmentsToDirections(segments: LegacySegment[]): FlightDirection[] {
  const dirs: FlightDirection[] = [];
  for (const seg of segments) {
    const kind = seg.segmentType === "RETURN" ? "RETURN" : "OUTBOUND";
    if (seg.segmentType === "CONNECTING" && dirs.length > 0) {
      dirs[dirs.length - 1].legs.push(stripSegmentType(seg));
    } else {
      dirs.push({ kind, legs: [stripSegmentType(seg)] });
    }
  }
  return dirs;
}

function journeysToMaritimeDirections(journeys: MaritimeLeg[]): MaritimeDirection[] {
  return journeys.map((leg, i) => {
    let kind: DirectionKind = "OUTBOUND";
    if (i === 1) {
      const first = journeys[0];
      const reverses = leg.departureCity === first.arrivalCity && leg.arrivalCity === first.departureCity;
      kind = reverses ? "RETURN" : "ONWARD";
    } else if (i > 1) {
      kind = "ONWARD";
    }
    return { kind, legs: [leg] };
  });
}

export function migrateLegacyData(raw: unknown): TicketData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = { ...(raw as Record<string, unknown>) };

  // Rows extracted before names were normalized still carry "LAST / FIRST MR".
  if (Array.isArray(obj.passengers)) {
    obj.passengers = obj.passengers.map((p) =>
      p && typeof p === "object" && typeof (p as Passenger).name === "string"
        ? { ...p, name: normalizePassengerName((p as Passenger).name) }
        : p
    );
  }

  // Fold a legacy single `maritime` object into the journey array first.
  if (obj.maritime && !obj.maritimeJourneys) {
    obj.maritimeJourneys = [obj.maritime];
  }
  delete obj.maritime;

  // Already in the nested shape → strip any stray legacy keys and return.
  if (obj.directions || obj.maritimeDirections) {
    delete obj.segments;
    delete obj.maritimeJourneys;
    return obj as unknown as TicketData;
  }

  // Old flat maritime journeys → maritimeDirections.
  if (Array.isArray(obj.maritimeJourneys) && obj.maritimeJourneys.length > 0) {
    obj.maritimeDirections = journeysToMaritimeDirections(obj.maritimeJourneys as MaritimeLeg[]);
  }
  // Old flat flight segments → directions.
  if (Array.isArray(obj.segments) && obj.segments.length > 0) {
    obj.directions = segmentsToDirections(obj.segments as LegacySegment[]);
  }
  delete obj.segments;
  delete obj.maritimeJourneys;

  return obj as unknown as TicketData;
}

export function migrateTicketData(raw: unknown): TicketData | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.type && obj.passengers) return migrateLegacyData(obj);
  if (obj.passengerName && !obj.type) {
    // Oldest flat shape: a single set of flight fields at the top level. Typed
    // as optional strings so each read is `string | undefined`, not `any`.
    const legacy = obj as {
      passengerName?: string;
      ticketNumber?: string;
      bookingReference?: string;
      price?: string;
      currency?: string;
      flightNumber?: string;
      airline?: string;
      departureAirport?: string;
      departureCity?: string;
      arrivalAirport?: string;
      arrivalCity?: string;
      departureDate?: string;
      departureTime?: string;
      arrivalDate?: string;
      arrivalTime?: string;
      seatNumber?: string;
      cabin?: string;
      baggageAllowance?: string;
    };
    return {
      type: "ONE_WAY",
      passengers: [{ name: normalizePassengerName(legacy.passengerName ?? ""), ticketNumber: legacy.ticketNumber ?? null }],
      bookingReference: legacy.bookingReference ?? null,
      price: legacy.price ?? null,
      currency: legacy.currency ?? null,
      issuedDate: null,
      directions: [
        {
          kind: "OUTBOUND",
          legs: [
            {
              flightNumber: legacy.flightNumber ?? "",
              airline: legacy.airline ?? "",
              departureAirport: legacy.departureAirport ?? "",
              departureCity: legacy.departureCity ?? "",
              arrivalAirport: legacy.arrivalAirport ?? "",
              arrivalCity: legacy.arrivalCity ?? "",
              departureDate: legacy.departureDate ?? "",
              departureTime: legacy.departureTime ?? "",
              arrivalDate: legacy.arrivalDate ?? null,
              arrivalTime: legacy.arrivalTime ?? null,
              seatNumber: legacy.seatNumber ?? null,
              cabin: legacy.cabin ?? null,
              baggageAllowance: legacy.baggageAllowance ?? null,
              aircraft: null,
            },
          ],
        },
      ],
      maritimeDirections: undefined,
      showFeeBreakdownInPdf: false,
    } as TicketData;
  }
  return null;
}
