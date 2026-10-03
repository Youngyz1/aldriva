/**
 * app/admin/workforce/reports/page.tsx — Stage 5: Reports list.
 *
 * Real persisted agent_reports rows (never reconstructed), tenant-scoped,
 * filterable by report_type (the schema has no status column — stated, not
 * worked around). Unknown ?type= falls back to unfiltered, never 500.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { FileText } from "lucide-react";
import { fetchReportList, isReportTypeValue, REPORT_TYPES } from "@/lib/workforce/reports";
import { fetchAgentList } from "@/lib/workforce/agents";

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
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <FileText size={22} /> Reports
        </h1>
        <p className="text-sm text-zinc-400">
          {reports.length} persisted report(s){activeFilter ? ` · type ${activeFilter}` : ""} · read from storage,
          never regenerated.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/reports"
          className={`rounded-xl px-3 py-1 text-sm ${activeFilter === null ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
        >
          all
        </Link>
        {REPORT_TYPES.map((t) => (
          <Link
            key={t}
            href={`/admin/workforce/reports?type=${t}`}
            className={`rounded-xl px-3 py-1 text-sm ${activeFilter === t ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
          >
            {t}
          </Link>
        ))}
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No reports{activeFilter ? ` of type ${activeFilter}` : ""} yet. Completed runs persist one here.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-xl bg-zinc-900 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link href={`/admin/workforce/reports/${r.id}`} className="text-sm text-white hover:underline">
                  {r.summary.slice(0, 140)}
                </Link>{" "}
                <span className="text-sm text-zinc-500">
                  {agentNameById.get(r.agent_id) ?? "unknown agent"} · {r.report_type}
                </span>
              </div>
              <div className="text-sm text-zinc-500">{new Date(r.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}
      <Link href="/admin/workforce" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Command Center
      </Link>
    </div>
  );
}
