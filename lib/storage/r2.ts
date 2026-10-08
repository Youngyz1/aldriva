import "server-only";

import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const MAX_OBJECT_BYTES = 10 * 1024 * 1024;

export class R2ObjectTooLargeError extends Error {
  constructor() {
    super("The uploaded object exceeds the size limit.");
    this.name = "R2ObjectTooLargeError";
  }
}
let client: S3Client | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("R2 storage is not configured.");
  return value;
}

function getClient(): S3Client {
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return client;
}

/** Final media is public by design. Temporary objects must remain private. */
export function getPublicUrl(bucket: string, key: string): string {
  if (bucket !== requiredEnv("R2_BUCKET")) {
    throw new Error("Only final media objects have public URLs.");
  }
  const base = new URL(requiredEnv("MEDIA_BASE_URL"));
  if (base.protocol !== "https:") throw new Error("The media URL must use HTTPS.");
  const prefix = base.toString().replace(/\/+$/, "");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return prefix + "/" + encodedKey;
}

export async function getUploadUrl(bucket: string, key: string, contentType: string, contentLength: number): Promise<string> {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength });
  return getSignedUrl(getClient(), command, {
    expiresIn: 300,
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}

/** Presigned private download URL. Callers should use a short expiry. */
export async function getSignedGetUrl(bucket: string, key: string, expiresIn = 120): Promise<string> {
  return getSignedUrl(getClient(), new GetObjectCommand({ Bucket: bucket, Key: key }), {
    expiresIn: Math.min(Math.max(Math.floor(expiresIn), 1), 300),
  });
}

export async function headObject(bucket: string, key: string): Promise<{ contentLength: number | null; contentType: string | null }> {
  const response = await getClient().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
  return {
    contentLength: typeof response.ContentLength === "number" ? response.ContentLength : null,
    contentType: response.ContentType ?? null,
  };
}

export async function getObject(bucket: string, key: string, maxBytes = MAX_OBJECT_BYTES): Promise<{ body: Buffer; contentLength: number; contentType: string | null }> {
  const response = await getClient().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) throw new Error("The uploaded object could not be read.");
  if (response.ContentLength !== undefined && response.ContentLength > maxBytes) {
    throw new R2ObjectTooLargeError();
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > maxBytes) throw new R2ObjectTooLargeError();
    chunks.push(buffer);
  }

  return {
    body: Buffer.concat(chunks, totalBytes),
    contentLength: totalBytes,
    contentType: response.ContentType ?? null,
  };
}

export async function putObject(bucket: string, key: string, body: Buffer, contentType: string, cacheControl?: string): Promise<void> {
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentLength: body.byteLength,
    ContentType: contentType,
    ...(cacheControl ? { CacheControl: cacheControl } : {}),
  }));
}

export async function deleteObject(bucket: string, key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
