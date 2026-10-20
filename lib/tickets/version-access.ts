import { db } from "@/lib/db";
import { scopedTicketWhere, type TicketScope } from "@/lib/data/ticket";

/**
 * Tenancy-scoped version lookup for the maritime editor routes: the given
 * version of a ticket the caller may see (latest when versionId is absent).
 */
export async function findScopedVersion(
  ticketId: string,
  scope: TicketScope,
  versionId: string | null,
) {
  const ticket = await db.ticket.findFirst({
    where: scopedTicketWhere(scope, { id: ticketId }),
    select: { id: true },
  });
  if (!ticket) return null;
  return db.ticketVersion.findFirst({
    where: versionId
      ? { id: versionId, ticketId }
      : { ticketId, isLatest: true },
  });
}
