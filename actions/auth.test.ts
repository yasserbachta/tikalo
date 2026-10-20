import { describe, it, expect, vi, beforeEach } from "vitest";

// Stub next-auth so importing AuthError doesn't drag the next-auth runtime
// (which pulls next/server) into the test. The action's `instanceof AuthError`
// resolves against this same stub.
vi.mock("next-auth", () => {
  class AuthError extends Error {}
  return { AuthError };
});
vi.mock("@/lib/rate-limit", () => ({
  checkLoginRateLimit: vi.fn(),
  resetLoginRateLimit: vi.fn(),
}));
vi.mock("@/auth", () => ({ signIn: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => "1.2.3.4, 10.0.0.1" })),
}));

import { AuthError } from "next-auth";

import { login } from "@/actions/auth";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/rate-limit";
import { signIn } from "@/auth";

const checkMock = vi.mocked(checkLoginRateLimit);
const resetMock = vi.mocked(resetLoginRateLimit);
const signInMock = vi.mocked(signIn);

const creds = { email: "user@example.com", password: "hunter2" };

beforeEach(() => vi.clearAllMocks());

describe("login action", () => {
  it("returns the rate-limit error and never calls signIn when blocked", async () => {
    checkMock.mockResolvedValue({ ok: false, retryAfterSec: 42 });
    const res = await login(creds);
    expect(res).toEqual({ error: "Too many attempts. Try again in 42s." });
    expect(signInMock).not.toHaveBeenCalled();
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("signs in and resets the bucket on success", async () => {
    checkMock.mockResolvedValue({ ok: true });
    signInMock.mockResolvedValue(undefined as never);
    const res = await login(creds);
    expect(res).toEqual({ ok: true });
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: creds.email,
      password: creds.password,
      redirect: false,
    });
    expect(resetMock).toHaveBeenCalledWith(creds.email);
  });

  it("returns a generic error on bad credentials without resetting", async () => {
    checkMock.mockResolvedValue({ ok: true });
    signInMock.mockRejectedValue(new AuthError("CredentialsSignin"));
    const res = await login(creds);
    expect(res).toEqual({ error: "These credentials don't match our records." });
    expect(resetMock).not.toHaveBeenCalled();
  });

  it("rejects malformed input before any rate-limit check", async () => {
    const res = await login({ email: "not-an-email", password: "" });
    expect(res).toEqual({ error: "These credentials don't match our records." });
    expect(checkMock).not.toHaveBeenCalled();
  });
});
