"use client";

/**
 * components/admin/AdminSidebar.tsx
 * Phase 2 admin shell navigation — collapsible desktop sidebar, mobile
 * top bar, and off-canvas drawer. All admin nav data lives here (moved out
 * of app/admin/layout.tsx so active states can use usePathname()).
 *
 * Collapse state persists in the `admin_sidebar` cookie (read server-side by
 * the layout for the initial render, so there is no flash on load).
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Building2,
  ShoppingBag,
  Calendar,
  HandHeart,
  Home,
  Grid3x3,
  MessageSquareQuote,
  Handshake,
  CreditCard,
  Send,
  Settings,
  Star,
  ScrollText,
  Sparkles,
  ShieldAlert,
  Bot,
  ClipboardList,
  CheckSquare,
  FileText,
  Activity,
  BookOpen,
  Radar,
  FlaskConical,
  CircleDot,
  Brain,
  ArrowLeft,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

import { ADMIN_SIDEBAR_COOKIE } from "./admin-sidebar-cookie";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

/**
 * Single source of truth for admin navigation. NOTE: /admin/system/audit is
 * intentionally absent — no such route exists (dead link removed in Phase 2).
 */
export const adminNavGroups: NavGroup[] = [
  {
    label: "Dashboard",
    items: [
      { label: "Overview", href: "/admin", icon: LayoutDashboard },
    ],
  },
  {
    label: "Users",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Organizations", href: "/admin/organizers", icon: Building2 },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { label: "Events", href: "/admin/events", icon: Calendar },
      { label: "Fundraisers", href: "/admin/fundraisers", icon: HandHeart },
      { label: "Businesses", href: "/admin/businesses", icon: Building2 },
      { label: "Products", href: "/admin/products", icon: ShoppingBag },
      { label: "Articles", href: "/admin/articles", icon: ScrollText },
    ],
  },
  {
    label: "CMS",
    items: [
      { label: "Homepage", href: "/admin/homepage", icon: Home },
      { label: "Categories", href: "/admin/homepage?tab=categories", icon: Grid3x3 },
      { label: "Testimonials", href: "/admin/homepage?tab=testimonials", icon: MessageSquareQuote },
      { label: "Sponsors", href: "/admin/homepage?tab=sponsors", icon: Handshake },
      { label: "Reviews", href: "/admin/reviews", icon: Star },
    ],
  },
  {
    label: "AI Studio",
    items: [
      { label: "Growth Studio", href: "/admin/ai", icon: Sparkles },
      { label: "Guard Rejections", href: "/admin/ai/rejections", icon: ShieldAlert },
    ],
  },
  {
    label: "Workforce",
    items: [
      { label: "Command Center", href: "/admin/workforce", icon: CircleDot },
      { label: "Agents", href: "/admin/workforce/agents", icon: Bot },
      { label: "Tasks", href: "/admin/workforce/tasks", icon: ClipboardList },
      { label: "Approvals", href: "/admin/workforce/approvals", icon: CheckSquare },
      { label: "Reports", href: "/admin/workforce/reports", icon: FileText },
      { label: "Activity", href: "/admin/workforce/activity", icon: Activity },
      { label: "Knowledge", href: "/admin/workforce/knowledge", icon: BookOpen },
      { label: "Sentinel", href: "/admin/workforce/sentinel", icon: Radar },
      { label: "QA", href: "/admin/workforce/qa", icon: FlaskConical },
      { label: "Memory", href: "/admin/workforce/memory", icon: Brain },
    ],
  },
  {
    label: "Finance",
    items: [
      { label: "Payments", href: "/admin/payments", icon: CreditCard },
      { label: "Payouts", href: "/admin/finance/payouts", icon: Send },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Settings", href: "/admin/settings", icon: Settings },
    ],
  },
];

/** Path-only active match: Overview matches exactly, everything else matches its subtree. */
function isActiveLink(pathname: string, href: string): boolean {
  const [path] = href.split("?");
  if (path === "/admin") return pathname === "/admin";
  return pathname === path || pathname.startsWith(`${path}/`);
}

