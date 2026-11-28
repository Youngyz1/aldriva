# Phase 11: Native POS

---

## STATUS (2026-11-28)

**PLANNED - docs/design only.** No POS code, no POS migrations, no DB changes applied. This phase doc is the repo roadmap entry; the authoritative design baseline is [`docs/handoff/pos-design.md`](../handoff/pos-design.md) (v4.3, owner-approved baseline 2026-11-28).

## Naming (important)

- **Repo roadmap phase:** "Phase 11: Native POS" (this document).
- **POS internal build phases:** 0-8 inside the native POS program (see build order below). Do not confuse repo Phase 11 with internal POS Phase 0-8.

## What it is and why it matters

Aldriva Native POS is a first-party point-of-sale for in-person sales across all Aldriva business types. It reuses Aldriva's existing tenant, staff/permissions, inventory, orders/kitchen, customer, and payment systems instead of creating parallel sources of truth. The old external-POS integration plan (Square/Clover/Toast/Shopify POS) is deferred to [`docs/phases/phase-15-pos-connectors.md`](./phase-15-pos-connectors.md).

## Goals

- Sell in person with the same business, staff, inventory, customer, and reporting foundations Aldriva already uses.
- Keep `inventory_*` as the only stock authority; POS stock writes happen in the same transaction as the sale.
- Support all Aldriva business types from first release, with business-type capabilities determining which POS features appear.
- Support worldwide per-business currency with integer minor units and ISO 4217 currency codes; no hard-coded currency/symbol/decimals.
- Support offline-first first release with idempotency keys/local queue designed in from the first sale function.
- Support tender abstraction now (cash, card_external, card_stripe, mobile_money, crypto, other) while deferring unverified providers.
- Produce receipts/printing flows (ESC/POS USB, ESC/POS Bluetooth, browser print) with branding aligned to `DESIGN.md`.

## Owner decisions summary

Authoritative detail lives in [`docs/handoff/pos-design.md`](../handoff/pos-design.md). Do not duplicate it here; this section is a short index.

- **Sale model:** Option A dedicated `pos_*` tables; existing `orders` unchanged; no second stock system.
- **Inventory:** `inventory_*` only stock authority; `products.stock_quantity` never written by POS; POS/supply use approved core/wrapper inventory movement model.
- **Money/tax:** integer minor units + ISO 4217 on every money row; per-business currency; no conversion in v1; per-line half-up rounding; tax per sale line; `prices_include_tax` per business; sale-level discounts out of v1.
- **Offline:** offline in first release; Decision A for insufficient stock at sync (record sale, do not apply stock movement, `stock_applied=false`, anomaly+review; no negative stock). Offline permission revocation accepts+flags completed offline sales and blocks privileged actions after sync.
- **Void/refund:** owner decision 2026-11-28 - full void restocks every line with `stock_applied=true` via `pos_void` through core in same lock order; `stock_applied=false` never restocked; partial returns go through refund path.
- **Dine-in:** Option 1 - POS sale + kitchen `orders` row in one DB transaction, no compensation; kitchen row `source='pos'`, excluded from sales reports by enforced shared sales view, no own payment.
- **Printing:** ESC/POS USB, ESC/POS Bluetooth, browser print. Staff see own POS view; managers see all with separate permissions.
- **Tender:** tender layer now, providers later; mobile money deferred/unverified; crypto tender exists but hidden in POS UI until verified.
- **Migrations:** `db/` canonical with fail-closed rollback + verification; hand-applied; forward mirrored byte-identical to `supabase/migrations` in migration-number order (DEC-0067); rollback/verification never mirrored.

## Migration allocation

| Number | Purpose | Status |
|---:|---|---|
| 274-279 | Held by other agents | Not ours; do not use |
| 280 | Function grant hardening | **Taken** by `security/function-grants` (`db/migration_280_function_grant_hardening.sql`, commit `b2123a3f0`, not applied). REVOKE/GRANT on four named functions (`check_email_pending_deletion` 95/96, `reserve_seats_atomic` 181/182, `assign_seat_to_invitation_atomic` 187/188, `ensure_business_organizer` 274/275) PLUS CREATE OR REPLACE on `reserve_seats_atomic` (101) and `ensure_business_organizer` (196); no dynamic loop over `pg_proc`; does not touch `inventory_apply_movement` |
| 281 | Shared prerequisite: `staff_permissions.domain` CHECK expansion (`supply,pos,loyalty`) + `inventory_apply_movement` 9-arg reference-aware core/wrapper model | **Applied by hand on staging 2026-11-28** (owner-verified: verification 27/27, role proof 30/30 rolled back); mirror `supabase/migrations/20261127130000_migration_281_pos_prerequisites.sql`; spec in `docs/handoff/pos-design.md` |
| 282-286 | Supply chain migrations | PROPOSED, awaiting owner confirmation; not drafted; 281 is done; see `docs/handoff/supply-design.md` |
| 287+ | Native POS migrations | PROPOSED, awaiting owner confirmation; not drafted; starts with POS Phase 1 |

