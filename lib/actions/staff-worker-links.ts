"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { assertCanAccessBusinessStaffArea } from "@/lib/entity-authz";
import { NOT_FOUND_OR_DENIED } from "@/lib/staff/errors";
import type { ActionResult } from "@/lib/actions/staff-members";

// Links kitchen/courier workers (business_workers) to staff members
// (migration 264). Writes use the admin client because authenticated users
// have SELECT only on business_worker_staff_links and no policies at all on
// the worker tables, so the permission check below is the ONLY gate for
// link/unlink. staff_has_permission reads auth.uid(), so it must be called
// through the caller's own session client, never the admin client.

const LINK_PERMISSION_KEY = "workforce.assignments.manage";

export type WorkerRole = "cook" | "courier";
export type WorkerProfileStatus = "active" | "suspended" | "deactivated";

// Deliberately no phone, whatsapp_number, avatar, token or session fields.
export type LinkedWorkerRow = {
  link_id: string;
  worker_id: string;
  full_name: string;
  role: WorkerRole;
  is_active: boolean;
  profile_status: WorkerProfileStatus;
};

export type LinkableWorkerRow = {
  id: string;
  full_name: string;
  role: WorkerRole;
};

type WorkerQueryRow = {
  id: string;
  business_id: string;
  full_name: string;
  role: WorkerRole;
  is_active: boolean;
  profile_status: WorkerProfileStatus;
};

type Gate = { ok: true; userId: string } | { ok: false; error: string; code: string };

const WORKER_SELECT = "id, business_id, full_name, role, is_active, profile_status";

function revalidateLinkPaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}/staff`);
  revalidatePath("/dashboard/org/[id]/staff", "page");
  revalidatePath("/dashboard/org/[id]/staff/[staffId]", "page");
}

async function hasLinkPermission(businessId: string): Promise<boolean> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("staff_has_permission", {
    p_business_id: businessId,
    p_permission_key: LINK_PERMISSION_KEY,
    p_branch_id: null,
  });
  return !error && data === true;
}

async function gateLinkWrite(businessId: string): Promise<Gate> {
  const area = await assertCanAccessBusinessStaffArea(businessId);
  if (!area.ok) return { ok: false, error: area.error, code: "not_allowed" };
  if (!(await hasLinkPermission(businessId))) {
    return {
      ok: false,
      error: "You do not have permission to link workers to staff members.",
      code: "worker_link_not_allowed",
    };
  }
  return { ok: true, userId: area.userId };
}

// Button visibility only. The write actions re-check the same key.
export async function canCurrentUserLinkWorkers(businessId: string): Promise<boolean> {
  const area = await assertCanAccessBusinessStaffArea(businessId);
  if (!area.ok) return false;
  return hasLinkPermission(businessId);
}

// Link rows are read with the caller's session, so migration 264's policy
// (a link is visible only if the caller can see that staff member) is the
// gate. Worker names are then read with the admin client, safe columns only.
export async function listStaffWorkerLinks(
  businessId: string,
  staffMemberId: string
): Promise<ActionResult<LinkedWorkerRow[]>> {
  const area = await assertCanAccessBusinessStaffArea(businessId);
  if (!area.ok) return { success: false, error: area.error, code: "not_allowed" };

  const supabase = await createSupabaseServer();
  const { data: links, error } = await supabase
    .from("business_worker_staff_links")
    .select("id, worker_id")
    .eq("business_id", businessId)
    .eq("staff_member_id", staffMemberId);

  if (error) {
    console.error("[listStaffWorkerLinks]", error.message);
    return { success: false, error: "Could not load linked workers. Please try again.", code: "generic_error" };
  }
  const linkRows = (links ?? []) as { id: string; worker_id: string }[];
  if (linkRows.length === 0) return { success: true, data: [] };

  const admin = createSupabaseAdmin();
  const { data: workers, error: workerError } = await admin
    .from("business_workers")
    .select(WORKER_SELECT)
    .eq("business_id", businessId)
    .in("id", linkRows.map((l) => l.worker_id));

  if (workerError) {
    console.error("[listStaffWorkerLinks] workers", workerError.message);
    return { success: false, error: "Could not load linked workers. Please try again.", code: "generic_error" };
  }

  const byId = new Map(((workers ?? []) as unknown as WorkerQueryRow[]).map((w) => [w.id, w]));
  const rows: LinkedWorkerRow[] = [];
  for (const l of linkRows) {
    const w = byId.get(l.worker_id);
    if (!w) continue;
    rows.push({
      link_id: l.id,
      worker_id: w.id,
      full_name: w.full_name,
      role: w.role,
      is_active: w.is_active,
      profile_status: w.profile_status,
    });
  }
  rows.sort((a, b) => a.full_name.localeCompare(b.full_name) || a.role.localeCompare(b.role));
  return { success: true, data: rows };
}

// Picker source: active workers of this business that have no link yet.
// Only people who may link get this list.
export async function listLinkableWorkers(businessId: string): Promise<ActionResult<LinkableWorkerRow[]>> {
  const gate = await gateLinkWrite(businessId);
  if (!gate.ok) return { success: false, error: gate.error, code: gate.code };

  const admin = createSupabaseAdmin();
  const [workersRes, linksRes] = await Promise.all([
    admin
      .from("business_workers")
      .select("id, full_name, role")
      .eq("business_id", businessId)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    admin.from("business_worker_staff_links").select("worker_id").eq("business_id", businessId),
  ]);

  if (workersRes.error || linksRes.error) {
    console.error("[listLinkableWorkers]", workersRes.error?.message ?? linksRes.error?.message);
    return { success: false, error: "Could not load workers. Please try again.", code: "generic_error" };
  }

  const linked = new Set(((linksRes.data ?? []) as { worker_id: string }[]).map((l) => l.worker_id));
  const rows = ((workersRes.data ?? []) as unknown as LinkableWorkerRow[]).filter((w) => !linked.has(w.id));
  return { success: true, data: rows };
}

export async function linkWorkerToStaff(
  businessId: string,
  staffMemberId: string,
  workerId: string
): Promise<ActionResult<LinkedWorkerRow>> {
  const gate = await gateLinkWrite(businessId);
  if (!gate.ok) return { success: false, error: gate.error, code: gate.code };

  // Session client: RLS must show this staff member to the caller.
  const supabase = await createSupabaseServer();
  const { data: staff, error: staffError } = await supabase
    .from("staff_members")
    .select("id, status")
    .eq("id", staffMemberId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (staffError || !staff) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }
  if ((staff as { status: string }).status !== "active") {
    return {
      success: false,
      error: "Only an active staff member can be linked to a worker.",
      code: "worker_link_staff_inactive",
    };
  }

  const admin = createSupabaseAdmin();
  const { data: worker, error: workerError } = await admin
    .from("business_workers")
    .select(WORKER_SELECT)
    .eq("id", workerId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (workerError || !worker) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }
  const w = worker as unknown as WorkerQueryRow;

  const { data: inserted, error: insertError } = await admin
    .from("business_worker_staff_links")
    .insert({
      business_id: businessId,
      worker_id: workerId,
      staff_member_id: staffMemberId,
      created_by: gate.userId,
    })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return {
        success: false,
        error: "This worker is already linked to a staff member.",
        code: "worker_link_already_linked",
      };
    }
    if (insertError.code === "23503") {
      return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
    }
    console.error("[linkWorkerToStaff]", insertError.message);
    return { success: false, error: "Could not link the worker. Please try again.", code: "generic_error" };
  }

  revalidateLinkPaths(businessId);
  return {
    success: true,
    data: {
      link_id: (inserted as { id: string }).id,
      worker_id: w.id,
      full_name: w.full_name,
      role: w.role,
      is_active: w.is_active,
      profile_status: w.profile_status,
    },
  };
}

// Removes the link row only. The worker's own state is not changed.
export async function unlinkWorkerFromStaff(
  businessId: string,
  staffMemberId: string,
  workerId: string
): Promise<ActionResult<null>> {
  const gate = await gateLinkWrite(businessId);
  if (!gate.ok) return { success: false, error: gate.error, code: gate.code };

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("business_worker_staff_links")
    .delete()
    .eq("business_id", businessId)
    .eq("staff_member_id", staffMemberId)
    .eq("worker_id", workerId)
    .select("id");

  if (error) {
    console.error("[unlinkWorkerFromStaff]", error.message);
    return { success: false, error: "Could not unlink the worker. Please try again.", code: "generic_error" };
  }
  if (((data ?? []) as { id: string }[]).length === 0) {
    return { success: false, error: NOT_FOUND_OR_DENIED.message, code: NOT_FOUND_OR_DENIED.code };
  }

  revalidateLinkPaths(businessId);
  return { success: true, data: null };
}
