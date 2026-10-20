# Phase 8: Business Management ERP

---

## STATUS (verified 2026-10-20)

Branches are **built**; shifts, rosters, inventory, and cross-branch reporting are **not built**.

### Built
- `db/migration_132_business_type_and_branches.sql` + rollback — `businesses.business_type` and the `business_branches` table (1:N, branches belong to Business). (VERIFIED — file exists, header comments confirm.)
- `lib/actions/business-branches.ts`; dashboard `app/dashboard/businesses/[id]/branches/`. (VERIFIED — files exist.)
- Branch address surfaces on the public site via the website layer. (VERIFIED — `lib/website-v2`.)

### Partly built
- **Branch-level permissions/selector** are implicitly handled through the tenant `entity_members` model; there is no dedicated branch-scoped permission layer. (INFERRED — no branch-permission code found.)

### Not built (NOT FOUND — `db/`, `lib/`, `app/`)
- Staff **shifts / rosters** — no shift/roster migrations or UI (the only `workforce`/`stage` migrations are the AI workforce, unrelated). (VERIFIED — `ls db | grep shift|roster` empty.)
- **Inventory** movement tracking + low-stock alerts. (VERIFIED NOT FOUND — no inventory tables; the app has product stock fields only.)
- **Cross-branch / consolidated analytics** beyond the current per-org analytics stub. (VERIFIED — `app/dashboard/analytics/page.tsx` renders "Detailed charts are coming soon".)
- **Supplier management.** (VERIFIED NOT FOUND.)

### Overlap with courier/driver management (Phase 6 kitchen workstream)
- The kitchen/delivery workstream (migration 185, `docs/phases/phase-kitchen-delivery.md`) introduces `business_workers` with roles `cook`/`courier` and per-kitchen scoping. This is **staff-like** data but is delivery-operations, not Phase-8 ERP.
- **Owner to confirm:** whether courier/driver records should later be unified with Phase-8 staff rosters, or kept separate. (INFERRED — model decision, both are plausible.)

### Known bugs / risks
- Planned numbering (`migration_129_branches_and_inventory`) is **consumed** — actual 129 is website drafts. Assign at build time from the register. (VERIFIED.)

### Test coverage
- Branches covered indirectly by website/entity suites; no dedicated `business-management.test.cjs` (planned name). (VERIFIED NOT FOUND for that file.)

### Continue from here
1. Decide the courier/staff unification question above (owner).
2. Build shift scheduling + roster management (new migration from the register).
3. Build inventory tracking + low-stock alerts.
4. Build the consolidated cross-branch analytics dashboard (replacing the analytics stub).
5. Renumber via the register — do not use 129.

---

## ORIGINAL PLAN (kept below; superseded by the STATUS block above where they disagree)

## 1. Objective
Build the comprehensive operational business management suite for multi-branch organizations, staff scheduling, inventory alerts, supplier management, and centralized financial reporting.

## 2. Scope
- Multi-branch hierarchy (`business_branches`) linked to the tenant entity.
- Staff shift scheduling, role-based branch permissions, and activity logs.
- Low-stock alerts and inventory movement tracking.
- Consolidated multi-channel analytics (online sales, event revenue, service bookings).

## 3. Out of Scope
- Direct payroll processing / bank wires.
- External accounting software sync (deferred to Phase 14).

## 4. Existing Dependencies
- Canonical tenant entity `organizers.id`.
- RBAC model `entity_members` (`lib/entity-auth.ts`).
- Commerce and booking transaction records (Phases 5–7).

## 5. Tasks
- [ ] Task 8.1: Author `db/migration_129_branches_and_inventory.sql` (and rollback twin).
- [ ] Task 8.2: Build branch selector and branch-level permission guards.
- [ ] Task 8.3: Build staff scheduling and shift manager interface.
- [ ] Task 8.4: Build inventory tracking and low-stock alert dispatcher.
- [ ] Task 8.5: Build executive financial analytics dashboard.
- [ ] Task 8.6: Author automated tests in `lib/__tests__/business-management.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] Multi-location businesses can partition inventory, staff, and bookings by branch.
- [ ] Consolidated analytics accurately aggregate revenue across all branches.
- [ ] All tests passing.

## 7. Current Status
**PLANNED**

## 8. Completed Work
- Entity membership RBAC foundations verified in Phase 0.

## 9. Remaining Work
- Tasks 8.1 through 8.6.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute after Phase 7 completion.
