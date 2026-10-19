-- Phase 0 read-only inventory for menu option normalization.
-- This file contains SELECT statements only. It does not read the migration ledger
-- and does not prove that a migration ran; it checks for the resulting schema objects.

-- Answers whether the expected tables and representative columns from migrations
-- 134, 136, 170, 171, and 177 exist in the public schema.
WITH expected(migration, table_name, column_name) AS (
  VALUES
    ('134', 'homepage_promotions', 'id'),
    ('134', 'homepage_promotions', 'status'),
    ('134', 'homepage_promotions', 'starts_at'),
    ('134', 'homepage_promotions', 'ends_at'),
    ('136', 'menu_sections', 'organizer_id'),
    ('136', 'menu_items', 'section_id'),
    ('136', 'menu_items', 'modifiers'),
    ('136', 'menu_items', 'dietary_tags'),
    ('136', 'menu_items', 'allergens'),
    ('170', 'menu_items', 'promo_price'),
    ('170', 'menu_items', 'is_sold_out'),
    ('170', 'menu_items', 'option_groups'),
    ('171', 'orders', 'organizer_id'),
    ('171', 'orders', 'items'),
    ('171', 'orders', 'created_at'),
    ('177', 'promo_codes', 'tenant_id'),
    ('177', 'promo_codes', 'code'),
    ('177', 'promo_codes', 'percent_off'),
    ('177', 'promo_codes', 'fixed_off_minor'),
    ('177', 'promo_codes', 'starts_at'),
    ('177', 'promo_codes', 'expires_at'),
    ('177', 'promo_codes', 'is_active')
), checked AS (
  SELECT
    expected.*,
    to_regclass(format('public.%I', expected.table_name)) IS NOT NULL AS table_exists,
    EXISTS (
      SELECT 1
      FROM information_schema.columns AS column_info
      WHERE column_info.table_schema = 'public'
        AND column_info.table_name = expected.table_name
        AND column_info.column_name = expected.column_name
    ) AS column_exists
  FROM expected
)
SELECT
  migration,
  CASE WHEN bool_and(table_exists AND column_exists)
    THEN 'looks applied from schema objects'
    ELSE 'missing one or more expected objects'
  END AS schema_status,
  count(*) FILTER (WHERE table_exists AND column_exists) AS expected_columns_found,
  count(*) AS expected_columns_checked,
  string_agg(
    format('%I.%I: %s', table_name, column_name,
      CASE WHEN table_exists AND column_exists THEN 'present' ELSE 'missing' END),
    '; ' ORDER BY table_name, column_name
  ) AS object_checks
FROM checked
GROUP BY migration
ORDER BY migration;

-- Answers exact row counts for menu-related tables and the number of organizers
-- represented by at least one menu item. Missing tables/columns return NULL.
WITH count_queries(label, table_name, required_columns, query_text) AS (
  VALUES
    ('organizers with menu items', 'menu_items', ARRAY['organizer_id']::text[],
      'SELECT count(DISTINCT organizer_id) AS row_count FROM public.menu_items'),
    ('menu_sections', 'menu_sections', ARRAY['id']::text[],
      'SELECT count(*) AS row_count FROM public.menu_sections'),
    ('menu_items', 'menu_items', ARRAY['id']::text[],
      'SELECT count(*) AS row_count FROM public.menu_items'),
    ('orders', 'orders', ARRAY['id']::text[],
      'SELECT count(*) AS row_count FROM public.orders')
)
SELECT
  count_queries.label,
  CASE
    WHEN to_regclass(format('public.%I', count_queries.table_name)) IS NULL THEN 'table missing'
    WHEN EXISTS (
      SELECT 1 FROM unnest(count_queries.required_columns) AS required(column_name)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = count_queries.table_name
          AND column_info.column_name = required.column_name
      )
    ) THEN 'required column missing'
    ELSE 'available'
  END AS availability,
  CASE
    WHEN to_regclass(format('public.%I', count_queries.table_name)) IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM unnest(count_queries.required_columns) AS required(column_name)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = count_queries.table_name
          AND column_info.column_name = required.column_name
      )
    ) THEN NULL
    ELSE (xpath('/table/row/row_count/text()',
      query_to_xml(count_queries.query_text, false, false, '')))[1]::text::bigint
  END AS exact_row_count
