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
import { decideApproval, transitionDecidedRun } from "@/lib/workforce/approvals";
import { applyApprovedMemory } from "@/lib/workforce/memory-apply";
import { checkRateLimit } from "@/lib/rate-limit";

export async function decideWorkforceApproval(formData: FormData): Promise<never> {
  await requireAdmin();
  const user = await getCurrentUser();
  const approvalId = String(formData.get("approvalId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  let notice = "error";
  if (!user) {
    notice = "not-authenticated";
  } else {
    // Stage 15 (S-6): per-admin throttle on the privileged decide write.
    const limited = await checkRateLimit("decideWorkforceApproval", `user:${user.id}`);
    if (!limited.allowed) {
      notice = "rate-limited";
    } else {
      const admin = createSupabaseAdmin();
      const nowIso = new Date().toISOString();
      const result = await decideApproval(admin, {
        approvalId,
        decision,
        approverId: user.id,
        tenantScope: null, // platform admin view; row-level scope enforced inside
        nowIso,
      });
      notice = result.ok && result.decision ? result.decision : "rejected";
    // Stage 17 (O-2): move the originating run out of awaiting_approval now
    // that the decision is recorded. Never fails or alters the decision:
    // log and continue; the applier poll / next decide remain available.
    if (result.ok && result.decision) {
      try {
        await transitionDecidedRun(admin, approvalId, result.decision, nowIso);
      } catch (err) {
        console.error("[workforce-approvals] run transition failed:", err instanceof Error ? err.message : String(err));
      }
    }
      // Stage 12: approved memory proposals apply (+ due expiries sweep) in
      // the same admin request — no polling loop, no scheduler. Failures are
      // logged; the approval record stands and the applier poll remains
      // available to operators. Never throws the decide UX.
      if (result.ok && result.decision === "approved") {
        try {
          const acted = await selectApprovalAction(admin, approvalId);
          if (acted === "memory_propose") {
            await applyApprovedMemory(admin, { approvalId, nowIso });
            revalidatePath("/admin/workforce/memory");
          }
        } catch (err) {
          console.error("[workforce-approvals] memory apply failed:", err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  revalidatePath("/admin/workforce/approvals");
  redirect(`/admin/workforce/approvals/${encodeURIComponent(approvalId)}?decided=${notice}`);
}

async function selectApprovalAction(admin: { from(table: string): any }, approvalId: string): Promise<string | null> {
  const { data, error } = (await admin
    .from("approvals")
    .select("action")
    .eq("id", approvalId)
    .limit(1)) as unknown as { data: Array<{ action: string }> | null; error: { message: string } | null };
  if (error || !data || data.length === 0) return null;
  return data[0].action;
}
