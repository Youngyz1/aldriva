"use client";

/**
 * components/invitation/InvitationImageUploadField.tsx
 *
 * Wraps ImageUploadWithCrop for the invitation wizard.
 * Always uploads to the `cms-media` bucket so returned URLs carry
 * the `/storage/v1/object/public/cms-media/` prefix required by the
 * Zod draft schema's exact-prefix check.
 *
 * The shared imageCompression pipeline (MAX_DIMENSION_PX = 1920) runs
 * client-side inside ImageUploadWithCrop before the upload, which
 * satisfies the "resize to ~1600px long edge" requirement with a small
 * tolerance (1920 px ceiling is acceptable for hero/gallery images).
 */

import ImageUploadWithCrop from "@/components/ImageUploadWithCrop";

export interface InvitationImageUploadFieldProps {
  /** Current image URL from cms-media; shown as preview. Null = no image. */
  value: string | null | undefined;
  /**
   * Subfolder within the cms-media bucket.
   * Convention: `invitation-hero/${eventId}`, `invitation-story/${eventId}`,
   * `invitation-gallery/${eventId}`.
   */
  folder: string;
  /** Aspect ratio (width/height) for the crop frame. Omit for free-form. */
  aspectRatio?: number;
  /** Tailwind classes controlling the preview box size/shape. */
  previewClassName?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** Receives the cms-media public URL once the upload succeeds. */
  onUploaded: (url: string) => void;
  onRemove?: () => void;
  onError?: (message: string) => void;
}

/**
 * Image upload field for invitation page wizard steps.
 * Delegate all upload logic to the shared ImageUploadWithCrop component;
 * only fix the bucket to `cms-media` so URLs are always prefix-valid.
 */
export function InvitationImageUploadField({
  value,
  folder,
  aspectRatio,
  previewClassName,
  label,
  hint,
  disabled,
  onUploaded,
  onRemove,
  onError,
}: InvitationImageUploadFieldProps) {
  return (
    <ImageUploadWithCrop
      value={value}
      bucket="cms-media"
      folder={folder}
      aspectRatio={aspectRatio}
      previewClassName={previewClassName}
      label={label}
      hint={hint}
      disabled={disabled}
      onUploaded={onUploaded}
      onRemove={onRemove}
      onError={onError}
    />
  );
}
