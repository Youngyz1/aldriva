"use server";

/**
 * lib/actions/workforce-memory.ts — Stage 12 human direct-create action.
 *
 * Authorized admins may create memory directly (source='human',
 * proposer NULL) — still versioned (v1) and audited (history row).
 * Platform-wide creation (tenant NULL) is platform-admin-only; in the
 * current architecture every requireAdmin() user IS a platform admin, so
 * the explicit isAdmin() check below is defense-in-depth documenting the
 * rule rather than a live branch. Agents can NEVER reach proposal
 * semantics here — no agent identity is accepted or recorded.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, getCurrentUser, isAdmin } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createSupabaseServer } from "@/lib/supabase-server";
import { containsSecretPattern } from "@/lib/ai/tools/workforce/memory-propose";
import { checkRateLimit } from "@/lib/rate-limit";

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function createMemoryDirect(formData: FormData): Promise<never> {
  await requireAdmin();
  const user = await getCurrentUser();
  let notice = "error";
  if (!user) {
    notice = "not-authenticated";
  } else {
    // Stage 15 (S-6): per-admin throttle on the privileged memory CREATE.
    const limited = await checkRateLimit("createMemoryDirect", `user:${user.id}`);
    notice = !limited.allowed
      ? "rate-limited"
      : await createMemoryDirectFrom(
        {
          fact_key: formData.get("fact_key"),
          fact_value: formData.get("fact_value"),
          scope: formData.get("scope"),
          agent: formData.get("agent"),
          expires_at: formData.get("expires_at"),
        },
        user.id
      );
  }
  revalidatePath("/admin/workforce/memory");
  redirect(`/admin/workforce/memory?created=${notice}`);
}

export async function createMemoryDirectFrom(
  fields: { fact_key: unknown; fact_value: unknown; scope: unknown; agent: unknown; expires_at: unknown },
  userId: string
): Promise<string> {
  const key = typeof fields.fact_key === "string" ? fields.fact_key.trim() : "";
  const value = typeof fields.fact_value === "string" ? fields.fact_value : "";
  if (key.length < 1 || key.length > 120) return "error-key";
  if (value.length < 1 || value.length > 4000) return "error-value";
  if (containsSecretPattern(value)) return "error-secret";

  const scope = fields.scope;
  let tenantId: string | null = null;
  if (scope === "platform") {
    if (!(await isAdmin())) return "error-platform";
    tenantId = null;
  } else if (isUuid(scope)) {
    tenantId = scope;
  } else {
    return "error-scope";
  }

  const agentField = fields.agent;
  let agentId: string | null = null;
  if (agentField === "shared" || agentField === "" || agentField === null || agentField === undefined) {
    agentId = null;
  } else if (isUuid(agentField)) {
    agentId = agentField;
  } else {
    return "error-agent";
  }

  let expiresAt: string | null = null;
  if (typeof fields.expires_at === "string" && fields.expires_at.length > 0) {
    if (Number.isNaN(Date.parse(fields.expires_at))) return "error-expires";
    expiresAt = new Date(fields.expires_at).toISOString();
  }

  const admin = createSupabaseAdmin();
  if (tenantId !== null) {
    const { data } = (await admin.from("organizers").select("id").eq("id", tenantId).limit(1)) as unknown as {
      data: Array<{ id: string }> | null;
    };
    if (!data || data.length === 0) return "error-scope";
  }
  if (agentId !== null) {
    const { data } = (await admin.from("agents").select("id").eq("id", agentId).limit(1)) as unknown as {
      data: Array<{ id: string }> | null;
    };
    if (!data || data.length === 0) return "error-agent";
  }
  // CREATE-only: the atomic RPC enforces identity uniqueness (F-1 partial
  // indexes), writes fact + history in one transaction (F-2), and reports
  // conflicts without partial state. No table-level writes here.
  const nowIso = new Date().toISOString();
  const { data, error } = (await admin.rpc("apply_agent_memory", {
    p_approval_id: null,
    p_require_approval: false,
    p_op: "CREATE",
    p_tenant_id: tenantId,
    p_agent_id: agentId,
    p_fact_key: key,
    p_fact_value: value,
    p_next_status: "active",
    p_expires_at: expiresAt,
    p_source: "human",
    p_proposer_agent: null,
    p_run_id: null,
    p_task_id: null,
    p_approver: userId,
    p_now: nowIso,
    p_expected_version: 0,
  })) as unknown as {
    data: Array<{ applied: boolean; fact_id: string | null; version: number | null; reason: string }> | null;
    error: { message: string } | null;
  };
  if (error) {
    console.error("[workforce-memory] apply RPC failed:", error.message);
    return "error";
  }
  const row = (data ?? [])[0] ?? null;
  if (!row || !row.applied) {
    // Includes the pre-check duplicate path (CREATE requires base 0 and a
    // free identity) — surfaced distinctly for the UI notice.
    return row && /already exists|duplicate/i.test(row.reason) ? "error-exists" : "error";
  }
  return "ok";
}

// Server-session organizer/agent option lists for the create form.
export async function memoryCreateOptions(): Promise<{
  tenants: Array<{ id: string; name: string }>;
  agents: Array<{ id: string; name: string }>;
}> {
  const supabase = await createSupabaseServer();
  const [tenants, agents] = await Promise.all([
    supabase.from("organizers").select("id,name").order("name", { ascending: true }).limit(50),
    supabase.from("agents").select("id,name").order("name", { ascending: true }).limit(50),
  ]);
  return {
    tenants: ((tenants.data ?? []) as Array<{ id: string; name: string }>),
    agents: ((agents.data ?? []) as Array<{ id: string; name: string }>),
  };
}
