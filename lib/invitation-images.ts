/**
 * lib/invitation-images.ts
 *
 * Back-compat re-export: the invitation image helpers moved to the
 * generic `lib/image-upload.ts` (shared with `components/shared/
 * ImageUploader`). This module preserves the invitation-specific names
 * so existing imports and tests keep working.
 */

export {
  DEFAULT_MAX_LONG_EDGE_PX,
  DEFAULT_GALLERY_MAX,
  computeResizeTarget,
  resolveCropAspect,
  exifSwapsDimensions,
  orientedDimensions,
  exifToCanvasTransform,
  readExifOrientation,
  normalizeFocalPoint,
  focalToObjectPosition,
  pointerToFocalPoint,
  canAddGalleryItem,
  moveGalleryItem,
  formatImageBytes,
  resolveOutputMime,
  resolveOutputExtension,
} from "@/lib/image-upload";
export type {
  ExifOrientation,
  ImageDimensions,
  CanvasFlip,
  CanvasOrientationTransform,
  FocalPoint,
  OutputTypeOption,
} from "@/lib/image-upload";

import {
  resolveOutputMime as resolveMime,
  resolveOutputExtension as resolveExt,
} from "@/lib/image-upload";

/** Invitation long-edge ceiling (1600px). */
export const INVITATION_MAX_LONG_EDGE_PX = 1600;

/** Invitation gallery cap (matches the Zod 12-item cap). */
export const INVITATION_GALLERY_MAX = 12;

/** Invitation output MIME (auto JPEG/WebP rule). */
export function invitationOutputMime(sourceType: string): "image/jpeg" | "image/webp" {
  return resolveMime(sourceType, "auto");
}

/** Invitation output extension (auto JPEG/WebP rule). */
export function invitationOutputExtension(sourceType: string): "jpg" | "webp" {
  return resolveExt(sourceType, "auto");
}
