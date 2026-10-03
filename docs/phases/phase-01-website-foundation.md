# Phase 1: Business Website Foundation

## 1. Objective
Establish the database models, tenant configuration, and API services required to support multi-page customizable business websites anchored to the canonical `organizers.id` entity.

## 2. Scope
- Design and deploy migration for website configuration tables (`tenant_websites`, `website_pages`, `website_navigation`).
- Link website records to `organizers.id` with `entity_members` management RLS policies.
- Implement server-side CRUD services in `lib/actions/website.ts` for managing pages, layout configurations, and SEO metadata.
- Provide dashboard settings view for enabling/configuring the business website.

## 3. Out of Scope
- Visual drag-and-drop block builder (deferred to Phase 4).
- Custom domain routing & SSL proxy (deferred to Phase 12).
- E-commerce cart unification (deferred to Phase 6).

## 4. Existing Dependencies
- Canonical tenant entity `organizers` (`migration_48`, `migration_58`).
- RBAC model `entity_members` and `is_entity_member()` RPC (`migration_59`, `migration_62`).
- `lib/tenant-context.ts` for tenant resolution.

## 5. Tasks
- [x] Task 1.1: Author `db/migration_125_tenant_websites.sql` (and rollback twin) defining `tenant_websites`, `website_pages`, and `website_navigation`.
- [x] Task 1.2: Migration workflow confirmed (`db/` canonical source; `supabase/migrations/` explicitly ignored).
- [x] Task 1.3: Build server actions in `lib/actions/website.ts` and pure helpers in `lib/website-nav.ts` with entity role authorization (`ENTITY_ROLES_CONTENT_WRITE` / `ENTITY_ROLES_MANAGE`).
- [x] Task 1.4: Add unit and regression tests in `lib/__tests__/website-foundation.test.cjs` and append to `package.json`.
- [x] Task 1.5: Build dashboard configuration interface at `app/dashboard/org/[id]/website/page.tsx` and `WebsiteSettingsClient.tsx`.
- [x] Task 1.6: Author `db/migration_126_website_delete_rls_fix.sql` (and rollback twin) segregating destructive DELETE permissions away from `editor` roles (`DEC-0011`).

## 6. Acceptance Criteria
- [x] A tenant manager can create, update, and reorder website pages.
- [x] RLS prevents unauthorized users from altering tenant website structures.
- [x] 100% of test suites pass including new website foundation tests (304/304 tests passing).

## 7. Current Status
**COMPLETE (SHIPPED & VERIFIED)**

## 8. Completed Work
- Authored canonical schema `db/migration_125_tenant_websites.sql` and rollback twin `db/migration_125_tenant_websites_rollback.sql`.
- Authored RLS fix `db/migration_126_website_delete_rls_fix.sql` and rollback twin `db/migration_126_website_delete_rls_fix_rollback.sql`.
- Built server actions `getTenantWebsite`, `createTenantWebsite`, `updateTenantWebsite`, `createPage`, `updatePage`, `deletePage`, and `updateNavigation` in `lib/actions/website.ts`.
- Implemented pure navigation tree sanitization (`sanitizeNavOnPageDelete`, `sanitizeNavOnPageSlugChange`) in `lib/website-nav.ts`.
- Created full-featured organization dashboard configuration interface in `app/dashboard/org/[id]/website/`.
- Integrated Website route into the organization workspace sidebar navigation (`app/dashboard/org/[id]/org-nav-items.ts`).
- Created and registered unit/regression test suite in `lib/__tests__/website-foundation.test.cjs`.
- Verified 0 TypeScript errors (`npx tsc --noEmit`), 0 ESLint errors (`npx eslint`), and 304/304 tests passing (`npm test`).

## 9. Remaining Work
- Next: **Phase 2: Public Website Rendering Engine** (`/site/[slug]` and subroutes).

## 10. Known Issues
- **Resolved**: Initial migration 125 used broad `FOR ALL` RLS policies which permitted `editor` role holders to delete websites, pages, and navigation trees. This was identified and resolved in `db/migration_126_website_delete_rls_fix.sql` (splitting `DELETE` to `owner`, `admin`, `manager` only) and application-layer checks in `lib/actions/website.ts` (`DEC-0011`).

## 11. Verification Requirements
- `npx tsc --noEmit` returns 0 errors (Verified).
- `npm test` passes all tests (304/304 passing, Verified).
- `npm run build` succeeds (Verified).

## 12. Next Step
Proceed to Phase 2: Public Website Rendering Engine (`docs/phases/phase-02-website-engine.md`).
