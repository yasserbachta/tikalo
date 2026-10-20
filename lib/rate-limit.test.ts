import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Shared, hoisted spies so the @upstash mock factory can reach them. `ip` and
// `user` stand in for the two limiter instances; the factory routes by prefix.
const h = vi.hoisted(() => ({
  ipLimit: vi.fn(),
  userLimit: vi.fn(),
  resetUsedTokens: vi.fn(),
  redisCtor: vi.fn(),
}));

vi.mock("@upstash/redis", () => ({
  Redis: h.redisCtor,
}));

vi.mock("@upstash/ratelimit", () => {
  class Ratelimit {
    limit: typeof h.ipLimit;
    resetUsedTokens: typeof h.resetUsedTokens;
    constructor(opts: { prefix: string }) {
      this.limit = opts.prefix.includes(":ip") ? h.ipLimit : h.userLimit;
      this.resetUsedTokens = h.resetUsedTokens;
    }
    static slidingWindow(n: number, w: string) {
      return { n, w };
    }
  }
  return { Ratelimit };
});

// Fresh module + env per test (the module caches limiters and a one-time warn).
async function load(configured: boolean) {
  vi.resetModules();
  if (configured) {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token";
  } else {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  return import("@/lib/rate-limit");
}

const ok = { success: true, reset: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  h.ipLimit.mockResolvedValue(ok);
  h.userLimit.mockResolvedValue(ok);
});

afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe("checkLoginRateLimit", () => {
  it("allows when both buckets are under the limit", async () => {
    const { checkLoginRateLimit } = await load(true);
    const res = await checkLoginRateLimit("1.2.3.4", "User@Example.com");
    expect(res).toEqual({ ok: true });
  });

  it("keys the username lowercased", async () => {
    const { checkLoginRateLimit } = await load(true);
    await checkLoginRateLimit("1.2.3.4", "  User@Example.com  ");
    expect(h.userLimit).toHaveBeenCalledWith("user@example.com");
    expect(h.ipLimit).toHaveBeenCalledWith("1.2.3.4");
  });

  it("blocks when the per-username bucket is exhausted", async () => {
    const { checkLoginRateLimit } = await load(true);
    h.userLimit.mockResolvedValue({ success: false, reset: Date.now() + 30_000 });
    const res = await checkLoginRateLimit("1.2.3.4", "user@example.com");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryAfterSec).toBeGreaterThan(25);
  });

  it("blocks when the per-IP bucket is exhausted", async () => {
    const { checkLoginRateLimit } = await load(true);
    h.ipLimit.mockResolvedValue({ success: false, reset: Date.now() + 45_000 });
    const res = await checkLoginRateLimit("1.2.3.4", "user@example.com");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.retryAfterSec).toBeGreaterThan(40);
  });

  it("fails open and logs when the limiter throws", async () => {
    const { checkLoginRateLimit } = await load(true);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.ipLimit.mockRejectedValue(new Error("redis down"));
    const res = await checkLoginRateLimit("1.2.3.4", "user@example.com");
    expect(res).toEqual({ ok: true });
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("is a no-op that allows when Upstash is not configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { checkLoginRateLimit } = await load(false);
    const res = await checkLoginRateLimit("1.2.3.4", "user@example.com");
    expect(res).toEqual({ ok: true });
    expect(h.ipLimit).not.toHaveBeenCalled();
    expect(h.redisCtor).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});

describe("resetLoginRateLimit", () => {
  it("clears the per-username bucket (lowercased)", async () => {
    const { resetLoginRateLimit } = await load(true);
    await resetLoginRateLimit("User@Example.com");
    expect(h.resetUsedTokens).toHaveBeenCalledWith("user@example.com");
  });

  it("is a no-op when Upstash is not configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { resetLoginRateLimit } = await load(false);
    await resetLoginRateLimit("user@example.com");
    expect(h.resetUsedTokens).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
