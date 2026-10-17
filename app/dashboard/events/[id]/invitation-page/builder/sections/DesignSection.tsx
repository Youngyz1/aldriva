"use client";

import { COLOR_PALETTES, FONT_PACKS, legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import {
  defaultInvitationEffectConfig,
  getDefaultInvitationTemplateDefinition,
  getInvitationTemplateDefinition,
  type InvitationEffectConfig,
  type InvitationEffectType,
} from "@/lib/invitation-template-registry";
import type { PageGlobalTheme } from "@/lib/page-composition";
import type { BuilderDraft } from "../InvitationPageBuilder";

interface Props {
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
}

const PALETTE_OPTIONS = Object.entries(COLOR_PALETTES).filter(([id]) => id.startsWith("palette-"));
const FONT_OPTIONS = Object.entries(FONT_PACKS).filter(([id]) => id.startsWith("font-"));
const EFFECT_LABELS: Record<InvitationEffectType, { label: string; description: string }> = {
  "envelope-reveal": { label: "Envelope reveal", description: "Show the invitation behind a tappable seal." },
  "scroll-reveal": { label: "Section reveal", description: "Reveal sections gently as guests scroll." },
  "falling-petals": { label: "Falling petals", description: "Add a light, decorative petal drift." },
};

export function DesignSection({ draft, updateDraft }: Props) {
  const definition = getInvitationTemplateDefinition(draft.template_id) ?? getDefaultInvitationTemplateDefinition();
  const isBotanicalReverie = definition.id === "botanical-reverie";
  const customizations = definition.supportedCustomizations;
  const layout = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
  const theme = layout.global_theme;
  const selectedPalette = theme.palette_id ?? "";
  const selectedFontPack = theme.font_pack_id ?? "";
  const textScale = theme.text_scale ?? 1.0;
  const paletteOptions = isBotanicalReverie
    ? PALETTE_OPTIONS.filter(([id]) => ["palette-botanical", "palette-rose", "palette-emerald"].includes(id))
    : PALETTE_OPTIONS;
  const fontOptions = isBotanicalReverie
    ? FONT_OPTIONS.filter(([id]) => ["font-serif-editorial", "font-serif-classic", "font-sans-clean"].includes(id))
    : FONT_OPTIONS;

  function updateTheme(patch: Partial<Pick<PageGlobalTheme, "palette_id" | "font_pack_id" | "text_scale">>) {
    const currentLayout = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
    updateDraft({
      blocks_layout: {
        ...currentLayout,
        global_theme: { ...currentLayout.global_theme, ...patch },
      },
    });
  }

  function updateEffect(type: InvitationEffectType, patch: Partial<InvitationEffectConfig>) {
    const currentLayout = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
    const savedEffect = currentLayout.effects?.find((effect) => effect.type === type);
    const nextEffect = {
      ...defaultInvitationEffectConfig(type),
      ...(savedEffect?.type === type ? savedEffect : {}),
      ...patch,
      type,
    } as InvitationEffectConfig;
    const effects = [
      ...(currentLayout.effects ?? []).filter((effect) => effect.type !== type),
      nextEffect,
    ];
    updateDraft({ blocks_layout: { ...currentLayout, effects } });
  }

  function effectFor(type: InvitationEffectType): InvitationEffectConfig {
    return layout.effects?.find((effect) => effect.type === type) ?? defaultInvitationEffectConfig(type);
  }

  return (
    <div className="space-y-7">
      {isBotanicalReverie ? (
        <aside className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs leading-relaxed text-emerald-950">
          Palette, type, and text scale update the webpage. The botanical card keeps its stationery design; the selected hero photo and event details appear on both.
        </aside>
      ) : null}
      {customizations.palette ? <section aria-labelledby="invitation-palette-heading" className="space-y-3">
        <div>
          <h3 id="invitation-palette-heading" className="text-sm font-semibold text-zinc-900">Color palette</h3>
          <p className="mt-1 text-xs text-zinc-500">Choose the page background and text colors.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {paletteOptions.map(([id, palette]) => {
            const selected = selectedPalette === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={`Use ${palette.label} color palette`}
                aria-pressed={selected}
                onClick={() => updateTheme({ palette_id: id })}
                className={`rounded-lg border p-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${selected ? "border-orange-600 ring-1 ring-orange-600" : "border-zinc-200 hover:border-zinc-400"}`}
              >
                <span className="mb-2 flex gap-1.5" aria-hidden="true">
                  {palette.previewColors.map((color, index) => (
                    <span key={`${id}-swatch-${index}`} className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: color }} />
                  ))}
                </span>
                <span className={`block truncate rounded px-1.5 py-1 text-[11px] font-semibold ${palette.page ?? "bg-white text-zinc-900"}`}>
                  {palette.label}
                </span>
              </button>
            );
          })}
        </div>
      </section> : null}

      {customizations.fontPack ? <section aria-labelledby="invitation-font-heading" className="space-y-3 border-t border-zinc-200 pt-5">
        <div>
          <h3 id="invitation-font-heading" className="text-sm font-semibold text-zinc-900">Typography</h3>
          <p className="mt-1 text-xs text-zinc-500">Preview heading and paragraph styles.</p>
        </div>
        <div className="space-y-2">
          {fontOptions.map(([id, fontPack]) => {
            const selected = selectedFontPack === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={selected}
                onClick={() => updateTheme({ font_pack_id: id })}
                className={`block w-full rounded-lg border px-3 py-2.5 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${selected ? "border-orange-600 bg-orange-50 ring-1 ring-orange-600" : "border-zinc-200 hover:border-zinc-400"}`}
              >
                <span className={`block text-sm text-zinc-900 ${fontPack.heading}`}>{fontPack.label}</span>
                <span className={`mt-1 block text-xs text-zinc-600 ${fontPack.body}`}>An invitation to remember.</span>
              </button>
            );
          })}
        </div>
      </section> : null}

      {customizations.textScale ? <section aria-labelledby="invitation-text-scale-heading" className="space-y-3 border-t border-zinc-200 pt-5">
        <div className="flex items-center justify-between gap-3">
          <label id="invitation-text-scale-heading" htmlFor="invitation-text-scale" className="text-sm font-semibold text-zinc-900">
            Text Size / Taille du texte
          </label>
          <output htmlFor="invitation-text-scale" className="text-xs tabular-nums text-zinc-600">
            {Math.round(textScale * 100)}%
          </output>
        </div>
        <input
          id="invitation-text-scale"
          type="range"
          min="0.8"
          max="1.4"
          step="0.05"
          value={textScale}
          aria-valuetext={`${Math.round(textScale * 100)}%`}
          onChange={(event) => updateTheme({ text_scale: Number(event.target.value) })}
          className="w-full accent-orange-700"
        />
        <div className="flex justify-between text-[11px] text-zinc-500" aria-hidden="true">
          <span>80%</span><span>110%</span><span>140%</span>
        </div>
      </section> : null}

      {definition.supportedEffects.length ? <section aria-labelledby="invitation-motion-heading" className="space-y-3 border-t border-zinc-200 pt-5">
        <div>
          <h3 id="invitation-motion-heading" className="text-sm font-semibold text-zinc-900">Motion &amp; effects</h3>
          <p className="mt-1 text-xs text-zinc-500">Optional motion respects guests’ reduced-motion settings.</p>
        </div>
        <div className="space-y-3">
          {definition.supportedEffects.map((type) => {
            const current = effectFor(type);
            return (
              <div key={type} className="space-y-2">
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-800">
                  <input
                    type="checkbox"
                    checked={current.enabled}
                    onChange={(event) => updateEffect(type, { enabled: event.currentTarget.checked })}
                    className="mt-0.5 size-4 accent-orange-700"
                  />
                  <span>
                    <span className="block font-medium">{EFFECT_LABELS[type].label}</span>
                    <span className="mt-0.5 block text-xs text-zinc-500">{EFFECT_LABELS[type].description}</span>
                  </span>
                </label>
                {type === "falling-petals" && current.type === "falling-petals" && current.enabled ? (
                  <div className="pl-6">
                    <div className="flex items-center justify-between gap-3">
                      <label htmlFor="invitation-petal-density" className="text-xs text-zinc-600">Petal density</label>
                      <output htmlFor="invitation-petal-density" className="text-xs tabular-nums text-zinc-600">{current.density}</output>
                    </div>
                    <input
                      id="invitation-petal-density"
                      type="range"
                      min="1"
                      max="12"
                      step="1"
                      value={current.density}
                      onChange={(event) => updateEffect("falling-petals", { density: Number(event.currentTarget.value) })}
                      className="w-full accent-orange-700"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section> : null}
    </div>
  );
}
