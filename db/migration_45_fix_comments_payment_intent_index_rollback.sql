-- Rollback for migration 45: restore the (broken) partial unique index.
-- Only use this if you need to revert — it reintroduces the ON CONFLICT bug.

DROP INDEX IF EXISTS comments_payment_intent_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS comments_payment_intent_id_key
  ON comments(payment_intent_id) WHERE (payment_intent_id IS NOT NULL);

NOTIFY pgrst, 'reload schema';
