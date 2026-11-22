-- Mirror of db/migration_181_luxe_editorial_invitation_card.sql.

BEGIN;

INSERT INTO public.invitation_templates (
  name,
  slug,
  category,
  background_image_url,
  thumbnail_url,
  sort_order,
  layout_config,
  is_active
)
VALUES (
  'Luxe Editorial',
  'luxe-editorial',
  'Wedding & Formal',
  '',
  NULL,
  16,
  '{
    "design": "luxe-editorial",
    "canvas": { "width": 900, "height": 1200, "aspectRatio": "3 / 4" },
    "typography": { "titleFont": "Playfair Display", "bodyFont": "Montserrat", "accentFont": "Playfair Display" },
    "colorPalette": { "primary": "#8c7656", "secondary": "#4a4a4a", "accent": "#c5a880", "background": "#fdfaf6" },
    "slots": {
      "headerBadge": { "topPercent": 13, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 12, "fontWeight": 600, "letterSpacing": 3, "textTransform": "uppercase", "color": "#8c7656" },
      "eventTitle": { "topPercent": 38, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 42, "fontWeight": 400, "fontFamily": "Playfair Display", "color": "#4a4a4a" },
      "hostNames": { "topPercent": 54, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 28, "fontWeight": 400, "fontFamily": "Playfair Display", "color": "#4a4a4a" },
      "guestName": { "topPercent": 54, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 28, "fontWeight": 400, "fontFamily": "Playfair Display", "color": "#4a4a4a" },
      "customMessage": { "topPercent": 66, "leftPercent": 16, "widthPercent": 68, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#6a5c52" },
      "eventMeta": { "topPercent": 80, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 14, "fontWeight": 500, "fontFamily": "Montserrat", "color": "#6a5c52" }
    }
  }'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  background_image_url = EXCLUDED.background_image_url,
  thumbnail_url = EXCLUDED.thumbnail_url,
  sort_order = EXCLUDED.sort_order,
  layout_config = EXCLUDED.layout_config,
  is_active = true,
  updated_at = now();

COMMIT;

NOTIFY pgrst, 'reload schema';
