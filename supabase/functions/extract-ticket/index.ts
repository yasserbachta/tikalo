import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai";
import { z } from "npm:zod";
import { getDocumentProxy } from "npm:unpdf@1.6.2";

// ---------------------------------------------------------------------------
// Zod schema (inlined from lib/tickets/schema.ts — keep in sync!)
// ---------------------------------------------------------------------------

const ticketTypeEnum = z.enum(["ONE_WAY", "ROUND_TRIP", "MULTI_LEG", "MARITIME"]);
// A "direction" is one bound of travel; its legs[] are the connecting flights
// within that bound. A connection is NOT a return.
const directionKindEnum = z.enum(["OUTBOUND", "RETURN", "ONWARD"]);
const feeCategoryEnum = z.enum(["port", "security", "fuel", "cabin", "vehicle", "passenger", "tax", "other"]);

const passengerSchema = z.object({
  name: z.string().min(1),
  ticketNumber: z.string().nullish(),
});

// Structured outputs (strict mode) returns `null` for absent values, so every
// field that the JSON schema marks nullable must be .nullish() here — .optional()
// rejects null and forces a pointless re-extraction on a bigger model.
const feeSchema = z.object({
  label: z.string(),
  amount: z.number(),
  quantity: z.number().nullish(),
  category: feeCategoryEnum.nullish(),
});

const flightLegSchema = z.object({
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

const maritimeLegSchema = z.object({
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

const flightDirectionSchema = z.object({
  kind: directionKindEnum,
  legs: z.array(flightLegSchema).min(1),
});

const maritimeDirectionSchema = z.object({
  kind: directionKindEnum,
  legs: z.array(maritimeLegSchema).min(1),
});

const ticketDataSchema = z.object({
  type: ticketTypeEnum,
  passengers: z.array(passengerSchema).min(1),
  bookingReference: z.string().nullish(),
  price: z.string().nullish(),
  currency: z.string().nullish(),
  issuedDate: z.string().nullish(),
  directions: z.array(flightDirectionSchema).nullish(),
  maritimeDirections: z.array(maritimeDirectionSchema).nullish(),
  showFeeBreakdownInPdf: z.boolean().nullish().transform((v) => v ?? false),
}).superRefine((data, ctx) => {
  if (!data.type) return;
  if (data.type === "MARITIME") {
    if (!data.maritimeDirections || data.maritimeDirections.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one maritime direction is required for MARITIME tickets",
        path: ["maritimeDirections"],
      });
    }
  } else {
    if (!data.directions || data.directions.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one direction is required for flight tickets",
        path: ["directions"],
      });
    }
  }
});

type TicketData = z.infer<typeof ticketDataSchema>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// gpt-4.1 / gpt-4.1-mini shut down 2027-01-14. Benchmarked Oct 2026 on real
// tickets: gpt-6-luna (reasoning off, priority tier) matches 4.1-mini's speed
// (~2.3s p50 text mode) at lower cost, and reads struck-through prices and
// route direction more reliably. gpt-5.6-luna is a different model family, so
// it's the independent backup for hedging and the last-resort retry.
// Each is overridable via an edge-function secret for no-deploy rollback.
const MODEL_PRIMARY = Deno.env.get("EXTRACT_MODEL_PRIMARY") ?? "gpt-6-luna";
const MODEL_BACKUP = Deno.env.get("EXTRACT_MODEL_BACKUP") ?? "gpt-5.6-luna";
// "priority" roughly halves luna latency (4.1s → 2.3s p50) at 2× token price.
// Set EXTRACT_SERVICE_TIER=default to turn it off.
const SERVICE_TIER = Deno.env.get("EXTRACT_SERVICE_TIER") ?? "priority";

// If the primary call hasn't returned by this point, start the backup call in
// parallel and take whichever validates first (~2× the measured p90).
const HEDGE_AFTER_MS: Record<InputMode, number> = { text: 6000, "pdf+images": 10000 };

