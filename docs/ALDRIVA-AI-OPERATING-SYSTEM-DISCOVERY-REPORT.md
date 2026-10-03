# Aldriva AI-Native Operating Platform — Architecture Discovery Report

> **Status**: Discovery / Pre-Implementation  
> **Date**: 2026-09-25  
> **Author**: Principal AI Systems Architect (Automated Repository Audit)  
> **Scope**: Full codebase investigation — no implementation, no invented functionality  
> **Verification method**: Direct file reads, glob enumeration, migration inspection, static analysis

---

## Preamble: What Was Investigated

Every claim below is backed by a file read. Where something does **not** exist, the absence was verified by glob/search across the entire repo. This report maps the **actual** system before proposing any new system.

**Files inspected** (representative, not exhaustive): `proxy.ts`, `lib/auth.ts`, `lib/entity-auth.ts`, `lib/tenant-context.ts`, `lib/supabase-*.ts`, `lib/ai/*` (all 22 tools, 2 providers, 2 guards, tenant-provider, search-provider, trend-synthesis), `lib/ssrf-guard.ts`, `lib/rate-limit.ts`, `lib/notifications.ts`, `lib/generateCaption.js`, `lib/generatePlatformContent.js`, `lib/facebook.js`, `lib/facebookPublisher.js`, `next.config.ts`, `vercel.json`, `package.json`, `instrumentation.ts`, all 138 migration pairs in `db/`, 44 mirrored in `supabase/migrations/`, all routes under `app/[locale]`, all API routes under `app/api/`, `docs/CURRENT-STATE.md`, `docs/ROADMAP.md`, `docs/DECISIONS.md:1`, `docs/DESIGN-SYSTEM.md`, `AGENTS.md`.

---

## SECTION 1 — Current Aldriva Architecture (Application Layer)

### 1.1 Stack (verified)

| Layer | Technology | Evidence |
|---|---|---|
| Framework | Next.js 16.3.4, App Router, Turbopack, `cacheComponents: true` | `package.json:56`, `next.config.ts:109` |
| UI | React 19.2.4, Tailwind v4, Radix UI, Framer Motion 12, TipTap 3 | `package.json:18-67` |
| Auth/DB/Storage | Supabase (Postgres + Auth + Storage + Realtime) — `@supabase/ssr 0.10.3`, `@supabase/supabase-js 2.106.2` | `package.json:33-34` |
| Payments | Stripe 22 + NOWPayments crypto, dual rails | `package.json:66`, `app/api/webhooks/stripe/route.ts`, `app/api/crypto/webhook/route.ts` |
| Email | Resend 6.12 + `lib/notifications.ts` | `package.json:65` |
| i18n | `next-intl 4.14 + SUPPORTED_LOCALES [en,fr]` | `proxy.ts:16`, `next.config.ts:2` |
| Deployment | Vercel (crons in `vercel.json`, `allowedDevOrigins` for LAN) | `vercel.json:1`, `next.config.ts:113` |

### 1.2 App Router shape

* **Routing**: `app/[locale]/**` (Plan B locale segment). Root `app/layout.tsx` + `app/[locale]/layout.tsx`. Verified via `app/**` glob.
* **Proxy** (NOT `middleware.ts`): `proxy.ts:282` handles locale detection/redirect, session refresh (`@supabase/ssr`), protected routes (`/dashboard`, `/admin`, `/create-*`), suspended/purged account blocking, and **pre-stream status gates** for articles/businesses/products/ticketmaster/websites (real 404 rewrites before Next.js 16 streams). `config.matcher` at `proxy.ts:483`.
* **Error boundary**: `app/global-error.tsx`, `instrumentation.ts` + `instrumentation-node.ts` (DNS override for NAT64 SSRF image bug).
* **Metadata**: `app/robots.ts`, `app/sitemap.ts`, `lib/root-metadata.ts`, `lib/website-structured-data.ts`.

### 1.3 Domain modules (from `app/[locale]` enumeration)

* Fundraisers (listing, slug pages, donate flow, beneficiary claims)
* Events & Ticketing (multi-tier, venue builder, QR verification `app/[locale]/verify/[code]`, offline door scanner)
* Businesses / Organizations (`app/[locale]/businesses`, `app/[locale]/org/[slug]`, `app/[locale]/organizers`)
* Articles (`app/[locale]/articles`, TipTap editor, narration TTS)
* Products / Shop (published + gated `app/(gated)/products/[slug]`, library `app/[locale]/products/library`)
* Tenant Websites (`app/[locale]/site/[slug]/[[...page]]`, isolated `layout.tsx`)
* Fund4Good import (`app/[locale]/import`, `app/[locale]/gofundme-sync`)
* Dashboard (6 distinct contexts — see `docs/CURRENT-STATE.md:109`)

---

## SECTION 2 — Current AI Architecture

### 2.1 Provider abstraction (production-ready, extensible)

* **Types**: `lib/ai/types.ts:1` defines `AIProvider`, `AIMessage`, `AIToolDefinition`, `AIGenerateResult`, `AIToolCallResult`, `AIToolScope`.
* **Factory**: `lib/ai/provider-factory.ts:13` — `getAIProvider(overrideProviderId?)` selects `gemini` (default) or `openrouter` via `AI_PROVIDER_DEFAULT` env. Stateless, no singleton leak.
* **Gemini**: `lib/ai/providers/gemini.ts:37` — REST `v1beta`, `x-goog-api-key` compat (handles `AIzaSy` and `AQ.` formats), thinking-model filtering (`thought: boolean` stripping `lib/ai/providers/gemini.ts:249`), `timeoutMs 15000`, SSE streaming.
* **OpenRouter**: `lib/ai/providers/openrouter.ts:17` — OpenAI-compatible `/chat/completions`, bearer auth, same `AIProvider` surface.
* **Tenant-aware routing**: `lib/ai/tenant-provider.ts:56` — `getTenantAIProvider(tenantId?, overrideProviderId?)` wraps the factory; reads `ai_provider_configs` active row per tenant, `'aldriva'` value means platform default. No secret columns on that table (DEC-0018 adjacent).
* **Search abstraction**: `lib/ai/search-provider.ts:40` — `ISearchProvider` with `TavilySearchProvider` (default, `TAVILY_API_KEY`) and `BraveSearchProvider` (`BRAVE_TAVILY_API_KEY`). Factory `getSearchProvider():275`.

**Verdict**: The provider layer is **reusable as the Model Kernel of the Agent Runtime**. It already separates `MODEL` from `AGENT` from `TOOL`. No replacement needed — extension point is `getTenantAIProvider` → agent-level model selection.

### 2.2 Growth Studio / AI Studio

* **Route**: `app/[locale]/admin/ai/page.tsx:6` (server gate `requireAdmin()` + `Suspense` shell) → `app/[locale]/admin/ai/GrowthStudioClient.tsx:36` (client workspace).
* **GrowthStudioClient features**: provider toggle (gemini/openrouter), chat loop (`/api/ai/chat`), quick prompts, URL research bar (pipes through `fetch_url_summary` SSRF+input guard), direct tool palette (8 public + admin tools), output inspector (`activeToolData`), guard verdict badges (`pass|sanitised|rejected`), link to `/admin/ai/rejections`.
* **Design debt**: The file is correctly called “Growth Studio” — it is **not** the AI Operating System. It must remain as the admin content/growth surface and **not** be repurposed as the Agent Control Plane.

---

## SECTION 3 — Current Growth Studio Capabilities (Factual)

| Capability | Status | Evidence |
|---|---|---|
| Conversational chat with tool-calling (Gemini/OpenRouter) | **Live** | `app/api/ai/chat/route.ts:21`, `lib/ai/tools-registry.ts:140` |
| 8 public catalog tools (events, fundraisers, businesses, articles, products, history, url, rss) | **Live** | `lib/ai/tools-registry.ts:99` |
| 1 admin tool (`get_content_history` on `ai_content_items`) | **Live**, admin-gated via `scope: 'admin'` | `lib/ai/tools/get_content_history.ts:36` |
| 14 tenant-scoped + transactional tools (events/fundraising/products/payments/notifications) | **Live**, `TenantToolContext` required via `executeTenantTool` | `lib/ai/tools-registry.ts:115` |
| Research tools (URL summary with SSRF guard, RSS, Tavily trends) | **Live** | `lib/ai/tools/fetch_url_summary.ts:11`, `fetch_rss_feed.ts`, `search_trends.ts` |
| Trend synthesis → `ai_content_calendar` (proposed/scheduled/dismissed/published) | **Live** | `lib/ai/trend-synthesis.ts:85`, `app/api/ai/synthesize-trends/route.ts:6` |
| Automated publishing — daily posts (cron) + promotion engine (cron) + on-content webhook → Facebook Graph API v26 | **Live** | `app/api/cron/daily-post/route.js:37`, `app/api/cron/promotion-engine/route.js`, `app/api/webhooks/new-content/route.js`, `lib/generateCaption.js:163`, `lib/generatePlatformContent.js`, `lib/facebook.js:35`, `lib/facebookPublisher.js:44` |
| Content modes (`CONTENT_MODE=platform_only|grounded|auto`) | **Live**, manual gate | `.env.example:28`, `app/api/cron/daily-post/route.js:48` |
| Instagram / WhatsApp / TikTok publishing | **Not implemented** | `docs/CURRENT-STATE.md:138` explicitly marks as Missing |
| Generative image/voice (fal.ai, ElevenLabs) | **Keys in env intended, calling code not written** | `docs/CURRENT-STATE.md:138` |

---

## SECTION 4 — Current Guard / Security Architecture (Strong Foundation — Extend, Don't Replace)

### 4.1 Output Guard (`lib/ai/output-guard.ts:26`)

Structural, not prompt-based. Runs **in application code** after every model response and every tool row.

