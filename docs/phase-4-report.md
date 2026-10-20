# Aldriva Menu Promotions — Phase 4 Checkpoint E

- **Date:** 2026-10-20
- **Branch:** `feat/menu-promotions-phase-4`
- **Code checkpoint:** item 5 commit `ae02feb`; its progress row is committed as `00c6407`.
**Status:** Implementation and documentation are committed for review. Migration 184 remains unapplied. Stop here for owner approval.

## Checkpoint boundary

- **[VERIFIED]** Migration 184, its rollback, and its SQL checks are authored. Neither the migration nor the SQL checks were run, and no database operation was performed.
- **[VERIFIED]** Migrations 177, 181, 182, and 183 were not edited in this worktree. The new migration affects restaurant menu promotions only; it does not modify Store products, Store `promo_codes`, or `homepage_promotions`.
- **[VERIFIED]** Item 5 is committed as `ae02feb`; the phase progress log is `docs/phase-4-progress.md`.

## Part 0 — Investigation

### a. Delivery fee and threshold

- **[VERIFIED]** Delivery is part of the order total. `lib/delivery-settings.ts:134-149` computes the fee from fulfilment type, subtotal, and `free_above`; `lib/order-submit.ts:595-598` adds that fee to `total_amount`. The configurable free-delivery threshold is `delivery_settings.free_above` (`lib/delivery-settings.ts:12,51-64`).
- **[VERIFIED]** Because delivery fees are included in the server total, `free_delivery` was retained. Promotion-driven free delivery is applied at `lib/order-submit.ts:592-598` without inventing a separate fee formula.

### b. Existing V2 promotion and menu rendering

- **[VERIFIED]** The old V2 promo section reads `promo` or `template_extras` content, including its manually entered `button_link`, then emits a `cta_banner` with `variant: "promo"` (`lib/website-template-resolver.ts:942-997`). `CtaBannerBlockRenderer` sanitizes and renders that manual CTA (`components/site/blocks/BlockRenderer.tsx:2633-2677`). Its inspector now labels it legacy while preserving the editor fields (`components/dashboard/website/builder/inspectors/CtaBannerInspector.tsx:29-34,102-114`).
- **VERIFIED** `menu_embed` is converted by the template resolver and server-resolved through `resolveMenuEmbed` (`lib/website-template-resolver.ts:1003-1036`; `components/site/blocks/BlockRenderer.tsx:2245-2268`; `lib/website-embeds.ts:366-528`). The smallest extension is the implemented `promotions_embed`, resolved by `resolvePromotionsEmbed` (`lib/website-embeds.ts:532-560`) and rendered from dashboard promotion data only (`components/site/blocks/BlockRenderer.tsx:2119-2234`).

### c. Deep links

- **[NOT FOUND in the Phase 3 storefront]** No item or section query handling was found before Phase 4. The implemented addition reads `?item=` and `?section=`, opens an item's sheet or selects and scrolls to a section, and strips a handled item parameter (`components/site/blocks/StorefrontBrowse.tsx:501-530`).
- **[VERIFIED]** Destination selection returns a link only when its menu route can resolve; external destinations must be HTTPS (`lib/menu-promotions.ts:52-77`). The renderer uses `rel="noopener noreferrer"` for external links and omits a CTA when no safe href or label exists (`components/site/blocks/BlockRenderer.tsx:2142-2167`).

### d. Currency and rounding

- **[VERIFIED]** `lib/money.ts:15-49` explicitly treats BIF, CLP, DJF, GNF, JPY, KMF, KRW, MGA, PYG, RWF, UGX, UYU, VND, VUV, XAF, and XOF as zero-decimal; other valid three-letter currency codes use two decimals. Display formatting for XAF/XOF is documented at `lib/money.ts:56-104`.
- **[VERIFIED]** Promotion price rounding reuses that minor-unit set before calculating quantity totals (`lib/menu-promotions.ts:130-139`; `lib/menu-pricing.ts:322-369`).

## Work item summary

### 1. Migration 184

