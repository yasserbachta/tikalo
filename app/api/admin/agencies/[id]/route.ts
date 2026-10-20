import { NextResponse } from "next/server";

import { requireSuperAdminApi } from "@/lib/api/auth-guard";
import { getAgencyById } from "@/lib/data/agency";

// GET only — the detail read that backs the client useQuery. The update/delete
// mutations now live in actions/agencies.ts (updateAgency, deleteAgency).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const agency = await getAgencyById(id);
    if (!agency) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }
    return NextResponse.json(agency);
  } catch (error) {
    console.error("[AGENCY_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