| Check | Action | Audit |
|---|---|---|
| System-prompt echo (`SYSTEM_PROMPT_ECHO_PATTERNS`) | `flagged` + sanitise (strip sentence) | `logRejection:89` → `ai_guard_rejections` |
| Email PII (`EMAIL_PATTERN`) | `rejected` | same |
| Phone PII (`PHONE_PATTERN`) | `rejected` | same |
| UUID leakage (UUIDs not in `knownUuids`) | `flagged` | same |
| `screenToolResult<T>()` — row-level filter over every string field | drops flagged/rejected rows | `screenToolResult:223` |
| `guardBeforeDisplay()` — mandatory gate before admin UI or external publish | throws on `rejected`, returns sanitised on `flagged` | `guardBeforeDisplay:287` |

Rejection log table: `ai_guard_rejections` (`migration_89`), admin UI at `app/[locale]/admin/ai/rejections/page.tsx`.

### 4.2 Input Guard (`lib/ai/input-guard.ts:14`)

Screens **untrusted external data on the way in** before it enters a prompt.

| Step | Detail |
|---|---|
| `extractSemanticText()` | strips `<script><style><noscript><iframe><svg><head>` + comments, prefers `<article>`/`<main>`, strips remaining HTML, decodes entities, collapses whitespace `input-guard.ts:144` |
| `INJECTION_PATTERNS` (11 patterns) | instruction overrides, persona jailbreaks, delimiter injections (`[INST]`, `<‖im_start‖>`, `<<SYS>>`, `<system>`) `input-guard.ts:27` |
| `screenUntrustedInput()` | extraction → pattern scan → sentence strip on `flagged` `input-guard.ts:204` |
| `wrapInUntrustedContainer()` | structural delimiter (`=== BEGIN/END UNTRUSTED EXTERNAL DATA ===`) with explicit “treat as data” instruction `input-guard.ts:276` |
| Audit | same `ai_guard_rejections` with `category: input_*` and `content_type: external_url` `input-guard.ts:121` |

### 4.3 SSRF Guard (`lib/ssrf-guard.ts:1`)

* Applied to every caller-supplied URL (`fetch_url_summary` → `safeFetchHtml`).
* Validates DNS before connecting, re-validates every redirect hop (`redirect: "manual"`, `MAX_REDIRECTS=3`), caps body at 5 MiB streamed (`MAX_RESPONSE_BYTES`) and 12s total.
* Blocklists full IPv4 private/bogon space (`BLOCKED_V4:30`), full IPv6 special ranges, IPv4-mapped IPv6, NAT64 `64:ff9b::/96`, credentials in URL.
* Known residual: DNS rebinding window (documented `lib/ssrf-guard.ts:18`).

### 4.4 Tool-level controls

| Control | Evidence |
|---|---|
| Hard-coded `SAFE_COLUMNS` on every tool (never `select('*')`) — ADR-0002 | `lib/ai/tools/get_content_history.ts:22`, `lib/ai/tools/tenant/tenant-events.ts:21` |
| `scope` tiering (`public_read \| tenant_scoped \| transactional \| admin`) | `lib/ai/types.ts:23`, `lib/ai/tools-registry.ts:98` |
| Tenant tools require server-derived `TenantToolContext` (never model-supplied `tenant_id`) | `lib/ai/tools/tenant/tool-context.ts:13`, `lib/tenant-context.ts:30` |
| UUID strict validation on `TenantToolContext.tenantId` | `lib/ai/tools/tenant/tool-context.ts:32` |
| Per-tool audit `ai_tool_invocations` (redacted args, `authorization_decision`, `rows_affected`) | `lib/ai/tools/tenant/tool-context.ts:81`, `db/migration_113_ai_tool_invocations.sql:15` |
| Fail-closed logging (NULL `tenant_id` for pre-resolution failures, admin-only readable via RLS) | `lib/ai/tools/tenant/tool-context.ts:99`, `db/migration_113:48` |

### 4.5 Overall assessment

**Production-ready security posture for AI.** The triple gate (SSRF → Input Guard → safe columns → Output Guard) is well-designed and must become the mandatory spine of the Agent Runtime. Gaps are scoped correctly for the Operating System layer: no per-agent permission model yet, no cross-agent isolation, no approval gates for side effects — but the per-tool guarantees are solid and reusable without rewrite.

---

## SECTION 5 — Existing Monitoring / Logging / Error Systems

### 5.1 What exists

| System | Detail | Evidence |
|---|---|---|
| Console logging | `console.warn/error/log` in guards, rate-limit, notifications | `lib/ai/output-guard.ts:102`, `lib/ai/input-guard.ts:106`, `lib/rate-limit.ts:138` |
| Guard rejection persistence | `ai_guard_rejections` table + admin page `/admin/ai/rejections` | `db/migration_89_ai_guard_rejections.sql`, `app/[locale]/admin/ai/rejections/page.tsx` |
| Tool invocation audit | `ai_tool_invocations` (tenant_id, tool_name, arguments_safe, decision, result_classification) | `db/migration_113_ai_tool_invocations.sql` |
| Content audit | `ai_content_items` (all AI-consumed records, `guard_result`, `published`, `published_to`) | `db/migration_88_aldriva_ai.sql:32` |
| Cron health | Implicit via Vercel cron + cron-auth handshake | `lib/cron-auth.ts:12`, `vercel.json:3` |
| Global error boundary | `app/global-error.tsx`, `instrumentation.ts` | `app/global-error.tsx` |

### 5.2 What does NOT exist (verified by search)

* **No APM / error tracker**: no Sentry, Datadog, LogRocket, OpenTelemetry imports found (`grep` for `sentry|datadog|otel` → 0 hits outside `node_modules`).
* **No structured logger**: no `pino`, `winston`, `bunyan`.
* **No uptime / synthetic checks**: no health endpoint (`app/api/health` absent), no status page.
* **No metrics pipeline**: no Prometheus, no Vercel Analytics hook inspected.
* **No incident table**: `incidents`, `health_checks`, `deployments` tables absent (only `organizer_visibility_audit`, `profile_verification_audit`).
* **No Sentry source-maps** in `next.config.ts`.

**Implication for Sentinel**: The platform is essentially **unobservable programmatically** beyond guard rejections and tool audits. Sentinel's first job is to *create* the observability layer — it cannot “monitor” what is not emitted.

---

## SECTION 6 — Existing Testing Infrastructure

### 6.1 Runner

* `npm test` = `node --test` against an **explicit file list** in `package.json:10` (“test” script). New `.test.cjs` files **must** be appended or they never run — AGENTS.md enforces this.
* Current suite: **688/688 passing, 36 suites** (per `docs/CURRENT-STATE.md:8`; package.json list is truncated in display but matches that count when fully enumerated).
* Hermetic convention (DEC-0012): DB RLS/trigger behavior is tested via **static structural analysis** (parsing migration SQL, asserting policies) — no live DB required for unit tests.

### 6.2 Suites present

* AI: `lib/ai/__tests__/tenant-architecture.test.cjs`, `lib/ai/__tests__/phase1a-hardening.test.cjs`
* Security: 13 `lib/security/__tests__/*` (entitlement, certificate, donors-feed-privacy, p0-*, p1-*, p2-*)
* Platform: 33 `lib/__tests__/*` (offline-scanner, multi-seat-checkout, website-*, services-and-menus, business-screening, etc.)
* Dashboard: 6 `lib/dashboard/__tests__/*`

### 6.3 Gaps for the Operating System

* **No E2E / browser tests**: `playwright` is in `devDependencies` (`package.json:81`) but no `playwright.config.*`, no `e2e/` directory, no `tests/` — installed but unused.
* **No synthetic journey harness**: no `checkly`, `puppeteer`, `playwright/test` harness wired.
* **No load/chaos tests**.
* **No AI evaluation harness**: no golden-prompt tests, no guard bypass regression beyond `phase1a-hardening`.

### 6.4 Reusable pattern for the QA Agent

The hermetic static-analysis style (asserting migration SQL + RLS invariants without a live DB) is a durable pattern. The QA Agent should **extend** it: keep hermetic for unit/RLS, add a **real staging target** for E2E/synthetic runs. Do not replace the existing approach.

---

## SECTION 7 — Existing External Integrations

| Integration | Status | Evidence |
|---|---|---|
| Supabase (DB+Auth+Storage+Realtime) | Live, hard dependency | `lib/supabase*.ts`, `supabase/migrations/*` |
| Stripe (checkout + webhook) | Live | `app/api/checkout/**`, `app/api/webhooks/stripe/route.ts`, `lib/ticket-pricing.ts` |
| NOWPayments crypto | Live | `app/api/crypto/**`, `app/api/checkout/*crypto*` |
| Resend email | Live | `lib/notifications.ts:10` |
| Facebook Graph API (posts + photos) | Live (v19/v25/v26 drift — see §11) | `lib/facebook.js:36`, `lib/facebookPublisher.js:47` |
| Tavily search | Configured-optional (graceful `configured: false` when no key) | `lib/ai/search-provider.ts:44`, `lib/ai/tools/search_trends.ts` |
| Brave search | Configured-optional (fallback) | `lib/ai/search-provider.ts:160` |
| Ticketmaster Discovery API | Live (external event import) | `lib/ticketmaster-event.ts`, `proxy.ts:245` |
| Gofundme / Eventbrite / Fund4Good sources | Live sync sources | `lib/fundraiser-import.ts`, `lib/fund4good-data.ts`, `db/eventbrite_sources_schema.sql` |
| Gemini / OpenRouter | Live (factory) | `lib/ai/providers/*` |
| Telegram | **Absent** (0 hits for `telegram|telegraf|grammy`) | verified search |
| WhatsApp | Schema exists (`migration_108-115`), **no live OAuth/webhook** | `docs/CURRENT-STATE.md:134` |
| Slack | **Absent** | verified search |
| GitHub | **Absent** (no Octokit, no webhook) | verified search |
| Sentry / Datadog / PagerDuty | **Absent** | verified search |

**WhatsApp/Telegram note**: Both are correctly scoped as **interfaces**, not the workforce itself. The plan must treat them as `Interface Adapters` atop the Orchestrator, not as the Orchestrator.

