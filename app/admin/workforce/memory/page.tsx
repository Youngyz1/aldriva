/**
 * app/admin/workforce/memory/page.tsx — Stage 12: Memory list (admin reads).
 *
 * Real persisted agent_memory rows (never reconstructed). Display filter
 * only: status (active/revoked/expired, allowlisted, unknown falls back).
 * Memory is not a secret store — values render as capped previews here;
 * full values live on the detail page as escaped text.
 *
 * Stage 21 P2 restyle: light admin system (StatStrip + AdminTable + light
 * direct-create form). The create form keeps byte-equivalent wiring
 * (createMemoryDirect + fact_key/fact_value/scope/agent/expires_at fields,
 * secret-pattern rejection, rate limit, requireAdmin); only layout classes
 * changed.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import AdminTable from "@/components/admin/table/AdminTable";
import type { AdminColumn } from "@/components/admin/table/types";
import { tableStrings } from "@/components/admin/table/strings";
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

const BADGE_TONE: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-700",
  bad: "bg-red-100 text-red-600",
  warn: "bg-amber-100 text-amber-700",
};

const columns: AdminColumn[] = [
  { id: "key", header: "Fact key", role: "title" },
  { id: "status", header: "Status", role: "value", width: "130px" },
  { id: "scope", header: "Scope", role: "meta" },
  { id: "updated", header: "Updated", role: "meta", align: "right", hideBelow: "md" },
];

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
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Memory</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Memory"
        description={`${facts.length} approved persistent fact(s)${activeStatus ? ` · status ${activeStatus}` : ""} · human-approved only, never agent-written. Memory is not a secret store.`}
      />

      <StatStrip items={[{ label: "Shown", value: facts.length }]} />

      {created && (
        <p className="rounded-xl border border-zinc-200 bg-white p-3 text-sm font-semibold text-zinc-950">
          {created === "ok"
            ? "Memory fact recorded (v1)."
            : "Memory fact was not recorded."}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/memory"
          className={`rounded-xl px-3 py-1 text-sm font-medium ${activeStatus === null ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
        >
          all
        </Link>
        {MEMORY_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/workforce/memory?status=${s}`}
            className={`rounded-xl px-3 py-1 text-sm font-medium ${activeStatus === s ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      <AdminTable
        columns={columns}
        rows={facts.map((f) => {
          const badge = memoryStatusBadge(f.status, f.expires_at);
          return {
            id: f.id,
            detailHref: `/admin/workforce/memory/${f.id}`,
            cells: [
              <Link
                key="key"
                href={`/admin/workforce/memory/${f.id}`}
                className="font-mono font-semibold text-zinc-950 hover:underline"
              >
                {f.fact_key}
              </Link>,
              <span
                key="status"
                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${BADGE_TONE[badge.tone] ?? "bg-zinc-100 text-zinc-600"}`}
              >
                {badge.label}
              </span>,
              <span key="scope" className="text-zinc-600">
                v{f.version} · {memoryScopeLabel(f.tenant_id, f.agent_id, f.tenant_id ? (tenantNameById.get(f.tenant_id) ?? null) : null, f.agent_id ? (agentNameById.get(f.agent_id) ?? null) : null)} · {f.source}
              </span>,
              <span key="updated" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(f.updated_at).toLocaleString()}
                {f.expires_at ? ` · expires ${new Date(f.expires_at).toLocaleString()}` : ""}
              </span>,
            ],
          };
        })}
        emptyMessage={`No memory facts${activeStatus ? ` with status ${activeStatus}` : ""} yet. Facts appear here after human approval of a memory proposal, or human direct creation below.`}
      />

      {/* Human direct creation (source='human', versioned + audited; agents can never use this path).
          Wiring is byte-equivalent: same action, same field names, limits and
          defaults — only layout classes changed. */}
      <form action={createMemoryDirect} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Record a fact directly</h2>
        <input name="fact_key" maxLength={120} required placeholder="fact key (1–120 chars)"
          className="w-full rounded-xl border border-zinc-200 bg-white p-2 text-sm text-zinc-950" />
        <textarea name="fact_value" maxLength={4000} required rows={3} placeholder="fact value (1–4000 chars, never secrets)"
          className="w-full rounded-xl border border-zinc-200 bg-white p-2 text-sm text-zinc-950" />
        <div className="flex flex-wrap gap-2">
          <select name="scope" className="rounded-xl border border-zinc-200 bg-white p-2 text-sm text-zinc-950" defaultValue="platform">
            <option value="platform">Platform-wide (platform admin only)</option>
            {options.tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select name="agent" className="rounded-xl border border-zinc-200 bg-white p-2 text-sm text-zinc-950" defaultValue="shared">
            <option value="shared">Shared (all agents in scope)</option>
            {options.agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <input name="expires_at" placeholder="expires ISO (optional)"
            className="rounded-xl border border-zinc-200 bg-white p-2 text-sm text-zinc-950" />
          <button type="submit" className="rounded-xl bg-zinc-950 px-4 py-2 text-sm font-semibold text-white">
            Record fact
          </button>
        </div>
      </form>

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <p className="text-xs font-semibold text-zinc-400">
          {facts.length === 0
            ? tableStrings.showingNone(facts.length)
            : tableStrings.showingResults(1, facts.length, facts.length)}
        </p>
      </div>
    </div>
  );
}
