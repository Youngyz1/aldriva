# Phase 11: POS Integration Framework

## 1. Objective
Create an integration framework connecting physical Point of Sale (POS) systems (Square, Clover, Toast, Shopify POS) to Aldriva, unifying in-store and online sales, inventory, and receipts without replacing existing merchant hardware.

## 2. Scope
- Connector adapters for major POS systems (Square Webhook/OAuth, Clover REST API, Toast API, Shopify POS).
- Unified sales event ingestion normalizer (`lib/pos/sales-normalizer.ts`).
- Real-time inventory synchronization preventing online over-selling of in-store inventory.
- POS terminal management interface in the tenant dashboard (`/dashboard/org/[id]/pos`).

## 3. Out of Scope
- Custom proprietary hardware manufacturing.
- Direct credit card processing bypassing external POS merchant accounts.

## 4. Existing Dependencies
- Canonical entity model `organizers.id` and branch hierarchy (Phase 8).
- Connected accounts architecture (`migration_108`–`110`).
- Public API and webhook engine (Phases 9–10).

## 5. Tasks
- [ ] Task 11.1: Author `db/migration_132_pos_connectors.sql` (and rollback twin) for POS connections, terminal logs, and normalized sales.
- [ ] Task 11.2: Implement Square and Clover webhook receivers and event normalizers.
- [ ] Task 11.3: Build bi-directional inventory sync worker.
- [ ] Task 11.4: Build POS connection settings UI in tenant dashboard.
- [ ] Task 11.5: Author automated tests in `lib/__tests__/pos-framework.test.cjs` and append to `package.json`.

## 6. Acceptance Criteria
- [ ] In-store sales processed on a connected POS terminal automatically decrement Aldriva stock and appear in the unified sales dashboard.
- [ ] Online sales trigger stock adjustments on connected POS systems.
- [ ] All tests passing.

## 7. Current Status
**PLANNED**

## 8. Completed Work
- `connected_accounts` and `channel_assets` data models deployed in migration 108/109.

## 9. Remaining Work
- Tasks 11.1 through 11.5.

## 10. Known Issues
- None.

## 11. Verification Requirements
- `npm test` passes 100%.

## 12. Next Step
Execute after Phase 10 completion.
