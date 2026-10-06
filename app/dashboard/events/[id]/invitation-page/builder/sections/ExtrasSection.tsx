"use client";

/**
 * Builder Special-fields section — migrated from WizardStepExtras
 * (couple/celebrant names, accommodations, colors of the day).
 *
 * Visibility is driven by the type picker once chosen (shown only after
 * the type is picked, per spec); before that, the selected template's
 * category decides. Hidden fields stay stored and reappear on switch-back.
 */

import { Plus, Trash2 } from "lucide-react";
import type { BuilderDraft } from "../InvitationPageBuilder";
import type { WeddingSubtype, ColorOfTheDayItem } from "@/lib/types/invitation-page-snapshot";
import type { InvitationAccommodationItem } from "@/types/invitation-template";
import type { InvitationType } from "@/lib/invitation-type-fields";

interface Props {
  draft: BuilderDraft;
  invitationType: InvitationType | null;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

const WEDDING_SUBTYPES: { value: WeddingSubtype; label: string }[] = [
  { value: "traditional", label: "Traditional Wedding" },
  { value: "civil", label: "Civil Ceremony" },
  { value: "church", label: "Church / Religious Ceremony" },
  { value: "engagement", label: "Engagement Celebration" },
  { value: "vow_renewal", label: "Vow Renewal" },
];

export function ExtrasSection({ draft, invitationType, updateDraft, disabled }: Props) {
  const isWedding = invitationType
    ? invitationType === "wedding"
    : draft.template_id === "wedding-romantic";
  const isBirthday = invitationType
    ? invitationType === "birthday"
    : draft.template_id === "birthday-bold";

  const accommodations = draft.accommodations || [];
  const colors = draft.colors_of_the_day || [];

  const handleAddAccommodation = () => {
    if (accommodations.length >= 6) return;
    const newItem: InvitationAccommodationItem = {
      name: "The Grand Hotel",
      notes: "Mention Luminary Gala for negotiated group rates.",
      bookingUrl: "",
    };
    updateDraft({ accommodations: [...accommodations, newItem] });
  };

  const handleUpdateAccommodation = (index: number, patch: Partial<InvitationAccommodationItem>) => {
    const next = [...accommodations];
    next[index] = { ...next[index], ...patch };
    updateDraft({ accommodations: next });
  };

  const handleRemoveAccommodation = (index: number) => {
    updateDraft({ accommodations: accommodations.filter((_, i) => i !== index) });
  };

  const handleAddColor = () => {
    if (colors.length >= 5) return;
    const newItem: ColorOfTheDayItem = {
      name: "Champagne Gold",
      hex: "#F4B266",
    };
    updateDraft({ colors_of_the_day: [...colors, newItem] });
  };

  const handleUpdateColor = (index: number, patch: Partial<ColorOfTheDayItem>) => {
    const next = [...colors];
    next[index] = { ...next[index], ...patch };
    updateDraft({ colors_of_the_day: next });
  };

  const handleRemoveColor = (index: number) => {
    updateDraft({ colors_of_the_day: colors.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-8">
      {!isWedding && !isBirthday && (
        <p className="text-xs text-zinc-500">
          {invitationType === "other" || invitationType === "gala"
            ? "Generic invitation — no special fields for this type. Accommodations and colors below still apply."
            : "Pick Wedding or Birthday above to see its special fields. Accommodations and colors below apply to every template."}
        </p>
      )}

      {/* Wedding specific fields */}
      {isWedding && (
        <div className="space-y-4 rounded-xl border border-rose-200 bg-rose-50/40 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-rose-900">Wedding Configuration</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="partner1_name" className="text-xs font-bold text-zinc-700">
                Partner 1 First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="partner1_name"
                type="text"
                maxLength={100}
                disabled={disabled}
                placeholder="e.g. Alexandre"
                value={draft.partner1_name ?? ""}
                onChange={(e) => updateDraft({ partner1_name: e.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="partner2_name" className="text-xs font-bold text-zinc-700">
                Partner 2 First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="partner2_name"
                type="text"
                maxLength={100}
                disabled={disabled}
                placeholder="e.g. Geneviève"
                value={draft.partner2_name ?? ""}
                onChange={(e) => updateDraft({ partner2_name: e.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="wedding_subtype" className="text-xs font-bold text-zinc-700">
                Celebration Style
              </label>
              <select
                id="wedding_subtype"
                disabled={disabled}
                value={draft.wedding_subtype ?? ""}
                onChange={(e) => updateDraft({ wedding_subtype: (e.target.value as WeddingSubtype) || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              >
                <option value="">Select style...</option>
                {WEDDING_SUBTYPES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="registry_note" className="text-xs font-bold text-zinc-700">
                Gift Registry Note
              </label>
              <input
                id="registry_note"
                type="text"
                maxLength={500}
                disabled={disabled}
                placeholder="e.g. Your presence is our gift. For those who wish, our registry is at..."
                value={draft.registry_note ?? ""}
                onChange={(e) => updateDraft({ registry_note: e.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="family_note" className="text-xs font-bold text-zinc-700">
                Family & Parents Note
              </label>
              <input
                id="family_note"
                type="text"
                maxLength={500}
                disabled={disabled}
                placeholder="e.g. Together with their families..."
                value={draft.family_note ?? ""}
                onChange={(e) => updateDraft({ family_note: e.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>
          </div>
        </div>
      )}

      {/* Birthday specific fields */}
      {isBirthday && (
        <div className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">Birthday Configuration</h3>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="celebrant_name" className="text-xs font-bold text-zinc-700">
                Celebrant Name <span className="text-red-500">*</span>
              </label>
              <input
                id="celebrant_name"
                type="text"
                maxLength={100}
                disabled={disabled}
                placeholder="e.g. Marcus Aurelius"
                value={draft.celebrant_name ?? ""}
                onChange={(e) => updateDraft({ celebrant_name: e.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="age_milestone" className="text-xs font-bold text-zinc-700">
                Age Milestone (Optional)
              </label>
              <input
                id="age_milestone"
                type="text"
                maxLength={20}
                disabled={disabled}
                placeholder="e.g. 40th, 50, Sweet 16"
                value={draft.age_milestone ?? ""}
                onChange={(e) => updateDraft({ age_milestone: e.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="theme" className="text-xs font-bold text-zinc-700">
                Party Theme
              </label>
              <input
                id="theme"
                type="text"
                maxLength={80}
                disabled={disabled}
                placeholder="e.g. Neon Disco, Roaring 20s"
                value={draft.theme ?? ""}
                onChange={(e) => updateDraft({ theme: e.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="gift_note" className="text-xs font-bold text-zinc-700">
                Gift Preference Note
              </label>
              <input
                id="gift_note"
                type="text"
                maxLength={500}
                disabled={disabled}
                placeholder="e.g. No boxed gifts please. Donations to our charity fund are welcomed."
                value={draft.gift_note ?? ""}
                onChange={(e) => updateDraft({ gift_note: e.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
              />
            </div>
          </div>
        </div>
      )}

      {/* Accommodations (Max 6) */}
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-900">Hotel & Accommodation Recommendations (Max 6)</h3>
            <p className="text-[11px] text-zinc-500">Provide room blocks and booking links for out-of-town guests.</p>
          </div>
          {accommodations.length < 6 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleAddAccommodation}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus size={13} /> Add Hotel
            </button>
          )}
        </div>

        {accommodations.map((acc, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                maxLength={100}
                disabled={disabled}
                placeholder="Hotel Name (e.g. St. Regis)"
                value={acc.name}
                onChange={(e) => handleUpdateAccommodation(i, { name: e.target.value })}
                className="w-full sm:w-1/3 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
              <input
                type="text"
                maxLength={500}
                disabled={disabled}
                placeholder="Booking URL (e.g. https://...)"
                value={acc.bookingUrl || ""}
                onChange={(e) => handleUpdateAccommodation(i, { bookingUrl: e.target.value || null })}
                className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleRemoveAccommodation(i)}
                className="self-end sm:self-center p-1 text-zinc-400 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <input
              type="text"
              maxLength={200}
              disabled={disabled}
              placeholder="Notes or Promo Code (e.g. Group code GALA26 for 15% discount)"
              value={acc.notes || ""}
              onChange={(e) => handleUpdateAccommodation(i, { notes: e.target.value || null })}
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
            />
          </div>
        ))}
      </div>

      {/* Colors of the Day (Max 5) */}
      <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-zinc-900">Color Palette & Swatches (Max 5)</h3>
            <p className="text-[11px] text-zinc-500">Inspire guest attire with color theme swatches.</p>
          </div>
          {colors.length < 5 && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleAddColor}
              className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-50"
            >
              <Plus size={13} /> Add Color
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white p-2.5">
              <input
                type="color"
                disabled={disabled}
                value={c.hex.startsWith("#") ? c.hex : `#${c.hex}`}
                onChange={(e) => handleUpdateColor(i, { hex: e.target.value })}
                className="h-8 w-8 cursor-pointer rounded-lg border-0 p-0"
              />
              <input
                type="text"
                maxLength={30}
                disabled={disabled}
                placeholder="Name (e.g. Dusty Rose)"
                value={c.name || ""}
                onChange={(e) => handleUpdateColor(i, { name: e.target.value || undefined })}
                className="flex-1 rounded-lg border border-zinc-200 px-2.5 py-1 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
              />
              <span className="font-mono text-xs text-zinc-500 uppercase">{c.hex}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleRemoveColor(i)}
                className="p-1 text-zinc-400 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
