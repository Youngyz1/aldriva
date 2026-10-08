import "server-only";

import { deleteObject, getSignedGetUrl, getUploadUrl, headObject } from "@/lib/storage/r2";

export type PrivateMediaVerification = {
  key: string;
  expectedBytes: number;
  maxBytes: number;
  extensionMimeTypes: Readonly<Record<string, readonly string[]>>;
};

function privateBucket(): string {
  const bucket = process.env.R2_PRIVATE_BUCKET;
  if (!bucket || bucket === process.env.R2_BUCKET || bucket === process.env.R2_TMP_BUCKET) {
    throw new Error("Private R2 storage must use a separate bucket.");
  }
  return bucket;
}

export async function getPrivateMediaPutUrl(
  key: string,
  contentType: string,
  contentLength: number
): Promise<string> {
  return getUploadUrl(privateBucket(), key, contentType, contentLength);
}

export async function getPrivateMediaSignedGetUrl(key: string, ttlSeconds = 120): Promise<string> {
  return getSignedGetUrl(privateBucket(), key, ttlSeconds);
}

/** HEAD verification for private files; this path deliberately has no image decoder. */
export async function verifyPrivateMediaObject({
  key,
  expectedBytes,
  maxBytes,
  extensionMimeTypes,
}: PrivateMediaVerification): Promise<{ size: number; contentType: string; extension: string } | null> {
  const match = /\.([a-z0-9]+)$/i.exec(key);
  const extension = match ? `.${match[1].toLowerCase()}` : "";
  const allowedTypes = extensionMimeTypes[extension] ?? extensionMimeTypes[extension.slice(1)];
  if (!allowedTypes?.length) return null;

  const head = await headObject(privateBucket(), key);
  if (
    head.contentLength === null || head.contentLength < 1 || head.contentLength > maxBytes ||
    head.contentLength !== expectedBytes || !head.contentType || !allowedTypes.includes(head.contentType)
  ) return null;

  return { size: head.contentLength, contentType: head.contentType, extension };
}

export async function deletePrivateMediaObject(key: string): Promise<void> {
  await deleteObject(privateBucket(), key);
}
