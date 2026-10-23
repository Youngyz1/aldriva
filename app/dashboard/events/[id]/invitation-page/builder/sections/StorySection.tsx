"use client";

/**
 * Builder Story section: welcome headline/text and up to four reorderable
 * story moments. The existing wedding_story JSONB field stores each image,
 * caption, and optional text; the old single story_image_url remains readable.
 */

import { IconArrowDown as ArrowDown, IconArrowUp as ArrowUp, IconPlus as Plus, IconTrash as Trash2 } from "@tabler/icons-react";
import type { BuilderDraft } from "../InvitationPageBuilder";
import { InvitationImageUploadField } from "@/components/invitation/InvitationImageUploadField";
import type { WeddingStoryItem } from "@/lib/types/invitation-page-snapshot";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

const MAX_STORY_MOMENTS = 4;

export function StorySection({ eventId, draft, updateDraft, disabled }: Props) {
  const stories: WeddingStoryItem[] =
    draft.wedding_story?.length
      ? draft.wedding_story
      : draft.story_image_url
        ? [{ image: draft.story_image_url, title: null, text: null }]
        : [];

  function writeStories(next: WeddingStoryItem[]) {
    updateDraft({ wedding_story: next, story_image_url: null });
  }

  function updateStory(index: number, patch: Partial<WeddingStoryItem>) {
    writeStories(stories.map((story, i) => (i === index ? { ...story, ...patch } : story)));
  }

  function moveStory(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stories.length) return;
    const next = [...stories];
    [next[index], next[target]] = [next[target], next[index]];
    writeStories(next);
  }

  return (
    <div className="space-y-5">
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
          className="min-w-0 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
        />
      </div>

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
          className="min-w-0 w-full rounded-xl border border-zinc-200 bg-white p-3.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
        />
      </div>

      <section className="space-y-3 border-t border-zinc-200 pt-4" aria-label="Our story images">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-bold text-zinc-900">Our Story Moments (Up to 4)</h3>
            <p className="mt-1 text-[11px] text-zinc-500">
              Add an image, caption, or short text for each moment. Use the arrows to reorder them.
            </p>
          </div>
          {stories.length < MAX_STORY_MOMENTS && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => writeStories([...stories, { title: "", text: "", image: null }])}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus size={13} /> Add moment
            </button>
          )}
        </div>

        {stories.map((story, index) => (
          <article key={index} className="grid min-w-0 gap-3 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <h4 className="truncate text-xs font-bold text-zinc-800">Story moment {index + 1}</h4>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={disabled || index === 0}
                  onClick={() => moveStory(index, -1)}
                  aria-label={`Move story moment ${index + 1} up`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={disabled || index === stories.length - 1}
                  onClick={() => moveStory(index, 1)}
                  aria-label={`Move story moment ${index + 1} down`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => writeStories(stories.filter((_, i) => i !== index))}
                  aria-label={`Remove story moment ${index + 1}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <InvitationImageUploadField
              value={story.image ?? null}
              folder={`invitation-story/${eventId}`}
              label={`Select image for story moment ${index + 1}`}
              hint="Optional. A failed image is hidden on the invitation."
              disabled={disabled}
              onUploaded={(url) => updateStory(index, { image: url })}
              onRemove={() => updateStory(index, { image: null })}
            />

            <input
              type="text"
              maxLength={80}
              disabled={disabled}
              placeholder="Caption (optional)"
              value={story.title ?? ""}
              onChange={(e) => updateStory(index, { title: e.target.value || null })}
              aria-label={`Caption for story moment ${index + 1}`}
              className="min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
            />
            <textarea
              rows={3}
              maxLength={500}
              disabled={disabled}
              placeholder="Text for this moment (optional)"
              value={story.text ?? ""}
              onChange={(e) => updateStory(index, { text: e.target.value || null })}
              aria-label={`Text for story moment ${index + 1}`}
              className="min-w-0 w-full rounded-lg border border-zinc-200 px-3 py-2 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
            />
          </article>
        ))}
      </section>
    </div>
  );
}
