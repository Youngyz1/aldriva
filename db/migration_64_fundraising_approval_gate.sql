-- migration_64_fundraising_approval_gate.sql
-- Phase 9 of the Entity architecture: the first real enforcement point for
-- a Phase 2 capability flag. organizers.fundraising_approved has existed
-- since migration_61 as "tracked and admin-visible only — not wired to
-- enforce anything yet." This migration wires it into the one place it
-- most directly maps to: creating a NEW fundraiser under an organizer.
--
-- Scope, deliberately narrow:
--   - Only gates INSERT (launching a new campaign), not UPDATE. An
--     organizer that later has fundraising_approved revoked by an admin
--     should still be able to edit fundraisers it already launched — this
--     mirrors how organizers.status='active' on businesses only gates
--     visibility/creation, not every subsequent edit to existing content.
--   - Only applies when organizer_id is set. Fundraisers created without
--     an organizer affiliation (the legacy user_id-only path) are
--     untouched — this migration only narrows the organizer-affiliated
--     path, it does not newly restrict something that was previously
--     unrestricted for the no-organizer case.
--   - Does NOT touch payment_enabled — that flag's enforcement is a
--     separate, later phase scoped to actual payment/payout flows.
--   - Does NOT touch profiles.identity_status — no specific feature this
--     flag should gate was specified; wiring it here would be a guess at
--     product scope broader than "fundraising_approved gates fundraiser
--     creation," which is the one unambiguous flag-to-feature mapping.
--
-- Closes a pre-existing gap found during audit: the live INSERT policy
-- had NO organizer-OWNERSHIP check at all — any authenticated user could
-- set an arbitrary organizer_id on a pending_review fundraiser. Without
-- also closing this, the fundraising_approved check alone would only
-- narrow WHICH organizers could be impersonated, not prevent
-- impersonation itself.
--
-- can_create_fundraiser_for_organizer() combines both requirements
-- (ownership/entity access AND fundraising_approved) in one EXISTS with a
-- single WHERE clause, rather than nesting an AND inside an OR branch
-- inline in the policy body. Functionally identical to the inline version
-- reviewed earlier — same two-branch truth table (organizer_id NULL, or
-- ownership-and-approved) — but factored out because the nested form
-- proved hard to verify by eye even though it was correct; this shape
-- makes "both conditions required together" visually unambiguous, no
-- paren-depth counting needed. SECURITY INVOKER, same as
-- is_entity_member() — only ever evaluates under the caller's own
-- already-RLS-scoped auth.uid(), no elevation.

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
      AND organizers.fundraising_approved = true
      AND (
        organizers.user_id = auth.uid()
        OR is_entity_member(p_organizer_id, ARRAY['owner','admin','manager','editor'])
      )
  );
$$;

DROP POLICY IF EXISTS "Anyone can create a fundraiser pending review" ON fundraisers;
CREATE POLICY "Anyone can create a fundraiser pending review" ON fundraisers
  FOR INSERT
  WITH CHECK (
    (status = 'pending_review')
    AND (
      (organizer_id IS NULL)
      OR can_create_fundraiser_for_organizer(organizer_id)
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
