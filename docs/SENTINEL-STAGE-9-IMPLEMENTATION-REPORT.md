# Sentinel — Stage 9 Implementation Report (Foundation + Read-Only UI)

> **Type**: Implementation record. Audit record preserved separately in
> `docs/SENTINEL-STAGE-9-IMPLEMENTATION-READINESS.md` (not overwritten).
> **Date**: 2026-09-28.
> **Scope implemented**: 9.0 → 9.5 exactly as approved. No scope expansion.

---

## 1. Executive summary

Stage 9 delivers a functional, tested, **read-only** Sentinel interface integrated
into the existing AI Workforce: a Sentinel overview (real incident/event counts,
severity distribution, attention list, recent QA failures), a filterable incident
list, and an incident detail page (event timeline, run→task→approval chain,
investigation history). All data comes from the existing migrations 143–145 schema
via a new `lib/workforce/sentinel.ts` module following the Stages 1–8 fetch + pure
view-model pattern. **No migration, no API route, no tool, no permission, no worker,
no schedule, and no lifecycle write was added.** Full suite: **797/797 passing**
(includes the 9.0 correction of the previously-red cron test). The production build
compiles and type-checks; its prerender step still stops at the known pre-existing
`things-to-do/[city]` failure, byte-identical in cause to Stage 8.

---

## 2. Implemented subphases

- **9.0 — Test hygiene.** Two mismatches investigated against implementation:
  (a) cron test expected 5 crons incl. `sentinel-sweep`; source of truth
  (`vercel.json`, deliberately reduced in `87e5292`, plus the Stage 9 boundary
  forbidding re-adding the entry) proves the **test was outdated** → corrected to
  assert 4 crons + named entries + explicit no-sweep-entry pin, keeping all route
  wiring assertions. (b) Fallback allowlist (20) vs DB ACL (24): no test was failing;
  production behavior must not change to satisfy an assertion, and the allowlist
  boundary forbids it → judged a latent degraded-path gap, not an active defect
  (live DB path yields 24; fallback applies only when DB is unreachable) → pinned
  deliberately with a new documenting test. Test-only changes; zero production
  behavior change. Result: previously-red suite member now green.
- **9.1 — Data layer.** New `lib/workforce/sentinel.ts` + hermetic
  `lib/workforce/__tests__/sentinel.test.cjs` (14 tests), registered in `package.json`.
- **9.2 — Overview.** `sentinel/page.tsx` stub replaced with real overview.
- **9.3 — List + detail.** `sentinel/incidents/page.tsx` (status + severity filters)
  and `sentinel/incidents/[id]/page.tsx` (timeline, linkage, investigation history).
- **9.4 — Reciprocal links (only justified).** Report-detail incident link and
  activity incident hrefs now resolve to `sentinel/incidents/[id]` (real
  relationships). Event hrefs intentionally stay on the overview (no per-event route
  in scope). Command Center, agent/task/approval/QA detail pages untouched — verified
  no missing relationship justified a change there.
- **9.5 — Verification, docs, commit** (this report; §9–§11, §14).

---

## 3. Files changed

| File | Change |
|---|---|
| `lib/workforce/sentinel.ts` | NEW (~400 lines): fetch + pure VMs, redaction, guards |
| `lib/workforce/__tests__/sentinel.test.cjs` | NEW (14 tests) |
| `app/[locale]/admin/workforce/sentinel/page.tsx` | Stub → real overview |
| `app/[locale]/admin/workforce/sentinel/incidents/page.tsx` | NEW list |
| `app/[locale]/admin/workforce/sentinel/incidents/[id]/page.tsx` | NEW detail |
| `lib/ai/__tests__/sentinel-events.test.cjs` | 9.0: cron assertion corrected + fallback-pin test added (test-only) |
| `lib/workforce/activity.ts` | Incident href → detail (1 line + comment) |
| `lib/workforce/__tests__/activity.test.cjs` | Pin new hrefs (2 assertions) |
| `app/[locale]/admin/workforce/reports/[id]/page.tsx` | Incident link → detail (1 line) |
| `lib/security/__tests__/p2-admin-page-gates.test.cjs` | +2 inventory lines |
| `package.json` | Register `sentinel.test.cjs` |
| `docs/CHANGELOG.md` | Stage 9 entry |
| `docs/SENTINEL-STAGE-9-IMPLEMENTATION-REPORT.md` | This file |

