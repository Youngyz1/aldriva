-- migration_136_services_and_menus_rollback.sql
-- Rollback for migration_136_services_and_menus.sql

BEGIN;

DROP TRIGGER IF EXISTS trg_menu_items_organizer_match ON menu_items;
DROP FUNCTION IF EXISTS check_menu_item_organizer_match();

DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
DROP FUNCTION IF EXISTS update_menu_items_updated_at();

DROP TRIGGER IF EXISTS trg_menu_sections_updated_at ON menu_sections;
DROP FUNCTION IF EXISTS update_menu_sections_updated_at();

DROP TRIGGER IF EXISTS trg_service_tiers_updated_at ON service_tiers;
DROP FUNCTION IF EXISTS update_service_tiers_updated_at();

DROP TRIGGER IF EXISTS trg_services_updated_at ON services;
DROP FUNCTION IF EXISTS update_services_updated_at();

DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS menu_sections CASCADE;
DROP TABLE IF EXISTS service_tiers CASCADE;
DROP TABLE IF EXISTS services CASCADE;

COMMIT;

NOTIFY pgrst, 'reload schema';
