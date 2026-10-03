# Aldriva — Workforce Testing Guide (Stage 16)

## 1. Roadmap list → test map

| Roadmap item | Test file | Type |
|---|---|---|
| Agent/task/approval/report/activity data access | `lib/workforce/__tests__/{command-center,agents,tasks,approvals,reports,activity}.test.cjs` | behavioral (fake clients) |
| Tenant isolation | `lib/exec/__tests__/binding.test.cjs`, `execution-e2e.test.cjs`, `lib/workforce/__tests__/memory.test.cjs`, `lib/ai/__tests__/tenant-architecture.test.cjs` | behavioral |
| Authorization (admin gates + ordering) | `lib/security/__tests__/p2-admin-page-gates.test.cjs` (presence), `workforce-page-order.test.cjs` (gate-before-data) | static |
| Authorization by absence (agent config) | `lib/security/__tests__/agent-config-by-absence.test.cjs` | static |
| Privileged actions (decide, memory direct) | `lib/actions/__tests__/workforce-admin-actions.test.cjs` | behavioral (real logic, stubbed boundaries) |
| QA execution request | `lib/qa/__tests__/qa-execution.test.cjs` | behavioral |
| QA result ingestion (incl. idempotent replay) | `lib/qa/__tests__/qa-execution.test.cjs`, `lib/qa/__tests__/qa-routes.test.cjs` | behavioral |
| QA artifact access | `lib/qa/__tests__/qa-execution.test.cjs` | behavioral |
| QA worker routes (401, PREV, claim mismatch) | `lib/qa/__tests__/qa-routes.test.cjs` | behavioral (real handlers) |
| Sentinel access | `lib/workforce/__tests__/sentinel.test.cjs` | behavioral |
| Worker authentication | `lib/exec/__tests__/claim.test.cjs`, `lib/exec/__tests__/worker-auth.test.cjs` | behavioral + static (constant-time) |
| Duplicate execution protection | `lib/exec/__tests__/{claim,envelope,materialize,ingest,recovery,execution-e2e}.test.cjs` | behavioral |
| RLS narrowing (migration 151) | `lib/security/__tests__/stage15-pass-one.test.cjs` | static (SQL text) + real-DB script |
| Studio boundary | `lib/ai/__tests__/studio-boundary.test.cjs` | static |
| Verify-script guards | `scripts/__tests__/verify-guards.test.cjs` | behavioral (no DB) |

## 2. Running the hermetic suite

`npm test` — `node --test` over the explicit file list in `package.json`.
Hermetic by rule: no network, no database connection. TS modules run via the
`typescript` transpile hook; `@/` imports resolve to the repo; ONLY boundaries
are stubbed (auth, DB clients, rate limiter, `next/cache`, `next/navigation`).
The stub helper lives at `lib/actions/__tests__/helpers/hermetic.cjs`.

## 3. Running the staging script (human only)

```sh
STAGING_DATABASE_URL='postgresql://...' npm run verify:staging-db
```

- Reads `STAGING_DATABASE_URL` only. Refuses when unset or containing the
  production ref. Never prints the URL, passwords or keys.
- Every check runs inside `BEGIN ... ROLLBACK` — never commits.
- Prints `PASS`/`FAIL`/`SKIP` per check; exits non-zero on any FAIL.
- NEVER commit or paste the URL anywhere. The agent never runs this script.

## 4. What is proven where

| Property | Real DB (script) | Emulation/harness | Static | Not at all |
|---|---|---|---|---|
| 13 tables SELECT-only | ✅ checks | — | ✅ SQL text | — |
| Non-admin 0 rows (agents/runs/approvals) | ✅ as anon | — | — | — |
| `claim_token_hash` hidden | ✅ privilege probe | — | ✅ SQL text | — |
| Partial unique rejection | ✅ insert-then-duplicate | harness sequences | — | true PG concurrency |
| Versions append-only | ✅ update/delete rejected | harness emulation | — | — |
| RPC lockdown | ✅ privilege probe | harness (conflict paths) | — | live RPC call |
| `memory_retrieval` kind | ✅ CHECK probe | — | ✅ SQL text | — |
| Member sees A not B | ✅/SKIP (needs fixtures) | fakes | — | — |
| RPC atomicity under crash | — | harness only | — | ❌ real failure injection |
| Live model → approval end-to-end | — | — | — | ❌ (see Stage 15 finding f) |