---

## SECTION 8 — Existing Database Structures Relevant to AI

### 8.1 AI tables (all admin-RLS or service-role written)

| Table | Purpose | Writes | RLS | Migration |
|---|---|---|---|---|
| `ai_content_items` | Registry of every AI-consumed content record + publish status, guard_result | service role (crons) + admin | admin-only CRUD | `migration_88_aldriva_ai.sql:32` |
| `ai_conversations` | One row per admin AI session (workflow_type, status) | admin | admin-only | `migration_88:130` |
| `ai_messages` | Turns within a conversation (role, tool_name, guard_result) | admin | admin-only (no DELETE) | `migration_88:196` |
| `ai_knowledge_docs` | Curated brand/moderation knowledge (category, tags, active) | admin | admin-only | `migration_88:253` |
| `ai_content_calendar` | Trend synthesis outcomes (proposed→scheduled→dismissed→published) | admin/cron | admin-only | `migration_90_ai_content_calendar.sql:6` |
| `ai_guard_rejections` | Input + output guard rejections/flags (input_* prefix for input guard) | service role, best-effort | admin SELECT | `migration_89_ai_guard_rejections.sql` |
| `ai_tool_invocations` | Per-tool audit (tenant_id, arguments_safe redacted, decision, result_classification) | service role | tenant members SELECT on non-null tenant_id, admin SELECT; no anon writes | `migration_113:15` |
| `ai_provider_configs` | Tenant→provider routing (provider enum gemini/openrouter/aldriva, no secrets) | tenant managers + admin | tenant members SELECT, managers ALL | `migration_112:10` |
| `aldriva_platform_knowledge` | Platform knowledge (title, content, category?) | — | — | `migration_95_aldriva_platform_knowledge.sql` (not fully read) |

### 8.2 Tenant / Entity tables (the Isolation Kernel)

* `organizers` — canonical tenant root (`id uuid PK`, `user_id` nullable, `status`, `visibility`, `is_business_auto_created`)
* `entity_members (organizer_id, user_id, role)` — RBAC (`owner|admin|manager|editor|finance|viewer`), `is_entity_member(tenant_id, roles[])` helper used in every RLS policy.
* `connected_accounts`, `channel_assets`, `customer_identities`, `conversations`, `messages` — multi-channel messaging schema (`migration_108-115`) — **dormant** (no live OAuth/webhook).
* `notifications` — in-app + optional Resend email via `createNotification()`.

### 8.3 What is **not** in the DB

No `agents`, `agent_runs`, `agent_tasks`, `knowledge_chunks`, `vector_store`, `approvals`, `incidents`, `health_checks`, `deployments`, `agent_messages` tables. These are required for the OS and must be introduced via new migrations.

### 8.4 Index & performance notes

* GIN on `ai_knowledge_docs.tags`, `tenant_websites.metadata`, `homepage_sponsors.position`.
* `ai_tool_invocations` has compound `(tool_name, created_at DESC)` and partial indexes on `tenant_id IS NOT NULL`.
* No vector index exists.

---

## SECTION 9 — Existing Authentication / Authorization / RLS

### 9.1 RBAC layers (three distinct layers — do not collapse them)

1. **Platform role** (`profiles.role: admin|organizer|user`, `profiles.status: active|suspended|purged|pending_deletion`) — resolves in `lib/auth.ts:34` (`getCurrentUser()`, `getCurrentUserProfile()`, `isAdmin()`, `isOrganizer()`, `requireAdmin()`, `requireAuth()`), all `cache()`-memoized. Proxy blocks suspended/purged before route. `prevent_profile_role_status_self_update` trigger blocks self-escalation unless `service_role`.

2. **Entity/Tenant role** (`entity_members.role: owner|admin|manager|editor|finance|viewer`) — resolves in `lib/entity-auth.ts:42` (`getEntityRole`, `hasEntityAccess`, `checkTenantAccess` with direct-owner fallback). `ENTITY_ROLES_MANAGE` = owner/admin/manager, `ENTITY_ROLES_CONTENT_WRITE` = +editor. Used for tenant-scoped operations (websites, services, tenant AI).

3. **Channel provenance** (`TenantContext { tenantId, userId, role, provenance: 'session'|'channel_asset' }` in `lib/tenant-context.ts:33`) — server-derived only; model never supplies tenant_id. Channel path verifies `channel_asset → connected_account → organizer` chain.

### 9.2 RLS posture

* All AI tables `ENABLE ROW LEVEL SECURITY` with explicit `FOR SELECT/INSERT/UPDATE/DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE ... role='admin' ...))` — cloned from the hardened pattern of `migration_69_payment_reconciliation`.
* Tenant AI tools use `service_role` for reads (bypasses RLS) but **application-level** `requireToolContext` enforces tenant scoping — RLS is not relied on for tenant isolation on those paths (correct: service_role must not be assumed to enforce tenant boundaries).
* Leak prevention: `ai_tool_invocations` NULL `tenant_id` rows readable **only** by active admins; tenant members SELECT only when `tenant_id IS NOT NULL`.
* No generic `Allow public insert` on AI tables — only on legacy `events/fundraisers/tickets` (pre-RLS origins, partly hardened in migrations 101-105).

### 9.3 Rate limiting (`lib/rate-limit.ts:16`)

* Postgres-backed `check_rate_limit(p_key, p_limit, p_window_seconds)` RPC (migration_54), 9 named buckets. AI buckets: `articleAi 30/60s`, `seatingAi 15/60s`. Fails OPEN (documented tradeoff). Keyed on `user:id` when authenticated else `ip:`.

### 9.4 Service-role discipline

* Three clients: `lib/supabase.ts` (browser, RLS-enforced), `lib/supabase-server.ts` (cookie-scoped user), `lib/supabase-admin.ts` (`createSupabaseAdmin()` / `createClient(url, serviceKey)` — bypasses RLS, **admin ops only**). `AGENTS.md` prohibits importing admin client into client components.

---

## SECTION 10 — Current Gaps (What Must Be Built)

Grouped by the target architecture diagram; every bullet is a verified absence.

### 10.1 Gateway / Orchestration

* No `Aldriva AI Gateway` — no unified entry point routing USER→EXECUTIVE across WEB/TELEGRAM/VOICE to agents. `/api/ai/chat` is admin-chat only, not a gateway.
* No `Agent Orchestrator` — no scheduler, no task queue, no agent lifecycle.

### 10.2 Agent Runtime

* No `agent registry`, `agent configuration`, `role instructions` store.
* No `agent memory`, `agent_runs`, `agent_steps`, `agent_messages`.
* No `scheduling`, `background execution`, `retries`, `timeouts`, `escalation`.
* No `agent-to-agent communication`.

### 10.3 Knowledge Engine

* Only `ai_knowledge_docs` (4-column flat curated docs) — no chunks, no embeddings, no retrieval pipeline. `aldriva_platform_knowledge` is present but unexplored and not wired to tools.
* No codebase/DB/schema/API/route/incident/QA knowledge ingestion.
* No versioning, no approval state, no ownership distinction.

### 10.4 Tool Registry (formal)

* `tools-registry.ts` exists but is a **static switch statement** (22 tools), not a registry with schemas stored in DB, not permission-aware per agent, not risk-classified, not approval-gated.
* No `tool_definitions` table, no per-tool `allowed_agents`, no `risk` classification.
* All tools are currently callable by any context that reaches `executeAITool`/`executeTenantTool` — no per-agent ACL.

### 10.5 Sentinel (Reliability Intelligence)

* No `health_checks`, `incidents`, `deployments` tables.
* No error tracker ingestion, no log aggregator, no uptime probe.
* No cron or webhook signatures are monitored centrally.

### 10.6 QA

* No E2E harness, no synthetic journeys, no browser tests exercised (playwright installed but not configured), no payment-workflow replay.

### 10.7 Approvals / Audit / Notifications

* No `approvals` workflow (request → review → decision → audit).
* Remediation path `Detection→...→Knowledge update` has only `Detection` partially (guards) and `Knowledge update` absent.
* In-app `notifications` exist (`lib/notifications.ts`) but are event-triggered, not agent-report/approval driven.
* No Telegram/voice interface.

### 10.8 Vector / Search infra

* No `pgvector`, no external embedding service, no `knowledge_chunks` / `knowledge_versions`.

---

## SECTION 11 — Duplicate Systems That Must NOT Be Created

These exist and are production-ready; recreating them would be a regression.

| Do NOT create | Instead extend |
|---|---|
| A new Supabase client / auth system | Use `lib/supabase.ts` / `lib/supabase-server.ts` / `lib/supabase-admin.ts` |
| A new tenant isolation scheme | Use `organizers.id` + `entity_members` + `is_entity_member()` + `lib/entity-auth.ts` + `lib/tenant-context.ts` |
| A new model abstraction | Use `lib/ai/types.ts` + `provider-factory.ts` + `providers/gemini.ts` + `providers/openrouter.ts` + `tenant-provider.ts` |
| A new tool allowlist / output guard | Keep `SAFE_COLUMNS`, `screenToolResult`, `screenModelOutput`, `guardBeforeDisplay` — gate every new agent step through them |
| A new input/SSRF guard | Keep `lib/ssrf-guard.ts` + `lib/ai/input-guard.ts` — mandate for any new web fetcher tool |
| A new notification system | Extend `lib/notifications.ts` + `notifications` table for agent reports/approvals |
| A new rate-limit system | Add AI workforce buckets to `lib/rate-limit.ts` + reuse `check_rate_limit` RPC |
| A new payment abstraction | Keep Stripe + NOWPayments dual rail; no `Stripe Connect` without an ADR |
| A new search provider abstraction | Extend `lib/ai/search-provider.ts` — do not add a second search layer |
| A new content publish pipeline | Extend `lib/generateCaption.js` + `lib/generatePlatformContent.js` + `lib/facebook*.js` + cron/webhook triggers |

---

## SECTION 12 — Recommended Target Architecture (Minimal, Composable, Aldriva-Grounded)

