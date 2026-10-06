"use client";

/**
 * components/invitation/InvitationImageUploadField.tsx
 *
 * Thin invitation wrapper over the shared `components/shared/ImageUploader`.
 * Fixes the bucket to `cms-media` so returned URLs carry the
 * `/storage/v1/object/public/cms-media/` prefix required by the Zod draft
 * schema's storage-URL check. Behaviour (full original, optional
 * crop/zoom/rotate, EXIF fix, 1600px ceiling, retry) is identical to the
 * shared component.
 */

import { ImageUploader } from "@/components/shared/ImageUploader";

export interface InvitationImageUploadFieldProps {
  /** Current image URL from cms-media; shown as preview. Null = no image. */
  value: string | null | undefined;
  /**
   * Subfolder within the cms-media bucket.
   * Convention: `invitation-hero/${eventId}`, `invitation-story/${eventId}`,
   * `invitation-gallery/${eventId}`.
   */
  folder: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** Receives the cms-media public URL once the upload succeeds. */
  onUploaded: (url: string) => void;
  onRemove?: () => void;
  onError?: (message: string) => void;
}

export function InvitationImageUploadField({
  value,
  folder,
  label = "Upload photo",
  hint,
  disabled,
  onUploaded,
  onRemove,
  onError,
}: InvitationImageUploadFieldProps) {
  return (
    <ImageUploader
      bucket="cms-media"
      folder={folder}
      value={value}
      label={label}
      hint={hint}
      disabled={disabled}
      onUploaded={onUploaded}
      onRemove={onRemove}
      onError={onError}
      confirmLabel="Use original"
    />
  );
}
