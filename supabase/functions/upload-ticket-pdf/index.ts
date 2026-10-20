import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ---------------------------------------------------------------------------
// upload-ticket-pdf — relay for PDFs too large for Vercel's 4.5MB body cap.
//
// The browser POSTs raw PDF bytes here with an HMAC token minted by the
// Next.js /api/tickets/upload-url route (see lib/tickets/upload-token.ts —
// keep the token format in sync!). We verify the token, validate the bytes,
// and PUT them to Bunny Storage at the temp path the token authorizes.
// ---------------------------------------------------------------------------

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (inlined from lib/tickets/upload-constants.ts — keep in sync!)
const TEMP_PATH_RE = /^tmp\/[^/]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-upload-token",
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function verifyUploadToken(token: string): Promise<string | null> {
  const secret = Deno.env.get("UPLOAD_TOKEN_SECRET");
  if (!secret) {
    console.error("[UPLOAD_TICKET_PDF] UPLOAD_TOKEN_SECRET is not set");
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signatureB64),
      new TextEncoder().encode(payloadB64),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(payloadB64)));
    if (typeof payload.path !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 < Date.now()) return null;
    if (!TEMP_PATH_RE.test(payload.path)) return null;
    return payload.path;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const token = req.headers.get("x-upload-token");
  if (!token) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const path = await verifyUploadToken(token);
  if (!path) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const bytes = new Uint8Array(await req.arrayBuffer());

    if (bytes.length > MAX_FILE_SIZE) {
      return jsonResponse({ error: "File size must be less than 10MB" }, 400);
    }
    const magic = new TextDecoder().decode(bytes.subarray(0, 5));
    if (magic !== "%PDF-") {
      return jsonResponse({ error: "Only PDF files are accepted" }, 400);
    }

    const zoneName = Deno.env.get("BUNNY_STORAGE_ZONE_NAME")!;
    const storageRes = await fetch(
      `https://storage.bunnycdn.com/${zoneName}/${path}`,
      {
        method: "PUT",
        headers: {
          AccessKey: Deno.env.get("BUNNY_STORAGE_API_KEY")!,
          "Content-Type": "application/octet-stream",
        },
        body: bytes,
      },
    );

    if (!storageRes.ok) {
      console.error(
        "[UPLOAD_TICKET_PDF] Bunny upload failed:",
        storageRes.status,
        await storageRes.text(),
      );
      return jsonResponse({ error: "Upload failed" }, 502);
    }

    return jsonResponse({ ok: true, path }, 200);
  } catch (error) {
    console.error("[UPLOAD_TICKET_PDF]", error);
    return jsonResponse({ error: "Upload failed" }, 500);
  }
});