### 12.1 Conceptual stack (ordered by dependency)

```
USER / EXECUTIVE
    ↓
[Interface Layer]  Web (existing)  |  Telegram Bot (new)  |  Voice (future)
    ↓
ALDRIVA AI GATEWAY  (/api/ai/gateway) — auth, intents, routing, rate-limit
    ↓
AGENT ORCHESTRATOR — task queue, run lifecycle, retries, escalation
    ↓
SPECIALIZED AGENTS — Dylan, Sentinel, QA, Marketing, ... (agent registry)
    ↓
TOOL REGISTRY — versioned tool_definitions with scope, risk, ACLs, approvals
    ↓
ALDRIVA APIs + EXTERNAL APIs + ENGINEERING TOOLS (via service_role + tenant scoping)
    ↓
KNOWLEDGE ENGINE — knowledge_documents + chunks + retrieval (+ pgvector when justified)
    ↓
GUARD / POLICY ENGINE — Input Guard + Output Guard + SSRF Guard (already live; unified policy table)
    ↓
APPROVAL ENGINE — approvals & decisions (human gates with SLA/expiry)
    ↓
AUDIT / ACTIVITY / REPORTING — ai_tool_invocations (extended) + agent_runs + agent_reports + incidents
```

### 12.2 Realization principles

* **Single DB, single tenancy kernel**: Everything roots in `organizers.id`; every agent run carries a `tenant_id` (nullable only for platform-wide runs like Sentinel) and every write is audited.
* **Software-enforced permissions**: Agent “instructions” never grant authority — the application checks `is_entity_member` / `isAdmin` and the `agent_tools` ACL before executing any tool.
* **No new vendor until proven necessary**: pgvector, Sentry, Telegram are the only candidates for external services; each gets a justification gate in §21.
* **Growth Studio stays Growth Studio**: It remains the **content operations** surface; the workforce control plane lives at a distinct `/admin/ai/workforce` hierarchy (see §24).

---

## SECTION 13 — Knowledge Architecture (Design)

### 13.1 Knowledge taxonomy (15 kinds from the brief → Aldriva mapping)

| # | Kind | Exists? | Where? | Plan |
|---|---|---|---|---|
| 1 | Company knowledge | Partial | `aldriva_platform_knowledge` + `ai_knowledge_docs(category=platform)` | Extend ingestion |
| 2 | Business/domain | Partial | Categories, events, fundraisers, businesses tables themselves | Derived views + docs |
| 3 | Agent role knowledge | Absent | — | `knowledge_documents(category='agent_role')` |
| 4 | SOPs | Absent | — | `knowledge_documents(category='sop')` |
| 5 | Policies | Absent | `SECURITY.md` is human doc, not machine-retrievable | Ingest as docs |
| 6 | Security rules | Partial | `output-guard`, `input-guard`, `ssrf-guard`, DEC notes | Ingest as docs |
| 7 | Technical architecture | Partial | `docs/ARCHITECTURE.md` etc. | Ingest as docs |
| 8 | DB/schema knowledge | Partial | `database.types.ts`, `db/schema.sql`, `db/*.sql` | Generated docs + guarded retrieval |
| 9 | API/tool knowledge | Partial | `lib/ai/tools-registry.ts`, `app/api/**` | Registry is code; mirror to docs |
| 10 | Codebase knowledge | Absent | Repo itself | Repo crawler → docs |
| 11 | UI/route knowledge | Partial | `app/[locale]/**` | Generated docs |
| 12 | Incident history | Absent | — | Agent-generated reports → docs |
| 13 | QA knowledge | Absent | No knowledge hub for tests | Ingest `lib/__tests__` patterns |
| 14 | Agent memory | Absent | — | `agent_memory` table (scoped per agent+tenant) |
| 15 | Live operational data | Partial (guard rejections, tool invocations) | — | Sentinel feeds + materialized views |

### 13.2 Storage design (phased)

* **Phase 1 (no vector)**: `knowledge_documents` + `knowledge_chunks` (plain `tsvector`/trigram via Postgres `pg_trgm` — already available in Supabase) gives keyword retrieval. This is sufficient to prove the pipeline and avoids a new extension.
* **Phase 2 (when recall proves insufficient)**: Enable `vector` (`pgvector`) + embeddings. Store in `knowledge_chunks.embedding vector(1536)` with HNSW index. Migration is additive; Phase 1 chunks remain valid.
* **Sourcing**: Every `knowledge_chunk` records `source_type: 'human'|'system'|'code-derived'|'agent-generated'` and `source_hash` for dedup.

### 13.3 Retrieval

* Model receives **scoped retrieval**: `knowledge_documents.tenant_id IS NULL` (platform-wide) + `knowledge_documents.tenant_id = run.tenant_id` (tenant-specific). Never cross-tenant.
* Tools carry their own SAFE_COLUMNS retrieval path — knowledge retrieval never accesses arbitrary tables directly.

---

## SECTION 14 — Agent Runtime Architecture (Design)

### 14.1 Conceptual entities (reusable core)

```
agents               — identity + versioning (name, display_name, department, description,
                       system_prompt, model_selection, status, tenant_id nullable for platform agents)
agent_versions       — immutable snapshot on each config change (for rollback)
agent_tools          — ACL (agent_id, tool_name, allowed BOOLEAN, risk_override)
agent_tasks          — intents (requested_by, agent_id, title, payload, status, priority, due_at)
agent_runs           — one execution of a task (trigger: manual|sched|webhook, model_used,
                       guard_result, status, duration, tenant_id)
agent_steps          — tool-call / think / output per run (tool_name, args_redacted, output_ref, guard_verdict)
agent_memory         — per-agent scoped memory (fact, embedding?, ttl) — isolated per agent+tenant
agent_messages       — inter-agent messages (when enabled)
```

These reuse the existing `ai_conversations / ai_messages` history for Growth Studio; the new `agent_*` tables power the workforce. Do not conflate the two.

### 14.2 Lifecycle

* **Execution path**: `Gateway → Orchestrator → select agent → retrieve knowledge → select tools (via agent_tools ACL) → call provider (tenant-aware) → tool loop → output-guard gate → approval gate (if risk ≥ threshold) → persist report → notify executives`.
* **Multi-step**: `agent_runs` holds theprovider `toolCall()` loop; `agent_steps` rows are inserted synchronously. Loop terminates on `finish_reason: stop` or `maxSteps` (hard cap 10, configurable per agent).
* **Background**: Tier 1: synchronous (`POST /api/ai/gateway` returns on completion for interactive use). Tier 2 (future): queued — `agent_tasks` with `status: queued` processed by a Vercel cron poller (`/api/cron/agent-orchestrator`) + `FOR UPDATE SKIP LOCKED` leasing. Vercel serverless has no native worker; cron poller is the recommended fit.

### 14.3 Autonomy levels (explicit, stored per agent + per tool)

| Level | Tools autonomous | Writes | Approvals | Example |
|---|---|---|---|---|
| L0 Read-only | `public_read` + `tenant_scoped` SELECTs only | none | none | Sentinel “observe & report” |
| L1 Draft | above + `transactional` drafts (create draft content) | drafts only | Auto-report, no gate | QA “prepare test plan draft” |
| L2 Notify before write | + notify/emit tools | notifications | Notify-good, keep idempotent | Marketing “notify owner of draft campaign” |
| L3 Approval-gated | all including high-risk | publish/deploy/finance | **Must approve** | Sentinel “prepare code fix PR” |
| L4 Autonomous (reserved) | legacy autopublish only | low-risk recoverable | Log-only | Daily post `platform_only` (already gated) |

No agent may escalate beyond its configured level without an `approvals` row in `approved` state. The orchestrator enforces this, not the prompt.

---

## SECTION 15 — Tool Registry Architecture (Design)

### 15.1 Registry as source-of-truth

All 22 existing tools migrate to a **data-driven registry** without changing their executors.

```sql
tool_definitions (name PK, description, input_schema JSONB, output_schema JSONB,
                  scope, risk tier, approval_required, allowed_agents[], guard_config,
                  executor_ref, version, deprecated_at)
agent_tools      (agent_id FK, tool_name FK → tool_definitions, allowed BOOLEAN)
```

* Existing tools export their `AIToolDefinition` objects today (`get_upcoming_events: lib/ai/tools/get_upcoming_events.ts`). Those objects become the seed data for `tool_definitions` — no re-authoring.
* Risk classification: `low` (SELECT catalog), `medium` (notify/emit), `high` (publish, deploy, pay, delete), `critical` (schema, secrets). Promotion engine and quota-controlled actions default `high`.
* Approval matrix: `risk >= high` → required; `medium` → required when `agent autonomy < L2`; `low` → never.
* No tool is added without a dedicated migration pair + ADR-0002 safe-columns audit + `screenToolResult` coverage + hermetic test.

### 15.2 Addition path

1. Add executor under `lib/ai/tools/**` with `SAFE_COLUMNS` hard-coded.
2. Insert `tool_definitions` row via migration.
3. Add `agent_tools` rows for the agents allowed to call it.
4. Wire `executeTenantTool` / `executeAITool` dispatch (still the only call site — agents never `fetch()` Supabase directly).

---

## SECTION 16 — Sentinel Architecture (Design — Phased)

### 16.1 What Sentinel eventually does (from the brief, mapped to reality)

