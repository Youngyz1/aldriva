import { supabase } from "@/lib/supabase";
import { uploadPublicFile } from "@/lib/uploads";
import {
  compressImage,
  ALLOWED_IMAGE_TYPES,
  MAX_ORIGINAL_BYTES,
} from "@/lib/imageCompression";

/**
 * The single entry point every image upload in the app should go through.
 * Flow: validate original file -> compress -> validate compressed size ->
 * upload to Supabase Storage -> return the public URL.
 *
 * Only applies to newly uploaded images. Never touches images already
 * sitting in Storage — this module has no code path that reads or rewrites
 * existing objects.
 */

export type UploadImageErrorCode =
  | "invalid_type"
  | "too_large"
  | "corrupted"
  | "compression_failed"
  | "upload_failed"
  | "network_error";

const ERROR_MESSAGES: Record<UploadImageErrorCode, string> = {
  invalid_type: "Unsupported file type. Please upload a JPEG, PNG, or WebP image.",
  too_large: "This image is too large. Please choose a file under 5MB.",
  corrupted: "This file doesn't look like a valid image. Please try a different file.",
  compression_failed: "We couldn't process this image. Please try a different file.",
  upload_failed: "The upload failed. Please try again.",
  network_error: "Upload failed due to a network problem. Check your connection and try again.",
};

export class UploadImageError extends Error {
  constructor(public readonly code: UploadImageErrorCode, message?: string, public readonly cause?: unknown) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = "UploadImageError";
  }
}

export type UploadStage = "validating" | "compressing" | "uploading";

export interface UploadImageProgress {
  stage: UploadStage;
  /** 0-100 during "compressing" (real progress from the compressor).
   * "uploading" has no byte-level progress available from the Supabase JS
   * client (it wraps fetch, which doesn't expose upload progress), so this
   * is left undefined for that stage — see docs/image-upload.md. */
  percent?: number;
}

export interface UploadImageOptions {
  /** Overwrite an existing object at the same path instead of erroring. */
  upsert?: boolean;
  onProgress?: (progress: UploadImageProgress) => void;
}

async function assertDecodableImage(file: File): Promise<void> {
  try {
    const bitmap = await createImageBitmap(file);
    bitmap.close();
  } catch (err) {
    throw new UploadImageError("corrupted", undefined, err);
  }
}

/**
 * Compresses and uploads an image, returning its public URL.
 *
 * @param file   The user-selected file (from an <input type="file"> change event, drag-drop, etc).
 * @param bucket The Supabase Storage bucket name, e.g. "profile-images".
 * @param folder Path prefix within the bucket, e.g. a user/entity id.
 *
 * @throws {UploadImageError} with a `.code` you can branch on, and a
 * human-readable `.message` safe to show directly in the UI.
 */
export async function uploadImage(
  file: File,
  bucket: string,
  folder: string,
  options: UploadImageOptions = {}
): Promise<string> {
  const { upsert, onProgress } = options;

  onProgress?.({ stage: "validating" });

  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new UploadImageError("invalid_type");
  }

  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new UploadImageError("too_large");
  }

  await assertDecodableImage(file);

  onProgress?.({ stage: "compressing", percent: 0 });

  let compressed: File;
  try {
    compressed = await compressImage(file, {
      onProgress: (percent) => onProgress?.({ stage: "compressing", percent }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "ImageCompressionError") {
      throw new UploadImageError("compression_failed", err.message, err);
    }
    throw new UploadImageError("compression_failed", undefined, err);
  }

  if (compressed.size > MAX_ORIGINAL_BYTES) {
    throw new UploadImageError(
      "too_large",
      "This image is still too large after compression. Please choose a smaller or simpler image."
    );
  }

  onProgress?.({ stage: "uploading" });

  try {
    const result = await uploadPublicFile({
      supabase,
      bucket,
      file: compressed,
      folder,
      kind: "image",
      allowedTypes: ALLOWED_IMAGE_TYPES,
      maxBytes: MAX_ORIGINAL_BYTES,
      upsert,
    });
    return result.publicUrl;
  } catch (err) {
    if (err instanceof TypeError) {
      // fetch() throws a bare TypeError ("Failed to fetch") on network-level failure
      throw new UploadImageError("network_error", undefined, err);
    }
    throw new UploadImageError(
      "upload_failed",
      err instanceof Error ? err.message : undefined,
      err
    );
  }
}
