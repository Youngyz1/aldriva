# POS Phase 1 appendix: DDL / RLS for owner approval

**Status:** PROPOSED. Docs only. No migration written or applied. Satisfies the DDL/RLS gate in `pos-design.md` section 13 only after owner approval.
**Base:** `origin/staging` @ `cb61d1b1a`. Builds on migration 281 (applied on staging).
**Scope (POS Phase 1):** sellable-to-inventory link, money helper contract, spreadsheet import. Settings and a minimal audit table are included because the import and the money helper need them.

## A. Owner decisions (defaults proposed; reply per number)

| # | Decision | Proposed default |
|---|---|---|
| D1 | Migration split | 287 `pos_permissions`; 288 `pos_settings`, `pos_sellable_inventory_links`, helpers, `pos_audit_logs`, link/settings RPCs; 289 import. Re-run the cross-branch check before taking any number. |
| D2 | Source types | product, menu_item, service, rental_item (= `vehicles`; verified in migration 224: `business_id` and `organizer_id` are both NOT NULL), plus new `inventory_item` (sell an inventory item directly, no storefront product needed). |
| D3 | Price source | menu_item/service: local `numeric(12,2)`. product/inventory_item: `inventory_items.selling_price` (`products` has no local price; only `stripe_price_id`). Conversion to minor units is exact: more decimals than the currency allows is rejected, never rounded. Otherwise `pos.price.override`. |
| D4 | Orphans / recipes | No cleanup triggers on source tables. The sale function re-checks the source at sale time; verification lists orphans. One unit sold consumes one unit of one inventory item (no recipes in v1). |
| D5 | Who manages | Links and settings: `pos.settings.manage`. Import: `pos.settings.manage` AND `inventory_can_manage` (it writes stock). |
| D6 | Import | Server-action parse, preview, chunked commit through a SECURITY DEFINER RPC; upsert by SKU only; opening stock through the PUBLIC 9-arg wrapper with `reference_type='opening'` (core stays reserved for the sale function). New dependency decision: a CSV/XLSX parser is not in `package.json` today. |
| D7 | Money helper | New `lib/pos/money.ts`: explicit ISO 4217 exponent table (0/2/3), BigInt integer math, signed values for refunds. Existing `lib/money.ts` is untouched. |

## B. Migration 287 `pos_permissions` (contents; exact SQL after reading migrations 237 and 243)

- Preflight: 281 present; `staff_permissions_domain_check` body lists `pos`. Never touches the CHECK.
- Insert 15 keys (domain `pos`): `pos.view`, `pos.sell`, `pos.custom_item`, `pos.discount.override`, `pos.price.override`, `pos.refund`, `pos.void`, `pos.shift.open`, `pos.shift.close`, `pos.shift.manage`, `pos.sales.view_own`, `pos.sales.view_all`, `pos.reports.view`, `pos.settings.manage`, `pos.sync.review`. `loyalty.*` and `customers.pii.manage` wait for their own phases.
- Grants in the 243 pattern: owner/admin/manager get all 15; viewer none. No `entity_role_permission_defaults` change.
- Verification asserts a +15 delta on the key count, not an absolute total (supply 282 may or may not have applied first).
- Rollback is fail-closed: refuses if any `pos_*` table exists; deletes only the 15 `pos.*` keys and their grants.

## C. Migration 288: tables

### C.1 `pos_settings` (one row per business)

```sql
CREATE TABLE IF NOT EXISTS public.pos_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  currency char(3) NOT NULL,
  prices_include_tax boolean NOT NULL DEFAULT false,
  tax_rate_bps integer NOT NULL DEFAULT 0,
  tax_label text,
  tax_country_code char(2),
  allow_untracked_items boolean NOT NULL DEFAULT false,
  offline_enabled boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_settings_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT pos_settings_tax_rate_check CHECK (tax_rate_bps BETWEEN 0 AND 10000),
  CONSTRAINT pos_settings_tax_label_check CHECK (tax_label IS NULL OR char_length(tax_label) BETWEEN 1 AND 40),
  CONSTRAINT pos_settings_country_check CHECK (tax_country_code IS NULL OR tax_country_code ~ '^[A-Z]{2}$')
);
```

Notes: valid-ISO check is app-side (exponent table). Receipt header/footer columns come later by additive ALTER. Phase 2 adds a trigger that refuses a currency change once any `pos_sales` row exists (no sales table yet).

### C.2 `pos_sellable_inventory_links`