- **[VERIFIED]** `db/migration_184_menu_promotions.sql:4-70` creates `promotions` and `promotion_targets` with offer, schedule, destination, target, and code uniqueness constraints. Lines 72-139 define updated-at, organizer-match, and target-limit triggers; lines 141-154 prevent changing a promotion's organizer while targets exist; lines 156-229 define RLS, grants, policies, schema notification, and transaction finish.
- **[VERIFIED]** `REVOKE ALL` for `anon` and `authenticated` is immediately before the forward grants (`db/migration_184_menu_promotions.sql:158-160`). The `db/` and timestamped Supabase migration copies are byte-identical.
- **[VERIFIED]** The rollback revokes those grants, drops the new triggers, tables, and functions, then reloads the schema (`db/migration_184_menu_promotions_rollback.sql:1-17`).
- **[VERIFIED]** The rollback-only check harness covers offer-field and time-window constraints, case-insensitive code uniqueness, cross-organizer target rejection, target limit, organizer-change rejection, and anonymous visibility (`db/tests/migration_184_checks.sql:2-111`). It was not run.
- **[VERIFIED]** The `draft hidden` insert now has six values for its six listed columns, with the offer tuple `('percent_off', 10, 'draft', 'banner')`; re-reading the full harness found no other column/value count mismatches (`db/tests/migration_184_checks.sql:39-40`).
- **[VERIFIED]** The organizer bootstrap schema requires `user_id` and `name` and gives `id` a generated default (`db/organizers_schema.sql:4-7`). Migration 48 adds `slug` and migration 49 sets it `NOT NULL` (`db/migration_48_organization_system.sql:7`; `db/migration_49_fix_slugs.sql:33`); the harness now supplies `user_id`, `name`, and unique `slug` values while relying on the `id` default (`db/tests/migration_184_checks.sql:26-29`).

### 2. Shared pricing engine

- **[VERIFIED]** `lib/menu-promotions.ts:130-280` implements currency rounding, active-window and item eligibility, code eligibility, and exactly-one lowest-price candidate resolution with deterministic tie breaking. `lib/menu-pricing.ts:327-369,529-628` adds full-price option deltas after base discounts, zero-floor handling, line totals, and shared cart pricing.
- **[VERIFIED]** The promotion cases cover manual/automatic/code candidates, invalid/expired/wrong-tenant codes, minimum subtotal, ties, variants, add-ons, zero floor, XOF/USD rounding, client/server helper parity, and code-free public projection (`lib/__tests__/menu-promotions.test.cjs:52-239`).

### 3. Server read/write paths

- **[VERIFIED]** `lib/menu-promotion-data.ts:17-67` loads promotions and targets in two batched queries and omits the `code` column for public projections. Its missing-schema branch returns no promotions, while the once-only warning path is covered by `lib/__tests__/menu-promotions.test.cjs:192-238`.
- **[VERIFIED]** `lib/order-submit.ts:328-350,517-598` reloads menu and promotion data, prices using the shared engine, snapshots optional promotion details, and computes fee/total server-side. `lib/actions/orders.ts:152-300` validates codes generically and returns a server price preview.
- **[VERIFIED]** Promotion actions enforce the read/write/delete role sets and concurrency tokens (`lib/actions/promotions.ts:57-80,329-459`); special-price variant targets are rejected at save time (`lib/actions/promotions.ts:280-284`). Tests cover roles, cross-tenant writes, variant rejection, and stale updates (`lib/__tests__/menu-promotions.test.cjs:240-318`).

### 4. Dashboard Promotions manager

- **[VERIFIED]** The organization route loads promotions and menu data (`app/dashboard/org/[id]/promotions/page.tsx:9-69`). `PromotionsManager` implements status counts/filters, row actions, form, targets, preview, and role-sensitive controls (`components/dashboard/menu/PromotionsManager.tsx:108-145,195-296,317-431`).
- **[VERIFIED]** The menu item form lists active targeting promotions and explains lowest-price/no-stacking behavior (`components/dashboard/menu/MenuItemForm.tsx:72-74,198`). The organization navigation and route are in `app/dashboard/org/[id]/org-nav-items.ts` and `app/dashboard/org/[id]/promotions/page.tsx:9-27`.
- **[VERIFIED, not visually checked]** Responsive classes and keyboard-sized controls are present in the dashboard. Browser access was disabled for this task, so no screenshot claim is made.

### 5. Storefront display and order views

