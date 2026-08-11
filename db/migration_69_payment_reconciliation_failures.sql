-- migration_69_payment_reconciliation_failures.sql
-- Fixes the silent-money-loss gap found alongside the create-payment-intent
-- price-integrity fix: if a Stripe charge succeeds but the webhook's
-- corresponding DB write fails (ticket_orders today; the same helper is
-- generic enough to reuse for donations/product orders if the same gap
-- turns up there), the customer was charged for nothing and, before this
-- migration, the only trace was a console.error nobody was watching.
--
-- No error-tracking SDK (Sentry or equivalent) exists anywhere in this
-- codebase, and no "failed payment" / "manual review" / "incident" table
-- existed before this one — confirmed via a live audit before writing this
-- file, not assumed. This is genuinely new infrastructure, not a hookup to
-- something pre-existing.
--
-- Deliberately does NOT attempt an automatic refund. After the
-- create-payment-intent fix, event_id/ticket_id are verified to exist
-- before a PaymentIntent is ever created, so this failure mode should
-- become rare (transient DB errors) rather than the routine case it could
-- have been before. A flagged record + alert email is the agreed minimum
-- for this urgent fix; refund automation is a deliberate follow-up
-- decision to make once real failure-rate data exists post-fix, not
-- something to build hastily now.
--
-- Admin-only RLS: this table is only ever written by the service-role
-- webhook handler (which bypasses RLS entirely), so no INSERT policy is
-- needed or granted to any user-facing role — writes from anon/authenticated
-- sessions were never a legitimate path for this table and stay refused by
-- default (RLS enabled, no INSERT policy = no INSERT for those roles).

BEGIN;

CREATE TABLE IF NOT EXISTS payment_reconciliation_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  stripe_payment_intent_id text,
  amount numeric,
  currency text,
  buyer_email text,
  raw_metadata jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payment_reconciliation_failures_unresolved
  ON payment_reconciliation_failures (created_at)
  WHERE resolved_at IS NULL;

ALTER TABLE payment_reconciliation_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view reconciliation failures" ON payment_reconciliation_failures
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'
    )
  );

CREATE POLICY "Admins can update reconciliation failures" ON payment_reconciliation_failures
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin' AND profiles.status = 'active'
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
