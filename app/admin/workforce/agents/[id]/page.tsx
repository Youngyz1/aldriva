/**
 * app/admin/workforce/agents/[id]/page.tsx — Stage 2: Agent detail.
 *
 * Identity, tools (names + descriptions only), derived permissions, shared
 * knowledge digest, current task, recent tasks/runs/reports. Never selects
 * system_prompt, input_schema, executor_ref, step contents, or run payloads —
 * see the no-secrets hermetic test.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + AdminTable for
 * tools + light cards). Read-only: links only; no actions.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/ModerationBadge";
import AdminTable from "@/components/admin/table/AdminTable";
import type { AdminColumn } from "@/components/admin/table/types";
import { fetchAgentDetail, buildAgentDetailViewModel, isAgentIdShape } from "@/lib/workforce/agents";

const toolColumns: AdminColumn[] = [
  { id: "tool", header: "Tool", role: "title" },
  { id: "scope", header: "Scope", role: "value", width: "150px" },
  { id: "risk", header: "Risk", role: "meta" },
  { id: "description", header: "Description", role: "detail", hideBelow: "lg" },
];

export default async function WorkforceAgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await headers();
  await requireAdmin();
  const { id } = await params;
  if (!isAgentIdShape(id)) notFound();

  const supabase = await createSupabaseServer();
  const raw = await fetchAgentDetail(supabase, id, null);
  if (!raw) notFound();
  const vm = buildAgentDetailViewModel(raw);
  const a = vm.agent;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce/agents"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span> Agents{" "}
        <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Detail</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title={a.display_name}
        description={`${a.department} · ${a.autonomy_level} · lifecycle: ${a.status} · ${vm.busy ? "busy" : "idle"}`}
      />

      {/* Identity */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Identity</h2>
        <p className="text-sm text-zinc-600">{a.description}</p>
        <p className="text-sm text-zinc-500">
          name {a.name} · version {a.version} · model {a.model_selection} · updated{" "}
          {new Date(a.updated_at).toLocaleString()}
        </p>
        <p className="text-sm text-zinc-500">
          current task: {vm.currentTask ? `${vm.currentTask.title} (${vm.currentTask.status})` : "none"} · last
          activity: {vm.lastActivityAt ? new Date(vm.lastActivityAt).toLocaleString() : "never"}
        </p>
      </section>

      {/* Tools */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-zinc-950">Tools ({vm.tools.length})</h2>
        <AdminTable
          columns={toolColumns}
          rows={vm.tools.map((t) => ({
            id: t.name,
            cells: [
              <span key="tool" className="font-mono font-semibold text-zinc-950">
                {t.name}
              </span>,
              <span key="scope" className="whitespace-nowrap text-zinc-600">
                {t.scope}
              </span>,
              <StatusBadge key="risk" status={t.risk} />,
              <span key="description" className="block max-w-[320px] text-zinc-600">
                {t.description.slice(0, 200)}
              </span>,
            ],
          }))}
          emptyMessage="No tools allowed for this identity."
        />
      </section>

      {/* Permissions */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Permissions</h2>
        <ul className="space-y-1">
          {vm.permissions.map((p) => (
            <li key={p} className="text-sm text-zinc-600">
              {p}
            </li>
          ))}
        </ul>
      </section>

      {/* Knowledge */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Knowledge</h2>
        {vm.empty.knowledge ? (
          <p className="text-sm text-zinc-500">No approved platform knowledge documents.</p>
        ) : (
          <>
            <p className="text-sm text-zinc-600">
              Shared corpus (not per-agent — the schema attaches knowledge to tenants/platform, never to an
              agent identity): {vm.knowledge.platformApproved} approved platform document(s).
            </p>
            {vm.knowledge.agentRoleDocs.length > 0 && (
              <ul className="space-y-1">
                {vm.knowledge.agentRoleDocs.map((d) => (
                  <li key={d.id} className="text-sm text-zinc-600">
                    role doc: {d.title}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Recent tasks + runs */}
      <div className="grid gap-3 lg:grid-cols-2">
        <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-base font-bold text-zinc-950">Recent tasks</h2>
          {vm.empty.tasks ? (
            <p className="text-sm text-zinc-500">No tasks for this agent yet.</p>
          ) : (
            <ul className="space-y-2">
              {vm.tasks.map((t) => (
                <li key={t.id} className="text-sm text-zinc-600">
                  {t.title} · {t.status} · {new Date(t.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-base font-bold text-zinc-950">Recent runs</h2>
          {vm.empty.runs ? (
            <p className="text-sm text-zinc-500">No runs for this agent yet.</p>
          ) : (
            <ul className="space-y-2">
              {vm.runs.map((r) => (
                <li key={r.id} className="text-sm text-zinc-600">
                  {r.status} · via {r.triggered_by} · {new Date(r.created_at).toLocaleString()}
                  {r.error ? <span className="text-red-600"> · {r.error.slice(0, 120)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Reports */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Reports</h2>
        {vm.empty.reports ? (
          <p className="text-sm text-zinc-500">No reports from this agent yet.</p>
        ) : (
          <ul className="space-y-2">
            {vm.reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-sm text-zinc-950">{r.summary.slice(0, 200)}</div>
                <div className="text-sm text-zinc-500">
                  {r.report_type} · {new Date(r.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
