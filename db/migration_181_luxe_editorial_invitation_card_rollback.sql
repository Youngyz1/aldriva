-- Rollback for migration 181: stop offering Luxe Editorial to new selections.
-- Preserve referenced card rows so existing events retain their foreign key.

BEGIN;

DELETE FROM public.invitation_templates AS template
WHERE template.slug = 'luxe-editorial'
  AND NOT EXISTS (
    SELECT 1
    FROM public.events AS event
    WHERE event.invitation_template_id = template.id
  );

UPDATE public.invitation_templates
SET is_active = false,
    updated_at = now()
WHERE slug = 'luxe-editorial';

COMMIT;

NOTIFY pgrst, 'reload schema';
