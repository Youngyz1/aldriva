"use client";

/**
 * Builder Details & Schedule section — migrated unchanged from
 * WizardStepDetails: venue overrides, multi-venue list, schedule
 * timeline, attire and notes.
 */

import { Plus, Trash2 } from "lucide-react";
import type { BuilderDraft } from "../InvitationPageBuilder";
import type { EventLiveFields } from "@/lib/types/invitation-page-snapshot";
import type { InvitationScheduleItem, InvitationVenueItem } from "@/types/invitation-template";

interface Props {
  draft: BuilderDraft;
  event: EventLiveFields;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

export function DetailsSection({ draft, event, updateDraft, disabled }: Props) {
  const schedule = draft.schedule || [];
  const venues = draft.venues || [];

  const handleAddScheduleItem = () => {
    if (schedule.length >= 15) return;
    const newItem: InvitationScheduleItem = {
      time: "6:00 PM",
      title: "Reception & Cocktails",
      label: "Reception & Cocktails",
      day: "",
      dayLabel: "",
      description: "",
    };
    updateDraft({ schedule: [...schedule, newItem] });
  };

  const handleUpdateScheduleItem = (index: number, patch: Partial<InvitationScheduleItem>) => {
    const next = [...schedule];
    next[index] = { ...next[index], ...patch };
    updateDraft({ schedule: next });
  };

  const handleRemoveScheduleItem = (index: number) => {
    updateDraft({ schedule: schedule.filter((_, i) => i !== index) });
  };

  const handleAddVenueItem = () => {
    if (venues.length >= 3) return;
    const newItem: InvitationVenueItem = {
      label: "Ceremony",
      name: "Grand Ballroom",
      address: "",
    };
    updateDraft({ venues: [...venues, newItem] });
  };

  const handleUpdateVenueItem = (index: number, patch: Partial<InvitationVenueItem>) => {
    const next = [...venues];
    next[index] = { ...next[index], ...patch };
    updateDraft({ venues: next });
  };

  const handleRemoveVenueItem = (index: number) => {
    updateDraft({ venues: venues.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-8">
      {/* Venue Overrides */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Venue & Parking</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="venue_name" className="text-xs font-bold text-zinc-700">
                Venue Name Override
              </label>
              <span className="text-[10px] text-zinc-400">{(draft.venue_name || "").length} / 200</span>
            </div>
            <input
              id="venue_name"
              type="text"
              maxLength={200}
              disabled={disabled}
              placeholder={event.venue || "e.g. The Metropolitan Club"}
              value={draft.venue_name ?? ""}
              onChange={(e) => updateDraft({ venue_name: e.target.value || null })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="address" className="text-xs font-bold text-zinc-700">
                Street Address Override
              </label>
              <span className="text-[10px] text-zinc-400">{(draft.address || "").length} / 300</span>
            </div>
            <input
              id="address"
              type="text"
              maxLength={300}
              disabled={disabled}
              placeholder={event.street_address || "e.g. 1 East 60th Street, New York, NY"}
              value={draft.address ?? ""}
              onChange={(e) => updateDraft({ address: e.target.value || null })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label htmlFor="parking_notes" className="text-xs font-bold text-zinc-700">
                Parking & Transportation Instructions
              </label>
              <span className="text-[10px] text-zinc-400">{(draft.parking_notes || "").length} / 300</span>
            </div>
            <input
              id="parking_notes"
              type="text"
              maxLength={300}
              disabled={disabled}
              placeholder="e.g. Complimentary valet parking is available at the main entrance."
              value={draft.parking_notes ?? ""}
              onChange={(e) => updateDraft({ parking_notes: e.target.value || null })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>
        </div>
      </div>

      {/* Multiple Venues (Optional, max 3) */}
      <div className="space-y-3 border-t border-zinc-200 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-900">Multiple Locations (Max 3)</h3>
            <p className="text-[11px] text-zinc-500">For events split across multiple venues (e.g. Ceremony & Reception).</p>
          </div>
          {venues.length < 3 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleAddVenueItem}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus size={13} /> Add Venue
            </button>
          )}
        </div>

        {venues.map((v, i) => (
          <div key={i} className="flex flex-col gap-2 border-t border-zinc-100 py-3 sm:flex-row sm:items-center">
            <input
              type="text"
              maxLength={30}
              disabled={disabled}
              placeholder="Label (e.g. Ceremony)"
              value={v.label}
              onChange={(e) => handleUpdateVenueItem(i, { label: e.target.value })}
              className="w-full sm:w-1/4 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
            />
            <input
              type="text"
              maxLength={150}
              disabled={disabled}
              placeholder="Venue Name (e.g. St. Patrick Cathedral)"
              value={v.name}
              onChange={(e) => handleUpdateVenueItem(i, { name: e.target.value })}
              className="w-full sm:w-1/3 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
            />
            <input
              type="text"
              maxLength={200}
              disabled={disabled}
              placeholder="Address (Optional)"
              value={v.address || ""}
              onChange={(e) => handleUpdateVenueItem(i, { address: e.target.value })}
              className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleRemoveVenueItem(i)}
              className="self-end sm:self-center p-1 text-zinc-400 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Schedule / Itinerary (Max 15) */}
      <div className="space-y-3 border-t border-zinc-200 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-900">Event Schedule / Timeline (Max 15)</h3>
            <p className="text-[11px] text-zinc-500">Order of events for guests to follow.</p>
          </div>
          {schedule.length < 15 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleAddScheduleItem}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus size={13} /> Add Item
            </button>
          )}
        </div>

        {schedule.map((item, i) => (
          <div key={i} className="flex flex-col gap-2 border-t border-zinc-100 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                maxLength={40}
                disabled={disabled}
                placeholder="Day (e.g. Day 1, Saturday)"
                value={item.day || item.dayLabel || ""}
                onChange={(e) =>
                  handleUpdateScheduleItem(i, {
                    day: e.target.value || null,
                    dayLabel: e.target.value || null,
                  })
                }
                className="w-full sm:w-1/4 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
              <input
                type="text"
                maxLength={20}
                disabled={disabled}
                placeholder="Time (e.g. 7:00 PM)"
                value={item.time}
                onChange={(e) => handleUpdateScheduleItem(i, { time: e.target.value })}
                className="w-full sm:w-1/4 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
              <input
                type="text"
                maxLength={80}
                disabled={disabled}
                placeholder="Title (e.g. Dinner & Keynote)"
                value={item.title || item.label || ""}
                onChange={(e) =>
                  handleUpdateScheduleItem(i, {
                    title: e.target.value,
                    label: e.target.value,
                  })
                }
                className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleRemoveScheduleItem(i)}
                className="self-end sm:self-center p-1 text-zinc-400 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              type="text"
              maxLength={200}
              disabled={disabled}
              placeholder="Short Description (Optional, max 200 chars)"
              value={item.description || ""}
              onChange={(e) => handleUpdateScheduleItem(i, { description: e.target.value || null })}
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
            />
          </div>
        ))}
      </div>

      {/* Attire & Notes */}
      <div className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Attire & Notes</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="dress_code" className="text-xs font-bold text-zinc-700">
                Dress Code
              </label>
              <span className="text-[10px] text-zinc-400">{(draft.dress_code || "").length} / 80</span>
            </div>
            <input
              id="dress_code"
              type="text"
              maxLength={80}
              disabled={disabled}
              placeholder="e.g. Black Tie Optional / Cocktail"
              value={draft.dress_code ?? ""}
              onChange={(e) => updateDraft({ dress_code: e.target.value || null })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="hashtag" className="text-xs font-bold text-zinc-700">
                Event Hashtag
              </label>
              <span className="text-[10px] text-zinc-400">{(draft.hashtag || "").length} / 100</span>
            </div>
            <input
              id="hashtag"
              type="text"
              maxLength={100}
              disabled={disabled}
              placeholder="e.g. #LuminaryGala2026"
              value={draft.hashtag ?? ""}
              onChange={(e) => updateDraft({ hashtag: e.target.value || null })}
              className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label htmlFor="dress_code_notes" className="text-xs font-bold text-zinc-700">
                Dress Code Notes
              </label>
              <span className="text-[10px] text-zinc-400">{(draft.dress_code_notes || "").length} / 500</span>
            </div>
            <textarea
              id="dress_code_notes"
              rows={2}
              maxLength={500}
              disabled={disabled}
              placeholder="e.g. Tuxedos and floor-length gowns encouraged. Dark suits and elegant cocktail dresses welcome."
              value={draft.dress_code_notes ?? ""}
              onChange={(e) => updateDraft({ dress_code_notes: e.target.value || null })}
              className="w-full rounded-xl border border-zinc-200 bg-white p-3.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label htmlFor="additional_notes" className="text-xs font-bold text-zinc-700">
                Additional Notes
              </label>
              <span className="text-[10px] text-zinc-400">{(draft.additional_notes || "").length} / 1000</span>
            </div>
            <textarea
              id="additional_notes"
              rows={3}
              maxLength={1000}
              disabled={disabled}
              placeholder="e.g. Security check-in requires a valid ID matching your guest pass. Photography is permitted during the reception."
              value={draft.additional_notes ?? ""}
              onChange={(e) => updateDraft({ additional_notes: e.target.value || null })}
              className="w-full rounded-xl border border-zinc-200 bg-white p-3.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