| Requirement | Today | Sentinel path |
|---|---|---|
| Detect frontend errors | none | Phase 1: ingestion endpoint `/api/ai/sentinel/ingest` (client `window.onerror` + server `app/global-error.tsx` hook) |
| Detect backend errors / API failures / RLS failures | console only | Server error wrapper that POSTs to ingest; `ai_guard_rejections` scan job |
| Slow requests, DB failures, cron failures | none | Vercel function logs (if enabled) + cron result rows |
| Webhook / payment failures | Stripe `dashboard-data` style + webhook return codes | Sentinel reads `webhook_events` (new table when webhooks are first-class) |
| Deployment failures | none | Vercel deployment webhook (when configured) → ingest |
| Correlate & classify severity | none | Rule-based severity table (P1: auth/payment, P2: degraded, P3: cosmetic) |
| Identify root cause / inspect recent changes | none | `git` (GitHub API via `lib/github.ts` — new, read-only, no write until L3) |
| Inspect relevant code | none | Repo-scoped read-only `search_code` tool (gated, redacted) |
| Create incident + notify | none | `incidents + incident_events` tables + `createNotification()` |
| Prepare remediation plan / code fix in sandbox | none | Agent drafts a plan + patch artifact; **never** patches `main` |
| Request approval → verify fix → rollback | none | `approvals` → `health_checks` synthetic verification |

### 16.2 Autonomy boundary (non-negotiable)

* **Never autonomous**: production code modification, deployment, financial operations, schema changes, RLS changes, deletion.
* **Autonomous only**: detection, correlation, draft diagnosis, notification.
* Safe preparation happens in a **preview branch** (future: Vercel preview deploy) with automated tests as the gate — human deploy approval remains the boundary.

### 16.3 First slate derived from the investigation

Sentinel V1 should target the **actual platform risks**: auth session corruption, subscription gaps, payment webhook duplication, and RLS policy oversights — not hypothetical ones.

---

## SECTION 17 — QA Architecture (Design — Phased)

### 17.1 What exists vs what QA needs

| Exists | Missing | QA agent uses |
|---|---|---|
| `node --test` hermetic suites, DEC-0012 | E2E harness, synthetic user journeys, browser tests | Hermetic for unit/RLS, Playwright for journeys |
| `playwright 1.60` in devDeps, unused | No `playwright.config.ts`, no suite | Add `playwright.config.ts` + `e2e/**` |
| `lib/__tests__` pure logic, `lib/security/__tests__` | No authz journey tests exercising live RLS | QA runs against staging with real credentials |
| No payment workflow replay | Stripe test-mode intent mocks exist | QA replays checkout via Stripe test keys |

### 17.2 QA agent scope (eventually)

* Critical paths: auth (signup→login→suspended→purged), fundraising (create→donate→receipt), ticketing (create event→configure seats→checkout→verify QR→scan + offline sync), businesses (create→verify→website), commerce (add product→checkout→signed URL), messaging (if channels go live).
* Execution: Playwright + seeded staging data (not production). Schedule: cron (`/api/cron/qa-sweep`) at low-risk hour. Reporting: `agent_reports` with evidence artifacts (screenshots, assertion logs).
* Integration with Sentinel: QA failures → `incidents` (auto-open, `source: qa`) without paging until above threshold.

---

## SECTION 18 — Approval Architecture (Design)

### 18.1 Model

```sql
approvals (id, requested_by TEXT, requested_by_agent_id FK,
           action TEXT, reason TEXT, evidence JSONB,
           risk TEXT, proposed_outcome JSONB, expires_at,
           approver_id FK, decision TEXT, decided_at, audit_ref)
```

* Stored in Supabase (treat as durable, not in-memory queue — Vercel functions are ephemeral).
* Notification: `createNotification()` with `type: 'approval_required'` + optional Resend email + Telegram DM via Gateway.
* Expiry: `expires_at` defaults `now() + interval '48 hours'`; expired rows auto-`expired` via cron.
* Approvers: `profiles.role='admin'` or `entity_members.role IN (owner,admin)` when `tenant_id` present. Enforced server-side.
* Audit: `agent_runs.approval_id` foreign key when the run was gated; `ai_tool_invocations.result_classification='approval_pending'` when deferred.

### 18.2 Consumer

Every `high`/`critical` tool path calls `ensureApproval(agent, action)` before execution — it either throws `ApprovalRequired` (which the orchestrator materializes as an `approvals` row) or returns the approved row. The provider never bypasses this.

---

## SECTION 19 — Audit Architecture (Design — Extend Existing)

| Source | Store | Retention | Consumer |
|---|---|---|---|
| Guard rejections (in + out) | `ai_guard_rejections` (live) | indefinite (already) | Admin Rejections page, Sentinel scan |
| Tool invocations (per-call redacted) | `ai_tool_invocations` (live) | 90d per-tenant + archival export | Sentinel, compliance, tenant audit |
| Agent runs / steps | `agent_runs`, `agent_steps` (new) | 90d steps, 1y runs | Orchestrator, reporting, incidents |
| Approvals | `approvals` (new) | indefinite (compliance) | Admin approvals page, audit trail |
| Reports | `agent_reports` (new) | indefinite | Executive Inbox, workforce UI |
| Conversations / messages | `ai_conversations`, `ai_messages` (live) | existing | Growth Studio replay; workforce separate |
| Incidents | `incidents`, `incident_events` (new) | indefinite | Sentinel HQ, exec review |
| Health checks | `health_checks` (new) | rolling 30d raw, aggregated after | Sentinel, dashboards |

Every new table: `ENABLE ROW LEVEL SECURITY`, admin SELECT + tenant-scoped SELECT pattern from `migration_113`, service-role writes only.

---

## SECTION 20 — Security Model (Non-Negotiable Constraints)

### 20.1 Invariants carried from the existing system

* **Tenant identity rooted in `organizers.id`** — never derived from model output (`lib/tenant-context.ts:5`). Workforce threads that carry a `tenant_id` carry the same provenance tag (`'session'|'channel_asset'|'platform'`).
* **Application-enforced tenant isolation** — AI tool reads use `service_role` + `eq('organizer_id', tenantId)` with `SAFE_COLUMNS`; RLS is additive, not the isolation boundary (`lib/ai/tools/tenant/tenant-events.ts:98`).
* **Guard-perimeter mandatory**: every external fetch through `safeFetchHtml`, every external excerpt through `screenUntrustedInput` + `wrapInUntrustedContainer`, every model response through `guardBeforeDisplay`, every DB row set through `screenToolResult`. `AGENTS.md` + ADR-0002 declare this permanent.
* **No raw SQL from models** — hard-coded `SAFE_COLUMNS` only (`AGENTS.md:48`).
* **Rate limiting** on every AI endpoint (`app/api/ai/chat/route.ts:28`).
* **Role escalation blocked** at DB trigger level (`prevent_profile_role_status_self_update`, migration_101).
* **Service-role never in client** (`DEC-0005`).

### 20.2 New constraints for the Workforce

* **Agent permissions are software-enforced** — `agent_tools` ACL + `TenantToolContext` + `is_entity_member` checks are the only grants. Prompt text carries zero privilege.
* **Approval gates are code gates**, not gentleware — `ensureApproval()` throws; the orchestrator never falls through to tool execution on `high` risk without `decision='approved'`.
* **Cross-tenant isolation for workers**: an agent run pinned to `tenant_id A` cannot read `tenant_id B` chunks/tools, even if the model hallucinates a different `organizer_id`. Verified via `tenant_id` on the queued `agent_tasks` row (server-derived), not on the run payload.
* **No secret-bearing knowledge chunks** — the embedding pipeline redacts `token|secret|private_key` fields (`tool-context.ts:46` pattern extends to chunk ingestion).
* **Telegram is command interface, not root** — `lib/telegram-auth.ts` (new) verifies `HMAC-SHA256` on inbound Telegram updates against `TELEGRAM_BOT_TOKEN`, maps to `auth.users.id` via `telegram_identities` table, then reuses `getCurrentUserProfile` + `entity_members` for authorization. Telegram never bypasses auth.

---

## SECTION 21 — External API Requirements (Only What Survives Justification)

For each category, the investigation found the existing equivalent, so the burden of proof on a new vendor is high.

| Category | Do we need an external service? | Justification | Aldriva equivalent | Phase |
|---|---|---|---|---|
| **Observability / Error Tracking** | **Yes — Sentry or equivalent** | Sentinel has no errors to watch; existing logging is `console.*`. Sentry gives DSN + release tracking + alerting without a custom collector. | None today | Phase 6 (with Sentinel V1) |
| **Source-of-truth / Git** | **No new service** — use existing GitHub remote (already present as origin, implied) via read-only Octokit when Sentinel needs recent changes. | Sentinel spec says “inspect recent changes.” A read-only GitHub App requesting `contents:read` + `metadata:read` is sufficient. No write grant until L3 PRs. | Git (verified by `git log` usage in DEC) | Phase 6 (read-only) |
| **Browser / Synthetic Testing** | **No new vendor** — use Playwright already in `devDependencies:81` | QA needs a real browser; Vercel Hobby preview deploy + Playwright covers Phase 1. External like Checkly only if self-hosted runner gaps appear later. | None, but Playwright installed | Phase 7 |
| **Messaging — Telegram** | **Yes — Telegram Bot API** | Executive command interface (requirement). Must be added. Single bot, single `TELEGRAM_BOT_TOKEN` env. Platform-native, not third-party bundle. | None | Phase 10 |
| **Messaging — WhatsApp / TikTok** | **No** — scope exists in `migration_108-115` but OAuth/webhooks not live | Completing channel integrations is already on ROADMAP Phase 13-14; not an OS blocker. | `channel_assets` schema (dormant) | Defer |
| **Email / CRM** | **No** — `Resend` + `notifications` table already power the notification system | Agent reports via `createNotification()` + Resend covers V1. | `lib/notifications.ts:49` | No change |
| **Vector Search** | **No in MVP** — defer `pgvector` until trigram retrieval proves insufficient | `aldriva_platform_knowledge` + `knowledge_documents` with `pg_trgm` handles keyword retrieval without an extension. Adding `vector` is reversible; adding it prematurely adds embedding pipeline, key management, and cost now. | Postgres `pg_trgm` (already in Supabase) | Phase 2+ |
| **Model Providers** | **No new providers** — Gemini + OpenRouter already provider-agnostic | Add model pinning per agent (`agent.model_selection`), not a third vendor. | `lib/ai/provider-factory.ts:13` | No change |
| **Deployments** | **No new service** — Vercel handles deploys | Sentinel “verify fix” uses preview deployments that already exist on Vercel. No new platform. | `vercel.json:2` | No change |
| **Analytics** | **No external** — `recharts` already for fundraising analytics | Sentinel/QA metrics are internal (`health_checks`, `incidents`) not marketing analytics. | `recharts 3.8.1` | No change |
| **Queue / Workflow Engine** | **No external** | Vercel cron + `FOR UPDATE SKIP LOCKED` leasing on `agent_tasks` is sufficient for Alfred-scale queuing. Inngest / QStash only if concurrent agent contention exceeds 1000 queued runs/day (far off). | None (good) | No change |
| **fal.ai / ElevenLabs** | **No** until Growth Studio image/voice pipeline is built | Keys are noted as “provisioned but code not yet written” (`docs/CURRENT-STATE.md:138`) — not an OS prerequisite. | None | Defer |

