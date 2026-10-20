import "server-only";
import { downloadFromBunnyStorage, deleteBunnyFile } from "@/lib/tickets/bunny";
import { MAX_FILE_SIZE } from "@/lib/tickets/upload-constants";

const TEMP_PATH_RE = /^tmp\/[^/]+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/;

export class TempUploadError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Retrieves a large-file upload staged on Bunny by the upload-ticket-pdf edge
// function. The path must be one we issued to this user (tmp/{userId}/{uuid});
// the bytes are re-validated regardless of what the edge function checked.
export async function fetchTempUpload(tempPath: unknown, userId: string): Promise<Buffer> {
  if (
    typeof tempPath !== "string" ||
    !TEMP_PATH_RE.test(tempPath) ||
    !tempPath.startsWith(`tmp/${userId}/`)
  ) {
    throw new TempUploadError("No file provided", 400);
  }

  let buffer: Buffer;
  try {
    buffer = await downloadFromBunnyStorage(tempPath);
  } catch {
    throw new TempUploadError("No file provided", 400);
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new TempUploadError("File size must be less than 10MB", 400);
  }
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new TempUploadError("Only PDF files are accepted", 400);
  }

  return buffer;
}

export function removeTempUpload(tempPath: string): void {
  deleteBunnyFile(tempPath).catch(() => {});
}
