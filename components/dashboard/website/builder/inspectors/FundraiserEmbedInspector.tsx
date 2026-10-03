"use client";

import React from "react";
import {
  FundraiserEmbedBlock,
  BLOCK_LIMITS,
} from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";
import { Heart, Check } from "lucide-react";

export interface TenantFundraiserOption {
  id: string;
  title: string;
  organizer_id: string; // Tenant scoping guarantee
  status?: string;
  current_amount?: number;
  goal_amount?: number;
}

interface FundraiserEmbedInspectorProps {
  block: FundraiserEmbedBlock;
  onChange: (updated: FundraiserEmbedBlock) => void;
  tenantId: string;
  availableFundraisers?: TenantFundraiserOption[];
}

export function filterTenantFundraisers(
  fundraisers: TenantFundraiserOption[],
  tenantId: string
): TenantFundraiserOption[] {
  if (!Array.isArray(fundraisers) || !tenantId) return [];
  return fundraisers.filter(
    (f) => Boolean(f?.organizer_id) && f.organizer_id === tenantId
  );
}

export function FundraiserEmbedInspector({
  block,
  onChange,
  tenantId,
  availableFundraisers = [],
}: FundraiserEmbedInspectorProps) {
  function update(partial: Partial<FundraiserEmbedBlock>) {
    onChange({ ...block, ...partial });
  }

  // Tenant scoping guarantee: strictly filter to tenant's own campaigns (fail-closed)
  const tenantScopedFundraisers = filterTenantFundraisers(availableFundraisers, tenantId);

  const selectedIds = block.selectedFundraiserIds || [];

  function handleToggleFundraiserId(fundraiserId: string) {
    if (selectedIds.includes(fundraiserId)) {
      update({
        selectedFundraiserIds: selectedIds.filter((id) => id !== fundraiserId),
      });
    } else {
      if (selectedIds.length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) return;
      update({ selectedFundraiserIds: [...selectedIds, fundraiserId] });
    }
  }

  function handleLimitChange(val: number) {
    const clamped = Math.min(
      Math.max(BLOCK_LIMITS.MIN_EMBED_LIMIT, val),
      BLOCK_LIMITS.MAX_EMBED_LIMIT
    );
    update({ limit: clamped });
  }

  return (
    <div className="space-y-4">
      <InspectorSection title="Campaign Embed Configuration" defaultOpen>
        <InspectorField
          label="Heading"
          currentLength={block.heading?.length}
          maxLength={BLOCK_LIMITS.HEADING_MAX_LENGTH}
        >
          <input
            type="text"
            value={block.heading || ""}
            onChange={(e) => update({ heading: e.target.value })}
            placeholder="e.g. Support Our Causes & Initiatives"
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
            placeholder="Make a direct impact today..."
            className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          />
        </InspectorField>

        <div className="grid grid-cols-2 gap-2">
          <InspectorField label="Layout Style">
            <div className="grid grid-cols-3 gap-1">
              {(["card", "grid", "banner"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => update({ layout: style })}
                  className={`text-xs py-1.5 px-1 rounded-lg border font-medium capitalize transition-colors ${
                    (block.layout || "card") === style
                      ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400"
                      : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  }`}
                >
                  {style}
                </button>
              ))}
            </div>
          </InspectorField>

          <InspectorField
            label="Max Campaigns"
            description={`Clamp: ${BLOCK_LIMITS.MIN_EMBED_LIMIT}–${BLOCK_LIMITS.MAX_EMBED_LIMIT}`}
          >
            <input
              type="number"
              min={BLOCK_LIMITS.MIN_EMBED_LIMIT}
              max={BLOCK_LIMITS.MAX_EMBED_LIMIT}
              value={block.limit ?? BLOCK_LIMITS.DEFAULT_EMBED_LIMIT}
              onChange={(e) => handleLimitChange(parseInt(e.target.value, 10) || 6)}
              className="w-full text-xs px-3 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
            />
          </InspectorField>
        </div>

        <div className="flex items-center justify-between p-3 bg-zinc-50/50 dark:bg-zinc-800/30 rounded-xl border border-zinc-150 dark:border-zinc-800 mt-2">
          <div>
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
              Preview Pending Campaigns (Team Only)
            </span>
            <p className="text-[11px] text-zinc-500">
              Show campaigns currently under review to team members.
            </p>
          </div>
          <input
            type="checkbox"
            checked={Boolean(block.showDrafts)}
            onChange={(e) => update({ showDrafts: e.target.checked })}
            className="w-4 h-4 accent-orange-600 rounded"
          />
        </div>
      </InspectorSection>

      {/* Campaign Picker */}
      <InspectorSection
        title="Fundraiser Selection"
        description="Select specific fundraisers, or leave unselected to automatically display latest active causes."
      >
        {tenantScopedFundraisers.length === 0 ? (
          <div className="p-3 text-center bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700">
            <Heart className="w-5 h-5 text-zinc-400 mx-auto mb-1" />
            <p className="text-xs text-zinc-500">
              No fundraisers found for this organization. Campaigns will automatically surface here once created.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {tenantScopedFundraisers.map((fundraiser) => {
              const isSelected = selectedIds.includes(fundraiser.id);
              return (
                <div
                  key={fundraiser.id}
                  onClick={() => handleToggleFundraiserId(fundraiser.id)}
                  className={`p-2 rounded-lg border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected
                      ? "border-orange-500 bg-orange-50/50 dark:bg-orange-950/20 text-orange-950 dark:text-orange-200 font-medium"
                      : "border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <div className="truncate pr-2">
                    <p className="truncate font-medium">{fundraiser.title}</p>
                    {fundraiser.status && (
                      <span className="text-[10px] text-zinc-400 capitalize">
                        {fundraiser.status}
                      </span>
                    )}
                  </div>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center border ${
                      isSelected
                        ? "bg-orange-600 border-orange-600 text-white"
                        : "border-zinc-300 dark:border-zinc-600"
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
            <span>
              {selectedIds.length} campaign{selectedIds.length > 1 ? "s" : ""} selected
            </span>
            <button
              type="button"
              onClick={() => update({ selectedFundraiserIds: [] })}
              className="text-orange-600 hover:underline font-medium"
            >
              Reset to all latest
            </button>
          </div>
        )}
      </InspectorSection>
    </div>
  );
}
