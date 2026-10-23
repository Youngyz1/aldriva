import type { EvergreenPhotoSlot, InvitationPageData } from "@/types/invitation-template";

export const EVERGREEN_PHOTO_PLACEHOLDER = "/images/invitations/evergreen-envelope/photo-placeholder.svg";

export const EVERGREEN_PHOTO_SLOTS: readonly EvergreenPhotoSlot[] = [
  "envelope_photo_url",
  "envelope_photo_two_url",
  "cover_photo_url",
  "polaroid_photo_one_url",
  "polaroid_photo_two_url",
  "story_photo_one_url",
  "story_photo_two_url",
  "closing_photo_url",
  "rsvp_photo_url",
];

const SLOT_FIELDS: Record<EvergreenPhotoSlot, keyof InvitationPageData> = {
  envelope_photo_url: "envelopePhoto",
  envelope_photo_two_url: "envelopePhotoTwo",
  cover_photo_url: "coverPhoto",
  polaroid_photo_one_url: "polaroidPhotoOne",
  polaroid_photo_two_url: "polaroidPhotoTwo",
  story_photo_one_url: "storyPhotoOne",
  story_photo_two_url: "storyPhotoTwo",
  closing_photo_url: "closingPhoto",
  rsvp_photo_url: "rsvpPhoto",
};

function nonEmptyUrl(value: string | null | undefined): string | null {
  const url = value?.trim();
  return url || null;
}

/**
 * Evergreen frame priority: own dedicated slot, hero, gallery in order, then
 * the first remaining dedicated/story upload. A local neutral illustration is
 * returned only when the organizer has not uploaded any photos.
 */
export function resolveEvergreenPhoto(data: InvitationPageData, slot: EvergreenPhotoSlot): string {
  const own = nonEmptyUrl(data[SLOT_FIELDS[slot]] as string | null | undefined);
  if (own) return own;

  const hero = nonEmptyUrl(data.heroImage);
  if (hero) return hero;

  const gallery = (data.gallery ?? []).map((photo) => nonEmptyUrl(photo.url)).find(Boolean);
  if (gallery) return gallery;

  const firstDedicated = EVERGREEN_PHOTO_SLOTS
    .map((photoSlot) => nonEmptyUrl(data[SLOT_FIELDS[photoSlot]] as string | null | undefined))
    .find(Boolean);
  if (firstDedicated) return firstDedicated;

  const storyUpload = [
    data.storyImage,
    ...(data.weddingStory ?? []).map((moment) => moment.image),
  ].map(nonEmptyUrl).find(Boolean);
  return storyUpload || EVERGREEN_PHOTO_PLACEHOLDER;
}

