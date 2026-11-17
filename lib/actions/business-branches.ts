"use server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { checkBranchMainGuard, checkNewBranchMainGuard } from "@/lib/branches/rules";
import { validateBranchCoverImageUrl } from "@/lib/branches/cover-image-validation";
import { revalidatePath } from "next/cache";

export type BranchInput = {
  label: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  phone?: string | null;
  is_main?: boolean;
  status?: "active" | "archived";
  /** https:// URL on the fundraiser-media host, max 500 chars, or null/empty for none. Never trusted as-is -- see validateBranchCoverImageUrl. */
  cover_image_url?: string | null;
};

export type BranchErrorResult = { success: false; error: string; code: string };

const admin = createSupabaseAdmin();

// uq_business_branches_one_main_per_business is a partial UNIQUE index on
// (business_id) WHERE is_main = true -- the only branch-side constraint a
// write here can actually hit. Everything else maps to a generic fallback.
function mapBranchError(error: { code?: string; message?: string }, fallback: string): { message: string; code: string } {
  if (error.code === "23505") {
    return { code: "duplicate_main", message: "Another branch is already set as main for this business. Please try again." };
  }
  console.error("[business-branches]", error.message);
  return { code: "generic_error", message: fallback };
}

function revalidateBranchPaths(businessId: string) {
  revalidatePath(`/dashboard/businesses/${businessId}/branches`);
  // Route-pattern form: revalidates every org/[id]/branches and
  // org/[id]/workforce page without needing to resolve this business's
  // organizer_id. Confirmed valid against
  // node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md
  // ("Revalidating a Page path").
  revalidatePath("/dashboard/org/[id]/branches", "page");
  revalidatePath("/dashboard/org/[id]/workforce", "page");
}

export async function listBranches(businessId: string) {
  const auth = await assertCanManageBusiness(businessId);
  if (!auth.ok) return { success: false as const, error: auth.error, code: "not_allowed" };
  // Main first, then active before archived (lexicographic: "active" <
  // "archived"), then oldest first.
  const { data, error } = await admin
    .from("business_branches")
    .select("*")
    .eq("business_id", businessId)
    .order("is_main", { ascending: false })
    .order("status", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[listBranches]", error.message);
    return { success: false as const, error: "Could not load branches. Please try again.", code: "generic_error" };
  }
  return { success: true as const, data };
}

export async function createBranch(businessId: string, input: BranchInput) {
  const auth = await assertCanManageBusiness(businessId);
  if (!auth.ok) return { success: false as const, error: auth.error, code: "not_allowed" };
  const label = input.label.trim();
  if (label.length < 2 || label.length > 100) {
    return { success: false as const, error: "Label must be 2-100 characters", code: "label_length" };
  }
  const coverImage = validateBranchCoverImageUrl(input.cover_image_url);
  if (coverImage.error) {
    return { success: false as const, error: coverImage.error.message, code: coverImage.error.code };
  }

  const { count } = await admin
    .from("business_branches")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  const isFirstBranch = (count ?? 0) === 0;
  const wantsMain = isFirstBranch || !!input.is_main;
  const status = input.status ?? "active";

  const newGuardError = checkNewBranchMainGuard(wantsMain, status);
  if (newGuardError) return { success: false as const, error: newGuardError.message, code: newGuardError.code };

  // Main swap, step 1: unset the current main (if any) before inserting the
  // new row as main. If the insert (step 2) then fails, restore it.
  let oldMainId: string | null = null;
  if (wantsMain) {
    const { data: oldMain } = await admin
      .from("business_branches")
      .select("id")
      .eq("business_id", businessId)
      .eq("is_main", true)
      .maybeSingle();
    oldMainId = oldMain?.id ?? null;
    if (oldMainId) {
      const { error: unsetErr } = await admin.from("business_branches").update({ is_main: false }).eq("id", oldMainId);
      if (unsetErr) {
        const mapped = mapBranchError(unsetErr, "Could not create branch. Please try again.");
        return { success: false as const, error: mapped.message, code: mapped.code };
      }
    }
  }

  const { data, error } = await admin
    .from("business_branches")
    .insert({
      business_id: businessId,
      label,
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      state: input.state?.trim() || null,
      country: input.country?.trim() || null,
      phone: input.phone?.trim() || null,
      is_main: wantsMain,
      status,
      cover_image_url: coverImage.value,
    })
    .select("*")
    .single();

  if (error) {
    if (oldMainId) await admin.from("business_branches").update({ is_main: true }).eq("id", oldMainId);
    const mapped = mapBranchError(error, "Could not create branch. Please try again.");
    return { success: false as const, error: mapped.message, code: mapped.code };
  }

  revalidateBranchPaths(businessId);
  return { success: true as const, data };
}

