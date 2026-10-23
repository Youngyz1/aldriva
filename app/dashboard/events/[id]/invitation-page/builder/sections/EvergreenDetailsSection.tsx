"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { BuilderDraft } from "../InvitationPageBuilder";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import type { EvergreenEnvelopeTemplateData } from "@/types/invitation-template";

interface Props {
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
}

export function EvergreenDetailsSection({ draft, updateDraft }: Props) {
  const t = useTranslations("Events");
  const data = draft.blocks_layout?.template_data ?? {};
  const swatches = data.dress_code_swatches ?? [];

  function updateTemplateData(patch: Partial<EvergreenEnvelopeTemplateData>) {
    const layout = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
    updateDraft({
      blocks_layout: {
        ...layout,
        template_data: { ...layout.template_data, ...patch },
      },
    });
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2 border-b border-zinc-200 pb-4">
        <h3 className="text-xs font-bold text-zinc-800">{t("evergreenSectionsVisible")}</h3>
        {([
          ["show_gate", "evergreenShowGate"],
          ["show_cover", "evergreenShowCover"],
          ["show_invitation_card", "evergreenShowInvitationCard"],
          ["show_countdown_photos", "evergreenShowCountdownPhotos"],
          ["show_venues", "evergreenShowVenues"],
          ["show_schedule", "evergreenShowSchedule"],
          ["show_dress_code", "evergreenShowDressCode"],
          ["show_story", "evergreenShowStory"],
          ["show_accommodations_photos", "evergreenShowAccommodationPhotos"],
          ["show_closing_photo", "evergreenShowClosingPhoto"],
          ["show_rsvp", "evergreenShowRsvp"],
        ] as const).map(([field, label]) => (
          <label key={field} className="flex items-start gap-2 text-xs font-medium text-zinc-700">
            <input
              type="checkbox"
              checked={data[field] !== false}
              onChange={(event) => updateTemplateData({ [field]: event.target.checked })}
              className="mt-0.5 size-4 accent-emerald-700"
            />
            <span>{t(label)}</span>
          </label>
        ))}
      </section>

      {([
        ["gate_intro", "evergreenGateIntroEditor", 200],
        ["gate_heading", "evergreenGateHeadingEditor", 100],
        ["invitation_line", "evergreenInvitationLineEditor", 200],
        ["venues_heading", "evergreenVenuesHeadingEditor", 100],
      ] as const).map(([field, label, maxLength]) => (
        <label key={field} className="block space-y-1.5">
          <span className="text-xs font-bold text-zinc-700">{t(label)}</span>
          <input
            type="text"
            maxLength={maxLength}
            value={data[field] ?? ""}
            onChange={(event) => updateTemplateData({ [field]: event.target.value || null })}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
          />
        </label>
      ))}

      {[1, 2].map((cardNumber) => {
        const typeField = cardNumber === 1 ? "envelope_card_one_type" : "envelope_card_two_type";
        const titleField = cardNumber === 1 ? "envelope_card_one_title" : "envelope_card_two_title";
        const bodyField = cardNumber === 1 ? "envelope_card_one_body" : "envelope_card_two_body";
        const defaultType = cardNumber === 1 ? "photo" : "text";
        return (
          <section key={cardNumber} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
            <h3 className="text-xs font-bold text-zinc-800">{t(cardNumber === 1 ? "evergreenEnvelopeCardOne" : "evergreenEnvelopeCardTwo")}</h3>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-700">{t("evergreenEnvelopeCardType")}</span>
              <select
                value={data[typeField] ?? defaultType}
                onChange={(event) => updateTemplateData({ [typeField]: event.target.value as "photo" | "text" })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900"
              >
                <option value="photo">{t("evergreenEnvelopePhotoCard")}</option>
                <option value="text">{t("evergreenEnvelopeTextCard")}</option>
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-700">{t("evergreenEnvelopeCardTitle")}</span>
              <input
                type="text"
                maxLength={100}
                value={data[titleField] ?? ""}
                onChange={(event) => updateTemplateData({ [titleField]: event.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-zinc-700">{t("evergreenEnvelopeCardBody")}</span>
              <textarea
                rows={3}
                maxLength={300}
                value={data[bodyField] ?? ""}
                onChange={(event) => updateTemplateData({ [bodyField]: event.target.value || null })}
                className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900"
              />
            </label>
          </section>
        );
      })}

      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-zinc-700">{t("evergreenParentsLine")}</span>
        <input
          type="text"
          maxLength={200}
          value={data.parents_line ?? ""}
          onChange={(event) => updateTemplateData({ parents_line: event.target.value || null })}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
        />
      </label>

      {([
        ["wishing_well_note", "evergreenWishingWellNote", 500],
        ["story_forever_word", "evergreenStoryForeverWord", 40],
        ["closing_caption", "evergreenClosingCaption", 200],
        ["rsvp_intro", "evergreenRsvpIntro", 500],
      ] as const).map(([field, label, maxLength]) => (
        <label key={field} className="block space-y-1.5">
          <span className="text-xs font-bold text-zinc-700">{t(label)}</span>
          <textarea
            rows={field === "wishing_well_note" || field === "rsvp_intro" ? 3 : 2}
            maxLength={maxLength}
            value={data[field] ?? ""}
            onChange={(event) => updateTemplateData({ [field]: event.target.value || null })}
            className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
          />
        </label>
      ))}

      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-zinc-700">{t("evergreenRsvpDeadline")}</span>
        <input
          type="text"
          maxLength={80}
          value={data.rsvp_deadline ?? ""}
          onChange={(event) => updateTemplateData({ rsvp_deadline: event.target.value || null })}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
        />
      </label>

      <section className="space-y-3 border-t border-zinc-200 pt-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-zinc-800">{t("evergreenDressSwatches")}</h3>
          {swatches.length < 5 ? (
            <button
              type="button"
              onClick={() => updateTemplateData({ dress_code_swatches: [...swatches, { name: "", hex: "#879276" }] })}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 px-2 py-1.5 text-[11px] font-bold text-zinc-700 hover:bg-zinc-50"
            >
              <Plus size={13} /> {t("evergreenSwatchAdd")}
            </button>
          ) : null}
        </div>
        {swatches.map((swatch, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-f]{6}$/i.test(swatch.hex) ? swatch.hex : "#879276"}
              aria-label={`${t("evergreenSwatchesColorLabel", { index: index + 1 })}`}
              onChange={(event) => updateTemplateData({
                dress_code_swatches: swatches.map((item, i) => i === index ? { ...item, hex: event.target.value } : item),
              })}
              className="h-9 w-12 rounded border border-zinc-200 bg-white p-1"
            />
            <input
              type="text"
              maxLength={30}
              value={swatch.name ?? ""}
              aria-label={`${t("evergreenSwatchName")} ${index + 1}`}
              placeholder={t("evergreenSwatchName")}
              onChange={(event) => updateTemplateData({
                dress_code_swatches: swatches.map((item, i) => i === index ? { ...item, name: event.target.value || null } : item),
              })}
              className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-2 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
            />
            <button
              type="button"
              aria-label={`${t("evergreenSwatchRemove")} ${index + 1}`}
              onClick={() => updateTemplateData({ dress_code_swatches: swatches.filter((_, i) => i !== index) })}
              className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </section>

      <label className="block space-y-1.5 border-t border-zinc-200 pt-4">
        <span className="text-xs font-bold text-zinc-700">{t("evergreenAdultsNote")}</span>
        <textarea
          rows={3}
          maxLength={300}
          value={data.adults_only_note ?? ""}
          onChange={(event) => updateTemplateData({ adults_only_note: event.target.value || null })}
          className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-zinc-700">{t("evergreenMonogram")}</span>
        <input
          type="text"
          maxLength={8}
          value={data.monogram_initials ?? ""}
          onChange={(event) => updateTemplateData({ monogram_initials: event.target.value || null })}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-bold text-zinc-700">{t("evergreenAlbumUrl")}</span>
        <input
          type="url"
          maxLength={500}
          value={data.album_url ?? ""}
          onChange={(event) => updateTemplateData({ album_url: event.target.value || null })}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none"
        />
      </label>

      <div className="space-y-2 border-t border-zinc-200 pt-4">
        <label className="flex items-start gap-2 text-xs font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={Boolean(data.show_wishing_well)}
            onChange={(event) => updateTemplateData({ show_wishing_well: event.target.checked })}
            className="mt-0.5 size-4 accent-emerald-700"
          />
          <span>{t("evergreenWishingWellToggle")}</span>
        </label>
        <label className="flex items-start gap-2 text-xs font-medium text-zinc-700">
          <input
            type="checkbox"
            checked={Boolean(data.show_adults_only)}
            onChange={(event) => updateTemplateData({ show_adults_only: event.target.checked })}
            className="mt-0.5 size-4 accent-emerald-700"
          />
          <span>{t("evergreenAdultsOnlyToggle")}</span>
        </label>
      </div>
    </div>
  );
}
