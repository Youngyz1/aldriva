/**
 * lib/branches/cover-image-validation.ts
 *
 * Normalizes and validates business_branches.cover_image_url on
 * create/update. Reuses validateStaffPhotoUrl (lib/staff/photo-validation.ts)
 * for the actual https/host/length rules -- same upload pipeline
 * (hooks/use-image-upload.ts -> lib/uploadImage.ts), same "fundraiser-media"
 * bucket, so the same host check applies.
 *
 * validateStaffPhotoUrl treats "" as an invalid URL (new URL("") throws),
 * not as "no photo" -- so the empty-string-to-null conversion must happen
 * here, before validation, not after.
 */

import { validateStaffPhotoUrl } from "@/lib/staff/photo-validation";

export type CoverImageValidationError = { code: string; message: string };

export type CoverImageValidationResult =
  | { value: string | null; error: null }
  | { value: null; error: CoverImageValidationError };

export function validateBranchCoverImageUrl(
  raw: string | null | undefined
): CoverImageValidationResult {
  const normalized = raw == null ? null : raw.trim() || null;
  const error = validateStaffPhotoUrl(normalized);
  if (error) return { value: null, error };
  return { value: normalized, error: null };
}
