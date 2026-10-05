/**
 * app/admin/workforce/qa/[id]/page.tsx — Stage 8: QA run detail.
 *
 * Full run record (suite, environment, commit, trigger, requester,
 * approval, timing, counts, external id, artifact base, redacted error)
 * plus the per-test breakdown from qa_test_results. Artifact links render
 * only when present and https — null columns render as honest
 * "not uploaded" states, never fabricated links. Error text arrives
 * truncated + redacted from lib/workforce/qa.ts (Playwright output can
 * echo page snapshots). Malformed or missing id → notFound(), never 500.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + light cards).
 * Read-only: links only; no actions.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import {
  fetchQaRunDetail,
  buildQaRunDetailViewModel,
  isQaRunIdShape,
  qaDurationLabel,
} from "@/lib/workforce/qa";

const STATUS_TONE: Record<string, string> = {
  failed: "text-red-600",
  passed: "text-emerald-600",
  flaky: "text-amber-600",
  running: "text-amber-600",
  skipped: "text-zinc-500",
  requested: "text-zinc-500",
  approved: "text-zinc-600",
  cancelled: "text-zinc-500",
  expired: "text-zinc-500",
};

function fmt(ts: string | null): string {
  return ts ? new Date(ts).toLocaleString() : "—";
}

export default async function WorkforceQaRunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await headers();
  await requireAdmin();
  const { id } = await params;
  if (!isQaRunIdShape(id)) notFound();

  const supabase = await createSupabaseServer();
  const raw = await fetchQaRunDetail(supabase, id, null);
  if (!raw) notFound();
  const vm = buildQaRunDetailViewModel(raw);
  const r = vm.run;

  const artifactBaseHttp = r.artifact_base_url && r.artifact_base_url.startsWith("https://");

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce/qa"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span> QA runs{" "}
        <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Detail</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title={`QA run — ${r.suite}`}
        description={`${r.status} · ${r.environment} · via ${r.triggered_by} · requested ${fmt(r.created_at)}`}
      />

      {/* Run record */}
      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Run</h2>
        <p className="text-sm text-zinc-950 tabular-nums">
          <span className={STATUS_TONE[r.status] ?? "text-zinc-500"}>{r.status}</span>
          {" · "}
          {r.passed} passed · {r.failed} failed · {r.skipped} skipped · {vm.counts.total} test(s) recorded
        </p>
        <p className="text-sm text-zinc-500">
          scope: {r.target_tenant_id ? "tenant-targeted run" : "platform run (no tenant — smoke suites run platform-wide)"}
        </p>
        <p className="text-sm text-zinc-500">
          commit: <span className="font-mono">{r.commit_sha ?? "—"}</span> · external run:{" "}
          <span className="font-mono">{r.external_run_id ?? "—"}</span>
        </p>
        <p className="text-sm text-zinc-500">
          started {fmt(r.started_at)} · finished {fmt(r.finished_at)} · claimed {fmt(r.claimed_at)}
          {qaDurationLabel(r.started_at, r.finished_at) ? ` · ran ${qaDurationLabel(r.started_at, r.finished_at)}` : ""}
        </p>
        <p className="text-sm text-zinc-500">
          artifacts:{" "}
          {r.artifact_base_url ? (
            artifactBaseHttp ? (
              <a href={r.artifact_base_url} target="_blank" rel="noreferrer" className="font-semibold text-zinc-950 hover:underline">
                open artifact base
              </a>
            ) : (
              <span className="font-mono">{r.artifact_base_url} (non-https — shown as text only)</span>
            )
          ) : (
            "no artifact base recorded for this run"
          )}
        </p>
      </section>

      {/* Run error */}
      {!vm.empty.error && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h2 className="text-base font-bold text-red-700">Run error</h2>
          <p className="text-sm text-red-600">{r.error}</p>
          <p className="text-sm text-red-600/70">Truncated to 300 characters with secret patterns redacted.</p>
        </section>
      )}

      {/* Per-test results */}
      <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Tests ({vm.results.length})</h2>
        {vm.empty.results ? (
          <p className="text-sm text-zinc-500">
            No per-test results ingested for this run yet — counters above are the run-level record.
          </p>
        ) : (
          <ul className="space-y-2">
            {vm.results.map((t) => (
              <li key={t.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <div className="text-sm font-semibold text-zinc-950">
                  {t.name} <span className={`text-sm ${STATUS_TONE[t.status] ?? "text-zinc-500"}`}>· {t.status}</span>
                </div>
                <div className="text-sm text-zinc-500">
                  <span className="font-mono">{t.file}</span>
                  {t.duration_ms !== null ? <span className="tabular-nums"> · {t.duration_ms}ms</span> : ""}
                </div>
                {t.error ? <div className="text-sm text-red-600">{t.error}</div> : null}
                <div className="text-sm text-zinc-500">
                  {t.hasArtifacts ? (
                    <>
                      {t.screenshot_url ? (
                        <a href={t.screenshot_url} target="_blank" rel="noreferrer" className="mr-3 hover:text-zinc-800 hover:underline">
                          screenshot
                        </a>
                      ) : null}
                      {t.trace_url ? (
                        <a href={t.trace_url} target="_blank" rel="noreferrer" className="mr-3 hover:text-zinc-800 hover:underline">
                          trace
                        </a>
                      ) : null}
                      {t.logs_url ? (
                        <a href={t.logs_url} target="_blank" rel="noreferrer" className="hover:text-zinc-800 hover:underline">
                          logs
                        </a>
                      ) : null}
                    </>
                  ) : (
                    "no artifacts uploaded for this test"
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {!vm.empty.results && vm.empty.artifacts && (
          <p className="text-sm text-zinc-500">
            Artifact upload is not wired to populate screenshot/trace/logs URLs yet — absence here is the
            current pipeline state, not a data error.
          </p>
        )}
      </section>

      {/* Linkage */}
      <section className="space-y-1 rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-bold text-zinc-950">Linked records</h2>
        <p className="text-sm text-zinc-600">
          requested by:{" "}
          {vm.agent ? (
            <Link href={`/admin/workforce/agents/${vm.agent.id}`} className="font-semibold text-zinc-950 hover:underline">
              {vm.agent.display_name}
            </Link>
          ) : (
            "no agent linked (manual or scheduled run)"
          )}
        </p>
        <p className="text-sm text-zinc-600">
          approval:{" "}
          {vm.approval ? (
            <Link href={`/admin/workforce/approvals/${vm.approval.id}`} className="hover:text-zinc-800 hover:underline">
              {vm.approval.action} ({vm.approval.status})
            </Link>
          ) : (
            "no approval linked"
          )}
        </p>
      </section>
    </div>
  );
}
