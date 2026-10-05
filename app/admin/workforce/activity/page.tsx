/**
 * app/admin/workforce/activity/page.tsx — Stage 6: Activity feed.
 *
 * Unified chronological feed (bounded window of 60, newest first) from
 * agent runs, tasks, approvals, reports, incidents, and native
 * system_events. Tenant-scoped. Every entry links to its source page.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Read-only: entries link out; no actions.
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
import { fetchActivityData, buildActivityFeed, FEED_CAP } from "@/lib/workforce/activity";

const KIND_TONE: Record<string, string> = {
  run: "text-zinc-600",
  task: "text-zinc-600",
  approval: "text-amber-600",
  report: "text-zinc-950",
  incident: "text-red-600",
  event: "text-zinc-500",
};

const columns: AdminColumn[] = [
  { id: "entry", header: "Activity", role: "title" },
  { id: "detail", header: "Detail", role: "value" },
  { id: "at", header: "At", role: "meta", align: "right", hideBelow: "md" },
];

export default async function WorkforceActivityPage() {
  await headers();
  await requireAdmin();

  const supabase = await createSupabaseServer();
  const entries = buildActivityFeed(await fetchActivityData(supabase, null));

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Activity</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Activity"
        description={`${entries.length} most recent event(s) (window capped at ${FEED_CAP}) — runs, tasks, approvals, reports, incidents, and system signals, newest first.`}
      />

      <StatStrip items={[{ label: "Recent entries", value: entries.length }]} />

      <AdminTable
        columns={columns}
        rows={entries.map((e) => ({
          id: e.key,
          detailHref: e.href,
          cells: [
            <span key="entry" className={`font-semibold ${KIND_TONE[e.kind] ?? "text-zinc-600"}`}>
              {e.title}
            </span>,
            <Link key="detail" href={e.href} className="text-zinc-600 hover:text-zinc-950 hover:underline">
              {e.detail.slice(0, 160)}
            </Link>,
            <span key="at" className="whitespace-nowrap text-xs text-zinc-500">
              {e.kind} · {new Date(e.ts).toLocaleString()}
            </span>,
          ],
        }))}
        emptyMessage="No activity yet. Entries appear here as agents run, tasks move, approvals are decided, and signals fire."
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <p className="text-xs font-semibold text-zinc-400">
          {entries.length === 0
            ? tableStrings.showingNone(entries.length)
            : tableStrings.showingResults(1, entries.length, entries.length)}
        </p>
      </div>
    </div>
  );
}
