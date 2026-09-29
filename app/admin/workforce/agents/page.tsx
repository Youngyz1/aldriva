/**
 * app/admin/workforce/agents/page.tsx — Stage 2: Agent list.
 *
 * Sourced entirely from the Agent Registry (agents table) — no hardcoded
 * agent names. New agents added via INSERT appear here unchanged (Stage 13).
 * Status shows BOTH the stored lifecycle field and live presence, labeled.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { Bot } from "lucide-react";
import { fetchAgentList, fetchRecentRunPresence } from "@/lib/workforce/agents";
import { derivePresence } from "@/lib/workforce/agents";

export default async function WorkforceAgentsPage() {
  await headers();
  await requireAdmin();

  const supabase = await createSupabaseServer();
  const agents = await fetchAgentList(supabase);
  // Live presence per agent from recent runs (platform-wide admin view).
  const recentRuns = await fetchRecentRunPresence(supabase, null);
  const busyByAgent = new Map<string, boolean>();
  const lastRunByAgent = new Map<string, string>();
  for (const r of recentRuns) {
    if (!lastRunByAgent.has(r.agent_id)) lastRunByAgent.set(r.agent_id, r.created_at);
  }
  for (const a of agents) {
    const statuses = recentRuns.filter((r) => r.agent_id === a.id).map((r) => r.status);
    busyByAgent.set(a.id, derivePresence(statuses).busy);
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <Bot size={22} /> Agents
        </h1>
        <p className="text-sm text-zinc-400">
          {agents.length} registered identities. Lifecycle status is admin-managed; busy/idle derives from live runs.
        </p>
      </div>
      {agents.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No agents registered. The Agent Registry is empty — add identities via INSERT, no UI change needed.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {agents.map((a) => {
            const busy = busyByAgent.get(a.id) ?? false;
            return (
              <li key={a.id} className="rounded-xl bg-zinc-900 p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <Link href={`/admin/workforce/agents/${a.id}`} className="text-base text-white hover:underline">
                    {a.display_name}
                  </Link>
                  <span className={`text-sm ${busy ? "text-emerald-500" : "text-zinc-500"}`}>{busy ? "busy" : "idle"}</span>
                </div>
                <p className="text-sm text-zinc-400">{a.description.slice(0, 160)}</p>
                <p className="text-sm text-zinc-500">
                  {a.department} · {a.autonomy_level} · lifecycle: {a.status}
                  {lastRunByAgent.get(a.id)
                    ? ` · last activity ${new Date(lastRunByAgent.get(a.id)!).toLocaleString()}`
                    : " · no runs yet"}
                </p>
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