function AdminNavList({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "/admin";

  return (
    <nav className="flex-1 space-y-5" aria-label="Admin">
      {adminNavGroups.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-1 px-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
              {group.label}
            </p>
          )}
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = isActiveLink(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? item.label : undefined}
                  aria-label={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold transition",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                  {!collapsed && item.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AdminBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/admin"
      title={collapsed ? "Admin Panel" : undefined}
      aria-label="Admin Panel"
      className={cn(
        "mb-5 flex items-center gap-3 rounded-xl px-2.5 py-2",
        collapsed && "justify-center px-0"
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-sm font-black">
        A
      </span>
      {!collapsed && (
        <span className="text-sm font-black tracking-tight">Admin Panel</span>
      )}
    </Link>
  );
}

function BackToDashboard({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      href="/dashboard"
      title={collapsed ? "Dashboard" : undefined}
      aria-label="Back to Dashboard"
      className={cn(
        "mt-4 flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-400 transition hover:bg-white/10 hover:text-white",
        collapsed && "justify-center px-0"
      )}
    >
      <ArrowLeft className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {!collapsed && "Dashboard"}
    </Link>
  );
}

/**
 * Desktop sidebar: 248px expanded, 64px icon rail collapsed. Sticks below
 * the global navbar with its own internal scroll; the edge handle straddles
 * the sidebar border at mid-height.
 */
export function AdminSidebar({
  defaultCollapsed = false,
}: {
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const toggle = useCallback(() => {
    const next = !collapsed;
    document.cookie = `${ADMIN_SIDEBAR_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
    setCollapsed(next);
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "group relative z-30 hidden h-[calc(100vh-4rem)] shrink-0 self-start flex-col rounded-2xl bg-slate-950 p-3 text-white shadow-xl shadow-slate-950/20 supports-[height:100dvh]:h-[calc(100dvh-4rem)] lg:flex",
        "sticky top-16",
        "transition-[width] duration-200 motion-reduce:transition-none",
        collapsed ? "w-16" : "w-[248px]"
      )}
      aria-label="Admin sidebar"
    >
      {/* Edge collapse handle — visible on hover/focus, always on touch */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3.5 top-1/2 z-40 hidden h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-500 opacity-0 shadow-sm transition-opacity duration-200 hover:text-zinc-900 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 group-hover:opacity-100 motion-reduce:transition-none lg:flex [@media(hover:none)]:opacity-100"
      >
        {collapsed ? (
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      <AdminBrand collapsed={collapsed} />
      {/* Independent scroll: only this inner column scrolls, so the edge
          handle (positioned on the aside) is never clipped. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        <AdminNavList collapsed={collapsed} />
        <BackToDashboard collapsed={collapsed} />
      </div>
    </aside>
  );
}

/**
 * Mobile (<lg) navigation: slim sticky bar with a menu button opening the
 * same nav as an off-canvas drawer.
 */
export function AdminMobileNav() {
  const [open, setOpen] = useState(false);
  const openDrawer = useCallback(() => setOpen(true), []);
  const closeDrawer = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open ]);

  return (
    <>
      <div className="sticky top-16 z-40 lg:hidden">
        <div className="flex h-14 items-center gap-3 rounded-2xl bg-slate-950 px-4">
          <button
            type="button"
            onClick={openDrawer}
            aria-expanded={open}
            aria-label="Open admin navigation"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-xs font-black">
              A
            </span>
            <span className="text-sm font-black text-white">Admin</span>
          </Link>
          <Link
            href="/dashboard"
            className="ml-auto text-xs font-bold text-slate-400 hover:text-white"
          >
            ← Dashboard
          </Link>
        </div>
      </div>

      {/* Off-canvas drawer */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", !open && "pointer-events-none")}
        aria-hidden={!open}
        inert={!open}
      >
        <div
          onClick={closeDrawer}
          className={cn(
            "absolute inset-0 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0"
          )}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Admin navigation"
          className={cn(
            "absolute left-0 top-0 flex h-full w-72 flex-col overflow-y-auto overscroll-contain bg-slate-950 p-3 text-white shadow-2xl transition-transform duration-200 motion-reduce:transition-none",
            open ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2.5 px-2.5 py-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-xs font-black">
                A
              </span>
              <span className="text-sm font-black text-white">Admin</span>
            </span>
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close admin navigation"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <AdminNavList onNavigate={closeDrawer} />
          <BackToDashboard />
        </aside>
      </div>
    </>
  );
}
