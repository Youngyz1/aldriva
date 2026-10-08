"use client";

import React, { useState, useEffect } from "react";
import { ImageUploader } from "@/components/shared/ImageUploader";
import { InspectorField } from "./InspectorField";
import { BLOCK_LIMITS } from "@/lib/website-blocks";
import { safeImageSrc } from "@/lib/image-url";
import { Link as LinkIcon, Upload, X, Images } from "lucide-react";
import { MyMediaPicker } from "@/components/dashboard/website/builder/media/MyMediaPicker";

interface MediaUploadFieldProps {
  label: string;
  description?: string;
  value?: string | null;
  tenantId: string;
  folderSubpath?: string;
  /**
   * "round" marks avatar-style images and keeps a fixed square frame;
   * anything else keeps the full original (free). The old numeric
   * aspectRatio prop is gone — blocks frame content at their own ratios.
   */
  cropShape?: "rect" | "round";
  onChange: (url: string) => void;
  requiredForPublish?: boolean;
}

export function MediaUploadField({
  label,
  description,
  value,
  tenantId,
  folderSubpath = "blocks",
  cropShape = "rect",
  onChange,
  requiredForPublish,
}: MediaUploadFieldProps) {
  const [mode, setMode] = useState<"upload" | "myMedia" | "url">("upload");
  const [manualUrl, setManualUrl] = useState(value || "");

  useEffect(() => {
    setManualUrl(value || "");
  }, [value]);

  const urlError = manualUrl && !safeImageSrc(manualUrl)
    ? "Image URL must use this site's media host, Supabase Storage, or a relative path."
    : manualUrl.length > BLOCK_LIMITS.URL_MAX_LENGTH
      ? `URL exceeds ${BLOCK_LIMITS.URL_MAX_LENGTH} characters.`
      : undefined;

  const uploadFolder = tenantId ? `${tenantId}/${folderSubpath}` : `general/${folderSubpath}`;

  function handleManualUrlChange(newUrl: string) {
    setManualUrl(newUrl);
    const sanitized = safeImageSrc(newUrl);
    if (sanitized && newUrl.length <= BLOCK_LIMITS.URL_MAX_LENGTH) {
      onChange(sanitized);
    } else if (!newUrl) {
      onChange("");
    }
  }

  function handleClear() {
    setManualUrl("");
    onChange("");
  }

  return (
    <InspectorField
      label={label}
      description={description}
      requiredForPublish={requiredForPublish}
      currentLength={value?.length}
      maxLength={BLOCK_LIMITS.URL_MAX_LENGTH}
      error={urlError}
    >
      <div className="space-y-2">
        {/* Toggle Mode — Upload | My Media | Direct URL */}
        <div className="flex items-center justify-between">
          <div className="flex rounded-lg bg-zinc-100 dark:bg-zinc-800 p-0.5 text-xs gap-0.5">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
                mode === "upload"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
              }`}
            >
              <Upload className="w-3 h-3" />
              Upload
            </button>
            <button
              type="button"
              onClick={() => setMode("myMedia")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
                mode === "myMedia"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
              }`}
            >
              <Images className="w-3 h-3" />
              My Media
            </button>
            <button
              type="button"
              onClick={() => setMode("url")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition-colors ${
                mode === "url"
                  ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400"
              }`}
            >
              <LinkIcon className="w-3 h-3" />
              Direct URL
            </button>
          </div>

          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 flex items-center gap-0.5 font-medium"
            >
              <X className="w-3.5 h-3.5" />
              Clear Image
            </button>
          )}
        </div>

        {/* Upload mode with the shared uploader */}
        {mode === "upload" ? (
          <div className="border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-3 bg-zinc-50/50 dark:bg-zinc-800/30 flex flex-col items-center justify-center">
            <ImageUploader
              bucket="cms-media"
              folder={uploadFolder}
              value={value}
              aspect={cropShape === "round" ? 1 : "free"}
              onUploaded={(uploadedUrl) => {
                setManualUrl(uploadedUrl);
                onChange(uploadedUrl);
              }}
            />
          </div>
        ) : mode === "myMedia" ? (
          <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-3 bg-white dark:bg-zinc-900">
            <MyMediaPicker
              tenantId={tenantId}
              selectedUrl={value || manualUrl || null}
              onSelect={(publicUrl) => {
                setManualUrl(publicUrl);
                onChange(publicUrl);
              }}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <input
              type="url"
              value={manualUrl}
              onChange={(e) => handleManualUrlChange(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
            {value && (
              <div className="mt-2 relative rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 h-24 bg-zinc-100 dark:bg-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={value}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </InspectorField>
  );
}
