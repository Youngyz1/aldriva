# Phase 14: External AI & Developer Ecosystem

---

## STATUS (verified 2026-10-20)

**NOT STARTED.** No developer portal, no OAuth app registry, no MCP server registration, no tool-invocation gateway for third parties. (VERIFIED — globs/greps empty; the only AI tooling is Aldriva's own internal registry under `lib/ai/tools/`.)

## What it is and why it matters (no prior context needed)
Phase 13 gives the *business* an Aldriva AI assistant. **Phase 14 opens the door the other way**: outside AI tools — a merchant's own ChatGPT-style assistant, an agency's automation, or a third-party MCP server — connect to a business's Aldriva data and act on it, with the business's explicit permission.

It means a developer directory/portal, OAuth-style consent so a business can authorize an external tool to read its orders or bookings, and a sandboxed gateway that meters and audits every call an outside tool makes.

**Why it matters:** it turns Aldriva's data into an ecosystem other builders extend, instead of a walled garden — the same "platform" step as Phase 9, but for AI agents. **Depends on Phase 9 (Public API), Phase 10 (Webhooks) and Phase 13 (the AI engine)**; it is the last phase because it needs all three.

## Prerequisites
- Phase **9** (API keys/scopes/OAuth foundations), Phase **10** (eventing), Phase **13** (AI engine + output guard).
- A trust/safety model for third-party tool scopes and audit logging (ADR-0002 guardrails must extend to external callers).

## Risks
- **Data exposure**: external agents reading tenant data is the highest-stakes permission model on the platform.
- **Abuse/billing**: unmetered tool calls can be weaponized or run up cost; needs per-call metering and rate limits.
- **Sandbox escape**: third-party code/tools must never reach raw SQL or another tenant (the internal registry already uses `SAFE_COLUMNS` allowlists — external tools must reuse that, not bypass it).
- Premature openness before Phases 9–13 are solid multiplies every earlier gap.

## Proposed first task
Author the external-apps migration (app registry, granted scopes, tool manifest) and a consent screen stub, then route **one** external read call through the existing output guard + allowlist, with an isolation/audit test.

## Migration numbers
Old plan names `migration_134_external_ai_apps` — **consumed** (actual 134 = store/ops work). **Assign at build time from the register.** Next free as of 2026-10-20: **186**.

---

## ORIGINAL PLAN (kept below; superseded by the STATUS block above where they disagree)

## 1. Objective
Establish an open developer ecosystem and marketplace for third-party AI agents, specialized tools, Model Context Protocol (MCP) servers, and custom business automation extensions.

## 2. Scope
- Developer portal for registering third-party AI extensions and MCP servers.
- Scoped OAuth 2.0 PKCE consent flows allowing tenants to authorize external AI agents.
- Sandboxed tool invocation gateway with rate limiting, per-call billing meters, and real-time audit logging.
- Third-party app directory within the Aldriva management dashboard.

## 3. Out of Scope
- Unsandboxed direct database connections for external AI agents.
- Bypassing ADR-0002 output validation guards.

## 4. Existing Dependencies
- Public Developer API and OAuth foundations (Phase 9).
- Outbound Webhooks engine (Phase 10).
- Aldriva AI Tenant Engine (Phase 13).

## 5. Tasks
- [ ] Task 14.1: Author `db/migration_134_external_ai_apps.sql` (and rollback twin) for third-party apps, permissions, and tool manifests.
- [ ] Task 14.2: Implement OAuth 2.0 authorization server (`/oauth/authorize`, `/oauth/token`).
- [ ] Task 14.3: Build MCP server connector and tool proxy with strict output screening.
- [ ] Task 14.4: Build App Directory UI in tenant dashboard.
- [ ] Task 14.5: Author automated tests in `lib/__tests__/external-ai-ecosystem.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] External developers can register MCP servers and provide custom tools to Aldriva tenants.
- [ ] Tenants can grant and revoke tool permissions securely.
- [ ] 100% of tests pass.

## 7. Current Status
**PLANNED**

## 8. Completed Work
- None.

## 9. Remaining Work
- Tasks 14.1 through 14.5.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute after Phase 9, Phase 10, and Phase 13 completion.
