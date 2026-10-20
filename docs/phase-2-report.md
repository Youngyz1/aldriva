# Menu option groups Phase 2 report

**Status:** Implemented in the working tree on `feat/menu-options-phase-2`; migration 183 is authored and has not been applied. No database, migration, seed, or cleanup script was run. This report is the Checkpoint C review package; wait for approval before staging rollout.

## Summary

The dashboard now has an organizer-scoped reusable group library with six editable English/French starter templates, option editing, normalized menu-item assignments, override controls, and a deliberate JSON upgrade path. Existing JSON remains authoritative until an owner chooses upgrade. The upgrade uses the same deterministic converter as the backfill and one database function call, so normalized rows and `options_source` change atomically while the legacy JSON remains intact. It reuses an active group in the same organizer when normalized group name, selection rules, and the complete ordered option configuration match; otherwise it creates a new group. Legacy modifiers remain visible and read-only.

Before this change, per-item upgrade generated item-scoped group IDs, so it always created new library rows. The existing backfill is deterministic and idempotent for repeated processing of the same source item/group, but it does not deduplicate across different items. Migration 183 now adds library matching for the per-item upgrade; it only reuses active groups and only when the group rules and all customer-facing option fields/order match.

Paid add-on defaults are documented as not preselected by the customer-facing storefront. All template example prices start at zero. The server continues to validate customer choices and does not apply defaults.

## Responsive screen review

The local browser inventory had no app window or open browser tabs, and no authenticated dashboard browser session was available. The following are descriptions from the responsive component classes and rendered component structure, not screenshot-verified observations. The UI tests cover required controls and keyboard reorder fallback.

### Group library and option editor

- **375px:** The group/library content stays in a single column. Group forms stack; option name and price fields stack below the small-screen breakpoint. Group actions wrap, list controls use at least `min-h-11` targets, and option reorder retains explicit up/down buttons for keyboard and touch use. The option preview remains within the card width.
- **1440px:** Library content uses a two-column group layout; option name and price can share a row, and option details/actions have room to remain grouped. The preview sits within each option editor/card rather than expanding beyond the library column.
- Evidence: `components/dashboard/menu/MenuOptionGroupsLibrary.tsx:201` (template/scratch actions), `:218-219` (rules), `:271-277` (responsive option fields), plus `lib/__tests__/phase0-menu-options-regressions.test.cjs:215` (UI/accessibility expectations).

### Menu item options panel

- **375px:** Assigned groups and searchable picker are stacked. Override and hide controls wrap inside the item form; each group has visible reorder buttons in addition to drag handling. The legacy JSON editor remains visible only for JSON items, while normalized items show the assignment panel.
- **1440px:** The same controls remain in the item form with the assignment list and option rows using available horizontal space; the picker and override controls stay scoped to the selected item. No customer storefront or pricing behavior is changed by Phase 2.
- Evidence: `components/dashboard/menu/MenuItemOptionsPanel.tsx:19` (panel), `:99` and `:113` (assignment reorder saves), `:151` (hidden-option controls); `components/dashboard/menu/MenuItemForm.tsx:61`, `:126`, and `:212` (source-specific editor/panel selection).

## Migration 183

The forward migration is written to both `db/migration_183_menu_option_assignment_cleanup.sql` and `supabase/migrations/20261020000000_migration_183_menu_option_assignment_cleanup.sql`. Their SHA-256 hashes are identical: `83B29AC2DA5065F0C8806BDC9124183F69D0C06A677E8F9774A0F804E4E9C3E0`.

### Full forward SQL

