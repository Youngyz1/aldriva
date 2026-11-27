# Supply / procurement — design brief

**Status:** PROPOSED. Design only. No code, no migrations authored or applied, nothing pushed.
**Worktree:** `C:/Users/Youngyz/aldriva-supply-design` (branch `docs/supply-design`, created from `origin/staging` @ `fb4358d38`).
**Base:** `staging` after PR #15 (migrations 231–269 merged). Main folder and the scan-codes workstream untouched.
**Date:** 2026-11-27.
**Deliverable:** this file only.

---

## 0. Starting position (verified in this worktree)

| Fact | Evidence |
|---|---|
| There is no supply domain | No file, table, route, nav entry or permission key contains `suppl*` except the item-type enum (audit of 2026-11-27) |
| The only "supply" is a label | `inventory_items.item_type` CHECK includes `'supply'` (`db/migration_268_inventory_foundation.sql:27,43`); nothing branches on it |
| Inventory is industry-independent | `capabilities: []`, `visibility: organizer-type/business` (`lib/dashboard/modules.ts:387–404`) |
| The stock ledger already anticipates a source document | `inventory_movements.reference_type` + `reference_id` exist (`268:90–91`) and transfers populate them (`db/migration_269_inventory_transfers.sql:131–135`, `reference_type='transfer'`, shared `reference_id`) |
| …but the single writer cannot set them | `inventory_apply_movement()` takes 7 args and inserts no reference (`db/migration_269_inventory_transfers.sql:140–207`) |
| Stock writes are RPC-only | 268 grants `authenticated` only SELECT on balances/movements (`268:296–299`); only `inventory_apply_movement` writes |
| Money is untyped in inventory | `app/dashboard/org/[id]/inventory/[itemId]/ItemDetailClient.tsx:297` formats with `toLocaleString(..., { maximumFractionDigits: 4 })` and no currency |
| A canonical money formatter exists | `lib/money.ts` → `formatMoney()` (CFA ⇒ `FCFA 1 234`, 0 decimals; else `Intl`) |
| Businesses have no currency column | `businesses` select includes `country` but no `currency` (`app/dashboard/org/[id]/inventory/page.tsx:31`) |
| `staff_permissions.domain` is generated | `split_part(key,'.',1)` with a 17-value CHECK (`db/migration_235_permission_catalogue.sql:140–166`) |

**Register check (re-run, not trusted):** `git ls-tree` over every local and remote branch finds 270/271 on `backup/organizer-ai-before-handoff` and `feature/organizer-ai-assistant`, 272 on `feature/organizer-ai-assistant` (not applied), 273 on `feature/customer-comms-foundation`. Nothing above 269 on `staging`. **Next free number is 274.** This design uses 274–278 and touches no organizer-ai or comms branch.

---

## 1. Decisions for the owner

### D1 — Retail double ledger (recommendation: **B**)

`products.stock_quantity` (`db/migration_37_products.sql:31`, decremented by the payment webhook) and `inventory_items` are unrelated. A shop can hold the same physical goods twice.

| | **A. Inventory authoritative, `stock_quantity` becomes a cache** | **B. Nullable link, webhook routes through inventory when linked** | **C. Leave separate, document the risk** |
|---|---|---|---|
| Migration impact | Add `products.inventory_item_id` (or reverse), backfill by name/SKU (unreliable), then **every** product read path that trusts `stock_quantity` must read inventory; `stock_quantity` becomes a trigger-maintained mirror | One nullable FK + partial index; no backfill; nothing else changes | None (documentation only) |
| Webhook change | Webhook stops writing `stock_quantity`; writes inventory for **all** products → every business suddenly needs a location; digital/unlimited products (`stock_quantity IS NULL`) have no meaning in inventory | Webhook branches once: linked ⇒ `inventory_apply_movement('sold')`; unlinked ⇒ existing decrement. No branch for businesses that never link | None |
| Rollback | Very hard: mirrors, backfilled links and any post-cutover sales are entangled | `DROP COLUMN` + restore the old webhook branch. Clean | N/A |
| Breaks businesses that never use inventory | **Yes** — every product sale now depends on a location row | **No** — unlinked products behave exactly as today | No |
| Cost of being wrong | Silent stock drift in the storefront for all products | Only linked products are affected; unlink to recover | Two truths persist; a future reconciliation must guess |

**Recommend B**, for one reason: it is the only option that is both opt-in and reversible. Details:

- Column: `products.inventory_item_id uuid NULL`, FK `(inventory_item_id, business_id) → inventory_items(id, business_id)` — note `products` has `business_id`; a partial unique index prevents two products pointing at one item.
- Webhook (`app/api/webhooks/stripe/route.ts`, product branch; the crypto webhook mirrors it): if `inventory_item_id IS NULL` → today's path, byte-identical. If set → `inventory_apply_movement(<business>, <item>, <default location>, 'sold', -qty, 'Order <id>', <unit revenue? no — leave unit_cost NULL>, 'product_order', <order id>)` and **do not** touch `stock_quantity`.
- `service_role` passes the RPC's auth check (`268:212`), so no new grant is needed. Location: `inventory_ensure_default_location(business_id)`.
- **Known gap, accepted for v1:** inventory refuses to go negative (`268:240–242`), so an oversold linked product makes the sale succeed but the stock write fail. Rule: never fail the payment for a stock reason; log the failure (`console.error` + an `inventory_movement_skipped` reason on the order's audit path) and leave stock at 0 for manual reconcile. Checkout-time `reserved` handling is the real fix and is a separate item.
- Unlinking a product restores the old path but the two numbers diverge immediately — the UI must say so before unlinking.

**Do not build D1 in the supply workstream.** It touches payments; it belongs in its own PR with its own webhook tests.

### D2 — Permission split (recommendation: **three keys**)

| Option | Keys | Assessment |
|---|---|---|
| Minimal | `supply.view`, `supply.manage` | Receiving is then a manage action. A branch storekeeper cannot record a delivery without also being able to edit supplier prices and send POs |
| **Recommended** | `supply.view`, `supply.manage`, `supply.receive` | `receive` is branch-scopable and writes stock; `manage` owns suppliers, prices and PO lifecycle. Matches how `delivery.assign`/`delivery.update_status` are already split |

`supply.receive` implies `supply.view` (enforced in the helper, not by data).

### D3 — Nav capability (recommendation: **no `SUPPLY` capability; `capabilities: []`**)

Adding a capability means editing `CAPABILITIES` and `CAPABILITIES_BY_BUSINESS_TYPE` (`lib/business-taxonomy.ts:121–158`) for ~25 types, and it would re-create the exact bug found in the audit: the business shell gates on capabilities while the org workspace does not, so the same owner sees the module in one shell and not the other. Inventory solved this by using no capability. Supply follows inventory.

### D4 — Changing `inventory_apply_movement` (recommendation: **DROP + CREATE a 9-arg version**)

Receiving must record why stock arrived. Options:

1. Direct `INSERT` into `inventory_movements` from the receiving RPC (the precedent transfers set) — rejected: the brief requires receiving to go through `inventory_apply_movement` only, and two writers is how ledgers drift.
2. Add a 9-arg overload with defaults — rejected: a 7-argument call becomes ambiguous between the 7-arg and 9-arg-with-defaults functions (`function is not unique`), which breaks the live PostgREST RPC.
3. **DROP the 7-arg function, CREATE the 9-arg one** (`p_reference_type text DEFAULT NULL, p_reference_id uuid DEFAULT NULL`), re-grant, rollback restores 269's exact 7-arg body. All existing callers use named arguments (`lib/actions/inventory.ts`), so they keep working against the wider signature. Deploy order: migration first, app second — no broken window.

### D5 — Money display (recommendation: **one rule, `formatMoney` only**)

Storage stays `numeric(14,4)` for money and `numeric(14,3)` for quantities. Display always goes through `lib/money.ts#formatMoney(amount, currency, locale)`: CFA codes render `FCFA 1 234` (0 decimals, never `1,234.0000`), other ISO codes via `Intl` (2 decimals). No 4-decimal money ever reaches a user; the item-detail page's `maximumFractionDigits: 4` is a defect to fix in the first supply PR (one line). A per-delivery unit cost that genuinely needs sub-unit precision is shown by the currency rule, and the precise stored value is available in the CSV/export path only.

---

## 2. Invariants

1. **One stock truth.** Supply never stores a quantity of stock. On-hand lives in `inventory_balances`; every change is an `inventory_movements` row through `inventory_apply_movement`.
2. **Documents reference the ledger.** Each accepted receipt line points at its `received` movement via `goods_receipt_lines.movement_id`, and that movement points back via `reference_type='goods_receipt'`, `reference_id=<receipt>`.
3. **Tenant scope is `business_id` everywhere**, with composite FKs `(id, business_id)` so a cross-business reference is structurally impossible (268's pattern, `268:75–78`).
4. **Branch scope comes from the location, not from a column on the document.** A PO's destination is a location; a location carries an optional `branch_id`. Permission checks use `staff_has_permission(business, key, branch)`.
5. **Draft is the only mutable state for a PO.** After `sent`, lines are frozen; only quantity accepted evolves (by receiving).
6. **No direct table writes from the client.** `authenticated` gets SELECT on documents and no INSERT/UPDATE/DELETE; all mutations go through SECURITY DEFINER RPCs with a pinned `search_path` and an explicit permission gate at the top.
7. **Nothing auto-sends, auto-orders or auto-pays.** Suggestions are read-only.

---

## 3. Data model

Naming: all functions `supply_*`, all policies `supply_<table>_<op>`, all helpers the 268 trio shape.

### 3.1 `supply_suppliers` (migration 275)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK `gen_random_uuid()` |
| `business_id` | uuid | NOT NULL, FK `businesses(id)` ON DELETE CASCADE |
| `name` | text | NOT NULL, `char_length BETWEEN 1 AND 120` |
| `code` | text | NULL, `<= 32` (the owner's internal supplier code) |
| `contact_name` | text | NULL, `<= 120` |
| `email` | text | NULL, `<= 254`, `~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'` |
| `phone` | text | NULL, `<= 32` |
| `address` | text | NULL, `<= 500` |
| `country` | text | NULL, `<= 56` (free text, matches `businesses.country`) |
| `currency` | char(3) | NOT NULL DEFAULT `'XOF'`, `~ '^[A-Z]{3}$'` |
| `payment_terms` | text | NULL, `<= 120` (a label only; no accounting) |
| `notes` | text | NULL, `<= 1000` |
| `is_active` | boolean | NOT NULL DEFAULT true |
| `created_by` | uuid | NULL, FK `auth.users(id)` ON DELETE SET NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
| | | `UNIQUE (id, business_id)` for composite FKs |

Constraints/indexes:

```sql
CONSTRAINT supply_suppliers_id_business_key UNIQUE (id, business_id)
CREATE UNIQUE INDEX supply_suppliers_business_name_uidx ON supply_suppliers (business_id, lower(name));
CREATE UNIQUE INDEX supply_suppliers_business_code_uidx ON supply_suppliers (business_id, lower(code)) WHERE code IS NOT NULL;
CREATE INDEX supply_suppliers_business_active_idx ON supply_suppliers (business_id, is_active);
```

Triggers: `supply_suppliers_updated_at` → `staff_touch_updated_at()`; `supply_suppliers_guard` → `inventory_guard_owner()` (already generic: it only refuses a `business_id` change; reuse rather than duplicate — note the name in a comment).

RLS:

```sql
ALTER TABLE public.supply_suppliers ENABLE ROW LEVEL SECURITY;
SELECT      USING (public.supply_can_view(business_id, NULL))
INSERT      WITH CHECK (public.supply_can_manage(business_id, NULL))
UPDATE      USING (public.supply_can_manage(business_id, NULL)) WITH CHECK (same)
```

No DELETE policy: suppliers are deactivated (`is_active=false`), matching inventory's no-DELETE rule.

### 3.2 `supply_supplier_items` (275)

Optional per-supplier terms for a catalog item. Sparse by design: a supplier relationship exists without it.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK `businesses(id)` CASCADE |
| `supplier_id` | uuid | NOT NULL, FK `(supplier_id, business_id) → supply_suppliers(id, business_id)` CASCADE |
| `item_id` | uuid | NOT NULL, FK `(item_id, business_id) → inventory_items(id, business_id)` **RESTRICT** |
| `supplier_sku` | text | NULL, `<= 64` |
| `last_price` | numeric(14,4) | NULL, `>= 0` |
| `last_price_at` | timestamptz | NULL |
| `lead_time_days` | integer | NULL, `BETWEEN 0 AND 365` |
| `min_order_qty` | numeric(14,3) | NULL, `> 0` |
| `is_preferred` | boolean | NOT NULL DEFAULT false |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
| | | `UNIQUE (supplier_id, item_id)`, `UNIQUE (id, business_id)` |

```sql
CREATE UNIQUE INDEX supply_supplier_items_one_preferred_uidx
  ON supply_supplier_items (business_id, item_id) WHERE is_preferred;
CREATE INDEX supply_supplier_items_business_item_idx ON supply_supplier_items (business_id, item_id);
```

`last_price` is a convenience cache updated by the receiving RPC (`last_price = accepted unit cost`, `last_price_at = now()`) — never the source of truth for a PO line.

RLS: SELECT `supply_can_view(business_id, NULL)`; INSERT/UPDATE `supply_can_manage(business_id, NULL)`.

### 3.3 `supply_purchase_orders` (276)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL, FK `businesses(id)` CASCADE |
| `supplier_id` | uuid | NOT NULL, FK `(supplier_id, business_id)` **RESTRICT** |
| `po_number` | text | NOT NULL, `<= 32`, `UNIQUE (business_id, po_number)` |
| `destination_location_id` | uuid | NOT NULL, FK `(destination_location_id, business_id) → inventory_locations(id, business_id)` RESTRICT |
| `status` | text | NOT NULL DEFAULT `'draft'`, CHECK IN (`draft`,`sent`,`partially_received`,`received`,`cancelled`) |
| `currency` | char(3) | NOT NULL, `~ '^[A-Z]{3}$'` (snapshot of the supplier's currency at creation) |
| `expected_at` | date | NULL |
| `notes` | text | NULL, `<= 1000` |
| `sent_at` / `received_at` / `cancelled_at` | timestamptz | NULL |
| `created_by` | uuid | NULL, FK `auth.users` SET NULL |
| `created_at` / `updated_at` | timestamptz | NOT NULL DEFAULT now() |
| | | `UNIQUE (id, business_id)`, `UNIQUE (business_id, po_number)` |

No stored totals: the sum lives in the query. A stored subtotal would need a trigger and would drift on line edits.

`po_number` format: `PO-YYYYMM-NNNN`, generated server-side from a dedicated sequence `supply_po_number_seq` inside the create RPC. Sequence values are global (display only); uniqueness is enforced per business.

State machine (enforced in RPCs, all transitions audited by `*_at`):

```
draft ──send──▶ sent ──receive(partial)──▶ partially_received ──receive(all)──▶ received
  │               │                                   │
  └──cancel───────┴───────────cancel──────────────────┘   (received is terminal)
```

Indexes: `(business_id, status, created_at DESC)`, `(business_id, supplier_id)`, `(destination_location_id)`.

Triggers: `updated_at`; `supply_po_guard` refuses `business_id` changes and refuses any transition out of `received`.

### 3.4 `supply_purchase_order_lines` (276)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL |
| `purchase_order_id` | uuid | NOT NULL, FK `(purchase_order_id, business_id) → supply_purchase_orders(id, business_id)` CASCADE |
| `item_id` | uuid | NOT NULL, FK `(item_id, business_id) → inventory_items(id, business_id)` RESTRICT |
| `quantity_ordered` | numeric(14,3) | NOT NULL, `> 0` |
| `unit_cost` | numeric(14,4) | NOT NULL, `>= 0` |
| `notes` | text | NULL, `<= 300` |
| `created_at` | timestamptz | NOT NULL DEFAULT now() |
| | | `UNIQUE (purchase_order_id, item_id)` — one line per item per PO (v1; variants arrive as separate items) |

Frozen-after-send trigger:

```sql
CREATE OR REPLACE FUNCTION public.supply_po_lines_frozen() RETURNS trigger ...
-- parent status NOT IN ('draft')  =>  RAISE 'A sent purchase order cannot be edited' HINT 'supply_po_immutable'
-- fires BEFORE INSERT/UPDATE/DELETE
```

RLS: SELECT via `supply_can_view(business_id, NULL)`; no write policies (writes go through `supply_create_purchase_order` / `supply_update_purchase_order_lines`, which are granted only while the parent is `draft`).

### 3.5 `supply_goods_receipts` (277)

A receipt is a fact, not a document with a draft state. It is created atomically with its lines and its ledger movements.

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL |
| `purchase_order_id` | uuid | NOT NULL, FK `(purchase_order_id, business_id)` **RESTRICT** |
| `location_id` | uuid | NOT NULL, FK `(location_id, business_id) → inventory_locations` RESTRICT |
| `supplier_reference` | text | NULL, `<= 64` (delivery-note number) |
| `notes` | text | NULL, `<= 500` |
| `received_at` | timestamptz | NOT NULL DEFAULT now() |
| `received_by` | uuid | NULL, FK `auth.users` SET NULL |
| | | `UNIQUE (id, business_id)` |

`location_id` is copied from the PO at receiving time and must equal `purchase_order.destination_location_id` (checked in the RPC). Allowing a different location per delivery is a later change; it complicates "ordered vs received" per location.

### 3.6 `supply_goods_receipt_lines` (277)

| Column | Type | Constraints |
|---|---|---|
| `id` | uuid | PK |
| `business_id` | uuid | NOT NULL |
| `receipt_id` | uuid | NOT NULL, FK `(receipt_id, business_id)` CASCADE |
| `purchase_order_line_id` | uuid | NOT NULL, FK `(purchase_order_line_id, business_id)` RESTRICT |
| `item_id` | uuid | NOT NULL (denormalised for the ledger link; must equal the PO line's item) |
| `quantity_delivered` | numeric(14,3) | NOT NULL, `> 0` |
| `quantity_accepted` | numeric(14,3) | NOT NULL, `>= 0`, `<= quantity_delivered` |
| `unit_cost` | numeric(14,4) | NOT NULL, `>= 0` (the price actually charged on this delivery) |
| `movement_id` | uuid | NULL, FK `inventory_movements(id)` ON DELETE SET NULL |
| | | `UNIQUE (receipt_id, purchase_order_line_id)` |

Rejected quantity is derived (`delivered - accepted`) and is **not** stocked; the UI asks for a reason and writes it in the movement's `reason` when `accepted > 0`. A line with `accepted = 0` writes no movement (`movement_id` NULL).

Constraint the RPC must satisfy: `SUM(accepted) per PO line <= quantity_ordered` — over-receipt is refused in v1 with hint `supply_over_receipt`.

Indexes: `(business_id, item_id)`, `(receipt_id)`, `(purchase_order_line_id)`.

---

## 4. The receiving path (the only place supply touches stock)

```sql
CREATE OR REPLACE FUNCTION public.supply_receive_purchase_order(
  p_business_id uuid,
  p_purchase_order_id uuid,
  p_lines jsonb,                 -- [{ "purchase_order_line_id": uuid, "quantity_delivered": 12, "quantity_accepted": 10, "unit_cost": 450 }]
  p_supplier_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
```

Order of operations inside one transaction:

1. Lock the PO row `FOR UPDATE`; assert `business_id` matches; assert status ∈ (`draft`,`sent`,`partially_received`).
2. Permission: `supply_can_manage(business_id, v_branch)` **or** `supply_can_receive(business_id, v_branch)`; `service_role` bypasses.
3. Assert the PO's location is `active` (269's archive guard means stock cannot land in an archived location).
4. Insert the receipt header.
5. For each line: re-read the PO line (item, ordered qty, already accepted), validate, insert the receipt line, then

```sql
v_movement := public.inventory_apply_movement(
  p_business_id, v_item, v_location, 'received', v_qty_accepted,
  v_reason, v_unit_cost, 'goods_receipt', v_receipt_id);
```

6. Update `supply_supplier_items.last_price/last_price_at` when a row exists for (supplier, item).
7. Recompute the PO: `all accepted >= ordered` ⇒ `received` + `received_at`, else `partially_received`.
8. Return the receipt id.

Rejections (invalid qty, unknown line, wrong item, over-receipt, archived location, insufficient permission) raise with `ERRCODE`/`HINT` pairs in the 268/269 style, and the whole receipt rolls back — a receipt is all-or-nothing.

Why `inventory_apply_movement` and not direct inserts: it owns the balance `FOR UPDATE` lock, the sign/quantity validation, the archived-location check and the `balance_after` bookkeeping. Transfers are the one documented exception (they write two rows atomically and must share a reference); that exception is not extended.

`inventory_apply_movement`'s new signature (migration 277):

```sql
DROP FUNCTION public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric);
CREATE OR REPLACE FUNCTION public.inventory_apply_movement(
  p_business_id uuid, p_item_id uuid, p_location_id uuid, p_type text, p_quantity numeric,
  p_reason text DEFAULT NULL, p_unit_cost numeric DEFAULT NULL,
  p_reference_type text DEFAULT NULL, p_reference_id uuid DEFAULT NULL)
...
-- INSERT ... (…, reference_type, reference_id, created_by) VALUES (…, p_reference_type, p_reference_id, auth.uid())
```

Re-`GRANT EXECUTE` in the same migration (dropping the function drops its grants); `REVOKE ALL … FROM PUBLIC, anon`.

---

## 5. Reorder suggestions (migration 278, read-only)

```sql
CREATE OR REPLACE FUNCTION public.supply_reorder_suggestions(
  p_business_id uuid, p_location_id uuid DEFAULT NULL)
RETURNS TABLE (
  item_id uuid, item_name text, item_type text, unit text,
  on_hand numeric, min_stock numeric, reorder_quantity numeric,
  suggested_qty numeric, supplier_id uuid, supplier_name text,
  last_price numeric, currency char(3), lead_time_days integer)
```

- Gate: `supply_can_view(business_id, branch)` **or** `inventory_can_view(...)`; explicit business filter in every branch (definer bypasses RLS — this is the one thing to get right).
- Rows: items with `is_active` where the balance at the chosen location (or summed over all locations when `p_location_id IS NULL`) is below `min_stock`.
- `suggested_qty = ceil(greatest(coalesce(reorder_quantity, 0), min_stock - on_hand))`, optionally bubbled up to `min_order_qty`.
- Supplier: the preferred `supply_supplier_items` row, else the supplier on the most recent PO that contained the item, else NULL (the UI then offers "choose a supplier").
- Never writes, never sends. "Create draft PO" is a UI action that opens the create dialog prefilled.

No table, no trigger, no cron.

---

## 6. Permissions and gating (migration 274 — first, so later migrations can rely on the keys)

Three keys, domain `supply`:

| Key | Description |
|---|---|
| `supply.view` | View suppliers and purchase orders |
| `supply.manage` | Manage suppliers, prices and purchase orders |
| `supply.receive` | Record goods receipts |

**The domain CHECK must be amended first.** `staff_permissions.domain` is `GENERATED ALWAYS AS split_part(key,'.',1)` and is constrained to 17 values (`235:155–166`). Inserting `supply.view` fails against the current constraint — which is good (fail-closed) and means the migration must, in this order:

1. `ALTER TABLE public.staff_permissions DROP CONSTRAINT staff_permissions_domain_check;`
2. `ADD CONSTRAINT staff_permissions_domain_check CHECK (domain IN (…17 existing…, 'supply'));` → **18 values**
3. `INSERT INTO staff_permissions (key, description) VALUES (…) ON CONFLICT DO NOTHING;` → **65 keys**
4. `UPDATE entity_role_permission_defaults SET permission_keys = permission_keys || ARRAY['supply.view'] WHERE entity_role = 'editor' AND NOT ('supply.view' = ANY(permission_keys));` (237 seeds with `ON CONFLICT (entity_role) DO NOTHING`, so a plain re-insert would silently do nothing — this must be an UPDATE with a duplicate guard).
5. Grants in the 243 pattern (idempotent `INSERT … SELECT … ON CONFLICT DO NOTHING`): owner/admin/manager get all three; viewer gets `supply.view`.

Catalogue count becomes **65**; built-in-role grant counts become owner 65, admin 65, manager 53, viewer 13.

**Everything that asserts 62 (exhaustive):**

| File | Line | What it says | Action |
|---|---|---|---|
| `db/migration_235_permission_catalogue_verification.sql` | 7, 9, 22 | "Exactly 62 keys" / "Expect 62" / "across the 62 keys" | Leave untouched. It is 235's point-in-time companion; note in 274 that it is historical from here on |
| `db/migration_243_builtin_role_permissions_verification.sql` | 12 | "admin 62, manager 50, owner 62, viewer 12" | Leave untouched for the same reason |
| `db/migration_235_permission_catalogue.sql` | 148 | forward-comment "across all 62 keys" | Never edit an applied migration |

No TypeScript file enumerates permission keys (verified: keys are DB rows; `lib/actions/**` passes strings to `staff_has_permission`), so no code catalogue changes.

**Helper trio** (created in 275, used by every later migration and policy):

```sql
supply_can_manage(p_business_id, p_branch_id) =>
  is_entity_member(staff_resolve_business_organizer(p_business_id), ARRAY['owner','admin','manager'])
  OR is_staff_branch_manager(p_business_id, p_branch_id)
  OR staff_has_permission(p_business_id, 'supply.manage', p_branch_id)

supply_can_receive(p_business_id, p_branch_id) => manage OR staff_has_permission(…, 'supply.receive', …)
supply_can_view(p_business_id, p_branch_id)   => receive OR staff_has_permission(…, 'supply.view', …)
```

All `STABLE SECURITY INVOKER`, `search_path` pinned, exactly mirroring `inventory_can_manage/view/view_catalog` (`268:116–142`).

**Page gate:** `assertCanAccessBusinessStaffArea(businessId)` (`lib/entity-authz.ts:148`) decides *entry*; the keys decide rows and buttons — the same split inventory already uses. Note the audit's finding: nav is not permission-filtered, so a staff member without `supply.view` will see the nav item and land on an empty page until that separate fix lands.

**Role UI:** a new `supply` domain renders as the raw word "supply", exactly as `inventory` and `products` already do (`components/staff/RoleFormDialog.tsx:36–42` has only the 5 legacy domains; `translateByCode(t, "", domain)` falls back to the raw prefix). No change required; adding a label is optional polish.

**Nav filtering by permission key — the separate item.** To make `app/dashboard/org/[id]/org-nav-items.ts` filter: add `permissions: readonly string[]` (or a `Set`) to `OrgNavOpts`; resolve it server-side once per business for the active user (a single RPC returning the caller's effective keys beats N RPCs); map each module's `permission: "view" | "manage"` to `${module.id}.view` / `${module.id}.manage`; thread the same opts through the three surfaces that call `getFullOrgNavItems` (desktop sidebar, mobile nav strip, mobile drawer). ~6 files, no migration, and it must ship after supply so the supply item is included in the mapping.

---

## 7. Nav

One entry in `lib/dashboard/modules.ts`, immediately after `inventory`:

```ts
{
  id: "supply",
  // Procurement layer over inventory (migration 275+). No capability, same
  // organizer-type visibility as Inventory: every business type sees it.
  capabilities: [],
  permission: "view",
  surfaces: ["nav"],
  period: "none",
  nav: {
    hrefSuffix: "supply",
    icon: "Truck",            // not yet mapped: add it to the 3 icon maps (see §11) or it renders as the Globe fallback
    group: "manage",
    label: "Supply",
    visibility: { kind: "organizer-type", flag: "business" },
  },
  i18n: { title: "Organizer.supply", empty: "Supply.empty", error: "Supply.error" },
  href: (ctx) => `/dashboard/org/${ctx.organizerId}/supply`,
  load: stubLoad,
  emptyWhen: () => false,
  routeExists: true,
}
```

Independent of `router.ts` and `orgNavOrder` — the module registry drives ordering (verified: `ORG_NAV_MODULES` maps `MODULE_REGISTRY` order, `lib/org-dashboard-modules.ts:61–72`).

Not the business shell: `/dashboard/businesses/[id]/supply` is not added. Its inventory item is capability-gated (`app/dashboard/businesses/[id]/layout.tsx:54,81`), and repeating that gate for supply would repeat the contradiction. A future fix can add a supply item to the shell that redirects to the org route when `organizer_id` exists (the pattern already used for `menu`/`website`, `layout.tsx:62–67`).

---

## 8. Money and FCFA

- **Storage:** `numeric(14,4)` for `unit_cost`/`last_price`; `numeric(14,3)` for quantities (268's precision, unchanged).
- **Display:** `formatMoney(amount, currency, locale)` from `lib/money.ts`. XOF/XAF ⇒ `FCFA 1 234` (no decimals, no `(XOF)` qualifier unless both CFA codes are mixed in one list). Other ISO codes ⇒ `Intl` currency format. Locale comes from `useLocale()`/`getLocale()`, as inventory already does.
- **Never** `toLocaleString(..., maximumFractionDigits: 4)` in a supply surface. Fix the existing item-detail occurrence in the same PR (`ItemDetailClient.tsx:297`).
- **Currency per supplier**, not per business — `businesses` has no `currency` column (verified). The PO snapshots the supplier's currency at creation and keeps it even if the supplier's currency later changes; a receipt inherits the PO's currency. No conversion, no cross-currency totals.
- **Default currency for a new supplier:** derived from `businesses.country` — XOF zone (CI, SN, ML, BF, BJ, TG, NE, GW) ⇒ `XOF`; XAF zone (CM, TD, CF, CG, GQ, GA) ⇒ `XAF`; otherwise `USD`. Implemented as `lib/supply/currency-defaults.ts` because no such map exists in the repo (verified). Owner can change it before saving.
- **Variance:** when a delivery's `unit_cost` differs from the PO line's, the receipt line shows `(unit_cost − ordered_unit_cost) × accepted` in the PO currency, formatted by the same rule. CFA variances are therefore whole francs — acceptable, and honest about what FCFA can express.

---

## 9. Business-type walk-through

**Restaurant** — supply is the strongest fit and the reason to build it.
Minimum useful flow: create "Marché Central" (XOF), link cooking oil / rice / gas to it with a lead time, PO for 20 L oil, send (print/WhatsApp by hand — no email in v1), delivery arrives, receive 18 accepted of 20 delivered with `unit_cost` 12 500 → stock up 18, line reads `18/20`, PO becomes `partially_received`. Low-stock list then proposes the next PO at `reorder_quantity`.
Stays hidden: no supplier portal, no quote requests, no cost accounting, no recipe/BOM consumption (that is inventory's `consumed` movement, manually recorded).
Why it beats today: the ledger already recorded *that* oil arrived; now it records *from whom, at what price, against which order*.

**Car rental** — supply is a parts-and-consumables flow, and the weakest structural fit.
Minimum useful flow: supplier "Auto Parts SARL", items typed `spare_part` and `supply` in the parts location; PO for brake pads; receive against the fleet's storage location. What is deliberately absent: no link from a PO line to a vehicle or a rental agreement (`inventory_items` has no `vehicle_id`, and adding one is an inventory change, not a supply one). A rental business can use supply, but cannot attribute a part to a plate.
Stays hidden: work orders, maintenance scheduling (that is `MAINTENANCE`/rental workstream), vehicle-level cost rollups.

**Retail shop** — the flow that most needs supply and the one blocked by D1.
Minimum useful flow: supplier per brand, `supplier_items` with `supplier_sku` and `min_order_qty`, PO → receive → stock. Everything works *for inventory items*. If the shop sells through `products`, its storefront stock is a different number until D1 is decided; supply must not silently create a second truth, so the supplier/item screens link to inventory items only and say so.
Stays hidden: barcode-based receiving (barcodes exist on items, but scanning is the scan-codes workstream — do not touch it), price lists per customer tier, returns to supplier (a `returned_out` movement exists; a supplier-return document does not).

**Service business** — supply is close to meaningless, and that is acceptable.
Minimum useful flow: consumables (typed `supply`) for a cleaning or photography business (chemicals, paper, batteries) at one location, one supplier, occasional PO. The page is honest: empty state suggests *inventory items first*, and the low-stock list stays empty until `min_stock` is set.
Stays hidden: job costing, per-booking consumption.

---

## 10. Migration plan

Five migrations, 274–278, each with a `_rollback` and `_verification` twin in `db/` only (DEC-0067), each mirrored once with timestamp order after `20261127004755_migration_269_inventory_transfers.sql`:

| # | Name | Contents | Mirror |
|---|---|---|---|
| 274 | `supply_permissions` | domain CHECK → 18 values; 3 keys (→ 65 total); 237 editor UPDATE; 243-style grants | `20261127120000_migration_274_supply_permissions.sql` |
| 275 | `supply_suppliers` | `supply_suppliers`, `supply_supplier_items`, helper trio, RLS/grants/triggers, `supply_upsert_supplier`, `supply_archive_supplier` | `20261127130000_migration_275_supply_suppliers.sql` |
| 276 | `supply_purchase_orders` | `supply_purchase_orders`, `supply_purchase_order_lines`, `supply_po_number_seq`, freeze trigger, `supply_create_purchase_order`, `supply_update_draft_lines`, `supply_set_po_status` | `20261127140000_migration_276_supply_purchase_orders.sql` |
| 277 | `supply_goods_receipts` | `supply_goods_receipts`, `supply_goods_receipt_lines`, **replace `inventory_apply_movement` with the 9-arg version**, `supply_receive_purchase_order` | `20261127150000_migration_277_supply_goods_receipts.sql` |
| 278 | `supply_reorder_suggestions` | `supply_reorder_suggestions()` only (no tables) | `20261127160000_migration_278_supply_reorder_suggestions.sql` |

Per-file requirements (268/269 conventions): header comment stating what it builds on; `STATEMENT 0` read-only preflight asserting prerequisites (`to_regprocedure` for the helper trio, the 7-arg `inventory_apply_movement` before 277 drops it, `staff_permissions` domain check body); no `BEGIN/COMMIT`; every statement idempotent and re-runnable from the top; `DO` blocks for `ALTER`/`CREATE POLICY`; grants block `REVOKE ALL … FROM PUBLIC, anon` then narrow `GRANT`s; rollback drops exactly what the forward created and restores 269's 7-arg `inventory_apply_movement` verbatim; verification is read-only `SELECT`s with `-- Expect …` comments.

Register updates required in the same doc commit or the first migration PR: `docs/HANDOFF.md` §6 (five rows + boundary line "next free is 279") and `docs/DATABASE.md` §5. **`docs/DATABASE.md` §5 is owner-owned per the standing note; propose the rows, do not write them unasked.**

Numbers 274–278 are reserved by this design. Nothing above 269 exists on `staging` today; 270–273 belong to organizer-ai and comms and are not touched.

---

## 11. File list

**Server actions** (`"use server"` at top of each, `assertCanAccessBusinessStaffArea` guard on every entry, `revalidatePath` on success):

| File | Exports |
|---|---|
| `lib/actions/suppliers.ts` | `listSuppliers`, `getSupplier`, `createSupplier`, `updateSupplier`, `archiveSupplier`, `listSupplierItems`, `upsertSupplierItem` |
| `lib/actions/purchase-orders.ts` | `listPurchaseOrders`, `getPurchaseOrder`, `createPurchaseOrder`, `updateDraftPurchaseOrderLines`, `sendPurchaseOrder`, `cancelPurchaseOrder`, `listReorderSuggestions` |
| `lib/actions/goods-receipts.ts` | `receivePurchaseOrder`, `listReceiptsForOrder` |

**Pure helpers** (node-testable, no I/O): `lib/supply/errors.ts` (code → en/fr message key), `lib/supply/currency-defaults.ts`, `lib/supply/po-number.ts` (format/parse), `lib/supply/reorder.ts` (suggestion math, shared by RPC parity test and UI).

**Pages** (`app/dashboard/org/[id]/supply/`): `page.tsx` (suppliers list + low-stock panel, `Suspense` + data component per the repo's server-component rule), `suppliers/[supplierId]/page.tsx`, `orders/page.tsx`, `orders/[orderId]/page.tsx`, plus client components `SupplyClient.tsx`, `SupplierDetailClient.tsx`, `PurchaseOrdersClient.tsx`, `PurchaseOrderDetailClient.tsx`.

**Components:** `components/supply/SupplierFormDialog.tsx`, `SupplierItemDialog.tsx`, `PurchaseOrderFormDialog.tsx`, `ReceiveDialog.tsx`, `LowStockPanel.tsx`. Reuse `components/ui/` (`Button`, `Input`, `Select`, `Dialog`, `Badge`, `Card` only where a dialog or a genuine record card is justified). No new UI library.

**Nav:** `lib/dashboard/modules.ts` (one entry) plus the icon mapping in all three places an org nav icon is resolved — `components/nav/platform-nav-icons.ts` (`Truck: IconTruckDelivery`), `app/dashboard/org/[id]/OrgDashboardSidebar.tsx:52` (`ORG_ICON_MAP`) and `components/nav/DashboardMoreSheet.tsx:66` (`ICON_MAP`). Unknown names fall back to `Globe`, so a missed map is a wrong icon, not a crash — which is why it must be checked deliberately.

**i18n:** `messages/en.json` and `messages/fr.json` gain a `Supply` namespace (~55–65 keys): nav label, page titles, supplier form labels/errors, PO status labels (5), receipt dialog labels, low-stock panel copy, empty states, and one key per server error code. **Parity is mandatory** — both files, same key set, no English fallback strings left in components (`tr(key, fallback)` is acceptable only where inventory already does it).

**Tests** (new, registered in `test-files.json` or they never run):
`lib/__tests__/supply-po-number.test.cjs`, `lib/__tests__/supply-reorder.test.cjs`, `lib/__tests__/supply-currency-defaults.test.cjs`, `lib/__tests__/supply-errors.test.cjs`, plus `lib/__tests__/supply-sql-contract.test.cjs` (static regex assertions over the five migration files, in the style of the existing registry tests: every new table has RLS enabled, every `GRANT` is preceded by a `REVOKE … PUBLIC, anon`, every function pins `search_path`, the rollback restores the 7-arg signature).

No test edits to staff/inventory suites; the permission-count change is asserted only in 274's verification file.

---

## 12. Build order

Each phase is one commit, one PR-sized unit, and gated by: `npx eslint <changed files>` → `npx next typegen && npx tsc --noEmit` → a grep proving every action file starts with `"use server"` → `npm run build` → `npm test` against the known baseline (**3684 pass / 33 inherited failures**; a supply change must not alter that ratio).

| Phase | Scope | Migration | Gate expectation |
|---|---|---|---|
| 1 | Permissions + helpers, no UI | 274 + 275 (helpers only) | suite unchanged; 274 verification queries not run (no DB access from the agent) |
| 2 | Suppliers CRUD + page + i18n + helper tests | 275 | baseline ratio; i18n parity check |
| 3 | Purchase orders: schema, draft create/edit, send, cancel | 276 | freeze-trigger covered by the SQL contract test |
| 4 | Receiving: `inventory_apply_movement` 9-arg + receipt RPC + dialog | 277 | **re-run the full inventory suite**; confirm no call site passes positional args |
| 5 | Reorder suggestions + "create draft PO" prefill | 278 | suggestion math tests |
| 6 | Nav entry + page permission gating + docs (`CURRENT-STATE`, `CHANGELOG`, `DECISIONS`, HANDOFF §6, DATABASE §5 proposal) | — | build passes with the new route |

Phase 4 is the only phase that can break existing behavior; everything before it is additive.

---

## 13. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Dropping the 7-arg `inventory_apply_movement` breaks a caller that used positional args | Stock actions fail at runtime | Grep every `rpc("inventory_apply_movement"` call site before 277; all use named args today. Apply migration before deploying app code |
| 269's preflight asserts `to_regprocedure('inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric)')` | Re-running 269's preflight after 277 reports `false` | Documented in 277's header: 269 is a historical, already-applied file; its preflight is not a live health check |
| 235's verification still says 62 keys | Someone re-runs it after 274 and thinks the DB is wrong | 274's verification states the new expected counts; 235/243 companions left untouched and labelled historical |
| Domain CHECK amended before keys inserted (or not at all) | Insert fails closed (safe) or bypasses validation (dangerous) | Ordered statements in 274; 274's rollback restores the 17-value CHECK and refuses if `supply.*` rows still exist |
| Receiving writes stock without a permission check under `service_role` | Webhook/route code could stock anything | `service_role` is deliberately trusted (268 does the same); no route exposes receiving to `service_role` except the receipt RPC itself |
| Over-receipt / duplicate receipts | Stock inflated | `UNIQUE (receipt_id, po_line)`; `SUM(accepted) <= ordered` check under the PO row lock; refresh-safe UI (single submit, no optimistic quantity) |
| PO edited after send | Ordered vs received drifts | Freeze trigger + no write policies; all edits through RPCs that assert `draft` |
| Currency snapshot vs supplier currency change | Mixed currencies in one supplier's history | PO stores its own currency; totals never span currencies |
| FCFA shows 4 decimals via a copied inventory formatter | `FCFA 1 250.0000` | One formatting rule; fix the existing item-detail occurrence in phase 2 |
| `supply_can_view` joins across `inventory_*` and `supply_*` in one policy | RLS recursion or slow plans | Helpers are `SECURITY INVOKER` scalars with no policy-referencing subqueries (the 268 shape); indexes on `(business_id, …)` on every table |
| Supply page reachable by a user without `supply.view` | Empty page, confusing | Accepted until the separate nav-permission-filter item; page states "You do not have access to suppliers" rather than rendering an empty table |
| Phase 5 suggestions scanned per page load | Slow on large catalogs | Function filters on `min_stock > 0` first, joins balances by `(item_id, location_id)` (indexed); add a partial index on `inventory_items (business_id) WHERE is_active AND min_stock > 0` if measured slow |

**What could break existing inventory/transfers:** only 277 touches it. The 9-arg replace preserves every validation and adds two nullable columns to the movement insert; transfers keep their direct two-row insert and their shared `reference_id`; no policy, grant or index on `inventory_*` changes.

---

## 14. Open questions for the owner

1. **D1**: adopt B (opt-in link) as the target, or park retail entirely until after supply ships? Recommendation: ship supply without D1, then do D1 as its own webhook PR.
2. **D2**: three keys (`view`/`manage`/`receive`) or two?
3. **Supplier deactivation vs deletion**: deactivate only (recommended, mirrors inventory's no-DELETE rule) or allow delete when no PO exists?
4. **Receiving against a `draft` PO**: allow (recommended — goods arrive before paperwork) or require `sent` first?
5. **`docs/DATABASE.md` §5 rows** for 274–278: may I write them, or do you want to?
