/**
 * app/admin/workforce/approvals/page.tsx — Stage 4: Approvals list.
 *
 * Real approvals rows, tenant-scoped, filterable by actual schema states
 * (pending/approved/rejected/expired). Agent names resolve from the
 * registry; unknown ?status= falls back to unfiltered, never 500.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Read-only: rows link to approvals/[id]; deciding happens
 * on the detail page — no actions here.
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
import { fetchApprovalList, fetchApprovalAgents, isApprovalStatusValue } from "@/lib/workforce/approvals";

const GROUP_ORDER = ["pending", "approved", "rejected", "expired"];

const columns: AdminColumn[] = [
  { id: "action", header: "Action", role: "title" },
  { id: "status", header: "Status", role: "value", width: "130px" },
  { id: "risk", header: "Risk", role: "meta", hideBelow: "md" },
  { id: "requester", header: "Requested by", role: "meta", hideBelow: "md" },
  { id: "dates", header: "Created · Expires", role: "meta", align: "right", hideBelow: "lg" },
  { id: "reason", header: "Reason", role: "detail", hideBelow: "lg" },
];

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
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Approvals</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Approvals"
        description={`${approvals.length} shown${activeFilter ? ` · filtered to ${activeFilter}` : ""} · deciding here flips the record only — the runtime, not this UI, enforces and executes.`}
      />

      <StatStrip
        items={[
          { label: "Shown", value: approvals.length },
          { label: "Pending", value: approvals.filter((a) => a.status === "pending").length },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/workforce/approvals"
          className={`rounded-xl px-3 py-1 text-sm font-medium ${activeFilter === null ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
        >
          all
        </Link>
        {GROUP_ORDER.map((s) => (
          <Link
            key={s}
            href={`/admin/workforce/approvals?status=${s}`}
            className={`rounded-xl px-3 py-1 text-sm font-medium ${activeFilter === s ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      <AdminTable
        columns={columns}
        rows={approvals.map((a) => ({
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
            <StatusBadge key="status" status={a.status} />,
            <span key="risk" className="text-zinc-600">
              risk {a.risk}
            </span>,
            <span key="requester" className="text-zinc-600">
              {a.requested_by_agent_id ? (agentNameById.get(a.requested_by_agent_id) ?? "unknown agent") : "—"}
            </span>,
            <span key="dates" className="whitespace-nowrap text-xs text-zinc-500">
              {new Date(a.created_at).toLocaleString()} · expires {new Date(a.expires_at).toLocaleString()}
            </span>,
            <span key="reason" className="block max-w-[320px] text-zinc-600">
              {a.reason.slice(0, 160)}
            </span>,
          ],
        }))}
        emptyMessage={
          activeFilter ? `No ${activeFilter} approvals.` : "No approvals recorded yet. Blocked tool calls create them."
        }
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <p className="text-xs font-semibold text-zinc-400">
          {approvals.length === 0
            ? tableStrings.showingNone(approvals.length)
            : tableStrings.showingResults(1, approvals.length, approvals.length)}
        </p>
      </div>
    </div>
  );
}
