-- Rollback for migration 180: stop offering Botanical Reverie to new selections.
-- Keep referenced rows so existing events retain their foreign-key value.

BEGIN;

DELETE FROM public.invitation_templates AS template
WHERE template.slug = 'botanical-reverie'
  AND NOT EXISTS (
    SELECT 1
    FROM public.events AS event
    WHERE event.invitation_template_id = template.id
  );

UPDATE public.invitation_templates
SET is_active = false,
    updated_at = now()
WHERE slug = 'botanical-reverie';

COMMIT;

NOTIFY pgrst, 'reload schema';
