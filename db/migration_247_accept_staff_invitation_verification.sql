-- 1. Expect: accept fn prosecdef t, auth t, anon f; phone helper prosecdef t, auth f, anon f
SELECT proname, prosecdef,
       has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon', oid, 'EXECUTE') AS anon_exec
FROM pg_proc WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('accept_staff_invitation','staff_invitee_phone_matches') ORDER BY proname;
-- 2. Expect: 3 rows
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'public.staff_invitations'::regclass
  AND conname IN ('staff_invitations_phone_check','staff_invitations_channel_check','staff_invitations_contact_check');
-- 3. Expect: email nullable (YES), phone and delivery_channel present
SELECT column_name, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='staff_invitations' AND column_name IN ('email','phone','delivery_channel');
-- 4. Guard trigger still enabled (expect O)
SELECT t.tgname, t.tgenabled FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
WHERE p.proname = 'staff_invitations_guard_accept_fields';