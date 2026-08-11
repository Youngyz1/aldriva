-- migration_71_recipient_ledger_entries.sql
-- Phase B.1 of the Recipient/Ledger/Payout architecture. Creates
-- recipient_ledger_entries only. Deliberately inert: no application code,
-- webhook, or RPC references this table yet. No existing payment flow,
-- and no other table (recipients, donations, ticket_orders,
-- product_orders) is touched by this migration. Phase B.2 (the
-- SECURITY DEFINER RPC that will actually write credits) is a separate,
-- later, separately-approved migration.

BEGIN;

CREATE TABLE recipient_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  recipient_id UUID NOT NULL
    REFERENCES recipients(id)
    ON DELETE RESTRICT,

  entry_type TEXT NOT NULL,

  amount NUMERIC NOT NULL,

  currency TEXT NOT NULL,

  source_type TEXT NOT NULL,

  source_id UUID,

  external_reference TEXT,

  description TEXT,

  created_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT recipient_ledger_entries_entry_type_check
    CHECK (
      entry_type IN (
        'credit',
        'debit',
        'platform_fee',
        'refund',
        'payout',
        'adjustment'
      )
    ),

  CONSTRAINT recipient_ledger_entries_source_type_check
    CHECK (
      source_type IN (
        'donation',
        'ticket_order',
        'product_order',
        'payout',
        'manual'
      )
    ),

  CONSTRAINT recipient_ledger_entries_source_id_required
    CHECK (
      (
        source_type = 'manual'
        AND source_id IS NULL
      )
      OR
      (
        source_type <> 'manual'
        AND source_id IS NOT NULL
      )
    ),

  CONSTRAINT recipient_ledger_entries_amount_sign
    CHECK (
      (
        entry_type = 'credit'
        AND amount > 0
      )
      OR
      (
        entry_type = 'debit'
        AND amount < 0
      )
      OR
      (
        entry_type = 'platform_fee'
        AND amount < 0
      )
      OR
      (
        entry_type = 'refund'
        AND amount < 0
      )
      OR
      (
        entry_type = 'payout'
        AND amount < 0
      )
      OR
      (
        entry_type = 'adjustment'
        AND amount <> 0
      )
    ),

  CONSTRAINT recipient_ledger_entries_currency_format
    CHECK (
      currency = lower(currency)
      AND currency ~ '^[a-z]{3}$'
    ),

  CONSTRAINT recipient_ledger_entries_refund_requires_reference
    CHECK (
      entry_type <> 'refund'
      OR external_reference IS NOT NULL
    )
);

CREATE UNIQUE INDEX idx_recipient_ledger_entries_source_dedup
  ON recipient_ledger_entries (source_type, source_id, entry_type)
  WHERE source_id IS NOT NULL
    AND entry_type <> 'refund';

CREATE UNIQUE INDEX idx_recipient_ledger_entries_refund_dedup
  ON recipient_ledger_entries (
    source_type,
    source_id,
    entry_type,
    external_reference
  )
  WHERE entry_type = 'refund';

CREATE INDEX idx_recipient_ledger_entries_recipient_currency
  ON recipient_ledger_entries (recipient_id, currency);

CREATE FUNCTION prevent_ledger_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'recipient_ledger_entries is append-only: % is not permitted. Corrections must be made via a compensating entry.', TG_OP;
END;
$$;

CREATE TRIGGER trg_recipient_ledger_entries_no_update
  BEFORE UPDATE ON recipient_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_entry_mutation();

CREATE TRIGGER trg_recipient_ledger_entries_no_delete
  BEFORE DELETE ON recipient_ledger_entries
  FOR EACH ROW
  EXECUTE FUNCTION prevent_ledger_entry_mutation();

ALTER TABLE recipient_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins can view their ledger entries"
  ON recipient_ledger_entries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM recipients r
      WHERE r.id = recipient_ledger_entries.recipient_id
        AND (
          auth.uid() = r.user_id
          OR EXISTS (
            SELECT 1
            FROM organizers
            WHERE organizers.id = r.organizer_id
              AND organizers.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM businesses
            WHERE businesses.id = r.business_id
              AND businesses.owner_id = auth.uid()
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
        AND profiles.status = 'active'
    )
  );

REVOKE EXECUTE ON FUNCTION prevent_ledger_entry_mutation()
  FROM PUBLIC, anon, authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON recipient_ledger_entries
  FROM anon, authenticated, service_role;

COMMIT;
