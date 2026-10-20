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
REVOKE ALL ON public.promotions, public.promotion_targets FROM anon, authenticated;
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
