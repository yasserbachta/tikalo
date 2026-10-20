import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

// Integration-test data helpers. Factories mirror prisma/seed.ts: each states
// only the fields a test cares about and defaults the rest to valid values.
// All run against the disposable Docker Postgres (see docker-compose.test.yml).

export { db };

// Password every factory user shares unless overridden — matches the seed.
export const DEFAULT_PASSWORD = "123456";

// Monotonic suffix for unique columns (email/slug). Per-process counter so
// parallel files (there's only one integration worker) never collide.
let counter = 0;
export const uniq = (prefix = "x") => `${prefix}-${process.pid}-${++counter}`;

// TRUNCATE every business table for per-test isolation. Faster than dropping the
// schema, and RESTART IDENTITY + CASCADE keeps FK order irrelevant. Excludes
// Prisma's own bookkeeping table. Call in beforeEach.
export async function resetDb(): Promise<void> {
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

export function makeAgency(overrides: Partial<Prisma.AgencyCreateInput> = {}) {
  const tag = uniq("agency");
  return db.agency.create({
    data: {
      name: `Agency ${tag}`,
      email: `${tag}@example.test`,
      slug: tag,
      ...overrides,
    },
  });
}

// `password` is hashed (so the row is consistent with how auth.config reads it);
// pass a plaintext value to override the default. Everything else is a raw
// column via UncheckedCreateInput, so `agencyId` can be set directly.
export async function makeUser(
  overrides: Partial<Prisma.UserUncheckedCreateInput> & { password?: string } = {},
) {
  const tag = uniq("user");
  const { password, ...rest } = overrides;
  return db.user.create({
    data: {
      name: `User ${tag}`,
      email: `${tag}@example.test`,
      role: "AGENCY_ADMIN",
      password: await bcrypt.hash(password ?? DEFAULT_PASSWORD, 10),
      ...rest,
    },
  });
}

export function makeTicket(
  overrides: Partial<Prisma.TicketUncheckedCreateInput> & {
    agencyId: string;
    createdById: string;
  },
) {
  return db.ticket.create({
    data: {
      status: "DRAFT",
      ...overrides,
    },
  });
}

export function makeTicketVersion(
  overrides: Partial<Prisma.TicketVersionUncheckedCreateInput> & {
    ticketId: string;
  },
) {
  const tag = uniq("file");
  return db.ticketVersion.create({
    data: {
      originalFileName: `${tag}.pdf`,
      originalStoragePath: `tickets/${tag}.pdf`,
      fileSize: 1024,
      ...overrides,
    },
  });
}