FROM count_queries
ORDER BY count_queries.label;

-- Answers the number of menu items with non-empty option_groups and the total
-- number of embedded groups and options. NULL means migration 170's column is absent.
SELECT
  CASE
    WHEN to_regclass('public.menu_items') IS NULL OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'option_groups'
    ) THEN NULL
    ELSE (xpath('/table/row/metrics/text()', query_to_xml($query$
      WITH menu_rows AS (
        SELECT id,
          CASE WHEN jsonb_typeof(option_groups) = 'array' THEN option_groups ELSE '[]'::jsonb END AS groups_json
        FROM public.menu_items
      ), group_rows AS (
        SELECT menu_rows.id AS item_id, group_entry.group_json
        FROM menu_rows
        CROSS JOIN LATERAL jsonb_array_elements(menu_rows.groups_json) AS group_entry(group_json)
      ), option_rows AS (
        SELECT group_rows.item_id, option_entry.option_json
        FROM group_rows
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(group_rows.group_json->'options') = 'array'
            THEN group_rows.group_json->'options' ELSE '[]'::jsonb END
        ) AS option_entry(option_json)
      )
      SELECT jsonb_build_object(
        'items_with_nonempty_option_groups',
          (SELECT count(*) FROM menu_rows WHERE jsonb_array_length(groups_json) > 0),
        'groups_total', (SELECT count(*) FROM group_rows),
        'options_total', (SELECT count(*) FROM option_rows)
      ) AS metrics
    $query$, false, false, '')))[1]::text::jsonb
  END AS option_group_metrics;

-- Answers how many menu_items rows contain non-empty legacy modifiers JSON.
-- NULL means migration 136's modifiers column is absent.
SELECT
  CASE
    WHEN to_regclass('public.menu_items') IS NULL OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'modifiers'
    ) THEN NULL
    ELSE (xpath('/table/row/row_count/text()', query_to_xml(
      'SELECT count(*) AS row_count FROM public.menu_items WHERE modifiers IS NOT NULL AND modifiers <> ''[]''::jsonb AND modifiers <> ''null''::jsonb',
      false, false, '')))[1]::text::bigint
  END AS items_with_nonempty_legacy_modifiers;