Verified absent from the diff: `db/`, `supabase/migrations/`, `vercel.json`,
`lib/ai/agent-registry.ts`, `lib/ai/tools-registry.ts`, `lib/ai/tools/**`,
`app/api/**`, `proxy.ts`, any Stage 1–8 data-access module.

---

## 4. New routes and navigation changes

- `admin/workforce/sentinel` — overview (existing nav entry `admin/layout.tsx:104`,
  unchanged; existing Command Center/activity/report links now resolve to a real page
  instead of a stub).
- `admin/workforce/sentinel/incidents` — filterable list (`?status=`, `?severity=`).
- `admin/workforce/sentinel/incidents/[id]` — detail.
- No nav-group, layout, or sidebar change. New routes appended to the
  `p2-admin-page-gates` inventory (suite enforces `requireAdmin` + completeness).

---

## 5. Data-access functions added (`lib/workforce/sentinel.ts`)

- `fetchSentinelOverview` (active ≤50 + recent events ≤8 + `qa_failure` ≤5, parallel) →
  `buildSentinelOverviewViewModel` (open/investigating/attention counts, s1–s4
  histogram over the bounded window, recent 10, attention 10, `empty.*`).
- `fetchIncidentList` (status/severity filters, `last_seen_at` desc, limit 50) +
  `fetchIncidentFilterCounts` (recent-200 `byStatus`/`bySeverity`, Tasks/QA precedent).
- `fetchEventList` (kind filter, parameterized limit; serves overview windows).
- `fetchIncidentDetail` (incident → `incident_events` join → `system_events`
  timeline ≤100 → `agent_run_id` run/task/approval hops → reports-by-run ≤5) →
  `buildIncidentDetailViewModel` (kind histogram, `qaFailureEvents` count, `empty.*`).
- Guards/validators: `isIncidentStatusValue`, `isIncidentSeverityValue`,
  `isEventKindValue` (exact migration CHECK sets), `isIncidentIdShape` (UUID).
- QA linkage: display-only heuristic — `qaFailureEvents` counted from timeline
  `qa_failure` events; page links to the QA list with an explicit "no stored
  relationship" note. No FK invented.

---

## 6. Security and redaction measures

- Authenticated reads only (`createSupabaseServer()` in pages; no `supabase-admin`
  import in `sentinel.ts` — asserted); `requireAdmin()` on all three pages (gates
  test pins it); RLS untouched and respected.
- Select allowlists mirror the Sentinel tool `SAFE_COLUMNS`; `metadata` (both
  tables), `actor_id`/`agent_id` never selected (forbidden-column scan test).
- `message` truncated to 300ch + `redactSentinelMessage()` (key=value pairs incl.
  session/cookie, `sk_live/test`, bearer/password/token, PEM blocks) at the fetch
  boundary; serialized-VM no-secrets scan with crafted secrets.
- Prompt-injection posture unchanged: UI never feeds message text into prompts; sweep
  prompt untouched (count-only interpolation preserved).
