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
- [ ] Task 5.1: Draft `db/migration_126_services_and_menus.sql` (and rollback twin) for services and menus.
- [ ] Task 5.2: Implement server actions in `lib/actions/services.ts` and `lib/actions/menus.ts`.
- [ ] Task 5.3: Build tenant dashboard management views for services and menus.
- [ ] Task 5.4: Build public menu and service rendering components.
- [ ] Task 5.5: Add automated tests in `lib/__tests__/services-and-menus.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] Businesses can list structured services with duration and pricing.
- [ ] Restaurants and cafes can publish digital QR-ready menus with sections and allergen badges.
- [ ] All tests passing.

## 7. Current Status
**PLANNED**

## 8. Completed Work
- Digital products and shop catalog verified complete in Phase 0.

## 9. Remaining Work
- Tasks 5.1 through 5.5.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute after Phase 4 completion.
