import { NextResponse } from "next/server";

import { auth } from "@/auth";

// Route-handler tenancy guards. Every app/api/** read handler calls one of
// these instead of throwing-and-remapping per route. They distinguish 401 (no
// session) from 403 (wrong role) and, for scoped reads, hand back the session's
// agencyId + isSuperAdmin so the query is scoped server-side (an agency user can
// never read another agency's rows).
type Guarded<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

const unauthenticated = (): NextResponse =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const forbidden = (): NextResponse =>
  NextResponse.json({ error: "Forbidden" }, { status: 403 });

/// Any authenticated user.
export async function requireUserApi(): Promise<Guarded<{ userId: string }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, response: unauthenticated() };
  return { ok: true, data: { userId: session.user.id } };
}

/// Super-admin-only endpoints (cross-agency back office).
export async function requireSuperAdminApi(): Promise<
  Guarded<{ userId: string }>
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, response: unauthenticated() };
  if (session.user.role !== "SUPER_ADMIN") {
    return { ok: false, response: forbidden() };
  }
  return { ok: true, data: { userId: session.user.id } };
}

/// Ticket reads: super-admin crosses agencies (agencyId null), everyone else is
/// scoped to their own agency. Mirrors lib/auth.getTicketScope without throwing.
export async function requireTicketScopeApi(): Promise<
  Guarded<{ userId: string; agencyId: string | null; isSuperAdmin: boolean }>
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, response: unauthenticated() };

  if (session.user.role === "SUPER_ADMIN") {
    return {
      ok: true,
      data: { userId: session.user.id, agencyId: null, isSuperAdmin: true },
    };
  }
  if (!session.user.agencyId) return { ok: false, response: forbidden() };
  return {
    ok: true,
    data: {
      userId: session.user.id,
      agencyId: session.user.agencyId,
      isSuperAdmin: false,
    },
  };
}
