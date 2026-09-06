/**
 * app/admin/layout.tsx
 * Admin section layout — grouped sidebar navigation for marketplace architecture.
 * Calls requireAdmin() to block non-admins.
 */

import Link from "next/link";
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { ReactNode } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  ShoppingBag,
  Calendar,
  HandHeart,
  Layers,
  Home,
  Grid3x3,
  MessageSquareQuote,
  Handshake,
  CreditCard,
  Send,
  Settings,
  ScrollText,
  ArrowLeft,
  Star,
  Sparkles,
  ShieldAlert,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview",     href: "/admin",             icon: LayoutDashboard },
    ],
  },
  {
    label: "Users",
    items: [
      { label: "Users",        href: "/admin/users",       icon: Users },
      { label: "Organizations", href: "/admin/organizers",  icon: Building2 },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { label: "Events",       href: "/admin/events",      icon: Calendar },
      { label: "Fundraisers",  href: "/admin/fundraisers", icon: HandHeart },
      { label: "Businesses",   href: "/admin/businesses",  icon: Building2 },
      { label: "Products",     href: "/admin/products",    icon: ShoppingBag },
      { label: "Articles",     href: "/admin/articles",    icon: ScrollText },
    ],
  },
  {
    label: "CMS",
    items: [
      { label: "Homepage",     href: "/admin/homepage",    icon: Home },
      { label: "Categories",   href: "/admin/homepage?tab=categories",   icon: Grid3x3 },
      { label: "Testimonials", href: "/admin/homepage?tab=testimonials", icon: MessageSquareQuote },
      { label: "Sponsors",     href: "/admin/homepage?tab=sponsors",     icon: Handshake },
      { label: "Reviews",      href: "/admin/reviews",     icon: Star },
    ],
  },
  {
    label: "AI Studio",
    items: [
      { label: "Growth Studio",     href: "/admin/ai",           icon: Sparkles },
      { label: "Guard Rejections",  href: "/admin/ai/rejections", icon: ShieldAlert },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Payments",     href: "/admin/payments",    icon: CreditCard },
      { label: "Payouts",      href: "/admin/finance/payouts", icon: Send },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings",     href: "/admin/settings",    icon: Settings },
      { label: "Audit Logs",   href: "/admin/system/audit", icon: ScrollText },
    ],
  },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // proxy.ts already verifies admin role for every /admin/* request and
  // marks it with this header — skip the redundant Supabase round-trip on
  // that (expected) path. If the header is ever missing, fall back to the
  // full check so a non-admin can never slip through.
  const headerList = await headers();
  if (headerList.get("x-admin-verified") !== "1") {
    await requireAdmin();
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      {/* No vertical padding on this flex row by design: the sticky sidebar
          cannot cross its parent's padding box, so parent top/bottom padding
          would shove it up/down at the scroll extremes. Breathing room lives
          on the content column (py-6) and the sidebar's own p-3 instead. */}
      <div className="mx-auto flex max-w-7xl gap-6 px-4 sm:px-6 lg:px-8">

        {/* ── Sidebar — pinned app chrome (same pattern as the dashboard /
            org sidebars): sticks below the sticky global navbar (h-16) so it
            never slides underneath it, exactly viewport-minus-navbar tall so
            the footer stays reachable. `self-start` keeps `sticky` working
            inside the flex-row parent; the nav scrolls internally when taller
            than the viewport while the page scroll moves only the content. ── */}
        <aside className="sticky top-16 z-30 hidden h-[calc(100vh-4rem)] w-56 shrink-0 self-start flex-col overflow-y-auto overscroll-contain rounded-2xl bg-slate-950 p-3 text-white shadow-xl shadow-slate-950/20 supports-[height:100dvh]:h-[calc(100dvh-4rem)] lg:flex">
          {/* Brand */}
          <Link href="/admin" className="mb-5 flex items-center gap-3 rounded-xl px-2.5 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-sm font-black">
              A
            </span>
            <span className="text-sm font-black tracking-tight">Admin Panel</span>
          </Link>

          {/* Nav groups */}
          <nav className="flex-1 space-y-5">
            {navGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Back to Dashboard */}
          <Link
            href="/dashboard"
            className="mt-4 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
            Dashboard
          </Link>
        </aside>

        {/* ── Content column — the mobile top nav shows below lg; `children`
            render ONCE here (shared across breakpoints) so admin pages don't
            mount their client components twice. ── */}
        <div className="flex min-w-0 flex-1 flex-col gap-6 py-6">
          {/* Mobile top nav — pinned below the sticky global navbar (same
              pattern as DashboardMobileNav): the outer shell owns the sticky
              positioning, the inner wrapper owns the horizontal scrolling —
              keeping them separate avoids creating a vertical scroll container
              that would defeat the stickiness. Solid page-bg so scrolled
              content can't show through the gaps. Sticky keeps it in document
              flow, so no content is ever hidden underneath it. */}
          <div className="sticky top-16 z-40 flex flex-col gap-6 bg-zinc-100 pb-1 lg:hidden">
            <div className="flex items-center justify-between rounded-2xl bg-slate-950 px-4 py-3">
              <Link href="/admin" className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-xs font-black">A</span>
                <span className="text-sm font-black text-white">Admin</span>
              </Link>
              <Link href="/dashboard" className="text-xs font-bold text-slate-400 hover:text-white">
                ← Dashboard
              </Link>
            </div>
            <div className="overflow-x-auto pb-1">
              <div className="flex gap-1.5 whitespace-nowrap">
                {navGroups.flatMap((g) => g.items).map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm hover:bg-violet-50 hover:text-violet-700"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Shared page content */}
          <section className="min-w-0 flex-1">{children}</section>
        </div>
      </div>
    </div>
  );
}
