-- Rollback for migration 194: staging drift sync.
-- Reverses each section of the forward migration. Because the forward migration
-- reproduced staging's exact definitions, this rollback drops the objects added
-- and reverts privilege changes. The function create_website_from_template is
-- dropped and recreated only if an earlier migration provides the definition;
-- otherwise it is simply dropped.

BEGIN;

-- A. Remove the staging-synced version of create_website_from_template.
-- An earlier migration may recreate a prior version; if not, the function is gone.
DROP FUNCTION IF EXISTS public.create_website_from_template(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, text, jsonb, jsonb, jsonb);

-- B. Remove rider check constraints from orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_rider_phone_check;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_rider_name_check;

-- C. Remove the organizers updated_at trigger and function
DROP TRIGGER IF EXISTS trg_organizers_updated_at ON public.organizers;
DROP FUNCTION IF EXISTS public.update_organizers_updated_at();

-- D. Re-grant the privileges revoked by the forward migration
-- (Restores the pre-194 state where authenticated had broader access)
GRANT INSERT ON public.website_content TO authenticated;
GRANT UPDATE ON public.website_content TO authenticated;
GRANT DELETE ON public.website_content TO authenticated;
GRANT TRUNCATE ON public.website_content TO authenticated;
GRANT REFERENCES ON public.website_content TO authenticated;
GRANT TRIGGER ON public.website_content TO authenticated;
GRANT TRUNCATE ON public.website_content_drafts TO authenticated;
GRANT REFERENCES ON public.website_content_drafts TO authenticated;
GRANT TRIGGER ON public.website_content_drafts TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
