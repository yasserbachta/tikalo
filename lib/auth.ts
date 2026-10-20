import { auth } from "@/auth";
import { db } from "@/lib/db";

export const requireAuth = async () => {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return session;
};

export const requireSuperAdmin = async () => {
  const session = await requireAuth();
  if (session.user.role !== "SUPER_ADMIN") {
    throw new Error("Forbidden: Super admin only");
  }
  return session;
};

export const requireAgencyUser = async () => {
  const session = await requireAuth();
  if (!session.user.agencyId) {
    throw new Error("Forbidden: No agency assigned");
  }
  return session;
};

export const getCurrentAgency = async () => {
  const session = await auth();
  if (!session?.user?.agencyId) return null;
  return db.agency.findUnique({ where: { id: session.user.agencyId } });
};

// True once the agency's upload window has closed. Reads the expiry stamped on
// the JWT (epoch ms) — no DB lookup. Null expiry = never expires.
export const isAgencyExpired = (expiry?: number | null) =>
  expiry != null && Date.now() > expiry;

export const getTicketScope = async (): Promise<{
  agencyId: string | null;
  isSuperAdmin: boolean;
}> => {
  const session = await requireAuth();
  if (session.user.role === "SUPER_ADMIN") {
    return { agencyId: null, isSuperAdmin: true };
  }
  if (!session.user.agencyId) {
    throw new Error("User has no agency");
  }
  return { agencyId: session.user.agencyId, isSuperAdmin: false };
};
