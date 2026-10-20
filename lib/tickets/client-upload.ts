import { DIRECT_UPLOAD_LIMIT } from "@/lib/tickets/upload-constants";

async function postAndThrow(url: string, init: RequestInit) {
  const res = await fetch(url, { method: "POST", ...init });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || "Upload failed");
  }
  return res.json();
}

// Uploads a ticket PDF, routing around Vercel's 4.5MB request-body cap:
// small files go straight to the API route as before; larger ones are staged
// on Bunny via the upload-ticket-pdf edge function, then finalized with JSON.
export async function uploadTicketPdf(
  file: File,
  opts?: { ticketId?: string },
) {
  const finalizeUrl = opts?.ticketId
    ? `/api/tickets/${opts.ticketId}/reupload`
    : "/api/tickets/upload";

  if (file.size <= DIRECT_UPLOAD_LIMIT) {
    const formData = new FormData();
    formData.append("file", file);
    return postAndThrow(finalizeUrl, { body: formData });
  }

  const { path, token, uploadUrl } = await postAndThrow(
    "/api/tickets/upload-url",
    {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticketId: opts?.ticketId,
        fileName: file.name,
        fileSize: file.size,
      }),
    },
  );

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const stageRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${anonKey}`,
      apikey: anonKey,
      "x-upload-token": token,
      "Content-Type": "application/pdf",
    },
    body: file,
  });
  if (!stageRes.ok) {
    const data = await stageRes.json().catch(() => null);
    throw new Error(data?.error || "Upload failed");
  }

  return postAndThrow(finalizeUrl, {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tempPath: path, fileName: file.name }),
  });
}
