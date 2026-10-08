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
 * use an optional custom transport or default to Supabase Storage -> return the URL.
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
  | "storage_unavailable"
  | "network_error";

const ERROR_MESSAGES_EN: Record<UploadImageErrorCode, string> = {
  invalid_type: "Unsupported file type. Please upload a JPEG, PNG, or WebP image.",
  too_large: "This image is too large. Please choose a file that is 5 MB or smaller.",
  corrupted: "This file doesn't look like a valid image. Please try a different file.",
  compression_failed: "We couldn't process this image. Please try a different file.",
  upload_failed: "The upload failed. Please try again.",
  storage_unavailable:
    "Image storage isn't set up yet. Please try again later or contact support.",
  network_error: "Upload failed due to a network problem. Check your connection and try again.",
};

const ERROR_MESSAGES_FR: Record<UploadImageErrorCode, string> = {
  invalid_type: "Type de fichier non pris en charge. Veuillez téléverser une image JPEG, PNG ou WebP.",
  too_large: "Cette image est trop lourde. Veuillez choisir un fichier de 5 Mo ou moins.",
  corrupted: "Ce fichier ne semble pas être une image valide. Veuillez essayer un autre fichier.",
  compression_failed: "Nous n'avons pas pu traiter cette image. Veuillez essayer un autre fichier.",
  upload_failed: "Le téléversement a échoué. Veuillez réessayer.",
  storage_unavailable:
    "Le stockage d'images n'est pas encore configuré. Veuillez réessayer plus tard ou contacter le support.",
  network_error:
    "Le téléversement a échoué à cause d'un problème réseau. Vérifiez votre connexion et réessayez.",
};

/** Localized uploader copy. Storage errors never surface raw provider text. */
export function getUploadErrorMessage(code: UploadImageErrorCode, locale?: string): string {
  const resolved = (locale ?? "").toLowerCase();
  if (resolved.startsWith("fr")) return ERROR_MESSAGES_FR[code];
  return ERROR_MESSAGES_EN[code];
}

const ERROR_MESSAGES: Record<UploadImageErrorCode, string> = ERROR_MESSAGES_EN;

export class UploadImageError extends Error {
  constructor(public readonly code: UploadImageErrorCode, message?: string, public readonly cause?: unknown) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = "UploadImageError";
  }
}

export type UploadStage = "validating" | "compressing" | "uploading";

export interface UploadImageProgress {
  stage: UploadStage;
  /** 0-100 during compression and when a custom upload transport reports bytes.
   * The Supabase JS client does not expose byte-level upload progress. */
  percent?: number;
}

export interface UploadImageOptions {
  /** Overwrite an existing object at the same path instead of erroring. */
  upsert?: boolean;
  onProgress?: (progress: UploadImageProgress) => void;
  /** Optional alternate transport; validation and browser compression still run first. */
  upload?: (file: File, onProgress?: (percent: number) => void) => Promise<string>;
  /** Per-surface ceiling for the original selected file. Defaults to 5 MB. */
  maxOriginalBytes?: number;
  /** Per-surface MIME allowlist. Defaults to JPEG, PNG, and WebP. */
  allowedTypes?: readonly string[];
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
  bucket: string | null,
  folder: string,
  options: UploadImageOptions = {}
): Promise<string> {
  const {
    upsert,
    onProgress,
    upload,
    maxOriginalBytes = MAX_ORIGINAL_BYTES,
    allowedTypes = ALLOWED_IMAGE_TYPES,
  } = options;

  onProgress?.({ stage: "validating" });

  const isAllowedType =
    allowedTypes === ALLOWED_IMAGE_TYPES
      ? ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])
      : allowedTypes.includes(file.type);
  if (!isAllowedType) {
    const typeLabels: Record<string, string> = {
      "image/jpeg": "JPEG",
      "image/png": "PNG",
      "image/webp": "WebP",
      "image/avif": "AVIF",
    };
    const labels = allowedTypes.map((type) => typeLabels[type] ?? type);
    throw new UploadImageError("invalid_type", `Unsupported file type. Allowed image types: ${labels.join(", ")}.`);
  }

  if (file.size > maxOriginalBytes) {
    throw new UploadImageError(
      "too_large",
      `This image is too large. Please choose a file that is ${Math.floor(maxOriginalBytes / 1024 / 1024)} MB or smaller.`
    );
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

  if (compressed.size > maxOriginalBytes) {
    throw new UploadImageError(
      "too_large",
      "This image is still too large after compression. Please choose a smaller or simpler image."
    );
  }

  onProgress?.({ stage: "uploading" });

  try {
    if (upload) {
      return await upload(compressed, (percent) =>
        onProgress?.({ stage: "uploading", percent })
      );
    }

    if (!bucket) throw new Error("An image storage bucket is required.");

    const result = await uploadPublicFile({
      supabase,
      bucket,
      file: compressed,
      folder,
      kind: "image",
      allowedTypes,
      maxBytes: maxOriginalBytes,
      upsert,
    });
    return result.publicUrl;
  } catch (err) {
    if (err instanceof TypeError) {
      // fetch() throws a bare TypeError ("Failed to fetch") on network-level failure
      throw new UploadImageError("network_error", undefined, err);
    }
    if (err instanceof Error && /bucket[^a-z]*not found|not_found|NoSuchBucket/i.test(err.message)) {
      // The bucket was never created in this project (fresh/staging
      // environments miss hand-created media buckets). Never surface the
      // raw provider text ("Bucket not found"); the setup script
      // db/migration_158_media_buckets_setup.sql creates it.
      throw new UploadImageError("storage_unavailable", undefined, err);
    }
    if (err instanceof Error && /row-level security/i.test(err.message)) {
      // Storage RLS denial (e.g. uploading into another event's path).
      // Never surface raw policy internals; the denial itself is the signal.
      throw new UploadImageError(
        "upload_failed",
        "You don't have permission to upload this image.",
        err
      );
    }
    // Any other storage failure: generic message, raw provider text stays in
    // `cause` for server logs only — it never reaches err.message.
    throw new UploadImageError("upload_failed", undefined, err);
  }
}
