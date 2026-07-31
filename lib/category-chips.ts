import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  Laptop,
  Mic,
  Stethoscope,
  Users,
  Tag,
  Music,
  Heart,
  Star,
  Globe,
  Zap,
  BookOpen,
  Coffee,
} from "lucide-react";
import { unstable_cache } from "next/cache";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export type CategoryChip = { name: string; icon: LucideIcon };

/**
 * Map of icon names the CMS may store in homepage_categories.icon.
 * Adding new icons here keeps the bundle tree-shakeable — never use
 * `import * as LucideIcons` which defeats tree-shaking.
 */
const CATEGORY_ICON_MAP: Record<string, LucideIcon> = {
  Mic, Briefcase, GraduationCap, HandHeart, HeartHandshake,
  Laptop, Stethoscope, Users, Tag, Music, Heart, Star, Globe,
  Zap, BookOpen, Coffee,
};

export const DEFAULT_CATEGORY_CHIPS: CategoryChip[] = [
  { name: "Music", icon: Mic },
  { name: "Business", icon: Briefcase },
  { name: "Education", icon: GraduationCap },
  { name: "Charity", icon: HandHeart },
  { name: "Medical", icon: Stethoscope },
  { name: "Church", icon: HeartHandshake },
  { name: "Community", icon: Users },
  { name: "Technology", icon: Laptop },
];

const getCachedCategoryRows = unstable_cache(
  async () => {
    try {
      const supabaseAdmin = createSupabaseAdmin();
      const { data } = await supabaseAdmin
        .from("homepage_categories")
        .select("name, icon")
        .eq("is_visible", true)
        .order("position", { ascending: true });
      return data && data.length > 0 ? data : null;
    } catch {
      return null;
    }
  },
  ["homepage-categories"],
  { revalidate: 300 }
);

/** Category chips shown on the homepage and /events — DB-managed (homepage_categories), falling back to a static list. */
export async function getCategoryChips(): Promise<CategoryChip[]> {
  const rows = await getCachedCategoryRows();
  if (!rows) return DEFAULT_CATEGORY_CHIPS;
  return rows.map((row) => ({
    name: row.name,
    icon: CATEGORY_ICON_MAP[row.icon] ?? Tag,
  }));
}