- **[VERIFIED]** `lib/website-embeds.ts:385-500` retains the 100-item-per-section and 500-item-total caps, loads active automatic promotions once without codes, and attaches effective pricing and promotion references to menu items. `BlockRenderer.tsx:2330-2385,2445-2520` passes effective prices, strikethrough originals, and discount labels into menu cards and static markup.
- **[VERIFIED]** Three dashboard-managed promotion layouts render at `components/site/blocks/BlockRenderer.tsx:2119-2234`; the builder toggle/layout selector is `components/dashboard/website/builder/inspectors/PromotionsEmbedInspector.tsx:1-75`. Restaurant template sections are optional/default-off and the Savannah manual banner is labelled legacy (`lib/website-template-v2.ts:235,344,583`).
- **[VERIFIED]** The cart keeps only menu references and selected options in its order payload, uses shared preview pricing, calls `validatePromoCode` on Apply and again before either checkout path, and displays the “Price updated” review message (`components/site/blocks/StorefrontBrowse.tsx:331-347,1977-2009,2031-2065,2080-2130`). Stored promo codes are convenience references and are revalidated; they do not supply a price.
- **[VERIFIED]** Optional promotion names/savings render in dashboard order cards, public tracking, and email notifications (`components/dashboard/orders/OrderCard.tsx:819-827`; `components/site/OrderTrackingView.tsx:421-427`; `lib/order-notifications.ts:90-99,136-147`). Old order shapes remain optional-field compatible.

### Owner follow-up checks

- **[VERIFIED] a.** `Phase 4 free delivery: server removes the delivery fee from the order total` asserts the delivery fee is zero and the total equals the subtotal (`lib/__tests__/phase2b2-cart-and-orders.test.cjs:474-514`). The server applies the free-delivery result before computing the total (`lib/order-submit.ts:592-598`).
- **[VERIFIED] b.** `old order items without promotion snapshots still render in cards, tracking, and notifications` checks optional promotion access for each surface (`lib/__tests__/storefront-browse.test.cjs:336-349`; `components/dashboard/orders/OrderCard.tsx:822-827`; `components/site/OrderTrackingView.tsx:421-427`; `lib/order-notifications.ts:93-99,139-147`).
- **[VERIFIED] c.** `validatePromoCode rate limits before reads and gives invalid, expired, and other-tenant codes one exact message` asserts the limit runs before database reads and that all three rejected code cases share the generic message (`lib/__tests__/menu-promotions.test.cjs:254-362`). The rate-limit response and generic invalid message are defined at `lib/actions/orders.ts:149-171`; promotion reads are organizer-scoped at `lib/menu-promotion-data.ts:28-29`.
- **[VERIFIED] d.** The loader missing-schema test simulates `42P01` for `promotions` and expects an empty promotion result (`lib/__tests__/menu-promotions.test.cjs:206-252`; `lib/menu-promotion-data.ts:32-35`). `Phase 4 missing promotions table: order-submit succeeds without promotions` verifies order submission succeeds and retains the ordinary delivery fee (`lib/__tests__/phase2b2-cart-and-orders.test.cjs:517-541`; `lib/order-submit.ts:346-351`).
- **[VERIFIED] e.** `an item destination with a null item id produces no promotion link` checks a null destination and the renderer CTA guard (`lib/__tests__/menu-promotions.test.cjs:112-123`; `lib/menu-promotions.ts:52-65`; `components/site/blocks/BlockRenderer.tsx:2144-2160`).

### 6. Documentation

- **[VERIFIED]** This checkpoint is recorded in `docs/phase-4-report.md`; the decision is `docs/DECISIONS.md:445-454`; current status is at `docs/CURRENT-STATE.md:3-10`; and the changelog entry is at `docs/CHANGELOG.md:6-12`.

## Migration identity and RLS summary

- **SHA-256 — [VERIFIED]:** `db/migration_184_menu_promotions.sql`: `30FB2D164CFBC0315230C8F72B7D91D21C551C6ED30C84BDEBE21686CF255482`.
- **SHA-256 — [VERIFIED]:** `supabase/migrations/20261020010000_migration_184_menu_promotions.sql`: `30FB2D164CFBC0315230C8F72B7D91D21C551C6ED30C84BDEBE21686CF255482`. The two copies are byte-identical.
- **RLS — [VERIFIED]:** Anonymous public SELECT is limited to active, code-free rows inside the start/end window; target SELECT checks the same conditions on its parent promotion (`db/migration_184_menu_promotions.sql:162-166,193-201`).
- **RLS — [VERIFIED]:** Dashboard SELECT allows owner/admin/manager/editor/finance/viewer. INSERT and UPDATE allow owner/admin/manager/editor. DELETE allows owner/admin/manager. Each policy also admits an active platform admin (`db/migration_184_menu_promotions.sql:168-187,203-227`).
- **[VERIFIED]** Both tables have RLS enabled; no SECURITY DEFINER function is used (`db/migration_184_menu_promotions.sql:72-155,156-157`).

