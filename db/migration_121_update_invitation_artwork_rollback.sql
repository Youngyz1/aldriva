-- migration_121_update_invitation_artwork_rollback.sql
-- Revert invitation_templates back to local static paths from migration 120.

BEGIN;

UPDATE invitation_templates
SET
  background_image_url = '/images/invitations/templates/wedding-formal-bg.jpg',
  thumbnail_url = '/images/invitations/templates/wedding-formal-thumb.jpg',
  updated_at = now()
WHERE slug = 'royal-elegance';

UPDATE invitation_templates
SET
  background_image_url = '/images/invitations/templates/birthday-celebration-bg.jpg',
  thumbnail_url = '/images/invitations/templates/birthday-celebration-thumb.jpg',
  updated_at = now()
WHERE slug = 'festive-gold-noir';

UPDATE invitation_templates
SET
  background_image_url = '/images/invitations/templates/corporate-conference-bg.jpg',
  thumbnail_url = '/images/invitations/templates/corporate-conference-thumb.jpg',
  updated_at = now()
WHERE slug = 'modern-executive';

UPDATE invitation_templates
SET
  background_image_url = '/images/invitations/templates/gala-fundraiser-bg.jpg',
  thumbnail_url = '/images/invitations/templates/gala-fundraiser-thumb.jpg',
  updated_at = now()
WHERE slug = 'grand-gala-noir';

UPDATE invitation_templates
SET
  background_image_url = '/images/invitations/templates/concert-festival-bg.jpg',
  thumbnail_url = '/images/invitations/templates/concert-festival-thumb.jpg',
  updated_at = now()
WHERE slug = 'neon-horizon';

UPDATE invitation_templates
SET
  background_image_url = '/images/invitations/templates/casual-community-bg.jpg',
  thumbnail_url = '/images/invitations/templates/casual-community-thumb.jpg',
  updated_at = now()
WHERE slug = 'community-warmth';

COMMIT;

NOTIFY pgrst, 'reload schema';
