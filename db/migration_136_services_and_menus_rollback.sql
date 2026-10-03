-- migration_136_services_and_menus_rollback.sql
-- Rollback for migration_136_services_and_menus.sql
-- WARNING: destroys all services, tiers, menu sections and menu items.

BEGIN;

DROP TRIGGER IF EXISTS trg_menu_items_organizer_match ON menu_items;
DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
DROP TRIGGER IF EXISTS trg_menu_sections_updated_at ON menu_sections;
DROP TRIGGER IF EXISTS trg_service_tiers_updated_at ON service_tiers;
DROP TRIGGER IF EXISTS trg_services_updated_at ON services;

-- Children first, so CASCADE isn't needed
DROP TABLE IF EXISTS menu_items;
DROP TABLE IF EXISTS menu_sections;
DROP TABLE IF EXISTS service_tiers;
DROP TABLE IF EXISTS services;

-- Functions last: menu_modifiers_valid is referenced by menu_items' CHECK constraint
DROP FUNCTION IF EXISTS menu_modifiers_valid(jsonb);
DROP FUNCTION IF EXISTS check_menu_item_organizer_match();
DROP FUNCTION IF EXISTS update_menu_items_updated_at();
DROP FUNCTION IF EXISTS update_menu_sections_updated_at();
DROP FUNCTION IF EXISTS update_service_tiers_updated_at();
DROP FUNCTION IF EXISTS update_services_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';