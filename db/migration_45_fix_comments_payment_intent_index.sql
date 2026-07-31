-- migration_45_fix_comments_payment_intent_index.sql
-- Fixes the donation-comment upsert, which has been failing on every single
-- donation-with-message since this index was introduced.
--
-- comments_payment_intent_id_key was created as a PARTIAL unique index
-- (WHERE payment_intent_id IS NOT NULL). Postgres will not use a partial
-- index to resolve a bare `ON CONFLICT (payment_intent_id)` clause — the one
-- supabase-js's .upsert() generates — unless the exact predicate is repeated
-- in the ON CONFLICT clause itself, which supabase-js has no way to express.
-- Every donation-comment upsert in app/api/webhooks/stripe/route.ts has been
-- failing with: "there is no unique or exclusion constraint matching the ON
-- CONFLICT specification" (confirmed via direct reproduction).
--
-- Fix: replace it with a plain (non-partial) unique index. This is safe —
-- standard SQL unique constraints never conflict on NULL vs NULL, so rows
-- with no payment_intent_id (imported/legacy comments) are unaffected.

DROP INDEX IF EXISTS comments_payment_intent_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS comments_payment_intent_id_key
  ON comments(payment_intent_id);

NOTIFY pgrst, 'reload schema';
