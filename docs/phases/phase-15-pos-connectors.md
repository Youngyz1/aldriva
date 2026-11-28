# Phase 15: POS Connectors (External POS Integrations)

---

## STATUS (2026-11-28)

**PLANNED - deferred after Native POS Phase 7.** No connector code, no connector migrations, no DB changes applied. This phase preserves the pre-DEC-0069 external POS integration plan as a later connector layer over Aldriva's native POS/order/inventory contracts.

## Relationship to Native POS

- Native POS is Phase 11 in the repo roadmap: [`docs/phases/phase-11-pos.md`](./phase-11-pos.md).
- DEC-0069 makes native POS the primary direction. External POS connectors are deferred until after native POS Phase 7 is usable.
- This doc keeps the old external-POS plan for future implementation; it does **not** authorize building connectors before native POS Phase 7 gates pass.

## What it is and why it matters

Many restaurants and shops already run an in-store **Point of Sale** (Square, Clover, Toast, Shopify POS) at the counter. Today Aldriva's online menu/orders and the shop's in-store till are **siloed**: selling an item at the counter doesn't reduce Aldriva stock, and an Aldriva online order doesn't reach the till.

**POS Integration** connects them: Aldriva listens to the POS's sales events, normalizes them into Aldriva's own order/inventory model, and (optionally) pushes online orders back to the POS. Result: one stock count, one sales picture, no overselling.

**Why it matters:** it removes a major adoption barrier for merchants with existing POS hardware. **Depends on Phase 9 (Public API) and Phase 10 (Webhooks)** for auth and event plumbing, and on Native POS contracts for normalized sale/inventory behavior.

## Prerequisites
- Phase **9** (API keys/scopes) and Phase **10** (webhooks) - connectors authenticate and receive events through these.
- Phase **11 Native POS** Phase 7 complete - connectors must map into Aldriva-native contracts, not invent a parallel model.
- A `pos_connections` (or equivalent) persistence/migration, designed at implementation time with current migration-number reservation rules.

## Key concepts
- **Connector/adapter**: a POS-specific module implementing a common interface (fetch sales, push order, map menu). One per provider (Square, Clover, �).
- **Normalization**: translating a Square "order" and a Clover "order" into one Aldriva shape so the rest of the app is POS-agnostic.
- **Idempotent sync**: processing the same POS event twice must not double-deduct stock or double-create an order. Deduplicate on the POS event/transaction id.
- **Reconciliation**: a periodic full compare (POS totals vs Aldriva) to catch missed events; source of truth rules must be explicit per field.

## Scope & impact
- **Touches**: `lib/pos/connectors/*` (dedicated connector module), webhook receivers under `app/api/webhooks/pos/connectors/`, an org settings "POS connections" UI under `app/dashboard/org/[id]/pos/connections/`, and inventory/order write paths (carefully, via existing stock/order services). Native POS paths in `docs/handoff/pos-design.md` §13 remain reserved for native POS.
- **Impacted areas**: **inventory accuracy** (a missed/double event desyncs stock - idempotency is critical); order ledger; reporting. High blast radius on stock.
- **DB**: a connection/config table (provider, merchant id, encrypted tokens, sync cursor, status) and an event-log/dedup table. Re-check migration numbers at implementation time; do not reuse historical planned numbers blindly.

## Planned tasks (deferred)

### 15.1 - Connector framework
- **Intent**: a provider-agnostic interface so adding a second POS doesn't redesign the first.
- **Files (expected)**: `lib/pos/connectors/connector.ts` (interface), `lib/pos/connectors/normalize.ts`, `lib/pos/connectors/sync.ts`.
- **Schema (expected)**: `pos_connections` (org/business, provider, credentials ref/encrypted, status, last_sync_at, cursor) - exact migration number assigned at implementation time.
- **Done when**: a fake "test" connector can be registered and run through the same code path a real one will use. Idempotency key = provider + external event id.

### 15.2 - Provider adapters (start with one)
- **Intent**: real sync with one POS first; prove the model before multiplying providers.
- **Files (expected)**: `lib/pos/connectors/providers/square.ts` (first), then clover/toast.
- **Done when**: connecting a sandbox Square account pulls sales and reflects them in Aldriva inventory/orders; re-delivering the same webhook does nothing (idempotent).

### 15.3 - Inventory & order sync
- **Intent**: keep stock truthful across channels.
- **Work**: POS sale -> decrement Aldriva stock via the authoritative inventory write path; Aldriva online order -> (optional) push to POS; conflict/reconciliation rules documented. Never bypass stock-movement invariants.
- **Done when**: an in-store sale reduces online-available stock within the sync window; no double-decrement on retries.

### 15.4 - POS management UI
- **Intent**: an org connects/disconnects a POS and sees sync health.
- **Files (expected)**: `app/dashboard/org/[id]/pos/connections/page.tsx`, `components/pos/connectors/ConnectionCard.tsx`.
- **Done when**: connect, test-connection, view last sync/errors, disconnect; tokens never shown back to the client after save.

### 15.5 - Verification
- **Done when**: sandbox end-to-end for one provider; idempotency proven by replay; stock never goes negative from a sync race (coordinate with inventory locking rules); credentials stored encrypted/never logged. `npm run build` + `npm test` clean.

## Risks to watch
- **Stock desync/double-deduction** - the worst failure. Idempotent event ids + reconciliation job + alerts on drift.
- **Credential security** - POS tokens are high-value; encrypt at rest, never log, least scope.
- **Provider API quirks/rate limits** - backoff, cursor-based incremental sync, and a manual "resync" button.
- **Source-of-truth conflicts** - decide per field (price, stock) who wins; document it, don't leave it implicit.

## Handoff notes (fill in when this phase is worked on)
- **Implemented / partial / not yet**:
- **Provider(s) live + sandbox details**:
- **Sync/idempotency/reconciliation rules**:
- **Migrations + env vars**:
- **Security review**: credential storage, webhook verification, idempotency.
- **Verification**: replay test, stock-race test, build/tests.
- **Open risks / next agent**:
