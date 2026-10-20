import { describe, it, expect, beforeEach } from "vitest";

import { revokeUserSessions, revokeAgencySessions } from "@/lib/session";
import { db, resetDb, makeAgency, makeUser } from "@/tests/db/helpers";

// Session revocation works by bumping user.tokenVersion; the jwt callback logs a
// token out when its stamped version no longer matches. These tests prove the
// real column moves — and, crucially, that the bulk variant touches only the
// target agency's users.

const versionOf = async (id: string) =>
  (await db.user.findUniqueOrThrow({ where: { id } })).tokenVersion;

beforeEach(async () => {
  await resetDb();
});

describe("revokeUserSessions", () => {
  it("increments only the target user's tokenVersion", async () => {
    const target = await makeUser();
    const bystander = await makeUser();

    await revokeUserSessions(target.id);

    expect(await versionOf(target.id)).toBe(target.tokenVersion + 1);
    expect(await versionOf(bystander.id)).toBe(bystander.tokenVersion);
  });

  it("commits the bump atomically inside a provided transaction", async () => {
    const user = await makeUser();

    await db.$transaction(async (tx) => {
      await revokeUserSessions(user.id, tx);
    });

    expect(await versionOf(user.id)).toBe(user.tokenVersion + 1);
  });

  it("rolls the bump back when its transaction throws", async () => {
    const user = await makeUser();

    await expect(
      db.$transaction(async (tx) => {
        await revokeUserSessions(user.id, tx);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    // The increment must not have committed alongside the failed work.
    expect(await versionOf(user.id)).toBe(user.tokenVersion);
  });
});

describe("revokeAgencySessions", () => {
  it("bumps every user in the agency but no one outside it", async () => {
    const agency = await makeAgency();
    const other = await makeAgency();

    const a1 = await makeUser({ agencyId: agency.id });
    const a2 = await makeUser({ agencyId: agency.id });
    const outsider = await makeUser({ agencyId: other.id });
    const unaffiliated = await makeUser();

    await revokeAgencySessions(agency.id);

    expect(await versionOf(a1.id)).toBe(a1.tokenVersion + 1);
    expect(await versionOf(a2.id)).toBe(a2.tokenVersion + 1);
    expect(await versionOf(outsider.id)).toBe(outsider.tokenVersion);
    expect(await versionOf(unaffiliated.id)).toBe(unaffiliated.tokenVersion);
  });
});
