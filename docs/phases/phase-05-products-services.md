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
- [x] Task 5.5: Add automated tests in `lib/__tests__/services-and-menus.test.cjs` and append to `package.json`. — **COMPLETE 2026-09-24** (26 checks, 676/676)

## 6. Acceptance Criteria
- [x] Businesses can list structured services with duration and pricing. — via `services` table + dashboard `/services` (ServicesManager with Move Up/Down + delete ConfirmDialog + visibility) — **DONE**
- [x] Restaurants and cafes can publish digital QR-ready menus with sections and allergen badges — via `menu_sections`/`menu_items` (dietary/allergens/modifiers) + dashboard `/menu` (MenuManager with section/item create/edit/delete/move + ModifiersEditor) + public `menu_embed` block (allergen/dietary badges, featured) — **DONE** (QR is stable `/site/[slug]` page with Menu block, no QR generation)
- [x] All tests passing. — **676/676 (36 suites) hermetic; live DB constraints 23514 verified, RLS/trigger not yet non-admin tested**

## 6b. Known Issues (2026-09-24)
- Prices in `app/dashboard/org/[id]/services/page.tsx` and `components/site/blocks/BlockRenderer.tsx` hardcoded `$` — `TODO: multi-currency not in Phase 5`.
- `showInactive` removed from `services_embed`/`menu_embed` (was ignored by resolvers; prefer removal).
- Live RLS and `check_menu_item_organizer_match` trigger (23503) not yet exercised as non-admin user.
- QR generation out of scope; menu published via Menu block in website builder.

## 7. Current Status
**PARTIAL — SCHEMA + ACTIONS + PUBLIC + ADMIN UI DONE; LIVE VERIFICATION OPEN (2026-09-24)**

Applied live 2026-09-24: corrected 136 (renamed enum constraints, `menu_modifiers_valid` function, removed UNIQUE position). Valid inserts and bad dietary/modifier 23514 verified live; RLS/trigger not yet non-admin tested. Admin UI now complete (sections/items/tiers with Move Up/Down + ConfirmDialog, role-aware).

> **Note:** Original doc referenced `migration_126`; latest canonical is **136** (126 was `website_delete_rls_fix`, shipped 2026-09-17). No `service_categories` created (intentionally omitted per DEC-0018/0024). Prices are local `NUMERIC(12,2)` for Phase 5, not Stripe. `menu_items.organizer_id` denormalized with DB trigger enforcing `= menu_sections.organizer_id`.

## 8. Completed Work
- Digital products and shop catalog verified complete in Phase 0.
- **2026-09-24 Phase 5**: `db/migration_136_services_and_menus.sql` 4 tables (services, service_tiers, menu_sections, menu_items) with RLS (is_active public + is_entity_member tenant, editors INSERT/UPDATE, managers DELETE), indexes, GIN, position/price/duration bounds, dietary 7/allergens 6/modifiers JSONB, trigger `check_menu_item_organizer_match`; `lib/actions/services.ts` + `lib/actions/menus.ts` with `requireTenantContext`, `createSlug` race-safe, `sanitizeUrl`, bounded validation, `reorderMenuSections`/`reorderMenuItems`/`reorderServiceTiers` (ownership BEFORE write, duplicate/length guards, bail on failure); dashboard `app/dashboard/org/[id]/services/*` (ServicesManager with Move Up/Down + ConfirmDialog delete) + `services/[serviceId]/page.tsx` (TierManager with create/edit/delete/move, zero tiers valid) + `menu/page.tsx` (MenuManager with section create/edit/delete/move + item create/edit/delete/move + ModifiersEditor max 12 + dietary/allergen checkboxes + MediaUploadField menu) + nav Services/Menu; role-aware UI via `checkTenantAccess` (viewers/finance read-only, editors no delete, owner/admin/manager full); website `services_embed`/`menu_embed` + `ServicesEmbedBlockRenderer`/`MenuEmbedBlockRenderer` inline; tests `services-and-menus.test.cjs` §1–§5 + reorder/admin UI.

## 9. Remaining Work
- Live verification: exercise RLS as viewer/editor and `check_menu_item_organizer_match` 23503 as non-admin user (not done).
- Multi-currency: hardcoded `$` in dashboard `services/page.tsx` and `BlockRenderer` remains `TODO: multi-currency not in Phase 5`.
- QR generation: out of scope; menu is published via adding a Menu block in the website builder (`/site/[slug]` page), no QR subsystem.