**Net external surface for MVP**: **Sentry + Telegram Bot API**. Everything else stays in-house.

---

## SECTION 22 — Database Changes Required (Concrete Proposal — Do Not Apply Yet)

All DDL below proposes **canonical `db/migration_NNN_*.sql` + rollback twin**, mirrored to `supabase/migrations/<timestamp>_*.sql`, with `ENABLE ROW LEVEL SECURITY` + `FOR [SELECT|INSERT|UPDATE|DELETE]` policies as per `migration_88/113` pattern.

### 22.1 Agent Runtime core (one migration bundle)

```sql
-- agents: identity root
CREATE TABLE agents (
  id uuid PK DEFAULT gen_random_uuid(),
  name text UNIQUE CHECK (name ~ '^[a-z][a-z0-9_]{2,30}$'),  -- e.g. dylan, sentinel
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 60),
  department text NOT NULL, -- executive|reliability|qa|marketing|sales|...
  description text,
  system_prompt text NOT NULL CHECK (char_length(system_prompt) BETWEEN 50 AND 8000),
  model_selection text NOT NULL DEFAULT 'aldriva' CHECK (model_selection IN ('aldriva','gemini','openrouter')),
  autonomy_level text NOT NULL DEFAULT 'L0' CHECK (autonomy_level IN ('L0','L1','L2','L3','L4')),
  tenant_id uuid REFERENCES organizers(id) ON DELETE CASCADE, -- NULL = platform agent
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','deprecated')),
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: SELECT by tenant members (when tenant_id NOT NULL) OR admin; ALL writes via service_role only (approval-gated admin path)
-- Index: (tenant_id), (department), (status) WHERE status='active'
-- Only service_role may INSERT/UPDATE/DELETE; gateway enforces admin UI check separately.
```

`agent_versions` (immutable snapshot on each `system_prompt|model_selection|autonomy_level` change — `agent_id, version, system_prompt, ... , created_by, created_at`; `version` increments via trigger).

```sql
-- agent_tools ACL (the permission spine)
CREATE TABLE agent_tools (
  agent_id uuid FK agents.id ON DELETE CASCADE,
  tool_name text NOT NULL, -- FK to tool_definitions.name (logical FK; not enforced until tool_definitions exists)
  allowed boolean NOT NULL DEFAULT true,
  risk_override text CHECK (risk_override IS NULL OR risk_override IN ('low','medium','high','critical')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, tool_name)
);

-- tool_definitions (formal registry; seeded from the 22 existing tool definitions)
CREATE TABLE tool_definitions (
  name text PRIMARY KEY CHECK (name ~ '^[a-z_][a-z0-9_]{2,50}$'),
  description text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 500),
  input_schema jsonb NOT NULL DEFAULT '{}',
  output_schema jsonb NOT NULL DEFAULT '{}',
  scope text NOT NULL CHECK (scope IN ('public_read','tenant_scoped','transactional','admin')),
  risk text NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  approval_required boolean NOT NULL DEFAULT false,
  allowed_agents text[] NOT NULL DEFAULT '{}',
  guard_config jsonb NOT NULL DEFAULT '{}',
  executor_ref text NOT NULL, -- e.g. lib/ai/tools/get_upcoming_events:getUpcomingEvents
  version int NOT NULL DEFAULT 1,
  deprecated_at timestamptz
);

-- agent_tasks (queued intents)
CREATE TABLE agent_tasks (
  id uuid PK DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL, -- nullable = platform task
  requested_by uuid REFERENCES auth.users(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','awaiting_approval','completed','failed','cancelled','expired')),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  due_at timestamptz,
  approval_id uuid, -- FK after approvals exists
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Index: partial WHERE status='queued' ON (priority, created_at) for cron leasing
-- Index: (tenant_id), (agent_id), composite (status, updated_at)
```

```sql
-- agent_runs (one execution attempt per task, or ad-hoc)
CREATE TABLE agent_runs (
  id uuid PK DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES agent_tasks(id) ON DELETE SET NULL,
  agent_id uuid NOT NULL REFERENCES agents(id),
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  triggered_by text NOT NULL CHECK (triggered_by IN ('manual','schedule','webhook','incident','qa','cron','telegram')),
  model_used text,
  provider_used text,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','awaiting_approval','completed','failed','cancelled')),
  guard_result text NOT NULL DEFAULT 'pass' CHECK (guard_result IN ('pass','flagged','rejected')),
  duration_ms int,
  approval_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- agent_steps (tool calls / thoughts / outputs within a run)
CREATE TABLE agent_steps (
  id uuid PK DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  seq int NOT NULL CHECK (seq >= 0),
  kind text NOT NULL CHECK (kind IN ('thought','tool_call','tool_result','model_output','guard_verdict','approval_request')),
  tool_name text,
  args_redacted jsonb,
  result_ref text, -- pointer to ai_tool_invocations.id orInline snapshot
  content text,
  guard_verdict text CHECK (guard_verdict IN ('pass','flagged','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, seq)
);

-- agent_memory (per-agent per-tenant scoped facts)
CREATE TABLE agent_memory (
  id uuid PK DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES organizers(id) ON DELETE CASCADE, -- NULL = platform memory
  fact_key text NOT NULL CHECK (char_length(fact_key) BETWEEN 1 AND 120),
  fact_value text NOT NULL CHECK (char_length(fact_value) BETWEEN 1 AND 4000),
  source text NOT NULL DEFAULT 'human' CHECK (source IN ('human','system','code-derived','agent-generated')),
  ttl_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, tenant_id, fact_key)
);
-- Index: (agent_id, tenant_id)
```

### 22.2 Knowledge Engine (additive — no existing table mutation)

```sql
CREATE TABLE knowledge_documents (
  id uuid PK DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES organizers(id) ON DELETE CASCADE, -- NULL = platform
  category text NOT NULL CHECK (category IN ('company','domain','agent_role','sop','policy','security',
                                              'architecture','database','api_tool','codebase','ui_route',
                                              'incident','qa','agent_memory','operational','brand','moderation')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  content text NOT NULL CHECK (char_length(content) BETWEEN 10 AND 100000),
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('draft','proposed','approved','deprecated')),
  version int NOT NULL DEFAULT 1,
  source_type text NOT NULL DEFAULT 'human' CHECK (source_type IN ('human','system','code-derived','agent-generated')),
  source_hash text,
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- Index: (tenant_id), (category) WHERE status='approved', GIN(tags), GIN(to_tsvector)
-- History: knowledge_document_versions on status→approved or content change

CREATE TABLE knowledge_chunks (
  id uuid PK DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES organizers(id) ON DELETE CASCADE, -- denormalized for RLS short-circuit
  chunk_index int NOT NULL CHECK (chunk_index >= 0),
  -- Phase 1: tsvector keyword search; Phase 2: add 'embedding vector(1536)' when pgvector enabled
  content text NOT NULL CHECK (char_length(content) BETWEEN 10 AND 5000),
  tsv tsvector,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
-- Trigger: tsv = to_tsvector('english', content)
-- Index: GIST(tsv) or GIN; Phase 2: HNSW on embedding
```

### 22.3 Reliability & QA

```sql
CREATE TABLE incidents (
  id uuid PK DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL, -- NULL = platform incident
  source text NOT NULL CHECK (source IN ('sentinel','qa','manual','webhook')),
  severity text NOT NULL CHECK (severity IN ('p1','p2','p3','p4')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 200),
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','approved_fix','monitoring','closed')),
  root_cause text,
  agent_run_id uuid REFERENCES agent_runs(id),
  approval_id uuid,
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE incident_events (
  id uuid PK DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('detected','correlated','diagnosed','evidence','plan','approval','deploy','verified','closed')),
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE health_checks (
  id uuid PK DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  check_type text NOT NULL CHECK (check_type IN ('api','db','rls','job','webhook','payment','synthetic','storage')),
  target text NOT NULL, -- e.g. /api/donate, rpc:check_rate_limit, cron:purge-accounts
  status text NOT NULL CHECK (status IN ('pass','fail','degraded','unknown')),
  latency_ms int,
  details jsonb NOT NULL DEFAULT '{}',
  checked_at timestamptz NOT NULL DEFAULT now()
);
-- Index: (check_type, checked_at DESC), (tenant_id, checked_at DESC)
-- Retention: rolling 30d via pg_cron job (future)

CREATE TABLE deployments ( -- Vercel webhook ingestion (read-only for Sentinel)
  id uuid PK DEFAULT gen_random_uuid(),
  vercel_deployment_id text UNIQUE,
  commit_sha text,
  branch text,
  status text CHECK (status IN ('building','ready','error','canceled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 22.4 Human control plane

```sql
CREATE TABLE approvals (
  id uuid PK DEFAULT gen_random_uuid(),
  requested_by uuid REFERENCES auth.users(id),
  requested_by_agent_id uuid REFERENCES agents(id),
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (char_length(action) BETWEEN 3 AND 200), -- e.g. publish_post, deploy_fix
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}',
  risk text NOT NULL CHECK (risk IN ('low','medium','high','critical')),
  proposed_outcome jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired')),
  approver_id uuid REFERENCES auth.users(id),
  decided_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  audit_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Index: partial WHERE status='pending' ON (expires_at), (tenant_id)

