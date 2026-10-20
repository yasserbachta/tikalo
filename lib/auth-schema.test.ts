import { describe, it, expect } from "vitest";

import { LoginSchema } from "@/lib/auth-schema";

// LoginSchema is the first gate on the credentials path (used by both the login
// action and the next-auth authorize callback). It must reject malformed input
// before any DB lookup or password compare runs.

describe("LoginSchema", () => {
  it("accepts a valid email and non-empty password", () => {
    const res = LoginSchema.safeParse({
      email: "user@example.com",
      password: "hunter2",
    });
    expect(res.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const res = LoginSchema.safeParse({
      email: "not-an-email",
      password: "hunter2",
    });
    expect(res.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const res = LoginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(res.success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(LoginSchema.safeParse({}).success).toBe(false);
    expect(LoginSchema.safeParse({ email: "user@example.com" }).success).toBe(
      false,
    );
  });
});