-- Answers the requested option_groups data-quality counts. Duplicate IDs are
-- counted within their item/group scope; group and option field sets are checked
-- against the legacy JSON contract. NULL means migration 170's column is absent.
SELECT
  CASE
    WHEN to_regclass('public.menu_items') IS NULL OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'option_groups'
    ) THEN NULL
    ELSE (xpath('/table/row/metrics/text()', query_to_xml($query$
      WITH menu_rows AS (
        SELECT id,
          CASE WHEN jsonb_typeof(option_groups) = 'array' THEN option_groups ELSE '[]'::jsonb END AS groups_json
        FROM public.menu_items
      ), group_rows AS (
        SELECT menu_rows.id AS item_id, group_entry.ordinality - 1 AS group_index, group_entry.group_json
        FROM menu_rows
        CROSS JOIN LATERAL jsonb_array_elements(menu_rows.groups_json)
          WITH ORDINALITY AS group_entry(group_json, ordinality)
      ), option_rows AS (
        SELECT group_rows.item_id, group_rows.group_index, option_entry.option_json
        FROM group_rows
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(group_rows.group_json->'options') = 'array'
            THEN group_rows.group_json->'options' ELSE '[]'::jsonb END
        ) AS option_entry(option_json)
      ), expected_group_fields AS (
        SELECT ARRAY['id', 'name', 'required', 'min', 'max', 'options']::text[] AS field_names
      ), expected_option_fields AS (
        SELECT ARRAY['id', 'name', 'price_delta']::text[] AS field_names
      )
      SELECT jsonb_build_object(
        'duplicate_group_ids_within_item', (
          SELECT count(*) FROM (
            SELECT item_id, group_json->>'id' AS group_id
            FROM group_rows
            WHERE NULLIF(btrim(group_json->>'id'), '') IS NOT NULL
            GROUP BY item_id, group_json->>'id'
            HAVING count(*) > 1
          ) AS duplicate_groups
        ),
        'duplicate_option_ids_within_group', (
          SELECT count(*) FROM (
            SELECT item_id, group_index, option_json->>'id' AS option_id
            FROM option_rows
            WHERE NULLIF(btrim(option_json->>'id'), '') IS NOT NULL
            GROUP BY item_id, group_index, option_json->>'id'
            HAVING count(*) > 1
          ) AS duplicate_options
        ),
        'groups_with_min_greater_than_max', (
          SELECT count(*) FROM group_rows
          WHERE jsonb_typeof(group_json->'min') = 'number'
            AND jsonb_typeof(group_json->'max') = 'number'
            AND (group_json->>'min')::numeric > (group_json->>'max')::numeric
        ),
        'groups_with_max_less_than_1', (
          SELECT count(*) FROM group_rows
          WHERE jsonb_typeof(group_json->'max') = 'number'
            AND (group_json->>'max')::numeric < 1
        ),
        'groups_with_missing_or_unknown_fields', (
          SELECT count(*) FROM group_rows
          WHERE jsonb_typeof(group_json) IS DISTINCT FROM 'object'
            OR EXISTS (
              SELECT 1 FROM expected_group_fields,
                unnest(expected_group_fields.field_names) AS expected(field_name)
              WHERE NOT ((
                CASE WHEN jsonb_typeof(group_json) = 'object' THEN group_json ELSE '{}'::jsonb END
              ) ? expected.field_name)
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_object_keys(
                CASE WHEN jsonb_typeof(group_json) = 'object' THEN group_json ELSE '{}'::jsonb END
              ) AS present(field_name), expected_group_fields
              WHERE NOT (present.field_name = ANY(expected_group_fields.field_names))
            )
        ),
        'options_with_missing_or_unknown_fields', (
          SELECT count(*) FROM option_rows
          WHERE jsonb_typeof(option_json) IS DISTINCT FROM 'object'
            OR EXISTS (
              SELECT 1 FROM expected_option_fields,
                unnest(expected_option_fields.field_names) AS expected(field_name)
              WHERE NOT ((
                CASE WHEN jsonb_typeof(option_json) = 'object' THEN option_json ELSE '{}'::jsonb END
              ) ? expected.field_name)
            )
            OR EXISTS (
              SELECT 1 FROM jsonb_object_keys(
                CASE WHEN jsonb_typeof(option_json) = 'object' THEN option_json ELSE '{}'::jsonb END
              ) AS present(field_name), expected_option_fields
              WHERE NOT (present.field_name = ANY(expected_option_fields.field_names))
            )
        ),
        'option_arrays_over_20', (
          SELECT count(*) FROM group_rows
          WHERE jsonb_typeof(group_json->'options') = 'array'
            AND jsonb_array_length(group_json->'options') > 20
        ),
        'menu_items_with_group_arrays_over_8', (
          SELECT count(*) FROM menu_rows WHERE jsonb_array_length(groups_json) > 8
        )
      ) AS metrics
    $query$, false, false, '')))[1]::text::jsonb
  END AS option_group_data_quality;

-- Answers which legacy option ID strings collide across different menu_items.
-- The result is a JSON array of IDs and the item IDs that share each one.
-- NULL means migration 170's option_groups column is absent.
SELECT
  CASE
    WHEN to_regclass('public.menu_items') IS NULL OR NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'menu_items' AND column_name = 'option_groups'
    ) THEN NULL
    ELSE (xpath('/table/row/collisions/text()', query_to_xml($query$
      WITH menu_rows AS (
        SELECT id,
          CASE WHEN jsonb_typeof(option_groups) = 'array' THEN option_groups ELSE '[]'::jsonb END AS groups_json
        FROM public.menu_items
      ), option_ids AS (
        SELECT menu_rows.id AS item_id, option_entry.option_json->>'id' AS option_id
        FROM menu_rows
        CROSS JOIN LATERAL jsonb_array_elements(menu_rows.groups_json) AS group_entry(group_json)
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(group_entry.group_json->'options') = 'array'
            THEN group_entry.group_json->'options' ELSE '[]'::jsonb END
        ) AS option_entry(option_json)
        WHERE option_entry.option_json ? 'id'
      ), collisions AS (
        SELECT option_id, count(DISTINCT item_id) AS item_count,
          jsonb_agg(DISTINCT item_id ORDER BY item_id) AS item_ids
        FROM option_ids
        GROUP BY option_id
        HAVING count(DISTINCT item_id) > 1
      )
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('option_id', option_id, 'item_count', item_count, 'item_ids', item_ids)
        ORDER BY option_id
      ), '[]'::jsonb) AS collisions
      FROM collisions
    $query$, false, false, '')))[1]::text::jsonb
  END AS option_id_collisions_across_items;

