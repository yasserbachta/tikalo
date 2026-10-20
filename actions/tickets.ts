"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { scopedTicketWhere, type TicketScope } from "@/lib/data/ticket";
import { deleteBunnyFile } from "@/lib/tickets/bunny";
import { ticketDataSchemaBase, type TicketData } from "@/lib/tickets/schema";
import { pdfEditsSchema, type PdfEdit } from "@/lib/tickets/pdf-edits";

// Server Actions for ticket mutations (writes only — reads live in
// lib/data/ticket.ts). Every action re-derives the tenancy scope from the
// session and never trusts the client: an agency user can only mutate their own
// agency's tickets.
type ActionResult = { ok: true } | { ok: false; error: string };

async function resolveScope(): Promise<
  | { ok: true; scope: TicketScope; userId: string }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Unauthorized" };
  if (session.user.role === "SUPER_ADMIN") {
    return {
      ok: true,
      scope: { agencyId: null, isSuperAdmin: true },
      userId: session.user.id,
    };
  }
  if (!session.user.agencyId) return { ok: false, error: "No agency assigned" };
  return {
    ok: true,
    scope: { agencyId: session.user.agencyId, isSuperAdmin: false },
    userId: session.user.id,
  };
}

export async function deleteTicket(id: string): Promise<ActionResult> {
  const guard = await resolveScope();
  if (!guard.ok) return guard;

  const ticket = await db.ticket.findFirst({
    where: scopedTicketWhere(guard.scope, { id }),
    include: {
      versions: {
        select: { originalStoragePath: true, generatedPdfPath: true },
      },
    },
  });
  if (!ticket) return { ok: false, error: "Ticket not found" };

  // Best-effort cleanup of stored PDFs before deleting the row.
  await Promise.all(
    ticket.versions.flatMap((v) => {
      const ps: Promise<void>[] = [
        deleteBunnyFile(v.originalStoragePath).catch(() => {}),
      ];
      if (v.generatedPdfPath) {
        ps.push(deleteBunnyFile(v.generatedPdfPath).catch(() => {}));
      }
      return ps;
    }),
  );

  await db.ticket.delete({ where: { id } });

  revalidatePath("/tickets");
  return { ok: true };
}

export async function confirmTicket(id: string): Promise<ActionResult> {
  const guard = await resolveScope();
  if (!guard.ok) return guard;

  const ticket = await db.ticket.findFirst({
    where: scopedTicketWhere(guard.scope, { id }),
    include: { versions: { where: { isLatest: true }, take: 1 } },
  });
  if (!ticket) return { ok: false, error: "Ticket not found" };

  const latest = ticket.versions[0];
  if (!latest) return { ok: false, error: "No version found" };

  const dataToConfirm = latest.confirmedData ?? latest.extractedData;
  if (!dataToConfirm) {
    return { ok: false, error: "No ticket data available to confirm" };
  }

  await db.$transaction(async (tx) => {
    await tx.ticketVersion.update({
      where: { id: latest.id },
      data: {
        confirmedData: dataToConfirm,
        confirmedAt: new Date(),
        confirmedById: guard.userId,
      },
    });
    await tx.ticket.update({ where: { id }, data: { status: "CONFIRMED" } });
  });

  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
  return { ok: true };
}

export async function saveTicket(
  id: string,
  data: Partial<TicketData>,
): Promise<ActionResult> {
  const guard = await resolveScope();
  if (!guard.ok) return guard;

  const ticket = await db.ticket.findFirst({
    where: scopedTicketWhere(guard.scope, { id }),
  });
  if (!ticket) return { ok: false, error: "Ticket not found" };

  const parsed = ticketDataSchemaBase.partial().safeParse(data);
  if (!parsed.success) return { ok: false, error: "Invalid data" };

  const latest = await db.ticketVersion.findFirst({
    where: { ticketId: id, isLatest: true },
  });
  if (!latest) return { ok: false, error: "No version found" };

  const existing =
    (latest.confirmedData as Record<string, unknown>) ??
    (latest.extractedData as Record<string, unknown>) ??
    {};

  await db.ticketVersion.update({
    where: { id: latest.id },
    data: {
      confirmedData: { ...existing, ...parsed.data },
      confirmedAt: new Date(),
    },
  });

  revalidatePath(`/tickets/${id}`);
  return { ok: true };
}

// Maritime PDF editor: persist the agent's text edits on one version of the
// ticket. Stored even if the flag is later turned off (the export then simply
// ignores them), so turning it back on restores the agent's work.
export async function savePdfEdits(
  id: string,
  versionId: string,
  edits: PdfEdit[],
): Promise<ActionResult> {
  const guard = await resolveScope();
  if (!guard.ok) return guard;

  const parsed = pdfEditsSchema.safeParse(edits);
  if (!parsed.success) return { ok: false, error: "Invalid edits" };

  const ticket = await db.ticket.findFirst({
    where: scopedTicketWhere(guard.scope, { id }),
    select: { id: true },
  });
  if (!ticket) return { ok: false, error: "Ticket not found" };

  const updated = await db.ticketVersion.updateMany({
    where: { id: versionId, ticketId: id },
    data: { pdfEdits: parsed.data },
  });
  if (updated.count === 0) return { ok: false, error: "No version found" };

  revalidatePath(`/tickets/${id}`);
  return { ok: true };
}
