"use client";

import { COLOR_PALETTES, FONT_PACKS, legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import type { PageGlobalTheme } from "@/lib/page-composition";
import type { BuilderDraft } from "../InvitationPageBuilder";

interface Props {
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
}

const PALETTE_OPTIONS = Object.entries(COLOR_PALETTES).filter(([id]) => id.startsWith("palette-"));
const FONT_OPTIONS = Object.entries(FONT_PACKS).filter(([id]) => id.startsWith("font-"));

export function DesignSection({ draft, updateDraft }: Props) {
  const layout = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
  const theme = layout.global_theme;
  const selectedPalette = theme.palette_id ?? "";
  const selectedFontPack = theme.font_pack_id ?? "";
  const textScale = theme.text_scale ?? 1.0;

  function updateTheme(patch: Partial<Pick<PageGlobalTheme, "palette_id" | "font_pack_id" | "text_scale">>) {
    const currentLayout = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
    updateDraft({
      blocks_layout: {
        ...currentLayout,
        global_theme: { ...currentLayout.global_theme, ...patch },
      },
    });
  }

  return (
    <div className="space-y-7">
      <section aria-labelledby="invitation-palette-heading" className="space-y-3">
        <div>
          <h3 id="invitation-palette-heading" className="text-sm font-semibold text-zinc-900">Color palette</h3>
          <p className="mt-1 text-xs text-zinc-500">Choose the page background and text colors.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PALETTE_OPTIONS.map(([id, palette]) => {
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
      </section>

      <section aria-labelledby="invitation-font-heading" className="space-y-3 border-t border-zinc-200 pt-5">
        <div>
          <h3 id="invitation-font-heading" className="text-sm font-semibold text-zinc-900">Typography</h3>
          <p className="mt-1 text-xs text-zinc-500">Preview heading and paragraph styles.</p>
        </div>
        <div className="space-y-2">
          {FONT_OPTIONS.map(([id, fontPack]) => {
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
      </section>

      <section aria-labelledby="invitation-text-scale-heading" className="space-y-3 border-t border-zinc-200 pt-5">
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
      </section>
    </div>
  );
}
