/**
 * lib/invitation-promotion-core.ts
 *
 * Pure decision logic for Phase 6 local-draft promotion (layer6-step2) — no
 * server-only or browser-only imports, safe to unit-test directly
 * (node --test). Both the server action
 * (lib/actions/invitation-events.ts:promoteLocalInvitationDraftServer) and
 * the client orchestrator (lib/invitation-local-draft-promotion.ts) import
 * from here, so the actual decisions are implemented and tested once, not
 * duplicated between the two.
 */

import { resolveInvitationTemplateId } from "@/lib/invitation-template-registry";
import { setLocalDraftImageField } from "@/lib/invitation-local-draft";
import { INVITATION_DRAFT_TITLE } from "@/lib/invitation-events";

/**
 * True when an existing event_invitation_pages row already has real draft
 * content (a non-empty template_id — set only by saveInvitationPageDraft)
 * — promotion's event/basics/draft steps should be skipped and the
 * existing eventId returned as-is.
 */
export function shouldSkipPromotion(row: { template_id?: string | null } | null | undefined): boolean {
  return Boolean(row && typeof row.template_id === "string" && row.template_id.trim().length > 0);
}

/**
 * Server-authoritative template id resolution. Delegates to the same
 * registry fallback every render path already uses — a client-supplied id
 * that isn't a real, published template resolves to the default instead of
 * being trusted verbatim.
 */
export function resolvePromotionTemplateId(raw: string | null | undefined): string {
  return resolveInvitationTemplateId(raw);
}

/**
 * Applies a field-key -> real URL map onto a builderDraft, via the same
 * setter restoreInvitationLocalDraftImages already uses — immutable,
 * unknown keys are a no-op.
 */
export function applyImageUrls(
  builderDraft: Record<string, unknown>,
  urlMap: Readonly<Record<string, string>>
): Record<string, unknown> {
  let next = builderDraft;
  for (const [key, url] of Object.entries(urlMap)) {
    if (key === "music_audio_url") {
      next = { ...next, music_audio_url: url };
    } else {
      next = setLocalDraftImageField(next, key, url);
    }
  }
  return next;
}

/**
 * True when a title is real enough to persist via updateInvitationEventFields
 * — not blank, not the placeholder draft title createInvitationDraft sets.
 */
export function isPromotableTitle(title: string | null | undefined): boolean {
  if (typeof title !== "string") return false;
  const trimmed = title.trim();
  return trimmed.length > 0 && trimmed !== INVITATION_DRAFT_TITLE;
}

/** User-scoped localStorage key for the "already promoted" marker (handoff-design.md v3 §4b). */
export function promotedMarkerKey(userId: string, draftId: string): string {
  return `aldriva-promoted:${userId}:${draftId}`;
}

/** User-scoped localStorage key for the uploaded-image-URL retry cache (handoff-design.md v3 §4c). */
export function promotedImagesCacheKey(userId: string, draftId: string): string {
  return `aldriva-promoted-images:${userId}:${draftId}`;
}

/**
 * Same shape check as the server's private isValidDraftKey
 * (lib/actions/invitation-events.ts) — duplicated deliberately rather than
 * imported, since that file is "use server" and this one must stay pure
 * and importable from a client component (/invitations/promote).
 */
export function isValidLocalDraftId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(value);
}