```sql
CREATE TABLE IF NOT EXISTS public.pos_sellable_inventory_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  inventory_item_id uuid,
  default_location_id uuid,
  is_tracked boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_sellable_links_source_key UNIQUE (business_id, source_type, source_id),
  CONSTRAINT pos_sellable_links_type_check CHECK (source_type IN ('product','menu_item','service','rental_item','inventory_item')),
  CONSTRAINT pos_sellable_links_tracked_check CHECK (
    (is_tracked AND inventory_item_id IS NOT NULL AND default_location_id IS NOT NULL)
    OR (NOT is_tracked AND inventory_item_id IS NULL AND default_location_id IS NULL)),
  CONSTRAINT pos_sellable_links_self_check CHECK (source_type <> 'inventory_item' OR source_id = inventory_item_id),
  CONSTRAINT pos_sellable_links_item_fk FOREIGN KEY (inventory_item_id, business_id)
    REFERENCES public.inventory_items (id, business_id) ON DELETE RESTRICT,
  CONSTRAINT pos_sellable_links_location_fk FOREIGN KEY (default_location_id, business_id)
    REFERENCES public.inventory_locations (id, business_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS pos_sellable_links_item_idx ON public.pos_sellable_inventory_links (business_id, inventory_item_id);
```

Composite FKs use the same `(id, business_id)` uniques as 268. Null FK columns are skipped (MATCH SIMPLE), which is what untracked links rely on.

Guard trigger `pos_sellable_link_guard()` (BEFORE INSERT OR UPDATE; SECURITY DEFINER, owner postgres, `search_path` pinned, no client grants):
- On UPDATE, `business_id`, `source_type` and `source_id` are immutable.
- `v_org := businesses.organizer_id` for the row's `business_id` (missing business raises).
- product: `products.id = source_id AND products.business_id = NEW.business_id` (a product with NULL `business_id` cannot be linked).
- menu_item: `menu_items.id = source_id AND menu_items.organizer_id = v_org`.
- service: `services.id = source_id AND services.organizer_id = v_org`.
- inventory_item: `inventory_items.id = source_id AND business_id = NEW.business_id`.
- rental_item: `vehicles.id = source_id AND vehicles.business_id = NEW.business_id AND vehicles.organizer_id = v_org`.
- Not found raises `ERRCODE 23514`, `HINT 'pos_link_source_not_found'`.
- A second trigger sets `updated_at`.

### C.3 `pos_audit_logs` (append-only, 242 pattern)

```sql
CREATE TABLE IF NOT EXISTS public.pos_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT pos_audit_event_check CHECK (char_length(event_type) BETWEEN 1 AND 80)
);
CREATE INDEX IF NOT EXISTS pos_audit_logs_business_time_idx ON public.pos_audit_logs (business_id, occurred_at DESC);
```

BEFORE UPDATE OR DELETE trigger raises (as 242). Written only by `pos_audit_write(...)`, SECURITY DEFINER, no client grants.

## D. Helpers (mirror `inventory_can_*`; STABLE SECURITY INVOKER; `search_path` pinned to `pg_catalog, public, pg_temp`)

```sql
pos_can_manage(p_business_id uuid, p_branch_id uuid) =>
  is_entity_member(staff_resolve_business_organizer(p_business_id), ARRAY['owner','admin','manager'])
  OR is_staff_branch_manager(p_business_id, p_branch_id)
  OR staff_has_permission(p_business_id, 'pos.settings.manage', p_branch_id)

pos_can_view(p_business_id uuid, p_branch_id uuid) =>
  pos_can_manage(p_business_id, p_branch_id)
  OR staff_has_permission(p_business_id, 'pos.view', p_branch_id)
  OR staff_has_permission(p_business_id, 'pos.sell', p_branch_id)
```

Both: `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role`.

## E. RLS, grants, RPCs

```sql
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sellable_inventory_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pos_settings, public.pos_sellable_inventory_links, public.pos_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_settings, public.pos_sellable_inventory_links, public.pos_audit_logs TO authenticated;
GRANT ALL ON public.pos_settings, public.pos_sellable_inventory_links, public.pos_audit_logs TO service_role;

-- policies (SELECT only; no INSERT/UPDATE/DELETE policies, writes go through RPCs)
pos_settings_select:   USING (public.pos_can_view(business_id, NULL))
pos_links_select:      USING (public.pos_can_view(business_id, NULL))
pos_audit_select:      USING (public.pos_can_manage(business_id, NULL))
```

RPCs (all SECURITY DEFINER, owner postgres, `search_path` pinned, `REVOKE ALL FROM PUBLIC, anon`, `GRANT EXECUTE TO authenticated, service_role`). Each checks `pos_can_manage(p_business_id, NULL)` (service_role bypasses) before any write, and each writes one `pos_audit_logs` row:
- `pos_upsert_settings(p_business_id uuid, p_currency text, p_prices_include_tax boolean, p_tax_rate_bps integer, p_tax_label text, p_tax_country_code text, p_allow_untracked_items boolean, p_offline_enabled boolean) RETURNS void`
- `pos_upsert_sellable_link(p_business_id uuid, p_source_type text, p_source_id uuid, p_inventory_item_id uuid, p_default_location_id uuid, p_is_tracked boolean) RETURNS uuid`
- `pos_unlink_sellable(p_business_id uuid, p_source_type text, p_source_id uuid) RETURNS void`

