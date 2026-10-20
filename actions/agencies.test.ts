import { describe, it, expect, vi, beforeEach } from "vitest";

// Integration: the agencies back-office writes run against a real database. Only
// the session (auth) and Next's cache revalidation are mocked — db.* and
// revokeAgencySessions are real, so role checks, slug generation, date/amount
// coercion and the expiry-triggered session revocation are all proven for real.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createAgency,
  updateAgency,
  updateMyAgency,
} from "@/actions/agencies";
import { auth } from "@/auth";
import { db, resetDb, makeAgency, makeUser } from "@/tests/db/helpers";

const authMock = vi.mocked(auth);

const asSuperAdmin = () =>
  authMock.mockResolvedValue({
    user: { id: "super-1", role: "SUPER_ADMIN" },
  } as never);
const asAgencyAdmin = (agencyId: string, userId = "agency-user-1") =>
  authMock.mockResolvedValue({
    user: { id: userId, role: "AGENCY_ADMIN", agencyId },
  } as never);

const validAgencyInput = (over: Record<string, unknown> = {}) => ({
  name: "Sahara Voyages",
  email: "info@sahara.test",
  slug: "Sahara Voyages!!",
  adminName: "Admin One",
  adminEmail: "admin@sahara.test",
  adminPassword: "secret123",
  ...over,
});

beforeEach(async () => {
  vi.clearAllMocks();
  await resetDb();
});

describe("createAgency — authorization", () => {
  it("rejects an unauthenticated caller and writes nothing", async () => {
    authMock.mockResolvedValue(null as never);
    const res = await createAgency(validAgencyInput());
    expect(res).toEqual({ ok: false, error: "Unauthorized" });
    expect(await db.agency.count()).toBe(0);
  });

  it("rejects an AGENCY_ADMIN with Forbidden and writes nothing", async () => {
    asAgencyAdmin("some-agency");
    const res = await createAgency(validAgencyInput());
    expect(res).toEqual({ ok: false, error: "Forbidden" });
    expect(await db.agency.count()).toBe(0);
  });
});

describe("createAgency — super-admin happy path", () => {
  it("creates the agency and a hashed-password AGENCY_ADMIN, slugifying the slug", async () => {
    asSuperAdmin();
    const res = await createAgency(validAgencyInput());
    expect(res.ok).toBe(true);

    const agency = await db.agency.findFirstOrThrow();
    expect(agency.slug).toBe("sahara-voyages"); // slugified from "Sahara Voyages!!"
    expect(agency.email).toBe("info@sahara.test");

    const admin = await db.user.findUniqueOrThrow({
      where: { email: "admin@sahara.test" },
    });
    expect(admin.role).toBe("AGENCY_ADMIN");
    expect(admin.agencyId).toBe(agency.id);
    // Password is stored hashed, never in plaintext.
    expect(admin.password).not.toBe("secret123");
    expect(admin.password).toMatch(/^\$2[aby]\$/);
  });

  it("rejects a duplicate slug/email without creating a second agency", async () => {
    asSuperAdmin();
    await createAgency(validAgencyInput());
    const res = await createAgency(
      validAgencyInput({ adminEmail: "other@sahara.test" }),
    );
    expect(res.ok).toBe(false);
    expect(await db.agency.count()).toBe(1);
  });
});

describe("updateAgency — authorization & coercion", () => {
  it("rejects an AGENCY_ADMIN", async () => {
    const agency = await makeAgency();
    asAgencyAdmin(agency.id);
    const res = await updateAgency(agency.id, { name: "Renamed" });
    expect(res).toEqual({ ok: false, error: "Forbidden" });
  });

  it("coerces an expiry date string and a numeric amount", async () => {
    const agency = await makeAgency();
    asSuperAdmin();
    const res = await updateAgency(agency.id, {
      expiryDate: "2026-12-31",
      amountPaid: 5000,
    });
    expect(res.ok).toBe(true);

    const updated = await db.agency.findUniqueOrThrow({ where: { id: agency.id } });
    expect(updated.expiryDate?.toISOString()).toBe(
      new Date("2026-12-31").toISOString(),
    );
    expect(updated.amountPaid).toBe(5000);
  });
});

describe("updateAgency — session revocation on expiry/suspension", () => {
  it("revokes every agency user's session when the expiry date changes", async () => {
    const agency = await makeAgency();
    const member = await makeUser({ agencyId: agency.id });
    asSuperAdmin();

    await updateAgency(agency.id, { expiryDate: "2027-01-01" });

    const after = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.tokenVersion).toBe(member.tokenVersion + 1);
  });

  it("revokes sessions when the agency is suspended", async () => {
    const agency = await makeAgency({ status: "ACTIVE" });
    const member = await makeUser({ agencyId: agency.id });
    asSuperAdmin();

    await updateAgency(agency.id, { status: "SUSPENDED" });

    const after = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.tokenVersion).toBe(member.tokenVersion + 1);
  });

  it("revokes sessions when the plan changes (e.g. TRIAL → PREMIUM)", async () => {
    const agency = await makeAgency({ plan: "TRIAL" });
    const member = await makeUser({ agencyId: agency.id });
    asSuperAdmin();

    await updateAgency(agency.id, { plan: "PREMIUM" });

    const updated = await db.agency.findUniqueOrThrow({ where: { id: agency.id } });
    expect(updated.plan).toBe("PREMIUM");
    const after = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.tokenVersion).toBe(member.tokenVersion + 1);
  });

  it("does not revoke sessions for an unrelated metadata edit", async () => {
    const agency = await makeAgency();
    const member = await makeUser({ agencyId: agency.id });
    asSuperAdmin();

    await updateAgency(agency.id, { name: "New Name" });

    const after = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.tokenVersion).toBe(member.tokenVersion);
  });
});

describe("updateMyAgency — self-service hardening", () => {
  it("only updates the session's own agency and strips privilege fields", async () => {
    const mine = await makeAgency({ primaryColor: "#000000" });
    const other = await makeAgency({ primaryColor: "#000000" });
    asAgencyAdmin(mine.id);

    const res = await updateMyAgency({
      primaryColor: "#ffffff",
      // smuggled privilege/scope fields — must be ignored:
      status: "SUSPENDED",
      agencyId: other.id,
      id: other.id,
    });
    expect(res).toEqual({ ok: true });

    const mineAfter = await db.agency.findUniqueOrThrow({ where: { id: mine.id } });
    const otherAfter = await db.agency.findUniqueOrThrow({ where: { id: other.id } });
    // Only my agency's whitelisted field changed; status untouched.
    expect(mineAfter.primaryColor).toBe("#ffffff");
    expect(mineAfter.status).toBe("ACTIVE");
    // The other agency (client-supplied id) was never touched.
    expect(otherAfter.primaryColor).toBe("#000000");
  });

  it("rejects an unauthenticated caller", async () => {
    authMock.mockResolvedValue(null as never);
    const res = await updateMyAgency({ primaryColor: "#ffffff" });
    expect(res).toEqual({ ok: false, error: "Unauthorized" });
  });
});