```sql
-- Migration 183: dashboard support for reusable menu options.
-- Cleans assignment references on option deletion and provides an atomic JSON upgrade.

BEGIN;

ALTER TABLE public.menu_item_option_groups
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_menu_item_option_groups_updated_at ON public.menu_item_option_groups;
CREATE TRIGGER trg_menu_item_option_groups_updated_at
  BEFORE UPDATE ON public.menu_item_option_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_menu_option_group_updated_at();

CREATE OR REPLACE FUNCTION public.remove_deleted_menu_option_from_assignments()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- ON DELETE CASCADE removes the parent group before its child option rows.
  -- Do not update assignments after the group has disappeared; their own FK
  -- cascade will remove them without invoking the assignment UPDATE validator.
  IF NOT EXISTS (
    SELECT 1 FROM public.menu_option_groups WHERE id = OLD.group_id
  ) THEN
    RETURN OLD;
  END IF;

  UPDATE public.menu_item_option_groups
     SET hidden_option_ids = array_remove(hidden_option_ids, OLD.id),
         price_overrides = price_overrides - OLD.id::text
   WHERE group_id = OLD.group_id
     AND (OLD.id = ANY(hidden_option_ids) OR price_overrides ? OLD.id::text);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_menu_options_cleanup_assignments ON public.menu_options;
CREATE TRIGGER trg_menu_options_cleanup_assignments
  BEFORE DELETE ON public.menu_options
  FOR EACH ROW EXECUTE FUNCTION public.remove_deleted_menu_option_from_assignments();

DROP POLICY IF EXISTS "Tenant managers can delete menu item option groups" ON public.menu_item_option_groups;
DROP POLICY IF EXISTS "Tenant editors can delete menu item option groups" ON public.menu_item_option_groups;
CREATE POLICY "Tenant editors can delete menu item option groups"
  ON public.menu_item_option_groups FOR DELETE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

CREATE OR REPLACE FUNCTION public.upgrade_menu_item_option_groups(
  p_item_id uuid,
  p_organizer_id uuid,
  p_groups jsonb,
  p_options jsonb,
  p_assignments jsonb
)
RETURNS void LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group record;
  v_option_signature jsonb;
  v_target_group_id uuid;
  v_group_map jsonb := '{}'::jsonb;
BEGIN
  PERFORM 1 FROM public.menu_items
   WHERE id = p_item_id AND organizer_id = p_organizer_id AND options_source = 'json'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Menu item is missing, belongs to another organizer, or is already normalized'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS row_data(
        id uuid, organizer_id uuid
      )
     WHERE organizer_id IS DISTINCT FROM p_organizer_id
  ) THEN
    RAISE EXCEPTION 'Every upgraded menu option group must belong to the item organizer'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_options, '[]'::jsonb)) AS row_data(
        group_id uuid, organizer_id uuid
      )
     WHERE organizer_id IS DISTINCT FROM p_organizer_id
        OR NOT EXISTS (
          SELECT 1
            FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS input_group(id uuid)
           WHERE input_group.id = row_data.group_id
        )
  ) THEN
    RAISE EXCEPTION 'Every upgraded option must belong to an upgraded group and the item organizer'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS row_data(
        item_id uuid, group_id uuid, organizer_id uuid
      )
     WHERE item_id IS DISTINCT FROM p_item_id
        OR organizer_id IS DISTINCT FROM p_organizer_id
        OR NOT EXISTS (
          SELECT 1
            FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS input_group(id uuid)
           WHERE input_group.id = row_data.group_id
        )
  ) THEN
    RAISE EXCEPTION 'Every upgraded assignment must match the item, organizer, and upgraded groups'
      USING ERRCODE = '23514';
  END IF;

  -- Reuse active, organizer-owned groups only when their normalized name,
  -- selection rules, and complete ordered option configuration are identical.
  FOR v_group IN
    SELECT *
      FROM jsonb_to_recordset(COALESCE(p_groups, '[]'::jsonb)) AS row_data(
        id uuid, organizer_id uuid, name text, kind text, min_select integer,
        max_select integer, is_required boolean, position integer, is_active boolean,
        legacy_source_item_id uuid, legacy_group_id text
      )
  LOOP
    SELECT COALESCE(jsonb_agg(option_signature ORDER BY option_signature::text), '[]'::jsonb)
      INTO v_option_signature
      FROM (
        SELECT jsonb_build_object(
          'name', lower(regexp_replace(btrim(option_row.name), '[[:space:]]+', ' ', 'g')),
          'description', CASE WHEN option_row.description IS NULL THEN NULL ELSE lower(regexp_replace(btrim(option_row.description), '[[:space:]]+', ' ', 'g')) END,
          'price', option_row.price,
          'image_url', option_row.image_url,
          'is_default', option_row.is_default,
          'max_qty', option_row.max_qty,
          'is_available', option_row.is_available,
          'allergens', to_jsonb(ARRAY(
            SELECT DISTINCT lower(allergen)
              FROM unnest(COALESCE(option_row.allergens, '{}'::text[])) AS allergy(allergen)
             ORDER BY lower(allergen)
          )),
          'position', option_row.position
        ) AS option_signature
          FROM jsonb_to_recordset(COALESCE(p_options, '[]'::jsonb)) AS option_row(
            group_id uuid, name text, description text, price numeric, image_url text,
            is_default boolean, max_qty integer, is_available boolean, allergens text[],
            position integer
          )
         WHERE option_row.group_id = v_group.id
      ) AS incoming_options;

    SELECT candidate.id
      INTO v_target_group_id
      FROM public.menu_option_groups AS candidate
     WHERE candidate.organizer_id = p_organizer_id
       AND candidate.is_active = true
       AND lower(regexp_replace(btrim(candidate.name), '[[:space:]]+', ' ', 'g'))
           = lower(regexp_replace(btrim(v_group.name), '[[:space:]]+', ' ', 'g'))
       AND candidate.kind = v_group.kind
       AND candidate.min_select = v_group.min_select
       AND candidate.max_select = v_group.max_select
       AND candidate.is_required = v_group.is_required
       AND COALESCE((
         SELECT jsonb_agg(option_signature ORDER BY option_signature::text)
           FROM (
             SELECT jsonb_build_object(
               'name', lower(regexp_replace(btrim(existing_option.name), '[[:space:]]+', ' ', 'g')),
               'description', CASE WHEN existing_option.description IS NULL THEN NULL ELSE lower(regexp_replace(btrim(existing_option.description), '[[:space:]]+', ' ', 'g')) END,
               'price', existing_option.price,
               'image_url', existing_option.image_url,
               'is_default', existing_option.is_default,
               'max_qty', existing_option.max_qty,
               'is_available', existing_option.is_available,
               'allergens', to_jsonb(ARRAY(
                 SELECT DISTINCT lower(allergen)
                   FROM unnest(COALESCE(existing_option.allergens, '{}'::text[])) AS allergy(allergen)
                  ORDER BY lower(allergen)
               )),
               'position', existing_option.position
             ) AS option_signature
               FROM public.menu_options AS existing_option
              WHERE existing_option.group_id = candidate.id
           ) AS existing_options
       ), '[]'::jsonb) = v_option_signature
     ORDER BY candidate.id
     LIMIT 1;

    IF NOT FOUND THEN
      INSERT INTO public.menu_option_groups (
        id, organizer_id, name, kind, min_select, max_select, is_required, position,
        is_active, legacy_source_item_id, legacy_group_id
      ) VALUES (
        v_group.id, v_group.organizer_id, v_group.name, v_group.kind,
        v_group.min_select, v_group.max_select, v_group.is_required,
        v_group.position, v_group.is_active, v_group.legacy_source_item_id,
        v_group.legacy_group_id
      );
      v_target_group_id := v_group.id;
    END IF;

    v_group_map := jsonb_set(v_group_map, ARRAY[v_group.id::text], to_jsonb(v_target_group_id), true);
  END LOOP;

  INSERT INTO public.menu_options (
    id, group_id, organizer_id, name, description, price, image_url, is_default,
    max_qty, is_available, allergens, position, legacy_option_id
  )
  SELECT id, group_id, organizer_id, name, description, price, image_url, is_default,
         max_qty, is_available, allergens, position, legacy_option_id
    FROM jsonb_to_recordset(COALESCE(p_options, '[]'::jsonb)) AS row_data(
      id uuid, group_id uuid, organizer_id uuid, name text, description text,
      price numeric, image_url text, is_default boolean, max_qty integer,
      is_available boolean, allergens text[], position integer, legacy_option_id text
    )
   WHERE v_group_map ->> row_data.group_id::text = row_data.group_id::text;

  INSERT INTO public.menu_item_option_groups (
    id, organizer_id, item_id, group_id, position, hidden_option_ids, price_overrides
  )
  SELECT id, organizer_id, item_id, (v_group_map ->> row_data.group_id::text)::uuid,
         position, hidden_option_ids, price_overrides
    FROM jsonb_to_recordset(COALESCE(p_assignments, '[]'::jsonb)) AS row_data(
      id uuid, organizer_id uuid, item_id uuid, group_id uuid, position integer,
      hidden_option_ids uuid[], price_overrides jsonb
    );

  UPDATE public.menu_items SET options_source = 'normalized'
   WHERE id = p_item_id AND organizer_id = p_organizer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upgrade_menu_item_option_groups(uuid, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upgrade_menu_item_option_groups(uuid, uuid, jsonb, jsonb, jsonb) TO service_role;

COMMIT;
NOTIFY pgrst, 'reload schema';
```

