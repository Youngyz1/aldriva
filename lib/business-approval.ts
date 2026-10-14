/**
 * lib/business-approval.ts
 *
 * Pure, I/O-free predicate for business approval gating.
 *
 * Gate flag: businesses.status = 'active' (NOT organizers.status = 'verified').
 * Organizer verification is for payouts only.
 *
 * Rules:
 *  - "approved"  → at least one linked business has status = 'active'
 *  - "pending"   → no 'active' business, at least one 'pending_review'
 *  - "rejected"  → no 'active' or 'pending_review', at least one 'rejected'
 *  - "archived"  → no 'active', 'pending_review', or 'rejected', at least one 'archived'
 *  - "none"      → organizer has no linked businesses at all (direct /create-organizer flow)
 *
 * canPublish / canTakeOrders: true for "approved" AND "none" (keep today's behavior
 * for direct organizer creation; gate only when a business exists but is not active).
 */

export type ApprovalState =
  | "approved"
  | "pending"
  | "rejected"
  | "archived"
  | "none";

/**
 * Derives approval state from an array of business status strings.
 * Pass an empty array for an organizer with no linked businesses → "none".
 */
export function getApprovalState(
  businessStatuses: readonly string[]
): ApprovalState {
  if (businessStatuses.length === 0) return "none";
  if (businessStatuses.includes("active")) return "approved";
  if (businessStatuses.includes("pending_review")) return "pending";
  if (businessStatuses.includes("rejected")) return "rejected";
  return "archived";
}

/** True when the organizer is allowed to publish their site. */
export function canPublish(state: ApprovalState): boolean {
  return state === "approved" || state === "none";
}

/** True when customers are allowed to place orders through this organizer's storefront. */
export function canTakeOrders(state: ApprovalState): boolean {
  return state === "approved" || state === "none";
}
