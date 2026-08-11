-- migration_70_recipients.sql
-- Phase A of the Recipient/Ledger/Payout architecture (see design review in
-- chat history — not yet summarized into a doc in this repo). Creates the
-- `recipients` table and its resolution/get-or-create function only.
--
-- Deliberately inert: nothing in the current codebase calls
-- resolve_recipient() yet, and no trigger creates recipients rows. The only
-- intended caller is a future Phase B ledger-credit RPC that does not exist
-- yet. No existing payment flow (donate/intent, create-payment-intent,
-- checkout/product, the Stripe webhook) is touched by this migration.
--
-- Recipient creation is lazy by design (confirmed during architecture
-- review): a recipients row is only ever created as a side effect of a
-- recipient's first ledger credit (Phase B), not eagerly for every
-- user/organizer/business that could theoretically earn money.
--
-- recipient_type + exactly-one-FK shape: `recipients` is a thin pointer,
-- deliberately duplicating no identity data (name/email/verification/
-- business info stays on profiles/organizers/businesses). One partial
-- unique index per identity column enforces "at most one recipient row per
-- underlying owner" without a shared surrogate uniqueness trick.
--
-- ON DELETE RESTRICT on all three identity FKs (not CASCADE, not SET NULL):
-- once a recipient has ledger history (Phase B+), the underlying
-- user/organizer/business must not be deletable out from under it and
-- silently orphan financial records. This does mean deleting a
-- user/organizer/business that has an associated recipients row will fail
-- until that's addressed in a later phase — acceptable for now since no
-- recipients rows exist yet (this migration doesn't backfill any).
--
-- RLS: SELECT restricted to the direct owner (auth.uid() = user_id, the
-- organizer's own user_id, or the business's own owner_id) plus platform
-- admin. Deliberately does NOT reference entity_members roles at all --
-- the existing ENTITY_ROLES_FINANCE_VIEW constant (lib/entity-auth.ts)
-- includes 'manager', which conflicts with the financial-viewing matrix
-- agreed during architecture review (Manager excluded). Reconciling that
-- and deciding which entity roles see recipient/financial data is a Phase E
-- decision -- Phase A stays conservative rather than preempting it.
--
-- No INSERT/UPDATE/DELETE policy for authenticated/anon: RLS enabled with
-- only a SELECT policy means those commands are refused by default for
-- those roles, matching the pattern already used for
-- payment_reconciliation_failures (migration_69) and entity_members
-- (migration_59). The only writer is resolve_recipient() below, which is
-- SECURITY DEFINER and bypasses RLS entirely.
--
-- resolve_recipient() is get-or-create, race-safe via ON CONFLICT against
-- the same partial unique indexes this migration creates -- two concurrent
-- first-credits for the same organizer cannot create two recipient rows.
--
-- Execute privilege: verified live (pg_default_acl) that this database's
-- default ACL for new functions in schema public grants EXECUTE directly
-- to postgres/anon/authenticated/service_role each, independently of the
-- PUBLIC pseudo-role -- confirmed empirically against an existing function
-- (ensure_business_organizer, migration_58), which has separate grantee
-- rows for PUBLIC and for service_role in information_schema.routine_
-- privileges. This means `REVOKE ... FROM PUBLIC` alone does NOT revoke
-- anon/authenticated's access -- each holds its own direct grant. anon and
-- authenticated are revoked explicitly by name below; service_role is
-- granted explicitly by name so the intended permission model is legible
-- in this file rather than depending on knowledge of Supabase's default
-- ACLs (it would already have access via the default ACL either way).
-- This must only ever be called from a trusted server-side context (the
-- future Phase B webhook RPC), never directly by an authenticated client --
-- a client should never be able to force-create a recipient row for an
-- arbitrary organizer_id/business_id it doesn't own, even though doing so
-- wouldn't itself move money. Matches the security invariant that
-- recipient resolution starts from trusted server-side context outward,
-- never from a client-supplied id.

BEGIN;

-- 1. Table
CREATE TABLE IF NOT EXISTS recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('user', 'organizer', 'business')),
  user_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  organizer_id UUID REFERENCES organizers(id) ON DELETE RESTRICT,
  business_id UUID REFERENCES businesses(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipients_exactly_one_identity CHECK (
    (recipient_type = 'user' AND user_id IS NOT NULL AND organizer_id IS NULL AND business_id IS NULL)
    OR (recipient_type = 'organizer' AND organizer_id IS NOT NULL AND user_id IS NULL AND business_id IS NULL)
    OR (recipient_type = 'business' AND business_id IS NOT NULL AND user_id IS NULL AND organizer_id IS NULL)
  )
);