export async function updateBranch(branchId: string, input: Partial<BranchInput>) {
  const { data: branch } = await admin.from("business_branches").select("*").eq("id", branchId).maybeSingle();
  if (!branch) return { success: false as const, error: "Branch not found", code: "branch_not_found" };
  const auth = await assertCanManageBusiness(branch.business_id);
  if (!auth.ok) return { success: false as const, error: auth.error, code: "not_allowed" };

  const guardError = checkBranchMainGuard({
    currentIsMain: branch.is_main,
    currentStatus: branch.status,
    nextIsMain: input.is_main,
    nextStatus: input.status,
  });
  if (guardError) return { success: false as const, error: guardError.message, code: guardError.code };

  const updates: Record<string, unknown> = {};
  if (input.label !== undefined) {
    const l = input.label.trim();
    if (l.length < 2 || l.length > 100) {
      return { success: false as const, error: "Label must be 2-100 characters", code: "label_length" };
    }
    updates.label = l;
  }
  if (input.address !== undefined) updates.address = input.address?.trim() || null;
  if (input.city !== undefined) updates.city = input.city?.trim() || null;
  if (input.state !== undefined) updates.state = input.state?.trim() || null;
  if (input.country !== undefined) updates.country = input.country?.trim() || null;
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
  if (input.status !== undefined) updates.status = input.status;
  if (input.cover_image_url !== undefined) {
    const coverImage = validateBranchCoverImageUrl(input.cover_image_url);
    if (coverImage.error) {
      return { success: false as const, error: coverImage.error.message, code: coverImage.error.code };
    }
    updates.cover_image_url = coverImage.value;
  }

  // Main swap, step 1: unset the current main (if any) before setting this
  // branch as main. If the update (step 2) then fails, restore it.
  let oldMainId: string | null = null;
  if (input.is_main === true && !branch.is_main) {
    const { data: oldMain } = await admin
      .from("business_branches")
      .select("id")
      .eq("business_id", branch.business_id)
      .eq("is_main", true)
      .maybeSingle();
    oldMainId = oldMain?.id ?? null;
    if (oldMainId) {
      const { error: unsetErr } = await admin.from("business_branches").update({ is_main: false }).eq("id", oldMainId);
      if (unsetErr) {
        const mapped = mapBranchError(unsetErr, "Could not update branch. Please try again.");
        return { success: false as const, error: mapped.message, code: mapped.code };
      }
    }
    updates.is_main = true;
  }

  updates.updated_at = new Date().toISOString();
  const { data, error } = await admin.from("business_branches").update(updates).eq("id", branchId).select("*").single();
  if (error) {
    if (oldMainId) await admin.from("business_branches").update({ is_main: true }).eq("id", oldMainId);
    const mapped = mapBranchError(error, "Could not update branch. Please try again.");
    return { success: false as const, error: mapped.message, code: mapped.code };
  }

  revalidateBranchPaths(branch.business_id);
  return { success: true as const, data };
}

export async function deleteBranch(branchId: string) {
  const { data: branch } = await admin.from("business_branches").select("business_id, is_main").eq("id", branchId).maybeSingle();
  if (!branch) return { success: false as const, error: "Branch not found", code: "branch_not_found" };
  const auth = await assertCanManageBusiness(branch.business_id);
  if (!auth.ok) return { success: false as const, error: auth.error, code: "not_allowed" };

  // The main branch can never be deleted directly -- make another branch
  // main first (that swap already enforces exactly-one-main). This is an
  // app-level rule; the DB itself has no constraint preventing it, but
  // staff_members_branch_business_fk (ON DELETE RESTRICT) separately blocks
  // deleting ANY branch -- main or not -- that still has staff assigned.
  if (branch.is_main) {
    return { success: false as const, error: "Pick another branch as main before deleting this one.", code: "branch_main_required" };
  }

  const { error } = await admin.from("business_branches").delete().eq("id", branchId);
  if (error) {
    console.error("[deleteBranch]", error.message);
    return { success: false as const, error: "Could not delete branch. Please try again.", code: "generic_error" };
  }
  revalidateBranchPaths(branch.business_id);
  return { success: true as const };
}