const SYSTEM_PROMPT = `You are a travel document data extractor. You receive a travel ticket (flight or maritime/ferry), possibly several pages. Extract all information and return ONLY valid JSON — no markdown, no explanation, no backticks.

KEY CONCEPT — separate DIRECTIONS from CONNECTING LEGS. These are two different things:
- A DIRECTION (bound) is a whole leg of the journey: "there" (OUTBOUND), "back" (RETURN), or a further hop of a multi-city trip (ONWARD).
- A LEG is a single flight. One direction can contain SEVERAL connecting flights (a change of plane at a hub). Those connecting flights are all part of the SAME direction — a connection is NOT the return.

The trip is a list of "directions", and each direction has a list of "legs" (flights, in order).

Example: Alger → New York round-trip, with a change of plane in Paris each way. This is 4 flights in 2 directions:
- OUTBOUND: Alger→Paris, then Paris→New York   (2 legs — the Paris→New York flight is still going TO New York, so it is OUTBOUND, not RETURN)
- RETURN:   New York→Paris, then Paris→Alger    (2 legs)

Determine the ticket type (a display hint — the directions[]/legs[] structure is what matters):
- "ONE_WAY": one direction only
- "ROUND_TRIP": two directions — you go somewhere and come back (the RETURN ends where the OUTBOUND started). Each direction may have 1 leg (direct) or several legs (connections)
- "MULTI_LEG": an open-jaw / multi-city itinerary — three or more directions, or directions that do not simply mirror each other
- "MARITIME": ferry or boat ticket between ports (no flight number, has ship name). Transport mode ALWAYS wins over trip shape: a ferry ticket is MARITIME even when it is a round trip ("Aller" / "Aller-retour") — never ONE_WAY, ROUND_TRIP or MULTI_LEG for a boat. A round-trip ferry = "MARITIME" with two maritimeDirections (OUTBOUND then RETURN)

IMPORTANT: Scan the ENTIRE document (all pages, all sections) for every flight before deciding. Tickets group flights under headings like "Alger → New York" and "New York → Alger": each such heading is ONE direction, and every flight listed under it is a leg of that direction. Assign each leg to a direction by its own departure/arrival airports and its date/time order — never by counting.

Then extract the data in this exact JSON structure:

{
  "type": "ONE_WAY" | "ROUND_TRIP" | "MULTI_LEG" | "MARITIME",
  "passengers": [
    { "name": "LASTNAME FIRSTNAME", "ticketNumber": "057-1234567890" }
  ],
  "bookingReference": "PNR or booking ref if visible",
  "price": "149724",
  "currency": "DZD",
  "issuedDate": "2025-04-01",
  "directions": [
    {
      "kind": "OUTBOUND",
      "legs": [
        {
          "flightNumber": "AF1055",
          "airline": "Air France",
          "departureAirport": "ALG",
          "departureCity": "Algiers",
          "arrivalAirport": "CDG",
          "arrivalCity": "Paris",
          "departureDate": "2026-07-08",
          "departureTime": "06:30",
          "arrivalDate": "2026-07-08",
          "arrivalTime": "10:10",
          "duration": "03:40",
          "seatNumber": "14A",
          "cabin": "L",
          "baggageAllowance": "1PC",
          "aircraft": "A320",
          "feeBreakdown": null
        },
        {
          "flightNumber": "AF3628",
          "airline": "Air France",
          "departureAirport": "CDG",
          "departureCity": "Paris",
          "arrivalAirport": "JFK",
          "arrivalCity": "New York",
          "departureDate": "2026-07-08",
          "departureTime": "11:30",
          "arrivalDate": "2026-07-08",
          "arrivalTime": "13:49",
          "duration": "02:19",
          "seatNumber": null,
          "cabin": "Q",
          "baggageAllowance": "1PC",
          "aircraft": null,
          "feeBreakdown": null
        }
      ]
    },
    {
      "kind": "RETURN",
      "legs": [
        {
          "flightNumber": "AF1",
          "airline": "Air France",
          "departureAirport": "JFK",
          "departureCity": "New York",
          "arrivalAirport": "CDG",
          "arrivalCity": "Paris",
          "departureDate": "2026-07-16",
          "departureTime": "16:30",
          "arrivalDate": "2026-07-17",
          "arrivalTime": "05:55",
          "duration": "13:25",
          "seatNumber": null,
          "cabin": "Q",
          "baggageAllowance": "1PC",
          "aircraft": null,
          "feeBreakdown": null
        },
        {
          "flightNumber": "AF1654",
          "airline": "Air France",
          "departureAirport": "CDG",
          "departureCity": "Paris",
          "arrivalAirport": "ALG",
          "arrivalCity": "Algiers",
          "departureDate": "2026-07-17",
          "departureTime": "09:30",
          "arrivalDate": "2026-07-17",
          "arrivalTime": "10:55",
          "duration": "01:25",
          "seatNumber": null,
          "cabin": "L",
          "baggageAllowance": "1PC",
          "aircraft": null,
          "feeBreakdown": null
        }
      ]
    }
  ],
  "maritimeDirections": [
    {
      "kind": "OUTBOUND",
      "legs": [
        {
          "shipName": "Tariq Ibn Ziyad",
          "company": "Algérie Ferries",
          "departurePort": "Algiers Port",
          "departureCity": "Algiers",
          "arrivalPort": "Marseille Port",
          "arrivalCity": "Marseille",
          "departureDate": "2025-06-01",
          "departureTime": "18:00",
          "arrivalDate": "2025-06-02",
          "arrivalTime": "08:00",
          "duration": "14:00",
          "cabinType": "Cabine 4 lits",
          "cabinNumber": "B-42",
          "hasVehicle": true,
          "vehicleType": "Voiture",
          "vehiclePlate": "00123-114-16",
          "deckNumber": "3",
          "feeBreakdown": [
            { "label": "Adult Passenger", "amount": 2100, "quantity": 1, "category": "passenger" },
            { "label": "Vehicle", "amount": 2100, "quantity": 1, "category": "vehicle" }
          ]
        }
      ]
    }
  ],
  "showFeeBreakdownInPdf": false
}

Rules:
- For flight tickets: fill "directions", set "maritimeDirections" to null (or omit). For maritime tickets: fill "maritimeDirections", set "directions" to null (or omit).
- Any ferry/boat ticket is type "MARITIME", even a round trip. Ferry companies label bounds like airlines do ("Voyage aller", "Aller-retour"): each bound is one maritime direction (kind OUTBOUND or RETURN), never a reason to use ROUND_TRIP.
- Each direction's "kind" is OUTBOUND (going there), RETURN (coming back — ends at the OUTBOUND's origin), or ONWARD (a further hop of a multi-city trip). List directions in chronological (travel) order, and legs within a direction in departure order.
- Put ALL connecting flights of the same bound in the SAME direction's "legs". Do NOT mark a connecting flight as RETURN — it is only RETURN if it actually travels back toward the origin.
- ONE_WAY = 1 direction, ROUND_TRIP = 2 directions (OUTBOUND then RETURN), MULTI_LEG = 3+ directions or an open-jaw itinerary. The NUMBER OF LEGS in a direction is independent of the type.
- "passengers" is always an array, even for a single passenger
- Passenger "name": last name first, then first name(s), exactly as spelled on the ticket, separated by single spaces. Drop the "/" that tickets print between last and first name, and drop titles and passenger-type codes (MR, MRS, MS, MISS, MSTR, DR, M., MME, MLLE, ADT, CHD, INF). Example: printed "BOUTOUBA / ALLEL MR" → "BOUTOUBA ALLEL". Keep compound names whole and in printed order ("EL MEDDAH / RAYANE" → "EL MEDDAH RAYANE", "MERABET / SID AHMED" → "MERABET SID AHMED") — never reorder words
- One entry per passenger: an infant or child listed with an adult is a separate passenger, never merged into the adult's name
- Use IATA airport codes (3 letters) for airports
- Dates in YYYY-MM-DD format, times in HH:mm format
- "departureTime"/"arrivalTime" are the times printed on the departure and arrival rows respectively; "duration" (labelled "Duration"/"Durée") is the flight length — NEVER copy the duration into a departure or arrival time
- Ferry tickets often print a check-in time ("Heure d'enregistrement", "Check-in") separately: it is NOT the departure time. Use the time labelled "Heure de départ" / "Départ"
- Ferry tickets often do not print a ship name: if none is printed, set "shipName" to "" — never use a passenger name, the company name, or anything else in its place
- "vehiclePlate" is only the registration plate (e.g. "WW-226-HG"); never append fare amounts or other numbers printed next to it
- Extract "duration" directly from the ticket if displayed (format: HH:mm, e.g. "03:40" for 3h40m). If not visible, set it to null — do not calculate it
- If the ticket shows a fee breakdown, fill "feeBreakdown" on each leg. If only a total price is shown, set "feeBreakdown" to null
- Categorize each fee using your best guess: port-related → "port", security-related → "security", fuel → "fuel", cabin → "cabin", vehicle base fare → "vehicle", passenger base fare → "passenger", taxes → "tax", anything else → "other"
- "price": the ACTUAL printed grand total the customer paid — look for a "Montant total", "Total payé", "Totale", "Total", "Prix total" or "Total amount" line, which may be on a later page (e.g. a payment / "informations de paiement" section). Copy that number verbatim (digits only, no spaces or currency). A crossed-out pre-discount amount printed above the total is NOT the price. NEVER add up the legs or fares yourself, and never estimate. If no explicit total is printed anywhere, set "price" to null.
- "showFeeBreakdownInPdf" should always be false (user toggles it manually)
- If a field is not visible on the ticket, set it to null — do not guess
- The JSON above is a FORMAT example only — NEVER copy its values (names, plates, prices, times) into your output. Every value must be read from the document itself; if you cannot read a value, set it to null
- Photographed/scanned tickets may be attached as additional high-resolution images after the PDF: they are the SAME document, just more legible — read field values from those images
- The document may instead be provided as plain extracted text with "--- Page N ---" markers rather than an attached file. It is still the full ticket; all the same rules apply
- Return ONLY the JSON object, nothing else`;

