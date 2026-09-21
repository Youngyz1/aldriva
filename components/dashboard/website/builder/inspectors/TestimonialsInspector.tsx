"use client";

import React from "react";
import {
  TestimonialsBlock,
  TestimonialItem,
  BLOCK_LIMITS,
} from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";
import { MediaUploadField } from "./common/MediaUploadField";
import { Plus, Trash2, Star } from "lucide-react";

interface TestimonialsInspectorProps {
  block: TestimonialsBlock;
  onChange: (updated: TestimonialsBlock) => void;
  tenantId: string;
}

export function TestimonialsInspector({
  block,
  onChange,
  tenantId,
}: TestimonialsInspectorProps) {
  const items = block.items || [];

  function update(partial: Partial<TestimonialsBlock>) {
    onChange({ ...block, ...partial });
  }

  function handleAddItem() {
    if (items.length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) return;
    const newItem: TestimonialItem = {
      quote: "Aldriva has completely transformed the way we connect with our supporters and audience.",
      author: `Customer ${items.length + 1}`,
      role: "Verified Member",
      rating: 5,
    };
    update({ items: [...items, newItem] });
  }

  function handleUpdateItem(index: number, partial: Partial<TestimonialItem>) {
    const updated = items.map((it, idx) =>
      idx === index ? { ...it, ...partial } : it
    );
    update({ items: updated });
  }

  function handleRemoveItem(index: number) {
    update({ items: items.filter((_, idx) => idx !== index) });
  }

  return (
    <div className="space-y-4">
      {/* Header & Layout */}
      <InspectorSection title="Section Header & Layout" defaultOpen>
        <InspectorField
          label="Heading"
          currentLength={block.heading?.length}
          maxLength={BLOCK_LIMITS.HEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
            placeholder="e.g. What Our Supporters Say"
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
            placeholder="Real stories from our community..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField label="Display Style">
          <div className="grid grid-cols-2 gap-2">
            {(["grid", "carousel"] as const).map((style) => (
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
      </InspectorSection>

      {/* Testimonial Items */}
      <InspectorSection
        title={`Testimonials (${items.length}/${BLOCK_LIMITS.MAX_ARRAY_ITEMS})`}
        defaultOpen
      >
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={index}
              className="p-3 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2.5 relative"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Testimonial #{index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className="text-zinc-400 hover:text-red-600 p-1 transition-colors"
                  aria-label={`Delete Testimonial ${index + 1}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <InspectorField
                label="Quote / Testimonial"
                requiredForPublish
                currentLength={item.quote?.length}
                maxLength={BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH}
              >
                <textarea
                  rows={3}
                  value={item.quote || ""}
                  onChange={(e) =>
                    handleUpdateItem(index, { quote: e.target.value })
                  }
                  placeholder="Enter testimonial text..."
                  className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
                />
              </InspectorField>

              <div className="grid grid-cols-2 gap-2">
                <InspectorField
                  label="Author Name"
                  currentLength={item.author?.length}
                  maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
                >
                  <input
                    type="text"
                    value={item.author || ""}
                    onChange={(e) =>
                      handleUpdateItem(index, { author: e.target.value })
                    }
                    placeholder="e.g. John Doe"
                    className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  />
                </InspectorField>

                <InspectorField
                  label="Role / Title"
                  currentLength={item.role?.length}
                  maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
                >
                  <input
                    type="text"
                    value={item.role || ""}
                    onChange={(e) =>
                      handleUpdateItem(index, { role: e.target.value })
                    }
                    placeholder="e.g. Community Donor"
                    className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  />
                </InspectorField>
              </div>

              {/* Star Rating */}
              <InspectorField label="Rating (Stars)">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleUpdateItem(index, { rating: star })}
                      className="p-1 text-zinc-300 hover:text-amber-400 transition-colors"
                      aria-label={`${star} Stars`}
                    >
                      <Star
                        className={`w-4 h-4 ${
                          (item.rating || 5) >= star
                            ? "fill-amber-400 text-amber-400"
                            : "text-zinc-300 dark:text-zinc-600"
                        }`}
                      />
                    </button>
                  ))}
                  <span className="text-xs text-zinc-500 ml-2">
                    {item.rating || 5} / 5
                  </span>
                </div>
              </InspectorField>

              <MediaUploadField
                label="Avatar / Headshot"
                value={item.avatar}
                tenantId={tenantId}
                folderSubpath="avatars"
                cropShape="round"
                aspectRatio={1}
                onChange={(url) => handleUpdateItem(index, { avatar: url })}
              />
            </div>
          ))}

          {items.length < BLOCK_LIMITS.MAX_ARRAY_ITEMS && (
            <button
              type="button"
              onClick={handleAddItem}
              className="w-full py-2 px-3 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 flex items-center justify-center gap-1.5 transition-colors bg-white dark:bg-zinc-900"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Testimonial ({items.length}/{BLOCK_LIMITS.MAX_ARRAY_ITEMS})
            </button>
          )}
        </div>
      </InspectorSection>
    </div>
  );
}
