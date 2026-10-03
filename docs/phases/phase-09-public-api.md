# Phase 9: Public Developer API

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
