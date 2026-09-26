/**
 * app/[locale]/admin/workforce/tasks/page.tsx — Stage 3: Task list.
 *
 * Real agent_tasks rows grouped/filtered by ACTUAL schema states
 * (queued/running/awaiting_approval/completed/failed/cancelled/expired —
 * there is no 'pending'). ?status= filters to one state; unknown values
 * fall back to unfiltered rather than 500. Tenant-scoped per contract
 * (platform-wide admin view here, tenantId null).
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { fetchTaskList, fetchTaskStatusCounts, taskStatusLabel, isTaskStatusValue } from "@/lib/workforce/tasks";

const GROUP_ORDER = ["queued", "running", "awaiting_approval", "failed", "completed", "cancelled", "expired"];

export default async function WorkforceTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await headers();
  await requireAdmin();
  const { status } = await searchParams;

  const supabase = await createSupabaseServer();
  const activeFilter = status && isTaskStatusValue(status) ? status : null;
  const [tasks, counts] = await Promise.all([
    fetchTaskList(supabase, null, activeFilter),
    fetchTaskStatusCounts(supabase, null),
  ]);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <ClipboardList size={22} /> Tasks
        </h1>
        <p className="text-sm text-zinc-400">
          {tasks.length} shown{activeFilter ? ` · filtered to ${taskStatusLabel(activeFilter)}` : ""} · counts cover the
          200 most recent tasks.
        </p>
      </div>

      {/* Status filter chips (actual schema states) */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/tasks"
          className={`rounded-xl px-3 py-1 text-sm ${activeFilter === null ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
        >
          all
        </Link>
        {GROUP_ORDER.filter((s) => (counts[s] ?? 0) > 0 || s === activeFilter).map((s) => (
          <Link
            key={s}
            href={`/admin/workforce/tasks?status=${s}`}
            className={`rounded-xl px-3 py-1 text-sm ${activeFilter === s ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
          >
            {taskStatusLabel(s)} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>

      {tasks.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {activeFilter
            ? `No ${taskStatusLabel(activeFilter)} tasks in the recent window.`
            : "No tasks recorded yet. Runs created through the gateway appear here."}
        </p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex flex-col gap-1 rounded-xl bg-zinc-900 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link href={`/admin/workforce/tasks/${t.id}`} className="text-sm text-white hover:underline">
                  {t.title}
                </Link>{" "}
                <span className="text-sm text-zinc-500">
                  {taskStatusLabel(t.status)} · priority {t.priority}
                </span>
              </div>
              <div className="text-sm text-zinc-500">{new Date(t.created_at).toLocaleString()}</div>
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
