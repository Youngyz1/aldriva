"use client";

import { useState, useRef } from "react";
import { uploadImage, UploadImageError, type UploadImageProgress } from "@/lib/uploadImage";
import { ALLOWED_IMAGE_TYPES } from "@/lib/imageCompression";

// Re-exported for existing consumers that set an <input accept="..."> from
// this constant. Narrowed from the previous 5-type list (jpeg/png/webp/gif/avif)
// to jpeg/png/webp only, per the current upload-pipeline requirements — see
// docs/image-upload.md.
export { ALLOWED_IMAGE_TYPES };

interface UseImageUploadOptions {
  bucket?: string;
  folder: string; // e.g. 'article-covers' or 'business-logos'
  onSuccess: (url: string) => void;
  onError?: (errorMsg: string) => void;
}

/**
 * Shared upload-button/file-input wiring for image uploads. All the actual
 * work (validation, compression, upload) lives in lib/uploadImage.ts — this
 * hook only adds React state (uploading/progress) and DOM wiring around it.
 */
export function useImageUpload({
  bucket = "fundraiser-media",
  folder,
  onSuccess,
  onError,
}: UseImageUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadImageProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setProgress(null);
      const url = await uploadImage(file, bucket, folder, {
        onProgress: setProgress,
      });
      onSuccess(url);
    } catch (err: unknown) {
      const msg =
        err instanceof UploadImageError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown upload error";
      if (onError) onError(msg);
      else alert("Upload failed: " + msg);
    } finally {
      setUploading(false);
      setProgress(null);
      // Reset so re-selecting the same file fires onChange again
      e.target.value = "";
    }
  };

  return { uploading, progress, fileInputRef, triggerUpload, handleFileChange };
}
