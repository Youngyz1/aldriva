-- migration_62_entity_permissions_rollback.sql
-- Reverts every policy touched by migration_62 to its exact pre-migration
-- definition (captured live via pg_policies before writing migration_62),
-- then drops is_entity_member(). Run policy reverts before the DROP
-- FUNCTION — Postgres policy definitions don't hard-reference the function
-- by OID the way a column default would, but reverting first keeps the
-- window where a policy could reference a dropped function at zero,
-- rather than relying on order-independence.

BEGIN;

-- fundraisers
DROP POLICY IF EXISTS "Users can delete their organizer fundraisers" ON fundraisers;
CREATE POLICY "Users can delete their organizer fundraisers" ON fundraisers
  FOR DELETE
  USING (
    (auth.uid() = user_id)
    OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = fundraisers.organizer_id AND organizers.user_id = auth.uid()))
  );

DROP POLICY IF EXISTS "Users can update fundraisers for their organizer profiles" ON fundraisers;
CREATE POLICY "Users can update fundraisers for their organizer profiles" ON fundraisers
  FOR UPDATE
  USING (
    (auth.uid() = user_id)
    OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = fundraisers.organizer_id AND organizers.user_id = auth.uid()))
  )
  WITH CHECK (
    (auth.uid() = user_id)
    AND ((organizer_id IS NULL) OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = fundraisers.organizer_id AND organizers.user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "Owners can read their own fundraisers" ON fundraisers;
CREATE POLICY "Owners can read their own fundraisers" ON fundraisers
  FOR SELECT
  USING (
    (auth.uid() = user_id)
    OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = fundraisers.organizer_id AND organizers.user_id = auth.uid()))
  );

-- fundraiser_updates
DROP POLICY IF EXISTS "Organizer can manage their updates" ON fundraiser_updates;
CREATE POLICY "Organizer can manage their updates" ON fundraiser_updates
  FOR ALL
  USING (
    organizer_id IN (SELECT id FROM organizers WHERE user_id = auth.uid())
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
  );

-- fundraiser_media
DROP POLICY IF EXISTS "Organizer can manage their fundraiser media" ON fundraiser_media;
CREATE POLICY "Organizer can manage their fundraiser media" ON fundraiser_media
  FOR ALL
  USING (
    fundraiser_id IN (
      SELECT fundraisers.id FROM fundraisers
      WHERE fundraisers.organizer_id IN (SELECT organizers.id FROM organizers WHERE organizers.user_id = auth.uid())
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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM fundraisers LEFT JOIN organizers ON organizers.id = fundraisers.organizer_id
      WHERE fundraisers.id = fundraiser_media.fundraiser_id
        AND (fundraisers.user_id = auth.uid() OR organizers.user_id = auth.uid())
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
  );

-- eventbrite_sources
DROP POLICY IF EXISTS "Users can create their Eventbrite sources" ON eventbrite_sources;
CREATE POLICY "Users can create their Eventbrite sources" ON eventbrite_sources
  FOR INSERT
  WITH CHECK (
    (auth.uid() = user_id)
    AND ((organizer_id IS NULL) OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = eventbrite_sources.organizer_id AND organizers.user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "Users can update their Eventbrite sources" ON eventbrite_sources;
CREATE POLICY "Users can update their Eventbrite sources" ON eventbrite_sources
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    (auth.uid() = user_id)
    AND ((organizer_id IS NULL) OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = eventbrite_sources.organizer_id AND organizers.user_id = auth.uid())))
  );

-- articles
DROP POLICY IF EXISTS "Active users can create their own articles" ON articles;
CREATE POLICY "Active users can create their own articles" ON articles
  FOR INSERT
  WITH CHECK (
    (auth.uid() = owner_id)
    AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'scheduled'::text]))
    AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.status = 'active'))
    AND ((organizer_id IS NULL) OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = articles.organizer_id AND organizers.user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "Article owners can update their articles" ON articles;
CREATE POLICY "Article owners can update their articles" ON articles
  FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (
    (auth.uid() = owner_id)
    AND (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.status = 'active'))
    AND ((organizer_id IS NULL) OR (EXISTS (SELECT 1 FROM organizers WHERE organizers.id = articles.organizer_id AND organizers.user_id = auth.uid())))
  );

DROP FUNCTION IF EXISTS is_entity_member(uuid, text[]);

COMMIT;

NOTIFY pgrst, 'reload schema';