CREATE TABLE agent_reports (
  id uuid PK DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  run_id uuid REFERENCES agent_runs(id),
  tenant_id uuid REFERENCES organizers(id) ON DELETE SET NULL,
  report_type text NOT NULL CHECK (report_type IN ('task','incident','daily','weekly','investigation')),
  summary text NOT NULL,
  sections jsonb NOT NULL DEFAULT '{}', -- { what_happened, investigation, findings, evidence, actions, remaining, needs_from_human, next_steps }
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Telegram identities (for Gateway interface)
CREATE TABLE telegram_identities (
  id uuid PK DEFAULT gen_random_uuid(),
  telegram_user_id bigint UNIQUE NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username text,
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 22.5 All tables: standard RLS pattern

Same idiom as `migration_88`: `ENABLE ROW LEVEL SECURITY; CREATE POLICY "Admins can ..." USING (EXISTS (SELECT 1 FROM profiles WHERE id=auth.uid() AND role='admin' AND status='active'))` + tenant-scoped SELECT for `tenant_id` holders via `is_entity_member`. All `INSERT/UPDATE/DELETE` via `service_role` in application code (no anon/authenticated writes). Each migration declares `COMMENT ON TABLE`.

### 22.6 Retention & indexing

* `agent_steps`, `health_checks`: high volume, rolling 30-90d retention via scheduled purge function (cosmology future: `pg_cron` job; until then Vercel cron `DELETE ... WHERE created_at < now()-interval`).
* `ai_tool_invocations`, `agent_runs`: default 90d per-tenant.
* `approvals`, `agent_reports`, `incidents`: indefinite (compliance).
* Composite indexes on every `(tenant_id, created_at DESC)` and `(agent_id, status)` query path.

---

## SECTION 23 — Infrastructure Changes Required

| Area | Change | Justification | Cost/complexity |
|---|---|---|---|
| **Database** | 5-6 new migration bundles (agent runtime, tool registry, knowledge, incidents, approvals) | §§22.1-22.4 | Local dev + SQL review; reversible via rollback twins |
| **Extensions** | `pg_trgm` (already in Supabase) for chunk retrieval in MVP; `vector` later | Knowledge retrieval MVP without external service | Free (`CREATE EXTENSION IF NOT EXISTS pg_trgm`) |
| **Vercel** | Add 2 crons: `agent-orchestrator` (lease `queued` tasks, ~every 30s or `* * * * *`) + `health-check` poller (every 5m). Add envs: `TELEGRAM_BOT_TOKEN`, `SENTRY_DSN`, `CRON_SECRET` (already exists). Webhook endpoint for Vercel deployment events (optional). | Queue + observability | Vercel crons are already used (daily-post/promotion-engine/purge-accounts) — no new infra |
| **Edge** | No change to `proxy.ts`Matcher unless Telegram webhook path is exempted (`/api/telegram/webhook` must bypass locale/auth check — add to bypass list `proxy.ts:286`) | Telegram webhooks are unsigned by Supabase auth | One-line change |
| **Error tracking** | Add `@sentry/nextjs` + `instrumentation.ts` DSN + Sentry project | Only way to give Sentinel real errors to reason about | Free tier likely sufficient initially |
| **Storage** | No new bucket; reports/artifacts reference existing `product-assets` private bucket or stay DB-native in `agent_reports.sections` | Avoid new bucket until artifact volume demands one | None |
| **CI/CD** | No change; new tables covered by existing hermetic test pattern (extend `lib/__tests__` with migration SQL asserts) | Preserve existing CI | None |

**No queue vendor** (BullMQ, QStash) until queued runs exceed ~1k/day and Vercel cron `FOR UPDATE SKIP LOCKED` leasing shows contention. This is an observed-scaling decision, not an upfront commitment.

---

## SECTION 24 — UI Changes Required (Discovery Only — No Redesign Yet)

### 24.1 What exists

* **Growth Studio** (`/admin/ai`) — dark violet-themed full-page workspace, chat + tool palette, completely AI-specialized. It occupies the admin AI surface today and must **remain** for content/marketing ops.
* **Admin shell** (`app/[locale]/admin/layout.tsx`) — server gate `requireAdmin()`, sidebar nav (businesses, events, fundraisers, AI, etc.).
* **Dashboard** (`/dashboard`) — tenant-aware, entity-role-filtered. Already complex (4 contexts + Entity vs Personal wiring).
* **Design system**: Zinc + orange (`--brand-700 #c2410c`), `rounded-xl`, `shadow-xs`, solid buttons, no gradients/glass. Gated by `.aldriva/design` + `docs/DESIGN-SYSTEM.md:1`.

### 24.2 Target IA (from the brief → Aldriva-grounded)

```
AI Studio                        ← rename/re-scope of existing /admin/ai
 ├── Command Center               ← Dylan + orchestrator status, global incidents, health
 ├── Workforce                    ← NEW — the operating platform surface
 │    ├── Agents                 ← registry + config + per-agent telemetry
 │    ├── Tasks                  ← queue, running, awaiting_approval, history
 │    ├── Approvals              ← human approval inbox + decisions + SLA
 │    ├── Reports                ← agent_reports + Sentinel digests
 │    └── Activity               ← unified ai_tool_invocations + agent_steps timeline
 ├── Growth Studio               ← EXISTING (move unchanged here as a tab)
 ├── Knowledge                   ← NEW — knowledge_documents CRUD + retrieval preview
 ├── Sentinel                    ← NEW — incidents, health_checks, deployments
 ├── QA                          ← NEW — sweeps, synthetic journeys, runs, coverage
 ├── Guard                       ← EXISTING rejections table + new policy view
 └── Settings                    ← ai_provider_configs + Telegram identities + limits
```

A **3D office** visualization is purely a presentation layer atop `agents + agent_runs + tasks` — it must never be the persistence model.

### 24.3 What to extend vs. rebuild

* Extend admin layout nav — add Workforce + Knowledge + Sentinel + QA entries under an `AI Studio` group. No second layout needed.
* Keep GrowthStudioClient intact — do not refactor its chat loop; the new `Gateway`/`Orchestrator` is a separate API + UI surface.
* New components must check `components/ui/` → `components/dashboard/` first (per AGENTS.md:84) and reuse `button`, `card`, `dialog`, `tabs`, `badge`, `stat-card`, `sidebar`.
* Visual review: every new page tested at 375/768/1024/1440 (per AGENTS.md:84).

### 24.4 Tenant-audience note

Workforce UI is **admin-then-entity** scoped: platform agents visible to `admin`; tenant agents (`agents.tenant_id NOT NULL`) visible to `entity_members` with appropriate role. This matches the existing `is_entity_member` RLS idiom.

---

## SECTION 25 — Migration Strategy (Safe, Reversible, No Applied-Migration Edits)

### 25.1 Immutable primitives (from AGENTS.md:41)

* `db/` is canonical (`migration_NNN_*.sql` + `_rollback` twin). Never put rollbacks in `supabase/migrations/`.
* `supabase/migrations/` mirrors with timestamped names; never alter applied migrations.
* Latest migration is **`138`** (`migration_138_business_moderation_resubmit_and_organizer_guard.sql`, written but not yet live-applied). Next free number is **`139`** (Phase 6 shifted by 138 contention — see `docs/CURRENT-STATE.md:5`). All workforce migrations start at **139**.

### 25.2 Rollout order (each step: migration pair + server code + tests + lint/tsc/build + doc update)

```
139  Agent registry + tool_definitions seed (22 existing tools)
     ↳ seeds from lib/ai/tools/* — no behavior change, registry is dormant
140  Knowledge Engine base (knowledge_documents + chunks, pg_trgm)
     ↳ no vector yet
141  Task / Run / Step / Memory (agent_tasks, agent_runs, agent_steps, agent_memory)
     ↳ gateway + orchestrator stub (sync L0 only, no background queue)
142  Approval + Report + Telegram identity
     ↳ approval gate + executive inbox
143  Reliability (incidents + incident_events + health_checks + deployments)
     ↳ Sentinel V1 ingestion + admin Sentinel pages (L0 only)
144  (Deferred) Background queue promotion (FOR UPDATE SKIP LOCKED leasing on agent_tasks)
     ↳ cron /api/cron/agent-orchestrator — only when L0-L1 proves value
145  (Deferred) QA harness (health_checks synthetic + playwright E2E scaffolding + QA agent)
     ↳ after Sentinel has errors to watch
146  (Deferred) pgvector + embeddings
     ↳ only when trigram recall fails on real knowledge corpus
```

Each migration is small enough to review, roll back individually, and land without a staging freeze.

### 25.3 Rollback must be real

* Every `_rollback` drops policies/triggers/indexes/tables children-first, then functions (`DEC-0024` correction model: drop triggers → tables → functions).
* No `CASCADE` on commercial tables; verify hermetically with the static SQL analyzer pattern.
* After each apply: `npx eslint <touched> && npx tsc --noEmit --skipLibCheck && npm run build && npm test`.

### 25.4 Data preservation

* Existing AI tables (`ai_content_items`, `ai_conversations`, `ai_guard_rejections`, `ai_provider_configs`, etc.) are **untouched** — new tables are additive.
* Knowledge ingestion touches only the new `knowledge_documents` table.
* `agents` SEED row for the existing autopublishing behavior is **not** materialized as an agent until the Approval engine proves the gate — to avoid auto-approving publishes under a new identity.

---

## SECTION 26 — Implementation Phases (Dependency-Ordered, Safe)

This sequence differs from the bare roadmap labels in the brief because the repository investigation demonstrated a tighter dependency order.

| Phase | Title | Dependencies | What it proves | Exit criteria |
|---|---|---|---|---|
| **Phase 0** | Architecture Discovery _(this report)_ | None | Factual map, no code | This document approved |
| **Phase 1** | **AI Foundation / Agent Registry** | Phase 0 | 22 tools cataloged in `tool_definitions`, per-agent ACLs exist, provider model stays provider-agnostic | `migration_139` live; `agents + agent_tools + tool_definitions` RLS verified hermetically; seed row for each existing tool; lint/tsc/build/tests green |
| **Phase 2** | **Knowledge Engine (trigram MVP)** | Phase 1 | Curated docs browsable, `pg_trgm` retrieval proves chunking+search without vector, tenant-scoped retrieval correct | `migration_140` live; seed ingests `docs/ARCHITECTURE.md` + `SECURITY.md` + DEC-0002/0003; retrieval test shows cross-tenant isolation |
| **Phase 3** | **Tool Registry + Permissions** | Phase 1 | Every new tool path checks `agent_tools.allowed`, risk/approval_required respected, tenant path still enforces `TenantToolContext` | `migration_139` polish (risk/approval fields tightened); `executeTenantTool` + Gateway both check registry |
| **Phase 4** | **Gateway + Orchestrator (sync)** | Phases 1-3 | `POST /api/ai/gateway` (admin gated) + `/api/ai/knowledge` retrieval + model call + tool loop + guard + report in one synchronous run; no background queue yet | Demo: Dylan drafts a task, Sentinel L0 answers “what happened?” from `agent_steps + ai_tool_invocations` |
| **Phase 5** | **Approval + Audit + Reporting** | Phase 4 | Any `high` risk tool defers to `approvals` with SLA/expiry, executives see `agent_reports` inbox, full timeline in Activity | Live `approvals` inbox with Telegram “approve/reject” action stub |
| **Phase 6** | **Sentinel (L0 - Observe & Report)** | Phases 4-5, Sentry | Incidents/health_checks ingestion, severity triage, diagnosis draft, evidence linking, notify via `createNotification` | Sentinel reports a real staging failure with evidence & notification — no code writes yet |
| **Phase 7** | **QA Agent (Harness + Sweeps)** | Phases 4-6 | Playwright suite on preview deploy, scheduled `qa-sweep` cron, synthetic journeys, payment replay on test keys, failures open Sentinel incidents | Red-green: QA sweep fails a canned checkout regression on staging → Sentinel incident |
| **Phase 8** | **Dylan / Executive Orchestration** | Phases 4-7 | Dylan routes Telegram commands → orchestrator → delegates to department agent → aggregates report → requests approval | CEO→Telegram: “Sentinel, what happened with the donation failures?” → grounded answer from `ai_tool_invocations + health_checks` |
| **Phase 9** | **Business Agents** (Marketing, Sales, Support, Finance, Compliance, Academy, CRM, Research, Creative, Social) | Phase 8 | Each new agent is **role + knowledge + tools + SOPs** layered on the shared runtime, not a parallel system | Second agent (e.g., Marketing) ships by registering `agents` row + knowledge docs + `agent_tools` ACL only |
| **Phase 10** | **Telegram / Voice Interfaces** | Phases 8-9 | Telegram Bot as executive command interface (signing + HMAC + user mapping + inbox), Voice as future adapter | Signed Telegram webhook ↔ Gateway ↔ Dylan round-trip on staging |
| **Phase 11** | Advanced Automation (autonomy escalation, L2/L3 gates) | Phases 8-10 | Controlled escalation to PR-opening Sentinel, QA-verified preview, human-deploy gate, rollback | First L3: Sentinel drafts PR on a feature branch, QA passes on preview, human merges |
| **Phase 12** | 3D Workforce Visualization | Phase 11 | Office visualization as pure presentation layer over `agents + agent_runs + tasks` | Optional — no backend dependency |

**Rule**: No later phase begins until its prerequisites pass the full gate — `npx eslint <touched> && npx tsc --noEmit && npm run build && npm test` — and the corresponding migration is live-verified as non-admin (per `docs/CURRENT-STATE.md` closing criteria).

---

## Cross-Cutting Appendix: Full Dependency Map (UI → DB)

Illustrative slices verified by file reads:

```
[Growth Studio] /admin/ai/page.tsx -> requireAdmin() -> GrowthStudioClient.tsx
    -> fetch("/api/ai/chat") -> lib/auth.ts:requireAdmin -> lib/ai/provider-factory.ts:getAIProvider
    -> lib/ai/tools-registry.ts:executeAITool -> SAFE_COLUMNS select -> screenToolResult()
    -> lib/ai/output-guard.ts:guardBeforeDisplay -> JSON to UI -> tool badge + verdict

[Tenant AI tool] Gateway -> resolveTenantContext(userId, organizerId) -> getEntityRole()
    -> requireToolContext(ctx)-> isValidToolContext(UUID_RE + userId check) -> serviceRole select eq('organizer_id', tenantId)
    -> SAFE_COLUMNS -> screenToolResult -> logToolInvocation(redacted) -> guardBeforeDisplay -> return

[Daily Post Cron] POST /api/cron/daily-post -> isAuthorizedCronRequest(CRON_SECRET, timingSafeEqual)
    -> getContentMode() -> generatePlatformContent() | generateDailyPost()
    -> callAIGenerateText() -> getAIProvider().generateText -> stripMarkdownFormatting -> guardBeforeDisplay
    -> recordAuditItem -> ai_content_items insert (service role, guard_result='pass')
    -> postToFacebook/postPhotoToFacebook (Graph API)

[Website Builder] app/dashboard/org/[id]/website/builder/page.tsx -> builderReducer (normalizeBlock + history)
    -> lib/actions/website-builder.ts:savePageDraft -> website_page_drafts (RLS tenant-isolated)
    -> publishPageDraft -> RPC publish_page_draft(p_expected_version) (SECURITY DEFINER, service_role only)
    -> proxy.ts checkWebsiteAccess() pre-stream 404 -> app/site/[slug]/[[...page]]/page.tsx -> BlockRenderer(await resolveEmbed)

[Supabase access] component -> lib/supabase.ts (anon, RLS) | server action -> lib/supabase-server.ts (cookie) | cron/webhook -> lib/supabase-admin.ts (service_role)
```

This graph becomes the seed for the Knowledge Engine's technical chunk set.

---

## Answer to the Final Question

> **“If we wanted Aldriva to become an AI-native company operating system, what is the smallest safe architectural foundation we should build first, using as much of the existing Aldriva infrastructure as possible?”**

**The smallest safe foundation is Phases 1-5 in §§25-26, in this order, and nothing beyond them until they prove green on staging:**

1. **`tool_definitions + agent_tools` registry** seeded from the 22 live tools (`migration_139`). Zero behavior change — but from this point every model permission is data-driven and auditable, not a prompt promise. Reuses `lib/ai/tools-registry.ts`, `SAFE_COLUMNS`, and the `scope` tier system already live.

2. **`agents + agent_versions`** (`migration_139`) — Dylan, Sentinel, and QA inserted initially as `L0` (read-only) identities with their `system_prompt` and `autonomy_level`. No background jobs, no publish capability. Proves the identity model without any chance of unsupervised writes.

3. **`knowledge_documents + knowledge_chunks` on `pg_trgm`** (`migration_140`) — keyword retrieval over a seeded subset (`docs/ARCHITECTURE.md`, `SECURITY.md`, DEC-0002/0003, `lib/ai/tools/**` headers, `proxy.ts` access-gate descriptions). Do **not** enable `pgvector` yet. This proves versioned, tenant-scoped, human-approved knowledge without the embedding pipeline cost.

4. **Gateway + Orchestrator (synchronous, L0-L1)** (`migration_141` + `app/api/ai/gateway/route.ts`) — single synchronous run path: orchestrator pulls knowledge, selects tools via `agent_tools` ACL, calls `getTenantAIProvider()` (already tenant-aware), loops through `toolCall()`, gates through `Input Guard → SAFE_COLUMNS → Output Guard`, and persists `agent_runs + agent_steps`. Rate-limited by the existing `articleAi` bucket. No queue, no crons. This proves the runtime with no ephemeral-state risk.

5. **`approvals + agent_reports + telegram_identities`** (`migration_142`) — the human gate that makes the difference between “AI workforce” and “uncontrolled agent”: any `risk >= high` tool defers to an `approvals` row (48h expiry, admin-only decision, audit_ref), executives see an `agent_reports` inbox via `createNotification()` + Resend, and the executive Telegram webhook is stubbed (HMAC, user mapping, same `requireAdmin`/`entity_members` checks). This proves that the system cannot take finance/publish/deploy actions without a human signature — in code, not in prose.

**Why this is minimal**: It creates *only* the non-deferrable joints of the target architecture (identity, retrieval, tool permission, orchestration, human gate, audit), each reusing a live Aldriva pattern, without dragging in the high-cost parts (vector search, external queues, browser farms, production mutations).

**What it deliberately defers** (and why): Sentinel write paths beyond reporting, QA browser fleet, `pgvector`, Inngest/QStash, 3D office, and any autonomous remediation — all wait until the L0-L1 foundation reports real platform value on staging. Sentinel V1 then plugs in as the first *consumer* of the same foundation: it reads the `agent_steps + ai_tool_invocations + ai_guard_rejections` that the foundation already emits.

**What “done” looks like for the foundation** (concrete gates, no subjectivity):

* `POST /api/ai/gateway` with a Dylan task (“Draft a triage of the last 10 guard rejections”) returns a synthesized `agent_report` grounded in `knowledge_documents` and `ai_tool_invocations`, with guard `pass` and `agent_steps` rows audited.
* An `approval-required` tool call by Sentinel returns an `approvals` row in `pending` and a notification in the admin inbox — and the tool does **not** execute.
* An executive approves via `/admin/ai/workforce/approvals` → the blocked run resumes and logs `approval_id + approver_id` immutably.
* Hermes: all new migrations pass the hermetic static-analysis harness (RLS/trigger invariants asserted against SQL), `npx tsc --noEmit` 0, `npm run build` compiled, `npm test` 688→+N green, and no new `supabase/service_role` leak into a client component (`components/` flagged).

**Build this first. Prove it. Then delegate to it.**

---

*— End of Discovery Report —*

