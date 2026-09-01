/**
 * lib/identity-verifications.ts
 * Personal User Identity Verification server helpers and queries.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

const supabaseAdmin = createSupabaseAdmin();

export type UserIdentityDoc = {
  doc_type: string;
  storage_path: string;
  file_name: string;
  uploaded_at?: string;
};

export type UserIdentityVerificationRow = {
  id: string;
  user_id: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "needs_more_info";
  id_type: "national_id" | "passport" | "drivers_license" | null;
  documents: UserIdentityDoc[];
  submitter_notes: string | null;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function getUserLatestIdentityVerification(userId: string): Promise<UserIdentityVerificationRow | null> {
  const { data, error } = await supabaseAdmin
    .from("user_identity_verifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as UserIdentityVerificationRow;
}

export async function saveUserIdentityDraft(
  userId: string,
  params: {
    id_type?: string;
    documents?: UserIdentityDoc[];
    submitter_notes?: string;
    create_new?: boolean;
  }
): Promise<UserIdentityVerificationRow> {
  const latest = await getUserLatestIdentityVerification(userId);

  if (!params.create_new && latest && (latest.status === "draft" || latest.status === "needs_more_info")) {
    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    if (params.id_type !== undefined) updatePayload.id_type = params.id_type;
    if (params.documents !== undefined) updatePayload.documents = params.documents;
    if (params.submitter_notes !== undefined) updatePayload.submitter_notes = params.submitter_notes;

    const { data, error } = await supabaseAdmin
      .from("user_identity_verifications")
      .update(updatePayload)
      .eq("id", latest.id)
      .select()
      .single();

    if (error || !data) throw new Error(`Failed to update identity draft: ${error?.message}`);
    return data as unknown as UserIdentityVerificationRow;
  }

  // Create fresh draft row
  const { data, error } = await supabaseAdmin
    .from("user_identity_verifications")
    .insert({
      user_id: userId,
      status: "draft",
      id_type: params.id_type ?? null,
      documents: params.documents ?? [],
      submitter_notes: params.submitter_notes ?? null,
    })
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to create identity draft: ${error?.message}`);
  return data as unknown as UserIdentityVerificationRow;
}

export async function submitUserIdentityVerification(
  userId: string,
  submissionId: string
): Promise<UserIdentityVerificationRow> {
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("user_identity_verifications")
    .select("*")
    .eq("id", submissionId)
    .eq("user_id", userId)
    .single();

  if (subErr || !sub) throw new Error("Identity verification submission not found.");

  if (sub.status !== "draft" && sub.status !== "needs_more_info") {
    throw new Error(`Cannot submit identity verification in '${sub.status}' state.`);
  }

  const docs = (sub.documents as UserIdentityDoc[]) ?? [];
  if (docs.length === 0) {
    throw new Error("Cannot submit identity verification without document uploads.");
  }

  const { data, error } = await supabaseAdmin
    .from("user_identity_verifications")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", submissionId)
    .select()
    .single();

  if (error || !data) throw new Error(`Failed to submit identity verification: ${error?.message}`);
  return data as unknown as UserIdentityVerificationRow;
}

export async function reviewUserIdentitySubmission(params: {
  submissionId: string;
  adminUserId: string;
  status: "approved" | "rejected" | "needs_more_info";
  reviewerNotes?: string;
}): Promise<UserIdentityVerificationRow> {
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("user_identity_verifications")
    .select("*")
    .eq("id", params.submissionId)
    .single();

  if (subErr || !sub) throw new Error("Submission not found.");

  const now = new Date().toISOString();

  // 1. Update submission row
  const { data: updatedSub, error: updateErr } = await supabaseAdmin
    .from("user_identity_verifications")
    .update({
      status: params.status,
      reviewer_notes: params.reviewerNotes ?? null,
      reviewed_by: params.adminUserId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", params.submissionId)
    .select()
    .single();

  if (updateErr || !updatedSub) throw new Error(`Failed to review submission: ${updateErr?.message}`);

  // 2. Sync to profiles.identity_status
  if (params.status === "approved" || params.status === "rejected") {
    const profileStatus = params.status === "approved" ? "verified" : "rejected";
    const profileVerifiedAt = params.status === "approved" ? now : null;

    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .update({
        identity_status: profileStatus,
        identity_verified_at: profileVerifiedAt,
      })
      .eq("id", sub.user_id);

    if (profileErr) {
      console.error(`[reviewUserIdentitySubmission] Failed to sync profiles.identity_status: ${profileErr.message}`);
    } else {
      // Record audit log entry in profile_verification_audit
      await supabaseAdmin.from("profile_verification_audit").insert({
        profile_id: sub.user_id,
        admin_user_id: params.adminUserId,
        field_name: "identity_status",
        old_value: "pending",
        new_value: profileStatus,
      });
    }
  }

  return updatedSub as unknown as UserIdentityVerificationRow;
}
