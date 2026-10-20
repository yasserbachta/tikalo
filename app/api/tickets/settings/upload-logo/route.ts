import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

import { requireTicketScopeApi } from "@/lib/api/auth-guard";
import { uploadToBunny } from "@/lib/tickets/bunny";

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
]);

// Self-service logo upload for an agency user. Mirrors the super-admin
// upload-logo route but is scoped to authenticated agency users — it only
// produces a storage path; persisting it to the agency record happens via
// updateMyAgency, which is always scoped to the session's own agency.
export async function POST(req: Request) {
  const guard = await requireTicketScopeApi();
  if (!guard.ok) return guard.response;
  if (!guard.data.agencyId) {
    // Super-admins manage logos through the admin back office.
    return NextResponse.json({ error: "No agency assigned" }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Allowed: PNG, JPG, SVG, WEBP" },
        { status: 400 },
      );
    }

    if (file.size > MAX_LOGO_SIZE) {
      return NextResponse.json(
        { error: "Logo must be under 2MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const storagePath = `agencies/logos/${uuidv4()}.${ext}`;

    await uploadToBunny(buffer, storagePath);

    return NextResponse.json({ logoPath: storagePath });
  } catch (error) {
    console.error("[SETTINGS_LOGO_UPLOAD]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
