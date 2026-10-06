"use client";

/**
 * Builder Story section — migrated unchanged from WizardStepStory:
 * headline, text, optional story image.
 */

import type { BuilderDraft } from "../InvitationPageBuilder";
import { InvitationImageUploadField } from "@/components/invitation/InvitationImageUploadField";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

export function StorySection({ eventId, draft, updateDraft, disabled }: Props) {
  return (
    <div className="space-y-5">
      {/* Story Headline */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="story_headline" className="text-xs font-bold text-zinc-700">
            Story Headline
          </label>
          <span className="text-[10px] text-zinc-400">
            {(draft.story_headline || "").length} / 120
          </span>
        </div>
        <input
          id="story_headline"
          type="text"
          maxLength={120}
          disabled={disabled}
          placeholder="e.g. A Decade of Impact & Hope"
          value={draft.story_headline ?? ""}
          onChange={(e) => updateDraft({ story_headline: e.target.value || null })}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
        />
      </div>

      {/* Story Text */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="story_text" className="text-xs font-bold text-zinc-700">
            Story Text
          </label>
          <span className="text-[10px] text-zinc-400">
            {(draft.story_text || "").length} / 3000
          </span>
        </div>
        <textarea
          id="story_text"
          rows={6}
          maxLength={3000}
          disabled={disabled}
          placeholder="Write your story or event description here..."
          value={draft.story_text ?? ""}
          onChange={(e) => updateDraft({ story_text: e.target.value || null })}
          className="w-full rounded-xl border border-zinc-200 bg-white p-3.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
        />
      </div>

      {/* Story Accompanying Image */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-zinc-700">Story Image (Optional)</label>
        <div className="max-w-md">
          <InvitationImageUploadField
            value={draft.story_image_url}
            folder={`invitation-story/${eventId}`}
            label="Select Story Image"
            hint="Optional image featured alongside the narrative."
            disabled={disabled}
            onUploaded={(url) => updateDraft({ story_image_url: url })}
            onRemove={() => updateDraft({ story_image_url: null })}
          />
        </div>
      </div>
    </div>
  );
}
