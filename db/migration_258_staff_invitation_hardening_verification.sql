-- migration_258_staff_invitation_hardening_verification.sql
-- ONE statement, one result set. Every row should have ok = true after the forward migration.
SELECT n, check_name, ok FROM (
  SELECT 1 AS n, 'token_hash column exists and is NOT NULL' AS check_name,
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='staff_invitations'
                    AND column_name='token_hash' AND is_nullable='NO') AS ok
  UNION ALL
  SELECT 2, 'no rows with null token_hash',
         NOT EXISTS (SELECT 1 FROM public.staff_invitations WHERE token_hash IS NULL)
  UNION ALL
  SELECT 3, 'every stored hash matches its token',
         NOT EXISTS (SELECT 1 FROM public.staff_invitations
                      WHERE token IS NOT NULL
                        AND token_hash IS DISTINCT FROM public.staff_invitation_token_hash(token))
  UNION ALL
  SELECT 4, 'unique index on token_hash',
         to_regclass('public.uq_staff_invitations_token_hash') IS NOT NULL
  UNION ALL
  SELECT 5, 'one-pending-per-staff partial unique index',
         EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND tablename='staff_invitations'
                    AND indexname='uq_staff_invitations_one_pending_per_staff'
                    AND indexdef LIKE '%UNIQUE%' AND indexdef LIKE '%pending%')
  UNION ALL
  SELECT 6, 'insert trigger present',
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid='public.staff_invitations'::regclass
                    AND tgname='trg_staff_invitations_set_token_hash' AND NOT tgisinternal)
  UNION ALL
  SELECT 7, 'accept function looks up by hash and retires siblings',
         pg_get_functiondef('public.accept_staff_invitation(uuid)'::regprocedure) LIKE '%token_hash%'
         AND pg_get_functiondef('public.accept_staff_invitation(uuid)'::regprocedure) LIKE '%revoked%'
  UNION ALL
  SELECT 8, 'guard blocks token_hash changes and reopening',
         pg_get_functiondef('public.staff_invitations_guard_accept_fields()'::regprocedure) LIKE '%token_hash%'
         AND pg_get_functiondef('public.staff_invitations_guard_accept_fields()'::regprocedure) LIKE '%invitation_reopen_denied%'
  UNION ALL
  SELECT 9, 'revoke_staff_invitation exists and is SECURITY DEFINER',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
                  WHERE ns.nspname='public' AND p.proname='revoke_staff_invitation' AND p.prosecdef)
  UNION ALL
  SELECT 10, 'anon holds no privileges on the table',
         NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                      WHERE table_schema='public' AND table_name='staff_invitations' AND grantee='anon')
  UNION ALL
  SELECT 11, 'authenticated has no TRUNCATE, TRIGGER or REFERENCES',
         NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                      WHERE table_schema='public' AND table_name='staff_invitations'
                        AND grantee='authenticated'
                        AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES'))
  UNION ALL
  SELECT 12, 'authenticated still has SELECT, INSERT, UPDATE, DELETE (4 of 4)',
         (SELECT count(*) FROM information_schema.role_table_grants
           WHERE table_schema='public' AND table_name='staff_invitations'
             AND grantee='authenticated'
             AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')) = 4
) c
ORDER BY n;