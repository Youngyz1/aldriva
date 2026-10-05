/**
 * app/admin/workforce/reports/[id]/page.tsx — Stage 5: Report detail.
 *
 * Full summary, whitelisted findings sections (unknown section keys render
 * as type descriptors, never raw values), linked agent/run/task/incident.
 * Malformed/missing id → notFound(), never 500.
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
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce/reports"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span> Reports{" "}
        <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Detail</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Report"
        description={`${r.report_type} · ${new Date(r.created_at).toLocaleString()}`}
      />

      {/* Summary */}
      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Summary</h2>
        <p className="text-sm text-zinc-600">{r.summary}</p>
      </section>

      {/* Findings / sections */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Findings</h2>
        {vm.empty.sections ? (
          <p className="text-sm text-zinc-500">No structured sections stored on this report.</p>
        ) : (
          <dl className="space-y-2">
            {vm.sections.map((s) => (
              <div key={s.key} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <dt className="text-sm font-semibold text-zinc-950">{s.key}</dt>
                <dd className="text-sm text-zinc-600">
                  {s.rendered}
                  {s.full ? "" : " (descriptor only — unrecognized section values are never rendered raw)"}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Linkage */}
      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Linked records</h2>
        <p className="text-sm text-zinc-600">
          agent:{" "}
          {vm.agent ? (
            <Link href={`/admin/workforce/agents/${vm.agent.id}`} className="font-semibold text-zinc-950 hover:underline">
              {vm.agent.display_name}
            </Link>
          ) : (
            "agent record no longer present"
          )}
        </p>
        <p className="text-sm text-zinc-600">
          task:{" "}
          {vm.taskId ? (
            <Link href={`/admin/workforce/tasks/${vm.taskId}`} className="hover:text-zinc-800 hover:underline">
              open task
            </Link>
          ) : (
            "none linked"
          )}
        </p>
        <p className="text-sm text-zinc-600">
          incident:{" "}
          {vm.incident ? (
            <Link
              href={`/admin/workforce/sentinel/incidents/${vm.incident.id}`}
              className="hover:text-zinc-800 hover:underline"
            >
              {vm.incident.severity} — {vm.incident.title.slice(0, 100)} ({vm.incident.status})
            </Link>
          ) : (
            "none linked"
          )}
        </p>
      </section>
    </div>
  );
}
