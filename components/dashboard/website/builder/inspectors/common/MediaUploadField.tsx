"use client";

import React from "react";
import { ImageUploader } from "@/components/shared/ImageUploader";
import { InspectorField } from "./InspectorField";
import { BLOCK_LIMITS } from "@/lib/website-blocks";
import { IconX as X } from "@tabler/icons-react";

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
  /**
   * When true, the field renders without its own label row (label, counter,
   * required badge) — for callers like the v2 slot editor that already render
   * an outer label and would otherwise show it twice. Errors still display.
   */
  hideLabel?: boolean;
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
  hideLabel = false,
}: MediaUploadFieldProps) {
  const uploadFolder = tenantId ? `${tenantId}/${folderSubpath}` : `general/${folderSubpath}`;

  function handleClear() {
    onChange("");
  }

  const clearButton = value ? (
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={handleClear}
        className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 flex items-center gap-0.5 font-medium"
      >
        <X className="w-3.5 h-3.5" />
        Clear Image
      </button>
    </div>
  ) : null;

  const uploadPane = (
    <div className="border border-dashed border-zinc-200 dark:border-zinc-700 rounded-xl p-3 bg-zinc-50/50 dark:bg-zinc-800/30 flex flex-col items-center justify-center">
      <ImageUploader
        bucket="cms-media"
        folder={uploadFolder}
        value={value}
        aspect={cropShape === "round" ? 1 : "free"}
        onUploaded={(uploadedUrl) => {
          onChange(uploadedUrl);
        }}
      />
    </div>
  );

  return (
    hideLabel ? (
      <div className="space-y-2">
        {clearButton}
        {uploadPane}
      </div>
    ) : (
    <InspectorField
      label={label}
      description={description}
      requiredForPublish={requiredForPublish}
      currentLength={value?.length}
      maxLength={BLOCK_LIMITS.URL_MAX_LENGTH}
    >
      <div className="space-y-2">
        {clearButton}
        {uploadPane}
      </div>
    </InspectorField>
    )
  );
}
