import "server-only";
import crypto from "crypto";

const TOKEN_TTL_SECONDS = 15 * 60;

// Mints the HMAC token that authorizes the browser to push a large PDF
// through the upload-ticket-pdf edge function (which holds the verify side —
// keep the format in sync with supabase/functions/upload-ticket-pdf/index.ts).
export function signUploadToken(path: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      path,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", process.env.UPLOAD_TOKEN_SECRET!)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}
