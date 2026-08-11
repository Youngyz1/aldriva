-- migration_63_articles_entity_permissions_rollback.sql
-- Reverts articles' SELECT/UPDATE/DELETE policies to their exact
-- migration_62-applied state (captured live before writing migration_63).
-- Note: this restores the ORIGINAL buggy UPDATE WITH CHECK structure
-- documented in migration_63's header (auth.uid() = owner_id ANDed across
-- the whole clause) — that bug made entity-based article updates fully
-- inert, so reverting to it does not reopen any access, it just returns
-- to owner_id-only behavior.

BEGIN;

DROP POLICY IF EXISTS "Article owners can read their articles" ON articles;
CREATE POLICY "Article owners can read their articles" ON articles
  FOR SELECT
  USING (auth.uid() = owner_id);

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

DROP POLICY IF EXISTS "Article owners can delete draft articles" ON articles;
CREATE POLICY "Article owners can delete draft articles" ON articles
  FOR DELETE
  USING (
    (auth.uid() = owner_id)
    AND (status = 'draft')
    AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.status = 'active'))
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
