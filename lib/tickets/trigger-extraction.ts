import { after } from "next/server";

// Starts the extract-ticket edge function for a freshly uploaded version.
// Must run inside `after()`: a bare un-awaited fetch in a route handler can be
// frozen with the serverless instance once the response is sent, so the
// request only went out when something else woke the instance (observed: an
// 88s delay before the edge function even booted).
export function triggerExtraction(versionId: string, storagePath: string) {
  after(async () => {
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/extract-ticket`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ versionId, storagePath }),
        },
      );
      if (!res.ok) {
        console.error(
          `[EXTRACT_TRIGGER] edge function returned ${res.status} for version ${versionId}:`,
          await res.text().catch(() => ""),
        );
      }
    } catch (error) {
      console.error(`[EXTRACT_TRIGGER] failed for version ${versionId}`, error);
    }
  });
}
