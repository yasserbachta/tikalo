import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { isAgencyExpired } from "@/lib/auth";
import { uploadToBunny, deleteBunnyFile } from "@/lib/tickets/bunny";
import { MAX_FILE_SIZE, TRIAL_UPLOAD_LIMIT } from "@/lib/tickets/upload-constants";
import {
  fetchTempUpload,
  removeTempUpload,
  TempUploadError,
} from "@/lib/tickets/temp-upload";
import { triggerExtraction } from "@/lib/tickets/trigger-extraction";

const TRIAL_LIMIT_MESSAGE = `Free trial limit reached (${TRIAL_UPLOAD_LIMIT} uploads). Upgrade to continue.`;

// Thrown inside the upload transaction when the atomic trial-quota guard fails,
// so the ticket/version inserts roll back with it.
class TrialLimitError extends Error {}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    if (!session.user.agencyId) {
      return NextResponse.json({ error: "No agency assigned" }, { status: 403 });
    }

    if (isAgencyExpired(session.user.agencyExpiry)) {
      return NextResponse.json(
        { error: "Agency upload period has expired" },
        { status: 403 },
      );
    }

    // Free-trial cap: block before touching Bunny if the lifetime quota is spent.
    // The authoritative, race-safe increment happens inside the transaction below.
    if (session.user.agencyPlan === "TRIAL") {
      const agency = await db.agency.findUnique({
        where: { id: session.user.agencyId },
        select: { trialUploadsUsed: true },
      });
      if ((agency?.trialUploadsUsed ?? 0) >= TRIAL_UPLOAD_LIMIT) {
        return NextResponse.json({ error: TRIAL_LIMIT_MESSAGE }, { status: 403 });
      }
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
          { status: 400 },
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
          { status: 400 },
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: "File size must be less than 10MB" },
          { status: 400 },
        );
      }

      buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name;
    }

    const ticketId = uuidv4();
    const storagePath = `tickets/${ticketId}/original/v1.pdf`;

    await uploadToBunny(buffer, storagePath);

    let ticket;
    let version;
    try {
      const result = await db.$transaction(async (tx) => {
        const t = await tx.ticket.create({
          data: {
            id: ticketId,
            status: "DRAFT",
            createdById: session.user.id!,
            agencyId: session.user.agencyId!,
          },
        });

        const v = await tx.ticketVersion.create({
          data: {
            ticketId: t.id,
            versionNumber: 1,
            isLatest: true,
            extractionStatus: "PROCESSING",
            originalFileName: fileName,
            originalStoragePath: storagePath,
            fileSize: buffer.length,
          },
        });

        // Atomic trial-quota guard: only increments when the row is still TRIAL
        // and under the cap, so two concurrent uploads can't both slip past the
        // 10th. A zero match means the quota is spent — roll the whole insert back.
        if (session.user.agencyPlan === "TRIAL") {
          const inc = await tx.agency.updateMany({
            where: {
              id: session.user.agencyId!,
              plan: "TRIAL",
              trialUploadsUsed: { lt: TRIAL_UPLOAD_LIMIT },
            },
            data: { trialUploadsUsed: { increment: 1 } },
          });
          if (inc.count === 0) throw new TrialLimitError();
        }

        return { ticket: t, version: v };
      });

      ticket = result.ticket;
      version = result.version;
    } catch (dbError) {
      await deleteBunnyFile(storagePath).catch(() => {});
      if (dbError instanceof TrialLimitError) {
        return NextResponse.json({ error: TRIAL_LIMIT_MESSAGE }, { status: 403 });
      }
      console.error("[TICKETS_UPLOAD] DB error, cleaning up Bunny file", dbError);
      return new NextResponse("Internal Error", { status: 500 });
    }

    // Start extraction once the response is sent (see trigger-extraction.ts).
    triggerExtraction(version.id, storagePath);

    return NextResponse.json({
      ticketId: ticket.id,
      versionId: version.id,
      status: "PROCESSING",
    });
  } catch (error) {
    console.error("[TICKETS_UPLOAD]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
