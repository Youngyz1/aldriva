import imageCompression from "browser-image-compression";

/**
 * Shared image-compression settings. Every image upload in the app should
 * compress through this module before reaching lib/uploadImage.ts, so there
 * is exactly one place that defines "how big/how compressed" an uploaded
 * image is allowed to be.
 */

/** Ceiling for the file the user actually selects, before compression. */
export const MAX_ORIGINAL_BYTES = 5 * 1024 * 1024; // 5MB

/** Target ceiling we ask the compressor to aim for (compresses to ~0.5-1MB
 * for typical photos; browser-image-compression treats this as an upper
 * bound it iterates toward, not a guaranteed exact size). */
export const TARGET_COMPRESSED_MB = 1;

/** Longest edge (width or height) an uploaded image is resized to. */
export const MAX_DIMENSION_PX = 1920;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

export class ImageCompressionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "ImageCompressionError";
  }
}

export interface CompressImageOptions {
  /** Reports compression progress (0-100). browser-image-compression drives
   * this internally; it only covers the compression phase, not any later
   * network upload. */
  onProgress?: (percent: number) => void;
}

/**
 * Compresses an image file client-side, off the main thread.
 *
 * - Resizes so neither dimension exceeds MAX_DIMENSION_PX, preserving aspect ratio.
 * - Targets ~TARGET_COMPRESSED_MB output size.
 * - Runs in a Web Worker (useWebWorker: true) so large images don't block the UI.
 * - Applies EXIF orientation during compression (browser-image-compression reads
 *   the orientation tag and rotates the canvas accordingly), so the output is
 *   already right-side-up; the EXIF tag itself does not need to survive.
 * - Keeps the original MIME type (no forced format conversion).
 *
 * Only meaningful in a browser (needs File/Canvas/Worker support) — do not
 * call this from server-side code.
 */
export async function compressImage(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  try {
    return await imageCompression(file, {
      maxSizeMB: TARGET_COMPRESSED_MB,
      maxWidthOrHeight: MAX_DIMENSION_PX,
      useWebWorker: true,
      preserveExif: false, // orientation is already baked into the pixels; no need to keep the tag
      onProgress: options.onProgress,
    });
  } catch (err) {
    throw new ImageCompressionError(
      "Could not compress this image. It may be corrupted or in an unsupported format.",
      err
    );
  }
}