-- 2. At most one recipient row per underlying owner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipients_user_id
  ON recipients(user_id) WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipients_organizer_id
  ON recipients(organizer_id) WHERE organizer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recipients_business_id
  ON recipients(business_id) WHERE business_id IS NOT NULL;

-- 3. RLS
ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners and admins can view their recipient record" ON recipients;
CREATE POLICY "Owners and admins can view their recipient record"
  ON recipients FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM organizers
      WHERE organizers.id = recipients.organizer_id
        AND organizers.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM businesses
      WHERE businesses.id = recipients.business_id
        AND businesses.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

-- No INSERT/UPDATE/DELETE policy -- refused by default for authenticated/anon.

-- 4. Resolution / get-or-create function.
CREATE OR REPLACE FUNCTION resolve_recipient(
  p_recipient_type TEXT,
  p_user_id UUID DEFAULT NULL,
  p_organizer_id UUID DEFAULT NULL,
  p_business_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  result_id UUID;
BEGIN
  IF p_recipient_type = 'user' THEN
    IF p_user_id IS NULL OR p_organizer_id IS NOT NULL OR p_business_id IS NOT NULL THEN
      RAISE EXCEPTION 'resolve_recipient: user recipient requires user_id only';
    END IF;

    INSERT INTO recipients (recipient_type, user_id)
    VALUES ('user', p_user_id)
    ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO NOTHING
    RETURNING id INTO result_id;

    IF result_id IS NULL THEN
      SELECT id INTO result_id FROM recipients WHERE user_id = p_user_id;
    END IF;

  ELSIF p_recipient_type = 'organizer' THEN
    IF p_organizer_id IS NULL OR p_user_id IS NOT NULL OR p_business_id IS NOT NULL THEN
      RAISE EXCEPTION 'resolve_recipient: organizer recipient requires organizer_id only';
    END IF;

    INSERT INTO recipients (recipient_type, organizer_id)
    VALUES ('organizer', p_organizer_id)
    ON CONFLICT (organizer_id) WHERE organizer_id IS NOT NULL DO NOTHING
    RETURNING id INTO result_id;

    IF result_id IS NULL THEN
      SELECT id INTO result_id FROM recipients WHERE organizer_id = p_organizer_id;
    END IF;

  ELSIF p_recipient_type = 'business' THEN
    IF p_business_id IS NULL OR p_user_id IS NOT NULL OR p_organizer_id IS NOT NULL THEN
      RAISE EXCEPTION 'resolve_recipient: business recipient requires business_id only';
    END IF;

    INSERT INTO recipients (recipient_type, business_id)
    VALUES ('business', p_business_id)
    ON CONFLICT (business_id) WHERE business_id IS NOT NULL DO NOTHING
    RETURNING id INTO result_id;

    IF result_id IS NULL THEN
      SELECT id INTO result_id FROM recipients WHERE business_id = p_business_id;
    END IF;

  ELSE
    RAISE EXCEPTION 'resolve_recipient: unknown recipient_type %', p_recipient_type;
  END IF;

  RETURN result_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION resolve_recipient(TEXT, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION resolve_recipient(TEXT, UUID, UUID, UUID) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
