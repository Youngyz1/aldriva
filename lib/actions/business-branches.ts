"use server";

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { assertCanManageBusiness } from "@/lib/entity-authz";
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
};

const admin = createSupabaseAdmin();

export async function listBranches(businessId: string) {
  const auth = await assertCanManageBusiness(businessId);
  if (!auth.ok) return { success: false as const, error: auth.error };
  const { data, error } = await admin.from("business_branches").select("*").eq("business_id", businessId).order("is_main", { ascending: false }).order("created_at", { ascending: true });
  if (error) {
    console.error("[listBranches]", error.message);
    return { success: false as const, error: "Could not load branches. Please try again." };
  }
  return { success: true as const, data };
}

export async function createBranch(businessId: string, input: BranchInput) {
  const auth = await assertCanManageBusiness(businessId);
  if (!auth.ok) return { success: false as const, error: auth.error };
  const label = input.label.trim();
  if (label.length < 2 || label.length > 100) return { success: false as const, error: "Label must be 2-100 characters" };
  if (input.is_main) {
    await admin.from("business_branches").update({ is_main: false }).eq("business_id", businessId).eq("is_main", true);
  }
  const { data, error } = await admin.from("business_branches").insert({
    business_id: businessId,
    label,
    address: input.address?.trim() || null,
    city: input.city?.trim() || null,
    state: input.state?.trim() || null,
    country: input.country?.trim() || null,
    phone: input.phone?.trim() || null,
    is_main: !!input.is_main,
    status: input.status ?? "active",
  }).select("*").single();
  if (error) {
    console.error("[createBranch]", error.message);
    return { success: false as const, error: "Could not create branch. Please try again." };
  }
  revalidatePath(`/dashboard/businesses/${businessId}/branches`);
  return { success: true as const, data };
}

export async function updateBranch(branchId: string, input: Partial<BranchInput>) {
  const { data: branch } = await admin.from("business_branches").select("business_id").eq("id", branchId).maybeSingle();
  if (!branch) return { success: false as const, error: "Branch not found" };
  const auth = await assertCanManageBusiness(branch.business_id);
  if (!auth.ok) return { success: false as const, error: auth.error };
  const updates: Record<string, unknown> = {};
  if (input.label !== undefined) {
    const l = input.label.trim();
    if (l.length < 2 || l.length > 100) return { success: false as const, error: "Label must be 2-100 characters" };
    updates.label = l;
  }
  if (input.address !== undefined) updates.address = input.address?.trim() || null;
  if (input.city !== undefined) updates.city = input.city?.trim() || null;
  if (input.state !== undefined) updates.state = input.state?.trim() || null;
  if (input.country !== undefined) updates.country = input.country?.trim() || null;
  if (input.phone !== undefined) updates.phone = input.phone?.trim() || null;
  if (input.status !== undefined) updates.status = input.status;
  if (input.is_main !== undefined) {
    if (input.is_main) {
      await admin.from("business_branches").update({ is_main: false }).eq("business_id", branch.business_id).eq("is_main", true);
    }
    updates.is_main = !!input.is_main;
  }
  updates.updated_at = new Date().toISOString();
  const { data, error } = await admin.from("business_branches").update(updates).eq("id", branchId).select("*").single();
  if (error) {
    console.error("[updateBranch]", error.message);
    return { success: false as const, error: "Could not update branch. Please try again." };
  }
  revalidatePath(`/dashboard/businesses/${branch.business_id}/branches`);
  return { success: true as const, data };
}

export async function deleteBranch(branchId: string) {
  const { data: branch } = await admin.from("business_branches").select("business_id").eq("id", branchId).maybeSingle();
  if (!branch) return { success: false as const, error: "Branch not found" };
  const auth = await assertCanManageBusiness(branch.business_id);
  if (!auth.ok) return { success: false as const, error: auth.error };
  const { error } = await admin.from("business_branches").delete().eq("id", branchId);
  if (error) {
    console.error("[deleteBranch]", error.message);
    return { success: false as const, error: "Could not delete branch. Please try again." };
  }
  revalidatePath(`/dashboard/businesses/${branch.business_id}/branches`);
  return { success: true as const };
}
