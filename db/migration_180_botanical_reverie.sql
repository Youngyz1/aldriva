-- migration_180_botanical_reverie.sql
-- Seed the Botanical Reverie portrait card in the existing invitation catalog.
-- The matching full-page renderer remains code-owned by the page registry.

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
  'Botanical Reverie',
  'botanical-reverie',
  'Wedding & Formal',
  '',
  '/images/invitations/botanical/garden-arch.svg',
  15,
  '{
    "design": "botanical-reverie",
    "canvas": { "width": 900, "height": 1200, "aspectRatio": "3 / 4" },
    "typography": { "titleFont": "Playfair Display", "bodyFont": "Montserrat", "accentFont": "Playfair Display" },
    "colorPalette": { "primary": "#365746", "secondary": "#263b31", "accent": "#bd8583", "background": "#f4efe4" },
    "slots": {
      "headerBadge": { "topPercent": 13, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 12, "fontWeight": 600, "letterSpacing": 3, "textTransform": "uppercase", "color": "#65766a" },
      "eventTitle": { "topPercent": 38, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 42, "fontWeight": 400, "fontFamily": "Playfair Display", "color": "#263b31" },
      "hostNames": { "topPercent": 52, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 28, "fontWeight": 400, "fontFamily": "Playfair Display", "color": "#365746" },
      "guestName": { "topPercent": 52, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 28, "fontWeight": 400, "fontFamily": "Playfair Display", "color": "#365746" },
      "customMessage": { "topPercent": 64, "leftPercent": 16, "widthPercent": 68, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#53665a" },
      "eventMeta": { "topPercent": 79, "leftPercent": 12, "widthPercent": 76, "textAlign": "center", "fontSize": 14, "fontWeight": 500, "fontFamily": "Montserrat", "color": "#53665a" }
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

COMMENT ON COLUMN public.invitation_templates.layout_config IS
  'Code-owned InvitationCardRenderer layout data; Botanical Reverie uses the portrait botanical-stationery design variant.';

COMMIT;

NOTIFY pgrst, 'reload schema';
