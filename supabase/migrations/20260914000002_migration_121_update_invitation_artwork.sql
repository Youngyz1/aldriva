-- migration_121_update_invitation_artwork.sql
-- Update invitation_templates with public URLs from cms-media storage and refined layout slot positions.

BEGIN;

UPDATE invitation_templates
SET
  background_image_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/wedding-formal-bg.jpg',
  thumbnail_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/wedding-formal-thumb.jpg',
  layout_config = '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Cinzel", "bodyFont": "Montserrat", "accentFont": "Playfair Display" },
    "colorPalette": { "primary": "#d4af37", "secondary": "#ffffff", "accent": "#f59e0b", "background": "#0b0f19" },
    "slots": {
      "headerBadge": { "topPercent": 23, "leftPercent": 18, "widthPercent": 64, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 4, "textTransform": "uppercase", "color": "#f59e0b" },
      "eventTitle": { "topPercent": 31, "leftPercent": 18, "widthPercent": 64, "textAlign": "center", "fontSize": 34, "fontWeight": 700, "fontFamily": "Cinzel", "color": "#ffffff" },
      "guestName": { "topPercent": 50, "leftPercent": 18, "widthPercent": 64, "textAlign": "center", "fontSize": 26, "fontWeight": 700, "fontFamily": "Playfair Display", "color": "#fcd34d" },
      "customMessage": { "topPercent": 63, "leftPercent": 20, "widthPercent": 60, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#e2e8f0" },
      "eventMeta": { "topPercent": 75, "leftPercent": 18, "widthPercent": 64, "textAlign": "center", "fontSize": 13, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#cbd5e1" }
    }
  }'::jsonb,
  updated_at = now()
WHERE slug = 'royal-elegance';

UPDATE invitation_templates
SET
  background_image_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/birthday-celebration-bg.jpg',
  thumbnail_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/birthday-celebration-thumb.jpg',
  layout_config = '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Playfair Display", "bodyFont": "Montserrat", "accentFont": "Montserrat" },
    "colorPalette": { "primary": "#fbbf24", "secondary": "#ffffff", "accent": "#f97316", "background": "#18181b" },
    "slots": {
      "headerBadge": { "topPercent": 16, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 3, "textTransform": "uppercase", "color": "#fbbf24" },
      "eventTitle": { "topPercent": 27, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 38, "fontWeight": 700, "fontFamily": "Playfair Display", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 26, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#fde68a" },
      "customMessage": { "topPercent": 62, "leftPercent": 18, "widthPercent": 64, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#f1f5f9" },
      "eventMeta": { "topPercent": 76, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 14, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#cbd5e1" }
    }
  }'::jsonb,
  updated_at = now()
WHERE slug = 'festive-gold-noir';

UPDATE invitation_templates
SET
  background_image_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/corporate-conference-bg.jpg',
  thumbnail_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/corporate-conference-thumb.jpg',
  layout_config = '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Montserrat", "bodyFont": "Montserrat", "accentFont": "Montserrat" },
    "colorPalette": { "primary": "#38bdf8", "secondary": "#ffffff", "accent": "#0ea5e9", "background": "#0f172a" },
    "slots": {
      "headerBadge": { "topPercent": 17, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 12, "fontWeight": 700, "letterSpacing": 4, "textTransform": "uppercase", "color": "#38bdf8" },
      "eventTitle": { "topPercent": 27, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 36, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 24, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#7dd3fc" },
      "customMessage": { "topPercent": 62, "leftPercent": 18, "widthPercent": 64, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#e2e8f0" },
      "eventMeta": { "topPercent": 75, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 14, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#94a3b8" }
    }
  }'::jsonb,
  updated_at = now()
WHERE slug = 'modern-executive';

UPDATE invitation_templates
SET
  background_image_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/gala-fundraiser-bg.jpg',
  thumbnail_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/gala-fundraiser-thumb.jpg',
  layout_config = '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Cinzel", "bodyFont": "Montserrat", "accentFont": "Playfair Display" },
    "colorPalette": { "primary": "#f59e0b", "secondary": "#ffffff", "accent": "#d97706", "background": "#000000" },
    "slots": {
      "headerBadge": { "topPercent": 17, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 4, "textTransform": "uppercase", "color": "#fbbf24" },
      "eventTitle": { "topPercent": 27, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 38, "fontWeight": 700, "fontFamily": "Cinzel", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 26, "fontWeight": 700, "fontFamily": "Playfair Display", "color": "#fbbf24" },
      "customMessage": { "topPercent": 62, "leftPercent": 18, "widthPercent": 64, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#f3f4f6" },
      "eventMeta": { "topPercent": 75, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 14, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#cbd5e1" }
    }
  }'::jsonb,
  updated_at = now()
WHERE slug = 'grand-gala-noir';

UPDATE invitation_templates
SET
  background_image_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/concert-festival-bg.jpg',
  thumbnail_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/concert-festival-thumb.jpg',
  layout_config = '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Montserrat", "bodyFont": "Montserrat", "accentFont": "Montserrat" },
    "colorPalette": { "primary": "#ec4899", "secondary": "#ffffff", "accent": "#8b5cf6", "background": "#09090b" },
    "slots": {
      "headerBadge": { "topPercent": 17, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 4, "textTransform": "uppercase", "color": "#38bdf8" },
      "eventTitle": { "topPercent": 27, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 38, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 26, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#f472b6" },
      "customMessage": { "topPercent": 62, "leftPercent": 18, "widthPercent": 64, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#f5f3ff" },
      "eventMeta": { "topPercent": 75, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 14, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#cbd5e1" }
    }
  }'::jsonb,
  updated_at = now()
WHERE slug = 'neon-horizon';

UPDATE invitation_templates
SET
  background_image_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/casual-community-bg.jpg',
  thumbnail_url = 'https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/casual-community-thumb.jpg',
  layout_config = '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Montserrat", "bodyFont": "Montserrat", "accentFont": "Playfair Display" },
    "colorPalette": { "primary": "#ea580c", "secondary": "#ffffff", "accent": "#f97316", "background": "#1c1917" },
    "slots": {
      "headerBadge": { "topPercent": 16, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 3, "textTransform": "uppercase", "color": "#fdba74" },
      "eventTitle": { "topPercent": 27, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 36, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 24, "fontWeight": 700, "fontFamily": "Playfair Display", "color": "#ffedd5" },
      "customMessage": { "topPercent": 62, "leftPercent": 18, "widthPercent": 64, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#fafaf9" },
      "eventMeta": { "topPercent": 75, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 14, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#cbd5e1" }
    }
  }'::jsonb,
  updated_at = now()
WHERE slug = 'community-warmth';

COMMIT;

NOTIFY pgrst, 'reload schema';
