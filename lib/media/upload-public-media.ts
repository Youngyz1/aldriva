"use client";

import { supabase } from "@/lib/supabase";
import { uploadPublicFile } from "@/lib/uploads";
import {
  MEDIA_PURPOSE_POLICIES,
  type PublicMediaType,
  type UploadMediaPurpose,
} from "@/lib/media/constants";

type UploadUrlResponse = { uploadUrl?: unknown; tempKey?: unknown; error?: unknown };
type FinalizeResponse = { publicUrl?: unknown; error?: unknown };

export type PublicMediaUploadScope = { tenantId?: string; targetId?: string };

function responseError(payload: { error?: unknown }, fallback: string): string {
  return typeof payload.error === "string" ? payload.error : fallback;
}

function getClientImageDriver(): string {
  return process.env.NEXT_PUBLIC_IMAGE_STORAGE_DRIVER ?? "supabase";
}

/**
 * Driver-aware transport used after uploadImage has validated and compressed
 * the selected image. Supabase remains the non-production path; the API only
 * issues R2 URLs when its own production driver gate is satisfied.
 */
export async function uploadPublicMedia(
  file: File,
  purpose: UploadMediaPurpose,
  scope: PublicMediaUploadScope = {},
  onProgress?: (percent: number) => void
): Promise<string> {
  const policy = MEDIA_PURPOSE_POLICIES[purpose];
  if (getClientImageDriver() !== "r2") {
    const folder = scope.targetId ?? scope.tenantId ?? (purpose === "cms" ? "homepage" : "public");
    const uploaded = await uploadPublicFile({
      supabase,
      bucket: policy.supabaseBucket,
      file,
      folder,
      kind: "image",
      maxBytes: policy.maxBytes,
      allowedTypes: policy.allowedTypes,
    });
    onProgress?.(100);
    return uploaded.publicUrl;
  }

  const prepared = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      purpose,
      tenantId: scope.tenantId,
      targetId: scope.targetId,
      contentType: file.type,
      size: file.size,
    }),
  });
  const uploadInfo = await prepared.json().catch(() => ({})) as UploadUrlResponse;
  if (!prepared.ok || typeof uploadInfo.uploadUrl !== "string" || typeof uploadInfo.tempKey !== "string") {
    throw new Error(responseError(uploadInfo, "Could not prepare the image upload."));
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadInfo.uploadUrl as string);
    xhr.setRequestHeader("Content-Type", file.type as PublicMediaType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("The image upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Upload failed due to a network problem. Check your connection and try again."));
    xhr.onabort = () => reject(new Error("The image upload was cancelled."));
    xhr.send(file);
  });

  const finalized = await fetch("/api/media/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ tempKey: uploadInfo.tempKey, purpose }),
  });
  const result = await finalized.json().catch(() => ({})) as FinalizeResponse;
  if (!finalized.ok || typeof result.publicUrl !== "string") {
    throw new Error(responseError(result, "The image could not be processed. Please try another file."));
  }

  return result.publicUrl;
}
