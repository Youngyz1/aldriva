# Phase 9: Public Developer API

---

## STATUS (verified 2026-10-20)

**NOT STARTED.** No `app/api/v1/` directory, no API-key table, no `lib/api-auth.ts`, no OpenAPI docs. (VERIFIED — globs/greps empty.) What exists today is an **internal** API (session-cookie protected, `app/api/`), which is a separate thing.

## What it is and why it matters (no prior context needed)
Right now, only Aldriva's own web pages can talk to Aldriva's data — a logged-in human with a browser session. There is **no way for an outside system** (a partner's booking tool, a merchant's ERP, a mobile app, an agency's dashboard) to read or write a tenant's data programmatically.

A **Public Developer API** changes that: businesses generate **API keys**, and external software calls versioned endpoints like `GET /v1/orders` or `POST /v1/products` with those keys. It includes **scopes** (a key can be read-only for orders), **rate limits** per key, **pagination**, **standard error formats**, and **OpenAPI/Swagger docs** so developers can self-serve.

**Why it matters:** it turns Aldriva from a closed website into a *platform* — the foundation other integrations (including our own POS sync and external AI tools) build on. **This is distinct from the mini-websites** (Phase 2): mini-websites are human-facing pages; the public API is machine-facing endpoints.

## Prerequisites
- Stable domain models for the resources to expose (Events, Products, Orders, Bookings — Bookings still partial, Phase 7).
- A decision on API-key storage/rotation policy (hashed keys, scopes).

## Risks
- **Tenant isolation**: an API key must never see another tenant's data — highest-risk area; needs the same RLS/scope discipline as the app.
- **Key leakage**: keys are long-lived credentials; must be hashed at rest and revocable.
- Starting it before Phase 7/8 settle could force breaking changes to exposed schemas.

## Proposed first task
Author the API-key migration (hashed keys + scopes) and `lib/api-auth.ts` (key verification + rate limiting), then expose **one** read-only endpoint (`GET /v1/events`) behind a scope, with a test proving cross-tenant isolation fails closed.

## Migration numbers
The old plan names `migration_130_api_keys`, which is **consumed** (actual 130 = website category). **Assign at build time from the register** (`docs/HANDOFF.md` §6 / `docs/DATABASE.md`). Next free number as of 2026-10-20: **186**.

---

## ORIGINAL PLAN (kept below; superseded by the STATUS block above where they disagree)

## 1. Objective
Design, build, and document the official versioned Aldriva Public Developer API (`/v1/*`), enabling external software developers, merchants, and third-party systems to securely query and manage tenant resources.

## 2. Scope
- Public API Gateway under `app/api/v1/` with API Key authentication (`X-Aldriva-Key`).
- Granular permission scopes (`events:read`, `events:write`, `products:read`, `orders:read`, `bookings:read`, `bookings:write`).
- Rate limiting per API key (tiered by tenant plan).
- Standardized REST response formats, pagination (`cursor`), and RFC 7807 problem details.
- OpenAPI 3.1 specification generation and interactive Swagger/Scalar documentation.

## 3. Out of Scope
- Outbound webhook delivery engine (deferred to Phase 10).
- Third-party OAuth 2.0 PKCE app marketplace (deferred to Phase 14).

## 4. Existing Dependencies
- Canonical entity model `organizers.id` and `lib/tenant-context.ts`.
- All core domains (Events, Fundraising, Products, Bookings, Business Management).

## 5. Tasks
- [ ] Task 9.1: Author `db/migration_130_api_keys.sql` (and rollback twin) for hashed API keys and scopes.
- [ ] Task 9.2: Build API key authentication and rate-limiting middleware in `lib/api-auth.ts`.
- [ ] Task 9.3: Implement `/v1/events`, `/v1/products`, `/v1/orders`, `/v1/bookings`, `/v1/branches` endpoints.
- [ ] Task 9.4: Build OpenAPI 3.1 schema generator and public developer documentation route.
- [ ] Task 9.5: Author automated tests in `lib/__tests__/public-api.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] External clients can authenticate via API key and perform scoped operations.
- [ ] Tenant data isolation is strictly preserved (an API key only accesses its own tenant's data).
- [ ] 100% of tests pass.

## 7. Current Status
**PLANNED**

## 8. Completed Work
- None.

## 9. Remaining Work
- Tasks 9.1 through 9.5.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute after Phase 8 completion.
