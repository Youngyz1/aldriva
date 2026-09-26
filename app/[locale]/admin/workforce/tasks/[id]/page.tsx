/**
 * app/[locale]/admin/workforce/tasks/[id]/page.tsx — Stage 3: Task detail.
 *
 * Assigned agent (linked), created/updated timestamps, run started/completed
 * times, step summaries (truncated; error text only for kind='error'),
 * linked report if present. No payloads, no args, no credentials.
 * Malformed or missing id → notFound(), never 500.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { fetchTaskDetail, buildTaskDetailViewModel, isTaskIdShape } from "@/lib/workforce/tasks";

export default async function WorkforceTaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await headers();
  await requireAdmin();
  const { id } = await params;
  if (!isTaskIdShape(id)) notFound();

  const supabase = await createSupabaseServer();
  const raw = await fetchTaskDetail(supabase, id, null);
  if (!raw) notFound();
  const vm = buildTaskDetailViewModel(raw);
  const t = vm.task;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <ClipboardList size={22} /> {t.title}
        </h1>
        <p className="text-sm text-zinc-400">
          {vm.statusLabel} · priority {t.priority} · created {new Date(t.created_at).toLocaleString()} · updated{" "}
          {new Date(t.updated_at).toLocaleString()}
        </p>
      </div>

      {/* Agent */}
      <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Assigned agent</h2>
        {vm.agent ? (
          <Link href={`/admin/workforce/agents/${vm.agent.id}`} className="text-sm text-white hover:underline">
            {vm.agent.display_name}
          </Link>
        ) : (
          <p className="text-sm text-zinc-500">Agent record no longer present.</p>
        )}
      </div>

      {/* Runs + steps */}
      <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Runs ({vm.runs.length})</h2>
        {vm.empty.runs ? (
          <p className="text-sm text-zinc-500">No runs recorded for this task yet.</p>
        ) : (
          <ul className="space-y-3">
            {vm.runs.map((r) => (
              <li key={r.id} className="rounded-xl bg-zinc-800 p-3">
                <div className="text-sm text-white">
                  {r.status} · via {r.triggered_by} · guard {r.guard_result}
                  {r.duration_ms !== null ? ` · ${r.duration_ms}ms` : ""}
                </div>
                <div className="text-sm text-zinc-500">
                  started {new Date(r.created_at).toLocaleString()} ·{" "}
                  {r.completed_at ? `completed ${new Date(r.completed_at).toLocaleString()}` : "still running"}
                </div>
                {r.error ? <div className="text-sm text-red-400">{r.error.slice(0, 200)}</div> : null}
                {(vm.stepsByRun[r.id] ?? []).length > 0 && (
                  <ol className="mt-2 space-y-1">
                    {(vm.stepsByRun[r.id] ?? []).map((s) => (
                      <li key={s.id} className="text-sm text-zinc-400">
                        #{s.seq} {s.kind}
                        {s.tool_name ? ` · ${s.tool_name}` : ""}
                        {s.guard_verdict ? ` · guard ${s.guard_verdict}` : ""}
                        {s.result_summary ? ` · ${s.result_summary}` : ""}
                        {s.content ? <span className="text-red-400"> · {s.content}</span> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Report */}
      <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Report</h2>
        {vm.empty.reports ? (
          <p className="text-sm text-zinc-500">
            No report yet. The full Reports surface arrives in Stage 5 — linked here when present.
          </p>
        ) : (
          <ul className="space-y-2">
            {vm.reports.map((r) => (
              <li key={r.id} className="rounded-xl bg-zinc-800 p-3">
                <div className="text-sm text-white">{r.summary.slice(0, 300)}</div>
                <div className="text-sm text-zinc-500">
                  {r.report_type} · {new Date(r.created_at).toLocaleString()} ·{" "}
                  <Link href={`/admin/workforce/reports/${r.id}`} className="hover:text-white">
                    open report
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link href="/admin/workforce/tasks" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Tasks
      </Link>
    </div>
  );
}
