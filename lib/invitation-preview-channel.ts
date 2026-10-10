/**
 * lib/invitation-preview-channel.ts
 *
 * postMessage protocol between the one-page builder (parent) and the
 * live-preview iframe (same-origin route). All helpers are DOM-free and
 * unit-tested; both sides validate `event.origin` against
 * `window.location.origin` and validate message shape with
 * `isPreviewMessage`, silently ignoring anything malformed.
 *
 * Amendment 1: template_id travels inside the draft payload — switching
 * templates re-renders inside the iframe with no reload and no scroll reset.
 */

export const PREVIEW_MESSAGE_SOURCE = "aldriva-invitation-preview";

export type PreviewMessageKind = "draft" | "scroll-to" | "ready";

export interface PreviewDraftMessage {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  kind: "draft";
  templateId: string;
  locale: "en" | "fr";
  draft: Record<string, unknown>;
  event: Record<string, unknown>;
  /** True when this message changes only the preview, not the saved draft. */
  candidatePreview?: boolean;
  /** Saved page restored if the candidate template fails to render. */
  savedTemplateId?: string;
}

export interface PreviewScrollMessage {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  kind: "scroll-to";
  sectionId: string;
}

export interface PreviewReadyMessage {
  source: typeof PREVIEW_MESSAGE_SOURCE;
  kind: "ready";
}

export type PreviewMessage = PreviewDraftMessage | PreviewScrollMessage | PreviewReadyMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strict shape validation for inbound postMessage payloads. Rejects
 * wrong-source, unknown-kind, and malformed messages (missing templateId,
 * bad locale, non-object draft/event, empty sectionId).
 */
export function isPreviewMessage(data: unknown): data is PreviewMessage {
  if (!isRecord(data)) return false;
  if (data.source !== PREVIEW_MESSAGE_SOURCE) return false;
  if (typeof data.kind !== "string") return false;

  switch (data.kind) {
    case "draft":
      return (
        typeof data.templateId === "string" &&
        data.templateId.length > 0 &&
        (data.locale === "en" || data.locale === "fr") &&
        isRecord(data.draft) &&
        isRecord(data.event) &&
        (data.candidatePreview === undefined || typeof data.candidatePreview === "boolean") &&
        (data.savedTemplateId === undefined || (typeof data.savedTemplateId === "string" && data.savedTemplateId.length > 0))
      );
    case "scroll-to":
      return typeof data.sectionId === "string" && data.sectionId.length > 0;
    case "ready":
      return true;
    default:
      return false;
  }
}

/** Same-origin gate for postMessage handlers (both directions). */
export function isSameOriginMessage(eventOrigin: string, currentOrigin: string): boolean {
  return typeof eventOrigin === "string" && eventOrigin.length > 0 && eventOrigin === currentOrigin;
}

/** Builder section id -> template anchor id (all templates carry these). */
export const PREVIEW_SECTION_ANCHORS: Record<string, string> = {
  type: "top",
  template: "top",
  basics: "top",
  hero: "inv-hero",
  story: "inv-story",
  details: "inv-details",
  gallery: "inv-gallery",
  music: "rsvp-section",
  extras: "inv-details",
  publish: "rsvp-section",
};

const KNOWN_BUILDER_SECTIONS = new Set(Object.keys(PREVIEW_SECTION_ANCHORS));

/** Resolves a builder section to its iframe anchor (unknown -> page top). */
export function resolvePreviewAnchor(sectionId: string): string {
  if (KNOWN_BUILDER_SECTIONS.has(sectionId)) return PREVIEW_SECTION_ANCHORS[sectionId];
  return "top";
}

/** Clearly-sample guest: no real data ever enters the preview iframe. */
export const SAMPLE_PREVIEW_GUEST = {
  guest_name: "Sample Guest",
  guest_title: null,
  organization: null,
  email: null,
  rsvp_status: "pending",
  rsvp_at: null,
  token: null,
  is_vip: false,
} as const;

/**
 * Sample ticket so the host can see the QR block exactly as a pending
 * guest would (templates render it whenever a QR exists and RSVP is not
 * declined). Same placeholder value as the draft-preview route.
 * Guest behaviour is unchanged — this object never leaves the preview.
 */
export const SAMPLE_PREVIEW_TICKET = {
  qr_code: "PREVIEW-QR-PLACEHOLDER",
  status: "valid",
  checked_in_at: null,
} as const;

const PLACEHOLDER_TEXT: Record<string, string> = {
  partner1_name: "[Partner 1]",
  partner2_name: "[Partner 2]",
  celebrant_name: "[Celebrant]",
};

/**
 * Preview-only placeholder fill for empty text fields: bracketed sample
 * text so hosts can see the layout. Never persisted (applied to a copy at
 * render time) and never shown on the guest page (guest data is always
 * real by the time publish validation passes).
 */
export function placeholderSnapshot<T extends Record<string, unknown>>(draft: T): T {
  const filled: Record<string, unknown> = { ...draft };
  for (const [key, sample] of Object.entries(PLACEHOLDER_TEXT)) {
    const value = filled[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      filled[key] = sample;
    }
  }
  return filled as T;
}

/**
 * Calculates scale so a device preview frame fits available panel dimensions.
 * Evaluates both width and height, capped at 1.0 (never scales up).
 */
export function calculatePreviewFitScale({
  containerWidth,
  containerHeight,
  frameWidth,
  frameHeight,
  paddingX = 16,
  paddingY = 16,
}: {
  containerWidth: number;
  containerHeight?: number;
  frameWidth: number;
  frameHeight: number;
  paddingX?: number;
  paddingY?: number;
}): number {
  if (containerWidth <= 0 || frameWidth <= 0) return 1;
  const availWidth = Math.max(0, containerWidth - paddingX);
  const widthScale = availWidth / frameWidth;

  if (containerHeight && containerHeight > 0 && frameHeight > 0) {
    const availHeight = Math.max(0, containerHeight - paddingY);
    const heightScale = availHeight / frameHeight;
    return Math.min(widthScale, heightScale, 1);
  }

  return Math.min(widthScale, 1);
}

/**
 * Convenience wrapper for width-only scale calculations.
 */
export function calculatePreviewScale(containerWidth: number, targetWidth: number, padding: number = 24): number {
  return calculatePreviewFitScale({
    containerWidth,
    frameWidth: targetWidth,
    frameHeight: 0,
    paddingX: padding,
    paddingY: 0,
  });
}

