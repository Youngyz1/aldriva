/**
 * app/[locale]/admin/workforce/sentinel/incidents/[id]/page.tsx — Stage 9:
 * Incident detail.
 *
 * Full incident record (title, summary, persisted severity/status, first and
 * last seen, event count, dedupe key, scope) plus the correlated event
 * timeline from incident_events → system_events, the run → task → approval
 * chain via agent_run_id, and linked agent_reports (investigation history).
 * Event messages arrive truncated + redacted from lib/workforce/sentinel.ts
 * (emitter output can echo payloads); metadata columns are never selected.
 * QA linkage is a labeled display heuristic (qa_failure events in the
 * timeline → QA list) — no stored FK exists, and none is invented.
 * Malformed or missing id → notFound(), never 500. Read-only: no status,
 * severity, or lifecycle control is rendered anywhere on this page.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { Radar } from "lucide-react";
import { fetchIncidentDetail, buildIncidentDetailViewModel, isIncidentIdShape } from "@/lib/workforce/sentinel";

const TONE: Record<string, string> = {
  s1: "text-red-400",
  s2: "text-amber-400",
  s3: "text-amber-500",
  s4: "text-zinc-400",
  open: "text-red-400",
  investigating: "text-amber-400",
  resolved: "text-emerald-400",
  expired: "text-zinc-500",
  error: "text-red-400",
  critical: "text-red-400",
  warn: "text-amber-400",
  info: "text-zinc-400",
};

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

export default async function SentinelIncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await headers();
  await requireAdmin();
  const { id } = await params;
  if (!isIncidentIdShape(id)) notFound();

  const supabase = await createSupabaseServer();
  const raw = await fetchIncidentDetail(supabase, id, null);
  if (!raw) notFound();
  const vm = buildIncidentDetailViewModel(raw);
  const i = vm.incident;

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <Radar size={22} /> {i.title}
        </h1>
        <p className="text-sm text-zinc-400">
          <span className={TONE[i.severity] ?? "text-zinc-400"}>{i.severity}</span> ·{" "}
          <span className={TONE[i.status] ?? "text-zinc-400"}>{i.status}</span> · last observed{" "}
          {fmt(i.last_seen_at)}
        </p>
      </div>

      {/* Incident record */}
      <div className="space-y-1 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Incident</h2>
        {vm.empty.summary ? (
          <p className="text-sm text-zinc-500">No summary stored on this incident.</p>
        ) : (
          <p className="text-sm text-zinc-400">{i.summary}</p>
        )}
        <p className="text-sm text-zinc-500 tabular-nums">
          {i.event_count} correlated event(s) · first seen {fmt(i.first_seen_at)} · created{" "}
          {fmt(i.created_at)} · updated {fmt(i.updated_at)}
        </p>
        <p className="text-sm text-zinc-500">
          scope: {i.tenant_id ? "tenant incident" : "platform incident (no tenant — visible to admins only)"}
        </p>
        <p className="text-sm text-zinc-500">
          dedupe key: <span className="font-mono">{i.dedupe_key.slice(0, 120)}</span>
        </p>
        {vm.counts.qaFailureEvents > 0 && (
          <p className="text-sm text-zinc-500">
            {vm.counts.qaFailureEvents} correlated qa_failure event(s) — per-test detail lives under{" "}
            <Link href="/admin/workforce/qa" className="text-white hover:underline">
              QA runs
            </Link>{" "}
            (display linkage only; no stored incident↔QA-run relationship exists).
          </p>
        )}
      </div>

      {/* Event timeline */}
      <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Correlated events ({vm.counts.events})</h2>
        {vm.empty.events ? (
          <p className="text-sm text-zinc-500">
            No correlated events stored for this incident yet — the incident row predates its event
            join rows, or the joins were never written.
          </p>
        ) : (
          <ul className="space-y-2">
            {vm.events.map((e) => (
              <li key={e.id} className="rounded-xl bg-zinc-800 p-3">
                <div className="text-sm text-white">
                  {e.kind} <span className={`text-sm ${TONE[e.severity_hint] ?? "text-zinc-400"}`}>· {e.severity_hint}</span>
                </div>
                <div className="text-sm text-zinc-500">
                  {e.route ?? "no route"}
                  {e.tool_name ? ` · ${e.tool_name}` : ""}
                  {e.error_code ? ` · ${e.error_code}` : ""}
                  {e.status_code !== null ? ` · HTTP ${e.status_code}` : ""} · source {e.source} ·
                  observed {fmt(e.created_at)}
                </div>
                <div className="text-sm text-zinc-400">{e.message}</div>
              </li>
            ))}
          </ul>
        )}
        {!vm.empty.events && (
          <p className="text-sm text-zinc-500">
            Messages truncated to 300 characters with secret patterns redacted; full payloads
            (metadata) are never rendered.
          </p>
        )}
      </div>

      {/* Run → task → approval chain + investigation history */}
      <div className="space-y-1 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Linked records</h2>
        <p className="text-sm text-zinc-400">
          originating run:{" "}
          {vm.run ? (
            <span className="font-mono">{vm.run.id.slice(0, 8)}…</span>
          ) : (
            "none linked (event-driven incident, no agent run)"
          )}
        </p>
        <p className="text-sm text-zinc-400">
          task:{" "}
          {vm.task ? (
            <Link href={`/admin/workforce/tasks/${vm.task.id}`} className="hover:text-white">
              {vm.task.title.slice(0, 100)} ({vm.task.status})
            </Link>
          ) : (
            "none linked"
          )}
        </p>
        <p className="text-sm text-zinc-400">
          approval:{" "}
          {vm.approval ? (
            <Link href={`/admin/workforce/approvals/${vm.approval.id}`} className="hover:text-white">
              {vm.approval.action} ({vm.approval.status})
            </Link>
          ) : (
            "none linked"
          )}
        </p>
        <div className="pt-2">
          <h3 className="text-sm text-white">Investigation history ({vm.reports.length})</h3>
          {vm.empty.reports ? (
            <p className="text-sm text-zinc-500">
              No agent reports filed against the originating run yet. Sweep summaries appear here
              once investigations run.
            </p>
          ) : (
            <ul className="space-y-1">
              {vm.reports.map((r) => (
                <li key={r.id} className="text-sm text-zinc-400">
                  {r.report_type} · {r.summary.slice(0, 160)} ·{" "}
                  <Link href={`/admin/workforce/reports/${r.id}`} className="hover:text-white">
                    open report
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Read-only notice */}
      <p className="text-sm text-zinc-500">
        Sentinel is read-only in this stage. Status, severity, and lifecycle actions
        (acknowledge, investigate, resolve, expire) are not available in this UI.
      </p>

      <Link href="/admin/workforce/sentinel/incidents" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Incidents
      </Link>
    </div>
  );
}
