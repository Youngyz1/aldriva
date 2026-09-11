-- migration_115_conversation_link_integrity.sql
--
-- Phase 1A hardening (P1): close two integrity gaps found in the Phase 0
-- re-audit of migrations 108-111.
--
-- 1. conversations.channel_asset_id / customer_identity_id had no
--    same-tenant enforcement: a service-role writer could link an asset or
--    identity of Tenant B into a Tenant A conversation. New trigger
--    enforce_conversation_link_tenant() rejects cross-tenant links
--    (NULL links remain allowed — asset/identity are optional).
--
-- 2. connected_accounts.tenant_id was mutable with no child
--    re-validation: repointing a parent would silently orphan its
--    channel_assets into another tenant (the child match trigger only
--    fires on child writes). New trigger blocks tenant_id changes while
--    channel_assets reference the account — same immutability precedent
--    as businesses.organizer_id (migration_58).
--
-- Additive only: no column, policy, or data changes. Consistent existing
-- rows are unaffected (verified: live tables are empty pre-apply).

BEGIN;

-- 1. Same-tenant check for conversation links.
CREATE OR REPLACE FUNCTION enforce_conversation_link_tenant()
RETURNS TRIGGER AS $$
DECLARE
  linked_tenant UUID;
BEGIN
  IF NEW.channel_asset_id IS NOT NULL THEN
    SELECT tenant_id INTO linked_tenant
    FROM channel_assets WHERE id = NEW.channel_asset_id;
    IF linked_tenant IS NULL OR linked_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'conversations.channel_asset_id must belong to the same tenant';
    END IF;
  END IF;

  IF NEW.customer_identity_id IS NOT NULL THEN
    SELECT tenant_id INTO linked_tenant
    FROM customer_identities WHERE id = NEW.customer_identity_id;
    IF linked_tenant IS NULL OR linked_tenant IS DISTINCT FROM NEW.tenant_id THEN
      RAISE EXCEPTION 'conversations.customer_identity_id must belong to the same tenant';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_conversations_link_tenant ON conversations;
CREATE TRIGGER trg_conversations_link_tenant
  BEFORE INSERT OR UPDATE OF channel_asset_id, customer_identity_id, tenant_id ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION enforce_conversation_link_tenant();

-- 2. Lock connected_accounts.tenant_id while children exist.
CREATE OR REPLACE FUNCTION prevent_connected_account_tenant_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    IF EXISTS (SELECT 1 FROM channel_assets WHERE connected_account_id = OLD.id) THEN
      RAISE EXCEPTION 'connected_accounts.tenant_id cannot change while channel_assets reference it';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_connected_accounts_lock_tenant ON connected_accounts;
CREATE TRIGGER trg_connected_accounts_lock_tenant
  BEFORE UPDATE OF tenant_id ON connected_accounts
  FOR EACH ROW
  EXECUTE FUNCTION prevent_connected_account_tenant_change();

COMMIT;

NOTIFY pgrst, 'reload schema';
