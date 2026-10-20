import { db } from "@/lib/db";
import {
  Prisma,
  TicketStatus,
  type TicketVersion as DbTicketVersion,
} from "@prisma/client";

import {
  migrateTicketData,
  getDisplayInfo,
  type TicketData,
} from "@/lib/tickets/schema";
import type { TicketListItem, TicketDetail, TicketVersion } from "@/types/tickets";
import { isMaritimeEditorEnabled } from "@/lib/feature-flags";
import { parseStoredPdfEdits } from "@/lib/tickets/pdf-edits";

// Pure data-fetch layer for tickets — the single source of truth for WHAT gets
// read. Server Components / prefetch call these directly; route handlers call
// them too (then JSON-respond). Multi-tenancy is enforced by the caller passing
// a scope resolved from the session (super-admin sees all; agency users are
// pinned to their agencyId).

export interface TicketScope {
  agencyId: string | null;
  isSuperAdmin: boolean;
}

export interface TicketListFilters {
  search?: string;
  status?: string;
  agencyId?: string;
}

// Build a tenancy-scoped `where`. An agency user can only ever match their own
// agency's rows; super-admin matches across agencies.
export function scopedTicketWhere(
  scope: TicketScope,
  extra: Prisma.TicketWhereInput = {},
): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = { ...extra };
  if (!scope.isSuperAdmin && scope.agencyId) {
    where.agencyId = scope.agencyId;
  }
  return where;
}

export async function getTickets(
  scope: TicketScope,
  filters: TicketListFilters = {},
): Promise<TicketListItem[]> {
  const where = scopedTicketWhere(scope);

  if (filters.status) {
    where.status = filters.status as TicketStatus;
  }

  // Only a super-admin may cross-filter by agency. For an agency user
  // scopedTicketWhere has already pinned agencyId to their own tenant, so we
  // never let a client-supplied agencyId override that.
  if (filters.agencyId && scope.isSuperAdmin) {
    where.agencyId = filters.agencyId;
  }

  if (filters.search) {
    const search = filters.search;
    where.OR = [
      { reference: { contains: search, mode: "insensitive" } },
      {
        versions: {
          some: {
            isLatest: true,
            OR: [
              {
                confirmedData: {
                  path: ["passengers", "0", "name"],
                  string_contains: search,
                },
              },
              {
                extractedData: {
                  path: ["passengers", "0", "name"],
                  string_contains: search,
                },
              },
              {
                confirmedData: { path: ["passengerName"], string_contains: search },
              },
              {
                extractedData: { path: ["passengerName"], string_contains: search },
              },
            ],
          },
        },
      },
    ];
  }

  const tickets = await db.ticket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      versions: { where: { isLatest: true }, take: 1 },
      agency: { select: { id: true, name: true } },
    },
  });

  return tickets.map((ticket) => {
    const latest = ticket.versions[0];
    const raw = latest?.confirmedData ?? latest?.extractedData;
    const migrated = migrateTicketData(raw);
    const info = migrated ? getDisplayInfo(migrated) : null;

    return {
      id: ticket.id,
      reference: ticket.reference,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      extractionStatus: latest?.extractionStatus ?? null,
      type: info?.type ?? null,
      passengerName: info?.passengerName ?? null,
      routeSummary: info?.routeSummary ?? null,
      departureDate: info?.departureDate ?? null,
      agency: ticket.agency
        ? { id: ticket.agency.id, name: ticket.agency.name }
        : null,
    };
  });
}

// Serialize a Prisma TicketVersion to the wire shape (dates → ISO strings, JSON
// columns typed as TicketData). Keeps server-prefetched data identical to what
// the route handler returns over HTTP.
function serializeVersion(v: DbTicketVersion): TicketVersion {
  return {
    id: v.id,
    ticketId: v.ticketId,
    versionNumber: v.versionNumber,
    isLatest: v.isLatest,
    originalFileName: v.originalFileName,
    originalStoragePath: v.originalStoragePath,
    fileSize: v.fileSize,
    extractedData: (v.extractedData as TicketData | null) ?? null,
    extractionStatus: v.extractionStatus,
    modelUsed: v.modelUsed,
    wasRetried: v.wasRetried,
    processingMs: v.processingMs,
    confirmedData: (v.confirmedData as TicketData | null) ?? null,
    pdfEdits: parseStoredPdfEdits(v.pdfEdits),
    generatedPdfPath: v.generatedPdfPath,
    exportedAt: v.exportedAt ? v.exportedAt.toISOString() : null,
    confirmedAt: v.confirmedAt ? v.confirmedAt.toISOString() : null,
    confirmedBy: v.confirmedById ?? null,
    createdAt: v.createdAt.toISOString(),
  };
}

export async function getTicketById(
  id: string,
  scope: TicketScope,
): Promise<TicketDetail | null> {
  const ticket = await db.ticket.findFirst({
    where: scopedTicketWhere(scope, { id }),
    include: {
      versions: { orderBy: { versionNumber: "desc" } },
      agency: { select: { maritimeEditorEnabled: true } },
    },
  });

  if (!ticket) return null;

  return {
    id: ticket.id,
    reference: ticket.reference,
    status: ticket.status,
    createdById: ticket.createdById,
    agencyId: ticket.agencyId,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    versions: ticket.versions.map(serializeVersion),
    maritimeEditorEnabled: isMaritimeEditorEnabled(ticket.agency),
  };
}
