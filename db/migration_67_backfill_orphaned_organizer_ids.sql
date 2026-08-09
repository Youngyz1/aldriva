-- migration_67_backfill_orphaned_organizer_ids.sql
-- One-time backfill for the two NULL-organizer_id rows that DO have a
-- user_id, found while scoping Phase 10. Targets exactly these two rows
-- by id — not a general-purpose script, not reusable for future orphans
-- (migration_66's triggers prevent new ones from this point forward).
--
-- Does NOT touch the four rows with neither user_id nor organizer_id
-- (investigated separately — seed/demo content from initial platform
-- setup that later received real donations/ticket purchases). Those are
-- logged as a follow-up requiring a real ownership decision, not
-- mechanical backfill, and are explicitly out of scope here.
--
-- fundraiser 800e3fd5 ("Save Jazzy's life from brain cancer & being
-- homeless", user b6413fac): that user already owns one organizer
-- ("City of Norco", a municipal government profile) — NOT reused, since
-- the fundraiser's own `organizer` text field says "Isaiah Garza," a
-- personal name with no relation to City of Norco. A fresh organizer is
-- created instead, named from that field.
--
-- event 90fb0c4f ("Prevent in Education Designated Safeguarding Lead
-- Training", user 21b8bbfc): that user owns TEN existing organizers
-- (confirmed live, including one literally named "Testing" — the
-- account's own profile is {"firstName":"Admin","lastName":"Access"},
-- confirming this is a test/admin account, not a genuine single-org
-- user). None of the 10 has any signal tying it to this event
-- (source_organizer_name is NULL on the row). A fresh organizer is
-- created rather than guessing among the 10, named from the event's own
-- title since no better signal exists.
--
-- Slug collision checked live before writing this file: neither
-- 'isaiah-garza' nor 'prevent-in-education' collides with an existing
-- organizers.slug. Retry-on-conflict is still included defensively,
-- consistent with every other slug-generating write in this codebase.

BEGIN;

DO $$
DECLARE
  new_org_id uuid;
  candidate text;
  attempt int := 0;
BEGIN
  -- fundraiser 800e3fd5 -> "Isaiah Garza"
  LOOP
    candidate := CASE WHEN attempt = 0 THEN 'isaiah-garza' ELSE 'isaiah-garza-' || (attempt + 1) END;
    BEGIN
      INSERT INTO organizers (user_id, name, org_type, slug)
      VALUES ('b6413fac-8b28-4ec3-ac67-6dd521fac0e9', 'Isaiah Garza', 'other', candidate)
      RETURNING id INTO new_org_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      IF attempt > 50 THEN
        RAISE EXCEPTION 'Could not generate a unique slug for Isaiah Garza backfill';
      END IF;
    END;
  END LOOP;

  UPDATE fundraisers
  SET organizer_id = new_org_id
  WHERE id = '800e3fd5-ad0d-4e24-83fa-3e2ef145ce34'
    AND organizer_id IS NULL; -- guard: no-op if this row was already backfilled by something else
END $$;

DO $$
DECLARE
  new_org_id uuid;
  candidate text;
  attempt int := 0;
BEGIN
  -- event 90fb0c4f -> fresh organizer, named from the event title
  -- (no per-row source_organizer_name signal existed to use instead)
  LOOP
    candidate := CASE WHEN attempt = 0 THEN 'prevent-in-education' ELSE 'prevent-in-education-' || (attempt + 1) END;
    BEGIN
      INSERT INTO organizers (user_id, name, org_type, slug)
      VALUES ('21b8bbfc-95c6-4ea9-aa2e-51b3460a0865', 'Prevent in Education', 'other', candidate)
      RETURNING id INTO new_org_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      attempt := attempt + 1;
      IF attempt > 50 THEN
        RAISE EXCEPTION 'Could not generate a unique slug for Prevent in Education backfill';
      END IF;
    END;
  END LOOP;

  UPDATE events
  SET organizer_id = new_org_id
  WHERE id = '90fb0c4f-8673-4a1d-b87d-9a7406cfb3e6'
    AND organizer_id IS NULL;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
