import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireSuperAdminApi } from "@/lib/api/auth-guard";
import { buildPreviewPdf } from "@/lib/tickets/preview";

export const maxDuration = 60;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const bodySchema = z.object({
  template: z.enum(["CLASSIC", "EDITORIAL", "PREMIUM", "BOLD", "WALLET", "TIMELINE"]),
  paletteKey: z.string(),
  // Optional unsaved color overrides so a "custom" palette previews live.
  primaryColor: hexColor.optional(),
  secondaryColor: hexColor.optional(),
});

// Super-admin: render a sample-data preview for any agency using a (possibly
// unsaved) template + palette selection. Nothing is persisted.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireSuperAdminApi();
  if (!guard.ok) return guard.response;

  const { id } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid selection" }, { status: 400 });
  }

  const agency = await db.agency.findUnique({ where: { id } });
  if (!agency) {
    return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  }

  try {
    const pdf = await buildPreviewPdf(
      agency,
      parsed.data.template,
      parsed.data.paletteKey,
      {
        primaryColor: parsed.data.primaryColor,
        secondaryColor: parsed.data.secondaryColor,
      },
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="preview.pdf"',
      },
    });
  } catch (error) {
    console.error("[AGENCY_PREVIEW_PDF]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
