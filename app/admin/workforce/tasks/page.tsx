/**
 * app/admin/workforce/tasks/page.tsx — Stage 3: Task list.
 *
 * Real agent_tasks rows grouped/filtered by ACTUAL schema states
 * (queued/running/awaiting_approval/completed/failed/cancelled/expired —
 * there is no 'pending'). ?status= filters to one state; unknown values
 * fall back to unfiltered rather than 500. Tenant-scoped per contract
 * (platform-wide admin view here, tenantId null).
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Read-only: rows link to tasks/[id]; no actions.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { StatusBadge } from "@/components/admin/ModerationBadge";
import AdminTable from "@/components/admin/table/AdminTable";
import type { AdminColumn } from "@/components/admin/table/types";
import { tableStrings } from "@/components/admin/table/strings";
import { fetchTaskList, fetchTaskStatusCounts, taskStatusLabel, isTaskStatusValue } from "@/lib/workforce/tasks";

const GROUP_ORDER = ["queued", "running", "awaiting_approval", "failed", "completed", "cancelled", "expired"];

const columns: AdminColumn[] = [
  { id: "task", header: "Task", role: "title" },
  { id: "status", header: "Status", role: "value", width: "170px" },
  { id: "priority", header: "Priority", role: "meta", hideBelow: "md" },
  { id: "created", header: "Created", role: "meta", align: "right", hideBelow: "md" },
];

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
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Tasks</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Tasks"
        description={`${tasks.length} shown${activeFilter ? ` · filtered to ${taskStatusLabel(activeFilter)}` : ""} · counts cover the 200 most recent tasks.`}
      />

      <StatStrip
        items={[
          { label: "Shown", value: tasks.length },
          { label: "Queued", value: counts["queued"] ?? 0 },
          { label: "Running", value: counts["running"] ?? 0 },
          { label: "Awaiting approval", value: counts["awaiting_approval"] ?? 0 },
          { label: "Failed", value: counts["failed"] ?? 0 },
        ]}
      />

      {/* Status filter chips (actual schema states) */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/tasks"
          className={`rounded-xl px-3 py-1 text-sm font-medium ${activeFilter === null ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
        >
          all
        </Link>
        {GROUP_ORDER.filter((s) => (counts[s] ?? 0) > 0 || s === activeFilter).map((s) => (
          <Link
            key={s}
            href={`/admin/workforce/tasks?status=${s}`}
            className={`rounded-xl px-3 py-1 text-sm font-medium ${activeFilter === s ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
          >
            {taskStatusLabel(s)} ({counts[s] ?? 0})
          </Link>
        ))}
      </div>

      <AdminTable
        columns={columns}
        rows={tasks.map((t) => ({
          id: t.id,
          detailHref: `/admin/workforce/tasks/${t.id}`,
          cells: [
            <Link
              key="task"
              href={`/admin/workforce/tasks/${t.id}`}
              className="font-semibold text-zinc-950 hover:underline"
            >
              {t.title}
            </Link>,
            <StatusBadge key="status" status={t.status} />,
            <span key="priority" className="text-zinc-600">
              priority {t.priority}
            </span>,
            <span key="created" className="whitespace-nowrap text-xs text-zinc-500">
              {new Date(t.created_at).toLocaleString()}
            </span>,
          ],
        }))}
        emptyMessage={
          activeFilter
            ? `No ${taskStatusLabel(activeFilter)} tasks in the recent window.`
            : "No tasks recorded yet. Runs created through the gateway appear here."
        }
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <p className="text-xs font-semibold text-zinc-400">
          {tasks.length === 0
            ? tableStrings.showingNone(tasks.length)
            : tableStrings.showingResults(1, tasks.length, tasks.length)}
        </p>
      </div>
    </div>
  );
}
