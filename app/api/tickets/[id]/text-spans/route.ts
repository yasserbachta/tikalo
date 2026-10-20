import { NextResponse } from "next/server";

import { requireTicketScopeApi } from "@/lib/api/auth-guard";
import { downloadFromBunny } from "@/lib/tickets/bunny";
import { readTextSpans } from "@/lib/tickets/pdf-spans";
import { findScopedVersion } from "@/lib/tickets/version-access";

// Scanned pages go through OCR (seconds per page).
export const maxDuration = 60;

// Editable text spans of the original carrier PDF, for the maritime PDF
// editor. Read server-side with the same unpdf/OCR stack the export uses, so
// the geometry the agent edits is exactly what the export draws from.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireTicketScopeApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const versionId = new URL(req.url).searchParams.get("versionId");

  try {
    const version = await findScopedVersion(id, guard.data, versionId);
    if (!version) {
      return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    }
    const bytes = await downloadFromBunny(version.originalStoragePath);
    const pages = await readTextSpans(bytes);
    return NextResponse.json(
      { pages },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch (error) {
    console.error("[TICKET_TEXT_SPANS]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
