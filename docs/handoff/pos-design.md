# Aldriva Native POS — Design Doc (v4.3)

**Date:** 2026-11-28 (v4.3 owner-review updates)  
**Status:** OWNER-APPROVED BASELINE (2026-11-28): architecture, money and tax rules, offline Decision A, void policy and the migration 281 spec. Sections listed as summary-level in section 13 still need owner approval before the migration of the phase that uses them. No POS code. Migration 281 (shared prerequisite) is applied on staging (2026-11-28, owner-verified); no other POS or supply migration is written or applied. Supply design done (PR #23).  
**Branch:** `docs/native-pos-design` off `origin/staging` @ `5c9756b4c` (docs-only PR worktree).  
**Inputs:** Owner plan (2026-11-28), owner decisions rounds 1-7, recon reports, `docs/handoff/supply-design.md` (`C:\Users\Youngyz\aldriva-supply-design`, `909b5e65d`), `docs/HANDOFF.md`, `docs/DECISIONS.md`, migrations 268/269/242/280, `lib/actions/inventory.ts`, `lib/order-submit.ts`, `lib/orders/transition-graphs.ts`, `lib/money.ts`, `lib/order-phone.ts`, `security/function-grants` migration 280, `C:\Users\Youngyz\aldriva-scanner-p0\scratch-proof-269.sql` (read-only).

## Evidence labels
- **VERIFIED** — confirmed in code/git/docs inspected.
- **PROPOSED** — design choice; not implemented.
- **UNVERIFIED** — cannot confirm without DB/runtime/owner action.
- **RISK** — security/consistency/operability concern.

## v4.3 change log
| # | Change |
|---|---|
| 1 | **Refund example fixed:** corrected bps note (833.33... bps, not "8.333 bps"); exclusive refunded `line_total = refunded net + refunded tax` (never rounded separately); recomputed table so total=net+tax in every row; final refund takes remainder. |
| 2 | **Void policy (owner decision 2026-11-28):** full void restocks every line with `stock_applied=true` via core `pos_void` in same lock order; `stock_applied=false` never restocked; partial returns go through refund path. Proof cases added. |
| 3 | **Apply now wording:** §4.2 now uses row-lock/state-transition idempotency mechanism from §7; reference is correlation only. |
| 4 | **Migration 280 checked:** 280 has no dynamic loop/DO block over `pg_proc`/all public functions; explicit REVOKE/GRANT on 4 named functions only. Cannot revoke/grant functions created later by 281. Added 4.5 note: required order/verification step. |
| 5 | **Docs PR preflight (read-only):** reported phase-11 current text, connectors doc/DEC native POS/THIRD_PARTY_NOTICES absence, next free DEC 0069. |
| 6 | **Per-item checklist** added at end. |

---

## 1. Decisions carried in (owner final unless noted)

- Option A `pos_*` tables; `orders` not POS commercial record.
- All business types first release; features toggled by business type/owner.
- Money integer minor units + ISO 4217 on every money row; currency per business worldwide.
- Offline in first release; designed in from first sale function; Phase 7 completion.
- Printing: browser + ESC/POS USB (Web Serial/WebUSB) + ESC/POS Bluetooth (Web Bluetooth/BLE GATT only; classic SPP unsupported).
- Staff own view; managers see all; own/all policies key on `cashier_user_id` (auth user, required). `staff_member_id` optional metadata.
- Tender layer all methods now; providers later; mobile money deferred; crypto tender exists but UI hidden until verified.
- Olgax MIT usable with attribution/provenance and `THIRD_PARTY_NOTICES.md`.
- External POS connectors Phase 8 after Phase 7.
- Customers shared tenant-scoped table.
- Dine-in Option 1: POS sale + kitchen `orders` row in one DB transaction, no compensation.
- Loyalty own `loyalty.*` domain.
- Tax: per-business `prices_include_tax`, tax amount per sale line, price-basis flag on sale, one simple rate/business v1, no tax engine; default from business country at setup.
- Offline sales accepted/recorded at sync, never rejected; anomalies flagged.
- Permission revoked while offline: accept+flag completed offline sales; block privileged actions after sync; audit row per event.
- One sellable mapping table `pos_sellable_inventory_links` (approved).
- **Decision A (v4):** offline sync insufficient stock records sale, does not apply stock movement, `stock_applied=false`, anomaly+review; review actions apply now/write off; no negative stock.
- **Void policy (owner decision 2026-11-28):** full void restocks every line with `stock_applied=true` using `reference_type='pos_void'` through the core, in the same lock order; a line with `stock_applied=false` is never restocked; partial returns go through the refund path.

---

## 2. Current-state constraints (VERIFIED)

- Inventory: 268/269 tables/RPCs; `authenticated` SELECT on balances/movements only; writes via RPCs.
- Quantity `numeric(14,3)`; movement types include `opening`; sign/type/balance checks enforced (268).
- `inventory_movements` already has `reference_type text, reference_id uuid` (VERIFIED 268:90-91, 269:11,132). **281 does not add these columns.**
- No `public.customers` table; `customer_identities` is messaging/AI (110).
- `lib/order-phone.ts` is formatting-only, **not E.164**; must not be reused for POS E.164.
- `staff_audit_logs` (242) append-only, RLS select-only, SECURITY DEFINER writers + service-role writer with explicit actor.
- Orders support dine-in/table session/guest hash/caps/status graphs (`lib/order-submit.ts`, `lib/orders/transition-graphs.ts`).
- `products.stock_quantity` seam remains; POS must not write it.
- 269 proof exists unstaged at `C:\Users\Youngyz\aldriva-scanner-p0\scratch-proof-269.sql` (read-only, not in repo). Race scripts not found in repo.

---

## 3. Migration allocation and single-owner rules

### 3.1 Re-check at build time
`git ls-tree --name-only --all -- 'db/migration_2*.sql' 'supabase/migrations/*2*.sql'`; update HANDOFF §6 and DATABASE boundaries before drafting. 280 taken by `security/function-grants` (`db/migration_280_function_grant_hardening.sql`, commit `b2123a3f0`).

### 3.2 Allocation
| # | Owner | Purpose | Depends on |
|---:|---|---|---|
| 281 | **Shared prerequisite** | Single owner: (A) additive `staff_permissions.domain` CHECK for `supply,pos,loyalty`; (B) inventory movement core/wrapper split + 9-arg reference-aware public wrapper; final REVOKE/GRANT/NOTIFY. | 269 |
| 282-286 (confirmed) | Supply | Renumbered from supply 274-278; no domain CHECK replacement; no inventory function replacement. | 281 |
| 280 | security/function-grants | Other agent. Do not take. | independent |
| 287+ (confirmed) | POS | POS schema/permissions/RPCs/offline/reporting phased. | 281 |

### 3.3 Domain CHECK single-owner rule
- 281 only DROP/ADDs `staff_permissions_domain_check`, adding `supply,pos,loyalty` to existing 17 values.
- 282-286/287+ must not replace CHECK with smaller list; preflight-assert domain allowed and insert keys/grants only.
- 281 rollback fail-closed if any `supply.*`,`pos.*`,`loyalty.*` key rows exist.
- Future domains need a new additive prerequisite migration.

---

## 4. Migration 281 — detailed spec (APPLIED on staging 2026-11-28)

### 4.1 Exact current live signature (VERIFIED, 269:143)

```sql
CREATE OR REPLACE FUNCTION public.inventory_apply_movement(
  p_business_id uuid,
  p_item_id uuid,
  p_location_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text DEFAULT NULL::text,
  p_unit_cost numeric DEFAULT NULL::numeric
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'pg_temp'
```

Behavior (VERIFIED): FOR SHARE on location row (269:168-171), validates type/sign/qty, permission `inventory_can_manage` or service_role, archived/inactive checks, balance row FOR UPDATE (199-202), insufficient stock refusal, updates balance, inserts movement (`created_by=auth.uid()`), returns movement id. 269 added FOR SHARE over 268; **rollback must restore 269 body, not 268**.

### 4.2 Cashier/supply receiver permission gap - required fix

**Problem:** current `inventory_apply_movement` allows only `inventory_can_manage(...)` or `service_role` (269:184-188). `auth.uid()` remains the caller inside SECURITY DEFINER, so a cashier with `pos.sell` (but no inventory manage) or a receiver with `supply.receive` will fail on first stock movement. This is a design blocker for POS and supply.

**Fix (PROPOSED): split into internal core + public wrapper.**

1. **`public.inventory_apply_movement_core(...) RETURNS uuid`** - SECURITY DEFINER, `search_path` pinned to `pg_catalog, public, pg_temp`. Contains the actual stock logic (same validations, FOR SHARE location lock, balance FOR UPDATE in id order, insufficient-stock refusal, balance update, movement insert including reference_type/reference_id). **No permission check inside core** except basic argument/location/item existence and stock invariants. Core must verify inside that the location and the item both belong to `p_business_id` (raise otherwise). The actor in `p_actor_user_id` must always be taken from `auth.uid()` inside the calling SECURITY DEFINER function, never from client input; no server action may call the core directly with `service_role`. **Core grants:** `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated, service_role;` and **no GRANT is needed** for same-owner SECURITY DEFINER callers because the function owner keeps EXECUTE. Supabase default privileges grant EXECUTE on new public functions to anon, authenticated, and service_role, so the explicit REVOKE is required. Do not expose core to authenticated clients. Verification must assert `has_function_privilege` is **FALSE** for `anon`, `authenticated`, `service_role`, and `PUBLIC` on `inventory_apply_movement_core`, and `pg_proc.proowner` is the same for every function in the chain (core, wrapper, POS/supply RPCs calling core).

2. **`public.inventory_apply_movement(...)` public wrapper** - 9-arg wrapper keeps the old permission gate: allow `service_role` or `inventory_can_manage(p_business_id, v_branch)`. It delegates to core. Existing inventory UI calls remain valid. Wrapper accepts `p_reference_type` only as `NULL` or from a small explicit allow-list that **excludes** all POS/supply reserved refs; only core accepts reserved refs.

   **Wrapper allow-list (v1, explicit):** `NULL`, `'manual'`, `'adjustment'`, `'count'`, `'correction'`, `'damage'`, `'expiry'`, `'return'`, `'opening'`, `'legacy'`.

   **POS/supply reserved reference types (core-only):** `pos_sale`, `pos_refund`, `pos_sale_apply`, `pos_void`, `goods_receipt`. Future POS/supply refs must be added explicitly to this reserved list and never to the wrapper allow-list unless deliberately approved.

3. **POS/supply RPCs call core, not wrapper**. `pos_create_sale`, `pos_create_refund`, `pos_void_sale`, `pos_apply_sale_line_stock` (apply-now), and `supply_receive_*` (282-286, confirmed) are SECURITY DEFINER functions that perform their own domain authorization before calling core:

   - **POS sale stock write:** sale RPC asserts `cashier_user_id = auth.uid()` and `pos.sell`; the actor always comes from `auth.uid()` inside the calling SECURITY DEFINER function. Offline sync runs as the authenticated cashier; a manager syncing another cashier's queued sales must do so under a named permission and store both `cashier_user_id` and `synced_by_user_id` on the sale. Register/location branch scope: resolved location must belong to register.default_location_id or an explicitly allowed location in the same business; if register is branch-scoped, `location.branch_id` must equal `register.branch_id` (or be null only if business policy allows). Then call core for each line. Core still enforces location active, item active, sufficient stock, lock order.
   - **POS apply now:** asserts manager/review permission (`pos.sync.review` or approved equivalent), line belongs to business, `stock_applied=false`, line has no refund and no void; rechecks stock at that moment; refuses if still short; all-or-nothing per line. Idempotent by the row-lock and state-transition mechanism described in §7 (`pos_sale_items` FOR UPDATE, check `stock_applied=false` and no refund/void, apply movement, set `stock_applied=true` in same transaction). The movement reference (`pos_sale_apply`, sale_item_id/deterministic id) is for correlation/audit only.
   - **POS refund stock write:** refund RPC asserts `pos.refund` + scope. It restocks **only** lines where `stock_applied=true` and line is not manager-written-off and not voided in a conflicting way. If `stock_applied=false` or written off, refund must **NOT** restock; it records refund financials/audit only.
   - **POS void (owner decision 2026-11-28):** void RPC asserts `pos.void` + scope. A full void restocks every line with `stock_applied=true` using `reference_type='pos_void'` through the core, in the same lock order; a line with `stock_applied=false` is never restocked. Partial returns go through the refund path (not partial void restock path). All void actions record audit.
   - **Supply receive:** supply RPC asserts `supply.receive` and branch/location scope before calling core.

4. **Lock order (mandatory, one order for sale/apply-now/refund/void):** lock `pos_sale_items` row(s) `FOR UPDATE` first (or sale row then sale items in deterministic order), then lock location rows with `FOR SHARE`, then lock/create balance rows `FOR UPDATE` in id order. Sale function sorts stock lines by `(location_id, item_id)` before applying stock. Apply-now/refund/void must follow the same order.

5. **Rule (mandatory):** Only SECURITY DEFINER functions that authorise the caller first may call `inventory_apply_movement_core`. Every new caller must document: caller identity check, permission check, business/register/branch scope check, and why core is safe. **Review checklist item:** "Does this code path call `inventory_apply_movement_core` only from a SECURITY DEFINER function that has already authorized caller + tenant + branch/location scope?"

6. **Proof cases required for 281/POS:**
   - Cashier with `pos.sell` but **no** `inventory.manage`/`inventory_can_manage` completes a POS sale that decrements stock (via core through sale RPC) - PASS.
   - Same cashier calling public `inventory_apply_movement` wrapper directly - FAIL with permission denied (existing behavior preserved).
   - Cashier/sale for register in branch X cannot write stock to location in branch Y - FAIL with forbidden/scope error; no balance/movement change.
   - Receiver with `supply.receive` but no inventory manage can receive stock only through supply RPC; direct wrapper fails.
   - Outsider/anon cannot call core or wrapper.
   - Refunding a sale line with `stock_applied=false`, or one manager wrote off, leaves stock unchanged and creates no inventory movement - PASS.
   - Voiding a sale line with `stock_applied=false` leaves stock unchanged and creates no inventory movement - PASS.
   - Apply now on a line with refund or void is refused; only Write off offered - PASS.
   - Apply now is idempotent/safe on double click (one movement per sale line) - PASS.
   - `has_function_privilege` FALSE for anon, authenticated, service_role, and PUBLIC on core - PASS.
   - `pg_proc.proowner` same for core, wrapper, and every POS/supply RPC in the chain - PASS.

### 4.3 New public signature and no-overload rule

`CREATE OR REPLACE` cannot change arg list. 281 runs in **ONE transaction** (`BEGIN; ... COMMIT;`) so partial state is not left behind. 281 must:

1. **Assert old ACL before DROP:** query `pg_proc.proacl` for `public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric)`. Assert it equals the expected ACL (authenticated and service_role EXECUTE; no anon, no PUBLIC). **RAISE EXCEPTION before DROP if it differs.** This prevents blindly replacing a function whose live grants drifted.
2. `DROP FUNCTION IF EXISTS public.inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric);`
3. `CREATE FUNCTION public.inventory_apply_movement_core(...)` (new). `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon, authenticated, service_role;` **No GRANT needed** for same-owner SECURITY DEFINER callers (owner keeps EXECUTE). Explicit REVOKE is required because Supabase default privileges grant EXECUTE on new public functions to anon, authenticated, and service_role.
4. `CREATE FUNCTION public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid)` public wrapper delegating to core after permission check and reference-type allow-list check.
5. Final `REVOKE ALL ON FUNCTION public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric,text,uuid) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO authenticated, service_role;`
6. `NOTIFY pgrst, 'reload schema';`

**Public 9-arg signature:**
```sql
public.inventory_apply_movement(
  p_business_id uuid, p_item_id uuid, p_location_id uuid, p_type text, p_quantity numeric,
  p_reason text DEFAULT NULL::text, p_unit_cost numeric DEFAULT NULL::numeric,
  p_reference_type text DEFAULT NULL::text, p_reference_id uuid DEFAULT NULL::uuid
) RETURNS uuid
```

**Core signature (PROPOSED):** same args plus `p_actor_user_id uuid default auth.uid()` (explicit actor for POS/supply RPCs that authorize a human caller). Core pins `search_path` and has no client-facing grants.

**Wrapper reference allow-list (explicit):** `NULL`, `'manual'`, `'adjustment'`, `'count'`, `'correction'`, `'damage'`, `'expiry'`, `'return'`, `'opening'`, `'legacy'`.

**Core-only reserved reference types (POS/supply):** `pos_sale`, `pos_refund`, `pos_sale_apply`, `pos_void`, `goods_receipt`. Future reserved refs added explicitly; never added to wrapper allow-list without owner approval.

### 4.4 Callers / impact

| Caller | Type | Change |
|---|---|---|
| `lib/actions/inventory.ts` `adjustStock` (~345) | runtime RPC | **No change required by 281.** The 9-arg wrapper with defaults accepts the existing 7-argument named call, so 281 can be applied and rolled back without an app deploy. Optional follow-up: pass `p_reference_type`,`p_reference_id` when needed. |
| `inventory_transfer_stock` (269) | SQL function | **No change** - writes movements directly, does not call `inventory_apply_movement`. |
| 268/269/rollbacks/verifies + supabase mirrors | historical | **Do not edit.** |
| Supply 282-286 (confirmed) | future | Depend on 281; receive RPCs call core after `supply.receive` + scope check; no function replacement. |
| POS 287+ (confirmed) | future | Sale/refund RPCs call core after `pos.sell`/`pos.refund` + register/branch scope; no function replacement. |

**Old-signature grep (VERIFIED, 2026-11-28, worktree `aldriva-pos-design`):**
`git grep -n "inventory_apply_movement(uuid, uuid, uuid, text, numeric, text, numeric)" -- lib app scripts e2e db supabase`
Hits only: `db/migration_268_inventory_foundation.sql` (305,311), `db/migration_268_inventory_foundation_rollback.sql` (2), `supabase/migrations/20261126100020_migration_268_inventory_foundation.sql` (305,311). No lib/app/scripts/e2e runtime callers by signature; runtime RPC caller by name is `lib/actions/inventory.ts`.

### 4.5 ACL capture, grants, NOTIFY

- **Before DROP (migration):** query `pg_proc.proacl` for `public.inventory_apply_movement(uuid,uuid,uuid,text,numeric,text,numeric)`. Assert it equals the expected ACL: `authenticated` and `service_role` EXECUTE; no `anon`, no `PUBLIC`. **RAISE EXCEPTION before DROP if it differs.** Do not "store for comparison" informally.
- **After CREATE (verification file):** assert expected grants directly with `has_function_privilege` on wrapper and core: wrapper executable by authenticated/service_role as intended and not by anon/PUBLIC; core has `has_function_privilege` FALSE for anon, authenticated, service_role, and PUBLIC. Assert `pg_proc.proowner` is the same for every function in the chain (core, wrapper, and any POS/supply RPCs that call core once created).
- End 281 with `NOTIFY pgrst, 'reload schema';`
- 280 pattern: explicit REVOKE after CREATE/REPLACE, narrow GRANT. 281 must be final word for functions it touches.
- **Migration 280 interaction (VERIFIED):** `db/migration_280_function_grant_hardening.sql` (branch `security/function-grants`, inspected 2026-11-28) contains only explicit statements on four named functions; no dynamic loop/DO block over `pg_proc`, no `ALL FUNCTIONS IN SCHEMA`, and no `ALTER DEFAULT PRIVILEGES` statement (comments/reference only at lines 3, 78, 82). It cannot revoke/grant functions created later by 281. **Every function it REVOKEs, GRANTs or alters (with line numbers):**
  - `public.check_email_pending_deletion(text)`: REVOKE line 95, GRANT line 96.
  - `public.reserve_seats_atomic(UUID[], INT)`: CREATE OR REPLACE line 101, REVOKE line 181, GRANT line 182.
  - `public.assign_seat_to_invitation_atomic(UUID, UUID, UUID)`: REVOKE line 187, GRANT line 188.
  - `public.ensure_business_organizer(businesses)`: CREATE OR REPLACE line 196, REVOKE line 274, GRANT line 275.
  **Order/verification:** 281 may be applied before or after 280; regardless of order, after 280 is applied run a verification step re-checking core/wrapper privileges (`has_function_privilege` FALSE for anon/authenticated/service_role/PUBLIC on core; wrapper authenticated+service_role only).

### 4.6 Verification / proof / race scripts

- **Read-only verification file:** domain CHECK includes supply/pos/loyalty; old 7-arg absent; 9-arg wrapper exists; core exists; wrapper/core `prosecdef`; wrapper grants correct by `has_function_privilege`; core privileges FALSE for anon/authenticated/service_role/PUBLIC; `pg_proc.proowner` same across chain; body contains FOR SHARE; reference_type/reference_id written.
- **Behavior proof with same roles as 269 proof** (owner, branch manager, viewer, outsider, anon; rolled back): stock adjustments still work; transfers still work and produce two movement rows sharing reference_id (VERIFIED 269:132-135).
- **New proof cases:** cashier without inventory manage completes sale through sale RPC/core path - PASS; direct wrapper call denied; branch X cannot touch branch Y; supply receiver without inventory manage receives through supply RPC only. Refunding `stock_applied=false` or manager-written-off line leaves stock unchanged - PASS. Voiding `stock_applied=false` line leaves stock unchanged - PASS. Full void restocks every line with `stock_applied=true` via `pos_void` core reference and leaves `stock_applied=false` lines unchanged - PASS. Partial return goes through refund path, not partial void restock path - PASS. Apply now refused when line has refund or void; only Write off offered - PASS. Apply now idempotent/safe on double click (one movement per sale line) - PASS.
- **Two-tab race scripts re-run** and recorded.
- **Lock order invariant:** `pos_sale_items` row(s) FOR UPDATE first, then location rows FOR SHARE, then balance rows FOR UPDATE in id order. Sale/apply-now/refund/void all follow this order. Sale sorts lines by `(location_id, item_id)` before applying stock.
- **Artifact plan:** 269 proof SQL is currently unstaged at `C:\Users\Youngyz\aldriva-scanner-p0\scratch-proof-269.sql` (read-only; do not edit/stage there). 281 implementation committed its proof SQL and race scripts under `db/tests/` (`migration_281_proof.sql`, `migration_281_race_*.sql`) so they can be re-run. Include expected output/comments.

### 4.7 Rollback

- Fail-closed if any `supply.*`,`pos.*`,`loyalty.*` keys exist, if 282+/287+ applied, or if any other function depends on the core (`pg_depend` and `prosrc` checks).
- Drop the core and the 9-arg wrapper.
- Recreate the 269 7-arg `inventory_apply_movement` function (FOR SHARE version, not 268).
- Restore `staff_permissions_domain_check` unconditionally to its previous 17-value list (remove `supply,pos,loyalty`). The fail-closed check above guarantees no `supply.*`/`pos.*`/`loyalty.*` keys exist, so the restore is safe.
- Re-assert its expected ACL (authenticated and service_role EXECUTE; no anon, no PUBLIC).
- `NOTIFY pgrst, 'reload schema';`

---

## 5. POS data model (PROPOSED, 287+)

All tenant-scoped by `business_id`; money bigint minor + char(3) currency; quantities numeric(14,3). `cashier_user_id` required on sales/shifts/refunds; own/all policies key on it.

### 5.1 Tables (summary)
- `pos_settings`: currency, `prices_include_tax`, `tax_rate_bps`, `tax_label`, `tax_country_code`, receipt header/footer, `allow_untracked_items`, `offline_enabled`.
- `customers` (shared): name, phone_raw, phone_normalized, email, notes, is_active, erased_at. No hard delete for referenced rows; `customers.pii.manage` anonymizes PII + audit.
- `pos_registers`: branch_id, default_location_id, name/code, active.
- `pos_shifts`: cashier_user_id required, staff_member_id optional, status open/closed/force_closed, opening_float_minor, expected/counted/cash_difference minor, open/close idempotency keys.
- `pos_receipt_sequences`: (business_id, register_id null, period_key) next_value; locked allocation.
- `pos_sales`: cashier_user_id required, synced_by_user_id nullable (set when a manager syncs another cashier's queued sales under a named permission; otherwise null), source (`pos,offline_sync,import`), offline_origin jsonb, status completed/voided/partially_refunded/refunded, prices_include_tax snapshot, subtotal/discount/tax/tip/total/amount_paid/change_due minor, official receipt_number unique, provisional_receipt_number, idempotency_key unique, kitchen_order_id.
- `pos_sale_items`: line_no, item_kind, source_id, inventory_item_id/location_id, snapshots, quantity numeric(14,3), unit_price_minor, discount_minor, tax_rate_bps, tax_minor, line_total_minor, is_inventory_tracked, **`stock_applied boolean not null default true`**, `stock_anomaly_type text null`, metadata.
- `pos_sale_payments`: method cash/card_external/card_stripe/mobile_money/crypto/other, status, amount_minor, tendered_minor, change_minor, provider/ref. Crypto in model, UI hidden until verified.
- `pos_refunds/refund_items/refund_payments`: cashier_user_id required, reason required, idempotency. Inventory restock via core movement `pos_refund` **only when the original sale line has `stock_applied=true` and is not manager-written-off**. If `stock_applied=false` or written off, refund must NOT restock; it records financial/audit state only and leaves inventory unchanged.
- `pos_held_orders`: versioned cart snapshot, status held/resumed/converted/cancelled/expired.
- `pos_sellable_inventory_links` (approved): unique (business_id, source_type, source_id) -> inventory_item_id, default_location_id, is_tracked. Source types: product, menu_item, service, rental_item.
- `pos_audit_logs`: append-only 242 pattern.
- `loyalty_accounts`, `loyalty_ledger`: ledger source of truth.

### 5.2 Tax and total formula (owner-specified, v4.2)

**Rounding:** All money math in SQL uses `numeric`, never `double precision`. Postgres `round(numeric)` is half away from zero, which equals half-up for non-negative values. The TypeScript helper must match on integers/minor units (no float money). One rounding rule everywhere.

**Per line:**
- `gross_minor = round_half_up(unit_price_minor * qty)` (qty is `numeric(14,3)`, may be fractional)
- `net_minor = gross_minor - discount_minor`
- **Constraints:** `net_minor >= 0`; `discount_minor >= 0`; `discount_minor <= gross_minor`; `tax_rate_bps >= 0 AND tax_rate_bps <= 10000`; `tip_minor >= 0`; line/total money fields >= 0.
- `prices_include_tax=false` (exclusive): `tax_minor = round_half_up(net_minor * tax_rate_bps / 10000)`; `line_total_minor = net_minor + tax_minor`
- `prices_include_tax=true` (inclusive): `line_total_minor = net_minor`; `tax_minor = line_total_minor - round_half_up(line_total_minor * 10000 / (10000 + tax_rate_bps))` (tax extracted, not added)

**Sale total:** `total_minor = sum(line_total_minor) + tip_minor`

**Sale-level discounts:** **out of v1**. V1 supports line discounts only. If/when added later, define allocation before implementation: proportional by line net, largest-remainder distribution, stored per line; do not apply ad hoc at sale level.

**Refunds:** reuse stored line/sale values; **never recompute** tax/totals from current settings. Refund amount/tax are based on stored `tax_minor/line_total_minor/unit_price_minor/qty/discount_minor` and refunded quantity/amount. A refund of a line with `stock_applied=false`, or a manager-written-off line, must **NOT** restock inventory (see §4.2, §7). A void of a line with `stock_applied=false` must **NOT** restock.

**Partial refunds (cumulative rounding, exact sum):** partial refunds must sum exactly to the original line. Use cumulative rounding; the final refund takes the remainder. For an original line with quantity `Q` and original money field `M` (apply separately to `net_minor` and `tax_minor`), refunded quantity steps `q1..qn` where `sum(qi)<=Q`:

- `cumulative_qty_i = sum(q1..qi)`
- `cumulative_M_i = round_half_up(M * cumulative_qty_i / Q)` for non-final partials; for the final refund that fully closes the remaining quantity, `cumulative_M_n = M` (remainder)
- `refund_i_M = cumulative_M_i - cumulative_M_{i-1}`
- **For exclusive-tax lines, refunded `line_total = refunded net + refunded tax` (never rounded separately).** For inclusive-tax lines, refunded `line_total = refunded net` and tax is the extracted component per the same cumulative rule.

This guarantees no penny drift and exact reconciliation to the original stored line.

**Worked golden examples (all required as tests):**

| Case | Currency | Basis | Unit minor | Qty | Gross | Discount | Rate bps | net_minor | tax_minor | line_total_minor | Notes |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| XOF exclusive | XOF (0dp) | excl | 1000 | 2 | 2000 | 100 | 1800 (18%) | 1900 | 342 | 2242 | `342 = round_half_up(1900*1800/10000)=round_half_up(342.0)` |
| XOF inclusive | XOF (0dp) | incl | 1000 | 2 | 2000 | 100 | 1800 (18%) | 1900 | 290 | 1900 | `290 = 1900 - round_half_up(1900*10000/11800)=1900-1610` |
| NGN exclusive | NGN (2dp) | excl | 150000 (₦1500.00) | 1 | 150000 | 0 | 750 (7.5%) | 150000 | 11250 | 161250 | `11250 = round_half_up(150000*750/10000)` |
| NGN inclusive | NGN (2dp) | incl | 150000 | 1 | 150000 | 0 | 750 (7.5%) | 150000 | 10465 | 150000 | `10465 = 150000 - round_half_up(150000*10000/10750)=150000-139535` |
| USD exclusive | USD (2dp) | excl | 1099 ($10.99) | 3 | 3297 | 100 ($1.00) | 825 (8.25%) | 3197 | 264 | 3461 | `264 = round_half_up(3197*825/10000)=round_half_up(263.7525)` |
| USD inclusive | USD (2dp) | incl | 1099 | 3 | 3297 | 100 | 825 (8.25%) | 3197 | 244 | 3197 | `244 = 3197 - round_half_up(3197*10000/10825)=3197-2953` |
| NGN fractional qty, exclusive | NGN (2dp) | excl | 333 (₦3.33) | 1.5 | 500 | 0 | 750 (7.5%) | 500 | 38 | 538 | Fractional qty: `gross=round_half_up(333*1.5)=round_half_up(499.5)=500`; `tax=round_half_up(500*750/10000)=38` |
| USD ordinary case, inclusive | USD (2dp) | incl | 101 ($1.01) | 1 | 101 | 0 | 500 (5%) | 101 | 5 | 101 | Ordinary: `tax = 101 - round_half_up(101*10000/10500)=101 - round_half_up(96.190...) = 101-96 = 5` |
| XOF true half-up boundary, inclusive | XOF (0dp) | incl | 9 | 1 | 9 | 0 | 2000 (20%) | 9 | 1 | 9 | True boundary: `tax = 9 - round_half_up(9*10000/12000)=9 - round_half_up(7.5)=9-8=1` |

**Sale total example:** if the USD exclusive line above is the only line and `tip_minor=200` ($2.00), then `total_minor = 3461 + 200 = 3661`.

**Partial refund worked example (required as golden test):** Original line: USD exclusive, `qty=3`, `net_minor=300`, `tax_minor=25`, `line_total_minor=325` (effective tax rate 25/300 = 833.33... bps; this is a rounding allocation example, not a rate-setting example). Refunds in three steps of qty 1 each. For exclusive lines, `refund_total = refund_net + refund_tax` (never rounded separately):

| Refund | cumulative_qty | cumulative_tax = round_half_up(25*cumulative_qty/3) | refund_tax | cumulative_net = round_half_up(300*cumulative_qty/3) | refund_net | refund_total = refund_net + refund_tax | cumulative_total |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | round_half_up(8.333...)=8 | 8 | round_half_up(100)=100 | 100 | 108 | 108 |
| 2 | 2 | round_half_up(16.666...)=17 | 9 | round_half_up(200)=200 | 100 | 109 | 217 |
| 3 (final) | 3 | 25 (remainder) | 8 | 300 (remainder) | 100 | 108 | 325 (remainder) |

Sums: tax 8+9+8=25, net 100+100+100=300, total 108+109+108=325. Every row satisfies `total = net + tax`; final refund takes remainder; no drift.

---

## 6. Cash model (PROPOSED)

- `tendered_minor`: cash given by customer (cash only).
- `change_minor`: `max(tendered_minor - amount_minor,0)`.
- `amount_minor`: applied to sale/refund.
- Drawer net: +`amount_minor` captured cash sale payment; -`amount_minor` completed cash refund payment.
- **Expected cash at close:** `opening_float_minor + sum(captured cash sale amount_minor) - sum(completed cash refund amount_minor) + cash_paid_ins - cash_drops` (paid-ins/drops only if modeled; v1 may omit and document). Computed from rows, not editable running total. Difference requires reason + audit.

---

## 7. Offline, revocation, sync, and anomaly review (PROPOSED)

- **Accepted/recorded at sync, never rejected** for normal business anomalies. Structural failures (bad auth/signature/malformed) rejected with audit; do not silently drop.
- **Insufficient stock at sync (Decision A):** record the sale, **do not apply the stock movement**, set `pos_sale_items.stock_applied=false`, set `stock_anomaly_type='insufficient_stock_at_sync'` (or equivalent), create `pos_audit_logs` `offline.sync_anomaly` and review queue item. **Do not allow negative stock and do not change the inventory balance CHECK.**

- **Apply now (review action):** allowed only for a line with `stock_applied=false`, **no refund and no void**; otherwise only **Write off** is offered. Re-check stock at that moment; refuse if still short. All-or-nothing per line. On success set `stock_applied=true`, clear anomaly state, write audit row. On insufficient stock, no change, return clear error.

- **Write off (review action):** reason required, no stock change, audit row. Marks line/anomaly as manager-reviewed write-off; line remains `stock_applied=false` and must never be auto-applied later.

- **Idempotency mechanism (apply now / stock movements):** `inventory_movements` cannot have a unique `(reference_type, reference_id)` because `inventory_transfer_stock` writes two rows sharing one `reference_id` (VERIFIED 269:132-135). Idempotency comes from locking the `pos_sale_items` row `FOR UPDATE`, checking `stock_applied=false` (and no refund/void for apply-now), applying the movement, and setting `stock_applied=true` in the **same transaction**. Use a deterministic movement reference (e.g. `reference_type='pos_sale_apply'`, `reference_id=<sale_item_id>`) for audit/correlation; uniqueness is enforced by the sale-item row lock + state transition, not a movement unique constraint.

- **One lock order for sale, apply-now, refund, and void:** lock `pos_sale_items` row(s) `FOR UPDATE` first (sale row then sale items in deterministic order as needed), then lock location rows `FOR SHARE`, then lock/create balance rows `FOR UPDATE` in id order. Sale sorts stock lines by `(location_id, item_id)` before applying stock. All paths must follow this order to avoid deadlocks.

- **Refunds and unapplied stock:** refund function must check `stock_applied` and write-off state. A refund of a sale line with `stock_applied=false`, or one the manager wrote off, must **NOT** restock. It records financial refund/audit only; no inventory movement. Refunding an applied line may restock according to normal refund rules.

- **Voids and unapplied stock (owner decision 2026-11-28):** A full void restocks every line with `stock_applied=true` using `reference_type='pos_void'` through the core, in the same lock order. A void of a line with `stock_applied=false` must **NOT** restock. Partial returns go through the refund path (not partial void restock path). All void actions record audit.

- **Other anomalies flagged:** price changed, item deactivated, customer missing, tax setting changed, permission revoked. Same anomaly/review pattern as appropriate.
- **Provisional receipt numbers:** device-prefixed `OFF-<device>-<period>-<seq>`, unique per device; mapped to official `pos_receipt_sequences` at sync. Display provisional clearly before sync.
- **Offline shift open/close:** allowed with cached auth/register assignment and idempotency keys; synced later.
- **Cached permissions:** snapshot at login/shift open with TTL.
- **Permission revoked while offline:** accept+flag completed offline sales; block privileged actions after sync; write audit row per flagged event.

---

## 8. Dine-in / kitchen (Option 1, one transaction)

- Create `pos_sales` + kitchen `orders` row in same DB transaction. No compensation.
- Kitchen row: `source='pos'`, `pos_sale_id` traceability, no own payment/commercial truth, excluded from sales reports by enforced shared sales view filter.
- Preserve required `orders` fields/behavior from `lib/order-submit.ts`: organizer/business/website, order_number collision retry, customer fields, fulfilment_type dine_in, delivery_address null, currency, subtotal/delivery_fee/total_amount snapshot, status pending/accepted per flow, neutral payment_method/payment_status, scheduled_for, items JSONB compatible with KDS, idempotency_key, table_id/table_session_id/table_label, guest_token_hash, dine_in_confirmation. Extract shared helpers; do not copy-paste blindly.
- Offline dine-in queued locally; not sent to kitchen until synced. UI labels clearly.

---

## 9. Reporting and audit (PROPOSED)

- **Shared sales view/RPC** is canonical; enforces exclusion of `orders.source='pos'` kitchen tickets. Reports query shared view, not ad hoc filters.
- **Offline anomaly review screen** behind named permission `pos.sync.review`. Shows anomaly type, sale/line, expected vs actual, actions (apply now/write off for stock anomalies), resolution, audit trail.
- **`pos_audit_logs`** append-only (242 pattern): voids, refunds, discount/price overrides, no-sale opens, cash differences, customer erasure, offline sync anomalies, permission revoked at sync, stock write-off/apply-now decisions. Reason required where relevant; no PII in metadata.

---

## 10. Phone normalization (PROPOSED)

- E.164 normalization. Business country default for local numbers. Store `phone_raw` and `phone_normalized`.
- `lib/order-phone.ts` is **not E.164** and must not be reused. Use dedicated helper/lib with golden tests (CI/NG/GH/US).
- If normalization fails, keep raw, normalized null, flag for review; do not guess.

---

## 11. Printing (PROPOSED)

- Browser print fallback always.
- USB ESC/POS: Web Serial/WebUSB, Chromium secure context.
- Bluetooth: Web Bluetooth BLE GATT compatible printers only. **Classic Bluetooth SPP not supported by Web Bluetooth.** Tested-printer-model list is open item; do not claim universal support.
- Reuse rental receipt patterns; Olgax ESC/POS reference only with MIT attribution in `THIRD_PARTY_NOTICES.md`.

---

## 12. Permissions (PROPOSED)

- `pos.*`: view, sell, custom_item, discount.override, price.override, refund, void, shift.open, shift.close, shift.manage, sales.view_own, sales.view_all, reports.view, settings.manage, sync.review.
- `loyalty.*`: view, redeem, manage.
- `customers.*`: existing view/update plus `customers.pii.manage`.
- Policies key on `cashier_user_id` for own/all sales. Inventory stock writes by POS/supply RPCs go through internal core after domain+scope authorization.

---

## 13. File plan and phase gates (PROPOSED)

### Files (future)
- Docs: rewrite `docs/phases/phase-11-pos.md` to Native POS; add Phase 8 external connectors doc; update HANDOFF/CURRENT-STATE/DECISIONS when work lands.
- DB: 281 shared prerequisite (applied on staging); 287+ POS migrations (confirmed); each with forward, fail-closed rollback, read-only verification; mirrors in `supabase/migrations/` byte-identical in migration-number order; no rollback in supabase/migrations.
- Code: `lib/pos/**`, `lib/actions/pos-*.ts`, `app/dashboard/org/[id]/pos/**`, `components/pos/**`, `THIRD_PARTY_NOTICES.md` before Olgax copy.
- Tests: `lib/__tests__/pos-*.test.cjs` + any `.test.ts`; every new test registered in `test-files.json`.

### Phase gates
- `git fetch origin` + fresh worktree off `origin/staging`, `npm ci`, `npx next typegen`, `npx eslint <changed>`, `npx tsc --noEmit`, "use server" export check, `npm run build`, `npm test` vs fresh baseline, en/fr key parity zero duplicates, migration proof/verification/race scripts, raw output.
- **DDL/RLS gate (required):** before each phase's migration is written, this doc (or an owner-approved phase appendix linked from it) must contain that phase's full DDL (columns, types, defaults, nullability, constraints, indexes, FKs/uniques/checks) and RLS policies/grants/revokes. Owner approves that DDL/RLS before migration drafting/coding.
- **Core-call review gate:** any code calling `inventory_apply_movement_core` must be a SECURITY DEFINER function that authorizes caller + tenant + register/branch/location scope first; review checklist item required in PR.

### Sections still summary-level today (must be expanded before relevant phase migration)
- §5.1 table summaries: full DDL, constraints, indexes, composite FKs, RLS policies, grants/revokes for every `pos_*`/`customers`/loyalty table.
- §4.2/4.3 core+wrapper SQL: exact final SQL bodies, exact grants, exact reference allow-list enforcement, exact actor attribution.
- §7 sync/anomaly schema: review queue table/state machine, anomaly statuses, apply-now/write-off RPC signatures.
- §8 dine-in order column mapping: exact additive `orders` columns/migration, KDS/reporting view SQL/filter contract.
- §9 reporting: canonical shared sales view SQL and permission model.
- §10 phone normalization: chosen E.164 library/implementation, country-default mapping, tests.
- §11 printing: ESC/POS command/profile matrix, tested printer list.
- §12 permissions: full permission catalogue migration rows, entity-role defaults, built-in role grants, RLS helper SQL.
- Import flow: full schema, file limits, parser, audit, error report format.

---

## 14. Supply design changes (DONE — PR #23, `docs/supply-design`)

Branch `docs/supply-design`, commit `909b5e65d` (`C:\Users\Youngyz\aldriva-supply-design`). PR #23 merged; implementation checklist below retained for traceability.
1. Renumber migrations 274-278 -> **282-286** (confirmed); 281 is shared prerequisite outside supply.
2. Remove supply ownership of `inventory_apply_movement` replacement; depend on 281 9-arg/core model. Supply receive RPCs call core after `supply.receive` + scope checks.
3. Add dependency on 281 in every 282-286 preflight (domain CHECK includes supply, 9-arg exists, core exists).
4. Remove domain CHECK amendment from supply permissions migration; 281 owns additive expansion for supply,pos,loyalty.
5. Shift mirror timestamps/names to keep ordering after 281 and avoid 280 collision.
6. Update register/HANDOFF note: supply 282-286; 281 shared; 274-279 held by other agents; 280 taken; POS 287+.
7. Supply rollback must not restore 7-arg inventory_apply_movement; 281 owns it.
8. Supply verification expects domain present via 281 and 9-arg/core present.

---


## Appendix A — Phase 1 sellable-link / money / import decisions (OWNER-APPROVED 2026-11-28)

**Scope:** Phase 1 (sellable-to-inventory link, money helper, spreadsheet import). Full DDL/RLS still required before any Phase 1 migration is written; this appendix records owner decisions D1-D7. Source appendix: `docs/handoff/pos-phase1-appendix.md` (worktree `aldriva-pos-phase1`, owner-approved).

- **D1 — Migration split:** ACCEPTED as proposed. 287 `pos_permissions`; 288 `pos_settings`, `pos_sellable_inventory_links`, helpers, `pos_audit_logs`, link/settings RPCs; 289 import. Re-run cross-branch check before taking any number.
- **D2 — Source types:** ACCEPTED as proposed. `product`, `menu_item`, `service`, `rental_item` (= `vehicles`), plus new `inventory_item`.
- **D3 — Price source:** ACCEPTED with constraint. menu_item/service: local `numeric(12,2)`. product/inventory_item: `inventory_items.selling_price`. Conversion to minor units is exact: a price not exactly representable in the business currency must raise an error, never round. Otherwise `pos.price.override`.
- **D4 — Orphans / recipes:** ACCEPTED as proposed. No cleanup triggers on source tables; sale function re-checks source at sale time; verification lists orphans. One unit sold consumes one unit of one inventory item (no recipes in v1).
- **D5 — Who manages:** ACCEPTED as proposed. Links/settings: `pos.settings.manage`. Import: `pos.settings.manage` AND `inventory_can_manage`.
- **D6 — Import / dependency:** ACCEPTED with dependency gate. Server-action parse, preview, chunked commit through SECURITY DEFINER RPC; upsert by SKU only; opening stock through public 9-arg wrapper with `reference_type='opening'`. CSV first; add XLSX only after the library's licence, npm audit, and a server-side-only parse with size/row limits are checked and recorded; do not use the SheetJS npm package.
- **D7 — Money helper:** ACCEPTED as proposed. New `lib/pos/money.ts`: explicit ISO 4217 exponent table (0/2/3), BigInt integer math, signed values for refunds. Existing `lib/money.ts` untouched.

---

## 15. V2 comparison (manual owner check required)

**V2 source requested:** Claude Doc "Aldriva Native POS: Plan and Handoff (v2)" — `https://claude.ai/artifact/NsALpNGEPRER11G7H2a1Ht`.

**I cannot read that Claude artifact URL from this environment.** I do **not** claim "no silent drops" without a real comparison. The comparison below is only against owner decisions/messages in this session + v4.3 doc content; it may miss items present only in the v2 artifact.

**Owner manual check list (please verify against v2 artifact):**
- [ ] Exact table definitions/columns/constraints/indexes/RLS for every POS/customer/loyalty/audit table.
- [ ] Atomic sale/refund/void/close-shift RPC signatures, SQL behavior, idempotency, and error codes.
- [ ] Permission keys, role grants, entity defaults, files to change, nav/module/capability wiring.
- [ ] Money helper contract, rounding rule, tax formulas, golden tests, currency/minor-unit rules.
- [ ] Tender layer: methods, statuses, provider adapters, webhook truth, deferred mobile money/crypto scope.
- [ ] Print service: browser/USB/BLE GATT, SPP limitation, receipt model, tested printer matrix, Olgax attribution.
- [ ] Import flow: CSV/XLSX, mapping, preview, idempotent SKU/barcode upsert, opening stock via movement RPC, audit, permissions, limits.
- [ ] Dine-in-to-kitchen: Option 1 one-transaction, `orders` required fields/constraints, report exclusion, offline case.
- [ ] Migration numbers, mirror filenames, rollback/verification rules, 281 prerequisite ownership.
- [ ] File list by phase, test files, `test-files.json` registration.
- [ ] Phase gates (ci/typegen/eslint/tsc/export check/build/test/parity/migration proof/raw output).
- [ ] Risks, open decisions, UNVERIFIED items, and external-connector Phase 8 deferral.

**Known condensed/summary-level areas in v4.3 (not silent drops, but incomplete):** full DDL/RLS for all POS tables; import flow detail; reporting view SQL; phone E.164 library choice; printer test matrix; per-phase file matrix. These must be expanded before the relevant phase migration is written (see §13 DDL/RLS gate).

---

## 16. Risks / UNVERIFIED

- **RISK:** 281 is a shared prerequisite touching domain CHECK and inventory movement internals; bad order breaks supply and POS. Mitigate with preflights, ACL capture, fail-closed rollback, proofs, no other migration replacing these objects.
- **RISK:** Core/wrapper split can accidentally expose core to authenticated or service_role. Mitigate with explicit REVOKE/GRANT verification and negative proof for anon/authenticated/service_role/PUBLIC.
- **RISK:** Wrapper reference allow-list drift could let clients forge reserved refs. Mitigate with allow-list in wrapper, core-only reserved refs, tests.
- **RISK:** Offline stock anomalies create disputes. Mitigate with Decision A, review screen, audit logs, no restock on unapplied/write-off refunds.
- **RISK:** dine-in one-transaction insert touches `orders` invariants; extract shared helpers and test against KDS/readers.
- **RISK:** classic Bluetooth printers unsupported by Web Bluetooth.
- **UNVERIFIED:** local fiscal/e-invoicing compliance by jurisdiction.
- **UNVERIFIED:** E.164 library choice and country-default mapping.
- **UNVERIFIED:** tested printer model list.
- **UNVERIFIED:** migration numbers 282-286 (supply) and 287+ (POS) still free at build time (re-check).

## 17. v4.3 checklist (what changed per item)

1. **Refund example:** §5.2 - Fixed bps note to 833.33... bps (not "8.333 bps"). For exclusive lines, `refund_total = refund_net + refund_tax` (never rounded separately). Recomputed partial-refund table so every row has `total = net + tax`; final refund takes remainder.
2. **Void policy (owner decision 2026-11-28):** §4.2, §7, §4.6 - Full void restocks every line with `stock_applied=true` using `reference_type='pos_void'` through core, in same lock order; `stock_applied=false` never restocked; partial returns go through refund path. Proof cases added.
3. **Apply now wording:** §4.2 - Replaced "unique movement reference" with row-lock + state-transition mechanism described in §7; movement reference is correlation/audit only.
4. **Migration 280 check:** §4.5 - Verified 280 has no dynamic loop/DO block over `pg_proc`/all public functions, no `ALL FUNCTIONS IN SCHEMA`, no `ALTER DEFAULT PRIVILEGES` statement (comments only). Explicit REVOKE/GRANT on 4 named functions only; cannot revoke/grant functions created later by 281. Added order/verification step to re-check core privileges after 280.
5. **Docs PR preflight (read-only):** phase-11-pos.md is old external-POS plan; no connectors phase doc; no native-POS DEC (DEC-0008 is old POS strategy); no `THIRD_PARTY_NOTICES.md`; next free DEC 0069.
6. **Per-item checklist:** This section.

*End of v4.3 draft. No POS code, no migrations, no DB changes.*