/**
 * lib/server-approval.ts
 *
 * Server-side helper: loads linked business statuses for an organizer and
 * returns the ApprovalState via the pure predicate in lib/business-approval.ts.
 *
 * All callers (layouts, actions, order-submit) must use this single function
 * so the derivation logic is never duplicated.
 *
 * Uses the admin client (service-role) because this helper runs in Server
 * Actions and layouts that already have server-side authority.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  getApprovalState,
  type ApprovalState,
} from "@/lib/business-approval";

/**
 * Fetches business statuses for the given organizer and returns the derived
 * ApprovalState. Returns "none" if the organizer has no linked businesses.
 */
export async function getOrgApproval(
  organizerId: string
): Promise<ApprovalState> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("businesses")
    .select("status")
    .eq("organizer_id", organizerId);

  if (error || !data) return "none";
  return getApprovalState(data.map((row) => row.status as string));
}
