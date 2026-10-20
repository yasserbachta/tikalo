import { db } from "@/lib/db";

// Pure data-fetch layer for the super-admin Agencies back-office. Operator-only
// surface, so no agency scoping (super-admin crosses agencies). Reads only —
// writes live in actions/agencies.ts.

export async function getAgencies() {
  return db.agency.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { users: true, tickets: true } },
    },
  });
}

export async function getAgencyById(id: string) {
  return db.agency.findUnique({
    where: { id },
    include: {
      _count: { select: { tickets: true } },
    },
  });
}

export type AgencyListItem = Awaited<ReturnType<typeof getAgencies>>[number];
export type AgencyDetail = NonNullable<Awaited<ReturnType<typeof getAgencyById>>>;