// ---------------------------------------------------------------------------
// JSON Schema for OpenAI structured outputs (strict mode).
// Mirrors ticketDataSchema above — KEEP IN SYNC. Strict mode requires every
// property to be listed in `required` and `additionalProperties: false`;
// optional/nullish Zod fields are expressed here as nullable types. The
// conditional rule (MARITIME needs maritimeDirections, flights need directions)
// cannot be expressed in strict JSON Schema, so it stays as a post-parse Zod
// check in extractTicketData.
// ---------------------------------------------------------------------------

const feeJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    amount: { type: "number" },
    quantity: { type: ["number", "null"] },
    category: {
      type: ["string", "null"],
      enum: ["port", "security", "fuel", "cabin", "vehicle", "passenger", "tax", "other", null],
    },
  },
  required: ["label", "amount", "quantity", "category"],
};

const flightLegJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    flightNumber: { type: "string" },
    airline: { type: "string" },
    departureAirport: { type: "string" },
    departureCity: { type: "string" },
    arrivalAirport: { type: "string" },
    arrivalCity: { type: "string" },
    departureDate: { type: "string" },
    departureTime: { type: "string" },
    arrivalDate: { type: ["string", "null"] },
    arrivalTime: { type: ["string", "null"] },
    duration: { type: ["string", "null"] },
    seatNumber: { type: ["string", "null"] },
    cabin: { type: ["string", "null"] },
    baggageAllowance: { type: ["string", "null"] },
    aircraft: { type: ["string", "null"] },
    feeBreakdown: { type: ["array", "null"], items: feeJsonSchema },
  },
  required: [
    "flightNumber", "airline", "departureAirport", "departureCity",
    "arrivalAirport", "arrivalCity", "departureDate", "departureTime", "arrivalDate",
    "arrivalTime", "duration", "seatNumber", "cabin", "baggageAllowance", "aircraft",
    "feeBreakdown",
  ],
};

const maritimeLegJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    shipName: { type: "string" },
    company: { type: "string" },
    departurePort: { type: "string" },
    departureCity: { type: "string" },
    arrivalPort: { type: "string" },
    arrivalCity: { type: "string" },
    departureDate: { type: "string" },
    departureTime: { type: "string" },
    arrivalDate: { type: ["string", "null"] },
    arrivalTime: { type: ["string", "null"] },
    duration: { type: ["string", "null"] },
    cabinType: { type: ["string", "null"] },
    cabinNumber: { type: ["string", "null"] },
    hasVehicle: { type: "boolean" },
    vehicleType: { type: ["string", "null"] },
    vehiclePlate: { type: ["string", "null"] },
    deckNumber: { type: ["string", "null"] },
    feeBreakdown: { type: ["array", "null"], items: feeJsonSchema },
  },
  required: [
    "shipName", "company", "departurePort", "departureCity", "arrivalPort",
    "arrivalCity", "departureDate", "departureTime", "arrivalDate", "arrivalTime",
    "duration", "cabinType", "cabinNumber", "hasVehicle", "vehicleType",
    "vehiclePlate", "deckNumber", "feeBreakdown",
  ],
};

const flightDirectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["OUTBOUND", "RETURN", "ONWARD"] },
    legs: { type: "array", items: flightLegJsonSchema },
  },
  required: ["kind", "legs"],
};

const maritimeDirectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["OUTBOUND", "RETURN", "ONWARD"] },
    legs: { type: "array", items: maritimeLegJsonSchema },
  },
  required: ["kind", "legs"],
};

const TICKET_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: ["ONE_WAY", "ROUND_TRIP", "MULTI_LEG", "MARITIME"] },
    passengers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          ticketNumber: { type: ["string", "null"] },
        },
        required: ["name", "ticketNumber"],
      },
    },
    bookingReference: { type: ["string", "null"] },
    price: { type: ["string", "null"] },
    currency: { type: ["string", "null"] },
    issuedDate: { type: ["string", "null"] },
    directions: { type: ["array", "null"], items: flightDirectionJsonSchema },
    maritimeDirections: { type: ["array", "null"], items: maritimeDirectionJsonSchema },
    showFeeBreakdownInPdf: { type: "boolean" },
  },
  required: [
    "type", "passengers", "bookingReference", "price", "currency", "issuedDate",
    "directions", "maritimeDirections", "showFeeBreakdownInPdf",
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Titles and GDS passenger-type codes that tickets print around a name
// ("BOUTOUBA / ALLEL MR", "MME SAMIA FEDDAL", "LAIB/THAMEUR (CHD)").
const NAME_NOISE = new Set([
  "MR", "MRS", "MS", "MISS", "MSTR", "MSTER", "MASTER", "DR", "PROF",
  "MME", "MLLE", "MONSIEUR", "MADAME", "MADEMOISELLE",
  "ADT", "CHD", "CNN", "INF", "INS", "YTH", "SRC",
]);

// Inlined from lib/tickets/schema.ts — keep in sync! Tickets print names in
// GDS form ("LASTNAME / FIRSTNAME TITLE"); the prompt asks for
// "LASTNAME FIRSTNAME" but the model often copies the printed form verbatim.
function normalizePassengerName(raw: string): string {
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

// Normalizes cosmetic deviations in the model output before Zod validation so
// they don't trigger a full re-extraction on a bigger model: pads times to
// HH:mm, fixes date separators/padding, converts "" to null on nullable
// strings, and nulls out optional date/time fields that are still malformed.
function normalizeExtraction(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const data = json as Record<string, unknown>;

  const normTime = (v: unknown): unknown => {
    if (typeof v !== "string") return v;
    const m = v.trim().match(/^(\d{1,2})[:hH](\d{2})(?::\d{2})?$/);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : v;
  };
  const normDate = (v: unknown): unknown => {
    if (typeof v !== "string") return v;
    const t = v.trim().replace(/\//g, "-");
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = t.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return v;
  };
  const emptyToNull = (obj: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      if (typeof obj[key] === "string" && (obj[key] as string).trim() === "") obj[key] = null;
    }
  };
  const normalizeLeg = (leg: Record<string, unknown>, nullableStrings: string[]) => {
    leg.departureDate = normDate(leg.departureDate);
    leg.departureTime = normTime(leg.departureTime);
    leg.arrivalDate = normDate(leg.arrivalDate);
    if (typeof leg.arrivalDate === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(leg.arrivalDate)) {
      leg.arrivalDate = null;
    }
    leg.arrivalTime = normTime(leg.arrivalTime);
    if (typeof leg.arrivalTime === "string" && !/^\d{2}:\d{2}$/.test(leg.arrivalTime)) {
      leg.arrivalTime = null;
    }
    leg.duration = normTime(leg.duration);
    emptyToNull(leg, nullableStrings);
  };

  emptyToNull(data, ["bookingReference", "price", "currency", "issuedDate"]);
  if (Array.isArray(data.passengers)) {
    for (const p of data.passengers) {
      if (p && typeof p === "object" && typeof (p as Record<string, unknown>).name === "string") {
        const pax = p as Record<string, unknown>;
        pax.name = normalizePassengerName(pax.name as string);
      }
    }
  }
  data.issuedDate = normDate(data.issuedDate);

  const normalizeDirections = (directions: unknown, nullableStrings: string[]) => {
    if (!Array.isArray(directions)) return;
    for (const dir of directions) {
      if (!dir || typeof dir !== "object") continue;
      const legs = (dir as Record<string, unknown>).legs;
      if (!Array.isArray(legs)) continue;
      for (const leg of legs) {
        if (leg && typeof leg === "object") {
          normalizeLeg(leg as Record<string, unknown>, nullableStrings);
        }
      }
    }
  };

  normalizeDirections(data.directions, ["duration", "seatNumber", "cabin", "baggageAllowance", "aircraft"]);
  normalizeDirections(data.maritimeDirections, ["duration", "cabinType", "cabinNumber", "vehicleType", "vehiclePlate", "deckNumber"]);

  // Required display strings the ticket often simply doesn't print (most ferry
  // tickets have no ship name; some only print the port, not the city). An
  // empty value here used to fail min(1) and force a full re-extraction on a
  // bigger model — fill it from a sibling field instead.
  const blank = (v: unknown) => typeof v !== "string" || v.trim() === "";
  const fillFrom = (leg: Record<string, unknown>, key: string, ...sources: unknown[]) => {
    if (!blank(leg[key])) return;
    const src = sources.find((s) => !blank(s));
    leg[key] = typeof src === "string" ? src.trim() : "—";
  };
  const eachLeg = (directions: unknown, fn: (leg: Record<string, unknown>) => void) => {
    if (!Array.isArray(directions)) return;
    for (const dir of directions) {
      const legs = (dir as Record<string, unknown> | null)?.legs;
      if (Array.isArray(legs)) legs.forEach((leg) => leg && typeof leg === "object" && fn(leg as Record<string, unknown>));
    }
  };
  eachLeg(data.maritimeDirections, (leg) => {
    fillFrom(leg, "company", leg.shipName);
    fillFrom(leg, "shipName", leg.company);
    fillFrom(leg, "departureCity", leg.departurePort);
    fillFrom(leg, "departurePort", leg.departureCity);
    fillFrom(leg, "arrivalCity", leg.arrivalPort);
    fillFrom(leg, "arrivalPort", leg.arrivalCity);
  });
  eachLeg(data.directions, (leg) => {
    const carrier = typeof leg.flightNumber === "string" ? leg.flightNumber.match(/^\s*([A-Z0-9]{2})/i)?.[1] : undefined;
    fillFrom(leg, "airline", carrier);
    fillFrom(leg, "departureCity", leg.departureAirport);
    fillFrom(leg, "arrivalCity", leg.arrivalAirport);
  });

  // The model sometimes labels a round-trip ferry ROUND_TRIP (or a flight
  // MARITIME): the arrays reveal the real transport mode, so coerce the type
  // instead of failing validation and re-extracting on the full model.
  const hasFlights = Array.isArray(data.directions) && data.directions.length > 0;
  const hasMaritime = Array.isArray(data.maritimeDirections) && data.maritimeDirections.length > 0;
  if (hasMaritime && !hasFlights && data.type !== "MARITIME") {
    data.type = "MARITIME";
  } else if (hasFlights && !hasMaritime && data.type === "MARITIME") {
    const count = (data.directions as unknown[]).length;
    data.type = count === 1 ? "ONE_WAY" : count === 2 ? "ROUND_TRIP" : "MULTI_LEG";
  }
  return data;
}

// GNV prints a truncated plate immediately followed by the vehicle fare
// ("... POLO - DA 381 U 72600.00"), and the model sometimes glues the start of
// the fare onto the plate ("DA 381 U 726"). Using the text layer, trim a
// numeric tail that is really the beginning of a money amount: it must start
// a new whitespace-separated token in the text, so a plate like
// "00123-114-16 7000.00" is left intact.
function trimFareFromPlate(plate: string, documentText: string): string {
  const compact = plate.replace(/\s+/g, "");
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (let cut = compact.length - 1; cut >= 1; cut--) {
    const head = compact.slice(0, compact.length - cut);
    const tail = compact.slice(-cut);
    if (!/^\d+(?:[.,]\d*)?$/.test(tail) || !/[A-Za-z0-9]/.test(head)) continue;
    const headRe = head.split("").map(esc).join("\\s*");
    const tokenRe = new RegExp(`${headRe}\\s+(\\d[\\d.,]*)`, "g");
    const isFare = [...documentText.matchAll(tokenRe)].some(
      (m) => m[1].startsWith(tail) && /^\d+[.,]\d{2}$/.test(m[1])
    );
    if (!isFare) continue;
    // Drop `cut` non-space chars from the end, keeping the plate's own spacing.
    let i = plate.length;
    for (let removed = 0; i > 0 && removed < cut; ) if (!/\s/.test(plate[--i])) removed++;
    return plate.slice(0, i).trimEnd();
  }
  return plate;
}

function cleanVehiclePlates(data: TicketData, documentText: string): void {
  if (!documentText) return;
  for (const dir of data.maritimeDirections ?? []) {
    for (const leg of dir.legs) {
      if (leg.vehiclePlate) leg.vehiclePlate = trimFareFromPlate(leg.vehiclePlate, documentText);
    }
  }
}

// Photographed tickets arrive as image-only PDFs, and the PDF pipeline's
// built-in page rendering is too low-res to read their fine print (the model
// then hallucinates the small fields). Pull the page-sized embedded JPEGs out
// of the raw PDF bytes so they can be attached as high-detail images. Pure
// byte-scan: finds /Subtype /Image XObjects with /Filter /DCTDecode, whose
// stream body is a complete JPEG. Small images (logos, QR codes) are skipped.
function extractEmbeddedJpegs(pdfBytes: Uint8Array, maxImages = 8): Uint8Array[] {
  // Latin-1 decoding is byte-preserving in length, so indexOf positions in the
  // string are byte offsets into pdfBytes.
  const text = new TextDecoder("latin1").decode(pdfBytes);
  const jpegs: Uint8Array[] = [];

  let from = 0;
  while (jpegs.length < maxImages) {
    const streamIdx = text.indexOf("stream", from);
    if (streamIdx === -1) break;
    from = streamIdx + 6;

    const dictStart = text.lastIndexOf("<<", streamIdx);
    if (dictStart === -1) continue;
    const dict = text.slice(dictStart, streamIdx);
    if (!/\/Subtype\s*\/Image/.test(dict) || !/\/DCTDecode/.test(dict)) continue;

    const width = Number(dict.match(/\/Width\s+(\d+)/)?.[1] ?? 0);
    const height = Number(dict.match(/\/Height\s+(\d+)/)?.[1] ?? 0);
    if (width < 500 || height < 500) continue; // logo / QR code, not a page scan

    let dataStart = streamIdx + 6;
    if (text[dataStart] === "\r") dataStart++;
    if (text[dataStart] === "\n") dataStart++;

    const lengthMatch = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/);
    let dataEnd: number;
    if (lengthMatch) {
      dataEnd = dataStart + Number(lengthMatch[1]);
    } else {
      dataEnd = text.indexOf("endstream", dataStart);
      if (dataEnd === -1) continue;
    }

    const bytes = pdfBytes.slice(dataStart, dataEnd);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) jpegs.push(bytes); // JPEG SOI
  }
  return jpegs;
}

