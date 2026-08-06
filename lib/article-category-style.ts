import type { LucideIcon } from "lucide-react";
import {
  Laptop,
  Briefcase,
  Rocket,
  HandHeart,
  CalendarDays,
  GraduationCap,
  HeartPulse,
  Sparkles,
  Megaphone,
  Landmark,
  Users,
  Lightbulb,
  Tag,
} from "lucide-react";

export type CategoryStyle = { icon: LucideIcon; gradient: string };

/**
 * Icon + gradient per known article category name (case-insensitive match).
 * Categories are freeform text authors type when publishing (articles.categories
 * is a text[], not a fixed enum) — this is a display-only lookup applied over
 * whatever real distinct categories exist, with FALLBACK_CATEGORY_STYLE for
 * any name not in this map, so the category grid never breaks on new/unusual
 * category names.
 */
const CATEGORY_STYLE_MAP: Record<string, CategoryStyle> = {
  technology: { icon: Laptop, gradient: "from-blue-500 to-indigo-600" },
  business: { icon: Briefcase, gradient: "from-slate-600 to-slate-800" },
  startups: { icon: Rocket, gradient: "from-orange-500 to-red-600" },
  fundraising: { icon: HandHeart, gradient: "from-emerald-500 to-teal-600" },
  events: { icon: CalendarDays, gradient: "from-purple-500 to-fuchsia-600" },
  education: { icon: GraduationCap, gradient: "from-amber-500 to-orange-600" },
  health: { icon: HeartPulse, gradient: "from-rose-500 to-pink-600" },
  ai: { icon: Sparkles, gradient: "from-violet-500 to-purple-700" },
  marketing: { icon: Megaphone, gradient: "from-pink-500 to-rose-600" },
  finance: { icon: Landmark, gradient: "from-green-600 to-emerald-700" },
  community: { icon: Users, gradient: "from-cyan-500 to-blue-600" },
  innovation: { icon: Lightbulb, gradient: "from-yellow-400 to-amber-600" },
};

export const FALLBACK_CATEGORY_STYLE: CategoryStyle = {
  icon: Tag,
  gradient: "from-zinc-500 to-zinc-700",
};

export function getCategoryStyle(name: string): CategoryStyle {
  return CATEGORY_STYLE_MAP[name.trim().toLowerCase()] ?? FALLBACK_CATEGORY_STYLE;
}
