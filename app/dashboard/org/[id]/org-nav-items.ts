import {
  LayoutDashboard, Calendar, Heart, Package, Briefcase,
  Users, BookOpen, Star, ImageIcon, BarChart2, Settings,
} from "lucide-react";
import type { NavItem } from "@/components/nav/nav-active";

/**
 * The org-workspace destinations — single source of truth shared by the
 * desktop OrgDashboardSidebar and the mobile OrgMobileNav pill strip, so both
 * always expose the same links.
 *
 * Base always uses the immutable org UUID — never the slug (public profile
 * URLs use the slug, workspace URLs use the id).
 */
export function getOrgNavItems(base: string): NavItem[] {
  return [
    { label: "Overview",     href: `${base}/overview`,    icon: LayoutDashboard },
    { label: "Events",       href: `${base}/events`,      icon: Calendar },
    { label: "Fundraisers",  href: `${base}/fundraisers`, icon: Heart },
    { label: "Products",     href: `${base}/products`,    icon: Package },
    { label: "Services",     href: `${base}/services`,    icon: Briefcase,  comingSoon: true },
    { label: "Volunteers",   href: `${base}/volunteers`,  icon: Users,      comingSoon: true },
    { label: "Blog",         href: `${base}/blog`,        icon: BookOpen },
    { label: "Reviews",      href: `${base}/reviews`,     icon: Star },
    { label: "Gallery",      href: `${base}/gallery`,     icon: ImageIcon,  comingSoon: true },
    { label: "Analytics",    href: `${base}/analytics`,   icon: BarChart2 },
    { label: "Settings",     href: `${base}/settings`,    icon: Settings },
  ];
}
