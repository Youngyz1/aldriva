"use client";

/**
 * Builder Music section — background music upload (invitation-media).
 * Same AudioUploadField wiring as the wizard Media step.
 */

import type { BuilderDraft } from "../InvitationPageBuilder";
import { AudioUploadField } from "@/components/invitation/AudioUploadField";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

export function MusicSection({ eventId, draft, updateDraft, disabled }: Props) {
  return (
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
  );
}