### Full rollback SQL

```sql
-- Rollback migration 183: restore the Phase 1 assignment-delete policy.
-- Drop both migration functions and their triggers before removing assignment updated_at.

BEGIN;

DROP TRIGGER IF EXISTS trg_menu_options_cleanup_assignments ON public.menu_options;
DROP FUNCTION IF EXISTS public.remove_deleted_menu_option_from_assignments();
DROP FUNCTION IF EXISTS public.upgrade_menu_item_option_groups(uuid, uuid, jsonb, jsonb, jsonb);
DROP TRIGGER IF EXISTS trg_menu_item_option_groups_updated_at ON public.menu_item_option_groups;
ALTER TABLE public.menu_item_option_groups DROP COLUMN IF EXISTS updated_at;

DROP POLICY IF EXISTS "Tenant editors can delete menu item option groups" ON public.menu_item_option_groups;
CREATE POLICY "Tenant managers can delete menu item option groups"
  ON public.menu_item_option_groups FOR DELETE
  USING (
    public.is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active')
  );

COMMIT;
NOTIFY pgrst, 'reload schema';
```

### RLS summary

- `menu_item_option_groups` DELETE is allowed to organizer owner/admin/manager/editor and an active platform admin. Editors need this only to detach an assignment from an item.
- Shared `menu_option_groups` and `menu_options` DELETE stay owner/admin/manager plus active platform admin. Editors can mark options unavailable instead; shared definitions are manager-owned.
- Dashboard server actions use the same role split. The action tests check editor detach, editor group/option delete denial, and manager delete behavior (`lib/actions/menu-option-groups.ts:28`, `:256`; `lib/__tests__/phase0-menu-options-regressions.test.cjs:249`).
- Assignment-scoped `updated_at` supports stale-write detection. The option delete trigger removes the option UUID from every relevant assignment's hidden list and price override object before deletion.
- The upgrade function is invoker security with a fixed search path and is executable only by `service_role`; the dashboard action sends one RPC after its tenant and conversion validation.
- **Trigger order:** migration 182 defines `menu_options.group_id` and assignment `group_id` with `ON DELETE CASCADE`, and the assignment validator is a `BEFORE INSERT OR UPDATE` trigger. PostgreSQL runs FK cascade actions as AFTER-trigger actions on the deleted parent. Therefore a group delete has removed the parent group by the time cascaded option deletes invoke the new `BEFORE DELETE` option trigger; the early return avoids an assignment UPDATE that would fail validation against the missing group. For a direct option delete the group still exists, so cleanup removes assignment references before the option row is deleted and the assignment's BEFORE UPDATE validator passes. `db/tests/migration_183_checks.sql` covers both paths. This trigger order was verified from the authored FK and trigger definitions; the SQL test was not executed.

