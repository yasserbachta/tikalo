import "server-only";

import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

// Server-side session revocation. The jwt callback (auth.ts) stamps the user's
// tokenVersion onto every token and re-checks it on a 5-minute window; bumping
// the column here invalidates all of that user's outstanding tokens on their
// next revalidation. Call this whenever a credential or privilege changes.
//
// Pass `tx` to run inside an existing Prisma transaction so the bump commits
// atomically with the change that triggered it.

export async function revokeUserSessions(
  userId: string,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? db;
  await client.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}

// Bulk variant: revoke every user belonging to an agency (e.g. on suspension or
// expiry change) in a single statement.
export async function revokeAgencySessions(
  agencyId: string,
  tx?: Prisma.TransactionClient,
) {
  const client = tx ?? db;
  await client.user.updateMany({
    where: { agencyId },
    data: { tokenVersion: { increment: 1 } },
  });
}
