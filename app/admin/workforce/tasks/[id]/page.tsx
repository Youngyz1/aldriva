/**
 * app/admin/workforce/tasks/[id]/page.tsx — Stage 3: Task detail.
 *
 * Assigned agent (linked), created/updated timestamps, run started/completed
 * times, step summaries (truncated; error text only for kind='error'),
 * linked report if present. No payloads, no args, no credentials.
 * Malformed or missing id → notFound(), never 500.
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
import { StatusBadge } from "@/components/admin/ModerationBadge";
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
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce/tasks"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span> Tasks{" "}
        <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Detail</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title={t.title}
        description={`${vm.statusLabel} · priority ${t.priority} · created ${new Date(t.created_at).toLocaleString()} · updated ${new Date(t.updated_at).toLocaleString()}`}
      />

      {/* Agent */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Assigned agent</h2>
        {vm.agent ? (
          <Link
            href={`/admin/workforce/agents/${vm.agent.id}`}
            className="text-sm font-semibold text-zinc-950 hover:underline"
          >
            {vm.agent.display_name}
          </Link>
        ) : (
          <p className="text-sm text-zinc-500">Agent record no longer present.</p>
        )}
      </section>

      {/* Runs + steps */}
      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Runs ({vm.runs.length})</h2>
        {vm.empty.runs ? (
          <p className="text-sm text-zinc-500">No runs recorded for this task yet.</p>
        ) : (
          <ul className="space-y-3">
            {vm.runs.map((r) => (
              <li key={r.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-950">
                  <StatusBadge status={r.status} />
                  <span className="text-zinc-600">
                    via {r.triggered_by} · guard {r.guard_result}
                    {r.duration_ms !== null ? ` · ${r.duration_ms}ms` : ""}
                  </span>
                </div>
                <div className="mt-1 text-sm text-zinc-500">
                  started {new Date(r.created_at).toLocaleString()} ·{" "}
                  {r.completed_at ? `completed ${new Date(r.completed_at).toLocaleString()}` : "still running"}
                </div>
                {r.error ? <div className="text-sm text-red-600">{r.error.slice(0, 200)}</div> : null}
                {(vm.stepsByRun[r.id] ?? []).length > 0 && (
                  <ol className="mt-2 space-y-1">
                    {(vm.stepsByRun[r.id] ?? []).map((s) => (
                      <li key={s.id} className="text-sm text-zinc-600">
                        #{s.seq} {s.kind}
                        {s.tool_name ? ` · ${s.tool_name}` : ""}
                        {s.guard_verdict ? ` · guard ${s.guard_verdict}` : ""}
                        {s.result_summary ? ` · ${s.result_summary}` : ""}
                        {s.content ? <span className="text-red-600"> · {s.content}</span> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Report */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Report</h2>
        {vm.empty.reports ? (
          <p className="text-sm text-zinc-500">
            No report yet. The full Reports surface arrives in Stage 5 — linked here when present.
          </p>
        ) : (
          <ul className="space-y-2">
            {vm.reports.map((r) => (
              <li key={r.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-sm text-zinc-950">{r.summary.slice(0, 300)}</div>
                <div className="text-sm text-zinc-500">
                  {r.report_type} · {new Date(r.created_at).toLocaleString()} ·{" "}
                  <Link href={`/admin/workforce/reports/${r.id}`} className="hover:text-zinc-800 hover:underline">
                    open report
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
