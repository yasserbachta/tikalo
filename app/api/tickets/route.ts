import { NextResponse } from "next/server";

import { requireTicketScopeApi } from "@/lib/api/auth-guard";
import { getTickets } from "@/lib/data/ticket";

export async function GET(req: Request) {
  const guard = await requireTicketScopeApi();
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || undefined;
  const status = searchParams.get("status") || undefined;
  const agencyId = searchParams.get("agencyId") || undefined;

  try {
    const tickets = await getTickets(guard.data, { search, status, agencyId });
    return NextResponse.json(tickets);
  } catch (error) {
    console.error("[TICKETS_LIST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
