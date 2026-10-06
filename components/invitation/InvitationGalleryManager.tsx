"use client";

/**
 * components/invitation/InvitationGalleryManager.tsx
 *
 * Invitation gallery editor: up to INVITATION_GALLERY_MAX photos with
 * reorder (up/down buttons), delete, per-photo alt text, and the shared
 * full-image uploader. Upload errors stay on the failing item with Retry.
 */

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { InvitationGalleryItem } from "@/types/invitation-template";
import { canAddGalleryItem, INVITATION_GALLERY_MAX, moveGalleryItem } from "@/lib/invitation-images";
import { InvitationImageUploadField } from "@/components/invitation/InvitationImageUploadField";

interface Props {
  eventId: string;
  items: InvitationGalleryItem[];
  onChange: (items: InvitationGalleryItem[]) => void;
  disabled?: boolean;
}

export function InvitationGalleryManager({ eventId, items, onChange, disabled }: Props) {
  const canAdd = canAddGalleryItem(items.length);

  function handleAdd() {
    if (!canAdd) return;
    onChange([...items, { url: "", alt: "", caption: "" }]);
  }

  function handleUpdate(index: number, patch: Partial<InvitationGalleryItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function handleRemove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function handleMove(index: number, direction: -1 | 1) {
    onChange(moveGalleryItem(items, index, direction));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Photo Gallery ({items.length} / {INVITATION_GALLERY_MAX})
          </h3>
          <p className="text-[11px] text-zinc-500">Add up to 12 featured photos for guests to explore.</p>
        </div>
        {canAdd && (
          <button
            type="button"
            disabled={disabled}
            onClick={handleAdd}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-50"
          >
            <Plus size={13} /> Add Photo
          </button>
        )}
      </div>

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center">
          <p className="text-xs text-zinc-400">No gallery photos added yet.</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.map((item, i) => (
          <div key={i} className="relative rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-700">Photo {i + 1}</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={disabled || i === 0}
                  onClick={() => handleMove(i, -1)}
                  className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                  aria-label={`Move photo ${i + 1} up`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  disabled={disabled || i === items.length - 1}
                  onClick={() => handleMove(i, 1)}
                  className="p-1 text-zinc-400 hover:text-zinc-700 disabled:opacity-30"
                  aria-label={`Move photo ${i + 1} down`}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => handleRemove(i)}
                  className="p-1 text-zinc-400 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Delete photo ${i + 1}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            <InvitationImageUploadField
              value={item.url}
              folder={`invitation-gallery/${eventId}`}
              label="Select Photo"
              hint="Max 5MB original (auto-resized to 1600px)"
              disabled={disabled}
              onUploaded={(url) => handleUpdate(i, { url })}
              onRemove={() => handleUpdate(i, { url: "" })}
            />

            <div className="space-y-2">
              <input
                type="text"
                maxLength={100}
                disabled={disabled}
                placeholder="Alt text (Accessibility, max 100)"
                value={item.alt || ""}
                onChange={(e) => handleUpdate(i, { alt: e.target.value || null })}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
              <input
                type="text"
                maxLength={150}
                disabled={disabled}
                placeholder="Caption (Optional, max 150)"
                value={item.caption || ""}
                onChange={(e) => handleUpdate(i, { caption: e.target.value || null })}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
