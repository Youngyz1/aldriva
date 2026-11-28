-- 1. expect 2 (markers present after apply, 0 after rollback)
SELECT (length(d) - length(replace(d, '-- 249 hardening', ''))) / length('-- 249 hardening') AS markers
FROM (SELECT pg_get_functiondef('public.staff_has_permission(uuid,text,uuid)'::regprocedure) AS d) x;
-- 2. expect t; record the two exec columns BEFORE applying and confirm they are unchanged after
SELECT prosecdef,
       has_function_privilege('authenticated', oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('anon', oid, 'EXECUTE') AS anon_exec
FROM pg_proc WHERE oid = 'public.staff_has_permission(uuid,text,uuid)'::regprocedure;