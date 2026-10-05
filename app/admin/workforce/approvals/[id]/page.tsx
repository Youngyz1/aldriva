/**
 * app/admin/workforce/approvals/[id]/page.tsx — Stage 4: Approval detail.
 *
 * Full reason, evidence/proposed-outcome KEY lists (never raw values —
 * evidence embeds an unredacted args slice at write time), timeline,
 * requester, linked task/run, and Approve/Reject forms offered ONLY while
 * pending and unexpired. The forms flip the record via the server action;
 * every check re-runs server-side. Malformed/missing id → notFound().
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + light cards).
 * The decision forms below are byte-for-byte the same wiring
 * (decideWorkforceApproval + approvalId/decision fields + rejection flow);
 * only the surrounding layout was restyled.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { StatusBadge } from "@/components/admin/ModerationBadge";
import {
  fetchApprovalDetail,
  fetchApprovalAgents,
  fetchApprovalLinks,
  isApprovalIdShape,
  shortId,
  evidenceKeys,
} from "@/lib/workforce/approvals";
import { decideWorkforceApproval } from "@/lib/actions/workforce-approvals";
import { fetchQaRunsByApproval } from "@/lib/workforce/qa";
import { memoryApplyState } from "@/lib/workforce/memory";

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
  // Reverse linkage (Stage 8): QA runs created from this approval via
  // qa_runs.approval_id. Task/Report detail pages need no such section —
  // verified: neither agent_tasks/agent_runs nor agent_reports reference
  // qa_runs (linkage flows approval→QA only).
  const qaRuns = await fetchQaRunsByApproval(supabase, id);

  const nowIso = new Date().toISOString();
  const actionable = raw.status === "pending" && raw.expires_at > nowIso;
  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce/approvals"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span> Approvals{" "}
        <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Detail</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title={raw.action}
        description={`risk ${raw.risk} · ${raw.status} · requested ${new Date(raw.created_at).toLocaleString()} · expires ${new Date(raw.expires_at).toLocaleString()}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={raw.status} />
        <StatusBadge status={raw.risk} />
      </div>

      {decided && (
        <p className="rounded-xl border border-zinc-200 bg-white p-3 text-sm font-semibold text-zinc-950">
          {decided === "approved" || decided === "rejected"
            ? `Recorded: ${decided}. The runtime — not this page — decides what happens next.`
            : "Decision was not applied (already decided, expired, or out of scope)."}
        </p>
      )}

      {/* Reason + evidence keys */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Request</h2>
        <p className="text-sm text-zinc-600">{raw.reason}</p>
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
      </section>

      {/* Timeline */}
      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Timeline</h2>
        <p className="text-sm text-zinc-500">
          decided: {raw.decided_at ? new Date(raw.decided_at).toLocaleString() : "—"} · approver:{" "}
          {shortId(raw.approver_id)}
        </p>
      </section>

      {/* Linked task/run */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Related run / task</h2>
        {links.length === 0 ? (
          <p className="text-sm text-zinc-500">No task or run references this approval.</p>
        ) : (
          <ul className="space-y-1">
            {links.map((l) => (
              <li key={`${l.kind}-${l.id}`} className="text-sm text-zinc-600">
                {l.kind} {l.status} ·{" "}
                {l.kind === "task" ? (
                  <Link href={`/admin/workforce/tasks/${l.id}`} className="hover:text-zinc-800 hover:underline">
                    open task
                  </Link>
                ) : (
                  <span className="text-zinc-500">run {shortId(l.id)} (full run view arrives with later stages)</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Memory proposal (Stage 12): current vs proposed, apply state */}
      {raw.action === "memory_propose" && (
        <MemoryProposalSection evidence={raw.evidence} proposedOutcome={raw.proposed_outcome} auditRef={raw.audit_ref} />
      )}

      {/* Linked QA runs (reverse linkage: qa_runs.approval_id → this approval) */}
      <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">QA runs from this approval</h2>
        {qaRuns.length === 0 ? (
          <p className="text-sm text-zinc-500">No QA run references this approval.</p>
        ) : (
          <ul className="space-y-1">
            {qaRuns.map((q) => (
              <li key={q.id} className="text-sm text-zinc-600">
                {q.suite} · {q.status} · {new Date(q.created_at).toLocaleString()} ·{" "}
                <Link href={`/admin/workforce/qa/${q.id}`} className="hover:text-zinc-800 hover:underline">
                  open QA run
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Decision forms — pending + unexpired only.
          Wiring is byte-for-byte the pre-restyle forms: same server action,
          same hidden fields, same labels. Only the wrapper was restyled. */}
      {actionable ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex gap-3">
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
        </div>
      ) : (
        <p className="text-sm text-zinc-500">
          {raw.status !== "pending"
            ? `Already decided (${raw.status}) — no further action possible.`
            : "Expired — no further action possible."}
        </p>
      )}
    </div>
  );
}

function MemoryProposalSection({
  evidence,
  proposedOutcome,
  auditRef,
}: {
  evidence: Record<string, unknown>;
  proposedOutcome: Record<string, unknown> | null;
  auditRef: string | null;
}) {
  const po = proposedOutcome !== null && typeof proposedOutcome === "object" ? proposedOutcome : null;
  const ev = evidence !== null && typeof evidence === "object" ? evidence : null;
  const rawProposal =
    (po !== null ? (po["memory_proposal"] as Record<string, unknown> | undefined) : undefined) ??
    (ev !== null ? (ev["proposal"] as Record<string, unknown> | undefined) : undefined);
  const p = rawProposal !== null && typeof rawProposal === "object" ? rawProposal : null;
  const str = (v: unknown) => (typeof v === "string" ? v : "—");
  return (
    <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-bold text-zinc-950">Memory proposal</h2>
      {p === null ? (
        <p className="text-sm text-zinc-500">Proposal payload unreadable — decide with caution.</p>
      ) : (
        <>
          <p className="text-sm text-zinc-600">
            operation: {str(p["op"])} · scope: {str(p["scope"])} · agent: {str(p["agent"])}
          </p>
          <p className="text-sm text-zinc-600">key: {str(p["fact_key"])}</p>
          <p className="text-sm text-zinc-600">base version: {typeof p["base_version"] === "number" ? p["base_version"] : "—"}</p>
          {typeof p["fact_value"] === "string" && (
            <p className="whitespace-pre-wrap text-sm text-zinc-600">proposed value: {p["fact_value"].slice(0, 1500)}</p>
          )}
          {typeof p["expires_at"] === "string" && <p className="text-sm text-zinc-600">expires: {p["expires_at"]}</p>}
          {typeof p["reason"] === "string" && p["reason"].length > 0 && (
            <p className="text-sm text-zinc-500">reason: {p["reason"].slice(0, 500)}</p>
          )}
        </>
      )}
      <p className="text-sm text-zinc-500">
        apply state: {memoryApplyState(auditRef)} · proposer run/task linked via evidence where recorded ·{" "}
        <Link href="/admin/workforce/memory" className="hover:text-zinc-800 hover:underline">
          open Memory
        </Link>
      </p>
    </section>
  );
}
