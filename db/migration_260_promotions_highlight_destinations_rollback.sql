-- Rollback for migration 260. Removes highlight offer type + product/page destinations.
-- Restores the promotion constraints to their migration-184 definitions.
BEGIN;

ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_destination_page_check;
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_destination_type_check;
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_destination_check;
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_offer_value_check;
ALTER TABLE public.promotions DROP CONSTRAINT IF EXISTS promotions_offer_type_check;

ALTER TABLE public.promotions ADD CONSTRAINT promotions_offer_type_check
  CHECK (offer_type = ANY (ARRAY['percent_off','special_price','free_delivery']));

ALTER TABLE public.promotions ADD CONSTRAINT promotions_offer_value_check
  CHECK (
    (offer_type = 'percent_off' AND percent_off IS NOT NULL
       AND percent_off BETWEEN 1 AND 90 AND special_price IS NULL)
    OR (offer_type = 'special_price' AND special_price IS NOT NULL
       AND special_price BETWEEN 0 AND 999999.99 AND percent_off IS NULL)
    OR (offer_type = 'free_delivery' AND percent_off IS NULL AND special_price IS NULL)
  );

ALTER TABLE public.promotions ADD CONSTRAINT promotions_destination_type_check
  CHECK (destination_type = ANY (ARRAY['item','section','menu','external','none']));

ALTER TABLE public.promotions ADD CONSTRAINT promotions_destination_check
  CHECK (
    (destination_type <> 'item' OR destination_section_id IS NULL)
    AND (destination_type <> 'section' OR destination_item_id IS NULL)
    AND (destination_type <> 'external' OR destination_url IS NOT NULL)
    AND (destination_type <> 'none' OR (destination_item_id IS NULL
         AND destination_section_id IS NULL AND destination_url IS NULL))
  );

ALTER TABLE public.promotions
  DROP COLUMN IF EXISTS destination_page,
  DROP COLUMN IF EXISTS destination_product_id;

COMMIT;
