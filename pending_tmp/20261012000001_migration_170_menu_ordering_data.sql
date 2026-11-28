-- Phase 2b-1: Menu ordering data: option groups, sold-out flag, and promo price.
-- Additive only on menu_items. Existing rows receive defaults (is_sold_out = false,
-- promo_price = NULL, option_groups = '[]'). Existing RLS policies remain unchanged:
-- public SELECT still filters on is_active = true, allowing sold-out items to display
-- with a sold-out badge while hidden items remain hidden.

-- 1. Validation function for option_groups JSONB structure
CREATE OR REPLACE FUNCTION menu_option_groups_valid(og jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN og IS NULL OR jsonb_typeof(og) <> 'array' THEN false
    WHEN jsonb_array_length(og) > 8 THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(og) AS grp
      WHERE CASE
        WHEN jsonb_typeof(grp) <> 'object' THEN true
        WHEN jsonb_typeof(grp->'id') IS DISTINCT FROM 'string'
          OR char_length(grp->>'id') NOT BETWEEN 1 AND 80 THEN true
        WHEN jsonb_typeof(grp->'name') IS DISTINCT FROM 'string'
          OR char_length(grp->>'name') NOT BETWEEN 1 AND 80 THEN true
        WHEN jsonb_typeof(grp->'required') IS DISTINCT FROM 'boolean' THEN true
        WHEN jsonb_typeof(grp->'min') IS DISTINCT FROM 'number'
          OR (grp->>'min')::numeric <> (grp->>'min')::integer
          OR (grp->>'min')::integer < 0 THEN true
        WHEN jsonb_typeof(grp->'max') IS DISTINCT FROM 'number'
          OR (grp->>'max')::numeric <> (grp->>'max')::integer
          OR (grp->>'max')::integer < (grp->>'min')::integer THEN true
        WHEN (grp->>'required')::boolean IS TRUE AND (grp->>'min')::integer < 1 THEN true
        WHEN grp->'options' IS NULL OR jsonb_typeof(grp->'options') <> 'array'
          OR jsonb_array_length(grp->'options') > 20
          OR (grp->>'max')::integer > jsonb_array_length(grp->'options') THEN true
        ELSE EXISTS (
          SELECT 1 FROM jsonb_array_elements(grp->'options') AS opt
          WHERE CASE
            WHEN jsonb_typeof(opt) <> 'object' THEN true
            WHEN jsonb_typeof(opt->'id') IS DISTINCT FROM 'string'
              OR char_length(opt->>'id') NOT BETWEEN 1 AND 80 THEN true
            WHEN jsonb_typeof(opt->'name') IS DISTINCT FROM 'string'
              OR char_length(opt->>'name') NOT BETWEEN 1 AND 80 THEN true
            WHEN jsonb_typeof(opt->'price_delta') IS DISTINCT FROM 'number'
              OR (opt->>'price_delta')::numeric < -10000
              OR (opt->>'price_delta')::numeric > 10000 THEN true
            ELSE false
          END
        )
      END
    )
  END
$$;

COMMENT ON FUNCTION menu_option_groups_valid(jsonb) IS
  'Validates menu item option_groups: array <= 8 groups; id & name 1-80; required bool; 0 <= min <= max <= options count <= 20; required => min >= 1; options price_delta -10000..10000.';

-- 2. Add additive columns to menu_items
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS is_sold_out boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_price numeric(12, 2) NULL,
  ADD COLUMN IF NOT EXISTS option_groups jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Constraints on promo_price and option_groups
ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_promo_price_check,
  ADD CONSTRAINT menu_items_promo_price_check
    CHECK (promo_price IS NULL OR (promo_price >= 0 AND promo_price < price));

ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_option_groups_check,
  ADD CONSTRAINT menu_items_option_groups_check
    CHECK (menu_option_groups_valid(option_groups));

COMMENT ON COLUMN public.menu_items.is_sold_out IS 'When true, dish displays as Sold Out but remains visible on public menu.';
COMMENT ON COLUMN public.menu_items.promo_price IS 'Discounted promotional price. Must be strictly less than price and >= 0.';
COMMENT ON COLUMN public.menu_items.option_groups IS 'JSONB array of option groups (max 8) with choices (max 20) and price deltas.';
