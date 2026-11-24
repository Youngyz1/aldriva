import type { NavGroup } from "@/components/nav/nav-active";

/**
 * The primary group also backs the mobile pill nav (see DashboardMobileNav) —
 * every group here is shown in the full sidebar/drawer, but keeping the most
 * common destinations first means they scroll into view first on mobile too.
 */
export const dashboardNavGroups: NavGroup[] = [
  {
    items: [
      { label: "Dashboard",       href: "/dashboard",                 icon: "LayoutDashboard", exact: true },
      { label: "Events",          href: "/dashboard/events",          icon: "Calendar" },
      { label: "My Donations",    href: "/dashboard/donations",       icon: "Heart" },
      { label: "My Tickets",      href: "/events/my-tickets",         icon: "CalendarCheck" },
      { label: "Campaigns",       href: "/dashboard/fundraisers",     icon: "HeartHandshake" },
      { label: "Businesses",      href: "/dashboard/businesses",      icon: "Store" },
      { label: "Articles",        href: "/dashboard/articles",        icon: "Newspaper" },
      { label: "Products",        href: "/dashboard/products",        icon: "ShoppingBag" },
      { label: "Analytics",       href: "/dashboard/analytics",       icon: "BarChart2" },
      { label: "Messages",        href: "/dashboard/messages",        icon: "Mail" },
      { label: "My Organizers",   href: "/dashboard/organizations",   icon: "Users" },
      { label: "Settings",        href: "/dashboard/settings",        icon: "Settings" },
    ],
  },
];
