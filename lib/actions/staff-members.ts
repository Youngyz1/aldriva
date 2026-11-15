"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanAccessBusinessStaffArea, assertCanManageBusiness } from "@/lib/entity-authz";
import { mapStaffError, NOT_FOUND_OR_DENIED } from "@/lib/staff/errors";
import { validateStaffPhone } from "@/lib/staff/phone-validation";
import { validateStaffPhotoUrl } from "@/lib/staff/photo-validation";

function revalidateStaffPaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}/staff`);
  // Branch pages show a staff count per branch, which a staff write can
  // change (new assignment, branch move, status change, deletion).
  revalidatePath(`/dashboard/businesses/${businessId}/branches`);
  // Route-pattern form: revalidates every org/[id]/* page of these kinds
  // without needing to resolve this business's organizer_id.
  revalidatePath("/dashboard/org/[id]/staff", "page");
  revalidatePath("/dashboard/org/[id]/branches", "page");
  revalidatePath("/dashboard/org/[id]/workforce", "page");
}

export type StaffEmploymentType = "full_time" | "part_time" | "contract" | "seasonal" | "volunteer";
export type StaffStatus = "active" | "suspended" | "deactivated";

export type StaffMemberRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  employment_type: StaffEmploymentType;
  department: string | null;
  status: StaffStatus;
  branch_id: string | null;
  branch_label: string | null;
  role_names: string[];
};

type StaffMemberQueryRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  employment_type: StaffEmploymentType;
  department: string | null;
  status: StaffStatus;
  branch_id: string | null;
  business_branches: { label: string } | null;
  staff_member_roles: { is_active: boolean; staff_roles: { name: string } | null }[] | null;
};

export type ActionResult<T> = { success: true; data: T } | { success: false; error: string; code: string };

const STAFF_SELECT = `id, full_name, phone, email, photo_url, employment_type, department, status, branch_id,
       business_branches ( label ),
       staff_member_roles ( is_active, staff_roles ( name ) )`;

function mapRow(row: StaffMemberQueryRow): StaffMemberRow {
  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email,
    photo_url: row.photo_url,
    employment_type: row.employment_type,
    department: row.department,
    status: row.status,
    branch_id: row.branch_id,
    branch_label: row.business_branches?.label ?? null,
    role_names: (row.staff_member_roles ?? [])
      .filter((r) => r.is_active && r.staff_roles?.name)
      .map((r) => r.staff_roles!.name),
  };
}

// Mirrors the real CHECK constraints on staff_members (migration 231, lines
// 256-267), so client-side rejections match DB truth exactly.
const EMPLOYMENT_TYPES: readonly StaffEmploymentType[] = ["full_time", "part_time", "contract", "seasonal", "volunteer"];
const STATUSES: readonly StaffStatus[] = ["active", "suspended", "deactivated"];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type CreateStaffMemberInput = {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  photo_url?: string | null;
  branch_id?: string | null;
  employment_type: StaffEmploymentType;
  department?: string | null;
  status?: StaffStatus;
};

export type UpdateStaffMemberInput = Partial<{
  full_name: string;
  phone: string | null;
  email: string | null;
  photo_url: string | null;
  branch_id: string | null;
  employment_type: StaffEmploymentType;
  department: string | null;
  status: StaffStatus;
}>;

type FieldError = { code: string; message: string };

function validateFullName(full_name: string): FieldError | null {
  const name = full_name.trim();
  if (name.length < 2 || name.length > 120) return { code: "name_length", message: "Name must be 2-120 characters." };
  return null;
}

function validateEmail(email: string | null | undefined): FieldError | null {
  if (!email) return null;
  if (!EMAIL_RE.test(email.trim())) return { code: "email_invalid", message: "Enter a valid email address." };
  return null;
}

function validateEmploymentType(value: string): FieldError | null {
  if (!EMPLOYMENT_TYPES.includes(value as StaffEmploymentType)) {
    return { code: "employment_type_invalid", message: "Choose a valid employment type." };
  }
  return null;
}

function validateStatus(value: string): FieldError | null {
  if (!STATUSES.includes(value as StaffStatus)) return { code: "status_invalid", message: "Choose a valid status." };
  return null;
}

// Read-only for now (Slice A). Every staff action, including this one, must
// authorize itself -- the business layout now also admits staff-scope users
// (see app/dashboard/businesses/[id]/layout.tsx), so a page being reachable
// is not proof an action is allowed.
export async function listStaffMembers(businessId: string): Promise<ActionResult<StaffMemberRow[]>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_members")
    .select(STAFF_SELECT)
    .eq("business_id", businessId)
    .order("full_name", { ascending: true });

  if (error) {
    console.error("[listStaffMembers]", error.message);
    return { success: false, error: "Could not load staff. Please try again.", code: "generic_error" };
  }

  const rows = (data ?? []) as unknown as StaffMemberQueryRow[];
  return { success: true, data: rows.map(mapRow) };
}

// No user_id/login field anywhere -- auth_user_id is never set here, by
// omission from the insert payload (its column default is NULL). No role
// assignment either (Slice C). business_id is a required parameter, not a
// field inside `input`, so it can only come from the caller's own
// server-side page context, never from client-controlled form data.
export async function getStaffMember(
  businessId: string,
  staffMemberId: string
): Promise<ActionResult<StaffMemberRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_members")
    .select(STAFF_SELECT)
    .eq("id", staffMemberId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  if (!data) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }

  return { success: true, data: mapRow(data as unknown as StaffMemberQueryRow) };
}

export async function createStaffMember(
  businessId: string,
  input: CreateStaffMemberInput
): Promise<ActionResult<StaffMemberRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const nameError = validateFullName(input.full_name);
  if (nameError) return { success: false, error: nameError.message, code: nameError.code };
  const emailError = validateEmail(input.email);
  if (emailError) return { success: false, error: emailError.message, code: emailError.code };
  const phoneError = validateStaffPhone(input.phone);
  if (phoneError) return { success: false, error: phoneError.message, code: phoneError.code };
  const photoError = validateStaffPhotoUrl(input.photo_url);
  if (photoError) return { success: false, error: photoError.message, code: photoError.code };
  const employmentError = validateEmploymentType(input.employment_type);
  if (employmentError) return { success: false, error: employmentError.message, code: employmentError.code };
  if (input.status !== undefined) {
    const statusError = validateStatus(input.status);
    if (statusError) return { success: false, error: statusError.message, code: statusError.code };
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_members")
    .insert({
      business_id: businessId,
      branch_id: input.branch_id || null,
      full_name: input.full_name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      photo_url: input.photo_url?.trim() || null,
      employment_type: input.employment_type,
      department: input.department?.trim() || null,
      status: input.status ?? "active",
    })
    .select(STAFF_SELECT)
    .single();

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }

  revalidateStaffPaths(businessId);
  return { success: true, data: mapRow(data as unknown as StaffMemberQueryRow) };
}

export async function updateStaffMember(
  staffMemberId: string,
  businessId: string,
  input: UpdateStaffMemberInput
): Promise<ActionResult<StaffMemberRow>> {
  const auth = await assertCanAccessBusinessStaffArea(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  if (input.full_name !== undefined) {
    const nameError = validateFullName(input.full_name);
    if (nameError) return { success: false, error: nameError.message, code: nameError.code };
  }
  if (input.email !== undefined) {
    const emailError = validateEmail(input.email);
    if (emailError) return { success: false, error: emailError.message, code: emailError.code };
  }
  if (input.phone !== undefined) {
    const phoneError = validateStaffPhone(input.phone);
    if (phoneError) return { success: false, error: phoneError.message, code: phoneError.code };
  }
  if (input.photo_url !== undefined) {
    const photoError = validateStaffPhotoUrl(input.photo_url);
    if (photoError) return { success: false, error: photoError.message, code: photoError.code };
  }
  if (input.employment_type !== undefined) {
    const employmentError = validateEmploymentType(input.employment_type);
    if (employmentError) return { success: false, error: employmentError.message, code: employmentError.code };
  }
  if (input.status !== undefined) {
    const statusError = validateStatus(input.status);
    if (statusError) return { success: false, error: statusError.message, code: statusError.code };
  }

  const updates: Record<string, unknown> = {};
  if (input.full_name !== undefined) updates.full_name = input.full_name.trim();
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
  if (input.email !== undefined) updates.email = input.email?.trim() || null;
  if (input.photo_url !== undefined) updates.photo_url = input.photo_url?.trim() || null;
  if (input.branch_id !== undefined) updates.branch_id = input.branch_id || null;
  if (input.employment_type !== undefined) updates.employment_type = input.employment_type;
  if (input.department !== undefined) updates.department = input.department?.trim() || null;
  if (input.status !== undefined) updates.status = input.status;

  const supabase = await createSupabaseServer();
  // RLS gotcha: a row excluded by the UPDATE policy's USING clause is simply
  // not matched -- Postgres returns zero affected rows, not an error. Only a
  // WITH CHECK failure (row was visible, but the new values are rejected)
  // throws. .select() here is required to tell the two cases apart.
  const { data, error } = await supabase
    .from("staff_members")
    .update(updates)
    .eq("id", staffMemberId)
    .eq("business_id", businessId)
    .select(STAFF_SELECT);

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as StaffMemberQueryRow[];
  if (rows.length === 0) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }

  revalidateStaffPaths(businessId);
  return { success: true, data: mapRow(rows[0]) };
}

export async function setStaffStatus(
  staffMemberId: string,
  businessId: string,
  status: StaffStatus
): Promise<ActionResult<StaffMemberRow>> {
  return updateStaffMember(staffMemberId, businessId, { status });
}

// Organizer-level only -- staff_members' own DELETE policy has no
// is_staff_branch_manager clause, only is_entity_member(owner/admin/manager).
// A branch manager calling this gets rejected by assertCanManageBusiness
// before ever reaching the DB, which RLS would also have rejected; the UI
// should compute canDelete the same way (assertCanManageBusiness(businessId))
// so the Delete button is never shown to a branch manager in the first place.
export async function deleteStaffMember(
  staffMemberId: string,
  businessId: string
): Promise<ActionResult<null>> {
  const auth = await assertCanManageBusiness(businessId);
  if (!auth.ok) return { success: false, error: auth.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("staff_members")
    .delete()
    .eq("id", staffMemberId)
    .eq("business_id", businessId)
    .select("id");

  if (error) {
    const mapped = mapStaffError(error);
    return { success: false, error: mapped.message, code: mapped.code };
  }
  const rows = (data ?? []) as unknown as { id: string }[];
  if (rows.length === 0) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }

  revalidateStaffPaths(businessId);
  return { success: true, data: null };
}
