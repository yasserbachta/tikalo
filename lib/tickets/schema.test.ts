import { describe, it, expect } from "vitest";

import {
  ticketDataSchema,
  feeSchema,
  getDisplayRoute,
  getDisplayInfo,
  getDirectionLabel,
  migrateTicketData,
  normalizePassengerName,
  type FlightLeg,
  type MaritimeLeg,
  type TicketData,
} from "@/lib/tickets/schema";

// The ticket Zod schema is the contract between the AI extraction layer and
// every downstream consumer (PDF render, list views, confirm). These tests pin
// the type/direction rules, the round-trip-with-connections case that the old
// flat schema could not represent, and the legacy-data migration path.

function leg(over: Partial<FlightLeg> = {}): FlightLeg {
  return {
    flightNumber: "AH1006",
    airline: "Air Algérie",
    departureAirport: "ALG",
    departureCity: "Algiers",
    arrivalAirport: "CDG",
    arrivalCity: "Paris",
    departureDate: "2026-07-01",
    departureTime: "08:30",
    ...over,
  };
}

function maritimeLeg(over: Partial<MaritimeLeg> = {}): MaritimeLeg {
  return {
    shipName: "Tariq Ibn Ziyad",
    company: "Algérie Ferries",
    departurePort: "ALG",
    departureCity: "Algiers",
    arrivalPort: "MRS",
    arrivalCity: "Marseille",
    departureDate: "2026-07-01",
    departureTime: "20:00",
    hasVehicle: false,
    ...over,
  };
}

const passengers = [{ name: "Jane Doe", ticketNumber: "074-1234567890" }];

