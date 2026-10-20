import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Brute-force protection for the login action. Dual-key sliding window: one
// bucket per source IP, one per username — an attacker is throttled whether
// they spray many accounts from one IP or hammer one account from many IPs.
//
// Env-gated and lazy: the limiters are only built when both Upstash vars are
// present. Without them (local dev, CI, prod before setup) every check is a
// no-op that allows the request, so login keeps working. On any internal error
// we fail OPEN — a flaky Redis must never lock everyone out of the app.

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

type Limiters = { ip: Ratelimit; user: Ratelimit; signupIp: Ratelimit };

let cached: Limiters | null = null;
let warned = false;

function getLimiters(): Limiters | null {
  if (cached) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!warned) {
      warned = true;
      console.warn(
        "[rate-limit] UPSTASH_REDIS_REST_URL/TOKEN not set — login rate limiting is disabled.",
      );
    }
    return null;
  }

  const redis = new Redis({ url, token });
  cached = {
    ip: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "10 m"),
      prefix: "rl:login:ip",
    }),
    user: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "15 m"),
      prefix: "rl:login:user",
    }),
    // Public signup is unauthenticated — throttle account creation per source IP
    // so it can't be scripted to spam agencies/logo uploads.
    signupIp: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "60 m"),
      prefix: "rl:signup:ip",
    }),
  };
  return cached;
}

// Usernames are keyed lowercased so case variants share one bucket.
const userKey = (username: string) => username.trim().toLowerCase();

const secondsUntil = (reset: number) =>
  Math.max(1, Math.ceil((reset - Date.now()) / 1000));

export async function checkLoginRateLimit(
  ip: string | undefined,
  username: string,
): Promise<RateLimitResult> {
  const limiters = getLimiters();
  if (!limiters) return { ok: true };

  try {
    const [ipRes, userRes] = await Promise.all([
      limiters.ip.limit(ip || "unknown"),
      limiters.user.limit(userKey(username)),
    ]);

    if (!ipRes.success || !userRes.success) {
      // Block on whichever bucket frees up last.
      const reset = Math.max(
        ipRes.success ? 0 : ipRes.reset,
        userRes.success ? 0 : userRes.reset,
      );
      return { ok: false, retryAfterSec: secondsUntil(reset) };
    }

    return { ok: true };
  } catch (error) {
    // Fail open: never let a rate-limiter outage block legitimate logins.
    console.error("[rate-limit] check failed, allowing request:", error);
    return { ok: true };
  }
}

// Per-IP throttle for the public signup surface (the signup action and its
// logo-upload endpoint). Fails open on missing config or Redis errors, like the
// login limiter.
export async function checkSignupRateLimit(
  ip: string | undefined,
): Promise<RateLimitResult> {
  const limiters = getLimiters();
  if (!limiters) return { ok: true };

  try {
    const res = await limiters.signupIp.limit(ip || "unknown");
    if (!res.success) {
      return { ok: false, retryAfterSec: secondsUntil(res.reset) };
    }
    return { ok: true };
  } catch (error) {
    console.error("[rate-limit] signup check failed, allowing request:", error);
    return { ok: true };
  }
}

// Clear the per-user bucket after a successful login so a user who finally gets
// their password right isn't penalized by earlier failures. Best-effort.
export async function resetLoginRateLimit(username: string): Promise<void> {
  const limiters = getLimiters();
  if (!limiters) return;
  try {
    await limiters.user.resetUsedTokens(userKey(username));
  } catch (error) {
    console.error("[rate-limit] reset failed:", error);
  }
}
