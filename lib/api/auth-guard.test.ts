import { describe, it, expect, vi, beforeEach } from "vitest";

// These guards are the route-handler half of the tenancy boundary. They only
// read the (mocked) session, so they belong in the unit project. We assert the
// 401-vs-403 distinction and the scope the caller is handed.
vi.mock("@/auth", () => ({ auth: vi.fn() }));

import {
  requireUserApi,
  requireSuperAdminApi,
  requireTicketScopeApi,
} from "@/lib/api/auth-guard";
import { auth } from "@/auth";

const authMock = vi.mocked(auth);

const session = (user: Record<string, unknown> | null) =>
  authMock.mockResolvedValue((user ? { user } : null) as never);

beforeEach(() => vi.clearAllMocks());

describe("requireUserApi", () => {
  it("rejects an unauthenticated caller with 401", async () => {
    session(null);
    const res = await requireUserApi();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(401);
  });

  it("allows any authenticated user", async () => {
    session({ id: "u1" });
    const res = await requireUserApi();
    expect(res).toEqual({ ok: true, data: { userId: "u1" } });
  });
});

describe("requireSuperAdminApi", () => {
  it("rejects no session with 401", async () => {
    session(null);
    const res = await requireSuperAdminApi();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(401);
  });

  it("rejects a non-super-admin with 403", async () => {
    session({ id: "u1", role: "AGENCY_ADMIN" });
    const res = await requireSuperAdminApi();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(403);
  });

  it("allows a super-admin", async () => {
    session({ id: "u1", role: "SUPER_ADMIN" });
    const res = await requireSuperAdminApi();
    expect(res).toEqual({ ok: true, data: { userId: "u1" } });
  });
});

describe("requireTicketScopeApi", () => {
  it("rejects no session with 401", async () => {
    session(null);
    const res = await requireTicketScopeApi();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(401);
  });

  it("gives a super-admin a cross-agency scope (agencyId null)", async () => {
    session({ id: "u1", role: "SUPER_ADMIN" });
    const res = await requireTicketScopeApi();
    expect(res).toEqual({
      ok: true,
      data: { userId: "u1", agencyId: null, isSuperAdmin: true },
    });
  });

  it("pins an agency user to their own agencyId", async () => {
    session({ id: "u2", role: "AGENCY_ADMIN", agencyId: "agency-1" });
    const res = await requireTicketScopeApi();
    expect(res).toEqual({
      ok: true,
      data: { userId: "u2", agencyId: "agency-1", isSuperAdmin: false },
    });
  });

  it("rejects an agency user with no agency assigned (403)", async () => {
    session({ id: "u3", role: "AGENCY_ADMIN", agencyId: null });
    const res = await requireTicketScopeApi();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(403);
  });
});
