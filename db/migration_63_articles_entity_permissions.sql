-- migration_63_articles_entity_permissions.sql
-- Phase 6 of the Entity architecture: completes articles' entity wiring.
-- Phase 1 (migration_58) added articles.organizer_id + backfilled it.
-- Phase 4 (migration_62) extended articles' INSERT/UPDATE WITH CHECK
-- clauses with is_entity_member(...) — but a live-schema audit for this
-- phase found TWO bugs in the live UPDATE policy that made that
-- extension fully inert for anyone but the article's own owner_id:
--   1. USING was, and remained after migration_62, `auth.uid() = owner_id`
--      only, with no organizer-based branch at all. Since USING gates
--      which rows are even selectable for an update before WITH CHECK is
--      ever evaluated, a non-owner could never reach WITH CHECK — the
--      exact shape of bug this project's own migration_62 header comment
--      already disclosed and fixed for eventbrite_sources, just not
--      caught here at the time.
--   2. Independently, WITH CHECK ANDed `auth.uid() = owner_id` across the
--      ENTIRE clause, with the organizer_id/is_entity_member branch nested
--      inside that AND rather than OR'd alongside it. That structure means
--      even a delegate who somehow passed USING could never satisfy WITH
--      CHECK, because their auth.uid() never equals the original row's
--      owner_id (updateArticle() never modifies owner_id, so it stays the
--      original creator's id on every update). This migration restructures
--      WITH CHECK into two proper alternatives: the original-owner path
--      (auth.uid() = owner_id, governing organizer reassignment) OR the
--      delegate path (is_entity_member(...) alone, owner_id left
--      untouched by the update either way).
--
-- This migration:
--   1. Fixes both UPDATE bugs above.
--   2. Extends SELECT ("Article owners can read their articles") and
--      DELETE ("Article owners can delete draft articles") — neither had
--      any organizer/entity_members branch at all, in USING or WITH
--      CHECK, before this migration.
--
-- All additive, same discipline as migration_62: owner_id and the
-- existing organizers.user_id checks are kept as fallback OR branches,
-- nothing removed or narrowed. DELETE keeps its existing
-- status = 'draft' restriction unchanged — this only widens WHO can
-- delete a draft article an organizer owns, not WHEN.
--
-- Role tiers (see lib/entity-auth.ts):
--   DELETE: ENTITY_ROLES_MANAGE        (owner, admin, manager)
--   UPDATE: ENTITY_ROLES_CONTENT_WRITE (owner, admin, manager, editor) — already the tier used in the WITH CHECK this migration activates
--   SELECT: ENTITY_ROLES_ALL           (+ finance, viewer)

BEGIN;

DROP POLICY IF EXISTS "Article owners can read their articles" ON articles;
CREATE POLICY "Article owners can read their articles" ON articles
  FOR SELECT
  USING (
    (auth.uid() = owner_id)
    OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = articles.organizer_id AND organizers.user_id = auth.uid()))
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor','finance','viewer'])
  );

DROP POLICY IF EXISTS "Article owners can update their articles" ON articles;
CREATE POLICY "Article owners can update their articles" ON articles
  FOR UPDATE
  USING (
    (auth.uid() = owner_id)
    OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = articles.organizer_id AND organizers.user_id = auth.uid()))
    OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
  )
  WITH CHECK (
    (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.status = 'active'))
    AND (
      (
        (auth.uid() = owner_id)
        AND (
          (organizer_id IS NULL)
          OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = articles.organizer_id AND organizers.user_id = auth.uid()))
          OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
        )
      )
      OR is_entity_member(organizer_id, ARRAY['owner','admin','manager','editor'])
    )
  );

DROP POLICY IF EXISTS "Article owners can delete draft articles" ON articles;
CREATE POLICY "Article owners can delete draft articles" ON articles
  FOR DELETE
  USING (
    (status = 'draft')
    AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.status = 'active'))
    AND (
      (auth.uid() = owner_id)
      OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = articles.organizer_id AND organizers.user_id = auth.uid()))
      OR is_entity_member(organizer_id, ARRAY['owner','admin','manager'])
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
