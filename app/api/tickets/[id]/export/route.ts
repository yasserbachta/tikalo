import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { getTicketScope } from "@/lib/auth";
import { ticketDataSchema, migrateTicketData } from "@/lib/tickets/schema";
import { generateTicketPdf } from "@/lib/tickets/generate-pdf";
import { stampAgencyOnPdf, stampEditedPdf } from "@/lib/tickets/stamp-logo";
import type { PdfEditResult } from "@/lib/tickets/apply-pdf-edits";
import { parseStoredPdfEdits } from "@/lib/tickets/pdf-edits";
import { isMaritimeEditorEnabled } from "@/lib/feature-flags";
import {
  uploadToBunny,
  getBunnyUrl,
  deleteBunnyFile,
  downloadFromBunny,
} from "@/lib/tickets/bunny";

export const maxDuration = 60;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
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
          orderBy: [{ versionNumber: "desc" }],
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }

    const latestVersion = ticket.versions[0];
    if (!latestVersion) {
      return NextResponse.json({ error: "No version found" }, { status: 404 });
    }

    const rawData = latestVersion.confirmedData ?? latestVersion.extractedData;
    if (!rawData) {
      return NextResponse.json(
        { error: "No ticket data available. Extract or confirm data first." },
        { status: 400 },
      );
    }

    const migrated = migrateTicketData(rawData);
    if (!migrated) {
      return NextResponse.json(
        { error: "Could not parse ticket data." },
        { status: 400 },
      );
    }

    const parsed = ticketDataSchema.safeParse(migrated);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid ticket data", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Fetch the full agency record — the template + palette selection and all
    // branding fields live on it.
    const agency = await db.agency.findUnique({
      where: { id: ticket.agencyId },
    });

    if (!agency) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404 });
    }

    // Fetch the agency logo bytes once (the DB only stores a storage path).
    let logoBuffer: Buffer | null = null;
    if (agency.logoPath) {
      try {
        logoBuffer = await downloadFromBunny(agency.logoPath);
      } catch {
        // Logo not found — proceed without it
      }
    }

    let pdfBuffer: Buffer;
    let priceOverlay: Awaited<
      ReturnType<typeof stampAgencyOnPdf>
    >["priceOverlay"] | null = null;
    let editResult: PdfEditResult | null = null;
    if (parsed.data.type === "MARITIME" && isMaritimeEditorEnabled(agency)) {
      // Maritime PDF editor (feature flag): apply exactly the text edits the
      // agent made on the original PDF, then the co-branding footer. No
      // automatic price search — the agent typed the price over the PDF.
      const originalPdf = await downloadFromBunny(latestVersion.originalStoragePath);
      const stamped = await stampEditedPdf(originalPdf, {
        logo: logoBuffer,
        agencyName: agency.name,
        edits: parseStoredPdfEdits(latestVersion.pdfEdits),
      });
      pdfBuffer = stamped.bytes;
      editResult = stamped.edits;
    } else if (parsed.data.type === "MARITIME") {
      // Maritime tickets keep the original carrier PDF exactly as uploaded and
      // only get the agency logo + name stamped on (co-branded "GNV × AGENCY").
      const originalPdf = await downloadFromBunny(latestVersion.originalStoragePath);
      // The carrier prints its own price on the PDF; if the agency edited the
      // price we replace the printed value with theirs (resale). The original
      // printed price is whatever was first extracted from this very PDF.
      const extractedPrice =
        (latestVersion.extractedData as { price?: string | null } | null)
          ?.price ?? null;
      const stamped = await stampAgencyOnPdf(originalPdf, {
        logo: logoBuffer,
        agencyName: agency.name,
        priceOverlay: {
          originalPrice: extractedPrice,
          newPrice: parsed.data.price,
          currency: parsed.data.currency,
        },
      });
      pdfBuffer = stamped.bytes;
      priceOverlay = stamped.priceOverlay;
    } else {
      // Resolve the logo to an inline data URL for the @react-pdf template.
      let logoSrc: string | null = null;
      if (logoBuffer) {
        const ext = agency.logoPath!.split(".").pop()?.toLowerCase() ?? "png";
        const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
        logoSrc = `data:${mime};base64,${logoBuffer.toString("base64")}`;
      }
      pdfBuffer = await generateTicketPdf(parsed.data, { ...agency, logoSrc });
    }

    if (latestVersion.generatedPdfPath) {
      await deleteBunnyFile(latestVersion.generatedPdfPath).catch(() => {});
    }

    const passengerName = (parsed.data.passengers?.[0]?.name ?? "ticket")
      .trim()
      .replace(/[^a-zA-Z0-9_\-\s]/g, "")
      .replace(/\s+/g, "-");
    const storagePath = `tickets/${ticket.id}/generated/${passengerName}-${Date.now()}.pdf`;

    await Promise.all([
      uploadToBunny(pdfBuffer, storagePath),
      db.$transaction(async (tx) => {
        await tx.ticketVersion.update({
          where: { id: latestVersion.id },
          data: {
            generatedPdfPath: storagePath,
            exportedAt: new Date(),
          },
        });

        if (ticket.status === "CONFIRMED" || ticket.status === "DRAFT") {
          await tx.ticket.update({
            where: { id: ticket.id },
            data: { status: "EXPORTED" },
          });
        }
      }),
    ]);

    const url = `${getBunnyUrl(storagePath)}?t=${Date.now()}`;
    return NextResponse.json({ url, priceOverlay, editResult });
  } catch (error) {
    console.error("[TICKET_EXPORT]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