No RPC in 288 calls `inventory_apply_movement_core`. Error HINTs follow the 268/269 style (`pos_forbidden`, `pos_link_source_not_found`).

## F. Migration 289: import

Table `pos_import_batches`: `id`, `business_id`, `created_by`, `file_sha256 text`, `source_filename text`, `status` (`previewed`, `committed`, `failed`), `row_count`, `created_count`, `updated_count`, `skipped_count`, `error_count`, `report jsonb`, `created_at`, `committed_at`, `UNIQUE (business_id, file_sha256)`. SELECT-only to `authenticated` via `pos_can_manage`.

RPC `pos_import_commit(p_business_id uuid, p_file_sha256 text, p_filename text, p_rows jsonb) RETURNS jsonb`, at most 200 rows per call, one transaction per chunk:
- Requires `pos_can_manage` AND `inventory_can_manage`.
- Row keys: `sku` (required), `name`, `barcode`, `category`, `unit`, `cost_price`, `selling_price`, `opening_qty`, `location_id` (default location if omitted).
- Upsert `inventory_items` by `lower(sku)`. Duplicate SKUs inside a batch are rejected. Barcode is informational only (no unique index).
- Prices are decimal strings, converted exactly using `pos_settings.currency`; excess decimals reject the row.
- Opening stock goes through the public 9-arg wrapper (`reference_type='opening'`, type `opening`, quantity greater than 0), and only when the item has no prior movement at that location. Otherwise the row is flagged `stock_skipped_existing`.
- Idempotency: the same `file_sha256` on a `committed` batch returns the stored report without writing.
- Limits (proposed): 5,000 rows and 2 MB per file, UTF-8 CSV first, XLSX only if the parser decision (D6) is approved.
- Per-row error report: row number, field, code.

## G. Money helper contract (`lib/pos/money.ts`, tests in `test-files.json`)

- Exponent table, explicit ISO 4217: 0 decimals (BIF, CLP, DJF, GNF, ISK, JPY, KMF, KRW, PYG, RWF, UGX, UYI, VND, VUV, XAF, XOF, XPF); 3 decimals (BHD, IQD, JOD, KWD, LYD, OMR, TND); all others 2. **UNVERIFIED:** confirm against the current ISO 4217 list at build time. `lib/money.ts` uses Stripe's list, which differs.
- Amounts are `bigint` minor units. Quantity is `bigint` thousandths (matches `numeric(14,3)`). No `number` in money math.
- `parseMajor(str, currency)` is exact string parsing and throws on excess decimals.
- `roundHalfUp(num, den)` on bigint, for non-negative values. Signed values only on refund paths, with explicit sign handling.
- Functions: `lineGross`, `lineTaxExclusive`, `lineTaxInclusive`, `allocateRefund` (cumulative rounding, final refund takes the remainder), all per `pos-design.md` section 5.2.
- Golden tests: all nine rows of the section 5.2 table, the sale-total example, and the partial-refund table, plus 0-, 2- and 3-decimal parsing.
- A SQL contract test asserts the SQL `round()` agrees with the TS helper on the same cases.

## H. Verification and proof plan (written with the migrations after approval)

- Forward files each start with a read-only preflight asserting 281 present, and from 288 on the 287 keys. Rollbacks are fail-closed; verification is read-only; mirrors byte-identical and in number order; no rollback or verification mirrored.
- `db/tests/migration_288_proof.sql` (role proof, rolled back): a user with no key cannot write or read settings/links; a manager can; a cashier with `pos.sell` can read links but not write; a product with NULL `business_id` is rejected; a menu_item from another organizer is rejected; a vehicle from another business is rejected; tracked and untracked CHECK cases; `inventory_item` self-link; audit rows exist and cannot be updated or deleted; `authenticated` has no INSERT/UPDATE/DELETE on any of the three tables; the core remains ungranted to every client role.
- Raw output required; a proof that only prints notices proves nothing.

## I. Open items carried forward

- `pos-design.md` section 14 and the header still describe supply as 274-278 at `909b5e65d`; mark done (PR #23).
- Parser dependency (D6), ISO exponent list verification (G).
- Number check 28 Nov (git refs plus worktrees): 282-299 free; taken: 274 and 276 (organizer-ai worktree), 280 (security/function-grants), 281. Re-run before taking 287.
- Paid-ins/drops, E.164 library, printer list, fiscal scope, offline dine-in, loyalty rules (unchanged, see phase-11).