- Static read-only proof: module source scanned for `.insert(/.update(/.delete(/
  .upsert(/service-role/`closeStale…(` — absent; pages scanned for `<form`,
  `<button`, write calls — absent; every page states its read-only scope.

---

## 7. Tenant-handling verification

Contract (readiness §8/§10.1): platform view (`tenantId null`, all current pages)
unfiltered — platform incidents stay visible to authorized admins; tenant view
strict `.eq('tenant_id', …)` — the tasks/reports contract, deliberately **not** QA's
`.or()` (platform rows are admin-only by RLS). Hermetically tested: platform view
asserts no tenant predicate; tenant view asserts `eq` + asserts **no** `or` call on
any incidents/events query; `incident_events` join carries no tenant predicate
(scope inherits from parent, matching RLS). Agents/approvals lookups never
tenant-filtered (asserted).

---

## 8. Test coverage

- `sentinel.test.cjs` (14): real value sets; overview reads + VM (counts/histogram/
  attention/empties); tenant contract incl. never-`.or()`; list filters/bounds/order;
  detail hops (run/task/approval/reports); no-hop null normalization; kind histogram +
  QA count; forbidden columns; redaction unit + truncation; VM secrets scan; module
  zero-write scan; 404-null + id guard; page requireAdmin/no-controls scan.
- Extended: `sentinel-events.test.cjs` (+1 pin test; cron test corrected),
  `activity.test.cjs` (+2 href assertions).
- §8 mapping: data-access ✓, view-model ✓, UI/route (hermetic proxies: guards,
  404-null, gates inventory, no-controls scan) ✓, regression (Stages 1–8 untouched,
  gates green) ✓, no-secrets (output-verified, not function-existence) ✓.
- Live-DB/staging checks (seeded burst, sweep run, non-admin RLS) remain
  post-implementation infra work — not claimed.

---

## 9. Exact test commands and results

- `node --test lib/ai/__tests__/sentinel-events.test.cjs` → **12/12 pass**
  (post-9.0; was 11/12 with the cron assertion red).
- `node --test lib/workforce/__tests__/sentinel.test.cjs` → **14/14 pass**.
- `node --test lib/workforce/__tests__/sentinel.test.cjs
  lib/workforce/__tests__/activity.test.cjs
  lib/security/__tests__/p2-admin-page-gates.test.cjs` → **24/24 pass**.
- `npm test` (full hermetic suite, explicit file list) → **797/797 pass, 0 fail,
  36 suites** (was 781/782 with 1 pre-existing red; delta +15 = 14 new sentinel tests
  + 1 new fallback-pin test; activity/gates changes added assertions to existing
  tests, not new test counts).

---

## 10. TypeScript, lint, and build outcomes

- `npx eslint <11 touched files>` → **0 errors**, 1 pre-existing warning
  (`risk` unused var in `sentinel-events.test.cjs:121`, untouched loop).
- `npx tsc --noEmit` → **clean (0 errors)**.
- `npm run build` → **compiles successfully + TypeScript clean** (929 pages reached,
  incl. new Sentinel routes); prerender stops at the known pre-existing failure:
  `Route "/[locale]/things-to-do/[city]": unstable value new Date()` at
  `lib/external-events.ts:221` (same file/line/cause as Stage 8; only the sample
  locale path rotated Miami vs New York — worker ordering). Stage 9 touches neither
  file; no new build regression. Full error captured in verification logs.

---

## 11. Known failures and their evidence

1. **Build prerender (`things-to-do/[city]`)** — pre-existing, tracked, out of scope
   (§2 boundary "Unrelated defects"). Evidence: `git status` shows neither
   `lib/external-events.ts` (tracked, unmodified since initial commit) nor the
   `things-to-do` pages (pre-existing untracked work) in the Stage 9 diff; failure
   signature identical to Stage 8 (same route, same line, same `new Date()` cause).
2. **Former `sentinel-events` cron red** — RESOLVED in 9.0 (test was stale; corrected
   to audited reality; route assertions preserved).
3. **Donate-spec receipt assertion** — carried forward from Stage 7, untouched per
   boundaries; QA list continues to display such runs honestly as failed.

---

## 12. Deferred capabilities

Status writes + transition guard; push notifications; sweep scheduling; QA shadow
go-live; health endpoint; structured logging/correlation IDs; Sentry/APM; queue/
worker (Stage 10); `health_checks`/`deployments` tables or any migration; frontend
error ingestion; new permissions; Sentinel knowledge seeding; Command Center or
Stages 1–8 redesigns; donate-spec fix; prerender fix. Each names its future home in
the readiness report (§7/§15).

---

## 13. Remaining risks

- Live migration state UNVERIFIED: if 143–145 are unapplied where the UI reads, pages
  surface read errors (fail-loud per Stage 1 contract, never fabricated zeros) —
  staging verification should confirm applied state.
- `closeStale…` still uncalled: open-set clog + unique-collision edge persist
  (documented; optional 9.x `void` call site proposed, kept out of scope).
- Sweep manual + shadow-ON: overviews may show sparse/stale data — pages label
  recency honestly ("last observed", never "live").
- `auth.role()`-shaped RLS tech debt flagged, untouched per boundaries.
- Residual secret risk in `message` text accepted and disclosed (§6).

---

## 14. Commit reference

Commit message: `feat(workforce): add read-only Sentinel incident UI`.
14 files, +2330/−10 (see §3). Implementation committed as `8681a49`; this report's
hash finalized in the subsequent amend — verify with `git log --oneline -2`
(final HEAD hash also recorded in the delivery summary).

## 15. Explicit confirmation that the UI is read-only

Confirmed by construction and by test: `lib/workforce/sentinel.ts` contains zero
write calls and no service-role import (scanned); the three pages contain zero
`<form>`/`<button>` elements and issue zero writes (scanned); no lifecycle function
is invoked from UI code (scanned); no migration/API/tool/permission/schedule change
exists in the diff (reviewed); RLS and `requireAdmin` contracts are preserved and
gated by the inventory test. The UI investigates, links, and displays — it cannot
acknowledge, resolve, close, re-severity, delete, notify, or remediate.
