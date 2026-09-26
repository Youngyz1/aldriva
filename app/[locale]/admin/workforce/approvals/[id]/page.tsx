/**
 * app/[locale]/admin/workforce/approvals/[id]/page.tsx — Stage 4: Approval detail.
 *
 * Full reason, evidence/proposed-outcome KEY lists (never raw values —
 * evidence embeds an unredacted args slice at write time), timeline,
 * requester, linked task/run, and Approve/Reject forms offered ONLY while
 * pending and unexpired. The forms flip the record via the server action;
 * every check re-runs server-side. Malformed/missing id → notFound().
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { CheckSquare } from "lucide-react";
import {
  fetchApprovalDetail,
  fetchApprovalAgents,
  fetchApprovalLinks,
  isApprovalIdShape,
  shortId,
  evidenceKeys,
} from "@/lib/workforce/approvals";
import { decideWorkforceApproval } from "@/lib/actions/workforce-approvals";

export default async function WorkforceApprovalDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ decided?: string }>;
}) {
  await headers();
  await requireAdmin();
  const { id } = await params;
  const { decided } = await searchParams;
  if (!isApprovalIdShape(id)) notFound();

  const supabase = await createSupabaseServer();
  const [raw, agents] = await Promise.all([
    fetchApprovalDetail(supabase, id, null),
    fetchApprovalAgents(supabase),
  ]);
  if (!raw) notFound();
  const agentNameById = new Map(agents.map((a) => [a.id, a.display_name]));
  const links = await fetchApprovalLinks(supabase, id);

  const nowIso = new Date().toISOString();
  const actionable = raw.status === "pending" && raw.expires_at > nowIso;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <CheckSquare size={22} /> {raw.action}
        </h1>
        <p className="text-sm text-zinc-400">
          risk {raw.risk} · {raw.status} · requested {new Date(raw.created_at).toLocaleString()} · expires{" "}
          {new Date(raw.expires_at).toLocaleString()}
        </p>
      </div>

      {decided && (
        <p className="rounded-xl bg-zinc-900 p-3 text-sm text-white shadow-xs">
          {decided === "approved" || decided === "rejected"
            ? `Recorded: ${decided}. The runtime — not this page — decides what happens next.`
              : "Decision was not applied (already decided, expired, or out of scope)."}
        </p>
      )}

      {/* Reason + evidence keys */}
      <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Request</h2>
        <p className="text-sm text-zinc-400">{raw.reason}</p>
        <p className="text-sm text-zinc-500">
          requested by {raw.requested_by_agent_id ? (agentNameById.get(raw.requested_by_agent_id) ?? "unknown agent") : "—"}
          {" · "}user {shortId(raw.requested_by)}
        </p>
        <p className="text-sm text-zinc-500">
          evidence fields: {evidenceKeys(raw.evidence).join(", ") || "none"} (keys only — values may embed raw
          arguments and are never rendered)
        </p>
        {raw.proposed_outcome && (
          <p className="text-sm text-zinc-500">proposed outcome fields: {evidenceKeys(raw.proposed_outcome).join(", ") || "none"}</p>
        )}
        {raw.audit_ref && <p className="text-sm text-zinc-500">audit ref: {raw.audit_ref}</p>}
      </div>

      {/* Timeline */}
      <div className="space-y-1 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Timeline</h2>
        <p className="text-sm text-zinc-500">
          decided: {raw.decided_at ? new Date(raw.decided_at).toLocaleString() : "—"} · approver:{" "}
          {shortId(raw.approver_id)}
        </p>
      </div>

      {/* Linked task/run */}
      <div className="space-y-2 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Related run / task</h2>
        {links.length === 0 ? (
          <p className="text-sm text-zinc-500">No task or run references this approval.</p>
        ) : (
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={`${l.kind}-${l.id}`} className="text-sm text-zinc-400">
                {l.kind} {l.status} ·{" "}
                {l.kind === "task" ? (
                  <Link href={`/admin/workforce/tasks/${l.id}`} className="hover:text-white">
                    open task
                  </Link>
                ) : (
                  <span className="text-zinc-500">run {shortId(l.id)} (full run view arrives with later stages)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Decision forms — pending + unexpired only */}
      {actionable ? (
        <div className="flex gap-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <form action={decideWorkforceApproval}>
            <input type="hidden" name="approvalId" value={raw.id} />
            <input type="hidden" name="decision" value="approved" />
            <button type="submit" className="rounded-xl bg-emerald-700 px-4 py-2 text-sm text-white">
              Approve
            </button>
          </form>
          <form action={decideWorkforceApproval}>
            <input type="hidden" name="approvalId" value={raw.id} />
            <input type="hidden" name="decision" value="rejected" />
            <button type="submit" className="rounded-xl bg-red-800 px-4 py-2 text-sm text-white">
              Reject
            </button>
          </form>
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          {raw.status !== "pending"
            ? `Already decided (${raw.status}) — no further action possible.`
            : "Expired — no further action possible."}
        </p>
      )}

      <Link href="/admin/workforce/approvals" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Approvals
      </Link>
    </div>
  );
}
