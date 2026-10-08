-- Removes only the R2 media metadata table and its indexes/policies.
BEGIN;

DROP POLICY IF EXISTS media_select_cms_active_admin ON public.media;
DROP POLICY IF EXISTS media_select_personal_owner ON public.media;
DROP POLICY IF EXISTS media_select_tenant_members ON public.media;
DROP TABLE IF EXISTS public.media;

COMMIT;

NOTIFY pgrst, 'reload schema';
