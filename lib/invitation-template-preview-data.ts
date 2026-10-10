import type { InvitationPageData } from "@/types/invitation-template";
import {
  BIRTHDAY_INVITATION_SAMPLE_DATA,
  FULL_INVITATION_SAMPLE_DATA,
  WEDDING_INVITATION_SAMPLE_DATA,
} from "@/components/invitation/templates/invitation-sample-data";
import { assembleInvitationPageData, type EventLiveFields, type InvitationPageSnapshot } from "@/lib/types/invitation-page-snapshot";
import { SAMPLE_PREVIEW_GUEST, SAMPLE_PREVIEW_TICKET } from "@/lib/invitation-preview-channel";

const SAMPLE_DATA_BY_TEMPLATE: Record<string, InvitationPageData> = {
  "wedding-romantic": WEDDING_INVITATION_SAMPLE_DATA,
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
  const sample = SAMPLE_DATA_BY_TEMPLATE[templateId] ?? FULL_INVITATION_SAMPLE_DATA;
  const data: Record<string, unknown> = { ...realData };
  const sampleFields: string[] = [];

  for (const [key, sampleValue] of Object.entries(sample)) {
    if (NON_CONTENT_FIELDS.has(key) || isEmpty(sampleValue)) continue;
    // Cover intentionally keeps its palette fallback when the organizer has
    // not chosen a hero; sample content must not add a stock photo there.
    if (templateId === "cover" && key === "heroImage") continue;
    if (!isEmpty(data[key])) continue;
    data[key] = sampleValue;
    sampleFields.push(key);
  }

  return { data: data as unknown as InvitationPageData, sampleFields };
}

export function getInvitationTemplateSampleData(templateId: string): InvitationPageData {
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
