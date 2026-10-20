import { zone, file as File } from "@bunny.net/storage-sdk";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";

const CDN_URL = `https://${process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME!}`;

function getStorage() {
  return zone.connect_with_accesskey(
    // @ts-expect-error - the SDK types the region as a fixed union; "de" is a valid endpoint at runtime
    "de",
    process.env.BUNNY_STORAGE_ZONE_NAME!,
    process.env.BUNNY_STORAGE_API_KEY!,
  );
}

export async function uploadToBunny(buffer: Buffer, storagePath: string): Promise<string> {
  const storage = getStorage();
  const tempPath = path.join(os.tmpdir(), `ticket-${uuidv4()}.pdf`);
  fs.writeFileSync(tempPath, buffer);
  try {
    const stream = fs.createReadStream(tempPath);
    // @ts-expect-error - the SDK's File.upload stream overload is mistyped
    await File.upload(storage, `/${storagePath}`, stream);
  } finally {
    fs.unlink(tempPath, () => {});
  }
  return getBunnyUrl(storagePath);
}

export async function downloadFromBunny(storagePath: string): Promise<Buffer> {
  const url = `${CDN_URL}/${storagePath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Bunny download failed (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

// Reads through the storage API rather than the CDN — needed for files
// written moments ago (e.g. temp uploads), where a CDN edge could serve stale.
export async function downloadFromBunnyStorage(storagePath: string): Promise<Buffer> {
  const url = `https://storage.bunnycdn.com/${process.env.BUNNY_STORAGE_ZONE_NAME!}/${storagePath}`;
  const res = await fetch(url, {
    headers: { AccessKey: process.env.BUNNY_STORAGE_API_KEY! },
  });
  if (!res.ok) throw new Error(`Bunny storage download failed (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteBunnyFile(storagePath: string): Promise<void> {
  const storage = getStorage();
  // @ts-expect-error - the SDK's File.delete is absent from its type definitions
  await File.delete(storage, `/${storagePath}`);
}

export function getBunnyUrl(storagePath: string): string {
  return `${CDN_URL}/${storagePath}`;
}
