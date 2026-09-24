# Phase 5: Products, Services & Menus

## 1. Objective
Expand the business catalog beyond digital marketplace goods to support physical products, bookable services, and structured restaurant/hospitality digital menus.

## 2. Scope
- Database models for `services`, `service_tiers`, `menu_sections`, and `menu_items`.
- Service catalog management in the tenant dashboard (`/dashboard/org/[id]/services`).
- Restaurant/cafe digital menu builder (`/dashboard/org/[id]/menu`) with dietary tags, allergens, and price modifiers.
- Public service and menu components for business websites (`ServiceCard`, `MenuGrid`).

## 3. Out of Scope
- Real-time booking slots and calendar assignment (deferred to Phase 7).
- POS inventory sync (deferred to Phase 11).

## 4. Existing Dependencies
- Canonical tenant entity `organizers.id`.
- Digital products subsystem (`migration_116`, `products` table).
- Website block system (Phase 3).

## 5. Tasks
- [x] Task 5.1: Draft `db/migration_136_services_and_menus.sql` (and rollback twin) for services and menus. — **COMPLETE 2026-09-24** (136, not 126; see §7 note)
- [x] Task 5.2: Implement server actions in `lib/actions/services.ts` and `lib/actions/menus.ts`. — **COMPLETE 2026-09-24**
- [x] Task 5.3: Build tenant dashboard management views for services and menus. — **COMPLETE 2026-09-24** (`/services` + `/services/[serviceId]` + `/menu`)
- [x] Task 5.4: Build public menu and service rendering components. — **COMPLETE 2026-09-24** (`services_embed`/`menu_embed` blocks + resolvers + BlockRenderer)
- [x] Task 5.5: Add automated tests in `lib/__tests__/services-and-menus.test.cjs` and append to `package.json`. — **COMPLETE 2026-09-24** (19 checks, 669/669)

## 6. Acceptance Criteria
- [x] Businesses can list structured services with duration and pricing.
- [x] Restaurants and cafes can publish digital QR-ready menus with sections and allergen badges (via `/site/[slug]` `menu_embed` block, QR-ready stable URL).
- [x] All tests passing. — **669/669 (36 suites)**

## 7. Current Status
**COMPLETE — Verified 2026-09-24. 669/669 tests passing, 0 TypeScript errors, 0 ESLint errors, build Pass.**

> **Note:** Original doc referenced `migration_126`; latest canonical is **136** (126 was `website_delete_rls_fix`, shipped 2026-09-17). No `service_categories` created (intentionally omitted per DEC-0018/0024). Prices are local `NUMERIC(12,2)` for Phase 5, not Stripe. `menu_items.organizer_id` denormalized with DB trigger enforcing `= menu_sections.organizer_id`.

## 8. Completed Work
- Digital products and shop catalog verified complete in Phase 0.
- **2026-09-24 Phase 5**: `db/migration_136_services_and_menus.sql` 4 tables (services, service_tiers, menu_sections, menu_items) with RLS (is_active public + is_entity_member tenant, editors INSERT/UPDATE, managers DELETE), indexes, GIN, position/price/duration bounds, dietary 7/allergens 6/modifiers JSONB, trigger `check_menu_item_organizer_match`; `lib/actions/services.ts` + `lib/actions/menus.ts` with `requireTenantContext`, `createSlug` retry, `sanitizeUrl`, bounded validation; dashboard `app/dashboard/org/[id]/services/*` + `menu/page.tsx` (ServiceForm MediaUploadField services, Move Up/Down, is_active Switch) + nav Services/Menu; website `services_embed`/`menu_embed` (limit 1..12, selected IDs UUID) + resolvers + `ServiceCard`/`MenuGrid` renderers; tests `services-and-menus.test.cjs` §1–§5.

## 9. Remaining Work
- None. Ready for Phase 6.

## 10. Known Issues
- None.

## 11. Verification Requirements (Actual Results 2026-09-24)
- `npm test` → 669/669 (36 suites). ✅
- `npx tsc --noEmit --skipLibCheck` → 0 errors. ✅
- `npx eslint` (phase5 surface) → 0 errors. ✅
- `npm run build` → compiled successfully. ✅

## 12. Next Step
Phase 6 — Unified Commerce (planned). Do NOT start until Phase 5 is documented (this file).
