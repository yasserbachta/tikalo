import { describe, it, expect, beforeEach } from "vitest";

import {
  getTickets,
  getTicketById,
  scopedTicketWhere,
  type TicketScope,
} from "@/lib/data/ticket";
import {
  resetDb,
  makeAgency,
  makeUser,
  makeTicket,
  makeTicketVersion,
} from "@/tests/db/helpers";

// The multi-tenant isolation guarantee, proven against a real database. A mock
// can show scopedTicketWhere was *called*; only a real query proves an
// AGENCY_ADMIN can never see another agency's rows. This is the most important
// integration test in the suite.

// Minimal valid extracted-ticket payload so the list-display mapping has data.
const oneWay = (passengerName: string) => ({
  type: "ONE_WAY",
  passengers: [{ name: passengerName }],
  segments: [
    {
      segmentType: "OUTBOUND",
      flightNumber: "AH1006",
      airline: "Air Algérie",
      departureAirport: "ALG",
      departureCity: "Algiers",
      arrivalAirport: "CDG",
      arrivalCity: "Paris",
      departureDate: "2026-07-01",
      departureTime: "08:30",
    },
  ],
  showFeeBreakdownInPdf: false,
});

// Build a ticket with a single latest version carrying `passengerName`.
async function seedTicket(opts: {
  agencyId: string;
  createdById: string;
  passengerName: string;
  status?: "DRAFT" | "CONFIRMED" | "EXPORTED";
  reference?: string;
}) {
  const ticket = await makeTicket({
    agencyId: opts.agencyId,
    createdById: opts.createdById,
    status: opts.status ?? "DRAFT",
    reference: opts.reference,
  });
  await makeTicketVersion({
    ticketId: ticket.id,
    isLatest: true,
    extractionStatus: "EXTRACTED",
    extractedData: oneWay(opts.passengerName),
  });
  return ticket;
}

let agencyA: { id: string };
let agencyB: { id: string };
let scopeA: TicketScope;
let scopeB: TicketScope;
const scopeSuper: TicketScope = { agencyId: null, isSuperAdmin: true };

let ticketA1: { id: string };
let ticketA2: { id: string };
let ticketB1: { id: string };

beforeEach(async () => {
  await resetDb();

  agencyA = await makeAgency();
  agencyB = await makeAgency();
  const userA = await makeUser({ agencyId: agencyA.id });
  const userB = await makeUser({ agencyId: agencyB.id });

  scopeA = { agencyId: agencyA.id, isSuperAdmin: false };
  scopeB = { agencyId: agencyB.id, isSuperAdmin: false };

  ticketA1 = await seedTicket({
    agencyId: agencyA.id,
    createdById: userA.id,
    passengerName: "Alice Agency-A",
    reference: "REF-A1",
  });
  ticketA2 = await seedTicket({
    agencyId: agencyA.id,
    createdById: userA.id,
    passengerName: "Bob Agency-A",
    status: "CONFIRMED",
  });
  ticketB1 = await seedTicket({
    agencyId: agencyB.id,
    createdById: userB.id,
    passengerName: "Alice Agency-B",
    reference: "REF-B1",
  });
});

describe("scopedTicketWhere (pure)", () => {
  it("pins a non-super-admin to their agency", () => {
    expect(scopedTicketWhere({ agencyId: "a1", isSuperAdmin: false })).toEqual({
      agencyId: "a1",
    });
  });

  it("does not constrain a super-admin", () => {
    expect(scopedTicketWhere({ agencyId: null, isSuperAdmin: true })).toEqual({});
  });

  it("merges extra clauses while keeping the agency pin", () => {
    expect(
      scopedTicketWhere({ agencyId: "a1", isSuperAdmin: false }, { id: "t1" }),
    ).toEqual({ id: "t1", agencyId: "a1" });
  });
});

describe("getTickets — list scoping", () => {
  it("returns only the caller's agency tickets for an AGENCY_ADMIN", async () => {
    const list = await getTickets(scopeA);
    expect(list).toHaveLength(2);
    expect(list.map((t) => t.id).sort()).toEqual([ticketA1.id, ticketA2.id].sort());
    expect(list.map((t) => t.id)).not.toContain(ticketB1.id);
  });

  it("returns the other agency's tickets only for that agency", async () => {
    const list = await getTickets(scopeB);
    expect(list.map((t) => t.id)).toEqual([ticketB1.id]);
  });

  it("returns every agency's tickets for a SUPER_ADMIN", async () => {
    const list = await getTickets(scopeSuper);
    expect(list).toHaveLength(3);
    expect(list.map((t) => t.id).sort()).toEqual(
      [ticketA1.id, ticketA2.id, ticketB1.id].sort(),
    );
  });
});

describe("getTickets — filters stay scoped", () => {
  it("applies a status filter within the agency only", async () => {
    // Agency B also has a CONFIRMED ticket; agency A must not see it.
    const userB = await makeUser({ agencyId: agencyB.id });
    await seedTicket({
      agencyId: agencyB.id,
      createdById: userB.id,
      passengerName: "Carol Agency-B",
      status: "CONFIRMED",
    });

    const confirmed = await getTickets(scopeA, { status: "CONFIRMED" });
    expect(confirmed.map((t) => t.id)).toEqual([ticketA2.id]);
  });

  it("scopes a passenger-name search to the agency", async () => {
    // Both agencies have an "Alice"; scopeA must only match its own.
    const list = await getTickets(scopeA, { search: "Alice" });
    expect(list.map((t) => t.id)).toEqual([ticketA1.id]);
  });

  it("scopes a reference search to the agency", async () => {
    expect(await getTickets(scopeA, { search: "REF-B1" })).toHaveLength(0);
    expect((await getTickets(scopeA, { search: "REF-A1" })).map((t) => t.id)).toEqual([
      ticketA1.id,
    ]);
  });

  it("lets a super-admin filter the list to one agency", async () => {
    const list = await getTickets(scopeSuper, { agencyId: agencyB.id });
    expect(list.map((t) => t.id)).toEqual([ticketB1.id]);
  });

  it("ignores an agencyId filter from a non-super-admin (no cross-tenant leak)", async () => {
    // An agency user passing another agency's id must still only see their own.
    const list = await getTickets(scopeA, { agencyId: agencyB.id });
    expect(list.map((t) => t.id).sort()).toEqual([ticketA1.id, ticketA2.id].sort());
  });
});

describe("getTickets — list shape", () => {
  it("includes the owning agency on each row", async () => {
    const list = await getTickets(scopeSuper);
    const a1 = list.find((t) => t.id === ticketA1.id);
    expect(a1?.agency).toEqual({ id: agencyA.id, name: expect.any(String) });
  });
});

describe("getTicketById — single-fetch scoping", () => {
  it("lets an agency read its own ticket", async () => {
    const t = await getTicketById(ticketA1.id, scopeA);
    expect(t?.id).toBe(ticketA1.id);
  });

  it("returns null when an agency requests another agency's ticket", async () => {
    expect(await getTicketById(ticketB1.id, scopeA)).toBeNull();
    expect(await getTicketById(ticketA1.id, scopeB)).toBeNull();
  });

  it("lets a super-admin read any agency's ticket", async () => {
    expect((await getTicketById(ticketB1.id, scopeSuper))?.id).toBe(ticketB1.id);
  });
});
