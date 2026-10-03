"use client";

import React from "react";
import {
  AboutBlock,
  AboutHighlight,
  BLOCK_LIMITS,
} from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";
import { MediaUploadField } from "./common/MediaUploadField";
import { Plus, Trash2 } from "lucide-react";

interface AboutInspectorProps {
  block: AboutBlock;
  onChange: (updated: AboutBlock) => void;
  tenantId: string;
}

export function AboutInspector({
  block,
  onChange,
  tenantId,
}: AboutInspectorProps) {
  const highlights = block.highlights || [];

  function update(partial: Partial<AboutBlock>) {
    onChange({ ...block, ...partial });
  }

  function handleAddHighlight() {
    if (highlights.length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) return;
    const newHighlight: AboutHighlight = {
      label: "Metric / Key Point",
      value: "10K+",
    };
    update({ highlights: [...highlights, newHighlight] });
  }

  function handleUpdateHighlight(
    index: number,
    partial: Partial<AboutHighlight>
  ) {
    const updated = highlights.map((h, idx) =>
      idx === index ? { ...h, ...partial } : h
    );
    update({ highlights: updated });
  }

  function handleRemoveHighlight(index: number) {
    update({ highlights: highlights.filter((_, idx) => idx !== index) });
  }

  return (
    <div className="space-y-4">
      {/* Story & Headings */}
      <InspectorSection title="Story & Mission" defaultOpen>
        <InspectorField
          label="Heading"
          currentLength={block.heading?.length}
          maxLength={BLOCK_LIMITS.HEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
            placeholder="e.g. About Our Journey"
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
            placeholder="A brief tagline or summary..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField
          label="Our Story (Prose)"
          requiredForPublish
          currentLength={block.story?.length}
          maxLength={BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH}
        >
          <textarea
            rows={4}
            value={block.story || ""}
            onChange={(e) => update({ story: e.target.value })}
            placeholder="Tell your organization or company's backstory..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
          />
        </InspectorField>

        <InspectorField
          label="Mission Statement / Callout"
          currentLength={block.mission?.length}
          maxLength={BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH}
        >
          <textarea
            rows={2}
            value={block.mission || ""}
            onChange={(e) => update({ mission: e.target.value })}
            placeholder="Our mission is to..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
          />
        </InspectorField>
      </InspectorSection>

      {/* Founder / Leader Profile */}
      <InspectorSection title="Founder / Leader Profile">
        <MediaUploadField
          label="Leader Portrait Image"
          value={block.founderImage}
          tenantId={tenantId}
          folderSubpath="team"
          cropShape="round"
          aspectRatio={1}
          onChange={(url) => update({ founderImage: url })}
        />

        <div className="grid grid-cols-2 gap-2 mt-3">
          <InspectorField
            label="Name"
            currentLength={block.founderName?.length}
            maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
          >
            <input
              type="text"
              value={block.founderName || ""}
              onChange={(e) => update({ founderName: e.target.value })}
              placeholder="e.g. Sarah Jenkins"
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>

          <InspectorField
            label="Role / Title"
            currentLength={block.founderRole?.length}
            maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
          >
            <input
              type="text"
              value={block.founderRole || ""}
              onChange={(e) => update({ founderRole: e.target.value })}
              placeholder="e.g. Founder & CEO"
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>
        </div>
      </InspectorSection>

      {/* Metrics & Highlights */}
      <InspectorSection
        title={`Key Highlights / Metrics (${highlights.length}/${BLOCK_LIMITS.MAX_ARRAY_ITEMS})`}
      >
        <div className="space-y-3">
          {highlights.map((item, index) => (
            <div
              key={index}
              className="p-3 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-xl border border-zinc-150 dark:border-zinc-800 space-y-2 relative"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Metric #{index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveHighlight(index)}
                  className="text-zinc-400 hover:text-red-600 p-1 transition-colors"
                  aria-label={`Delete Metric ${index + 1}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <InspectorField
                  label="Value / Stat"
                  requiredForPublish
                  currentLength={item.value?.length}
                  maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
                >
                  <input
                    type="text"
                    value={item.value || ""}
                    onChange={(e) =>
                      handleUpdateHighlight(index, { value: e.target.value })
                    }
                    placeholder="e.g. 5,000+"
                    className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  />
                </InspectorField>

                <InspectorField
                  label="Label"
                  requiredForPublish
                  currentLength={item.label?.length}
                  maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
                >
                  <input
                    type="text"
                    value={item.label || ""}
                    onChange={(e) =>
                      handleUpdateHighlight(index, { label: e.target.value })
                    }
                    placeholder="e.g. Lives Impacted"
                    className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                  />
                </InspectorField>
              </div>
            </div>
          ))}

          {highlights.length < BLOCK_LIMITS.MAX_ARRAY_ITEMS && (
            <button
              type="button"
              onClick={handleAddHighlight}
              className="w-full py-2 px-3 border border-dashed border-zinc-300 dark:border-zinc-700 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:border-orange-500 hover:text-orange-600 dark:hover:text-orange-400 flex items-center justify-center gap-1.5 transition-colors bg-white dark:bg-zinc-900"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Metric / Stat ({highlights.length}/{BLOCK_LIMITS.MAX_ARRAY_ITEMS})
            </button>
          )}
        </div>
      </InspectorSection>
    </div>
  );
}
