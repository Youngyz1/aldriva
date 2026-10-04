/**
 * app/admin/workforce/memory/page.tsx — Stage 12: Memory list (admin reads).
 *
 * Real persisted agent_memory rows (never reconstructed). Display filter
 * only: status (active/revoked/expired, allowlisted, unknown falls back).
 * Memory is not a secret store — values render as capped previews here;
 * full values live on the detail page as escaped text.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import PageHeader from "@/components/admin/PageHeader";
import {
  fetchMemoryList,
  fetchMemoryAgents,
  fetchTenantNames,
  isMemoryStatusValue,
  MEMORY_STATUSES,
  memoryScopeLabel,
  memoryStatusBadge,
} from "@/lib/workforce/memory";
import { createMemoryDirect, memoryCreateOptions } from "@/lib/actions/workforce-memory";

export default async function WorkforceMemoryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; created?: string }>;
}) {
  await headers();
  await requireAdmin();
  const { status, created } = await searchParams;

  const activeStatus = status && isMemoryStatusValue(status) ? status : null;

  const supabase = await createSupabaseServer();
  const facts = await fetchMemoryList(supabase, activeStatus);
  const [agents, tenantNames] = await Promise.all([
    fetchMemoryAgents(supabase),
    fetchTenantNames(
      supabase,
      facts.map((f) => f.tenant_id).filter((t): t is string => t !== null)
    ),
  ]);
  const agentNameById = new Map(agents.map((a) => [a.id, a.display_name]));
  const tenantNameById = new Map(tenantNames.map((t) => [t.id, t.name]));
  const options = await memoryCreateOptions();

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <PageHeader
        eyebrow="AI Workforce"
        title="Memory"
        description={`${facts.length} approved persistent fact(s)${activeStatus ? ` · status ${activeStatus}` : ""} · human-approved only, never agent-written. Memory is not a secret store.`}
      />

      {created && (
        <p className="rounded-xl bg-zinc-900 p-3 text-sm text-white shadow-xs">
          {created === "ok"
            ? "Memory fact recorded (v1)."
            : "Memory fact was not recorded."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/memory"
          className={`rounded-xl px-3 py-1 text-sm ${activeStatus === null ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
        >
          all
        </Link>
        {MEMORY_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/workforce/memory?status=${s}`}
            className={`rounded-xl px-3 py-1 text-sm ${activeStatus === s ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      {facts.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No memory facts{activeStatus ? ` with status ${activeStatus}` : ""} yet. Facts appear here after
          human approval of a memory proposal, or human direct creation below.
        </p>
      ) : (
        <ul className="space-y-2">
          {facts.map((f) => {
            const badge = memoryStatusBadge(f.status, f.expires_at);
            return (
              <li key={f.id} className="flex flex-col gap-1 rounded-xl bg-zinc-900 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/admin/workforce/memory/${f.id}`} className="text-sm text-white hover:underline">
                    {f.fact_key}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    v{f.version} · {memoryScopeLabel(f.tenant_id, f.agent_id, f.tenant_id ? (tenantNameById.get(f.tenant_id) ?? null) : null, f.agent_id ? (agentNameById.get(f.agent_id) ?? null) : null)} · {f.source} · {new Date(f.updated_at).toLocaleString()}
                    {f.expires_at ? ` · expires ${new Date(f.expires_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-xl px-2 py-0.5 text-xs ${
                      badge.tone === "ok"
                        ? "bg-emerald-900 text-emerald-200"
                        : badge.tone === "bad"
                          ? "bg-red-900 text-red-200"
                          : badge.tone === "warn"
                            ? "bg-amber-900 text-amber-200"
                            : "bg-zinc-800 text-zinc-300"
                    }`}
                  >
                    {badge.label}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Human direct creation (source='human', versioned + audited; agents can never use this path) */}
      <form action={createMemoryDirect} className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Record a fact directly</h2>
        <input name="fact_key" maxLength={120} required placeholder="fact key (1–120 chars)"
          className="w-full rounded-xl bg-zinc-800 p-2 text-sm text-white" />
        <textarea name="fact_value" maxLength={4000} required rows={3} placeholder="fact value (1–4000 chars, never secrets)"
          className="w-full rounded-xl bg-zinc-800 p-2 text-sm text-white" />
        <div className="flex flex-wrap gap-2">
          <select name="scope" className="rounded-xl bg-zinc-800 p-2 text-sm text-white" defaultValue="platform">
            <option value="platform">Platform-wide (platform admin only)</option>
            {options.tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select name="agent" className="rounded-xl bg-zinc-800 p-2 text-sm text-white" defaultValue="shared">
            <option value="shared">Shared (all agents in scope)</option>
            {options.agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input name="expires_at" placeholder="expires ISO (optional)"
            className="rounded-xl bg-zinc-800 p-2 text-sm text-white" />
          <button type="submit" className="rounded-xl bg-zinc-700 px-4 py-2 text-sm text-white">
            Record fact
          </button>
        </div>
      </form>

      <Link href="/admin/workforce" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Command Center
      </Link>
    </div>
  );
}
