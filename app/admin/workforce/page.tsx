/**
 * app/admin/workforce/page.tsx — Stage 1: Workforce Command Center.
 *
 * Answers "What is my AI workforce doing right now?" with real Agent Runtime
 * rows only. Admin-gated (requireAdmin), Server Component, authenticated
 * RLS reads via lib/workforce/command-center.ts. No fabricated data: every
 * number derives from a query, and empty sources render designed empty
 * states (see vm.empty).
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import {
  Bot,
  ClipboardList,
  CheckSquare,
  FileText,
  Activity,
  AlertTriangle,
  FlaskConical,
  ShieldAlert,
  CircleDot,
} from "lucide-react";
import {
  fetchCommandCenterData,
  buildCommandCenterViewModel,
} from "@/lib/workforce/command-center";

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="text-2xl text-white">{value}</div>
      <div className="text-sm text-zinc-500">{hint}</div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-zinc-500">{text}</p>;
}

function SectionHead({ icon: Icon, title, href }: { icon: typeof Bot; title: string; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-base text-white">
        <Icon size={18} /> {title}
      </h2>
      <Link href={href} className="text-sm text-zinc-400 hover:text-white">
        View all
      </Link>
    </div>
  );
}

const SEVERITY_TONE: Record<string, string> = {
  s1: "text-red-400",
  s2: "text-amber-400",
  s3: "text-amber-500",
  s4: "text-zinc-400",
};

export default async function WorkforceCommandCenterPage() {
  await headers(); // Forces dynamic server-rendering on every request in Next.js 16
  await requireAdmin();

  const supabase = await createSupabaseServer();
  // Platform-wide admin view (tenantId null). Throws only on query failure;
  // a missing table surfaces as a 500 here rather than fake zeros.
  const raw = await fetchCommandCenterData(supabase, null);
  const vm = buildCommandCenterViewModel(raw);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <CircleDot size={22} /> AI Workforce — Command Center
        </h1>
        <p className="text-sm text-zinc-400">
          Live Agent Runtime state. Every number below comes from the database — no projections.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Agents" value={vm.counts.totalAgents} hint={`${vm.counts.activeAgents} active · ${vm.counts.idleAgents} idle`} />
        <StatCard label="Running runs" value={vm.counts.runningRuns} hint={`${vm.counts.awaitingApproval} awaiting approval · last 20 runs`} />
        <StatCard label="Active tasks" value={vm.counts.activeTasks} hint={`${vm.counts.failedRunsRecent} failed in recent runs`} />
        <StatCard label="Pending approvals" value={vm.counts.pendingApprovals} hint={`${vm.counts.openIncidents} open incidents`} />
      </div>

      {/* Agents */}
      <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <SectionHead icon={Bot} title="Agents" href="/admin/workforce/agents" />
        {vm.empty.agents ? (
          <EmptyNote text="No agents registered. The Agent Registry is empty — nothing is running, and that is expected, not an error." />
        ) : (
          <ul className="space-y-2">
            {vm.agents.map(({ agent, busy, lastRunAt }) => (
              <li key={agent.id} className="flex flex-col gap-1 rounded-xl bg-zinc-800 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-sm text-white">{agent.display_name}</span>{" "}
                  <span className="text-sm text-zinc-500">
                    {agent.department} · {agent.autonomy_level} · {agent.status}
                  </span>
                </div>
                <div className="text-sm text-zinc-400">
                  <span className={busy ? "text-emerald-500" : "text-zinc-500"}>{busy ? "busy" : "idle"}</span>
                  {lastRunAt ? ` · last run ${new Date(lastRunAt).toLocaleString()}` : " · no runs yet"}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Approvals + Incidents */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <SectionHead icon={CheckSquare} title="Pending approvals" href="/admin/workforce/approvals" />
          {vm.empty.approvals ? (
            <EmptyNote text="No pending approvals. Nothing is waiting on a human." />
          ) : (
            <ul className="space-y-2">
              {vm.approvals.map((a) => (
                <li key={a.id} className="rounded-xl bg-zinc-800 p-3">
                  <div className="text-sm text-white">{a.action}</div>
                  <div className="text-sm text-zinc-500">
                    risk {a.risk} · requested {new Date(a.created_at).toLocaleString()} · expires{" "}
                    {new Date(a.expires_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <SectionHead icon={AlertTriangle} title="Open incidents" href="/admin/workforce/sentinel" />
          {vm.empty.incidents ? (
            <EmptyNote text="No open or investigating incidents. Sentinel has nothing to report." />
          ) : (
            <ul className="space-y-2">
              {vm.incidents.map((inc) => (
                <li key={inc.id} className="rounded-xl bg-zinc-800 p-3">
                  <div className="text-sm text-white">
                    <span className={SEVERITY_TONE[inc.severity] ?? "text-zinc-400"}>{inc.severity}</span> — {inc.title}
                  </div>
                  <div className="text-sm text-zinc-500">
                    {inc.status} · {inc.event_count} event(s) · seen {new Date(inc.last_seen_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Tasks + QA */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <SectionHead icon={ClipboardList} title="Recent tasks" href="/admin/workforce/tasks" />
          {vm.empty.tasks ? (
            <EmptyNote text="No tasks recorded yet." />
          ) : (
            <ul className="space-y-2">
              {vm.tasks.map((t) => (
                <li key={t.id} className="rounded-xl bg-zinc-800 p-3">
                  <div className="text-sm text-white">{t.title}</div>
                  <div className="text-sm text-zinc-500">
                    {vm.agentNameById[t.agent_id] ?? "unknown agent"} · {t.status} ·{" "}
                    {new Date(t.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <SectionHead icon={FlaskConical} title="QA runs" href="/admin/workforce/qa" />
          {vm.empty.qa ? (
            <EmptyNote text="No QA runs recorded. This zero is real, not a placeholder." />
          ) : (
            <p className="text-sm text-white">
              {vm.counts.qaRuns} QA run(s) recorded. Latest detail lives under QA.
            </p>
          )}
        </div>
      </div>

      {/* Reports + Activity */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <SectionHead icon={FileText} title="Recent reports" href="/admin/workforce/reports" />
          {vm.empty.reports ? (
            <EmptyNote text="No agent reports yet. Reports appear here after runs complete." />
          ) : (
            <ul className="space-y-2">
              {vm.reports.map((r) => (
                <li key={r.id} className="rounded-xl bg-zinc-800 p-3">
                  <div className="text-sm text-white">{r.summary.slice(0, 160)}</div>
                  <div className="text-sm text-zinc-500">
                    {vm.agentNameById[r.agent_id] ?? "unknown agent"} · {r.report_type} ·{" "}
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <SectionHead icon={Activity} title="Recent activity" href="/admin/workforce/activity" />
          {vm.empty.runs && vm.empty.events ? (
            <EmptyNote text="No runs or events yet. Activity will appear here as the workforce operates." />
          ) : (
            <ul className="space-y-2">
              {vm.runs.slice(0, 5).map((r) => (
                <li key={`run-${r.id}`} className="text-sm text-zinc-400">
                  run · {vm.agentNameById[r.agent_id] ?? "unknown agent"} · {r.status} ·{" "}
                  {new Date(r.created_at).toLocaleString()}
                  {r.error ? <span className="text-red-400"> · {r.error.slice(0, 120)}</span> : null}
                </li>
              ))}
              {vm.events.slice(0, 5).map((e) => (
                <li key={`ev-${e.id}`} className="text-sm text-zinc-400">
                  event · {e.kind}
                  {e.route ? ` · ${e.route}` : ""} · {new Date(e.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Sentinel link card */}
      <div className="flex items-center justify-between rounded-xl bg-zinc-900 p-4 shadow-xs">
        <p className="flex items-center gap-2 text-sm text-zinc-400">
          <ShieldAlert size={18} /> Sentinel investigations and full incident history live under Sentinel (Stage 9).
        </p>
        <Link href="/admin/workforce/sentinel" className="text-sm text-zinc-400 hover:text-white">
          Open Sentinel
        </Link>
      </div>
    </div>
  );
}
