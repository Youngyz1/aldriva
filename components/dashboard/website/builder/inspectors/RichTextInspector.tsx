"use client";

import React from "react";
import { RichTextBlock, BLOCK_LIMITS } from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";

interface RichTextInspectorProps {
  block: RichTextBlock;
  onChange: (updated: RichTextBlock) => void;
  tenantId: string;
}

export function RichTextInspector({
  block,
  onChange,
}: RichTextInspectorProps) {
  function update(partial: Partial<RichTextBlock>) {
    onChange({ ...block, ...partial });
  }

  return (
    <div className="space-y-4">
      <InspectorSection title="Rich Text HTML Content" defaultOpen>
        <InspectorField
          label="HTML Body Content"
          requiredForPublish
          description="Formatted HTML text. Dangerous script tags and malicious attributes are sanitized automatically."
          currentLength={block.html?.length}
          maxLength={BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH * 2}
        >
          <textarea
            rows={10}
            value={block.html || ""}
            onChange={(e) => update({ html: e.target.value })}
            placeholder="<p>Enter formatted HTML content...</p>"
            className="w-full text-xs font-mono px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
          />
        </InspectorField>
      </InspectorSection>
    </div>
  );
}
