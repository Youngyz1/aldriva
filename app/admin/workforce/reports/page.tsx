/**
 * app/admin/workforce/reports/page.tsx — Stage 5: Reports list.
 *
 * Real persisted agent_reports rows (never reconstructed), tenant-scoped,
 * filterable by report_type (the schema has no status column — stated, not
 * worked around). Unknown ?type= falls back to unfiltered, never 500.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Read-only: rows link to reports/[id]; no actions.
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
import { fetchReportList, isReportTypeValue, REPORT_TYPES } from "@/lib/workforce/reports";
import { fetchAgentList } from "@/lib/workforce/agents";

const columns: AdminColumn[] = [
  { id: "summary", header: "Summary", role: "title" },
  { id: "type", header: "Type", role: "value", width: "150px" },
  { id: "agent", header: "Agent", role: "meta" },
  { id: "created", header: "Created", role: "meta", align: "right", hideBelow: "md" },
];

export default async function WorkforceReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  await headers();
  await requireAdmin();
  const { type } = await searchParams;

  const supabase = await createSupabaseServer();
  const activeFilter = type && isReportTypeValue(type) ? type : null;
  const [reports, agents] = await Promise.all([
    fetchReportList(supabase, null, activeFilter),
    fetchAgentList(supabase),
  ]);
  const agentNameById = new Map(agents.map((a) => [a.id, a.display_name]));

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Reports</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Reports"
        description={`${reports.length} persisted report(s)${activeFilter ? ` · type ${activeFilter}` : ""} · read from storage, never regenerated.`}
      />

      <StatStrip items={[{ label: "Shown", value: reports.length }]} />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/reports"
          className={`rounded-xl px-3 py-1 text-sm font-medium ${activeFilter === null ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
        >
          all
        </Link>
        {REPORT_TYPES.map((t) => (
          <Link
            key={t}
            href={`/admin/workforce/reports?type=${t}`}
            className={`rounded-xl px-3 py-1 text-sm font-medium ${activeFilter === t ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
          >
            {t}
          </Link>
        ))}
      </div>

      <AdminTable
        columns={columns}
        rows={reports.map((r) => ({
          id: r.id,
          detailHref: `/admin/workforce/reports/${r.id}`,
          cells: [
            <Link
              key="summary"
              href={`/admin/workforce/reports/${r.id}`}
              className="block max-w-[320px] font-semibold text-zinc-950 hover:underline"
            >
              {r.summary.slice(0, 140)}
            </Link>,
            <span key="type" className="whitespace-nowrap text-zinc-600">
              {r.report_type}
            </span>,
            <span key="agent" className="text-zinc-600">
              {agentNameById.get(r.agent_id) ?? "unknown agent"}
            </span>,
            <span key="created" className="whitespace-nowrap text-xs text-zinc-500">
              {new Date(r.created_at).toLocaleString()}
            </span>,
          ],
        }))}
        emptyMessage={`No reports${activeFilter ? ` of type ${activeFilter}` : ""} yet. Completed runs persist one here.`}
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <p className="text-xs font-semibold text-zinc-400">
          {reports.length === 0
            ? tableStrings.showingNone(reports.length)
            : tableStrings.showingResults(1, reports.length, reports.length)}
        </p>
      </div>
    </div>
  );
}
