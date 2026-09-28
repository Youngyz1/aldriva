/**
 * app/[locale]/admin/workforce/qa/[id]/page.tsx — Stage 8: QA run detail.
 *
 * Full run record (suite, environment, commit, trigger, requester,
 * approval, timing, counts, external id, artifact base, redacted error)
 * plus the per-test breakdown from qa_test_results. Artifact links render
 * only when present and https — null columns render as honest
 * "not uploaded" states, never fabricated links. Error text arrives
 * truncated + redacted from lib/workforce/qa.ts (Playwright output can
 * echo page snapshots). Malformed or missing id → notFound(), never 500.
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { FlaskConical } from "lucide-react";
import {
  fetchQaRunDetail,
  buildQaRunDetailViewModel,
  isQaRunIdShape,
  qaDurationLabel,
} from "@/lib/workforce/qa";

const STATUS_TONE: Record<string, string> = {
  failed: "text-red-400",
  passed: "text-emerald-400",
  flaky: "text-amber-400",
  running: "text-amber-400",
  skipped: "text-zinc-500",
  requested: "text-zinc-400",
  approved: "text-zinc-300",
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
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <FlaskConical size={22} /> QA run — {r.suite}
        </h1>
        <p className="text-sm text-zinc-400">
          <span className={STATUS_TONE[r.status] ?? "text-zinc-400"}>{r.status}</span> · {r.environment} · via{" "}
          {r.triggered_by} · requested {fmt(r.created_at)}
        </p>
      </div>

      {/* Run record */}
      <div className="space-y-1 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Run</h2>
        <p className="text-sm text-zinc-400 tabular-nums">
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
              <a href={r.artifact_base_url} target="_blank" rel="noreferrer" className="text-white hover:underline">
                open artifact base
              </a>
            ) : (
              <span className="font-mono">{r.artifact_base_url} (non-https — shown as text only)</span>
            )
          ) : (
            "no artifact base recorded for this run"
          )}
        </p>
      </div>

      {/* Run error */}
      {!vm.empty.error && (
        <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
          <h2 className="text-base text-white">Run error</h2>
          <p className="text-sm text-red-400">{r.error}</p>
          <p className="text-sm text-zinc-500">Truncated to 300 characters with secret patterns redacted.</p>
        </div>
      )}

      {/* Per-test results */}
      <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Tests ({vm.results.length})</h2>
        {vm.empty.results ? (
          <p className="text-sm text-zinc-500">
            No per-test results ingested for this run yet — counters above are the run-level record.
          </p>
        ) : (
          <ul className="space-y-2">
            {vm.results.map((t) => (
              <li key={t.id} className="rounded-xl bg-zinc-800 p-3">
                <div className="text-sm text-white">
                  {t.name} <span className={`text-sm ${STATUS_TONE[t.status] ?? "text-zinc-400"}`}>· {t.status}</span>
                </div>
                <div className="text-sm text-zinc-500">
                  <span className="font-mono">{t.file}</span>
                  {t.duration_ms !== null ? <span className="tabular-nums"> · {t.duration_ms}ms</span> : ""}
                </div>
                {t.error ? <div className="text-sm text-red-400">{t.error}</div> : null}
                <div className="text-sm text-zinc-500">
                  {t.hasArtifacts ? (
                    <>
                      {t.screenshot_url ? (
                        <a href={t.screenshot_url} target="_blank" rel="noreferrer" className="mr-3 hover:text-white">
                          screenshot
                        </a>
                      ) : null}
                      {t.trace_url ? (
                        <a href={t.trace_url} target="_blank" rel="noreferrer" className="mr-3 hover:text-white">
                          trace
                        </a>
                      ) : null}
                      {t.logs_url ? (
                        <a href={t.logs_url} target="_blank" rel="noreferrer" className="hover:text-white">
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
      </div>

      {/* Linkage */}
      <div className="space-y-1 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <h2 className="text-base text-white">Linked records</h2>
        <p className="text-sm text-zinc-400">
          requested by:{" "}
          {vm.agent ? (
            <Link href={`/admin/workforce/agents/${vm.agent.id}`} className="text-white hover:underline">
              {vm.agent.display_name}
            </Link>
          ) : (
            "no agent linked (manual or scheduled run)"
          )}
        </p>
        <p className="text-sm text-zinc-400">
          approval:{" "}
          {vm.approval ? (
            <Link href={`/admin/workforce/approvals/${vm.approval.id}`} className="hover:text-white">
              {vm.approval.action} ({vm.approval.status})
            </Link>
          ) : (
            "no approval linked"
          )}
        </p>
      </div>

      <Link href="/admin/workforce/qa" className="text-sm text-zinc-400 hover:text-white">
        ← Back to QA runs
      </Link>
    </div>
  );
}
