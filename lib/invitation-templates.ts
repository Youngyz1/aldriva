import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { InvitationTemplate } from "./invitation-types";

export const DEFAULT_INVITATION_TEMPLATES: InvitationTemplate[] = [
  {
    id: "tpl_wedding_formal",
    name: "Royal Elegance",
    slug: "royal-elegance",
    category: "Wedding & Formal",
    background_image_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/wedding-formal-bg.jpg",
    thumbnail_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/wedding-formal-thumb.jpg",
    is_active: true,
    sort_order: 10,
    layout_config: {
      canvas: { width: 1200, height: 630 },
      typography: { titleFont: "Cinzel", bodyFont: "Montserrat", accentFont: "Playfair Display" },
      colorPalette: { primary: "#d4af37", secondary: "#ffffff", accent: "#f59e0b", background: "#0b0f19" },
      slots: {
        headerBadge: { topPercent: 23, leftPercent: 18, widthPercent: 64, textAlign: "center", fontSize: 13, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#f59e0b" },
        eventTitle: { topPercent: 31, leftPercent: 18, widthPercent: 64, textAlign: "center", fontSize: 34, fontWeight: 700, fontFamily: "Cinzel", color: "#ffffff" },
        guestName: { topPercent: 50, leftPercent: 18, widthPercent: 64, textAlign: "center", fontSize: 26, fontWeight: 700, fontFamily: "Playfair Display", color: "#fcd34d" },
        customMessage: { topPercent: 63, leftPercent: 20, widthPercent: 60, textAlign: "center", fontSize: 15, fontWeight: 400, fontFamily: "Montserrat", color: "#e2e8f0" },
        eventMeta: { topPercent: 75, leftPercent: 18, widthPercent: 64, textAlign: "center", fontSize: 13, fontWeight: 600, fontFamily: "Montserrat", color: "#cbd5e1" },
      },
    },
  },
  {
    id: "tpl_birthday_celebration",
    name: "Festive Gold & Noir",
    slug: "festive-gold-noir",
    category: "Birthday & Celebration",
    background_image_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/birthday-celebration-bg.jpg",
    thumbnail_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/birthday-celebration-thumb.jpg",
    is_active: true,
    sort_order: 20,
    layout_config: {
      canvas: { width: 1200, height: 630 },
      typography: { titleFont: "Playfair Display", bodyFont: "Montserrat", accentFont: "Montserrat" },
      colorPalette: { primary: "#fbbf24", secondary: "#ffffff", accent: "#f97316", background: "#18181b" },
      slots: {
        headerBadge: { topPercent: 16, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#fbbf24" },
        eventTitle: { topPercent: 27, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 38, fontWeight: 700, fontFamily: "Playfair Display", color: "#ffffff" },
        guestName: { topPercent: 48, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 26, fontWeight: 700, fontFamily: "Montserrat", color: "#fde68a" },
        customMessage: { topPercent: 62, leftPercent: 18, widthPercent: 64, textAlign: "center", fontSize: 15, fontWeight: 400, fontFamily: "Montserrat", color: "#f1f5f9" },
        eventMeta: { topPercent: 76, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 14, fontWeight: 600, fontFamily: "Montserrat", color: "#cbd5e1" },
      },
    },
  },
  {
    id: "tpl_corporate_conference",
    name: "Modern Executive",
    slug: "modern-executive",
    category: "Corporate & Conference",
    background_image_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/corporate-conference-bg.jpg",
    thumbnail_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/corporate-conference-thumb.jpg",
    is_active: true,
    sort_order: 30,
    layout_config: {
      canvas: { width: 1200, height: 630 },
      typography: { titleFont: "Montserrat", bodyFont: "Montserrat", accentFont: "Montserrat" },
      colorPalette: { primary: "#38bdf8", secondary: "#ffffff", accent: "#0ea5e9", background: "#0f172a" },
      slots: {
        headerBadge: { topPercent: 17, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 12, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#38bdf8" },
        eventTitle: { topPercent: 27, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 36, fontWeight: 700, fontFamily: "Montserrat", color: "#ffffff" },
        guestName: { topPercent: 48, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 24, fontWeight: 700, fontFamily: "Montserrat", color: "#7dd3fc" },
        customMessage: { topPercent: 62, leftPercent: 18, widthPercent: 64, textAlign: "center", fontSize: 15, fontWeight: 400, fontFamily: "Montserrat", color: "#e2e8f0" },
        eventMeta: { topPercent: 75, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 14, fontWeight: 600, fontFamily: "Montserrat", color: "#94a3b8" },
      },
    },
  },
  {
    id: "tpl_gala_fundraiser",
    name: "Grand Gala Noir",
    slug: "grand-gala-noir",
    category: "Gala & Fundraiser",
    background_image_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/gala-fundraiser-bg.jpg",
    thumbnail_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/gala-fundraiser-thumb.jpg",
    is_active: true,
    sort_order: 40,
    layout_config: {
      canvas: { width: 1200, height: 630 },
      typography: { titleFont: "Cinzel", bodyFont: "Montserrat", accentFont: "Playfair Display" },
      colorPalette: { primary: "#f59e0b", secondary: "#ffffff", accent: "#d97706", background: "#000000" },
      slots: {
        headerBadge: { topPercent: 17, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 13, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#fbbf24" },
        eventTitle: { topPercent: 27, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 38, fontWeight: 700, fontFamily: "Cinzel", color: "#ffffff" },
        guestName: { topPercent: 48, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 26, fontWeight: 700, fontFamily: "Playfair Display", color: "#fbbf24" },
        customMessage: { topPercent: 62, leftPercent: 18, widthPercent: 64, textAlign: "center", fontSize: 15, fontWeight: 400, fontFamily: "Montserrat", color: "#f3f4f6" },
        eventMeta: { topPercent: 75, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 14, fontWeight: 600, fontFamily: "Montserrat", color: "#cbd5e1" },
      },
    },
  },
  {
    id: "tpl_concert_festival",
    name: "Neon Horizon",
    slug: "neon-horizon",
    category: "Concert & Festival",
    background_image_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/concert-festival-bg.jpg",
    thumbnail_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/concert-festival-thumb.jpg",
    is_active: true,
    sort_order: 50,
    layout_config: {
      canvas: { width: 1200, height: 630 },
      typography: { titleFont: "Montserrat", bodyFont: "Montserrat", accentFont: "Montserrat" },
      colorPalette: { primary: "#ec4899", secondary: "#ffffff", accent: "#8b5cf6", background: "#09090b" },
      slots: {
        headerBadge: { topPercent: 17, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 13, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#38bdf8" },
        eventTitle: { topPercent: 27, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 38, fontWeight: 700, fontFamily: "Montserrat", color: "#ffffff" },
        guestName: { topPercent: 48, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 26, fontWeight: 700, fontFamily: "Montserrat", color: "#f472b6" },
        customMessage: { topPercent: 62, leftPercent: 18, widthPercent: 64, textAlign: "center", fontSize: 15, fontWeight: 400, fontFamily: "Montserrat", color: "#f5f3ff" },
        eventMeta: { topPercent: 75, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 14, fontWeight: 600, fontFamily: "Montserrat", color: "#cbd5e1" },
      },
    },
  },
  {
    id: "tpl_casual_community",
    name: "Community Warmth",
    slug: "community-warmth",
    category: "Casual & Community",
    background_image_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/casual-community-bg.jpg",
    thumbnail_url: "https://hkvjdtbhiycqqhgelymr.supabase.co/storage/v1/object/public/cms-media/invitation-templates/casual-community-thumb.jpg",
    is_active: true,
    sort_order: 60,
    layout_config: {
      canvas: { width: 1200, height: 630 },
      typography: { titleFont: "Montserrat", bodyFont: "Montserrat", accentFont: "Playfair Display" },
      colorPalette: { primary: "#ea580c", secondary: "#ffffff", accent: "#f97316", background: "#1c1917" },
      slots: {
        headerBadge: { topPercent: 16, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 13, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "#fdba74" },
        eventTitle: { topPercent: 27, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 36, fontWeight: 700, fontFamily: "Montserrat", color: "#ffffff" },
        guestName: { topPercent: 48, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 24, fontWeight: 700, fontFamily: "Playfair Display", color: "#ffedd5" },
        customMessage: { topPercent: 62, leftPercent: 18, widthPercent: 64, textAlign: "center", fontSize: 15, fontWeight: 400, fontFamily: "Montserrat", color: "#fafaf9" },
        eventMeta: { topPercent: 75, leftPercent: 15, widthPercent: 70, textAlign: "center", fontSize: 14, fontWeight: 600, fontFamily: "Montserrat", color: "#cbd5e1" },
      },
    },
  },
];

export async function getInvitationTemplates(): Promise<InvitationTemplate[]> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("invitation_templates")
      .select("id, name, slug, category, background_image_url, thumbnail_url, layout_config, is_active, sort_order, created_at, updated_at")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return DEFAULT_INVITATION_TEMPLATES;
    }

    return data as InvitationTemplate[];
  } catch {
    return DEFAULT_INVITATION_TEMPLATES;
  }
}

export async function getInvitationTemplateById(id?: string | null): Promise<InvitationTemplate> {
  if (!id) return DEFAULT_INVITATION_TEMPLATES[0];

  // Check built-in list first
  const builtIn = DEFAULT_INVITATION_TEMPLATES.find((t) => t.id === id || t.slug === id);
  if (builtIn) return builtIn;

  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin
      .from("invitation_templates")
      .select("*")
      .eq("id", id)
      .single();

    if (data) return data as InvitationTemplate;
  } catch {
    // fallback
  }

  return DEFAULT_INVITATION_TEMPLATES[0];
}
