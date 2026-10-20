import { describe, it, expect, vi, beforeEach } from "vitest";

// Integration: signupAgency writes real rows (agency + admin user). Only the
// next-auth sign-in, the request headers and the rate limiter are mocked — the
// DB, slug uniqueness and duplicate-email guards run for real.
vi.mock("next-auth", () => {
  class AuthError extends Error {}
  return { AuthError };
});
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => "1.2.3.4" })),
}));
vi.mock("@/lib/rate-limit", () => ({ checkSignupRateLimit: vi.fn() }));

import { signupAgency } from "@/actions/signup";
import { signIn } from "@/auth";
import { checkSignupRateLimit } from "@/lib/rate-limit";
import { db, resetDb, makeAgency, makeUser } from "@/tests/db/helpers";

const signInMock = vi.mocked(signIn);
const rlMock = vi.mocked(checkSignupRateLimit);

const validInput = (over: Record<string, unknown> = {}) => ({
  name: "Sahara Voyages",
  email: "owner@sahara.test",
  password: "secret123",
  ...over,
});

beforeEach(async () => {
  vi.clearAllMocks();
  rlMock.mockResolvedValue({ ok: true });
  signInMock.mockResolvedValue(undefined as never);
  await resetDb();
});

describe("signupAgency — happy path", () => {
  it("creates a TRIAL agency + AGENCY_ADMIN user, slugifies, and signs in", async () => {
    const res = await signupAgency(validInput());
    expect(res).toEqual({ ok: true });

    const agency = await db.agency.findFirstOrThrow();
    expect(agency.slug).toBe("sahara-voyages");
    expect(agency.plan).toBe("TRIAL");
    expect(agency.trialUploadsUsed).toBe(0);
    expect(agency.email).toBe("owner@sahara.test");

    const user = await db.user.findUniqueOrThrow({
      where: { email: "owner@sahara.test" },
    });
    expect(user.role).toBe("AGENCY_ADMIN");
    expect(user.agencyId).toBe(agency.id);
    expect(user.password).toMatch(/^\$2[aby]\$/); // hashed, never plaintext

    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "owner@sahara.test",
      password: "secret123",
      redirect: false,
    });
  });

  it("appends a numeric suffix when the derived slug is taken", async () => {
    await makeAgency({ slug: "sahara-voyages" });
    const res = await signupAgency(validInput());
    expect(res).toEqual({ ok: true });

    const created = await db.agency.findUniqueOrThrow({
      where: { email: "owner@sahara.test" },
    });
    expect(created.slug).toBe("sahara-voyages-2");
  });
});

describe("signupAgency — guards", () => {
  it("blocks and never signs in when rate-limited", async () => {
    rlMock.mockResolvedValue({ ok: false, retryAfterSec: 30 });
    const res = await signupAgency(validInput());
    expect(res).toEqual({ ok: false, error: "Too many attempts. Try again in 30s." });
    expect(signInMock).not.toHaveBeenCalled();
    expect(await db.agency.count()).toBe(0);
  });

  it("rejects a duplicate email (existing user) without creating a second agency", async () => {
    await makeUser({ email: "owner@sahara.test" });
    const res = await signupAgency(validInput());
    expect(res.ok).toBe(false);
    expect(await db.agency.count()).toBe(0);
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("rejects a too-short password before any write", async () => {
    const res = await signupAgency(validInput({ password: "123" }));
    expect(res.ok).toBe(false);
    expect(await db.agency.count()).toBe(0);
  });
});
