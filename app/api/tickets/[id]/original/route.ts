import { NextResponse } from "next/server";

import { requireTicketScopeApi } from "@/lib/api/auth-guard";
import { downloadFromBunny } from "@/lib/tickets/bunny";
import { findScopedVersion } from "@/lib/tickets/version-access";

// Original carrier PDF bytes for the maritime PDF editor, served same-origin so
// the browser's pdfjs can load it without CDN CORS concerns.
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
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        // A version's original never changes (re-uploads create a new version).
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[TICKET_ORIGINAL]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
