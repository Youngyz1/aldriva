"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { mapStaffError, NOT_FOUND_OR_DENIED } from "@/lib/staff/errors";

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string; code: string };

export type MyRentalAssignment = {
  assignment_id: string;
  assignment_status: string;
  assignment_notes: string | null;
  business_id: string;
  role_name: string | null;
  booking_id: string;
  booking_number: string;
  booking_status: string;
  starts_at: string;
  ends_at: string;
  pickup_branch_label: string | null;
  return_branch_label: string | null;
  customer_name: string;
  customer_phone: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The caller's own open rental assignments in one business. The database function
// returns only the caller's rows and never the licence, date of birth, email,
// deposit or payment fields.
export async function listMyRentalAssignments(
  businessId: string
): Promise<ActionResult<MyRentalAssignment[]>> {
  if (!UUID_RE.test(businessId)) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const db = await createSupabaseServer();
  const { data, error } = await db.rpc("get_my_rental_assignments");
  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = ((data ?? []) as MyRentalAssignment[]).filter((r) => r.business_id === businessId);
  return { success: true, data: rows };
}

// Accept or decline one of my own assignments. Only status and responded_at are
// written, which is all the assignee guard allows. Only a row still in "assigned"
// can be answered.
export async function respondToMyAssignment(
  businessId: string,
  assignmentId: string,
  response: "accepted" | "declined"
): Promise<ActionResult<{ id: string; status: string }>> {
  if (!UUID_RE.test(businessId) || !UUID_RE.test(assignmentId) || (response !== "accepted" && response !== "declined")) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const db = await createSupabaseServer();
  const { data, error } = await db
    .from("staff_assignments")
    .update({ status: response, responded_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("business_id", businessId)
    .eq("subject_type", "rental_booking")
    .eq("status", "assigned")
    .select("id");
  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  // RLS gotcha: an update excluded by a USING clause returns zero rows, not an error.
  if (!data || data.length === 0) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }

  revalidatePath("/dashboard/businesses/[id]/my-assignments", "page");
  return { success: true, data: { id: assignmentId, status: response } };
}