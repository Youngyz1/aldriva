"use client";

import type { PublicMediaType } from "@/lib/media/constants";

type UploadUrlResponse = { uploadUrl?: unknown; tempKey?: unknown; error?: unknown };
type FinalizeResponse = { publicUrl?: unknown; error?: unknown };

function responseError(payload: { error?: unknown }, fallback: string): string {
  return typeof payload.error === "string" ? payload.error : fallback;
}

export async function uploadPublicMedia(
  file: File,
  purpose: "cms",
  onProgress?: (percent: number) => void
): Promise<string> {
  const prepared = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ purpose, contentType: file.type, size: file.size }),
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
