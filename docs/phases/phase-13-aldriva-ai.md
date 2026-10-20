# Phase 13: Aldriva AI Tenant Engine & Multi-Channel Assistants

---

## STATUS (verified 2026-10-20)

The doc's headline scope (WhatsApp/Instagram auto-responder, tenant assistant) is **not built**; instead a large **AI Operating System** (admin-only) was built out of the doc's original scope. Status: PARTIAL, built shape differs from plan.

### Built (the AI Operating System — out of the doc's original Phase-13 scope)
- AI gateway + chat with rate limiting: `app/api/ai/gateway/route.ts`, `app/api/ai/chat/route.ts`, `app/api/ai/conversations`, `app/api/ai/calendar`, `app/api/ai/synthesize-trends`. (VERIFIED — routes exist; `enforceRateLimit` wired.)
- Controlled tools with safe-column allowlists and output guard: `lib/ai/tools-registry.ts`, 22 tools under `lib/ai/tools/**` (incl. tenant-scoped `tenant-*`), `lib/ai/output-guard.ts` (ADR-0002), `app/admin/ai/rejections`. (VERIFIED — files exist; registry comment notes 22 tools.)
- Workforce/agents/sentinel/QA/background-exec/memory/studio: `lib/workforce/*`, `lib/exec/*`, `lib/qa/*`, `app/api/exec/*`, `app/admin/workforce/{agents,sentinel,incidents}`, studio chat. Migrations **139–168**. (VERIFIED — files + migrations exist.)
- Extensive registered test suites under `lib/ai/__tests__`, `lib/workforce/__tests__`, `lib/exec/__tests__`, `lib/qa/__tests__`. (VERIFIED — registered in `package.json`.)

### Partly built
- Admin-facing studio surfaces exist; **tenancy scoping of the assistant** is admin-only. (VERIFIED — tools classified tenant vs admin; no tenant chat route.)

### Not built (NOT FOUND)
- **WhatsApp Cloud API / Instagram Direct webhooks** `app/api/webhooks/meta/` (Tasks 13.1–13.2). (VERIFIED NOT FOUND — `app/api/webhooks/` has only `stripe` + `new-content`.)
- **Tenant AI assistant dashboard** `/dashboard/org/[id]/ai` (Task 13.4). (VERIFIED NOT FOUND — no such directory.)
- Auto-responder ingestion linking external handles to `customer_identities`. (VERIFIED NOT FOUND.)
- Outbound domain webhooks (Task 13.5 → depends on Phase 10). (VERIFIED NOT FOUND.)

### Known bugs / risks
- Doc tool count says "14 controlled tenant tools" but the registry comment states **22 existing AI tools** — count drift. (VERIFIED — reconcile on next edit.)
- Phase 14 depends on Phase 9+10+13; the messaging pieces need Phase 10's webhook engine.

### Test coverage
- Large registered suite set (AI/workforce/exec/qa). (VERIFIED — registered.)

### Continue from here
1. Build `app/api/webhooks/meta/` (WhatsApp/Instagram) + ingestion → `customer_identities`/`conversations` (Tasks 13.1–13.2). Needs Phase **10** (outbound webhooks) for symmetric eventing.
2. Build the tenant AI assistant/chat studio `/dashboard/org/[id]/ai` (Task 13.4), reusing the existing gateway + tools.
3. Reconcile the "14 vs 22 tools" count in §4.

---

## ORIGINAL PLAN (kept below; superseded by the STATUS block above where they disagree)

## 1. Objective
Expand Aldriva AI from administrative marketing generation into a multi-channel operational intelligence assistant, powering tenant customer support auto-responders, WhatsApp/Instagram messaging automations, and intelligent business analytics.

## 2. Scope
- Tenant-facing AI assistant interface in the dashboard (`/dashboard/org/[id]/ai`).
- Multi-channel conversational auto-responder for WhatsApp and Instagram Direct via `connected_accounts` and `channel_assets`.
- Expanded tenant tools: appointment lookup, product recommendations, customer history, and business FAQ answers.
- Compliance with standing ADR-0002 output guardrails, safe column projections, and rejection audit logging.

## 3. Out of Scope
- Unrestricted raw SQL query generation.
- Autonomous money movement or refund issuance without human confirmation.

## 4. Existing Dependencies
- Canonical tenant entity `organizers.id` and `lib/tenant-context.ts`.
- Multi-tenant AI foundations (`migration_108`–`115`, `connected_accounts`, `channel_assets`, `customer_identities`, `conversations`, `messages`, `ai_provider_configs`, `ai_tool_invocations`).
- 14 controlled tenant tools in `lib/ai/tools-registry.ts`.
- Output guard layer in `lib/ai/output-guard.ts` (ADR-0002).

## 5. Tasks
- [ ] Task 13.1: Build WhatsApp Cloud API and Instagram Direct webhook event handlers in `app/api/webhooks/meta/`.
- [ ] Task 13.2: Implement message ingestion pipeline linking external customer handles to `customer_identities` and `conversations`.
- [ ] Task 13.3: Implement tenant AI auto-responder engine with context retrieval and tool execution.
- [ ] Task 13.4: Build tenant AI configuration and chat studio in the dashboard.
- [ ] Task 13.5: Author automated tests in `lib/ai/__tests__/tenant-ai-messaging.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] Inbound customer inquiries on connected WhatsApp/Instagram channels receive accurate, grounded AI replies within seconds.
- [ ] All AI responses strictly pass `guardBeforeDisplay()` screening without PII or prompt leaks.
- [ ] Tool invocations are recorded in `ai_tool_invocations`.
- [ ] 100% of tests pass.

## 7. Current Status
**IN PROGRESS / FOUNDATION BUILT**

## 8. Completed Work
- Core LLM provider routing (`gemini-3.6-flash`, `openrouter`).
- 14 tenant-scoped controlled tools with strict safe-column projections.
- Application-layer output guard (PII, system prompt echoes, UUID checks) and audit tables (`ai_guard_rejections`).
- Meta Facebook Graph API automated publishing.

## 9. Remaining Work
- Tasks 13.1 through 13.5 (WhatsApp/Instagram live webhook wiring and dashboard assistant).

## 10. Known Issues
- `ai_content_items` does not update `published: true` after Facebook post (known open item in `docs/technical/aldriva-ai.md`).

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute multi-channel messaging wiring after Phase 8 / Phase 10 completion.
