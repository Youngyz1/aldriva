/**
 * app/admin/workforce/memory/[id]/page.tsx — Stage 12: Memory detail.
 *
 * Current value (escaped pre-wrap text, never raw HTML), scope, source,
 * status, version, effective/expiry timestamps, proposer/approver/approval/
 * task/run linkage, full append-only version history. Malformed/missing id
 * → notFound().
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { Brain } from "lucide-react";
import {
  fetchMemoryDetail,
  fetchMemoryAgents,
  fetchTenantNames,
  isMemoryIdShape,
  buildMemoryPreview,
  memoryScopeLabel,
  memoryStatusBadge,
  shortId,
} from "@/lib/workforce/memory";

export default async function WorkforceMemoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await headers();
  await requireAdmin();
  const { id } = await params;
  if (!isMemoryIdShape(id)) notFound();

  const supabase = await createSupabaseServer();
  const raw = await fetchMemoryDetail(supabase, id);
  if (!raw) notFound();
  const f = raw.fact;
  const badge = memoryStatusBadge(f.status, f.expires_at);
  const preview = buildMemoryPreview(f.fact_value);
  const [agents, tenantNames] = await Promise.all([
    fetchMemoryAgents(supabase),
    fetchTenantNames(supabase, f.tenant_id ? [f.tenant_id] : []),
  ]);
  const agentNameById = new Map(agents.map((a) => [a.id, a.display_name]));
  const tenantName = tenantNames[0]?.name ?? null;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <Brain size={22} /> {f.fact_key}
        </h1>
        <p className="text-sm text-zinc-400">
          v{f.version} · {badge.label} · {memoryScopeLabel(f.tenant_id, f.agent_id, tenantName, f.agent_id ? (agentNameById.get(f.agent_id) ?? null) : null)} · {f.source}
        </p>
      </div>

      {/* Current value */}
      <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Current value</h2>
        <p className="whitespace-pre-wrap text-sm text-zinc-400">{preview.text}</p>
        {preview.truncated && (
          <p className="mt-2 text-xs text-zinc-500">Preview truncated — full value stays in storage.</p>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-1 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Metadata</h2>
        <p className="text-sm text-zinc-400">status: {f.status}</p>
        <p className="text-sm text-zinc-400">source: {f.source}</p>
        <p className="text-sm text-zinc-400">effective: {new Date(f.effective_at).toLocaleString()}</p>
        <p className="text-sm text-zinc-400">
          expires: {f.expires_at ? new Date(f.expires_at).toLocaleString() : "—"}
        </p>
        <p className="text-sm text-zinc-400">
          proposed by agent: {f.proposed_by_agent_id ? (agentNameById.get(f.proposed_by_agent_id) ?? shortId(f.proposed_by_agent_id)) : "— (human direct creation)"}
        </p>
        <p className="text-sm text-zinc-400">approved by: {shortId(f.approved_by)}</p>
        <p className="text-sm text-zinc-400">
          approval:{" "}
          {f.approval_id ? (
            <Link href={`/admin/workforce/approvals/${f.approval_id}`} className="hover:text-white">
              open approval
            </Link>
          ) : (
            "— (human direct creation)"
          )}
        </p>
        <p className="text-sm text-zinc-400">
          task:{" "}
          {f.proposed_task_id ? (
            <Link href={`/admin/workforce/tasks/${f.proposed_task_id}`} className="hover:text-white">
              open task
            </Link>
          ) : (
            "—"
          )}
        </p>
        <p className="text-sm text-zinc-400">run: {shortId(f.proposed_run_id)}</p>
        <p className="text-sm text-zinc-400">created: {new Date(f.created_at).toLocaleString()}</p>
        <p className="text-sm text-zinc-400">updated: {new Date(f.updated_at).toLocaleString()}</p>
      </div>

      {/* Version history (append-only) */}
      <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Version history ({raw.versions.length})</h2>
        {raw.versions.length === 0 ? (
          <p className="text-sm text-zinc-500">No stored versions for this fact.</p>
        ) : (
          <ul className="space-y-2">
            {raw.versions.map((v) => (
              <li key={v.version} className="rounded-xl bg-zinc-800 p-3">
                <p className="text-sm text-white">
                  v{v.version} · {v.status} · {new Date(v.created_at).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap text-sm text-zinc-400">{v.fact_value.slice(0, 500)}</p>
                <p className="text-xs text-zinc-500">
                  {v.expires_at ? `expired ${new Date(v.expires_at).toLocaleString()} · ` : ""}
                  approved by {shortId(v.approved_by)}
                  {v.approval_id ? (
                    <>
                      {" · "}
                      <Link href={`/admin/workforce/approvals/${v.approval_id}`} className="hover:text-white">
                        approval
                      </Link>
                    </>
                  ) : (
                    " · human direct creation"
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/admin/workforce/memory" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Memory
      </Link>
    </div>
  );
}
