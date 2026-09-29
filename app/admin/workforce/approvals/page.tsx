/**
 * app/admin/workforce/approvals/page.tsx — Stage 4: Approvals list.
 *
 * Real approvals rows, tenant-scoped, filterable by actual schema states
 * (pending/approved/rejected/expired). Agent names resolve from the
 * registry; unknown ?status= falls back to unfiltered, never 500.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import { fetchApprovalList, fetchApprovalAgents, isApprovalStatusValue } from "@/lib/workforce/approvals";

const GROUP_ORDER = ["pending", "approved", "rejected", "expired"];

export default async function WorkforceApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await headers();
  await requireAdmin();
  const { status } = await searchParams;

  const supabase = await createSupabaseServer();
  const activeFilter = status && isApprovalStatusValue(status) ? status : null;
  const [approvals, agents] = await Promise.all([
    fetchApprovalList(supabase, null, activeFilter),
    fetchApprovalAgents(supabase),
  ]);
  const agentNameById = new Map(agents.map((a) => [a.id, a.display_name]));

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <CheckSquare size={22} /> Approvals
        </h1>
        <p className="text-sm text-zinc-400">
          {approvals.length} shown{activeFilter ? ` · filtered to ${activeFilter}` : ""} · deciding here flips the
          record only — the runtime, not this UI, enforces and executes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/approvals"
          className={`rounded-xl px-3 py-1 text-sm ${activeFilter === null ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
        >
          all
        </Link>
        {GROUP_ORDER.map((s) => (
          <Link
            key={s}
            href={`/admin/workforce/approvals?status=${s}`}
            className={`rounded-xl px-3 py-1 text-sm ${activeFilter === s ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      {approvals.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {activeFilter ? `No ${activeFilter} approvals.` : "No approvals recorded yet. Blocked tool calls create them."}
        </p>
      ) : (
        <ul className="space-y-2">
          {approvals.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 rounded-xl bg-zinc-900 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link href={`/admin/workforce/approvals/${a.id}`} className="text-sm text-white hover:underline">
                  {a.action}
                </Link>{" "}
                <span className="text-sm text-zinc-500">
                  risk {a.risk} · {a.status}
                  {a.requested_by_agent_id ? ` · ${agentNameById.get(a.requested_by_agent_id) ?? "unknown agent"}` : ""}
                </span>
                <div className="text-sm text-zinc-500">{a.reason.slice(0, 160)}</div>
              </div>
              <div className="text-sm text-zinc-500">
                {new Date(a.created_at).toLocaleString()} · expires {new Date(a.expires_at).toLocaleString()}
              </div>
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
