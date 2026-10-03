"use client";

import React from "react";
import { CtaBannerBlock, BLOCK_LIMITS } from "@/lib/website-blocks";
import { sanitizeUrl } from "@/lib/sanitize-html";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";

interface CtaBannerInspectorProps {
  block: CtaBannerBlock;
  onChange: (updated: CtaBannerBlock) => void;
  tenantId: string;
}

export function CtaBannerInspector({
  block,
  onChange,
}: CtaBannerInspectorProps) {
  function update(partial: Partial<CtaBannerBlock>) {
    onChange({ ...block, ...partial });
  }

  const ctaHrefError =
    block.ctaHref && !sanitizeUrl(block.ctaHref)
      ? "Invalid URL scheme."
      : undefined;

  return (
    <div className="space-y-4">
      <InspectorSection title="Banner Style" defaultOpen>
        <InspectorField label="Color Theme">
          <div className="grid grid-cols-3 gap-2">
            {(["brand", "dark", "light"] as const).map((variant) => (
              <button
                key={variant}
                type="button"
                onClick={() => update({ variant })}
                className={`text-xs py-1.5 px-3 rounded-lg border font-medium capitalize transition-colors ${
                  (block.variant || "brand") === variant
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                {variant}
              </button>
            ))}
          </div>
        </InspectorField>
      </InspectorSection>

      <InspectorSection title="Banner Content" defaultOpen>
        <InspectorField
          label="Heading"
          requiredForPublish
          currentLength={block.heading?.length}
          maxLength={BLOCK_LIMITS.HEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
            placeholder="e.g. Ready to Make a Difference?"
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
            placeholder="Join hundreds of supporters today..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <div className="grid grid-cols-2 gap-2">
          <InspectorField
            label="Button Label"
            requiredForPublish
            currentLength={block.ctaLabel?.length}
            maxLength={BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH}
          >
            <input
              type="text"
              value={block.ctaLabel || ""}
              onChange={(e) => update({ ctaLabel: e.target.value })}
              placeholder="e.g. Get Started"
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>

          <InspectorField
            label="Button Destination Link"
            requiredForPublish
            currentLength={block.ctaHref?.length}
            maxLength={BLOCK_LIMITS.URL_MAX_LENGTH}
            error={ctaHrefError}
          >
            <input
              type="text"
              value={block.ctaHref || ""}
              onChange={(e) => update({ ctaHref: e.target.value })}
              placeholder="/donate or https://..."
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>
        </div>
      </InspectorSection>
    </div>
  );
}
