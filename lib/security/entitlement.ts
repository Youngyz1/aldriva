/**
 * lib/security/entitlement.ts
 * Tiny server-side buyer/donor entitlement helpers shared by guest flows
 * (ticket resend, crypto order status, …).
 *
 * Identity always comes from the stored record (order/donation row) or the
 * authenticated session — a client-supplied user id is never proof.
 * Pure functions with no dependencies so they stay unit-testable.
 */

/** Normalize for comparison: trimmed + lowercased. Non-strings → "". */
export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * True when `candidate` proves ownership of a record owned by `ownerEmail`.
 * Both sides must be non-empty after normalization — two empty strings must
 * never count as a match (fail closed).
 */
export function isEmailEntitled(ownerEmail: unknown, candidate: unknown): boolean {
  const owner = normalizeEmail(ownerEmail);
  const cand = normalizeEmail(candidate);
  return owner.length > 0 && cand.length > 0 && owner === cand;
}
