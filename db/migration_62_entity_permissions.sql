-- migration_62_entity_permissions.sql
-- Phase 4 of the Entity architecture: wires migration_59's entity_members
-- roles (owner/admin/manager/editor/finance/viewer) into actual
-- authorization, additively alongside the existing organizers.user_id
-- ownership checks everywhere they appear.
--
-- Scope, confirmed via a live-schema audit before writing this file:
--   - entity_members' OWN write policy (INSERT/UPDATE/DELETE) is already
--     correctly locked to the true organizer owner (organizers.user_id) or
--     a platform admin (profiles.role='admin') — not touched here. An
--     entity-level 'admin' role member cannot write to entity_members
--     itself, so there is no self-escalation path through this table.
--   - Every policy below keeps its original organizers.user_id check as a
--     fallback OR branch — this migration only ever adds a new OR clause,
--     never removes or narrows an existing one.
--   - organizers.status/verified_at/payment_enabled/fundraising_approved
--     (admin-only columns, migration_60/61) are NOT touched — organizers'
--     own UPDATE policy stays owner-only, deliberately, this phase.
--   - businesses/products RLS (owner_id-based) is untouched — confirmed
--     live to have zero organizer_id/entity_members involvement.
--   - The two legacy fundraisers policies scoped to auth.uid()=user_id
--     only ("Users can delete own fundraisers", "Users can update own
--     fundraisers") are left completely alone, preserving the existing
--     redundant policy pairs rather than cleaning them up.
--
-- Role tiers used below (see lib/entity-auth.ts for the TS-side mirror):
--   ENTITY_ROLES_MANAGE        = owner, admin, manager        (delete, integrations)
--   ENTITY_ROLES_CONTENT_WRITE = owner, admin, manager, editor (create/edit content)
--   ENTITY_ROLES_ALL           = + finance, viewer             (read-only)
--
-- Two disclosed, deliberate simplifications (not oversights):
--   1. fundraiser_updates' and fundraiser_media's single ALL policies (and
--      fundraiser_media's DELETE policy) grant 'editor' delete rights on
--      individual updates/media items, not just create/edit — deleting one
--      update or photo is much lower blast-radius than deleting the whole
--      fundraiser (which stays manager+ everywhere else).
--   2. eventbrite_sources' UPDATE policy's USING clause was, before this
--      migration, `auth.uid() = user_id` only — with no organizer-based
--      branch at all, even though its WITH CHECK clause already had one.
--      That made the organizer-owner path dead code: an organizer owner
--      who wasn't eventbrite_sources.user_id could never even reach the
--      WITH CHECK evaluation. This migration adds is_entity_member(...) to
--      BOTH clauses, which — as a side effect of doing that consistently —
--      also activates that previously-inert organizer-owner path for the
--      first time. This is a disclosed widening, not a silent one: no
--      protection is removed, a previously-unreachable (but clearly
--      intended, per the existing WITH CHECK) capability becomes reachable.

BEGIN;

-- 1. Central authorization primitive. SECURITY INVOKER (not DEFINER) is
-- deliberate: this only ever needs to read under the caller's own
-- already-RLS-scoped auth.uid(), unlike migration_58/59's trigger
-- functions, which needed elevation to cross a real RLS gap (organizers
-- has no DELETE policy at all). No such gap exists here — the caller can
-- already see their own entity_members rows via that table's own SELECT
-- policy, so no privilege elevation is warranted or used.
CREATE OR REPLACE FUNCTION is_entity_member(p_organizer_id uuid, p_roles text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM entity_members
    WHERE organizer_id = p_organizer_id
      AND user_id = auth.uid()
      AND (p_roles IS NULL OR role = ANY(p_roles))
  );
$$;

-- 2. fundraisers — extend the two organizer-aware policies only. The two
-- legacy user_id-only policies ("Users can delete own fundraisers",
-- "Users can update own fundraisers") are untouched.

DROP POLICY IF EXISTS "Users can delete their organizer fundraisers" ON fundraisers;
CREATE POLICY "Users can delete their organizer fundraisers" ON fundraisers
  FOR DELETE
  USING (
    (auth.uid() = user_id)
    OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = fundraisers.organizer_id AND organizers.user_id = auth.uid()))
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
  );

DROP POLICY IF EXISTS "Users can update fundraisers for their organizer profiles" ON fundraisers;
CREATE POLICY "Users can update fundraisers for their organizer profiles" ON fundraisers
  FOR UPDATE
  USING (
    (auth.uid() = user_id)
    OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = fundraisers.organizer_id AND organizers.user_id = auth.uid()))
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
  )
  WITH CHECK (
    (
      (auth.uid() = user_id)
      AND ((organizer_id IS NULL) OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = fundraisers.organizer_id AND organizers.user_id = auth.uid())))
    )
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
  );

DROP POLICY IF EXISTS "Owners can read their own fundraisers" ON fundraisers;
CREATE POLICY "Owners can read their own fundraisers" ON fundraisers
  FOR SELECT
  USING (
    (auth.uid() = user_id)
    OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = fundraisers.organizer_id AND organizers.user_id = auth.uid()))
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
  );

-- 3. fundraiser_updates (has its own organizer_id column directly).

DROP POLICY IF EXISTS "Organizer can manage their updates" ON fundraiser_updates;
CREATE POLICY "Organizer can manage their updates" ON fundraiser_updates
  FOR ALL
  USING (
    organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid())
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
  );

DROP POLICY IF EXISTS "Owners can read their own fundraiser updates" ON fundraiser_updates;
CREATE POLICY "Owners can read their own fundraiser updates" ON fundraiser_updates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM fundraisers f LEFT JOIN organizers o ON o.id = f.organizer_id
      WHERE f.id = fundraiser_updates.fundraiser_id
        AND (f.user_id = auth.uid() OR o.user_id = auth.uid())
    )
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
  );

