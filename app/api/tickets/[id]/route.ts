import { NextResponse } from "next/server";

import { requireTicketScopeApi } from "@/lib/api/auth-guard";
import { getTicketById } from "@/lib/data/ticket";

// GET only — the detail read that backs the client useQuery (and server
// prefetch). The DELETE mutation now lives in actions/tickets.ts (deleteTicket).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireTicketScopeApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  try {
    const ticket = await getTicketById(id, guard.data);
    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    return NextResponse.json(ticket);
  } catch (error) {
    console.error("[TICKET_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
