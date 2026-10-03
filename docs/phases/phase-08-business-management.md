# Phase 8: Business Management ERP

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
