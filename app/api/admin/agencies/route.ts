import { NextResponse } from "next/server";

import { requireSuperAdminApi } from "@/lib/api/auth-guard";
import { getAgencies } from "@/lib/data/agency";

// GET only — the list read that backs the client useQuery (and server prefetch).
// Agency create now lives in actions/agencies.ts (createAgency).
export async function GET() {
  const guard = await requireSuperAdminApi();
  if (!guard.ok) return guard.response;

  try {
    const agencies = await getAgencies();
    return NextResponse.json(agencies);
  } catch (error) {
    console.error("[AGENCIES_LIST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
