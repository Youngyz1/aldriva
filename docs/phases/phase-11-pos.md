# Phase 11: POS Integration Framework

---

## STATUS (verified 2026-10-20)

**NOT STARTED.** No `lib/pos*`, no POS routes, no `app/dashboard/org/[id]/pos`, no Square/Clover/Toast references anywhere in `*.ts`. (VERIFIED — globs/greps empty.) Docs consistently mark it PLANNED.

## What it is and why it matters (no prior context needed)
Many restaurants and shops already run an in-store **Point of Sale** (Square, Clover, Toast, Shopify POS) at the counter. Today Aldriva's online menu/orders and the shop's in-store till are **siloed**: selling an item at the counter doesn't reduce Aldriva stock, and an Aldriva online order doesn't reach the till.

**POS Integration** connects them: Aldriva listens to the POS's sales events, normalizes them into Aldriva's own order/inventory model, and (optionally) pushes online orders back to the POS. Result: one stock count, one sales picture, no overselling.

**Why it matters:** it removes the biggest reason a real restaurant would *not* adopt Aldriva ordering — double data entry. **Depends on Phase 9 (Public API) and Phase 10 (Webhooks)** for the auth and event plumbing.

## Prerequisites
- Phase **9** (API keys/scopes) and Phase **10** (webhooks) — the connectors are just API clients + webhook receivers.
- Phase **8** branch model (multi-location) for per-terminal mapping.

## Risks
- **Per-vendor API churn & OAuth complexity** (Square/Clover/Toast each differ) — high maintenance surface.
- **Inventory correctness**: bidirectional sync can fight itself (echo loops); needs idempotent, source-of-truth rules.
- **Scope creep**: hardware/terminal management can balloon; keep to software sync.

## Proposed first task
Author the POS-connections migration (connection record, terminal map, normalized-sales table) and one connector (Square) that receives a sale webhook and writes a normalized in-store sale — with an idempotency test.

## Migration numbers
Old plan names `migration_132_pos_connectors` — **consumed** (actual 132 = business types/branches). **Assign at build time from the register.** Next free as of 2026-10-20: **186**.

---

## ORIGINAL PLAN (kept below; superseded by the STATUS block above where they disagree)

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