// How the document is presented to the model. OpenAI's PDF file input renders
// EVERY page as an image before the model reads it, so a born-digital ticket
// pays a large vision-prefill cost for nothing:
//   "text"       — text-layer PDF: send the extracted text only, no vision
//                  (~5.5s vs ~9-13s measured on the same ticket)
//   "pdf+images" — scanned or mixed PDFs: PDF file + high-detail embedded
//                  JPEGs, unchanged
// An images-only mode (JPEGs without the PDF) was tried and rejected: on the
// Balearia scan the model consistently dropped the RETURN direction, and a
// 1-direction MARITIME ticket is schema-valid, so the retry net can't catch
// that miss. Scans keep the redundant-looking PDF part on purpose.
type InputMode = "text" | "pdf+images";

// Below this many non-whitespace characters a page's text layer is likely
// just a header/footer on top of a scan, not the real document content.
const MIN_TEXT_CHARS_PER_PAGE = 150;

// Extracts the PDF's text layer per page (worker-less pdfjs via unpdf, same
// approach as lib/tickets/overlay-price.ts). Returns null when the PDF can't
// be parsed — the caller then falls back to sending the PDF file itself.
type TextLayerItem = {
  str?: unknown;
  hasEOL?: boolean;
  transform?: unknown;
  height?: unknown;
};

