"use client";

/**
 * Builder Hero section — hero image upload, alt text, focal picker,
 * scroll prompt. Same controls as the wizard Hero step.
 */

import type { BuilderDraft } from "../InvitationPageBuilder";
import { useTranslations } from "next-intl";
import { InvitationImageUploadField } from "@/components/invitation/InvitationImageUploadField";
import { InvitationFocalPicker } from "@/components/invitation/InvitationFocalPicker";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

export function HeroSection({ eventId, draft, updateDraft, disabled }: Props) {
  const t = useTranslations("Events");
  // Round 5 Cover: the cover page IS the hero photo — surface an explicit
  // empty state here instead of a quiet "No hero image" summary line.
  const isCover = draft.template_id === "cover";
  return (
    <div className="space-y-6">
      {isCover && !draft.hero_image_url && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5" role="status">
          <p className="text-xs font-bold text-amber-900">{t("coverPhotoTitle")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">{t("coverPhotoBody")}</p>
        </div>
      )}
      {/* Hero Image Upload */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-700">Hero Image</label>
        <div className="max-w-md">
          <InvitationImageUploadField
            value={draft.hero_image_url}
            folder={`invitation-hero/${eventId}`}
            label="Select Hero Image"
            hint="Full photo kept as-is. Optional crop/zoom inside. Resized to 1600px on upload."
            disabled={disabled}
            confirmLabel={isCover ? t("coverUseProcessedPhoto") : undefined}
            onUploaded={(url) => updateDraft({ hero_image_url: url })}
            onRemove={() => updateDraft({ hero_image_url: null })}
          />
        </div>
      </div>

      {/* Hero Image Alt Text */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="hero_image_alt" className="text-xs font-bold text-zinc-700">
            Image Alt Description (Accessibility)
          </label>
          <span className="text-[10px] text-zinc-400">
            {(draft.hero_image_alt || "").length} / 200
          </span>
        </div>
        <input
          id="hero_image_alt"
          type="text"
          maxLength={200}
          disabled={disabled}
          placeholder="e.g. Elegant ballroom decorated with floral centerpieces and chandeliers"
          value={draft.hero_image_alt ?? ""}
          onChange={(e) => updateDraft({ hero_image_alt: e.target.value || null })}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
        />
      </div>

      {/* Focal Point Picker (click/drag + live template-frame preview) */}
      <InvitationFocalPicker
        imageUrl={draft.hero_image_url}
        focal={{ x: draft.hero_image_focus_x ?? 50, y: draft.hero_image_focus_y ?? 50 }}
        onChange={(focal) =>
          updateDraft({ hero_image_focus_x: focal.x, hero_image_focus_y: focal.y })
        }
        templateId={draft.template_id}
        disabled={disabled}
      />

      {/* Scroll Prompt */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="scroll_prompt" className="text-xs font-bold text-zinc-700">
            Scroll Down Prompt Text
          </label>
          <span className="text-[10px] text-zinc-400">
            {(draft.scroll_prompt || "").length} / 80
          </span>
        </div>
        <input
          id="scroll_prompt"
          type="text"
          maxLength={80}
          disabled={disabled}
          placeholder="e.g. Scroll to view details & RSVP"
          value={draft.scroll_prompt ?? ""}
          onChange={(e) => updateDraft({ scroll_prompt: e.target.value || null })}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
        />
      </div>
    </div>
  );
}
