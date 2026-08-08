import {
  LayoutDashboard, Building2, BarChart2, Mail, Settings,
  Calendar, Users, Newspaper, Store, ShoppingBag, Heart,
} from "lucide-react";
import type { NavGroup } from "@/components/nav/nav-active";

/**
 * The primary group also backs the mobile pill nav (see DashboardMobileNav) —
 * every group here is shown in the full sidebar/drawer, but keeping the most
 * common destinations first means they scroll into view first on mobile too.
 */
export const dashboardNavGroups: NavGroup[] = [
  {
    items: [
      { label: "Overview",      href: "/dashboard",               icon: LayoutDashboard, exact: true },
      { label: "Organizations", href: "/dashboard/organizations", icon: Building2 },
      { label: "Analytics",     href: "/dashboard/analytics",     icon: BarChart2 },
      { label: "Messages",      href: "/dashboard/messages",      icon: Mail },
      { label: "Settings",      href: "/dashboard/settings",      icon: Settings },
    ],
  },
  {
    label: "Manage",
    items: [
      { label: "Fundraisers", href: "/dashboard/fundraisers", icon: Heart },
      { label: "Events",      href: "/dashboard/events",      icon: Calendar },
      { label: "Attendees",   href: "/dashboard/attendees",   icon: Users },
      { label: "Articles",    href: "/dashboard/articles",    icon: Newspaper },
      { label: "Businesses",  href: "/dashboard/businesses",  icon: Store },
      { label: "Products",    href: "/dashboard/products",    icon: ShoppingBag },
    ],
  },
];
