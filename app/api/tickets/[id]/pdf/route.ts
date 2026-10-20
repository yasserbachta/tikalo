import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getTicketScope } from "@/lib/auth";
import { getBunnyUrl } from "@/lib/tickets/bunny";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { agencyId, isSuperAdmin } = await getTicketScope();

    const where: Prisma.TicketWhereInput = { id };
    if (!isSuperAdmin && agencyId) {
      where.agencyId = agencyId;
    }

    const ticket = await db.ticket.findFirst({
      where,
      include: {
        versions: {
          where: { isLatest: true },
          take: 1,
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const latestVersion = ticket.versions[0];
    if (!latestVersion?.generatedPdfPath) {
      return NextResponse.json(
        { error: "No generated PDF found. Export the ticket first." },
        { status: 404 }
      );
    }

    // Redirect instead of proxying the bytes — Vercel caps response bodies at
    // 4.5MB, and the CDN URL is public (same as the export flow).
    return NextResponse.redirect(getBunnyUrl(latestVersion.generatedPdfPath), 302);
  } catch (error) {
    console.error("[TICKET_PDF_DOWNLOAD]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