describe("ticketDataSchema — valid payloads", () => {
  it("accepts a ONE_WAY ticket with one direction, one leg", () => {
    const res = ticketDataSchema.safeParse({
      type: "ONE_WAY",
      passengers,
      directions: [{ kind: "OUTBOUND", legs: [leg()] }],
    });
    expect(res.success).toBe(true);
  });

  it("accepts a ONE_WAY ticket whose single direction has a connection", () => {
    const res = ticketDataSchema.safeParse({
      type: "ONE_WAY",
      passengers,
      directions: [
        {
          kind: "OUTBOUND",
          legs: [
            leg({ arrivalAirport: "IST", arrivalCity: "Istanbul" }),
            leg({ departureAirport: "IST", departureCity: "Istanbul" }),
          ],
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("accepts a ROUND_TRIP with two direct directions", () => {
    const res = ticketDataSchema.safeParse({
      type: "ROUND_TRIP",
      passengers,
      directions: [
        { kind: "OUTBOUND", legs: [leg()] },
        {
          kind: "RETURN",
          legs: [leg({ departureAirport: "CDG", arrivalAirport: "ALG" })],
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("accepts a ROUND_TRIP with a connection in each direction (the failing ticket)", () => {
    const res = ticketDataSchema.safeParse({
      type: "ROUND_TRIP",
      passengers,
      directions: [
        {
          kind: "OUTBOUND",
          legs: [
            leg({ flightNumber: "AF1055", arrivalAirport: "CDG", arrivalCity: "Paris" }),
            leg({ flightNumber: "AF3628", departureAirport: "CDG", departureCity: "Paris", arrivalAirport: "JFK", arrivalCity: "New York" }),
          ],
        },
        {
          kind: "RETURN",
          legs: [
            leg({ flightNumber: "AF1", departureAirport: "JFK", departureCity: "New York", arrivalAirport: "CDG", arrivalCity: "Paris" }),
            leg({ flightNumber: "AF1654", departureAirport: "CDG", departureCity: "Paris", arrivalAirport: "ALG", arrivalCity: "Algiers" }),
          ],
        },
      ],
    });
    expect(res.success).toBe(true);
  });

  it("accepts a MARITIME ticket with at least one maritime direction", () => {
    const res = ticketDataSchema.safeParse({
      type: "MARITIME",
      passengers,
      maritimeDirections: [{ kind: "OUTBOUND", legs: [maritimeLeg()] }],
    });
    expect(res.success).toBe(true);
  });

  it("defaults showFeeBreakdownInPdf to false when omitted", () => {
    const res = ticketDataSchema.safeParse({
      type: "ONE_WAY",
      passengers,
      directions: [{ kind: "OUTBOUND", legs: [leg()] }],
    });
    expect(res.success && res.data.showFeeBreakdownInPdf).toBe(false);
  });
});

describe("ticketDataSchema — direction-count rules", () => {
  it("rejects ONE_WAY with two directions", () => {
    const res = ticketDataSchema.safeParse({
      type: "ONE_WAY",
      passengers,
      directions: [
        { kind: "OUTBOUND", legs: [leg()] },
        { kind: "RETURN", legs: [leg()] },
      ],
    });
    expect(res.success).toBe(false);
  });

  it("rejects ROUND_TRIP with one direction", () => {
    const res = ticketDataSchema.safeParse({
      type: "ROUND_TRIP",
      passengers,
      directions: [{ kind: "OUTBOUND", legs: [leg()] }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a direction with no legs", () => {
    const res = ticketDataSchema.safeParse({
      type: "ONE_WAY",
      passengers,
      directions: [{ kind: "OUTBOUND", legs: [] }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a flight ticket with no directions", () => {
    const res = ticketDataSchema.safeParse({ type: "ONE_WAY", passengers });
    expect(res.success).toBe(false);
  });
});

describe("ticketDataSchema — maritime rules", () => {
  it("rejects MARITIME with no maritime directions", () => {
    const res = ticketDataSchema.safeParse({
      type: "MARITIME",
      passengers,
      maritimeDirections: [],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a flight ticket that carries maritime directions", () => {
    const res = ticketDataSchema.safeParse({
      type: "ONE_WAY",
      passengers,
      directions: [{ kind: "OUTBOUND", legs: [leg()] }],
      maritimeDirections: [{ kind: "OUTBOUND", legs: [maritimeLeg()] }],
    });
    expect(res.success).toBe(false);
  });
});

describe("ticketDataSchema — malformed leaf data", () => {
  it("rejects an empty passenger list", () => {
    const res = ticketDataSchema.safeParse({
      type: "ONE_WAY",
      passengers: [],
      directions: [{ kind: "OUTBOUND", legs: [leg()] }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a passenger with an empty name", () => {
    const res = ticketDataSchema.safeParse({
      type: "ONE_WAY",
      passengers: [{ name: "" }],
      directions: [{ kind: "OUTBOUND", legs: [leg()] }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a malformed departure date", () => {
    const res = ticketDataSchema.safeParse({
      type: "ONE_WAY",
      passengers,
      directions: [{ kind: "OUTBOUND", legs: [leg({ departureDate: "01/07/2026" })] }],
    });
    expect(res.success).toBe(false);
  });

  it("rejects a fee whose amount is not a number", () => {
    const res = feeSchema.safeParse({ label: "Port tax", amount: "12.50" });
    expect(res.success).toBe(false);
  });

  it("accepts a well-formed fee with a nullish quantity", () => {
    const res = feeSchema.safeParse({
      label: "Port tax",
      amount: 12.5,
      quantity: null,
      category: "port",
    });
    expect(res.success).toBe(true);
  });
});

describe("migrateTicketData — legacy → nested directions", () => {
  it("lifts a legacy passengerName ticket into the nested ONE_WAY structure", () => {
    const migrated = migrateTicketData({
      passengerName: "Old Format",
      flightNumber: "AH1006",
      departureAirport: "ALG",
      arrivalAirport: "CDG",
      departureDate: "2026-07-01",
      departureTime: "08:30",
    });
    expect(migrated?.type).toBe("ONE_WAY");
    expect(migrated?.passengers?.[0]?.name).toBe("Old Format");
    expect(migrated?.directions).toHaveLength(1);
    expect(migrated?.directions?.[0]?.legs).toHaveLength(1);
    expect(migrated).not.toHaveProperty("segments");
  });

  it("converts a legacy flat ONE_WAY segment list into directions", () => {
    const migrated = migrateTicketData({
      type: "ONE_WAY",
      passengers,
      segments: [{ segmentType: "OUTBOUND", ...leg() }],
    });
    expect(migrated?.directions).toHaveLength(1);
    expect(migrated?.directions?.[0]?.kind).toBe("OUTBOUND");
    expect(migrated?.directions?.[0]?.legs?.[0]).not.toHaveProperty("segmentType");
    expect(migrated).not.toHaveProperty("segments");
  });

  it("converts a legacy flat ROUND_TRIP into two directions", () => {
    const migrated = migrateTicketData({
      type: "ROUND_TRIP",
      passengers,
      segments: [
        { segmentType: "OUTBOUND", ...leg() },
        { segmentType: "RETURN", ...leg({ departureAirport: "CDG", arrivalAirport: "ALG" }) },
      ],
    });
    expect(migrated?.directions).toHaveLength(2);
    expect(migrated?.directions?.[0]?.kind).toBe("OUTBOUND");
    expect(migrated?.directions?.[1]?.kind).toBe("RETURN");
  });

  it("folds legacy MULTI_LEG connecting segments into one direction", () => {
    const migrated = migrateTicketData({
      type: "MULTI_LEG",
      passengers,
      segments: [
        { segmentType: "OUTBOUND", ...leg() },
        { segmentType: "CONNECTING", ...leg({ departureAirport: "CDG", arrivalAirport: "JFK" }) },
      ],
    });
    expect(migrated?.directions).toHaveLength(1);
    expect(migrated?.directions?.[0]?.legs).toHaveLength(2);
  });

  it("converts legacy maritimeJourneys into maritimeDirections", () => {
    const migrated = migrateTicketData({
      type: "MARITIME",
      passengers,
      maritimeJourneys: [
        maritimeLeg(),
        maritimeLeg({ departureCity: "Marseille", departurePort: "MRS", arrivalCity: "Algiers", arrivalPort: "ALG" }),
      ],
    });
    expect(migrated?.maritimeDirections).toHaveLength(2);
    expect(migrated?.maritimeDirections?.[0]?.kind).toBe("OUTBOUND");
    expect(migrated?.maritimeDirections?.[1]?.kind).toBe("RETURN");
    expect(migrated).not.toHaveProperty("maritimeJourneys");
  });

  it("folds a legacy single `maritime` object into a maritime direction", () => {
    const migrated = migrateTicketData({
      type: "MARITIME",
      passengers,
      maritime: maritimeLeg(),
    });
    expect(migrated?.maritimeDirections).toHaveLength(1);
    expect(migrated).not.toHaveProperty("maritime");
  });

  it("passes an already-nested ticket through unchanged", () => {
    const current: TicketData = {
      type: "ONE_WAY",
      passengers,
      directions: [{ kind: "OUTBOUND", legs: [leg()] }],
      showFeeBreakdownInPdf: false,
    };
    const migrated = migrateTicketData(current);
    expect(migrated?.directions).toHaveLength(1);
    expect(migrated?.passengers?.[0]?.name).toBe("Jane Doe");
  });

  it("returns null for input that is neither legacy nor current", () => {
    expect(migrateTicketData({ foo: "bar" })).toBeNull();
    expect(migrateTicketData(null)).toBeNull();
  });
});

describe("display helpers", () => {
  it("renders a one-way route as A → B", () => {
    const data: TicketData = {
      type: "ONE_WAY",
      passengers,
      directions: [{ kind: "OUTBOUND", legs: [leg()] }],
      showFeeBreakdownInPdf: false,
    };
    expect(getDisplayRoute(data)).toBe("ALG → CDG");
  });

  it("renders a round-trip route with the ⇄ marker using the outbound endpoints", () => {
    const data: TicketData = {
      type: "ROUND_TRIP",
      passengers,
      directions: [
        {
          kind: "OUTBOUND",
          legs: [
            leg({ arrivalAirport: "CDG" }),
            leg({ departureAirport: "CDG", arrivalAirport: "JFK" }),
          ],
        },
        {
          kind: "RETURN",
          legs: [
            leg({ departureAirport: "JFK", arrivalAirport: "CDG" }),
            leg({ departureAirport: "CDG", arrivalAirport: "ALG" }),
          ],
        },
      ],
      showFeeBreakdownInPdf: false,
    };
    expect(getDisplayRoute(data)).toBe("ALG ⇄ JFK");
  });

  it("labels directions by kind, not position", () => {
    const dirs = [{ kind: "OUTBOUND" as const }, { kind: "RETURN" as const }];
    expect(getDirectionLabel(dirs, 0)).toBe("Aller");
    expect(getDirectionLabel(dirs, 1)).toBe("Retour");
    // A one-way trip needs no bound label.
    expect(getDirectionLabel([{ kind: "OUTBOUND" as const }], 0)).toBeNull();
  });

  it("summarises passenger, route, type and departure date for a list row", () => {
    const data: TicketData = {
      type: "MARITIME",
      passengers,
      maritimeDirections: [{ kind: "OUTBOUND", legs: [maritimeLeg()] }],
      showFeeBreakdownInPdf: false,
    };
    expect(getDisplayInfo(data)).toEqual({
      passengerName: "Jane Doe",
      routeSummary: "Algiers → Marseille",
      departureDate: "2026-07-01",
      type: "MARITIME",
    });
  });
});

describe("normalizePassengerName", () => {
  it.each([
    ["BOUTOUBA / ALLEL MR", "BOUTOUBA ALLEL"],
    ["BENSRIDA / YAMINA", "BENSRIDA YAMINA"],
    ["EL MEDDAH / RAYANE", "EL MEDDAH RAYANE"],
    ["EL MEDDAH RAYANE", "EL MEDDAH RAYANE"],
    ["MERABET / SID AHMED", "MERABET SID AHMED"],
    ["FEDDAL/SAMIA MRS", "FEDDAL SAMIA"],
    ["BOUTOUBA/ALLELMR", "BOUTOUBA ALLEL"],
    ["LAIB/THAMEUR MSTR (CHD)", "LAIB THAMEUR"],
    ["MME SAMIA FEDDAL", "SAMIA FEDDAL"],
    ["M. ALLEL BOUTOUBA", "ALLEL BOUTOUBA"],
    ["  SLIM   /  LYES  ", "SLIM LYES"],
    ["Jane Doe", "Jane Doe"],
    ["WILLIAMS / JAMES", "WILLIAMS JAMES"],
    ["MR", "MR"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePassengerName(input)).toBe(expected);
  });

  it("is applied when reading stored ticket data", () => {
    const migrated = migrateTicketData({
      type: "ONE_WAY",
      passengers: [{ name: "BOUTOUBA / ALLEL MR", ticketNumber: "030-2403689458" }],
      directions: [{ kind: "OUTBOUND", legs: [leg()] }],
    });
    expect(migrated?.passengers[0]).toEqual({ name: "BOUTOUBA ALLEL", ticketNumber: "030-2403689458" });
  });
});