### Applying to staging

After reviewing and approving this checkpoint, apply **one copy only**—the timestamped file in `supabase/migrations/20261020000000_migration_183_menu_option_assignment_cleanup.sql`—as a single transaction in the staging SQL editor. Do not execute both copies. Check the editor reports `COMMIT` and PostgREST reload, then validate the new column, trigger, function privileges, and assignment-delete policy before using the dashboard. The rollback file is provided for a separately reviewed rollback. The migration has not been applied by this work.

## Files changed

- Dashboard: `components/dashboard/menu/MenuItemForm.tsx`, `components/dashboard/menu/MenuManager.tsx`, new `components/dashboard/menu/MenuItemOptionsPanel.tsx`, new `components/dashboard/menu/MenuOptionGroupsLibrary.tsx`.
- Server and shared logic: `lib/actions/menu-option-groups.ts`, `lib/actions/menus.ts`, new `lib/menu-option-backfill.cjs`, new `lib/menu-option-dashboard.ts`, new `lib/menu-option-taxonomy.ts`, `scripts/backfill-menu-option-groups.cjs`.
- Migration: new `db/migration_183_menu_option_assignment_cleanup.sql`, new `db/migration_183_menu_option_assignment_cleanup_rollback.sql`, new `supabase/migrations/20261020000000_migration_183_menu_option_assignment_cleanup.sql`.
- Tests: `lib/__tests__/phase0-menu-options-regressions.test.cjs`, `lib/__tests__/services-and-menus.test.cjs`, `lib/__tests__/storefront-browse.test.cjs`, `lib/workforce/__tests__/stage17-pass-one.test.cjs`.
- Localization and project docs: `messages/en.json`, `messages/fr.json`, `docs/CURRENT-STATE.md`, `docs/CHANGELOG.md`, `docs/DECISIONS.md`, `docs/phases/phase-05-products-services.md`, and this report.

