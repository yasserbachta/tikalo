import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getTicketScope, isAgencyExpired } from "@/lib/auth";
import { signUploadToken } from "@/lib/tickets/upload-token";
import { MAX_FILE_SIZE, TRIAL_UPLOAD_LIMIT } from "@/lib/tickets/upload-constants";

// Grants the browser a short-lived token to push a PDF too large for Vercel's
// body limit through the upload-ticket-pdf edge function. The actual ticket is
// created afterwards by /api/tickets/upload (or [id]/reupload) from the staged file.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (isAgencyExpired(session.user.agencyExpiry)) {
      return NextResponse.json(
        { error: "Agency upload period has expired" },
        { status: 403 },
      );
    }

    const body = await req.json().catch(() => null);
    const ticketId = typeof body?.ticketId === "string" ? body.ticketId : undefined;
    const fileName = typeof body?.fileName === "string" ? body.fileName : "";
    const fileSize = typeof body?.fileSize === "number" ? body.fileSize : 0;

    if (ticketId) {
      const { agencyId, isSuperAdmin } = await getTicketScope();
      const where: Prisma.TicketWhereInput = { id: ticketId };
      if (!isSuperAdmin && agencyId) {
        where.agencyId = agencyId;
      }
      const ticket = await db.ticket.findFirst({ where, select: { id: true } });
      if (!ticket) {
        return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      }
    } else if (!session.user.agencyId) {
      return NextResponse.json({ error: "No agency assigned" }, { status: 403 });
    } else if (session.user.agencyPlan === "TRIAL") {
      // New upload on the trial plan — refuse up front if the lifetime quota is
      // spent (the counter is incremented later, when /api/tickets/upload
      // finalizes the staged file). Reuploads (ticketId set) are exempt.
      const agency = await db.agency.findUnique({
        where: { id: session.user.agencyId },
        select: { trialUploadsUsed: true },
      });
      if ((agency?.trialUploadsUsed ?? 0) >= TRIAL_UPLOAD_LIMIT) {
        return NextResponse.json(
          {
            error: `Free trial limit reached (${TRIAL_UPLOAD_LIMIT} uploads). Upgrade to continue.`,
          },
          { status: 403 },
        );
      }
    }

    if (!fileName.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are accepted" },
        { status: 400 },
      );
    }

    if (fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size must be less than 10MB" },
        { status: 400 },
      );
    }

    const tempPath = `tmp/${session.user.id}/${uuidv4()}.pdf`;

    return NextResponse.json({
      path: tempPath,
      token: signUploadToken(tempPath),
      uploadUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/upload-ticket-pdf`,
    });
  } catch (error) {
    console.error("[TICKETS_UPLOAD_URL]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
