import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireSuperAdmin } from "@/lib/auth";
import { uploadToBunny } from "@/lib/tickets/bunny";

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
]);

export async function POST(req: Request) {
  try {
    await requireSuperAdmin();

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: "Allowed: PNG, JPG, SVG, WEBP" },
        { status: 400 }
      );
    }

    if (file.size > MAX_LOGO_SIZE) {
      return NextResponse.json(
        { error: "Logo must be under 2MB" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const storagePath = `agencies/logos/${uuidv4()}.${ext}`;

    await uploadToBunny(buffer, storagePath);

    return NextResponse.json({ logoPath: storagePath });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" ||
        error.message.includes("Forbidden"))
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: error.message === "Unauthorized" ? 401 : 403 }
      );
    }
    console.error("[AGENCY_LOGO_UPLOAD]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