// Flat fallback: content-stream order joined by hasEOL. Used when an item lacks
// positional data (transform) so row reconstruction can't run.
function flattenItems(items: TextLayerItem[]): string {
  let text = "";
  for (const item of items) {
    if (typeof item.str === "string") text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }
  return text;
}

// Reconstructs the visual reading order from item positions. pdfjs returns text
// items in content-stream order, which for many tickets (e.g. Amadeus /
// CheckMyTrip) scrambles labels away from their values — the "Departure" label
// can land on a line of its own between the departure and arrival rows, which
// made the model read the arrival time (or duration) as the departure time.
// Grouping items into rows by their y-coordinate and sorting each row left→right
// keeps every label on the same line as its value.
function reconstructPageText(items: TextLayerItem[]): string {
  const rows: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];
  for (const item of items) {
    if (typeof item.str !== "string" || item.str.length === 0) continue;
    const t = item.transform;
    if (!Array.isArray(t) || typeof t[4] !== "number" || typeof t[5] !== "number") {
      // No positional data — bail to the flat path for the whole page.
      throw new Error("item missing transform");
    }
    const x = t[4] as number;
    const y = t[5] as number;
    const h = typeof item.height === "number" && item.height > 0 ? item.height : 10;
    const tol = Math.max(3, h * 0.6);
    let row = rows.find((r) => Math.abs(r.y - y) <= tol);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, str: item.str });
  }
  rows.sort((a, b) => b.y - a.y); // PDF origin is bottom-left: top of page first
  return rows
    .map((r) =>
      r.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((line) => line.length > 0)
    .join("\n");
}

async function extractTextLayer(
  pdfBytes: Uint8Array
): Promise<{ numPages: number; pageTexts: string[] } | null> {
  try {
    const doc = await getDocumentProxy(new Uint8Array(pdfBytes));
    const pageTexts: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items as TextLayerItem[];
      let text: string;
      try {
        text = reconstructPageText(items);
      } catch {
        // A weird PDF must never regress to no text — fall back to flat order.
        text = flattenItems(items);
      }
      pageTexts.push(text);
    }
    const numPages = doc.numPages;
    await doc.cleanup();
    return { numPages, pageTexts };
  } catch (err) {
    console.error("[TICKET_EXTRACT] text-layer parse failed:", err);
    return null;
  }
}

function chooseInputMode(
  textLayer: { numPages: number; pageTexts: string[] } | null
): { mode: InputMode; documentText: string } {
  if (textLayer && textLayer.numPages > 0) {
    const nonWs = (s: string) => s.replace(/\s/g, "").length;
    if (textLayer.pageTexts.every((t) => nonWs(t) >= MIN_TEXT_CHARS_PER_PAGE)) {
      const documentText = textLayer.pageTexts
        .map((t, i) => `--- Page ${i + 1} ---\n${t.trim()}`)
        .join("\n\n");
      return { mode: "text", documentText };
    }
  }
  return { mode: "pdf+images", documentText: "" };
}