## Test and build results

- **Phase 3 baseline — [VERIFIED from the final Phase 3 report]:** 2,507 passing tests across 196 files (`docs/phase-3-report.md:37-40`).
- **Phase 4 item 5 baseline — [VERIFIED]:** `npm run test:chunked` passed **2,526/2,526** tests across **197 files** before the owner follow-up changes.
- **Owner follow-up — [VERIFIED]:** `npm run test:chunked` passed **2,530/2,530** tests across **197 files**, with 0 failures.
- **[VERIFIED]** `npx tsc --noEmit --pretty false`, ESLint on the three changed test files, and `git diff --check` passed. The migration and SQL harness were not run; no database operation was performed.
- **Screenshots — [NOT POSSIBLE]:** `cua.getState()` returned no browsers and the error “Local browser use is disabled in Work settings.” No 375px or 1440px screenshot was captured; visual behavior remains unverified.

## Deferred items

- Popups and impressions/click/dismissal analytics (Phase 5); code usage caps; per-variant-option eligibility; bundles/BOGO; cart upsell; Store product promotions; advanced scheduling UI; and external ad workflows.
- **[VERIFIED]** No product decisions remain open in the supplied Phase 4 rules. Staging application and visual QA remain pending owner approval.

## Staging application instructions — after approval only

1. Apply **only** `supabase/migrations/20261020010000_migration_184_menu_promotions.sql` in staging. Do not apply the `db/` mirror, rollback, or checks file as a migration.
2. After applying it, run `db/tests/migration_184_checks.sql` against staging. It uses `BEGIN`/`ROLLBACK`; a finish with no SQL error is the pass signal. Any raised exception is a failure to investigate.
3. Deploy the migration first, then deploy the application code from this branch. The code is fail-soft for the promotions table missing, but rollout order remains schema first.
4. Do not run the rollback unless explicitly required; it removes only Phase 4 promotion objects.

## Manual QA checklist — localhost at 375px

1. Open `/dashboard/org/[id]/promotions`: check empty state, status chips/counts, filters, search, and role-visible row actions. Use keyboard only to reach and activate controls.
2. Create and edit a promotion. Check the single-page form, preview, media upload, item/section targeting and 50-target limit, variant explanation, generated/copyable code, schedule, priority, layout, and generated internal destinations. Confirm external links reject non-HTTPS URLs. Confirm the advisory warnings do not block save.
3. At a 375px viewport, check the preview collapse, labels, focus indicators, and at least 44px control targets; repeat the list/form once at 1440px.
4. On a published restaurant site, render announcement bar, featured banner, and dish card. Check no horizontal overflow, image/no-image variants, CTA visibility, and all three layouts at mobile and desktop widths.
5. Check automatic/manual promotion prices on a menu card and item sheet. Verify original strikethrough and discount badge; test variant with opt-in on/off, and an add-on after discount.
6. Check each destination: item opens its sheet; section scrolls to its tab; menu appears only when a published menu page exists; external opens with `noopener noreferrer`; none has no button.
7. In checkout, confirm “Have a promo code?” is collapsed, valid code shows per-line savings, invalid/expired code shows a generic error, and stored code is revalidated. Change a price or let an offer expire before submit and confirm the customer sees “Price updated” and must review again.
8. Open a new promoted order in dashboard, tracking, and notifications; verify name/savings. Open an older order and confirm it still renders without promotion fields. Check keyboard navigation and reduced-motion behavior.


## Full SQL: migration 184 and rollback

### Forward migration (supabase/migrations/20261020010000_migration_184_menu_promotions.sql; identical to the db/ copy)

