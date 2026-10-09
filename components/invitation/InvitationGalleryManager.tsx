"use client";

/**
 * components/invitation/InvitationGalleryManager.tsx
 *
 * Invitation gallery editor: up to INVITATION_GALLERY_MAX photos with
 * reorder (up/down buttons), delete, per-photo alt text, and the shared
 * full-image uploader. Upload errors stay on the failing item with Retry.
 */

import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import type { InvitationGalleryItem } from "@/types/invitation-template";
import { canAddGalleryItem, INVITATION_GALLERY_MAX, moveGalleryItem } from "@/lib/invitation-images";
import {
  InvitationImageUploadBatchField,
  InvitationImageUploadField,
} from "@/components/invitation/InvitationImageUploadField";

interface Props {
  eventId: string;
  items: InvitationGalleryItem[];
  onChange: (items: InvitationGalleryItem[]) => void;
  disabled?: boolean;
}

export function InvitationGalleryManager({ eventId, items, onChange, disabled }: Props) {
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  const canAdd = canAddGalleryItem(items.length);

  function setItems(next: InvitationGalleryItem[]) {
    itemsRef.current = next;
    onChange(next);
  }

  function handleBatchUploaded(url: string) {
    const current = itemsRef.current;
    if (!canAddGalleryItem(current.length)) return;
    setItems([...current, { url, alt: "", caption: "" }]);
  }

  function handleUpdate(index: number, patch: Partial<InvitationGalleryItem>) {
    setItems(itemsRef.current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function handleRemove(index: number) {
    setItems(itemsRef.current.filter((_, i) => i !== index));
  }

  function handleMove(index: number, direction: -1 | 1) {
    setItems(moveGalleryItem(itemsRef.current, index, direction));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Photo Gallery ({items.length} / {INVITATION_GALLERY_MAX})
          </h3>
          <p className="text-[11px] text-zinc-500">Add up to 12 featured photos for guests to explore.</p>
        </div>
        {canAdd && (
          <InvitationImageUploadBatchField
            folder={`invitation-gallery/${eventId}`}
            maxFiles={Math.max(0, INVITATION_GALLERY_MAX - items.length)}
            disabled={disabled}
            onUploaded={handleBatchUploaded}
          />
        )}
      </div>

      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-200 p-6 text-center">
          <p className="text-xs text-zinc-400">No gallery photos added yet.</p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((item, i) => (
          <div key={i} className="border-t border-zinc-200 py-4 first:border-t-0 first:pt-0 space-y-3">
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