## Build order (POS internal phases 0-8)

**Prerequisite gate (before POS Phase 1): Migration 281** (applied on staging 2026-11-28) - shared prerequisite (`staff_permissions.domain` CHECK expansion for `supply,pos,loyalty` + `inventory_apply_movement` 9-arg core/wrapper replacement). 281 is **not** a POS build phase; it is a prerequisite gate that must land (and be verified/rolled-back safely) before POS Phase 1. Supply migrations 282-286 (proposed) remain reserved for supply; suppliers stay in POS Phase 6.

| POS phase | Name | Depends on | Gate summary |
|---:|---|---|---|
| 0 | Design approval | Owner approval | Docs/design baseline approved; no code/migrations |
| 1 | Sellable-to-inventory link, money helper, spreadsheet import | Phase 0, **Migration 281 prerequisite gate** | Sellable mapping, money/tax helpers, import flow defined; full DDL/RLS approved before migrations |
| 2 | POS core: registers, shifts, atomic idempotent sale function, cash, receipt, staff and manager views | Phase 1 | Registers/shifts/sale/receipt/cash flows; atomic idempotent sale function; staff own view and manager all view |
| 3 | Split payment, tender layer, held orders, customers, three printing drivers | Phase 2 | Tender abstraction; split/held orders; customers; ESC/POS USB, ESC/POS Bluetooth, browser print |
| 4 | Refunds, voids, reports, CSV, X/Z | Phase 3 | Refund/void rules; reports; CSV export; X/Z cash reports; append-only audit |
| 5 | Loyalty ledger | Phase 4 | Loyalty ledger/accounts only as approved; no earn/redeem rules beyond approved scope |
| 6 | Suppliers, purchase orders, receiving | Phase 4, **Migration 281 prerequisite gate**; supply migrations 282-286 proposed | Suppliers/PO/receiving; supply stays here (not before POS Phase 1) |
| 7 | Offline | Phases 2-4 | Offline queue/sync/review; Decision A anomalies; provisional receipts; permission-revocation handling |
| 8 | External connectors | Phase 7 | Separate connectors phase doc; not part of native POS first release |

Offline idempotency keys and the local-queue contract are designed in Phase 2 with the atomic sale function; Phase 7 completes the offline work.

## Gate before each implementation phase

- `npm ci` (no node_modules junction in fresh worktree)
- `npx next typegen`
- `npx eslint <touched files>`
- `npx tsc --noEmit`
- "use server" export check where relevant
- `npm run build`
- `npm test` against baseline; new tests registered in `test-files.json`
- en/fr key parity, zero duplicates
- Before each phase migration is written: full DDL/RLS for that phase in the design doc and owner approval

## Risks / open items (must resolve before relevant phase)

- Paid-ins/cash drops modeled in v1?
- E.164 library/country-default mapping for customers.
- Tested Bluetooth printer model list.
- Fiscal/e-invoicing jurisdiction scope (UNVERIFIED).
- Offline dine-in caps/hours parity with web order-submit.
- Exact loyalty earn/redeem rules/expiry (v1 recommended none).

## References

- [`docs/handoff/pos-design.md`](../handoff/pos-design.md) - authoritative design baseline
- [`docs/handoff/pos-aldriva-recon.md`](../handoff/pos-aldriva-recon.md) - Aldriva recon
- [`docs/handoff/pos-olgax-analysis.md`](../handoff/pos-olgax-analysis.md) - Olgax analysis
- [`docs/phases/phase-15-pos-connectors.md`](./phase-15-pos-connectors.md) - deferred external connectors
- [`docs/DECISIONS.md`](../DECISIONS.md) - DEC-0069, DEC-0008 status
