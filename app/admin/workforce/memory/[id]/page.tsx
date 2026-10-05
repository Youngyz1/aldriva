/**
 * app/admin/workforce/memory/[id]/page.tsx — Stage 12: Memory detail.
 *
 * Current value (escaped pre-wrap text, never raw HTML), scope, source,
 * status, version, effective/expiry timestamps, proposer/approver/approval/
 * task/run linkage, full append-only version history. Malformed/missing id
 * → notFound().
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + light cards).
 * Read-only: links only; no actions.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
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
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce/memory"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span> Memory{" "}
        <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Detail</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title={f.fact_key}
        description={`v${f.version} · ${badge.label} · ${memoryScopeLabel(f.tenant_id, f.agent_id, tenantName, f.agent_id ? (agentNameById.get(f.agent_id) ?? null) : null)} · ${f.source}`}
      />

      {/* Current value */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Current value</h2>
        <p className="whitespace-pre-wrap text-sm text-zinc-600">{preview.text}</p>
        {preview.truncated && (
          <p className="mt-2 text-xs text-zinc-500">Preview truncated — full value stays in storage.</p>
        )}
      </section>

      {/* Metadata */}
      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Metadata</h2>
        <p className="text-sm text-zinc-600">status: {f.status}</p>
        <p className="text-sm text-zinc-600">source: {f.source}</p>
        <p className="text-sm text-zinc-600">effective: {new Date(f.effective_at).toLocaleString()}</p>
        <p className="text-sm text-zinc-600">
          expires: {f.expires_at ? new Date(f.expires_at).toLocaleString() : "—"}
        </p>
        <p className="text-sm text-zinc-600">
          proposed by agent: {f.proposed_by_agent_id ? (agentNameById.get(f.proposed_by_agent_id) ?? shortId(f.proposed_by_agent_id)) : "— (human direct creation)"}
        </p>
        <p className="text-sm text-zinc-600">approved by: {shortId(f.approved_by)}</p>
        <p className="text-sm text-zinc-600">
          approval:{" "}
          {f.approval_id ? (
            <Link href={`/admin/workforce/approvals/${f.approval_id}`} className="hover:text-zinc-800 hover:underline">
              open approval
            </Link>
          ) : (
            "— (human direct creation)"
          )}
        </p>
        <p className="text-sm text-zinc-600">
          task:{" "}
          {f.proposed_task_id ? (
            <Link href={`/admin/workforce/tasks/${f.proposed_task_id}`} className="hover:text-zinc-800 hover:underline">
              open task
            </Link>
          ) : (
            "—"
          )}
        </p>
        <p className="text-sm text-zinc-600">run: {shortId(f.proposed_run_id)}</p>
        <p className="text-sm text-zinc-600">created: {new Date(f.created_at).toLocaleString()}</p>
        <p className="text-sm text-zinc-600">updated: {new Date(f.updated_at).toLocaleString()}</p>
      </section>

      {/* Version history (append-only) */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Version history ({raw.versions.length})</h2>
        {raw.versions.length === 0 ? (
          <p className="text-sm text-zinc-500">No stored versions for this fact.</p>
        ) : (
          <ul className="space-y-2">
            {raw.versions.map((v) => (
              <li key={v.version} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-sm font-semibold text-zinc-950">
                  v{v.version} · {v.status} · {new Date(v.created_at).toLocaleString()}
                </p>
                <p className="whitespace-pre-wrap text-sm text-zinc-600">{v.fact_value.slice(0, 500)}</p>
                <p className="text-xs text-zinc-500">
                  {v.expires_at ? `expired ${new Date(v.expires_at).toLocaleString()} · ` : ""}
                  approved by {shortId(v.approved_by)}
                  {v.approval_id ? (
                    <>
                      {" · "}
                      <Link href={`/admin/workforce/approvals/${v.approval_id}`} className="hover:text-zinc-800 hover:underline">
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
      </section>
    </div>
  );
}
