"use client";

import React from "react";
import { Plus, Trash2 } from "lucide-react";
import type { WizardDraft } from "../InvitationPageWizard";
import type { EventLiveFields } from "@/lib/types/invitation-page-snapshot";
import { AudioUploadField } from "@/components/invitation/AudioUploadField";
import { InvitationImageUploadField } from "@/components/invitation/InvitationImageUploadField";
import type { InvitationGalleryItem } from "@/types/invitation-template";

interface StepProps {
  eventId: string;
  draft: WizardDraft;
  event: EventLiveFields;
  updateDraft: (patch: Partial<WizardDraft>) => void;
  disabled?: boolean;
}

export function WizardStepMedia({ eventId, draft, updateDraft, disabled }: StepProps) {
  const gallery = draft.gallery || [];

  const handleAddGalleryItem = () => {
    if (gallery.length >= 12) return;
    const newItem: InvitationGalleryItem = {
      url: "",
      alt: "",
      caption: "",
    };
    updateDraft({ gallery: [...gallery, newItem] });
  };

  const handleUpdateGalleryItem = (index: number, patch: Partial<InvitationGalleryItem>) => {
    const next = [...gallery];
    next[index] = { ...next[index], ...patch };
    updateDraft({ gallery: next });
  };

  const handleRemoveGalleryItem = (index: number) => {
    updateDraft({ gallery: gallery.filter((_, i) => i !== index) });
  };

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

      {/* Photo Gallery (Max 12) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Photo Gallery ({gallery.length} / 12)
            </h3>
            <p className="text-[11px] text-zinc-500">Add up to 12 featured photos for guests to explore.</p>
          </div>
          {gallery.length < 12 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleAddGalleryItem}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus size={13} /> Add Photo
            </button>
          )}
        </div>

        {gallery.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center">
            <p className="text-xs text-zinc-400">No gallery photos added yet.</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {gallery.map((item, i) => (
            <div key={i} className="relative rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-700">Photo {i + 1}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRemoveGalleryItem(i)}
                  className="p-1 text-zinc-400 hover:text-red-600 disabled:opacity-50"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <InvitationImageUploadField
                value={item.url}
                folder={`invitation-gallery/${eventId}`}
                aspectRatio={4 / 3}
                label="Select Photo"
                hint="Max 5MB (auto-compressed)"
                disabled={disabled}
                onUploaded={(url) => handleUpdateGalleryItem(i, { url })}
                onRemove={() => handleUpdateGalleryItem(i, { url: "" })}
              />

              <div className="space-y-2">
                <input
                  type="text"
                  maxLength={100}
                  disabled={disabled}
                  placeholder="Alt text (Accessibility, max 100)"
                  value={item.alt || ""}
                  onChange={(e) => handleUpdateGalleryItem(i, { alt: e.target.value || null })}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
                />
                <input
                  type="text"
                  maxLength={150}
                  disabled={disabled}
                  placeholder="Caption (Optional, max 150)"
                  value={item.caption || ""}
                  onChange={(e) => handleUpdateGalleryItem(i, { caption: e.target.value || null })}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
