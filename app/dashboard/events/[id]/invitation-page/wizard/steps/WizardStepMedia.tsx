"use client";

import React from "react";
import type { WizardDraft } from "../InvitationPageWizard";
import type { EventLiveFields } from "@/lib/types/invitation-page-snapshot";
import { AudioUploadField } from "@/components/invitation/AudioUploadField";
import { InvitationGalleryManager } from "@/components/invitation/InvitationGalleryManager";

interface StepProps {
  eventId: string;
  draft: WizardDraft;
  event: EventLiveFields;
  updateDraft: (patch: Partial<WizardDraft>) => void;
  disabled?: boolean;
}

export function WizardStepMedia({ eventId, draft, updateDraft, disabled }: StepProps) {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-bold text-zinc-900">Audio & Photo Gallery</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Upload ambient background music and showcase photo memories in an interactive gallery.
        </p>
      </div>

      {/* Background Music Audio */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Background Music</h3>
        <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
          <AudioUploadField
            eventId={eventId}
            value={draft.music_audio_url}
            title={draft.music_title}
            locale={draft.locale || "en"}
            disabled={disabled}
            onChange={(url: string | null, title?: string | null) =>
              updateDraft({ music_audio_url: url, music_title: title || null })
            }
          />
        </div>
      </div>

      {/* Photo Gallery (Max 12, reorderable) */}
      <InvitationGalleryManager
        eventId={eventId}
        items={draft.gallery || []}
        onChange={(gallery) => updateDraft({ gallery })}
        disabled={disabled}
      />
    </div>
  );
}
