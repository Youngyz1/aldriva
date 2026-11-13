-- migration_173_order_online_payment.sql
-- Phase 3: Online card payment for orders (Stripe, USD only).
-- Files only; NOT yet applied.
--
-- ── A. orders payment columns (additive only) ─────────────────────────────
--
-- payment_expires_at: deadline of the Stripe PaymentIntent window for
--   payment_method='online' orders. Set at intent creation (now + 30 min).
--   NULL for pay-on-fulfilment orders (no expiry concept). There is no cron:
--   the owner list labels an online+unpaid order "expired" at read time once
--   this timestamp passes. Existing rows keep NULL = unchanged behavior.
--
-- No new payment_status value: pending + unpaid (+ payment_expires_at)
--   already expresses "awaiting payment". Owner labels derive from
--   (payment_method, payment_status): online+paid = Paid, online+unpaid =
--   Awaiting payment (or Expired past the deadline), on_fulfilment+unpaid =
--   To collect. RLS is unchanged.
--
-- Reuses the existing provider / provider_reference columns for
--   ('stripe', pi_...) on online orders.
--
-- Unique partial index on (provider, provider_reference): a Stripe payment
--   may match at most one order, so webhook retries and double-delivery can
--   never credit two rows. Partial (WHERE NOT NULL) so legacy and
--   pay-on-fulfilment rows with NULLs are unaffected.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_expires_at timestamptz NULL;

COMMENT ON COLUMN public.orders.payment_expires_at IS
  'Online-payment intent deadline (now + 30 min at intent creation). NULL for pay-on-fulfilment orders. Read-time expired labeling only; no cron.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_provider_reference
  ON public.orders(provider, provider_reference)
  WHERE provider IS NOT NULL AND provider_reference IS NOT NULL;

-- ── B. Slug fix for future business auto-created organizers ───────────────
--
-- ROOT CAUSE of production slug "ams-bidjan" for business "Sams Abidjan":
-- ensure_business_organizer() (migrations 58, 127) ran
--   lower(regexp_replace(trim(name), '[^a-z0-9]+', '-', 'g'))
-- i.e. the case-sensitive strip ran BEFORE lowercasing, deleting capitals
-- ("Sams Abidjan" -> "ams-bidjan"). Website slugs inherit org.slug, so the
-- bad slug propagated to the site. (Migration 48 had the same order for the
-- backfill; migration 49 fixed it for existing organizers with
-- regexp_replace(lower(trim(...))).)
--
-- FIX (future rows only — no existing slug is touched): lowercase first,
-- fold common Latin accents via translate() (no extension dependency),
-- collapse runs of non [a-z0-9] to "-", trim dashes, cap at 80 chars,
-- empty -> 'business'. Mirrors lib/slug.ts.
-- SECURITY DEFINER + search_path preserved from migration 127.

CREATE OR REPLACE FUNCTION ensure_business_organizer(business_row businesses)
RETURNS UUID AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  attempt INT := 0;
  max_attempts CONSTANT INT := 1000;
  new_org_id UUID;
BEGIN
  base_slug := translate(
    lower(trim(business_row.name)),
    'àáâãäåèéêëìíîïòóôõöùúûüýÿçñ',
    'aaaaaaeeeeiiiiooooouuuuycn'
  );
  base_slug := regexp_replace(base_slug, '[^a-z0-9]+', '-', 'g');
  base_slug := regexp_replace(base_slug, '^-+|-+$', '', 'g');
  base_slug := substr(base_slug, 1, 80);
  base_slug := regexp_replace(base_slug, '-+$', '', 'g');
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
      -- Escalate to a random suffix if plain numeric suffixes keep
      -- colliding (pathological case — many identically-named businesses
      -- created concurrently) so this still terminates quickly.
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
      -- loop again with the next candidate; the failed INSERT's implicit
      -- savepoint (from this EXCEPTION block) is already rolled back, so
      -- this doesn't touch the outer transaction.
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog;
