"use client";

import React from "react";
import {
  GalleryBlock,
  GalleryImage,
  BLOCK_LIMITS,
} from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";
import { MediaUploadField } from "./common/MediaUploadField";
import { Plus, Trash2 } from "lucide-react";

interface GalleryInspectorProps {
  block: GalleryBlock;
  onChange: (updated: GalleryBlock) => void;
  tenantId: string;
}

export function GalleryInspector({
  block,
  onChange,
  tenantId,
}: GalleryInspectorProps) {
  const images = block.images || [];

  function update(partial: Partial<GalleryBlock>) {
    onChange({ ...block, ...partial });
  }

  function handleAddImage() {
    if (images.length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) return;
    const newImage: GalleryImage = {
      src: "",
      alt: `Photo ${images.length + 1}`,
      caption: "",
    };
    update({ images: [...images, newImage] });
  }

  function handleUpdateImage(index: number, partial: Partial<GalleryImage>) {
    const updated = images.map((img, idx) =>
      idx === index ? { ...img, ...partial } : img
    );
    update({ images: updated });
  }

  function handleRemoveImage(index: number) {
    update({ images: images.filter((_, idx) => idx !== index) });
  }

  return (
    <div className="space-y-4">
      {/* Layout Section */}
      <InspectorSection title="Layout & Grid" defaultOpen>
        <InspectorField
          label="Gallery Heading"
          currentLength={block.heading?.length}
          maxLength={BLOCK_LIMITS.HEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
            placeholder="e.g. Photo Gallery"
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField
          label="Subheading"
          currentLength={block.subheading?.length}
          maxLength={BLOCK_LIMITS.SUBHEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.subheading || ""}
            onChange={(e) => update({ subheading: e.target.value })}
            placeholder="Highlights and moments from our events..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField label="Layout Style">
          <div className="grid grid-cols-3 gap-2">
            {(["grid", "masonry", "carousel"] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => update({ layout: style })}
                className={`text-xs py-1.5 px-3 rounded-lg border font-medium capitalize transition-colors ${
                  (block.layout || "grid") === style
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </InspectorField>

        {block.layout !== "carousel" && (
          <InspectorField label="Columns Count">
            <div className="grid grid-cols-3 gap-2">
              {([2, 3, 4] as const).map((cols) => (
                <button
                  key={cols}
                  type="button"
                  onClick={() => update({ columns: cols })}
                  className={`text-xs py-1.5 px-3 rounded-lg border font-medium transition-colors ${
                    (block.columns || 3) === cols
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {cols} Columns
                </button>
              ))}
            </div>
          </InspectorField>
        )}
      </InspectorSection>

      {/* Images List */}
      <InspectorSection
        title={`Gallery Images (${images.length}/${BLOCK_LIMITS.MAX_ARRAY_ITEMS})`}
        defaultOpen
      >
        <div className="space-y-3">
          {images.map((item, index) => (
            <div
              key={index}
              className="p-3 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2 relative"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Image #{index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  className="text-zinc-400 hover:text-red-600 p-1 transition-colors"
                  aria-label={`Delete Image ${index + 1}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <MediaUploadField
                label="Image Source"
                requiredForPublish
                value={item.src}
                tenantId={tenantId}
                folderSubpath="gallery"
                aspectRatio={4 / 3}
                onChange={(url) => handleUpdateImage(index, { src: url })}
              />

              <div className="grid grid-cols-2 gap-2 mt-2">
                <InspectorField
                  label="Alt Text (Accessibility)"
                  currentLength={item.alt?.length}
                  maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
                >
                  <input
                    type="text"
                    value={item.alt || ""}
                    onChange={(e) =>
                      handleUpdateImage(index, { alt: e.target.value })
                    }
                    placeholder="Describe image..."
                    className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  />
                </InspectorField>

                <InspectorField
                  label="Caption (Optional)"
                  currentLength={item.caption?.length}
                  maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
                >
                  <input
                    type="text"
                    value={item.caption || ""}
                    onChange={(e) =>
                      handleUpdateImage(index, { caption: e.target.value })
                    }
                    placeholder="Caption text..."
                    className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  />
                </InspectorField>
              </div>
            </div>
          ))}

          {images.length < BLOCK_LIMITS.MAX_ARRAY_ITEMS && (
            <button
              type="button"
              onClick={handleAddImage}
              className="w-full py-2 px-3 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 flex items-center justify-center gap-1.5 transition-colors bg-white dark:bg-zinc-900"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Image ({images.length}/{BLOCK_LIMITS.MAX_ARRAY_ITEMS})
            </button>
          )}
        </div>
      </InspectorSection>
    </div>
  );
}
