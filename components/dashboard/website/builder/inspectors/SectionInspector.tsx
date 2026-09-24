"use client";

import React from "react";
import { Block, SectionSpacing, SectionContainer } from "@/lib/website-blocks";
import { InspectorField } from "./common/InspectorField";
import { InspectorSection } from "./common/InspectorSection";
import { MediaUploadField } from "./common/MediaUploadField";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface SectionInspectorProps {
  block: Block;
  tenantId: string;
  onSectionChange: (patch: Partial<Record<string, unknown>>) => void;
}

export function SectionInspector({ block, tenantId, onSectionChange }: SectionInspectorProps) {
  const b = block as unknown as Record<string, unknown>;
  const visible = (b.visible as boolean | undefined) !== false; // default true
  const hiddenOnMobile = Boolean(b.hiddenOnMobile);
  const spacing = (b.spacing as SectionSpacing | undefined) ?? "default";
  const container = (b.container as SectionContainer | undefined) ?? "constrained";
  const bg = (b.background as Record<string, unknown> | undefined) ?? {};
  const bgColor = (bg.color as string | undefined) ?? "";
  const bgImage = (bg.image as string | undefined) ?? "";
  const bgOverlay = (bg.overlay as number | undefined) ?? 0;

  function updateBackground(next: Record<string, unknown>) {
    const merged = { ...bg, ...next };
    // Remove empty keys to allow clearing
    if (!merged.color) delete merged.color;
    if (!merged.image) delete merged.image;
    if (merged.overlay == null || merged.overlay === 0) {
      // keep 0 as explicit? allow 0 to be cleared to default (no overlay)
      if (merged.overlay === 0) delete merged.overlay;
    }
    const hasKeys = Object.keys(merged).length > 0;
    if (!hasKeys) onSectionChange({ background: undefined });
    else onSectionChange({ background: merged as unknown as Record<string, unknown> });
  }

  return (
    <InspectorSection title="Section" description="Visibility, spacing, background and responsive controls" defaultOpen>
      {/* Visibility */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/30 px-3 py-2.5">
        <div className="space-y-0.5">
          <Label htmlFor={`visible-${b.id}`} className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer">
            Show Section
          </Label>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Hidden sections stay in data and are reorderable</p>
        </div>
        <Switch
          id={`visible-${b.id}`}
          checked={visible}
          onCheckedChange={(checked) => onSectionChange({ visible: checked })}
          aria-label="Toggle section visibility"
        />
      </div>

      {/* Hide on mobile */}
      <div className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5">
        <div className="space-y-0.5">
          <Label htmlFor={`hom-${b.id}`} className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer">
            Hide on Mobile
          </Label>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Visible on desktop/tablet, hidden below 640px</p>
        </div>
        <Switch
          id={`hom-${b.id}`}
          checked={hiddenOnMobile}
          onCheckedChange={(checked) => onSectionChange({ hiddenOnMobile: checked })}
          aria-label="Toggle hide on mobile"
        />
      </div>

      {/* Spacing */}
      <InspectorField label="Section Spacing" description="Vertical padding around the section">
        <select
          value={spacing}
          onChange={(e) => onSectionChange({ spacing: e.target.value as SectionSpacing })}
          aria-label="Section spacing"
          className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
        >
          <option value="compact">Compact — tight</option>
          <option value="default">Default — balanced</option>
          <option value="roomy">Roomy — generous</option>
        </select>
      </InspectorField>

      {/* Container — H1 */}
      <InspectorField label="Container" description="Content width inside the section">
        <div className="grid grid-cols-4 gap-1.5">
          {(["narrow", "constrained", "wide", "full"] as SectionContainer[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onSectionChange({ container: v })}
              aria-label={`Container ${v}`}
              aria-pressed={container === v}
              className={`rounded-lg border px-2 py-2 text-[11px] font-semibold capitalize transition ${
                container === v
                  ? "border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-950/40 dark:text-brand-300"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-750"
              }`}
            >
              {v === "constrained" ? "Standard" : v}
            </button>
          ))}
        </div>
      </InspectorField>

      {/* Background — controlled presets (H5) — no arbitrary hex picker */}
      <InspectorField label="Background Color" description="Controlled presets from Aldriva design system">
        <select
          value={["", "#ffffff", "#fafafa", "#fff7ed"].includes(bgColor) ? bgColor : ""}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) updateBackground({ color: undefined });
            else updateBackground({ color: v });
          }}
          aria-label="Background color preset"
          className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
        >
          <option value="">Default — transparent</option>
          <option value="#ffffff">Surface — White</option>
          <option value="#fafafa">Muted — Zinc 50</option>
          <option value="#fff7ed">Brand Light — Orange 50</option>
        </select>
      </InspectorField>

      <MediaUploadField
        label="Background Image"
        description="Optional image behind the section"
        value={bgImage || undefined}
        tenantId={tenantId}
        onChange={(url) => updateBackground({ image: url || undefined })}
      />

      <InspectorField label="Image Overlay" description="Dark overlay over background image">
        <select
          value={String(bgOverlay)}
          onChange={(e) => updateBackground({ overlay: Number(e.target.value) })}
          aria-label="Background overlay"
          className="w-full text-xs px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-xl bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-orange-500"
          disabled={!bgImage}
        >
          <option value="0">None</option>
          <option value="0.25">Light (25%)</option>
          <option value="0.5">Medium (50%)</option>
          <option value="0.75">Strong (75%)</option>
        </select>
      </InspectorField>

      {(bgColor || bgImage) && (
        <button
          type="button"
          onClick={() => onSectionChange({ background: undefined })}
          className="w-full text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800"
          aria-label="Clear background"
        >
          Clear Background
        </button>
      )}
    </InspectorSection>
  );
}
