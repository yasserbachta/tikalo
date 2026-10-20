import { describe, it, expect, vi, beforeEach } from "vitest";

// Integration: ticket mutations against a real database. The session (auth) and
// Bunny storage (network) are mocked; db.* is real, so tenancy scoping, the
// confirm transaction and version integrity are all exercised for real.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/tickets/bunny", () => ({ deleteBunnyFile: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { confirmTicket, deleteTicket, saveTicket } from "@/actions/tickets";
import { auth } from "@/auth";
import { deleteBunnyFile } from "@/lib/tickets/bunny";
import {
  db,
  resetDb,
  makeAgency,
  makeUser,
  makeTicket,
  makeTicketVersion,
} from "@/tests/db/helpers";

const authMock = vi.mocked(auth);
const deleteBunnyMock = vi.mocked(deleteBunnyFile);

const asAgencyAdmin = (userId: string, agencyId: string) =>
  authMock.mockResolvedValue({
    user: { id: userId, role: "AGENCY_ADMIN", agencyId },
  } as never);

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

// A ticket owned by `agencyId`/`userId`, with one latest extracted version.
async function seedTicket(agencyId: string, userId: string, passenger = "Alice") {
  const ticket = await makeTicket({ agencyId, createdById: userId, status: "DRAFT" });
  const version = await makeTicketVersion({
    ticketId: ticket.id,
    isLatest: true,
    extractionStatus: "EXTRACTED",
    extractedData: oneWay(passenger),
  });
  return { ticket, version };
}

beforeEach(async () => {
  vi.clearAllMocks();
  // clearAllMocks wipes the resolved value too; the action awaits this promise.
  deleteBunnyMock.mockResolvedValue(undefined);
  await resetDb();
});

describe("confirmTicket", () => {
  it("moves a DRAFT ticket to CONFIRMED and stamps the latest version", async () => {
    const agency = await makeAgency();
    const user = await makeUser({ agencyId: agency.id });
    const { ticket, version } = await seedTicket(agency.id, user.id);
    asAgencyAdmin(user.id, agency.id);

    const res = await confirmTicket(ticket.id);
    expect(res).toEqual({ ok: true });

    const after = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.status).toBe("CONFIRMED");

    const v = await db.ticketVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(v.confirmedById).toBe(user.id);
    expect(v.confirmedAt).not.toBeNull();
    expect(v.confirmedData).not.toBeNull();
  });

  it("cannot confirm another agency's ticket", async () => {
    const agencyA = await makeAgency();
    const agencyB = await makeAgency();
    const userA = await makeUser({ agencyId: agencyA.id });
    const userB = await makeUser({ agencyId: agencyB.id });
    const { ticket } = await seedTicket(agencyB.id, userB.id);

    asAgencyAdmin(userA.id, agencyA.id); // acting as agency A
    const res = await confirmTicket(ticket.id);
    expect(res).toEqual({ ok: false, error: "Ticket not found" });

    const after = await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.status).toBe("DRAFT"); // untouched
  });
});

describe("deleteTicket", () => {
  it("deletes the caller's own ticket and best-effort removes stored files", async () => {
    const agency = await makeAgency();
    const user = await makeUser({ agencyId: agency.id });
    const { ticket } = await seedTicket(agency.id, user.id);
    asAgencyAdmin(user.id, agency.id);

    const res = await deleteTicket(ticket.id);
    expect(res).toEqual({ ok: true });

    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).toBeNull();
    // The original stored PDF was scheduled for cleanup.
    expect(deleteBunnyMock).toHaveBeenCalled();
  });

  it("cannot delete another agency's ticket (scope) and leaves it intact", async () => {
    const agencyA = await makeAgency();
    const agencyB = await makeAgency();
    const userA = await makeUser({ agencyId: agencyA.id });
    const userB = await makeUser({ agencyId: agencyB.id });
    const { ticket } = await seedTicket(agencyB.id, userB.id);

    asAgencyAdmin(userA.id, agencyA.id); // acting as agency A
    const res = await deleteTicket(ticket.id);
    expect(res).toEqual({ ok: false, error: "Ticket not found" });

    expect(await db.ticket.findUnique({ where: { id: ticket.id } })).not.toBeNull();
    expect(deleteBunnyMock).not.toHaveBeenCalled();
  });
});

describe("saveTicket", () => {
  it("merges a partial edit into the latest version and keeps a single isLatest", async () => {
    const agency = await makeAgency();
    const user = await makeUser({ agencyId: agency.id });
    const { ticket, version } = await seedTicket(agency.id, user.id, "Alice");
    asAgencyAdmin(user.id, agency.id);

    const res = await saveTicket(ticket.id, { price: "199.99", currency: "EUR" });
    expect(res).toEqual({ ok: true });

    const v = await db.ticketVersion.findUniqueOrThrow({ where: { id: version.id } });
    const confirmed = v.confirmedData as Record<string, unknown>;
    // Merge preserved the extracted passenger while adding the edited fields.
    expect(confirmed.price).toBe("199.99");
    expect(confirmed.currency).toBe("EUR");
    expect((confirmed.passengers as { name: string }[])[0].name).toBe("Alice");

    // Exactly one latest version remains for the ticket.
    const latestCount = await db.ticketVersion.count({
      where: { ticketId: ticket.id, isLatest: true },
    });
    expect(latestCount).toBe(1);
  });

  it("cannot edit another agency's ticket", async () => {
    const agencyA = await makeAgency();
    const agencyB = await makeAgency();
    const userA = await makeUser({ agencyId: agencyA.id });
    const userB = await makeUser({ agencyId: agencyB.id });
    const { ticket } = await seedTicket(agencyB.id, userB.id);

    asAgencyAdmin(userA.id, agencyA.id);
    const res = await saveTicket(ticket.id, { price: "1" });
    expect(res).toEqual({ ok: false, error: "Ticket not found" });
  });
});
