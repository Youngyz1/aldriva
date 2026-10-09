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
import { ImageUploaderMultiple } from "@/components/shared/ImageUploader";
import { useTranslations } from "next-intl";

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
  confirmLabel?: string;
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
  confirmLabel,
  onUploaded,
  onRemove,
  onError,
}: InvitationImageUploadFieldProps) {
  const t = useTranslations("Events");
  return (
    <ImageUploader
      bucket="cms-media"
      folder={folder}
      value={value}
      maxLongEdge={1600}
      label={label}
      hint={hint}
      disabled={disabled}
      confirmLabel={confirmLabel ?? "Use original"}
      heicUnsupportedMessage={t("invitationHeicUnsupported")}
      onUploaded={onUploaded}
      onRemove={onRemove}
      onError={onError}
    />
  );
}

interface InvitationImageUploadBatchFieldProps {
  folder: string;
  maxFiles: number;
  disabled?: boolean;
  onUploaded: (url: string) => void;
}

export function InvitationImageUploadBatchField({
  folder,
  maxFiles,
  disabled,
  onUploaded,
}: InvitationImageUploadBatchFieldProps) {
  const t = useTranslations("Events");
  return (
    <ImageUploaderMultiple
      bucket="cms-media"
      folder={folder}
      maxLongEdge={1600}
      maxFiles={maxFiles}
      label={t("invitationGalleryAddPhotos")}
      hint={t("invitationGalleryRemainingHint", { remaining: maxFiles })}
      disabled={disabled}
      onUploaded={onUploaded}
      messages={{
        queued: t("invitationGalleryQueued"),
        processing: t("invitationGalleryProcessing"),
        uploading: t("invitationGalleryUploading"),
        complete: t("invitationGalleryComplete"),
        retry: t("invitationGalleryRetry"),
        remove: t("invitationGalleryRemove"),
        unsupportedType: t("invitationGalleryUnsupportedType"),
        heicUnsupported: t("invitationHeicUnsupported"),
        overflow: (count) => t("invitationGalleryOverflow", { count }),
      }}
    />
  );
}
