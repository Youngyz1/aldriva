import type { NavGroup } from "@/components/nav/nav-active";

/**
 * The primary group also backs the mobile pill nav (see DashboardMobileNav) —
 * every group here is shown in the full sidebar/drawer, but keeping the most
 * common destinations first means they scroll into view first on mobile too.
 */
export const dashboardNavGroups: NavGroup[] = [
  {
    items: [
      { label: "Overview",        href: "/dashboard",                 icon: "LayoutDashboard", exact: true },
      { label: "Analytics",       href: "/dashboard/analytics",       icon: "BarChart2" },
      { label: "Messages",        href: "/dashboard/messages",        icon: "Mail" },
      { label: "Settings",        href: "/dashboard/settings",        icon: "Settings" },
    ],
  },
];
