"use client";

import { useTranslations } from "next-intl";
import type { BuilderDraft } from "../InvitationPageBuilder";
import { InvitationFocalPicker, type InvitationFrameShape } from "@/components/invitation/InvitationFocalPicker";
import { InvitationImageUploadField } from "@/components/invitation/InvitationImageUploadField";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import type { EvergreenEnvelopeTemplateData, EvergreenPhotoSlot } from "@/types/invitation-template";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

const PHOTO_SLOTS = [
  { key: "envelope_photo_url", label: "evergreenPhotoEnvelope", frame: "polaroid" },
  { key: "envelope_photo_two_url", label: "evergreenPhotoEnvelopeTwo", frame: "polaroid" },
  { key: "cover_photo_url", label: "evergreenPhotoCover", frame: "arch" },
  { key: "polaroid_photo_one_url", label: "evergreenPhotoPolaroidOne", frame: "polaroid" },
  { key: "polaroid_photo_two_url", label: "evergreenPhotoPolaroidTwo", frame: "polaroid" },
  { key: "story_photo_one_url", label: "evergreenPhotoStoryOne", frame: "arch" },
  { key: "story_photo_two_url", label: "evergreenPhotoStoryTwo", frame: "arch" },
  { key: "closing_photo_url", label: "evergreenPhotoClosing", frame: "banner" },
  { key: "rsvp_photo_url", label: "evergreenPhotoRsvp", frame: "polaroid" },
] as const satisfies readonly { key: EvergreenPhotoSlot; label: string; frame: InvitationFrameShape }[];

export function EvergreenPhotosSection({ eventId, draft, updateDraft, disabled }: Props) {
  const t = useTranslations("Events");
  const data = draft.blocks_layout?.template_data ?? {};

  function updateTemplateData(patch: Partial<EvergreenEnvelopeTemplateData>) {
    const layout = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
    updateDraft({
      blocks_layout: {
        ...layout,
        template_data: { ...layout.template_data, ...patch },
      },
    });
  }

  function updatePhotoFocus(slot: EvergreenPhotoSlot, focal: { x: number; y: number }) {
    updateTemplateData({
      photo_focal_points: { ...(data.photo_focal_points ?? {}), [slot]: focal },
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-zinc-600">{t("evergreenPhotosHelp")}</p>
      {PHOTO_SLOTS.map(({ key, label, frame }) => {
        const value = data[key] ?? null;
        const focal = data.photo_focal_points?.[key] ?? { x: 50, y: 50 };
        return (
          <section key={key} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
            <h3 className="text-xs font-bold text-zinc-800">{t(label)}</h3>
            <InvitationImageUploadField
              value={value}
              folder={`invitation-evergreen/${eventId}`}
              label={t(label)}
              hint={t("evergreenPhotoHint")}
              disabled={disabled}
              onUploaded={(url) => updateTemplateData({ [key]: url })}
              onRemove={() => updateTemplateData({ [key]: null })}
            />
            <InvitationFocalPicker
              imageUrl={value}
              focal={focal}
              onChange={(next) => updatePhotoFocus(key, next)}
              templateId="evergreen-envelope"
              frameShapeOverride={frame}
              disabled={disabled}
            />
          </section>
        );
      })}
    </div>
  );
}
