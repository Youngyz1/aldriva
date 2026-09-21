"use client";

import React from "react";
import {
  FeaturesBlock,
  FeatureItem,
  BLOCK_LIMITS,
} from "@/lib/website-blocks";
import { sanitizeUrl } from "@/lib/sanitize-html";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";
import { Plus, Trash2 } from "lucide-react";

interface FeaturesInspectorProps {
  block: FeaturesBlock;
  onChange: (updated: FeaturesBlock) => void;
  tenantId: string;
}

export function FeaturesInspector({
  block,
  onChange,
}: FeaturesInspectorProps) {
  const items = block.items || [];

  function update(partial: Partial<FeaturesBlock>) {
    onChange({ ...block, ...partial });
  }

  function handleAddItem() {
    if (items.length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) return;
    const newItem: FeatureItem = {
      title: `Feature ${items.length + 1}`,
      description: "",
      icon: "Sparkles",
    };
    update({ items: [...items, newItem] });
  }

  function handleUpdateItem(index: number, partial: Partial<FeatureItem>) {
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
      <InspectorSection title="Header & Grid Layout" defaultOpen>
        <InspectorField
          label="Section Heading"
          currentLength={block.heading?.length}
          maxLength={BLOCK_LIMITS.HEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
            placeholder="e.g. Core Features & Advantages"
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField
          label="Subheading"
          currentLength={block.subheading?.length}
          maxLength={BLOCK_LIMITS.SUBHEADING_MAX_LENGTH}
        >
          <textarea
            rows={2}
            value={block.subheading || ""}
            onChange={(e) => update({ subheading: e.target.value })}
            placeholder="Brief introduction to these features..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
          />
        </InspectorField>

        <InspectorField label="Columns Layout">
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
      </InspectorSection>

      {/* Feature Items */}
      <InspectorSection
        title={`Feature Items (${items.length}/${BLOCK_LIMITS.MAX_ARRAY_ITEMS})`}
        defaultOpen
      >
        <div className="space-y-3">
          {items.map((item, index) => {
            const hrefError =
              item.href && !sanitizeUrl(item.href)
                ? "Invalid URL scheme."
                : undefined;

            return (
              <div
                key={index}
                className="p-3 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2.5 relative"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Feature #{index + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    className="text-zinc-400 hover:text-red-600 p-1 transition-colors"
                    aria-label={`Delete Feature ${index + 1}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <InspectorField
                  label="Title"
                  requiredForPublish
                  currentLength={item.title?.length}
                  maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
                >
                  <input
                    type="text"
                    value={item.title || ""}
                    onChange={(e) =>
                      handleUpdateItem(index, { title: e.target.value })
                    }
                    placeholder="Feature title"
                    className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  />
                </InspectorField>

                <InspectorField
                  label="Description"
                  currentLength={item.description?.length}
                  maxLength={BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH}
                >
                  <textarea
                    rows={2}
                    value={item.description || ""}
                    onChange={(e) =>
                      handleUpdateItem(index, { description: e.target.value })
                    }
                    placeholder="Describe this feature..."
                    className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
                  />
                </InspectorField>

                <div className="grid grid-cols-2 gap-2">
                  <InspectorField label="Icon Name (Lucide)">
                    <input
                      type="text"
                      value={item.icon || ""}
                      onChange={(e) =>
                        handleUpdateItem(index, { icon: e.target.value })
                      }
                      placeholder="e.g. ShieldCheck"
                      className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                    />
                  </InspectorField>

                  <InspectorField
                    label="Link (Optional)"
                    currentLength={item.href?.length}
                    maxLength={BLOCK_LIMITS.URL_MAX_LENGTH}
                    error={hrefError}
                  >
                    <input
                      type="text"
                      value={item.href || ""}
                      onChange={(e) =>
                        handleUpdateItem(index, { href: e.target.value })
                      }
                      placeholder="/learn-more"
                      className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                    />
                  </InspectorField>
                </div>
              </div>
            );
          })}

          {items.length < BLOCK_LIMITS.MAX_ARRAY_ITEMS ? (
            <button
              type="button"
              onClick={handleAddItem}
              className="w-full py-2 px-3 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 flex items-center justify-center gap-1.5 transition-colors bg-white dark:bg-zinc-900"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Feature Item ({items.length}/{BLOCK_LIMITS.MAX_ARRAY_ITEMS})
            </button>
          ) : (
            <p className="text-xs text-amber-600 text-center font-medium">
              Maximum {BLOCK_LIMITS.MAX_ARRAY_ITEMS} feature items reached.
            </p>
          )}
        </div>
      </InspectorSection>
    </div>
  );
}
