"use client";

import React from "react";
import { FaqBlock, FaqItem, BLOCK_LIMITS } from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";
import { Plus, Trash2 } from "lucide-react";

interface FaqInspectorProps {
  block: FaqBlock;
  onChange: (updated: FaqBlock) => void;
  tenantId: string;
}

export function FaqInspector({ block, onChange }: FaqInspectorProps) {
  const items = block.items || [];

  function update(partial: Partial<FaqBlock>) {
    onChange({ ...block, ...partial });
  }

  function handleAddItem() {
    if (items.length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) return;
    const newItem: FaqItem = {
      question: `Frequently Asked Question ${items.length + 1}?`,
      answer: "Provide a helpful, clear answer for your visitors here.",
    };
    update({ items: [...items, newItem] });
  }

  function handleUpdateItem(index: number, partial: Partial<FaqItem>) {
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
      <InspectorSection title="Header & Introductory Text" defaultOpen>
        <InspectorField
          label="Heading"
          currentLength={block.heading?.length}
          maxLength={BLOCK_LIMITS.HEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
            placeholder="e.g. Frequently Asked Questions"
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
            placeholder="Find quick answers to common questions..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>
      </InspectorSection>

      <InspectorSection
        title={`FAQ Questions (${items.length}/${BLOCK_LIMITS.MAX_ARRAY_ITEMS})`}
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
                  Q&A #{index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(index)}
                  className="text-zinc-400 hover:text-red-600 p-1 transition-colors"
                  aria-label={`Delete Q&A ${index + 1}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <InspectorField
                label="Question"
                requiredForPublish
                currentLength={item.question?.length}
                maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
              >
                <input
                  type="text"
                  value={item.question || ""}
                  onChange={(e) =>
                    handleUpdateItem(index, { question: e.target.value })
                  }
                  placeholder="e.g. How can I attend upcoming events?"
                  className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </InspectorField>

              <InspectorField
                label="Answer"
                requiredForPublish
                currentLength={item.answer?.length}
                maxLength={BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH}
              >
                <textarea
                  rows={3}
                  value={item.answer || ""}
                  onChange={(e) =>
                    handleUpdateItem(index, { answer: e.target.value })
                  }
                  placeholder="Enter detailed answer here..."
                  className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
                />
              </InspectorField>
            </div>
          ))}

          {items.length < BLOCK_LIMITS.MAX_ARRAY_ITEMS && (
            <button
              type="button"
              onClick={handleAddItem}
              className="w-full py-2 px-3 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 flex items-center justify-center gap-1.5 transition-colors bg-white dark:bg-zinc-900"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Question & Answer ({items.length}/{BLOCK_LIMITS.MAX_ARRAY_ITEMS})
            </button>
          )}
        </div>
      </InspectorSection>
    </div>
  );
}