-- Answers how many orders have non-empty chosen_options snapshots and how many
-- orders were created in the 30 days before the database's current timestamp.
-- NULL means migration 171's orders.items or created_at column is absent.
SELECT
  CASE
    WHEN to_regclass('public.orders') IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'items'
      )
      OR NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_at'
      ) THEN NULL
    ELSE (xpath('/table/row/metrics/text()', query_to_xml($query$
      SELECT jsonb_build_object(
        'orders_with_option_snapshots', (
          SELECT count(*) FROM public.orders AS order_row
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements(
              CASE WHEN jsonb_typeof(order_row.items) = 'array' THEN order_row.items ELSE '[]'::jsonb END
            ) AS item_line(line_json)
            WHERE jsonb_typeof(item_line.line_json->'chosen_options') = 'array'
              AND jsonb_array_length(item_line.line_json->'chosen_options') > 0
          )
        ),
        'orders_last_30_days', (
          SELECT count(*) FROM public.orders
          WHERE created_at >= now() - interval '30 days'
        )
      ) AS metrics
    $query$, false, false, '')))[1]::text::jsonb
  END AS order_inventory_metrics;

-- Answers exact homepage_promotions and promo_codes row counts when each table
-- and its identifying columns exist. A missing table/column returns NULL.
WITH optional_count_queries(label, table_name, required_columns, query_text) AS (
  VALUES
    ('homepage_promotions', 'homepage_promotions', ARRAY['id']::text[],
      'SELECT count(*) AS row_count FROM public.homepage_promotions'),
    ('promo_codes', 'promo_codes', ARRAY['id', 'tenant_id', 'code']::text[],
      'SELECT count(*) AS row_count FROM public.promo_codes')
)
SELECT
  optional_count_queries.label,
  CASE
    WHEN to_regclass(format('public.%I', optional_count_queries.table_name)) IS NULL THEN 'table missing'
    WHEN EXISTS (
      SELECT 1 FROM unnest(optional_count_queries.required_columns) AS required(column_name)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = optional_count_queries.table_name
          AND column_info.column_name = required.column_name
      )
    ) THEN 'required column missing'
    ELSE 'available'
  END AS availability,
  CASE
    WHEN to_regclass(format('public.%I', optional_count_queries.table_name)) IS NULL THEN NULL
    WHEN EXISTS (
      SELECT 1 FROM unnest(optional_count_queries.required_columns) AS required(column_name)
      WHERE NOT EXISTS (
        SELECT 1 FROM information_schema.columns AS column_info
        WHERE column_info.table_schema = 'public'
          AND column_info.table_name = optional_count_queries.table_name
          AND column_info.column_name = required.column_name
      )
    ) THEN NULL
    ELSE (xpath('/table/row/row_count/text()',
      query_to_xml(optional_count_queries.query_text, false, false, '')))[1]::text::bigint
  END AS exact_row_count
FROM optional_count_queries
ORDER BY optional_count_queries.label;

-- Interpretation guide:
-- * A migration marked "looks applied" has all listed representative objects;
--   missing objects mean the schema is partial or that migration is not applied.
-- * Zero embedded groups/options and zero option snapshots simplify backfill. Any
--   nonzero counts mean the JSON and historical order snapshots must be preserved.
-- * Duplicate IDs, invalid selection bounds, unknown JSON fields, or over-limit
--   arrays make normalization riskier; inspect those rows before any Phase 1 write.
-- * Cross-item ID collisions do not prove a shared library identity; legacy IDs
--   were item-scoped strings. Compare names and prices before any deduplication.
-- * Non-empty modifiers are reported separately; Phase 1 must leave them untouched.
-- * Counts obey the SQL Editor role's visibility/RLS. Run as an authorized role
--   that can read all tenant rows for a complete inventory.
