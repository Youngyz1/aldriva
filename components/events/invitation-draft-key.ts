"use client";

/**
 * Single-use idempotency key per "new invitation draft" intent.
 *
 * Kept in sessionStorage so double-clicks AND refreshes reuse the same
 * key — the server maps key → slug, and UNIQUE(events.slug) turns a
 * duplicate submit into fetch-existing instead of a duplicate row.
 */

const DRAFT_KEY_STORAGE = "aldriva-invitation-draft-key";

export function getInvitationDraftKey(): string {
  try {
    const existing = sessionStorage.getItem(DRAFT_KEY_STORAGE);
    if (existing) return existing;
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(DRAFT_KEY_STORAGE, fresh);
    return fresh;
  } catch {
    return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function clearInvitationDraftKey() {
  try {
    sessionStorage.removeItem(DRAFT_KEY_STORAGE);
  } catch {
    /* storage unavailable — next intent mints a fresh key */
  }
}
