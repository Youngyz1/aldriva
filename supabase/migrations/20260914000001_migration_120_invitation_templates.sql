-- migration_120_invitation_templates.sql
-- Invitation Card System: customizable invitation card templates with Satori layout configs.

-- 1. Create invitation_templates table
CREATE TABLE IF NOT EXISTS invitation_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  slug                 TEXT NOT NULL UNIQUE,
  category             TEXT NOT NULL CHECK (category IN (
                         'Wedding & Formal',
                         'Birthday & Celebration',
                         'Corporate & Conference',
                         'Gala & Fundraiser',
                         'Concert & Festival',
                         'Casual & Community'
                       )),
  background_image_url TEXT NOT NULL,
  thumbnail_url        TEXT,
  layout_config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add invitation_template_id to events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS invitation_template_id UUID REFERENCES invitation_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_invitation_template_id ON events(invitation_template_id);
CREATE INDEX IF NOT EXISTS idx_invitation_templates_category ON invitation_templates(category);
CREATE INDEX IF NOT EXISTS idx_invitation_templates_is_active_sort ON invitation_templates(is_active, sort_order);

-- 3. Row Level Security (RLS)
ALTER TABLE invitation_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active invitation templates are readable by everyone" ON invitation_templates;
CREATE POLICY "Active invitation templates are readable by everyone"
  ON invitation_templates FOR SELECT
  USING (
    is_active = true
    OR (auth.uid() IS NOT NULL AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  );

DROP POLICY IF EXISTS "Admins can insert invitation templates" ON invitation_templates;
CREATE POLICY "Admins can insert invitation templates"
  ON invitation_templates FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admins can update invitation templates" ON invitation_templates;
CREATE POLICY "Admins can update invitation templates"
  ON invitation_templates FOR UPDATE
  USING (auth.uid() IS NOT NULL AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK (auth.uid() IS NOT NULL AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

DROP POLICY IF EXISTS "Admins can delete invitation templates" ON invitation_templates;
CREATE POLICY "Admins can delete invitation templates"
  ON invitation_templates FOR DELETE
  USING (auth.uid() IS NOT NULL AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- 4. Permissions
GRANT SELECT ON invitation_templates TO anon, authenticated;
GRANT ALL ON invitation_templates TO service_role;

-- 5. Seed 6 Category Templates (one per category)
INSERT INTO invitation_templates (name, slug, category, background_image_url, thumbnail_url, sort_order, layout_config)
VALUES
(
  'Royal Elegance',
  'royal-elegance',
  'Wedding & Formal',
  '/images/invitations/templates/wedding-formal-bg.jpg',
  '/images/invitations/templates/wedding-formal-thumb.jpg',
  10,
  '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Cinzel", "bodyFont": "Montserrat", "accentFont": "Playfair Display" },
    "colorPalette": { "primary": "#d4af37", "secondary": "#ffffff", "accent": "#f59e0b", "background": "#0b0f19" },
    "slots": {
      "headerBadge": { "topPercent": 12, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 4, "textTransform": "uppercase", "color": "#d4af37" },
      "eventTitle": { "topPercent": 24, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 38, "fontWeight": 700, "fontFamily": "Cinzel", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 26, "fontWeight": 700, "fontFamily": "Playfair Display", "color": "#fcd34d" },
      "customMessage": { "topPercent": 62, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#e2e8f0" },
      "eventMeta": { "topPercent": 76, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 15, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#94a3b8" }
    }
  }'::jsonb
),
(
  'Festive Gold & Noir',
  'festive-gold-noir',
  'Birthday & Celebration',
  '/images/invitations/templates/birthday-celebration-bg.jpg',
  '/images/invitations/templates/birthday-celebration-thumb.jpg',
  20,
  '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Playfair Display", "bodyFont": "Montserrat", "accentFont": "Montserrat" },
    "colorPalette": { "primary": "#fbbf24", "secondary": "#ffffff", "accent": "#f97316", "background": "#18181b" },
    "slots": {
      "headerBadge": { "topPercent": 12, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 3, "textTransform": "uppercase", "color": "#fbbf24" },
      "eventTitle": { "topPercent": 24, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 38, "fontWeight": 700, "fontFamily": "Playfair Display", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 26, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#fde68a" },
      "customMessage": { "topPercent": 62, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#f1f5f9" },
      "eventMeta": { "topPercent": 76, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 15, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#cbd5e1" }
    }
  }'::jsonb
),
(
  'Modern Executive',
  'modern-executive',
  'Corporate & Conference',
  '/images/invitations/templates/corporate-conference-bg.jpg',
  '/images/invitations/templates/corporate-conference-thumb.jpg',
  30,
  '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Montserrat", "bodyFont": "Montserrat", "accentFont": "Montserrat" },
    "colorPalette": { "primary": "#38bdf8", "secondary": "#ffffff", "accent": "#0ea5e9", "background": "#0f172a" },
    "slots": {
      "headerBadge": { "topPercent": 12, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 12, "fontWeight": 700, "letterSpacing": 4, "textTransform": "uppercase", "color": "#38bdf8" },
      "eventTitle": { "topPercent": 24, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 36, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 24, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#7dd3fc" },
      "customMessage": { "topPercent": 62, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#e2e8f0" },
      "eventMeta": { "topPercent": 76, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 15, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#94a3b8" }
    }
  }'::jsonb
),
(
  'Grand Gala Noir',
  'grand-gala-noir',
  'Gala & Fundraiser',
  '/images/invitations/templates/gala-fundraiser-bg.jpg',
  '/images/invitations/templates/gala-fundraiser-thumb.jpg',
  40,
  '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Cinzel", "bodyFont": "Montserrat", "accentFont": "Playfair Display" },
    "colorPalette": { "primary": "#f59e0b", "secondary": "#ffffff", "accent": "#d97706", "background": "#000000" },
    "slots": {
      "headerBadge": { "topPercent": 12, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 4, "textTransform": "uppercase", "color": "#f59e0b" },
      "eventTitle": { "topPercent": 24, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 38, "fontWeight": 700, "fontFamily": "Cinzel", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 26, "fontWeight": 700, "fontFamily": "Playfair Display", "color": "#fbbf24" },
      "customMessage": { "topPercent": 62, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#f3f4f6" },
      "eventMeta": { "topPercent": 76, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 15, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#9ca3af" }
    }
  }'::jsonb
),
(
  'Neon Horizon',
  'neon-horizon',
  'Concert & Festival',
  '/images/invitations/templates/concert-festival-bg.jpg',
  '/images/invitations/templates/concert-festival-thumb.jpg',
  50,
  '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Montserrat", "bodyFont": "Montserrat", "accentFont": "Montserrat" },
    "colorPalette": { "primary": "#ec4899", "secondary": "#ffffff", "accent": "#8b5cf6", "background": "#09090b" },
    "slots": {
      "headerBadge": { "topPercent": 12, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 4, "textTransform": "uppercase", "color": "#ec4899" },
      "eventTitle": { "topPercent": 24, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 38, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 26, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#c084fc" },
      "customMessage": { "topPercent": 62, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#f5f3ff" },
      "eventMeta": { "topPercent": 76, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 15, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#a1a1aa" }
    }
  }'::jsonb
),
(
  'Community Warmth',
  'community-warmth',
  'Casual & Community',
  '/images/invitations/templates/casual-community-bg.jpg',
  '/images/invitations/templates/casual-community-thumb.jpg',
  60,
  '{
    "canvas": { "width": 1200, "height": 630 },
    "typography": { "titleFont": "Montserrat", "bodyFont": "Montserrat", "accentFont": "Playfair Display" },
    "colorPalette": { "primary": "#ea580c", "secondary": "#ffffff", "accent": "#f97316", "background": "#1c1917" },
    "slots": {
      "headerBadge": { "topPercent": 12, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 13, "fontWeight": 700, "letterSpacing": 3, "textTransform": "uppercase", "color": "#fdba74" },
      "eventTitle": { "topPercent": 24, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 36, "fontWeight": 700, "fontFamily": "Montserrat", "color": "#ffffff" },
      "guestName": { "topPercent": 48, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 24, "fontWeight": 700, "fontFamily": "Playfair Display", "color": "#ffedd5" },
      "customMessage": { "topPercent": 62, "leftPercent": 15, "widthPercent": 70, "textAlign": "center", "fontSize": 15, "fontWeight": 400, "fontFamily": "Montserrat", "color": "#fafaf9" },
      "eventMeta": { "topPercent": 76, "leftPercent": 10, "widthPercent": 80, "textAlign": "center", "fontSize": 15, "fontWeight": 600, "fontFamily": "Montserrat", "color": "#a8a29e" }
    }
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  background_image_url = EXCLUDED.background_image_url,
  thumbnail_url = EXCLUDED.thumbnail_url,
  sort_order = EXCLUDED.sort_order,
  layout_config = EXCLUDED.layout_config,
  updated_at = now();

NOTIFY pgrst, 'reload schema';
