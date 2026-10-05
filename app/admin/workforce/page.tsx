/**
 * app/admin/workforce/page.tsx — Stage 1: Workforce Command Center.
 *
 * Answers "What is my AI workforce doing right now?" with real Agent Runtime
 * rows only. Admin-gated (requireAdmin), Server Component, authenticated
 * RLS reads via lib/workforce/command-center.ts. No fabricated data: every
 * number derives from a query, and empty sources render designed empty
 * states (see vm.empty).
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Read-only: rows link to detail pages; no actions.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { StatusBadge } from "@/components/admin/ModerationBadge";
import AdminTable from "@/components/admin/table/AdminTable";
import type { AdminColumn } from "@/components/admin/table/types";
import {
  fetchCommandCenterData,
  buildCommandCenterViewModel,
} from "@/lib/workforce/command-center";

const SEVERITY_TONE: Record<string, string> = {
  s1: "text-red-600",
  s2: "text-amber-600",
  s3: "text-amber-500",
  s4: "text-zinc-500",
};

function SectionHead({ title, href }: { title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-bold text-zinc-950">{title}</h2>
      <Link href={href} className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
        View all
      </Link>
    </div>
  );
}

const agentColumns: AdminColumn[] = [
  { id: "agent", header: "Agent", role: "title" },
  { id: "presence", header: "Presence", role: "value", width: "110px" },
  { id: "department", header: "Department", role: "meta" },
  { id: "lifecycle", header: "Lifecycle", role: "meta", hideBelow: "md" },
  { id: "lastrun", header: "Last run", role: "meta", align: "right", hideBelow: "md" },
];

const approvalColumns: AdminColumn[] = [
  { id: "action", header: "Action", role: "title" },
  { id: "risk", header: "Risk", role: "value", width: "90px" },
  { id: "requested", header: "Requested", role: "meta", hideBelow: "md" },
  { id: "expires", header: "Expires", role: "meta", align: "right", hideBelow: "md" },
];

const incidentColumns: AdminColumn[] = [
  { id: "incident", header: "Incident", role: "title" },
  { id: "status", header: "Status", role: "value", width: "130px" },
  { id: "events", header: "Events", role: "meta", hideBelow: "md" },
  { id: "seen", header: "Last seen", role: "meta", align: "right", hideBelow: "md" },
];

const taskColumns: AdminColumn[] = [
  { id: "task", header: "Task", role: "title" },
  { id: "status", header: "Status", role: "value", width: "150px" },
  { id: "agent", header: "Agent", role: "meta" },
  { id: "created", header: "Created", role: "meta", align: "right", hideBelow: "md" },
];

const reportColumns: AdminColumn[] = [
  { id: "summary", header: "Summary", role: "title" },
  { id: "type", header: "Type", role: "value", width: "130px" },
  { id: "agent", header: "Agent", role: "meta" },
  { id: "created", header: "Created", role: "meta", align: "right", hideBelow: "md" },
];

const activityColumns: AdminColumn[] = [
  { id: "item", header: "Activity", role: "title" },
  { id: "detail", header: "Detail", role: "value" },
  { id: "at", header: "At", role: "meta", align: "right", hideBelow: "md" },
];

export default async function WorkforceCommandCenterPage() {
  await headers(); // Forces dynamic server-rendering on every request in Next.js 16
  await requireAdmin();

  const supabase = await createSupabaseServer();
  // Platform-wide admin view (tenantId null). Throws only on query failure;
  // a missing table surfaces as a 500 here rather than fake zeros.
  const raw = await fetchCommandCenterData(supabase, null);
  const vm = buildCommandCenterViewModel(raw);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow="AI Workforce"
        title="Command Center"
        description="Live Agent Runtime state. Every number below comes from the database — no projections."
      />

      <StatStrip
        items={[
          { label: "Agents", value: vm.counts.totalAgents },
          { label: "Active", value: vm.counts.activeAgents },
          { label: "Running runs", value: vm.counts.runningRuns },
          { label: "Active tasks", value: vm.counts.activeTasks },
          { label: "Pending approvals", value: vm.counts.pendingApprovals },
          { label: "Open incidents", value: vm.counts.openIncidents },
        ]}
      />

      <section className="space-y-3">
        <SectionHead title="Agents" href="/admin/workforce/agents" />
        <AdminTable
          columns={agentColumns}
          rows={vm.agents.map(({ agent, busy, lastRunAt }) => ({
            id: agent.id,
            detailHref: `/admin/workforce/agents/${agent.id}`,
            cells: [
              <Link
                key="agent"
                href={`/admin/workforce/agents/${agent.id}`}
                className="font-semibold text-zinc-950 hover:underline"
              >
                {agent.display_name}
              </Link>,
              <span key="presence" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${busy ? "bg-emerald-500" : "bg-zinc-300"}`}
                />
                <span className={busy ? "text-emerald-700" : "text-zinc-500"}>{busy ? "busy" : "idle"}</span>
              </span>,
              <span key="department" className="text-zinc-600">
                {agent.department} · {agent.autonomy_level}
              </span>,
              <StatusBadge key="lifecycle" status={agent.status} />,
              <span key="lastrun" className="whitespace-nowrap text-xs text-zinc-500">
                {lastRunAt ? new Date(lastRunAt).toLocaleString() : "no runs yet"}
              </span>,
            ],
          }))}
          emptyMessage="No agents registered. The Agent Registry is empty — nothing is running, and that is expected, not an error."
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Pending approvals" href="/admin/workforce/approvals" />
        <AdminTable
          columns={approvalColumns}
          rows={vm.approvals.map((a) => ({
            id: a.id,
            detailHref: `/admin/workforce/approvals/${a.id}`,
            cells: [
              <Link
                key="action"
                href={`/admin/workforce/approvals/${a.id}`}
                className="font-semibold text-zinc-950 hover:underline"
              >
                {a.action}
              </Link>,
              <StatusBadge key="risk" status={a.risk} />,
              <span key="requested" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(a.created_at).toLocaleString()}
              </span>,
              <span key="expires" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(a.expires_at).toLocaleString()}
              </span>,
            ],
          }))}
          emptyMessage="No pending approvals. Nothing is waiting on a human."
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Open incidents" href="/admin/workforce/sentinel" />
        <AdminTable
          columns={incidentColumns}
          rows={vm.incidents.map((inc) => ({
            id: inc.id,
            detailHref: `/admin/workforce/sentinel/incidents/${inc.id}`,
            cells: [
              <span key="incident" className="font-semibold text-zinc-950">
                <span className={SEVERITY_TONE[inc.severity] ?? "text-zinc-500"}>{inc.severity}</span>
                {" — "}
                <Link
                  href={`/admin/workforce/sentinel/incidents/${inc.id}`}
                  className="hover:underline"
                >
                  {inc.title}
                </Link>
              </span>,
              <StatusBadge key="status" status={inc.status} />,
              <span key="events" className="tabular-nums text-zinc-600">
                {inc.event_count} event(s)
              </span>,
              <span key="seen" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(inc.last_seen_at).toLocaleString()}
              </span>,
            ],
          }))}
          emptyMessage="No open or investigating incidents. Sentinel has nothing to report."
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Recent tasks" href="/admin/workforce/tasks" />
        <AdminTable
          columns={taskColumns}
          rows={vm.tasks.map((t) => ({
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
              <span key="agent" className="text-zinc-600">
                {vm.agentNameById[t.agent_id] ?? "unknown agent"}
              </span>,
              <span key="created" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(t.created_at).toLocaleString()}
              </span>,
            ],
          }))}
          emptyMessage="No tasks recorded yet."
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Recent reports" href="/admin/workforce/reports" />
        <AdminTable
          columns={reportColumns}
          rows={vm.reports.map((r) => ({
            id: r.id,
            detailHref: `/admin/workforce/reports/${r.id}`,
            cells: [
              <Link
                key="summary"
                href={`/admin/workforce/reports/${r.id}`}
                className="block max-w-[320px] font-semibold text-zinc-950 hover:underline"
              >
                {r.summary.slice(0, 160)}
              </Link>,
              <span key="type" className="whitespace-nowrap text-zinc-600">
                {r.report_type}
              </span>,
              <span key="agent" className="text-zinc-600">
                {vm.agentNameById[r.agent_id] ?? "unknown agent"}
              </span>,
              <span key="created" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(r.created_at).toLocaleString()}
              </span>,
            ],
          }))}
          emptyMessage="No agent reports yet. Reports appear here after runs complete."
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Recent activity" href="/admin/workforce/activity" />
        <AdminTable
          columns={activityColumns}
          rows={[
            ...vm.runs.slice(0, 5).map((r) => ({
              id: `run-${r.id}`,
              cells: [
                <span key="item" className="text-zinc-950">
                  run · {vm.agentNameById[r.agent_id] ?? "unknown agent"}
                </span>,
                <span key="detail" className="text-zinc-600">
                  {r.status}
                  {r.error ? ` · ${r.error.slice(0, 120)}` : ""}
                </span>,
                <span key="at" className="whitespace-nowrap text-xs text-zinc-500">
                  {new Date(r.created_at).toLocaleString()}
                </span>,
              ],
            })),
            ...vm.events.slice(0, 5).map((e) => ({
              id: `ev-${e.id}`,
              cells: [
                <span key="item" className="text-zinc-950">
                  event · {e.kind}
                </span>,
                <span key="detail" className="text-zinc-600">
                  {e.route ?? "no route"}
                </span>,
                <span key="at" className="whitespace-nowrap text-xs text-zinc-500">
                  {new Date(e.created_at).toLocaleString()}
                </span>,
              ],
            })),
          ]}
          emptyMessage="No runs or events yet. Activity will appear here as the workforce operates."
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="QA runs" href="/admin/workforce/qa" />
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          {vm.empty.qa ? (
            <p className="text-sm text-zinc-500">No QA runs recorded. This zero is real, not a placeholder.</p>
          ) : (
            <p className="text-sm text-zinc-950">
              {vm.counts.qaRuns} QA run(s) recorded. Latest detail lives under QA.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
