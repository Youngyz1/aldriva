"use client";

import React from "react";
import { Block } from "@/lib/website-blocks";
import { HeroInspector } from "./HeroInspector";
import { FeaturesInspector } from "./FeaturesInspector";
import { AboutInspector } from "./AboutInspector";
import { GalleryInspector } from "./GalleryInspector";
import { TestimonialsInspector } from "./TestimonialsInspector";
import { ContactInspector } from "./ContactInspector";
import { FaqInspector } from "./FaqInspector";
import {
  EventsEmbedInspector,
  TenantEventOption,
} from "./EventsEmbedInspector";
import {
  ProductsEmbedInspector,
  TenantProductOption,
} from "./ProductsEmbedInspector";
import {
  FundraiserEmbedInspector,
  TenantFundraiserOption,
} from "./FundraiserEmbedInspector";
import { RichTextInspector } from "./RichTextInspector";
import { CtaBannerInspector } from "./CtaBannerInspector";
import { Sliders, X } from "lucide-react";
import { getFieldDef, isEditablePath, getElementValue } from "@/lib/website-block-edit-schema";
import type { BlockType } from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";
import { MediaUploadField } from "./common/MediaUploadField";
import { SectionInspector } from "./SectionInspector";

export interface BlockInspectorProps {
  block: Block | null;
  onChange: (updatedBlock: Block) => void;
  tenantId: string;
  availableEvents?: TenantEventOption[];
  availableProducts?: TenantProductOption[];
  availableFundraisers?: TenantFundraiserOption[];
  onClose?: () => void;
  selectedPath?: string | null;
  onElementChange?: (path: string, value: unknown) => void;
  onSectionChange?: (patch: Partial<Record<string, unknown>>) => void;
}

const BLOCK_TITLES: Record<string, string> = {
  hero: "Hero Section",
  features: "Features Grid",
  about: "About Story & Mission",
  gallery: "Media Gallery",
  testimonials: "Testimonials & Reviews",
  contact: "Contact Information",
  faq: "Frequently Asked Questions",
  events_embed: "Events Live Embed",
  products_embed: "Products Catalog Embed",
  fundraiser_embed: "Fundraisers Live Embed",
  rich_text: "Rich Text Content",
  cta_banner: "Call-to-Action Banner",
};

export function BlockInspector({
  block,
  onChange,
  tenantId,
  availableEvents,
  availableProducts,
  availableFundraisers,
  onClose,
  selectedPath,
  onElementChange,
  onSectionChange,
}: BlockInspectorProps) {
  if (!block) {
    return (
      <div className="p-6 text-center text-zinc-400 dark:text-zinc-500 space-y-2">
        <Sliders className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700" />
        <p className="text-xs font-medium">Select a block on the canvas to inspect and edit its properties.</p>
      </div>
    );
  }

  const title = BLOCK_TITLES[block.type] || `${block.type} Block`;
  const isElementMode = Boolean(selectedPath && isEditablePath(block.type as BlockType, selectedPath!));
  const fieldDef = isElementMode ? getFieldDef(block.type as BlockType, selectedPath!) : null;
  const elementValue = isElementMode ? getElementValue(block as unknown as Record<string, unknown>, selectedPath!) : undefined;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xs z-10">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
            {isElementMode ? "Element Inspector" : "Block Inspector"}
          </span>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {isElementMode ? `${title} · ${fieldDef?.label ?? selectedPath}` : title}
          </h3>
          {isElementMode && selectedPath && (
            <p className="text-[11px] font-mono text-zinc-400 truncate max-w-[220px]">{selectedPath}</p>
          )}
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Close inspector"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Body / Inspector Dispatcher */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Section controls — always available when a block is selected, even with element selection */}
        {onSectionChange && (
          <SectionInspector block={block} tenantId={tenantId} onSectionChange={onSectionChange} />
        )}

        {isElementMode && fieldDef && selectedPath && onElementChange ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 p-3">
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Editing: {fieldDef.label}</p>
              <p className="text-[11px] text-zinc-500 font-mono truncate">{selectedPath}</p>
            </div>
            {fieldDef.type === "text" && (
              <InspectorField label={fieldDef.label}>
                <input
                  type="text"
                  value={(elementValue as string) ?? ""}
                  onChange={(e) => onElementChange(selectedPath!, e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </InspectorField>
            )}
            {fieldDef.type === "textarea" && (
              <InspectorField label={fieldDef.label}>
                <textarea
                  rows={3}
                  value={(elementValue as string) ?? ""}
                  onChange={(e) => onElementChange(selectedPath!, e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500 resize-y"
                />
              </InspectorField>
            )}
            {fieldDef.type === "image" && (
              <MediaUploadField
                label={fieldDef.label}
                value={elementValue as string | undefined}
                tenantId={tenantId}
                onChange={(url) => onElementChange(selectedPath!, url)}
              />
            )}
            {fieldDef.type === "action" && (
              <InspectorField label={fieldDef.label}>
                <input
                  type="text"
                  value={(elementValue as string) ?? ""}
                  onChange={(e) => onElementChange(selectedPath!, e.target.value)}
                  placeholder="/contact or https://..."
                  className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </InspectorField>
            )}
            {fieldDef.type === "icon" && (
              <InspectorField label={fieldDef.label}>
                <input
                  type="text"
                  value={(elementValue as string) ?? ""}
                  onChange={(e) => onElementChange(selectedPath!, e.target.value)}
                  placeholder="Icon name"
                  className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
                />
              </InspectorField>
            )}
            <button
              type="button"
              onClick={() => onElementChange(selectedPath!, "")}
              className="text-[11px] text-zinc-500 hover:text-zinc-700 dark:text-zinc-400"
            >
              Clear value
            </button>
          </div>
        ) : (
          (() => {
            switch (block.type) {
            case "hero":
              return (
                <HeroInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                />
              );
            case "features":
              return (
                <FeaturesInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                />
              );
            case "about":
              return (
                <AboutInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                />
              );
            case "gallery":
              return (
                <GalleryInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                />
              );
            case "testimonials":
              return (
                <TestimonialsInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                />
              );
            case "contact":
              return (
                <ContactInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                />
              );
            case "faq":
              return (
                <FaqInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                />
              );
            case "events_embed":
              return (
                <EventsEmbedInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                  availableEvents={availableEvents}
                />
              );
            case "products_embed":
              return (
                <ProductsEmbedInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                  availableProducts={availableProducts}
                />
              );
            case "fundraiser_embed":
              return (
                <FundraiserEmbedInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                  availableFundraisers={availableFundraisers}
                />
              );
            case "rich_text":
              return (
                <RichTextInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                />
              );
            case "cta_banner":
              return (
                <CtaBannerInspector
                  block={block}
                  onChange={onChange}
                  tenantId={tenantId}
                />
              );
            default:
              return (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-xs text-zinc-500">
                  No property inspector available for block type &quot;{(block as { type: string }).type}&quot;.
                </div>
              );
          }
        })()
        )}
      </div>
    </div>
  );
}
