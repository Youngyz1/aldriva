"use client";

import React from "react";
import type { WizardDraft } from "../InvitationPageWizard";
import type { EventLiveFields } from "@/lib/types/invitation-page-snapshot";
import { InvitationImageUploadField } from "@/components/invitation/InvitationImageUploadField";

interface StepProps {
  eventId: string;
  draft: WizardDraft;
  event: EventLiveFields;
  updateDraft: (patch: Partial<WizardDraft>) => void;
  disabled?: boolean;
}

export function WizardStepHero({ eventId, draft, updateDraft, disabled }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-900">Hero Cover Image & Focal Point</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Upload a high-resolution banner image that will serve as the background or top visual for your invitation.
        </p>
      </div>

      <div className="space-y-6">
        {/* Hero Image Upload */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-zinc-700">Hero Image</label>
          <div className="max-w-md">
            <InvitationImageUploadField
              value={draft.hero_image_url}
              folder={`invitation-hero/${eventId}`}
              aspectRatio={16 / 9}
              label="Select Hero Image"
              hint="Max 5MB. Compressed and resized up to 1600px for optimal loading."
              disabled={disabled}
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

        {/* Focal Point Controls */}
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-4 space-y-4">
          <div>
            <h3 className="text-xs font-bold text-zinc-800">Focal Point Alignment</h3>
            <p className="text-[11px] text-zinc-500">
              Control where the crop focuses on narrow mobile screens (0% = Left/Top, 100% = Right/Bottom).
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-700">Horizontal Focus (X)</span>
                <span className="font-bold text-orange-600">{draft.hero_image_focus_x ?? 50}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={disabled}
                value={draft.hero_image_focus_x ?? 50}
                onChange={(e) => updateDraft({ hero_image_focus_x: Number(e.target.value) })}
                className="w-full accent-orange-600"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-700">Vertical Focus (Y)</span>
                <span className="font-bold text-orange-600">{draft.hero_image_focus_y ?? 50}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                disabled={disabled}
                value={draft.hero_image_focus_y ?? 50}
                onChange={(e) => updateDraft({ hero_image_focus_y: Number(e.target.value) })}
                className="w-full accent-orange-600"
              />
            </div>
          </div>
        </div>

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
    </div>
  );
}
