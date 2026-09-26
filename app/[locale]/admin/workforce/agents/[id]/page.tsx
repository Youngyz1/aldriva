/**
 * app/[locale]/admin/workforce/agents/[id]/page.tsx — Stage 2: Agent detail.
 *
 * Identity, tools (names + descriptions only), derived permissions, shared
 * knowledge digest, current task, recent tasks/runs/reports. Never selects
 * system_prompt, input_schema, executor_ref, step contents, or run payloads —
 * see the no-secrets hermetic test.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { Bot } from "lucide-react";
import { fetchAgentDetail, buildAgentDetailViewModel, isAgentIdShape } from "@/lib/workforce/agents";

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
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <Bot size={22} /> {a.display_name}
        </h1>
        <p className="text-sm text-zinc-400">
          {a.department} · {a.autonomy_level} · lifecycle: {a.status} ·{" "}
          <span className={vm.busy ? "text-emerald-500" : "text-zinc-500"}>{vm.busy ? "busy" : "idle"}</span>
        </p>
      </div>

      {/* Identity */}
      <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Identity</h2>
        <p className="text-sm text-zinc-400">{a.description}</p>
        <p className="text-sm text-zinc-500">
          name {a.name} · version {a.version} · model {a.model_selection} · updated{" "}
          {new Date(a.updated_at).toLocaleString()}
        </p>
        <p className="text-sm text-zinc-500">
          current task: {vm.currentTask ? `${vm.currentTask.title} (${vm.currentTask.status})` : "none"} · last
          activity: {vm.lastActivityAt ? new Date(vm.lastActivityAt).toLocaleString() : "never"}
        </p>
      </div>

      {/* Tools */}
      <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Tools ({vm.tools.length})</h2>
        {vm.empty.tools ? (
          <p className="text-sm text-zinc-500">No tools allowed for this identity.</p>
        ) : (
          <ul className="space-y-2">
            {vm.tools.map((t) => (
              <li key={t.name} className="rounded-xl bg-zinc-800 p-3">
                <div className="text-sm text-white">{t.name}</div>
                <div className="text-sm text-zinc-400">{t.description.slice(0, 200)}</div>
                <div className="text-sm text-zinc-500">
                  scope {t.scope} · risk {t.risk}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Permissions */}
      <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Permissions</h2>
        <ul className="space-y-1">
          {vm.permissions.map((p) => (
            <li key={p} className="text-sm text-zinc-400">
              {p}
            </li>
          ))}
        </ul>
      </div>

      {/* Knowledge */}
      <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Knowledge</h2>
        {vm.empty.knowledge ? (
          <p className="text-sm text-zinc-500">No approved platform knowledge documents.</p>
        ) : (
          <>
            <p className="text-sm text-zinc-400">
              Shared corpus (not per-agent — the schema attaches knowledge to tenants/platform, never to an
              agent identity): {vm.knowledge.platformApproved} approved platform document(s).
            </p>
            {vm.knowledge.agentRoleDocs.length > 0 && (
              <ul className="space-y-1">
                {vm.knowledge.agentRoleDocs.map((d) => (
                  <li key={d.id} className="text-sm text-zinc-400">
                    role doc: {d.title}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* Recent tasks + runs */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <h2 className="text-base text-white">Recent tasks</h2>
          {vm.empty.tasks ? (
            <p className="text-sm text-zinc-500">No tasks for this agent yet.</p>
          ) : (
            <ul className="space-y-2">
              {vm.tasks.map((t) => (
                <li key={t.id} className="text-sm text-zinc-400">
                  {t.title} · {t.status} · {new Date(t.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <h2 className="text-base text-white">Recent runs</h2>
          {vm.empty.runs ? (
            <p className="text-sm text-zinc-500">No runs for this agent yet.</p>
          ) : (
            <ul className="space-y-2">
              {vm.runs.map((r) => (
                <li key={r.id} className="text-sm text-zinc-400">
                  {r.status} · via {r.triggered_by} · {new Date(r.created_at).toLocaleString()}
                  {r.error ? <span className="text-red-400"> · {r.error.slice(0, 120)}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Reports */}
      <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Reports</h2>
        {vm.empty.reports ? (
          <p className="text-sm text-zinc-500">No reports from this agent yet.</p>
        ) : (
          <ul className="space-y-2">
            {vm.reports.map((r) => (
              <li key={r.id} className="rounded-xl bg-zinc-800 p-3">
                <div className="text-sm text-white">{r.summary.slice(0, 200)}</div>
                <div className="text-sm text-zinc-500">
                  {r.report_type} · {new Date(r.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/admin/workforce/agents" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Agents
      </Link>
    </div>
  );
}
