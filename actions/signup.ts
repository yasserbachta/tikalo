"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";

import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { SignupSchema } from "@/lib/auth-schema";
import { checkSignupRateLimit } from "@/lib/rate-limit";

type SignupResult = { ok: true } | { ok: false; error: string };

// Turn an agency name into a URL-safe base slug: lowercase, punctuation/spaces →
// hyphens, stray hyphens trimmed. Mirrors the slugify used in actions/agencies.ts
// and the admin new-agency form.
function baseSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Find the first free slug: `base`, then `base-2`, `base-3`, … Fed a slug that
// may be empty (name had no alphanumerics) — falls back to "agency".
async function uniqueSlug(name: string): Promise<string> {
  const base = baseSlug(name) || "agency";
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const taken = await db.agency.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
}

// Self-service signup: creates a TRIAL agency and its first AGENCY_ADMIN user,
// then signs the browser in. Unauthenticated + public, so it's IP rate-limited
// and never trusts the client. The email is used for both the agency and the
// login user (each unique in its own table).
export async function signupAgency(input: unknown): Promise<SignupResult> {
  const parsed = SignupSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Invalid details" };
  }
  const { name, email, password } = parsed.data;

  // First hop of x-forwarded-for is the client; the rest can be spoofed.
  const ip = (await headers())
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();

  const rl = await checkSignupRateLimit(ip);
  if (!rl.ok) {
    return { ok: false, error: `Too many attempts. Try again in ${rl.retryAfterSec}s.` };
  }

  const [existingAgency, existingUser] = await Promise.all([
    db.agency.findFirst({ where: { email }, select: { id: true } }),
    db.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  if (existingAgency || existingUser) {
    return { ok: false, error: "An account with this email already exists." };
  }

  const slug = await uniqueSlug(name);
  const hashedPassword = await bcrypt.hash(password, 10);

  await db.$transaction(async (tx) => {
    const agency = await tx.agency.create({
      data: {
        name,
        email,
        slug,
        plan: "TRIAL",
        trialUploadsUsed: 0,
      },
    });
    await tx.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: "AGENCY_ADMIN",
        agencyId: agency.id,
      },
    });
  });

  try {
    await signIn("credentials", { email, password, redirect: false });
  } catch (error) {
    // The account exists — the user can just log in. Surface a soft error rather
    // than a 500 if the immediate sign-in hiccups.
    if (error instanceof AuthError) {
      return { ok: false, error: "Account created — please sign in." };
    }
    throw error;
  }

  return { ok: true };
}