## 10. Known Issues
- Live RLS and organizer-match trigger not yet exercised as non-admin user.
- Prices hardcoded `$` (TODO).
- QR generation out of scope.

## 11. Verification Requirements (Actual Results 2026-09-24 post admin UI)
- `npm test` → 676/676 (36 suites). ✅
- `npx tsc --noEmit --skipLibCheck` → 0 errors. ✅
- `npx eslint` (phase5 surface: `lib/actions/services.ts`, `lib/actions/menus.ts`, `components/dashboard/menu/*`, `components/dashboard/services/*`, `app/dashboard/org/[id]/services/*`, `app/dashboard/org/[id]/menu/*`) → 0 errors. ✅
- `npm run build` → compiled successfully. ✅

## 12. Next Step
Phase 6 — Unified Commerce (planned). Do NOT start until Phase 5 is documented (this file).

## 13. PSD Stage 3 Store template integration (2026-10-16)
- The public V2 Store template reads the existing `products` catalog through businesses linked to the website tenant; this adds no product schema or migration.
- Site-local product detail routes reuse the existing Stripe price resolver and `/api/checkout/product`. Buy now stays behind the online-payment feature gate, in-stock state, available Stripe price, and exact site/Stripe currency match. The buyer form sends name, email, and quantity only.
- Trust and fulfilment notes use existing bounded `website_content.content.template_extras` values. Empty fields and owner-empty testimonials are hidden. No fulfillment promise is generated by the template.
- The existing checkout success/cancel URLs still point to platform `/products` paths, so the post-checkout return flow is not site-local in this stage.
- Verification on 2026-10-16: Store-focused suites 95/95, full registered tests 2,293/2,293 (five absent seating/venue test paths excluded), `npx tsc --noEmit`, and touched-file ESLint passed. No browser QA, live database verification, live Stripe flow, migration, or database write was performed.

## 14. Menu option groups Phase 1 (2026-10-20; authored, migration not applied)

- Migration 182 adds reusable organizer-scoped `menu_option_groups` and `menu_options`, plus `menu_item_option_groups` assignments with per-item hidden IDs and price overrides. `menu_items.options_source` defaults to `json` and selects JSON or normalized options; normalized items with no assignments show no options. It is additive; `menu_items.option_groups` and legacy `modifiers` remain untouched. Forward SQL is mirrored byte-for-byte under `supabase/migrations/20261019000000_migration_182_menu_option_groups.sql`; rollback drops the marker and Phase 1 objects.
- Database checks/triggers enforce organizer matches, required selection minimums, at most 8 groups per item, at most 20 options per group, at most one variant group and one default per variant group, hidden/override references within the assigned group, and bounded price/quantity/allergen fields. No security-definer function was added.
- RLS: public group reads require an active group assigned to an active menu item and section; public assignment reads require active item and section; public option reads require an available option in an active group assigned to an active item and section. Owner/admin/manager/editor roles can create/update; owner/admin/manager and active platform admins can delete. Editors retain read access but have no DELETE because the Phase 2 dashboard is not present.
- The resolver uses the source marker; checkout reloads and validates explicit customer selections and prices on the server. The server never applies defaults. The storefront preselects one marked variant or the first visible option, and only preselects zero-price add-on defaults. Paid add-on defaults wait for the Phase 2 dashboard. Variant groups hide `promo_price` and its strikethrough. Legacy order snapshots still render when new group fields are absent.
- The backfill is deterministic and opt-in; `--apply` marks only items it migrated normalized. `--verify` is tested on a JSON mirror of the staging seed and a separate suite fixture. Public embeds and order-submit fall back to JSON and log once when the new schema is missing. Staging seed and cleanup files were authored but not run.
- Phase 2 backlog: deleting an option must remove its ID from `hidden_option_ids` and `price_overrides` on every assignment, or relax the trigger to validate only IDs changed by the current write.
- Verification: final revised Checkpoint B test, TypeScript, ESLint, and diff-check results are recorded in `docs/CURRENT-STATE.md`. No database access or migration execution occurred.
