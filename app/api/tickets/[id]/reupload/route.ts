import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getTicketScope, isAgencyExpired } from "@/lib/auth";
import { uploadToBunny, deleteBunnyFile } from "@/lib/tickets/bunny";
import { MAX_FILE_SIZE } from "@/lib/tickets/upload-constants";
import {
  fetchTempUpload,
  removeTempUpload,
  TempUploadError,
} from "@/lib/tickets/temp-upload";
import { triggerExtraction } from "@/lib/tickets/trigger-extraction";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: ticketId } = await params;
    const { agencyId, isSuperAdmin } = await getTicketScope();

    const where: Prisma.TicketWhereInput = { id: ticketId };
    if (!isSuperAdmin && agencyId) {
      where.agencyId = agencyId;
    }

    const ticket = await db.ticket.findFirst({
      where,
      include: { versions: { select: { versionNumber: true } } },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    let buffer: Buffer;
    let fileName: string;

    if (req.headers.get("content-type")?.includes("application/json")) {
      // Large-file finalize: the PDF was staged on Bunny by the
      // upload-ticket-pdf edge function (Vercel caps request bodies at 4.5MB).
      const body = await req.json().catch(() => null);
      fileName = typeof body?.fileName === "string" ? body.fileName : "";

      if (!fileName.toLowerCase().endsWith(".pdf")) {
        return NextResponse.json(
          { error: "Only PDF files are accepted" },
          { status: 400 }
        );
      }

      try {
        buffer = await fetchTempUpload(body?.tempPath, session.user.id);
      } catch (e) {
        if (e instanceof TempUploadError) {
          return NextResponse.json({ error: e.message }, { status: e.status });
        }
        throw e;
      }
      removeTempUpload(body.tempPath);
    } else {
      const formData = await req.formData();
      const file = formData.get("file");

      if (!file || !(file instanceof File)) {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }

      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        return NextResponse.json(
          { error: "Only PDF files are accepted" },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File size must be less than 10MB" },
          { status: 400 }
        );
      }

      buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name;
    }

    const maxVersion = Math.max(...ticket.versions.map((v) => v.versionNumber));
    const newVersionNumber = maxVersion + 1;
    const storagePath = `tickets/${ticketId}/original/v${newVersionNumber}.pdf`;

    await uploadToBunny(buffer, storagePath);

    let version;
    try {
      const result = await db.$transaction(async (tx) => {
        await tx.ticketVersion.updateMany({
          where: { ticketId },
          data: { isLatest: false },
        });

        const v = await tx.ticketVersion.create({
          data: {
            ticketId,
            versionNumber: newVersionNumber,
            isLatest: true,
            extractionStatus: "PROCESSING",
            originalFileName: fileName,
            originalStoragePath: storagePath,
            fileSize: buffer.length,
          },
        });

        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: "DRAFT" },
        });

        return v;
      });

      version = result;
    } catch (dbError) {
      console.error("[TICKETS_REUPLOAD] DB error, cleaning up Bunny file", dbError);
      await deleteBunnyFile(storagePath).catch(() => {});
      return new NextResponse("Internal Error", { status: 500 });
    }

    // Start extraction once the response is sent (see trigger-extraction.ts).
    triggerExtraction(version.id, storagePath);

    return NextResponse.json({
      ticketId,
      versionId: version.id,
      versionNumber: newVersionNumber,
      status: "PROCESSING",
    });
  } catch (error) {
    console.error("[TICKETS_REUPLOAD]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
