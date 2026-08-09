-- migration_68_relax_fundraising_approval_requirement.sql
-- Relaxes migration_64 (Phase 9): fundraiser creation no longer requires
-- organizers.fundraising_approved. Confirmed while scoping the payout
-- feature: there is no Stripe Connect and no per-organizer payment
-- routing anywhere in this codebase (every donation lands in the
-- platform's single Stripe account, not the organizer's) — so
-- fundraising_approved cannot currently mean "can this organizer receive
-- money," because nothing routes money to organizers at all yet.
-- Gating fundraiser CREATION on it was therefore blocking content
-- creation for a capability (per-organizer payout) that doesn't exist to
-- protect. Donations flowing into the platform's own account doesn't
-- depend on withdrawal existing.
--
-- Deliberately narrow: only removes the fundraising_approved clause.
-- The ownership/entity-access requirement this same function enforces —
-- the fix that closed the actual impersonation gap (any authenticated
-- user could previously set an arbitrary organizer_id on a fundraiser) —
-- is untouched. This is not a revert of Phase 9, only of its approval
-- half.
--
-- organizers.fundraising_approved and payment_enabled are NOT dropped or
-- made meaningless by this migration — they remain real, tracked,
-- admin-visible flags (Phase 2). Their eventual enforcement point is the
-- payout/withdrawal feature itself, not fundraiser creation — that
-- feature's design (ledger schema, Stripe Connect vs. manual payout) is
-- still pending a decision and is explicitly out of scope here.

BEGIN;

CREATE OR REPLACE FUNCTION can_create_fundraiser_for_organizer(p_organizer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organizers
    WHERE organizers.id = p_organizer_id
      AND (
        organizers.user_id = auth.uid()
        OR is_entity_member(p_organizer_id, ARRAY['owner','admin','manager','editor'])
      )
  );
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
