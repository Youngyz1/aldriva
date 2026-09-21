"use client";

import React from "react";
import { HeroBlock, BLOCK_LIMITS } from "@/lib/website-blocks";
import { sanitizeUrl } from "@/lib/sanitize-html";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";
import { MediaUploadField } from "./common/MediaUploadField";

interface HeroInspectorProps {
  block: HeroBlock;
  onChange: (updated: HeroBlock) => void;
  tenantId: string;
}

export function HeroInspector({
  block,
  onChange,
  tenantId,
}: HeroInspectorProps) {
  function update(partial: Partial<HeroBlock>) {
    onChange({ ...block, ...partial });
  }

  // Real-time URL validation warnings
  const ctaHrefError =
    block.ctaHref && !sanitizeUrl(block.ctaHref)
      ? "Invalid URL scheme. Allowed: http, https, mailto, tel, or relative (/path, #hash)."
      : undefined;

  const secondaryCtaHrefError =
    block.secondaryCtaHref && !sanitizeUrl(block.secondaryCtaHref)
      ? "Invalid URL scheme. Allowed: http, https, mailto, tel, or relative (/path, #hash)."
      : undefined;

  const videoUrlError =
    block.videoUrl && !sanitizeUrl(block.videoUrl)
      ? "Invalid video URL. Must be a valid URL."
      : undefined;

  return (
    <div className="space-y-4">
      {/* Layout & Style Section */}
      <InspectorSection title="Layout & Variant" defaultOpen>
        <InspectorField label="Layout Variant">
          <select
            value={block.variant || "split"}
            onChange={(e) =>
              update({ variant: e.target.value as HeroBlock["variant"] })
            }
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          >
            <option value="split">Split Layout (Text + Media)</option>
            <option value="center">Centered Hero (Full Width)</option>
            <option value="video_bg">Video Background</option>
          </select>
        </InspectorField>

        <InspectorField label="Text Alignment">
          <div className="grid grid-cols-3 gap-2">
            {(["left", "center", "right"] as const).map((alignment) => (
              <button
                key={alignment}
                type="button"
                onClick={() => update({ align: alignment })}
                className={`text-xs py-1.5 px-3 rounded-lg border font-medium capitalize transition-colors ${
                  (block.align || "left") === alignment
                    ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                }`}
              >
                {alignment}
              </button>
            ))}
          </div>
        </InspectorField>
      </InspectorSection>

      {/* Content Section */}
      <InspectorSection title="Content" defaultOpen>
        <InspectorField
          label="Badge Chip (Optional)"
          currentLength={block.badge?.length}
          maxLength={BLOCK_LIMITS.LABEL_MAX_LENGTH}
          warning={
            block.badge && block.badge.length > BLOCK_LIMITS.LABEL_MAX_LENGTH
              ? `Exceeds maximum ${BLOCK_LIMITS.LABEL_MAX_LENGTH} characters.`
              : undefined
          }
        >
          <input
            type="text"
            value={block.badge || ""}
            onChange={(e) => update({ badge: e.target.value })}
            placeholder="e.g. New Initiative"
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField
          label="Main Heading"
          requiredForPublish
          currentLength={block.heading?.length}
          maxLength={BLOCK_LIMITS.HEADING_MAX_LENGTH}
          warning={
            block.heading && block.heading.length > BLOCK_LIMITS.HEADING_MAX_LENGTH
              ? `Exceeds maximum ${BLOCK_LIMITS.HEADING_MAX_LENGTH} characters.`
              : undefined
          }
        >
          <input
            type="text"
            value={block.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
            placeholder="e.g. Empowering Local Communities"
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <InspectorField
          label="Subheading / Description"
          currentLength={block.subheading?.length}
          maxLength={BLOCK_LIMITS.SUBHEADING_MAX_LENGTH}
          warning={
            block.subheading && block.subheading.length > BLOCK_LIMITS.SUBHEADING_MAX_LENGTH
              ? `Exceeds maximum ${BLOCK_LIMITS.SUBHEADING_MAX_LENGTH} characters.`
              : undefined
          }
        >
          <textarea
            rows={3}
            value={block.subheading || ""}
            onChange={(e) => update({ subheading: e.target.value })}
            placeholder="Provide supporting context or a brief overview..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
          />
        </InspectorField>
      </InspectorSection>

      {/* Media Section */}
      <InspectorSection title="Media & Visuals">
        <MediaUploadField
          label="Hero Image / Background"
          value={block.backgroundImage}
          tenantId={tenantId}
          folderSubpath="heroes"
          aspectRatio={16 / 9}
          onChange={(url) => update({ backgroundImage: url })}
        />

        {block.variant === "video_bg" && (
          <InspectorField
            label="Background Video URL (MP4 / WebM / YouTube)"
            currentLength={block.videoUrl?.length}
            maxLength={BLOCK_LIMITS.URL_MAX_LENGTH}
            error={videoUrlError}
          >
            <input
              type="url"
              value={block.videoUrl || ""}
              onChange={(e) => update({ videoUrl: e.target.value })}
              placeholder="https://example.com/video.mp4"
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>
        )}
      </InspectorSection>

      {/* Actions / Call-to-Action Section */}
      <InspectorSection title="Call to Action (Buttons)">
        <div className="space-y-3 p-3 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-xl border border-zinc-150 dark:border-zinc-800">
          <h5 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Primary Button
          </h5>
          <InspectorField
            label="Button Label"
            currentLength={block.ctaLabel?.length}
            maxLength={BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH}
          >
            <input
              type="text"
              value={block.ctaLabel || ""}
              onChange={(e) => update({ ctaLabel: e.target.value })}
              placeholder="e.g. Explore Events"
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>

          <InspectorField
            label="Destination Link (URL or relative path)"
            currentLength={block.ctaHref?.length}
            maxLength={BLOCK_LIMITS.URL_MAX_LENGTH}
            error={ctaHrefError}
          >
            <input
              type="text"
              value={block.ctaHref || ""}
              onChange={(e) => update({ ctaHref: e.target.value })}
              placeholder="/events or https://..."
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>
        </div>

        <div className="space-y-3 p-3 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-xl border border-zinc-150 dark:border-zinc-800">
          <h5 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Secondary Button (Optional)
          </h5>
          <InspectorField
            label="Secondary Button Label"
            currentLength={block.secondaryCtaLabel?.length}
            maxLength={BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH}
          >
            <input
              type="text"
              value={block.secondaryCtaLabel || ""}
              onChange={(e) => update({ secondaryCtaLabel: e.target.value })}
              placeholder="e.g. Learn More"
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>

          <InspectorField
            label="Secondary Link"
            currentLength={block.secondaryCtaHref?.length}
            maxLength={BLOCK_LIMITS.URL_MAX_LENGTH}
            error={secondaryCtaHrefError}
          >
            <input
              type="text"
              value={block.secondaryCtaHref || ""}
              onChange={(e) => update({ secondaryCtaHref: e.target.value })}
              placeholder="#about or https://..."
              className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>
        </div>
      </InspectorSection>
    </div>
  );
}