## Tests and checks

- `npm run test:chunked`: **2,497 passed, 0 failed**, 196 registered test files across 7 chunks. Four legacy assertions were updated after the first full run to match the shared taxonomy, migration 183, and editor assignment DELETE policy; the final full run passed.
- Phase 2 regression suite: **13/13 passed** (`node --require ./scripts/test-server-only-alias.cjs --test lib/__tests__/phase0-menu-options-regressions.test.cjs`). It includes starter-template translations and zero-price examples, allergen/dietary SQL parity, UI control/accessibility assertions, migration mirror/transaction/cleanup checks, role-matched server actions, stale-write conflict, JSON upgrade atomic RPC, and refusal cases.
- `db/tests/migration_183_checks.sql` is a database-owner/service-role SQL harness with `BEGIN` and terminal `ROLLBACK`; it covers single-option hidden/override cleanup, option/group cascade deletion, identical active library-group reuse, and rejection of mismatched group/assignment organizers or item IDs. It was not executed because this task forbids database operations. The Node regression suite checks the harness and migration invariants without connecting to a database.
- Affected menu/action suites: **63/63 passed**; Stage 17 suite: **14/14 passed**.
- `npx tsc --noEmit --pretty false`: passed with no diagnostics.
- Targeted ESLint: **0 errors**, one warning at `lib/__tests__/storefront-browse.test.cjs:1248` (`CatalogCard` assigned but unused).
- `git diff --check`: rerun before commit handoff; no database reads/writes, migration executions, staging seed, or cleanup scripts were run.

## Deferred and open product questions

- Deferred: custom dietary tags and allergens (schema/checks/UI policy needed); bulk import (format, conflict and price validation, and rollback UX need a product decision); option image optimization (thumbnail sizing, storage limits, and transformation pipeline); promotions, popup UI, analytics, and customer-side Phase 3 polish.
- Product questions for a later phase: should paid add-on defaults ever be preselected after explicit customer-facing confirmation and pricing review; should templates gain per-organizer saved versions; what import source and conflict policy should bulk import support. The current behavior remains: paid add-on defaults are ignored by storefront defaults.
- No blocker remains for review of the authored code. Do not apply migration 183 or run staging seed/cleanup until the owner approves the checkpoint.
