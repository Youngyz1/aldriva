# Phase 14: External AI & Developer Ecosystem

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
