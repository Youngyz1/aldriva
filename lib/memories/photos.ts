import "server-only";
/**
 * lib/memories/photos.ts
 *
 * Guest photo pipeline — Round 4.
 *
 * - Magic-byte validation (never trust the declared MIME).
 * - 15 MB cap, enforced at URL issuance AND at finalize (HEAD/stat).
 * - HEIC/HEIF → JPEG conversion (heic-convert).
 * - EXIF/GPS stripping + orientation applied (sharp re-encode; sharp never
 *   carries metadata forward unless withMetadata() is called, which we
 *   never do here).
 * - Final objects land outside the `pending/` namespace and are served
 *   only via short-lived signed URLs.
 */

import { createHash, randomBytes } from "node:crypto";
import sharp from "sharp";
import {
  detectPhotoKind,
  enforceMaxPixels,
  HEIC_CONVERT_TIMEOUT_MS,
  MEMORY_MAX_BYTES,
  MEMORY_MAX_PIXELS,
  MEMORY_MAX_PIXELS_HEIC,
  readHeicDimensions,
  withTimeout,
} from "@/lib/memories/photo-format";
import {
  getMemoryStorageDriver,
  isMemoryKeyForEvent,
  memoryObjectKey,
  type MemoryStorageDriver,
} from "@/lib/memories/storage";

export interface FinalizedPhoto {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/**
 * Finalizes a guest upload: validates, converts, strips metadata, moves
 * the object out of `pending/` and deletes the pending original.
 * The photo kind is sniffed from magic bytes — no caller-supplied MIME is
 * accepted or trusted at any point. Throws on validation failure
 * (caller maps to 4xx).
 */
export async function finalizeMemoryPhoto(options: {
  driver?: MemoryStorageDriver;
  eventId: string;
  pendingKey: string;
}): Promise<FinalizedPhoto> {
  const { eventId, pendingKey } = options;
  const driver = options.driver ?? getMemoryStorageDriver();

  if (!isMemoryKeyForEvent(pendingKey, eventId) || !pendingKey.includes("/pending/")) {
    throw new Error("Upload key does not belong to this event.");
  }

  const stat = await driver.stat(pendingKey);
  if (!stat || stat.size < 1 || stat.size > MEMORY_MAX_BYTES) {
    throw new Error("Uploaded file is missing or exceeds the 15 MB limit.");
  }

  const { body } = await driver.getBytes(pendingKey, MEMORY_MAX_BYTES);
  const kind = detectPhotoKind(body);
  if (!kind) {
    await driver.delete(pendingKey).catch(() => {});
    throw new Error("File content is not a supported photo.");
  }

  let pixels: Buffer = body;
  let contentType: string =
    kind === "jpeg" ? "image/jpeg" : kind === "png" ? "image/png" : kind === "webp" ? "image/webp" : "image/jpeg";
  if (kind === "heic") {
    // iPhone originals: read dimensions from the container header BEFORE
    // paying for a full decode (decompression-bomb guard). An unreadable
    // header rejects the file outright — there is no silent fallback to a
    // higher cap for HEIC.
    const headerDims = readHeicDimensions(body);
    if (!headerDims) {
      await driver.delete(pendingKey).catch(() => {});
      throw new Error("This HEIC photo could not be verified. Try JPEG or PNG instead.");
    }
    try {
      enforceMaxPixels(headerDims.width, headerDims.height, MEMORY_MAX_PIXELS_HEIC);
    } catch {
      await driver.delete(pendingKey).catch(() => {});
      throw new Error("Photo exceeds the 30 megapixel limit.");
    }
    // Decode to JPEG inside a hard budget. On timeout or failure the
    // pending object is removed and the upload is rejected cleanly —
    // the route maps this to 422, never a 500 leak.
    try {
      const convert = (await import("heic-convert")).default;
      const jpeg = await withTimeout(
        convert({ buffer: body, format: "JPEG", quality: 0.9 }),
        HEIC_CONVERT_TIMEOUT_MS,
        "HEIC conversion"
      );
      pixels = Buffer.from(jpeg);
    } catch {
      await driver.delete(pendingKey).catch(() => {});
      throw new Error("This HEIC photo could not be processed. Try JPEG or PNG instead.");
    }
    contentType = "image/jpeg";
  }

  // Re-encode through sharp: applies EXIF orientation, drops ALL metadata
  // (GPS included — withMetadata() is never called), bounds dimensions.
  // limitInputPixels is the decode-time bomb guard for JPEG/PNG/WebP.
  const image = sharp(pixels, { failOn: "none", limitInputPixels: MEMORY_MAX_PIXELS }).rotate().resize({
    width: 2400,
    height: 2400,
    fit: "inside",
    withoutEnlargement: true,
  });
  let processed: { data: Buffer; info: { width?: number; height?: number } };
  try {
    if (contentType === "image/png") {
      processed = await image.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true });
    } else if (contentType === "image/webp") {
      processed = await image.webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    } else {
      processed = await image.jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
      contentType = "image/jpeg";
    }
  } catch (err) {
    await driver.delete(pendingKey).catch(() => {});
    if (err instanceof Error && /pixel/i.test(err.message)) {
      // The applicable policy cap, not the layer that fired: a HEIC with
      // lying header dims is still a 30 MP file.
      throw new Error(
        kind === "heic" ? "Photo exceeds the 30 megapixel limit." : "Photo exceeds the 50 megapixel limit."
      );
    }
    throw new Error("Photo could not be processed.");
  }

  // Second layer: explicit pixel-cap check on the decoded result —
  // 30 MP for HEIC-derived pixels, 50 MP for native decodes.
  const pixelCap = kind === "heic" ? MEMORY_MAX_PIXELS_HEIC : MEMORY_MAX_PIXELS;
  try {
    enforceMaxPixels(processed.info.width, processed.info.height, pixelCap);
  } catch (err) {
    await driver.delete(pendingKey).catch(() => {});
    throw err instanceof Error ? err : new Error("Photo exceeds the pixel limit.");
  }

  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const finalKey = memoryObjectKey(eventId, `${randomBytes(16).toString("hex")}.${extension}`);
  await driver.putBytes(finalKey, processed.data, contentType);
  await driver.delete(pendingKey).catch(() => {});

  return {
    objectKey: finalKey,
    contentType,
    sizeBytes: processed.data.byteLength,
    width: processed.info.width || null,
    height: processed.info.height || null,
  };
}

/** Unguessable uploader delete credential (returned once at upload). */
export function generatePhotoDeleteToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hex of the delete token — the only form ever persisted. */
export function hashPhotoDeleteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
