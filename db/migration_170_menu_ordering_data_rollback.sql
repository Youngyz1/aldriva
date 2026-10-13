-- Roll back Phase 2b-1 menu ordering data.
ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_option_groups_check,
  DROP CONSTRAINT IF EXISTS menu_items_promo_price_check,
  DROP COLUMN IF EXISTS option_groups,
  DROP COLUMN IF EXISTS promo_price,
  DROP COLUMN IF EXISTS is_sold_out;

DROP FUNCTION IF EXISTS menu_option_groups_valid(jsonb);
