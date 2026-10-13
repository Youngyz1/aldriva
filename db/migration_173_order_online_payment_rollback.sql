-- migration_173_order_online_payment_rollback.sql
-- Rollback for migration 173 (files only; 173 NOT yet applied).
--
-- Drops the payment_expiry column and the provider-reference unique index.
-- Restores the previous ensure_business_organizer() slug body (migration 127:
-- strip-before-lowercase). Existing slugs are never rewritten in either
-- direction.

DROP INDEX IF EXISTS uq_orders_provider_reference;

ALTER TABLE public.orders DROP COLUMN IF EXISTS payment_expires_at;

CREATE OR REPLACE FUNCTION ensure_business_organizer(business_row businesses)
RETURNS UUID AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  attempt INT := 0;
  max_attempts CONSTANT INT := 1000;
  new_org_id UUID;
BEGIN
  base_slug := lower(regexp_replace(trim(business_row.name), '[^a-z0-9]+', '-', 'g'));
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  IF base_slug = '' THEN base_slug := 'business'; END IF;

  LOOP
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate a unique organizer slug for business %', business_row.id;
    END IF;

    IF attempt = 0 THEN
      candidate := base_slug;
    ELSIF attempt <= 50 THEN
      candidate := base_slug || '-' || (attempt + 1);
    ELSE
      candidate := base_slug || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
    END IF;

    BEGIN
      INSERT INTO organizers (
        user_id, name, org_type, slug, bio, photo, website, contact_email,
        is_business_auto_created
      )
      VALUES (
        business_row.owner_id,
        business_row.name,
        'business',
        candidate,
        business_row.description,
        business_row.logo,
        business_row.website,
        business_row.email,
        true
      )
      RETURNING id INTO new_org_id;

      RETURN new_org_id;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;
