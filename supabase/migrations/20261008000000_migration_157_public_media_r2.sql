-- Public R2 media metadata. Objects are intentionally public after processing;
-- raw uploads live in the separate private R2_TMP_BUCKET and are never listed here.
BEGIN;

CREATE TABLE IF NOT EXISTS public.media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.organizers(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  uploader_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'image/webp',
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 2000),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 2000),
  purpose TEXT NOT NULL CHECK (
    purpose IN ('event_image', 'article_image', 'product_image', 'campaign_image', 'logo', 'avatar', 'cms')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT media_content_type_webp_check CHECK (content_type = 'image/webp'),
  CONSTRAINT media_owner_scope_check CHECK (
    (purpose IN ('event_image', 'article_image', 'product_image', 'campaign_image', 'logo')
      AND tenant_id IS NOT NULL AND owner_user_id IS NULL)
    OR (purpose IN ('avatar', 'cms') AND tenant_id IS NULL AND owner_user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS media_tenant_created_idx
  ON public.media (tenant_id, created_at DESC) WHERE tenant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_owner_created_idx
  ON public.media (owner_user_id, created_at DESC) WHERE owner_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS media_purpose_idx ON public.media (purpose);

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.media FROM anon, authenticated;
GRANT SELECT ON TABLE public.media TO authenticated;
GRANT ALL ON TABLE public.media TO service_role;

DROP POLICY IF EXISTS media_select_tenant_members ON public.media;
CREATE POLICY media_select_tenant_members ON public.media
  FOR SELECT TO authenticated
  USING (
    tenant_id IS NOT NULL
    AND is_entity_member(tenant_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
  );

DROP POLICY IF EXISTS media_select_personal_owner ON public.media;
CREATE POLICY media_select_personal_owner ON public.media
  FOR SELECT TO authenticated
  USING (purpose = 'avatar' AND owner_user_id = auth.uid());

DROP POLICY IF EXISTS media_select_cms_active_admin ON public.media;
CREATE POLICY media_select_cms_active_admin ON public.media
  FOR SELECT TO authenticated
  USING (
    purpose = 'cms'
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
        AND p.status = 'active'
        AND p.deleted_at IS NULL
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
