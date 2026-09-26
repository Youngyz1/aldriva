/**
 * app/[locale]/admin/workforce/reports/[id]/page.tsx — Stage 5: Report detail.
 *
 * Full summary, whitelisted findings sections (unknown section keys render
 * as type descriptors, never raw values), linked agent/run/task/incident.
 * Malformed/missing id → notFound(), never 500.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { FileText } from "lucide-react";
import { fetchReportDetail, buildReportDetailViewModel, isReportIdShape } from "@/lib/workforce/reports";

export default async function WorkforceReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await headers();
  await requireAdmin();
  const { id } = await params;
  if (!isReportIdShape(id)) notFound();

  const supabase = await createSupabaseServer();
  const raw = await fetchReportDetail(supabase, id, null);
  if (!raw) notFound();
  const vm = buildReportDetailViewModel(raw);
  const r = vm.report;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <FileText size={22} /> Report
        </h1>
        <p className="text-sm text-zinc-400">
          {r.report_type} · {new Date(r.created_at).toLocaleString()}
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Summary</h2>
        <p className="text-sm text-zinc-400">{r.summary}</p>
      </div>

      {/* Findings / sections */}
      <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Findings</h2>
        {vm.empty.sections ? (
          <p className="text-sm text-zinc-500">No structured sections stored on this report.</p>
        ) : (
          <dl className="space-y-2">
            {vm.sections.map((s) => (
              <div key={s.key} className="rounded-xl bg-zinc-800 p-3">
                <dt className="text-sm text-white">{s.key}</dt>
                <dd className="text-sm text-zinc-400">
                  {s.rendered}
                  {s.full ? "" : " (descriptor only — unrecognized section values are never rendered raw)"}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* Linkage */}
      <div className="space-y-1 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Linked records</h2>
        <p className="text-sm text-zinc-400">
          agent:{" "}
          {vm.agent ? (
            <Link href={`/admin/workforce/agents/${vm.agent.id}`} className="text-white hover:underline">
              {vm.agent.display_name}
            </Link>
          ) : (
            "agent record no longer present"
          )}
        </p>
        <p className="text-sm text-zinc-400">
          task:{" "}
          {vm.taskId ? (
            <Link href={`/admin/workforce/tasks/${vm.taskId}`} className="hover:text-white">
              open task
            </Link>
          ) : (
            "none linked"
          )}
        </p>
        <p className="text-sm text-zinc-400">
          incident:{" "}
          {vm.incident ? (
            <Link href="/admin/workforce/sentinel" className="hover:text-white">
              {vm.incident.severity} — {vm.incident.title.slice(0, 100)} ({vm.incident.status})
            </Link>
          ) : (
            "none linked"
          )}
        </p>
      </div>

      <Link href="/admin/workforce/reports" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Reports
      </Link>
    </div>
  );
}