// The system prompt is the static prefix OpenAI caches across requests, so it
// must never vary per request — validation feedback goes in a later turn.
function buildMessages(
  mode: InputMode,
  pdfBase64: string,
  imagesBase64: string[],
  documentText: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const content: Array<Record<string, unknown>> = [];
  if (mode === "text") {
    content.push({
      type: "text",
      text: `Ticket document (extracted text):\n\n${documentText}`,
    });
  } else {
    content.push({
      type: "file",
      file: {
        filename: "ticket.pdf",
        file_data: `data:application/pdf;base64,${pdfBase64}`,
      },
    });
    content.push(
      ...imagesBase64.map((img) => ({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${img}`, detail: "high" },
      }))
    );
  }
  content.push({
    type: "text",
    text: "Extract the travel ticket data from this document.",
  });

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content } as unknown as OpenAI.Chat.ChatCompletionUserMessageParam,
  ];
}

// Follow-up turn asking the model to fix its own output: reuses the cached
// prefix and the already-sent document, so it costs far less than a fresh
// extraction on a bigger model.
function buildRepairMessages(
  base: OpenAI.Chat.ChatCompletionMessageParam[],
  previousRaw: string,
  zodErrors: string
): OpenAI.Chat.ChatCompletionMessageParam[] {
  return [
    ...base,
    { role: "assistant", content: previousRaw },
    {
      role: "user",
      content: `Your extraction failed validation with these errors:\n${zodErrors}\nRe-read the document and return the corrected, complete JSON.`,
    },
  ];
}

function extractJson(raw: string): string {
  let trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  return trimmed;
}

function formatZodErrors(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
}

function isTransientError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    const status = error.status;
    return status === 408 || status === 429 || (status !== undefined && status >= 500);
  }
  if (error instanceof Error && error.message.includes("timeout")) {
    return true;
  }
  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type ModelCall = { raw: string; usage: string };

async function callModelWithRetry(
  openai: OpenAI,
  model: string,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  signal: AbortSignal
): Promise<ModelCall> {
  // Structured outputs (strict JSON Schema) guarantees schema-shaped JSON;
  // only semantic checks (min lengths, regexes, superRefine) can still fail.
  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model,
    messages,
    // Reasoning models count reasoning tokens here too; with reasoning off the
    // ticket JSON itself needs ~300-600 tokens.
    max_completion_tokens: 3500,
    // Luna models default to "medium" reasoning, which triples latency for no
    // accuracy gain on extraction. Non-reasoning gpt-4.x models reject the
    // parameter outright (400), so omit it there to keep env-var rollback safe.
    ...(!model.startsWith("gpt-4") && { reasoning_effort: "none" as const }),
    service_tier: SERVICE_TIER as OpenAI.Chat.ChatCompletionCreateParams["service_tier"],
    prompt_cache_key: "ticket-extract-v1",
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ticket_data",
        strict: true,
        schema: TICKET_JSON_SCHEMA,
      },
    },
  };

  const call = async (): Promise<ModelCall> => {
    const response = await openai.chat.completions.create(params, { signal });
    const u = response.usage;
    return {
      raw: response.choices[0]?.message?.content ?? "",
      usage: `in=${u?.prompt_tokens ?? "?"} cached=${u?.prompt_tokens_details?.cached_tokens ?? 0} out=${u?.completion_tokens ?? "?"} tier=${response.service_tier ?? "?"}`,
    };
  };

  try {
    return await call();
  } catch (error) {
    if (isTransientError(error) && !signal.aborted) {
      await delay(1000);
      return await call();
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Extraction logic
// ---------------------------------------------------------------------------

interface ExtractionResult {
  success: boolean;
  data?: TicketData;
  error?: string;
  model: string;
  wasRetried: boolean;
  processingMs: number;
}

interface AttemptOutcome {
  attempt: number;
  model: string;
  data?: TicketData;
  zodErrors?: string;
  raw?: string;
  error?: unknown;
}

// Never throws: failures come back as an outcome so the caller can race and
// fall back without try/catch around every branch.
async function runAttempt(
  openai: OpenAI,
  attempt: number,
  model: string,
  mode: InputMode,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  signal: AbortSignal
): Promise<AttemptOutcome> {
  const attemptStart = Date.now();
  const tag = `[TICKET_EXTRACT] attempt=${attempt} model=${model} mode=${mode}`;
  try {
    const { raw, usage } = await callModelWithRetry(openai, model, messages, signal);
    const ms = Date.now() - attemptStart;
    let json: unknown;
    try {
      json = normalizeExtraction(JSON.parse(extractJson(raw)));
    } catch {
      console.log(`${tag} ms=${ms} ${usage} ok=false invalidJson`);
      return { attempt, model, zodErrors: "Output was not valid JSON", raw };
    }
    const parsed = ticketDataSchema.safeParse(json);
    if (parsed.success) {
      console.log(`${tag} ms=${ms} ${usage} ok=true`);
      return { attempt, model, data: parsed.data };
    }
    const errors = formatZodErrors(parsed.error);
    console.log(`${tag} ms=${ms} ${usage} ok=false zodErrors=${errors}`);
    return { attempt, model, zodErrors: errors, raw };
  } catch (err) {
    const ms = Date.now() - attemptStart;
    if (signal.aborted) {
      console.log(`${tag} ms=${ms} cancelled`);
    } else {
      console.error(`${tag} ms=${ms} threw:`, err);
    }
    return { attempt, model, error: err };
  }
}

// Attempt plan:
//   1. primary model, fast input mode (text when the PDF has a text layer)
//   2. on a validation failure: the same model repairs its own output in a
//      follow-up turn (cached prefix, small output — far cheaper than a fresh
//      extraction)
//   3. backup model on the full PDF + images. Started as a hedge if the primary
//      path is slow (HEDGE_AFTER_MS), or as the last resort when it fails.
// The first validated result wins and the other in-flight call is cancelled.
async function extractTicketData(
  openai: OpenAI,
  mode: InputMode,
  pdfBase64: string,
  imagesBase64: string[],
  documentText: string
): Promise<ExtractionResult> {
  const startMs = Date.now();
  const primaryCtl = new AbortController();
  const backupCtl = new AbortController();

  // The backup always sees the full document: if the fast text input lost
  // something (scrambled columns, missing sections), the PDF restores it.
  const FALLBACK_MODE: InputMode = "pdf+images";
  let backup: Promise<AttemptOutcome> | undefined;
  let signalBackupStarted!: () => void;
  const backupStarted = new Promise<void>((resolve) => (signalBackupStarted = resolve));
  const startBackup = (): Promise<AttemptOutcome> => {
    if (!backup) {
      backup = runAttempt(
        openai, 3, MODEL_BACKUP, FALLBACK_MODE,
        buildMessages(FALLBACK_MODE, pdfBase64, imagesBase64, documentText),
        backupCtl.signal
      );
      signalBackupStarted();
    }
    return backup;
  };
  const hedgeTimer = setTimeout(startBackup, HEDGE_AFTER_MS[mode]);

  const primaryMessages = buildMessages(mode, pdfBase64, imagesBase64, documentText);
  const primary = (async () => {
    const first = await runAttempt(openai, 1, MODEL_PRIMARY, mode, primaryMessages, primaryCtl.signal);
    if (first.data || !first.raw || !first.zodErrors || primaryCtl.signal.aborted) return first;
    return runAttempt(
      openai, 2, MODEL_PRIMARY, mode,
      buildRepairMessages(primaryMessages, first.raw, first.zodErrors),
      primaryCtl.signal
    );
  })();

  // Primary path: its success, or else whatever the backup returns.
  const fromPrimary = primary.then((outcome) => {
    if (outcome.data) return outcome;
    clearTimeout(hedgeTimer);
    return startBackup();
  });
  // Hedged backup: only wins the race if it validates.
  const fromBackup = backupStarted
    .then(() => backup!)
    .then((outcome) => (outcome.data ? outcome : new Promise<never>(() => {})));

  const final = await Promise.race([fromPrimary, fromBackup]);
  clearTimeout(hedgeTimer);
  primaryCtl.abort();
  backupCtl.abort();

  const processingMs = Date.now() - startMs;
  if (final.data) {
    if (mode === "text") cleanVehiclePlates(final.data, documentText);
    return { success: true, data: final.data, model: final.model, wasRetried: final.attempt !== 1, processingMs };
  }
  return {
    success: false,
    error: final.zodErrors
      ? `Validation failed after all attempts: ${final.zodErrors}`
      : final.error instanceof Error ? final.error.message : "Unknown error",
    model: final.model,
    wasRetried: true,
    processingMs,
  };
}

// ---------------------------------------------------------------------------
// Edge Function handler
// ---------------------------------------------------------------------------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  try {
    const token = authHeader.replace("Bearer ", "");
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.role !== "service_role") {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const requestStart = Date.now();
  try {
    const body = await req.json();
    const versionId = body?.versionId;
    if (!versionId || typeof versionId !== "string") {
      return new Response(
        JSON.stringify({ error: "versionId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // No SDK-level retries/10-min default timeout: callModelWithRetry does one
    // transient retry itself, and a stuck call must not stall the hedge chain.
    const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")!, timeout: 30_000, maxRetries: 0 });
    const bunnyCdnUrl = Deno.env.get("BUNNY_CDN_URL")!;

    // The caller (upload/reupload route) already knows the storage path and
    // passes it in the body, letting us skip a DB round-trip. Fall back to a
    // lookup for older in-flight calls or manual re-invocations.
    let storagePath: string | undefined =
      typeof body?.storagePath === "string" ? body.storagePath : undefined;

    if (!storagePath) {
      const { data: version, error: fetchError } = await supabase
        .from("TicketVersion")
        .select("originalStoragePath")
        .eq("id", versionId)
        .single();

      if (fetchError || !version) {
        console.error("[TICKET_EXTRACT] Failed to fetch TicketVersion:", fetchError);
        return new Response(
          JSON.stringify({ error: "TicketVersion not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      storagePath = version.originalStoragePath;
    }

    const pdfUrl = `${bunnyCdnUrl}/${storagePath}`;
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Bunny download failed (${pdfResponse.status}): ${await pdfResponse.text()}`);
    }
    const pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
    const pdfBase64 = encodeBase64(pdfBytes);
    const embeddedJpegs = extractEmbeddedJpegs(pdfBytes);
    const imagesBase64 = embeddedJpegs.map((img) => encodeBase64(img));

    const textLayer = await extractTextLayer(pdfBytes);
    const { mode, documentText } = chooseInputMode(textLayer);
    console.log(
      `[TICKET_EXTRACT] mode=${mode} pages=${textLayer?.numPages ?? "?"} embeddedJpegs=${embeddedJpegs.length}`
    );

    const result = await extractTicketData(openai, mode, pdfBase64, imagesBase64, documentText);

    const updateData = result.success
      ? {
          extractedData: result.data,
          extractionStatus: "EXTRACTED",
          modelUsed: result.model,
          wasRetried: result.wasRetried,
          processingMs: result.processingMs,
        }
      : {
          extractionStatus: "FAILED",
          modelUsed: result.model,
          wasRetried: result.wasRetried,
          processingMs: result.processingMs,
        };

    const { error: updateError } = await supabase
      .from("TicketVersion")
      .update(updateData)
      .eq("id", versionId);

    if (updateError) {
      console.error("[TICKET_EXTRACT] Failed to update TicketVersion:", updateError);
    }
    // processingMs only covers the model calls; this is the whole request
    // (download + text layer + models + DB write).
    console.log(
      `[TICKET_EXTRACT] done success=${result.success} model=${result.model} retried=${result.wasRetried} modelMs=${result.processingMs} totalMs=${Date.now() - requestStart}`
    );

    return new Response(
      JSON.stringify({ success: result.success }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[TICKET_EXTRACT] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
