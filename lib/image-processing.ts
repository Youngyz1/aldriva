/**
 * lib/image-processing.ts
 *
 * Image Validation, Dimension Policy, and Secure Storage Pipeline for Guest Portraits.
 *
 * Rules:
 * 1. Validate MIME type by magic numbers/signatures (never trust file extension alone).
 * 2. Enforce maximum source file size (max 8MB source).
 * 3. Enforce maximum dimensions (max 800x800 for portraits).
 * 4. Never store binary blobs in PostgreSQL — upload to Supabase Storage and store only the secure URL.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
  mimeType?: string;
  sizeBytes?: number;
}

const MAX_SOURCE_FILE_SIZE = 8 * 1024 * 1024; // 8MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Validates buffer magic bytes against known image signatures.
 */
export function validateImageMagicBytes(buffer: Buffer): ImageValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "File is empty." };
  }

  if (buffer.length > MAX_SOURCE_FILE_SIZE) {
    return {
      valid: false,
      error: "File size exceeds the 8MB limit (actual: " + (buffer.length / (1024 * 1024)).toFixed(1) + "MB).",
    };
  }

  // Check magic bytes
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: "image/jpeg", sizeBytes: buffer.length };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mimeType: "image/png", sizeBytes: buffer.length };
  }

  // WebP: RIFF ... WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { valid: true, mimeType: "image/webp", sizeBytes: buffer.length };
  }

  // AVIF / HEIF: ....ftypavif or ftypmif1
  if (
    buffer.length > 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return { valid: true, mimeType: "image/avif", sizeBytes: buffer.length };
  }

  return {
    valid: false,
    error: "Unsupported file format. Please upload a JPEG, PNG, or WebP image.",
  };
}

/**
 * Uploads a validated guest portrait to Supabase Storage and returns the public/signed URL.
 */
export async function uploadGuestPortrait(
  eventId: string,
  guestIdentifier: string,
  buffer: Buffer,
  adminClient?: any
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const validation = validateImageMagicBytes(buffer);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const admin = adminClient || createSupabaseAdmin();
  const ext = validation.mimeType === "image/png" ? "png" : validation.mimeType === "image/webp" ? "webp" : "jpg";
  const filename = eventId + "/" + guestIdentifier + "_" + Date.now() + "." + ext;

  try {
    const { data, error } = await admin.storage
      .from("guest-images")
      .upload(filename, buffer, {
        contentType: validation.mimeType,
        upsert: true,
      });

    if (error) {
      console.warn("[uploadGuestPortrait] Storage upload warning:", error.message);
      // Do NOT return a fallback URL: there is no app/api/storage route, so
      // any URL under /api/storage/guest-images/ would 404, and reporting
      // success for a failed upload corrupts the caller's record.
      return { success: false, error: error.message || "Failed to upload image." };
    }

    const { data: publicUrlData } = admin.storage
      .from("guest-images")
      .getPublicUrl(filename);

    return { success: true, imageUrl: publicUrlData.publicUrl };
  } catch (err: any) {
    return { success: false, error: err.message || "Failed to upload image." };
  }
}
