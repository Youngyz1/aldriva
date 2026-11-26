"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { mapStaffError, NOT_FOUND_OR_DENIED } from "@/lib/staff/errors";
import type { ActionResult } from "@/lib/actions/staff-members";

// Planned staff shifts (migration 266). Uses the caller's session client, so
// the staff_shifts RLS policies decide who can read and write. The code here
// adds the staff-area gate, input validation and readable errors only.

export type ShiftStatus = "scheduled" | "cancelled";

export type ShiftRow = {
  id: string;
  staff_member_id: string;
  branch_id: string | null;
  shift_date: string; // YYYY-MM-DD
  starts_at: string; // HH:MM
  ends_at: string; // HH:MM
  status: ShiftStatus;
  notes: string | null;
};

export type CreateShiftInput = {
  staff_member_id: string;
  branch_id: string | null;
  shift_date: string;
  starts_at: string;
  ends_at: string;
  notes?: string | null;
};

export type UpdateShiftInput = {
  branch_id: string | null;
  shift_date: string;
  starts_at: string;
  ends_at: string;
  notes?: string | null;
};

type ShiftQueryRow = Omit<ShiftRow, "starts_at" | "ends_at"> & { starts_at: string; ends_at: string };

const SHIFT_SELECT = "id, staff_member_id, branch_id, shift_date, starts_at, ends_at, status, notes";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function revalidateRoster(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}/staff`);
  revalidatePath("/dashboard/org/[id]/workforce", "page");
  revalidatePath("/dashboard/org/[id]/workforce/roster", "page");
}

function isRealDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function addDays(value: string, days: number): string {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function hhmm(value: string): string {
  return value.slice(0, 5);
}

function mapRow(row: ShiftQueryRow): ShiftRow {
  return { ...row, starts_at: hhmm(row.starts_at), ends_at: hhmm(row.ends_at) };
}

type FieldError = { code: string; message: string };

function validateTimes(shift_date: string, starts_at: string, ends_at: string, notes?: string | null): FieldError | null {
  if (!isRealDate(shift_date)) return { code: "shift_date_invalid", message: "Choose a valid date." };
  if (!TIME_RE.test(starts_at) || !TIME_RE.test(ends_at)) {
    return { code: "shift_time_invalid", message: "Enter times as HH:MM." };
  }
  if (ends_at <= starts_at) return { code: "shift_end_before_start", message: "The shift must end after it starts." };
  if (notes && notes.trim().length > 500) {
    return { code: "shift_notes_too_long", message: "Notes can be at most 500 characters." };
  }
  return null;
}

// Shift-specific database errors first; everything else goes through the
// shared staff mapper.
function mapShiftError(error: { code?: string | null; message?: string | null; hint?: string | null }) {
  const hint = (error.hint ?? "").trim();
  if (hint === "shift_staff_inactive") {
    return { code: "shift_staff_inactive", message: "Only an active staff member can be scheduled." };
  }
  if (hint === "shift_immutable_owner") {
    return { code: "shift_immutable_owner", message: "A shift cannot be moved to another person." };
  }
  if (error.code === "23P01") {
    return { code: "shift_overlap", message: "This person already has a shift that overlaps these hours." };
  }
  if (error.code === "23503") {
    return { code: "shift_branch_mismatch", message: "That branch or staff member doesn't belong to this business." };
  }
  return mapStaffError(error);
}

// weekStart is the first day of the week (the screen sends a Monday). Returns
// every shift from weekStart through weekStart + 6 days.
export async function listShiftsForWeek(
  businessId: string,
  weekStart: string,
  branchId?: string | null
): Promise<ActionResult<ShiftRow[]>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };
  if (!isRealDate(weekStart)) return { success: false, error: "Choose a valid date.", code: "shift_date_invalid" };

  const supabase = await createSupabaseServer();
  let query = supabase
    .from("staff_shifts")
    .select(SHIFT_SELECT)
    .eq("business_id", businessId)
    .gte("shift_date", weekStart)
    .lte("shift_date", addDays(weekStart, 6))
    .order("shift_date", { ascending: true })
    .order("starts_at", { ascending: true });
  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) {
    console.error("[listShiftsForWeek]", error.message);
    return { success: false, error: "Could not load the roster. Please try again.", code: "generic_error" };
  }
  return { success: true, data: ((data ?? []) as unknown as ShiftQueryRow[]).map(mapRow) };
}

export async function createShift(businessId: string, input: CreateShiftInput): Promise<ActionResult<ShiftRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const invalid = validateTimes(input.shift_date, input.starts_at, input.ends_at, input.notes);
  if (invalid) return { success: false, error: invalid.message, code: invalid.code };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_shifts")
    .insert({
      business_id: businessId,
      staff_member_id: input.staff_member_id,
      branch_id: input.branch_id || null,
      shift_date: input.shift_date,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      notes: input.notes?.trim() || null,
      created_by: auth.userId,
    })
    .select(SHIFT_SELECT)
    .single();

  if (error) {
    const mapped = mapShiftError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  revalidateRoster(businessId);
  return { success: true, data: mapRow(data as unknown as ShiftQueryRow) };
}

export async function updateShift(
  businessId: string,
  shiftId: string,
  input: UpdateShiftInput
): Promise<ActionResult<ShiftRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const invalid = validateTimes(input.shift_date, input.starts_at, input.ends_at, input.notes);
  if (invalid) return { success: false, error: invalid.message, code: invalid.code };

  const supabase = await createSupabaseServer();
  // A row hidden by the UPDATE policy returns zero rows, not an error, so
  // .select() is needed to tell "not allowed" apart from "saved".
  const { data, error } = await supabase
    .from("staff_shifts")
    .update({
      branch_id: input.branch_id || null,
      shift_date: input.shift_date,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      notes: input.notes?.trim() || null,
    })
    .eq("id", shiftId)
    .eq("business_id", businessId)
    .select(SHIFT_SELECT);

  if (error) {
    const mapped = mapShiftError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as ShiftQueryRow[];
  if (rows.length === 0) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }
  revalidateRoster(businessId);
  return { success: true, data: mapRow(rows[0]) };
}

export async function cancelShift(businessId: string, shiftId: string): Promise<ActionResult<ShiftRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_shifts")
    .update({ status: "cancelled" })
    .eq("id", shiftId)
    .eq("business_id", businessId)
    .select(SHIFT_SELECT);

  if (error) {
    const mapped = mapShiftError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as ShiftQueryRow[];
  if (rows.length === 0) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }
  revalidateRoster(businessId);
  return { success: true, data: mapRow(rows[0]) };
}
