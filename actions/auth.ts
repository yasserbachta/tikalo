"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { LoginSchema } from "@/lib/auth-schema";
import { checkLoginRateLimit, resetLoginRateLimit } from "@/lib/rate-limit";

type LoginResult = { ok: true } | { error: string };

// Credentials login, wrapped in brute-force protection. The rate-limit check
// runs after schema validation but BEFORE any user lookup, so it can't be used
// as an account-existence oracle (a blocked attacker learns nothing about
// whether the email exists).
export async function login(input: unknown): Promise<LoginResult> {
  const parsed = LoginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "These credentials don't match our records." };
  }
  const { email, password } = parsed.data;

  // First hop of x-forwarded-for is the client; the rest can be spoofed. Next 16:
  // headers() is async.
  const ip = (await headers())
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  const rl = await checkLoginRateLimit(ip, email);
  if (!rl.ok) {
    return { error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` };
  }

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "These credentials don't match our records." };
    }
    throw error;
  }

  // Successful sign-in clears this user's failure bucket.
  await resetLoginRateLimit(email);
  return { ok: true };
}
