-- migration_259_staff_invitation_token_scrub_verification.sql
-- ONE statement, ONE result set. After the forward file every row should be true.
-- After the rollback, rows 1 to 4 should be false and rows 5 to 8 true.
SELECT n, what, ok FROM (
  SELECT 1 AS n, 'token column is nullable' AS what,
         coalesce((SELECT c.is_nullable = 'YES' FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = 'staff_invitations'
                      AND c.column_name = 'token'), false) AS ok
  UNION ALL
  SELECT 2, 'token has no default',
         coalesce((SELECT c.column_default IS NULL FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = 'staff_invitations'
                      AND c.column_name = 'token'), false)
  UNION ALL
  SELECT 3, 'no plaintext tokens stored',
         NOT EXISTS (SELECT 1 FROM public.staff_invitations WHERE token IS NOT NULL)
  UNION ALL
  SELECT 4, 'token-null constraint present',
         EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'chk_staff_invitations_token_null'
                    AND conrelid = 'public.staff_invitations'::regclass)
  UNION ALL
  SELECT 5, 'token_hash is NOT NULL',
         coalesce((SELECT c.is_nullable = 'NO' FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = 'staff_invitations'
                      AND c.column_name = 'token_hash'), false)
  UNION ALL
  SELECT 6, 'unique index on token_hash present',
         to_regclass('public.uq_staff_invitations_token_hash') IS NOT NULL
  UNION ALL
  SELECT 7, 'one-pending-per-person index present',
         to_regclass('public.uq_staff_invitations_one_pending_per_staff') IS NOT NULL
  UNION ALL
  SELECT 8, 'accept_staff_invitation looks up token_hash',
         pg_get_functiondef('public.accept_staff_invitation(uuid)'::regprocedure) LIKE '%token_hash%'
) v
ORDER BY n;