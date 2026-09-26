/**
 * scripts/qa-ingest.mjs — Stage 7 worker-side result collector.
 *
 * Runs INSIDE the GitHub Actions worker (not Vercel). Reads Playwright's
 * JSON report (qa-results.json), maps it onto POST /api/qa/ingest, and
 * exits nonzero when ingest is rejected so the workflow visibly fails.
 *
 * Env (all from workflow secrets/env, never hardcoded):
 *   ALDRIVA_BASE_URL, QA_RUN_ID, QA_CLAIM_TOKEN (per-run Layer-2 token).
 *
 * Artifact URLs are null in v1: Actions artifacts are not URL-addressable,
 * so traces/screenshots live in the workflow's uploaded artifact bundle
 * (14-day retention). URL fields activate when a stable store exists.
 */
import { readFileSync } from 'node:fs';

const base = process.env.ALDRIVA_BASE_URL;
const runId = process.env.QA_RUN_ID;
const token = process.env.QA_CLAIM_TOKEN;
if (!base || !runId || !token) {
  console.error('qa-ingest: ALDRIVA_BASE_URL, QA_RUN_ID, QA_CLAIM_TOKEN are all required');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(readFileSync('qa-results.json', 'utf8'));
} catch (err) {
  console.error('qa-ingest: cannot read qa-results.json:', err.message);
  process.exit(1);
}

const results = [];
let crashed = 0;
function walk(suite) {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const outcomes = (spec.tests ?? []).length; // per-test outcome below
      void outcomes;
      const last = (test.results ?? []).slice(-1)[0];
      const status = !last ? 'skipped' : last.status === 'passed' ? 'passed' : last.status === 'skipped' ? 'skipped' : last.status === 'flaky' ? 'flaky' : 'failed';
      if (!last) crashed += 1;
      results.push({
        name: String(test.title ?? spec.title ?? 'unnamed').slice(0, 300),
        file: String(spec.file ?? 'unknown').slice(-300),
        status,
        duration_ms: typeof last?.duration === 'number' ? Math.round(last.duration) : null,
        error: last?.error?.message ? String(last.error.message).slice(0, 2000) : null,
        screenshot_url: null,
        trace_url: null,
        logs_url: null,
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child);
}
for (const project of report.suites ?? []) walk(project);

const failed = results.filter((r) => r.status === 'failed').length;
const status = results.length === 0 || crashed > 0 ? 'failed' : failed > 0 ? 'failed' : 'passed';
const error = status === 'failed' ? `Playwright reported ${failed} failed / ${results.length} total` : null;

const res = await fetch(`${base}/api/qa/ingest`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
  body: JSON.stringify({ runId, status, results, error }),
});
const text = await res.text();
console.log(`qa-ingest: http=${res.status} ${text.slice(0, 300)}`);
if (res.status !== 200) process.exit(1);
