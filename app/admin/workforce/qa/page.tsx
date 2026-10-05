/**
 * app/admin/workforce/qa/page.tsx — Stage 8: QA runs list.
 *
 * Real persisted qa_runs rows (migration 145), newest first, bounded,
 * filterable by the ACTUAL schema statuses
 * (requested/approved/running/failed/passed/cancelled/expired — nothing
 * invented). Platform-wide admin view (tenantId null): null-tenant
 * platform-level smoke runs and tenant-targeted runs all appear — failed
 * runs (including the known donate-spec smoke failure) render honestly,
 * never filtered out. Unknown ?status= falls back to unfiltered, never
 * 500.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Read-only: rows link to qa/[id]; no actions.
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
import {
  fetchQaRunList,
  fetchQaStatusCounts,
  isQaStatusValue,
  qaDurationLabel,
  QA_STATUSES,
} from "@/lib/workforce/qa";

const STATUS_TONE: Record<string, string> = {
  failed: "text-red-600",
  passed: "text-emerald-600",
  running: "text-amber-600",
  requested: "text-zinc-500",
  approved: "text-zinc-600",
  cancelled: "text-zinc-500",
  expired: "text-zinc-500",
};

const columns: AdminColumn[] = [
  { id: "suite", header: "Suite", role: "title" },
  { id: "status", header: "Status", role: "value", width: "130px" },
  { id: "context", header: "Environment", role: "meta" },
  { id: "results", header: "Results", role: "meta", hideBelow: "md" },
  { id: "created", header: "Created", role: "meta", align: "right", hideBelow: "md" },
];

export default async function WorkforceQAPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await headers();
  await requireAdmin();
  const { status } = await searchParams;

  const supabase = await createSupabaseServer();
  const activeFilter = status && isQaStatusValue(status) ? status : null;
  const [runs, counts] = await Promise.all([
    fetchQaRunList(supabase, null, activeFilter),
    fetchQaStatusCounts(supabase, null),
  ]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span>
        <span className="text-zinc-800">QA runs</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="QA runs"
        description={`${runs.length} shown${activeFilter ? ` · filtered to ${activeFilter}` : ""} · counts cover the 200 most recent runs · staging only, newest first.`}
      />

      <StatStrip
        items={[
          { label: "Shown", value: runs.length },
          { label: "Passed", value: counts["passed"] ?? 0, accent: "text-emerald-600" },
          { label: "Failed", value: counts["failed"] ?? 0, accent: "text-red-600" },
          { label: "Running", value: counts["running"] ?? 0, accent: "text-amber-600" },
        ]}
      />

      {/* Status filter chips (actual schema states) */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/qa"
          className={`rounded-xl px-3 py-1 text-sm font-medium ${activeFilter === null ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
        >
          all
        </Link>
        {QA_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/workforce/qa?status=${s}`}
            className={`rounded-xl px-3 py-1 text-sm font-medium ${activeFilter === s ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
          >
            {s} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>

      <AdminTable
        columns={columns}
        rows={runs.map((r) => {
          const duration = qaDurationLabel(r.started_at, r.finished_at);
          return {
            id: r.id,
            detailHref: `/admin/workforce/qa/${r.id}`,
            cells: [
              <Link
                key="suite"
                href={`/admin/workforce/qa/${r.id}`}
                className="font-semibold text-zinc-950 hover:underline"
              >
                {r.suite}
              </Link>,
              <span key="status" className={`inline-flex items-center gap-1.5 whitespace-nowrap ${STATUS_TONE[r.status] ?? "text-zinc-500"}`}>
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${r.status === "failed" ? "bg-red-500" : r.status === "passed" ? "bg-emerald-500" : r.status === "running" ? "bg-amber-500" : "bg-zinc-300"}`}
                />
                {r.status}
              </span>,
              <span key="context" className="text-zinc-600">
                {r.environment} · via {r.triggered_by} · {r.target_tenant_id ? "tenant run" : "platform run"}
              </span>,
              <span key="results" className="whitespace-nowrap tabular-nums text-zinc-600">
                {r.passed} passed · {r.failed} failed · {r.skipped} skipped
                {duration ? ` · ran ${duration}` : ""}
              </span>,
              <span key="created" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(r.created_at).toLocaleString()}
                {r.finished_at ? ` → finished ${new Date(r.finished_at).toLocaleString()}` : " · still open"}
              </span>,
            ],
          };
        })}
        emptyMessage={
          activeFilter
            ? `No ${activeFilter} QA runs in the recent window.`
            : "No QA runs recorded yet. Approved QA requests claimed by the worker appear here."
        }
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <p className="text-xs font-semibold text-zinc-400">
          {runs.length === 0
            ? tableStrings.showingNone(runs.length)
            : tableStrings.showingResults(1, runs.length, runs.length)}
        </p>
      </div>
    </div>
  );
}
