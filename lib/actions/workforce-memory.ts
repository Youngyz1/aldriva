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
    notice = await createMemoryDirectFrom(
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
  // CREATE-only: refuse when the same identity already exists (DB UNIQUE is
  // the final guard; this returns a clean notice first).
  const { data: same } = (await admin
    .from("agent_memory")
    .select("id,tenant_id,agent_id")
    .eq("fact_key", key)
    .limit(20)) as unknown as {
    data: Array<{ id: string; tenant_id: string | null; agent_id: string | null }> | null;
  };
  if ((same ?? []).some((r) => (r.tenant_id ?? null) === tenantId && (r.agent_id ?? null) === agentId)) {
    return "error-exists";
  }

  const nowIso = new Date().toISOString();
  const { data: inserted, error } = (await admin
    .from("agent_memory")
    .insert({
      tenant_id: tenantId,
      agent_id: agentId,
      fact_key: key,
      fact_value: value,
      status: "active",
      version: 1,
      source: "human",
      proposed_by_agent_id: null,
      approved_by: userId,
      approved_at: nowIso,
      approval_id: null,
      effective_at: nowIso,
      expires_at: expiresAt,
    })
    .select("id")) as unknown as { data: Array<{ id: string }> | null; error: { message: string } | null };
  if (error || !inserted || inserted.length === 0) return "error-exists";
  const hist = (await admin.from("agent_memory_versions").insert({
    fact_id: inserted[0].id,
    version: 1,
    fact_value: value,
    status: "active",
    expires_at: expiresAt,
    approval_id: null,
    proposed_by_agent_id: null,
    proposed_run_id: null,
    proposed_task_id: null,
    approved_by: userId,
    approved_at: nowIso,
  }).select("id")) as unknown as { error: { message: string } | null };
  if (hist.error) {
    await admin.from("agent_memory").delete().eq("id", inserted[0].id);
    return "error";
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
