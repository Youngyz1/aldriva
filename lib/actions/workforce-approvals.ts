"use server";

/**
 * lib/actions/workforce-approvals.ts — Stage 4 thin server action.
 *
 * Gate: requireAdmin() (platform admin; redirects otherwise). Identity:
 * getCurrentUser() supplies approver_id — no new identity mechanism. Write:
 * service-role client (authenticated roles have no UPDATE policy on
 * approvals — SELECT only, by design). All enforcement lives in
 * decideApproval() (lib/workforce/approvals.ts): the form supplies ONLY
 * approvalId + decision; action/risk/tenant come from the re-read DB row.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { decideApproval } from "@/lib/workforce/approvals";

export async function decideWorkforceApproval(formData: FormData): Promise<never> {
  await requireAdmin();
  const user = await getCurrentUser();
  const approvalId = String(formData.get("approvalId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  let notice = "error";
  if (!user) {
    notice = "not-authenticated";
  } else {
    const admin = createSupabaseAdmin();
    const result = await decideApproval(admin, {
      approvalId,
      decision,
      approverId: user.id,
      tenantScope: null, // platform admin view; row-level scope enforced inside
      nowIso: new Date().toISOString(),
    });
    notice = result.ok && result.decision ? result.decision : "rejected";
  }

  revalidatePath("/admin/workforce/approvals");
  redirect(`/admin/workforce/approvals/${encodeURIComponent(approvalId)}?decided=${notice}`);
}
