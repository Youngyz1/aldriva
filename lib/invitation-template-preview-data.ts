/**
 * lib/invitation-template-preview-data.ts
 *
 * Minimalism Dark Blue-only render-only sample merge for the builder's live
 * preview and demo route. Ported deliberately narrower than the upstream
 * feature branch's version of this file: that version also covered
 * templates (evergreen, botanical, boho, luxe, romantic, gala/black-tie/
 * cover) that do not exist on this tree. Any other templateId is returned
 * untouched.
 *
 * Never pass this function's output to draft-save or publish actions.
 */
import type { InvitationPageData } from "@/types/invitation-template";
import {
  MINIMALISM_DARK_BLUE_SAMPLE_DATA,
  MINIMALISM_DARK_BLUE_SAMPLE_DATA_FR,
} from "@/components/invitation/templates/invitation-sample-data";
import { hasInvitationTemplateManifest } from "@/lib/invitation-template-manifests";

const MINIMALISM_TEMPLATE_ID = "minimalism-dark-blue";
/** Demo-only sample track — never set for gallery-card, builder-preview, or local-builder-preview callers. */
export const DEMO_MUSIC_SAMPLE_URL = "/audio/invitations/minimalism-dark-blue/demo.mp3";

const NON_CONTENT_FIELDS = new Set(["guest", "ticketInstance", "seat", "token", "locale"]);

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

interface EventMemoriesFields {
  memoriesCount?: number;
  memoriesToken?: string | null;
}

/**
 * Forwards the real, server-computed memories count/token onto a render-only
 * copy of the page data. assembleInvitationPageData never sets these two
 * fields itself; this is how LivePreviewFrame.tsx's `event` prop (populated
 * from a real DB lookup in builder-preview/[eventId]/page.tsx) reaches the
 * template before the sample merge decides memoriesSample.
 */
export function applyEventMemories(data: InvitationPageData, event: EventMemoriesFields): InvitationPageData {
  return {
    ...data,
    memoriesCount: event.memoriesCount ?? data.memoriesCount,
    memoriesToken: event.memoriesToken ?? data.memoriesToken,
  };
}

/**
 * Adds Minimalism Dark Blue sample content to a render-only copy of real
 * event data. Fills only fields the real data left empty; never overrides a
 * non-empty real value. Any templateId other than "minimalism-dark-blue" is
 * returned unchanged.
 */
export function mergeInvitationTemplatePreviewData(
  templateId: string,
  realData: InvitationPageData,
  options?: { demoRoute?: boolean }
): InvitationPageData {
  if (templateId !== MINIMALISM_TEMPLATE_ID) return realData;

  const sample = realData.locale === "fr" ? MINIMALISM_DARK_BLUE_SAMPLE_DATA_FR : MINIMALISM_DARK_BLUE_SAMPLE_DATA;
  const data: Record<string, unknown> = { ...realData };
  const sampleFields: string[] = [];
  const isManifestTemplate = hasInvitationTemplateManifest(templateId);
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

  for (const [key, sampleValue] of Object.entries(sample)) {
    if (NON_CONTENT_FIELDS.has(key) || isEmpty(sampleValue)) continue;
    // For manifest templates, use per-field photo gating so one uploaded
    // photo does not blank other empty slots in the builder preview. Legacy
    // (non-manifest) templates keep the global "any organizer photo" gate.
    // Minimalism Dark Blue is manifest-driven, so this always takes the
    // per-field branch — the guard is kept for parity with the upstream
    // merge function this was ported from, in case a second manifest
    // template is ever added back to this file.
    if (PHOTO_FIELDS.has(key)) {
      if (isManifestTemplate) {
        // fall through to the normal empty-check (real wins; empty gets sample in preview)
      } else if (hasOrganizerPhoto) {
        continue;
      }
    }
    // Sample audio would take precedence over a real provider link in the
    // floating control, making the builder preview appear unable to play it.
    if (hasMusicLink && (key === "musicAudioUrl" || key === "musicTitle")) continue;
    if (!isEmpty(data[key])) continue;
    data[key] = sampleValue;
    sampleFields.push(key);
  }

  data.sampleFields = sampleFields;

  // Memories gallery: show the local sample set only when there are no real
  // approved guest photos yet (memoriesCount > 0 and a memoriesToken both
  // present). Real memories, once present, are never overridden here.
  const hasRealMemories =
    (typeof realData.memoriesCount === "number" ? realData.memoriesCount : 0) > 0 &&
    Boolean(realData.memoriesToken);
  if (!hasRealMemories) {
    data.memoriesSample = true;
  }

  // Demo route only: show a sample track + music control, never on the
  // gallery-card, builder-preview, or local-builder-preview surfaces (those
  // never pass demoRoute). Real-wins: an organizer-configured music block
  // (uploaded audio OR a provider link) is never overridden.
  if (options?.demoRoute && !hasMusicLink && isEmpty(realData.musicAudioUrl)) {
    data.musicSample = true;
    data.musicAudioUrl = DEMO_MUSIC_SAMPLE_URL;
  }

  return data as unknown as InvitationPageData;
}
