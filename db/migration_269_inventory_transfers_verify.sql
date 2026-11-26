-- Verify migration 269 (read-only). Every row should have ok = true.
SELECT 'transfer function exists and is SECURITY DEFINER' AS check_name, EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='inventory_transfer_stock' AND prosecdef) AS ok
UNION ALL SELECT 'anon cannot execute inventory_transfer_stock', NOT has_function_privilege('anon','public.inventory_transfer_stock(uuid,uuid,uuid,uuid,numeric,text)','EXECUTE')
UNION ALL SELECT 'authenticated can execute inventory_transfer_stock', has_function_privilege('authenticated','public.inventory_transfer_stock(uuid,uuid,uuid,uuid,numeric,text)','EXECUTE')
UNION ALL SELECT 'archive guard function exists', to_regprocedure('public.inventory_guard_location_archive()') IS NOT NULL
UNION ALL SELECT 'archive guard function is not executable by authenticated', NOT has_function_privilege('authenticated','public.inventory_guard_location_archive()','EXECUTE')
UNION ALL SELECT 'archive guard trigger exists', EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_inventory_locations_archive_guard' AND NOT tgisinternal)
UNION ALL SELECT 'apply_movement share-locks the location row', (SELECT prosrc FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='inventory_apply_movement') LIKE '%FOR SHARE%'
UNION ALL SELECT 'policy count still 8', (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'inventory\_%') = 8;