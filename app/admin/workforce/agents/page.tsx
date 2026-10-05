/**
 * app/admin/workforce/agents/page.tsx — Stage 2: Agent list.
 *
 * Sourced entirely from the Agent Registry (agents table) — no hardcoded
 * agent names. New agents added via INSERT appear here unchanged (Stage 13).
 * Status shows BOTH the stored lifecycle field and live presence, labeled.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Read-only: rows link to agents/[id]; no actions.
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
import { fetchAgentList, fetchRecentRunPresence } from "@/lib/workforce/agents";
import { fetchDecidedApprovalIds, isLiveBusy } from "@/lib/workforce/agents";

const columns: AdminColumn[] = [
  { id: "agent", header: "Agent", role: "title" },
  { id: "presence", header: "Presence", role: "value", width: "130px" },
  { id: "department", header: "Department", role: "meta" },
  { id: "lifecycle", header: "Lifecycle", role: "meta", hideBelow: "md" },
  { id: "activity", header: "Last activity", role: "meta", align: "right", hideBelow: "md" },
  { id: "description", header: "Description", role: "detail", hideBelow: "lg" },
];

export default async function WorkforceAgentsPage() {
  await headers();
  await requireAdmin();

  const supabase = await createSupabaseServer();
  const agents = await fetchAgentList(supabase);
  // Live presence per agent from recent runs (platform-wide admin view).
  const recentRuns = await fetchRecentRunPresence(supabase, null);
  // Stage 17 (O-7): staleness guard — decided-approval phantoms are not busy.
  const decidedApprovalIds = await fetchDecidedApprovalIds(supabase, recentRuns);
  const busyByAgent = new Map<string, boolean>();
  const lastRunByAgent = new Map<string, string>();
  for (const r of recentRuns) {
    if (!lastRunByAgent.has(r.agent_id)) lastRunByAgent.set(r.agent_id, r.created_at);
  }
  for (const a of agents) {
    const live = recentRuns
      .filter((r) => r.agent_id === a.id)
      .some((r) => isLiveBusy(r.status, r.approval_id, decidedApprovalIds));
    busyByAgent.set(a.id, live);
  }
  const busyCount = agents.filter((a) => busyByAgent.get(a.id)).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Agents</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Agents"
        description="Registered identities. Lifecycle status is admin-managed; busy/idle derives from live runs."
      />

      <StatStrip
        items={[
          { label: "Registered", value: agents.length },
          { label: "Active", value: agents.filter((a) => a.status === "active").length },
          { label: "Busy now", value: busyCount },
        ]}
      />

      <AdminTable
        columns={columns}
        rows={agents.map((a) => {
          const busy = busyByAgent.get(a.id) ?? false;
          const lastRun = lastRunByAgent.get(a.id);
          return {
            id: a.id,
            detailHref: `/admin/workforce/agents/${a.id}`,
            cells: [
              <Link
                key="agent"
                href={`/admin/workforce/agents/${a.id}`}
                className="font-semibold text-zinc-950 hover:underline"
              >
                {a.display_name}
              </Link>,
              <span key="presence" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${busy ? "bg-emerald-500" : "bg-zinc-300"}`}
                />
                <span className={busy ? "text-emerald-700" : "text-zinc-500"}>{busy ? "busy" : "idle"}</span>
              </span>,
              <span key="department" className="text-zinc-600">
                {a.department} · {a.autonomy_level}
              </span>,
              <StatusBadge key="lifecycle" status={a.status} />,
              <span key="activity" className="whitespace-nowrap text-xs text-zinc-500">
                {lastRun ? new Date(lastRun).toLocaleString() : "no runs yet"}
              </span>,
              <span key="description" className="block max-w-[320px] text-zinc-600">
                {a.description.slice(0, 160)}
              </span>,
            ],
          };
        })}
        emptyMessage="No agents registered. The Agent Registry is empty — add identities via INSERT, no UI change needed."
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <p className="text-xs font-semibold text-zinc-400">
          {agents.length === 0
            ? tableStrings.showingNone(agents.length)
            : tableStrings.showingResults(1, agents.length, agents.length)}
        </p>
      </div>
    </div>
  );
}