-- 4. fundraiser_media (no organizer_id column of its own — only
-- fundraiser_id; resolve organizer_id via a scalar subquery against
-- fundraisers, same relationship the pre-existing policies already join
-- through).

DROP POLICY IF EXISTS "Organizer can manage their fundraiser media" ON fundraiser_media;
CREATE POLICY "Organizer can manage their fundraiser media" ON fundraiser_media
  FOR ALL
  USING (
    fundraiser_id IN (
      SELECT fundraisers.id FROM fundraisers
      WHERE fundraisers.organizer_id IN (SELECT organizers.id FROM organizers WHERE organizers.user_id = auth.uid())
    )
    OR is_entity_member(
      (SELECT organizer_id FROM fundraisers WHERE id = fundraiser_media.fundraiser_id),
      ARRAY['owner','admin','manager','editor']
    )
  );

DROP POLICY IF EXISTS "Owners can read their own fundraiser media" ON fundraiser_media;
CREATE POLICY "Owners can read their own fundraiser media" ON fundraiser_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM fundraisers f LEFT JOIN organizers o ON o.id = f.organizer_id
      WHERE f.id = fundraiser_media.fundraiser_id
        AND (f.user_id = auth.uid() OR o.user_id = auth.uid())
    )
    OR is_entity_member(
      (SELECT organizer_id FROM fundraisers WHERE id = fundraiser_media.fundraiser_id),
      ARRAY['owner','admin','manager','editor','finance','viewer']
    )
  );

DROP POLICY IF EXISTS "Users can create media for their fundraisers" ON fundraiser_media;
CREATE POLICY "Users can create media for their fundraisers" ON fundraiser_media
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fundraisers LEFT JOIN organizers ON organizers.id = fundraisers.organizer_id
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND (fundraisers.user_id = auth.uid() OR organizers.user_id = auth.uid())
    )
    OR is_entity_member(
      (SELECT organizer_id FROM fundraisers WHERE id = fundraiser_media.fundraiser_id),
      ARRAY['owner','admin','manager','editor']
    )
  );

DROP POLICY IF EXISTS "Users can update media for their fundraisers" ON fundraiser_media;
CREATE POLICY "Users can update media for their fundraisers" ON fundraiser_media
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM fundraisers LEFT JOIN organizers ON organizers.id = fundraisers.organizer_id
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND (fundraisers.user_id = auth.uid() OR organizers.user_id = auth.uid())
    )
    OR is_entity_member(
      (SELECT organizer_id FROM fundraisers WHERE id = fundraiser_media.fundraiser_id),
      ARRAY['owner','admin','manager','editor']
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fundraisers LEFT JOIN organizers ON organizers.id = fundraisers.organizer_id
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND (fundraisers.user_id = auth.uid() OR organizers.user_id = auth.uid())
    )
    OR is_entity_member(
      (SELECT organizer_id FROM fundraisers WHERE id = fundraiser_media.fundraiser_id),
      ARRAY['owner','admin','manager','editor']
    )
  );

DROP POLICY IF EXISTS "Users can delete media for their fundraisers" ON fundraiser_media;
CREATE POLICY "Users can delete media for their fundraisers" ON fundraiser_media
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM fundraisers LEFT JOIN organizers ON organizers.id = fundraisers.organizer_id
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND (fundraisers.user_id = auth.uid() OR organizers.user_id = auth.uid())
    )
    OR is_entity_member(
      (SELECT organizer_id FROM fundraisers WHERE id = fundraiser_media.fundraiser_id),
      ARRAY['owner','admin','manager','editor']
    )
  );

-- 5. eventbrite_sources. See the header comment (simplification #2) for why
-- the UPDATE policy's USING clause gains an organizer-aware branch it never
-- had before, alongside the new entity_members branch.

DROP POLICY IF EXISTS "Users can create their Eventbrite sources" ON eventbrite_sources;
CREATE POLICY "Users can create their Eventbrite sources" ON eventbrite_sources
  FOR INSERT
  WITH CHECK (
    (
      (auth.uid() = user_id)
      AND ((organizer_id IS NULL) OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = eventbrite_sources.organizer_id AND organizers.user_id = auth.uid())))
    )
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
  );

DROP POLICY IF EXISTS "Users can update their Eventbrite sources" ON eventbrite_sources;
CREATE POLICY "Users can update their Eventbrite sources" ON eventbrite_sources
  FOR UPDATE
  USING (
    (auth.uid() = user_id)
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
  )
  WITH CHECK (
    (
      (auth.uid() = user_id)
      AND ((organizer_id IS NULL) OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = eventbrite_sources.organizer_id AND organizers.user_id = auth.uid())))
    )
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
  );

-- 6. articles — only the organizer-affiliation branch of each policy
-- changes; the owner_id-based clauses are untouched.

DROP POLICY IF EXISTS "Active users can create their own articles" ON articles;
CREATE POLICY "Active users can create their own articles" ON articles
  FOR INSERT
  WITH CHECK (
    (auth.uid() = owner_id)
    AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'scheduled'::text]))
    AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.status = 'active'))
    AND (
      (organizer_id IS NULL)
      OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = articles.organizer_id AND organizers.user_id = auth.uid()))
      OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    )
  );

DROP POLICY IF EXISTS "Article owners can update their articles" ON articles;
CREATE POLICY "Article owners can update their articles" ON articles
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    (auth.uid() = owner_id)
    AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.status = 'active'))
    AND (
      (organizer_id IS NULL)
      OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = articles.organizer_id AND organizers.user_id = auth.uid()))
      OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