```sql
-- Migration 184: organizer-scoped restaurant menu promotions.
-- Additive only. Does not touch Store promo_codes or homepage_promotions.

BEGIN;

CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  headline text CHECK (headline IS NULL OR char_length(headline) <= 120),
  description text CHECK (description IS NULL OR char_length(description) <= 300),
  image_url text CHECK (image_url IS NULL OR char_length(image_url) <= 2048),
  offer_type text NOT NULL CHECK (offer_type IN ('percent_off', 'special_price', 'free_delivery')),
  percent_off integer,
  special_price numeric(12,2),
  apply_to_variants boolean NOT NULL DEFAULT false,
  code text CHECK (code IS NULL OR char_length(btrim(code)) BETWEEN 3 AND 40),
  min_order_amount numeric(12,2) CHECK (min_order_amount IS NULL OR min_order_amount >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer NOT NULL DEFAULT 0,
  layout text NOT NULL CHECK (layout IN ('banner', 'dish_card', 'announcement_bar')),
  cta_label text CHECK (cta_label IS NULL OR char_length(cta_label) <= 40),
  destination_type text NOT NULL DEFAULT 'none' CHECK (destination_type IN ('item', 'section', 'menu', 'external', 'none')),
  destination_item_id uuid REFERENCES public.menu_items(id) ON DELETE SET NULL,
  destination_section_id uuid REFERENCES public.menu_sections(id) ON DELETE SET NULL,
  destination_url text CHECK (destination_url IS NULL OR destination_url ~* '^https://'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_offer_value_check CHECK (
    (offer_type = 'percent_off' AND percent_off IS NOT NULL AND percent_off BETWEEN 1 AND 90 AND special_price IS NULL)
    OR (offer_type = 'special_price' AND special_price IS NOT NULL AND special_price BETWEEN 0 AND 999999.99 AND percent_off IS NULL)
    OR (offer_type = 'free_delivery' AND percent_off IS NULL AND special_price IS NULL)
  ),
  CONSTRAINT promotions_window_check CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at <= ends_at),
  CONSTRAINT promotions_destination_check CHECK (
    (destination_type <> 'item' OR destination_section_id IS NULL)
    AND (destination_type <> 'section' OR destination_item_id IS NULL)
    AND (destination_type <> 'external' OR destination_url IS NOT NULL)
    AND (destination_type <> 'none' OR (destination_item_id IS NULL AND destination_section_id IS NULL AND destination_url IS NULL))
  )
);

CREATE TABLE public.promotion_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id uuid NOT NULL REFERENCES public.organizers(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.menu_items(id) ON DELETE CASCADE,
  section_id uuid REFERENCES public.menu_sections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotion_targets_exactly_one_target_check CHECK ((item_id IS NOT NULL) <> (section_id IS NOT NULL))
);

CREATE UNIQUE INDEX promotions_code_organizer_ci_unique
  ON public.promotions (organizer_id, lower(btrim(code))) WHERE code IS NOT NULL;
CREATE INDEX promotions_organizer_status_idx ON public.promotions (organizer_id, status);
CREATE INDEX promotions_organizer_starts_at_idx ON public.promotions (organizer_id, starts_at);
CREATE INDEX promotions_organizer_id_idx ON public.promotions (organizer_id);
CREATE INDEX promotions_destination_item_idx ON public.promotions (destination_item_id);
CREATE INDEX promotions_destination_section_idx ON public.promotions (destination_section_id);
CREATE INDEX promotion_targets_organizer_id_idx ON public.promotion_targets (organizer_id);
CREATE INDEX promotion_targets_promotion_id_idx ON public.promotion_targets (promotion_id);
CREATE INDEX promotion_targets_item_id_idx ON public.promotion_targets (item_id);
CREATE INDEX promotion_targets_section_id_idx ON public.promotion_targets (section_id);
CREATE UNIQUE INDEX promotion_targets_promotion_item_unique
  ON public.promotion_targets (promotion_id, item_id) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX promotion_targets_promotion_section_unique
  ON public.promotion_targets (promotion_id, section_id) WHERE section_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_menu_promotion_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.set_menu_promotion_updated_at();
CREATE TRIGGER trg_promotion_targets_updated_at
  BEFORE UPDATE ON public.promotion_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_menu_promotion_updated_at();

CREATE OR REPLACE FUNCTION public.check_menu_promotion_organizer_match()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_organizer_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'promotions' THEN
    IF NEW.destination_item_id IS NOT NULL THEN
      SELECT organizer_id INTO v_organizer_id FROM public.menu_items WHERE id = NEW.destination_item_id;
      IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
        RAISE EXCEPTION 'Promotion destination item must belong to the same organizer' USING ERRCODE = '23503';
      END IF;
    END IF;
    IF NEW.destination_section_id IS NOT NULL THEN
      SELECT organizer_id INTO v_organizer_id FROM public.menu_sections WHERE id = NEW.destination_section_id;
      IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
        RAISE EXCEPTION 'Promotion destination section must belong to the same organizer' USING ERRCODE = '23503';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT organizer_id INTO v_organizer_id FROM public.promotions WHERE id = NEW.promotion_id FOR UPDATE;
  IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
    RAISE EXCEPTION 'Promotion target must match its promotion organizer' USING ERRCODE = '23503';
  END IF;
  IF NEW.item_id IS NOT NULL THEN
    SELECT organizer_id INTO v_organizer_id FROM public.menu_items WHERE id = NEW.item_id;
    IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
      RAISE EXCEPTION 'Promotion target item must belong to the same organizer' USING ERRCODE = '23503';
    END IF;
  END IF;
  IF NEW.section_id IS NOT NULL THEN
    SELECT organizer_id INTO v_organizer_id FROM public.menu_sections WHERE id = NEW.section_id;
    IF v_organizer_id IS NULL OR v_organizer_id <> NEW.organizer_id THEN
      RAISE EXCEPTION 'Promotion target section must belong to the same organizer' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.promotion_id IS DISTINCT FROM OLD.promotion_id) THEN
    IF (SELECT count(*) FROM public.promotion_targets WHERE promotion_id = NEW.promotion_id AND id IS DISTINCT FROM NEW.id) >= 50 THEN
      RAISE EXCEPTION 'A promotion can have at most 50 targets' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_promotions_organizer_match
  BEFORE INSERT OR UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.check_menu_promotion_organizer_match();
CREATE TRIGGER trg_promotion_targets_organizer_match
  BEFORE INSERT OR UPDATE ON public.promotion_targets
  FOR EACH ROW EXECUTE FUNCTION public.check_menu_promotion_organizer_match();

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_targets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promotions, public.promotion_targets TO authenticated, service_role;
GRANT SELECT ON public.promotions, public.promotion_targets TO anon;

CREATE POLICY promotions_public_active_automatic_read ON public.promotions FOR SELECT TO anon, authenticated
  USING (
    status = 'active' AND code IS NULL
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  );
CREATE POLICY promotions_tenant_read ON public.promotions FOR SELECT TO authenticated
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
CREATE POLICY promotions_tenant_insert ON public.promotions FOR INSERT TO authenticated
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
CREATE POLICY promotions_tenant_update ON public.promotions FOR UPDATE TO authenticated
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
CREATE POLICY promotions_tenant_delete ON public.promotions FOR DELETE TO authenticated
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

CREATE POLICY promotion_targets_public_read ON public.promotion_targets FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.promotions p
       WHERE p.id = promotion_targets.promotion_id AND p.organizer_id = promotion_targets.organizer_id
         AND p.status = 'active' AND p.code IS NULL
         AND (p.starts_at IS NULL OR p.starts_at <= now())
         AND (p.ends_at IS NULL OR p.ends_at >= now())
    )
  );
CREATE POLICY promotion_targets_tenant_read ON public.promotion_targets FOR SELECT TO authenticated
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
CREATE POLICY promotion_targets_tenant_insert ON public.promotion_targets FOR INSERT TO authenticated
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
CREATE POLICY promotion_targets_tenant_update ON public.promotion_targets FOR UPDATE TO authenticated
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  )
  WITH CHECK (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );
CREATE POLICY promotion_targets_tenant_delete ON public.promotion_targets FOR DELETE TO authenticated
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
```

### Rollback (db/migration_184_menu_promotions_rollback.sql)

```sql
-- Rollback for migration 184. Removes only menu-promotion objects.
BEGIN;

DROP TRIGGER IF EXISTS trg_promotion_targets_organizer_match ON public.promotion_targets;
DROP TRIGGER IF EXISTS trg_promotions_organizer_match ON public.promotions;
DROP TRIGGER IF EXISTS trg_promotion_targets_updated_at ON public.promotion_targets;
DROP TRIGGER IF EXISTS trg_promotions_updated_at ON public.promotions;
DROP TABLE IF EXISTS public.promotion_targets;
DROP TABLE IF EXISTS public.promotions;
DROP FUNCTION IF EXISTS public.check_menu_promotion_organizer_match();
DROP FUNCTION IF EXISTS public.set_menu_promotion_updated_at();

NOTIFY pgrst, 'reload schema';
COMMIT;
```
