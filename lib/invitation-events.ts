/**
 * lib/invitation-events.ts
 *
 * First-class invitation events (Round 3, migration 155).
 *
 * - `kind` axis: "public" (ticket-first discovery events, the default) vs
 *   "invitation" (private by DB CHECK, builder-first, never publicly listed).
 * - Occasion axis (wedding/birthday/gala) lives in InvitationTypePicker and
 *   is orthogonal — do not conflate the two.
 * - Invitation tooling (builder, guest invitations, personal links, RSVP,
 *   seating) works on BOTH kinds. Only the general share link (Commit 3) is
 *   invitation-kind-only.
 */

/** Event kinds (events.kind, migration 155). */
export const EVENT_KIND_PUBLIC = "public" as const;
export const EVENT_KIND_INVITATION = "invitation" as const;
export type EventKind = typeof EVENT_KIND_PUBLIC | typeof EVENT_KIND_INVITATION;

/** Placeholder title for untouched invitation drafts. Never guest-visible:
 * validateForPublish rejects it, so it cannot ship in a published snapshot. */
export const INVITATION_DRAFT_TITLE = "Untitled invitation";

/** Placeholder slug prefix for invitation drafts (suffixed with key-derived entropy). */
export const INVITATION_DRAFT_SLUG_PREFIX = "invitation-";

/**
 * Deterministic draft slug from the client-supplied idempotency key.
 * Same key → same slug → the UNIQUE(events.slug) constraint turns a
 * double submit into a fetch-existing instead of a duplicate row.
 */
export function buildInvitationDraftSlug(draftKey: string): string {
  const entropy = draftKey.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "draft";
  return `${INVITATION_DRAFT_SLUG_PREFIX}${entropy}`;
}

export function isInvitationEvent(row: { kind?: string | null } | null | undefined): boolean {
  return row?.kind === EVENT_KIND_INVITATION;
}

/**
 * An invitation draft is "untouched" while the host has not edited anything:
 * still the placeholder title and no invitation page row yet. The dashboard
 * list renders these as "Draft invitation" with a clear delete action.
 */
export function isUntouchedInvitationDraft(row: {
  kind?: string | null;
  title?: string | null;
  has_invitation_page?: boolean | null;
}): boolean {
  return (
    row.kind === EVENT_KIND_INVITATION &&
    (row.title ?? "") === INVITATION_DRAFT_TITLE &&
    !row.has_invitation_page
  );
}

interface EqCapable {
  eq: (column: string, value: string) => any;
}

/**
 * The single "publicly listable event" filter. Every public discovery
 * surface (event-data list, sitemap, cities, embeds, search, related
 * queries) must route through this helper — invitation events are forced
 * private by the DB CHECK, and the kind predicate keeps them out even if
 * a visibility value ever drifts. If a public query skips this helper,
 * the static suite fails it.
 *
 * Typed loosely on purpose: supabase-js filter builders recurse deeply
 * under structural generics, so the helper casts internally and hands the
 * original builder type back for further chaining.
 */
export function applyPublicListableFilter<Q>(query: Q): Q {
  const q = query as unknown as EqCapable;
  return q.eq("visibility", "public").eq("kind", EVENT_KIND_PUBLIC) as unknown as Q;
}

/** Row-level predicate mirror of applyPublicListableFilter (tests, guards). */
export function isPubliclyListableEvent(row: {
  visibility?: string | null;
  kind?: string | null;
} | null | undefined): boolean {
  return row?.visibility === "public" && (row?.kind ?? EVENT_KIND_PUBLIC) === EVENT_KIND_PUBLIC;
}
