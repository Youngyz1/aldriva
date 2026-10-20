"use client";

import type { PromotionsEmbedBlock } from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";

export function PromotionsEmbedInspector({
  block,
  onChange,
}: {
  block: PromotionsEmbedBlock;
  onChange: (updatedBlock: PromotionsEmbedBlock) => void;
}) {
  const update = (patch: Partial<PromotionsEmbedBlock>) => onChange({ ...block, ...patch });
  return (
    <div className="space-y-4">
      <InspectorField label="Show promotions">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 px-3 text-xs font-medium text-zinc-800 dark:border-zinc-700 dark:text-zinc-100">
          <input
            type="checkbox"
            checked={block.enabled !== false}
            onChange={(event) => update({ enabled: event.currentTarget.checked })}
            className="h-4 w-4 accent-orange-600"
          />
          Display active dashboard promotions
        </label>
      </InspectorField>
      <InspectorField label="Display layout">
        <select
          value={block.layout ?? "auto"}
          onChange={(event) => update({ layout: event.currentTarget.value as PromotionsEmbedBlock["layout"] })}
          disabled={block.enabled === false}
          className="min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-xs text-zinc-900 focus:outline-hidden focus:ring-1 focus:ring-orange-500 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="auto">Use each promotion&apos;s layout</option>
          <option value="announcement_bar">Announcement bar</option>
          <option value="banner">Featured banner</option>
          <option value="dish_card">Dish promotion card</option>
        </select>
      </InspectorField>
      <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
        Promotion copy, images, and destinations come from Dashboard → Menu → Promotions.
      </p>
    </div>
  );
}
