import type { InvitationPageData } from "@/types/invitation-template";
import {
  BOTANICAL_REVERIE_SAMPLE_DATA,
  BIRTHDAY_INVITATION_SAMPLE_DATA,
  EVERGREEN_ENVELOPE_SAMPLE_DATA,
  EVERGREEN_ENVELOPE_SAMPLE_DATA_FR,
  FULL_INVITATION_SAMPLE_DATA,
  WEDDING_INVITATION_SAMPLE_DATA,
} from "@/components/invitation/templates/invitation-sample-data";
import { assembleInvitationPageData, type EventLiveFields, type InvitationPageSnapshot } from "@/lib/types/invitation-page-snapshot";
import { SAMPLE_PREVIEW_GUEST, SAMPLE_PREVIEW_TICKET } from "@/lib/invitation-preview-channel";

const SAMPLE_DATA_BY_TEMPLATE: Record<string, InvitationPageData> = {
  "evergreen-envelope": EVERGREEN_ENVELOPE_SAMPLE_DATA,
  "botanical-reverie": BOTANICAL_REVERIE_SAMPLE_DATA,
  "luxe-editorial": WEDDING_INVITATION_SAMPLE_DATA,
  "wedding-romantic": WEDDING_INVITATION_SAMPLE_DATA,
  "romantic-envelope": WEDDING_INVITATION_SAMPLE_DATA,
  "birthday-bold": BIRTHDAY_INVITATION_SAMPLE_DATA,
  "gala-editorial": FULL_INVITATION_SAMPLE_DATA,
  "black-tie": FULL_INVITATION_SAMPLE_DATA,
  cover: FULL_INVITATION_SAMPLE_DATA,
};

const NON_CONTENT_FIELDS = new Set([
  "guest",
  "ticketInstance",
  "seat",
  "token",
  "locale",
]);

const PHOTO_FIELDS = new Set([
  "heroImage",
  "storyImage",
  "gallery",
  "weddingStory",
  "envelopePhoto",
  "envelopePhotoTwo",
  "coverPhoto",
  "polaroidPhotoOne",
  "polaroidPhotoTwo",
  "storyPhotoOne",
  "storyPhotoTwo",
  "closingPhoto",
  "rsvpPhoto",
]);

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export interface InvitationTemplatePreviewData {
  data: InvitationPageData;
  /** Content keys whose displayed value came from the sample dataset. */
  sampleFields: string[];
}

/**
 * Adds template sample content to a render-only copy of real event data.
 * Never pass this result to draft-save or publish actions.
 */
export function mergeInvitationTemplatePreviewData(
  templateId: string,
  realData: InvitationPageData
): InvitationTemplatePreviewData {
  const sample = templateId === "evergreen-envelope" && realData.locale === "fr"
    ? EVERGREEN_ENVELOPE_SAMPLE_DATA_FR
    : SAMPLE_DATA_BY_TEMPLATE[templateId] ?? FULL_INVITATION_SAMPLE_DATA;
  const data: Record<string, unknown> = { ...realData };
  const sampleFields: string[] = [];
  const hasMusicLink = Array.isArray(data.musicLinks) && data.musicLinks.length > 0;
  const hasOrganizerPhoto = Boolean(
    [
      data.heroImage,
      data.storyImage,
      data.envelopePhoto,
      data.envelopePhotoTwo,
      data.coverPhoto,
      data.polaroidPhotoOne,
      data.polaroidPhotoTwo,
      data.storyPhotoOne,
      data.storyPhotoTwo,
      data.closingPhoto,
      data.rsvpPhoto,
      ...(Array.isArray(data.gallery) ? data.gallery.map((item) => (item as { url?: unknown })?.url) : []),
      ...(Array.isArray(data.weddingStory)
        ? data.weddingStory.map((item) => (item as { image?: unknown })?.image)
        : []),
    ].some((value) => typeof value === "string" && value.trim().length > 0)
  );
  const hasOrganizerVenue = Boolean(
    realData.venue?.trim()
    || realData.address?.trim()
    || realData.venues?.some((venue) => [venue.name, venue.address, venue.time, venue.mapUrl]
      .some((value) => typeof value === "string" && value.trim().length > 0))
  );
  const hasOrganizerPartnerNames = Boolean(realData.partner1Name?.trim() || realData.partner2Name?.trim());

  for (const [key, sampleValue] of Object.entries(sample)) {
    if (NON_CONTENT_FIELDS.has(key) || isEmpty(sampleValue)) continue;
    // Venue arrays and event-level venue fields are one semantic field. A
    // sample Ceremony/Reception pair must never hide an organizer's flat venue.
    if (templateId === "evergreen-envelope" && key === "venues" && hasOrganizerVenue) continue;
    // Avoid mixing one real partner name with one sample name, and let the
    // template derive its monogram from organizer names when no override exists.
    if (templateId === "evergreen-envelope" && hasOrganizerPartnerNames
      && ["partner1Name", "partner2Name", "monogramInitials"].includes(key)) continue;
    // A single organizer upload disables every sample photo fallback. Empty
    // frames can then resolve to another real upload according to template
    // precedence instead of silently displaying unrelated sample art.
    if (hasOrganizerPhoto && PHOTO_FIELDS.has(key)) continue;
    // Sample audio would take precedence over a real provider link in the
    // floating control, making the builder preview appear unable to play it.
    if (hasMusicLink && (key === "musicAudioUrl" || key === "musicTitle")) continue;
    // Cover intentionally keeps its palette fallback when the organizer has
    // not chosen a hero; sample content must not add a stock photo there.
    if (templateId === "cover" && key === "heroImage") continue;
    if (!isEmpty(data[key])) continue;
    data[key] = sampleValue;
    sampleFields.push(key);
  }

  data.sampleFields = sampleFields;

  return { data: data as unknown as InvitationPageData, sampleFields };
}

export function getInvitationTemplateSampleData(templateId: string, locale: "en" | "fr" = "en"): InvitationPageData {
  if (templateId === "evergreen-envelope" && locale === "fr") return EVERGREEN_ENVELOPE_SAMPLE_DATA_FR;
  return SAMPLE_DATA_BY_TEMPLATE[templateId] ?? FULL_INVITATION_SAMPLE_DATA;
}

/** Builds render-only data from real draft/event values plus sample fallbacks. */
export function buildInvitationTemplatePreviewData(
  templateId: string,
  draft: Record<string, unknown>,
  event: Record<string, unknown>
): InvitationTemplatePreviewData {
  const locale = draft.locale === "fr" ? "fr" : "en";
  const snapshot = { ...draft, template_id: templateId, locale } as unknown as InvitationPageSnapshot;
  const liveEvent: EventLiveFields = {
    id: String(event.id ?? ""),
    title: typeof event.title === "string" && event.title ? event.title : "Exclusive Event",
    slug: typeof event.slug === "string" ? event.slug : "",
    event_date: typeof event.event_date === "string" ? event.event_date : "",
    end_date: typeof event.end_date === "string" ? event.end_date : null,
    venue: typeof event.venue === "string" ? event.venue : null,
    street_address: typeof event.street_address === "string" ? event.street_address : null,
    city: typeof event.city === "string" ? event.city : null,
    latitude: typeof event.latitude === "number" ? event.latitude : null,
    longitude: typeof event.longitude === "number" ? event.longitude : null,
  };
  const realData = assembleInvitationPageData(
    snapshot,
    liveEvent,
    { ...SAMPLE_PREVIEW_GUEST },
    { ...SAMPLE_PREVIEW_TICKET },
    null
  );
  return mergeInvitationTemplatePreviewData(templateId, realData);
}
