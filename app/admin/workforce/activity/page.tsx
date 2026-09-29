/**
 * app/admin/workforce/activity/page.tsx — Stage 6: Activity feed.
 *
 * Unified chronological feed (bounded window of 60, newest first) from
 * agent runs, tasks, approvals, reports, incidents, and native
 * system_events. Tenant-scoped. Every entry links to its source page.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { Activity } from "lucide-react";
import { fetchActivityData, buildActivityFeed, FEED_CAP } from "@/lib/workforce/activity";

const KIND_TONE: Record<string, string> = {
  run: "text-zinc-400",
  task: "text-zinc-400",
  approval: "text-amber-400",
  report: "text-white",
  incident: "text-red-400",
  event: "text-zinc-500",
};

export default async function WorkforceActivityPage() {
  await headers();
  await requireAdmin();

  const supabase = await createSupabaseServer();
  const entries = buildActivityFeed(await fetchActivityData(supabase, null));

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <Activity size={22} /> Activity
        </h1>
        <p className="text-sm text-zinc-400">
          {entries.length} most recent event(s) (window capped at {FEED_CAP}) — runs, tasks, approvals, reports,
          incidents, and system signals, newest first.
        </p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No activity yet. Entries appear here as agents run, tasks move, approvals are decided, and signals fire.
        </p>
      ) : (
        <ol className="space-y-2">
          {entries.map((e) => (
            <li key={e.key} className="flex flex-col gap-1 rounded-xl bg-zinc-900 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className={`text-sm ${KIND_TONE[e.kind] ?? "text-zinc-400"}`}>{e.title}</span>{" "}
                <Link href={e.href} className="text-sm text-zinc-500 hover:text-white">
                  {e.detail.slice(0, 160)}
                </Link>
              </div>
              <div className="text-sm text-zinc-500">
                {e.kind} · {new Date(e.ts).toLocaleString()}
              </div>
            </li>
          ))}
        </ol>
      )}
      <Link href="/admin/workforce" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Command Center
      </Link>
    </div>
  );
}
