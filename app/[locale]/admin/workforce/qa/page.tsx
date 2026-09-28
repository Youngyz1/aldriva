/**
 * app/[locale]/admin/workforce/qa/page.tsx — Stage 8: QA runs list.
 *
 * Real persisted qa_runs rows (migration 145), newest first, bounded,
 * filterable by the ACTUAL schema statuses
 * (requested/approved/running/failed/passed/cancelled/expired — nothing
 * invented). Platform-wide admin view (tenantId null): null-tenant
 * platform-level smoke runs and tenant-targeted runs all appear — failed
 * runs (including the known donate-spec smoke failure) render honestly,
 * never filtered out. Unknown ?status= falls back to unfiltered, never
 * 500.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import {
  fetchQaRunList,
  fetchQaStatusCounts,
  isQaStatusValue,
  qaDurationLabel,
  QA_STATUSES,
} from "@/lib/workforce/qa";

const STATUS_TONE: Record<string, string> = {
  failed: "text-red-400",
  passed: "text-emerald-400",
  running: "text-amber-400",
  requested: "text-zinc-400",
  approved: "text-zinc-300",
  cancelled: "text-zinc-500",
  expired: "text-zinc-500",
};

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
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <FlaskConical size={22} /> QA runs
        </h1>
        <p className="text-sm text-zinc-400">
          {runs.length} shown{activeFilter ? ` · filtered to ${activeFilter}` : ""} · counts cover the
          200 most recent runs · staging only, newest first.
        </p>
      </div>

      {/* Status filter chips (actual schema states) */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/qa"
          className={`rounded-xl px-3 py-1 text-sm ${activeFilter === null ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
        >
          all
        </Link>
        {QA_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/workforce/qa?status=${s}`}
            className={`rounded-xl px-3 py-1 text-sm ${activeFilter === s ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
          >
            {s} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>

      {runs.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {activeFilter
            ? `No ${activeFilter} QA runs in the recent window.`
            : "No QA runs recorded yet. Approved QA requests claimed by the worker appear here."}
        </p>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => {
            const duration = qaDurationLabel(r.started_at, r.finished_at);
            return (
              <li key={r.id} className="flex flex-col gap-1 rounded-xl bg-zinc-900 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/admin/workforce/qa/${r.id}`} className="text-sm text-white hover:underline">
                    {r.suite}
                  </Link>{" "}
                  <span className={`text-sm ${STATUS_TONE[r.status] ?? "text-zinc-400"}`}>{r.status}</span>{" "}
                  <span className="text-sm text-zinc-500">
                    · {r.environment} · via {r.triggered_by} · {r.target_tenant_id ? "tenant run" : "platform run"}
                  </span>
                  <div className="text-sm text-zinc-500 tabular-nums">
                    {r.passed} passed · {r.failed} failed · {r.skipped} skipped
                    {duration ? ` · ran ${duration}` : ""}
                  </div>
                </div>
                <div className="text-sm text-zinc-500">
                  {new Date(r.created_at).toLocaleString()}
                  {r.finished_at ? ` → finished ${new Date(r.finished_at).toLocaleString()}` : " · still open"}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/admin/workforce" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Command Center
      </Link>
    </div>
  );
}
