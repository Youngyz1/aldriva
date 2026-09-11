"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Building2,
  CalendarDays,
  ChevronDown,
  Heart,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShoppingBag,
  Ticket,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import BrandMark from "@/components/BrandMark";
import NotificationBell from "@/components/notifications/NotificationBell";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { cn } from "@/lib/utils";

type Account = {
  id: string;
  displayName: string;
  email?: string;
};

const NAV_LINKS = [
  { label: "Events", href: "/events", icon: CalendarDays },
  { label: "Fundraisers", href: "/fundraisers", icon: Heart },
  { label: "Find Tickets", href: "/find-tickets", icon: Ticket },
  { label: "Articles", href: "/articles", icon: BookOpen },
  { label: "Businesses", href: "/businesses", icon: Building2 },
  { label: "Shop", href: "/products", icon: ShoppingBag },
] as const;

function NavLink({
  href,
  label,
  active,
  onClick,
}: {
  href: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-bold transition",
        active
          ? "bg-orange-50 text-orange-700"
          : "text-zinc-700 hover:bg-zinc-50 hover:text-orange-600"
      )}
    >
      {label}
    </Link>
  );
}

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [account, setAccount] = useState<Account | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  function accountFromUser(
    user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined
  ) {
    if (!user?.email) return null;
    const displayName =
      typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
        ? user.user_metadata.display_name.trim()
        : user.email.split("@")[0];
    return { id: user.id, displayName, email: user.email };
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAccount(accountFromUser(data.session?.user));
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccount(accountFromUser(session?.user));
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile drawer is open
  useEffect(() => {
    if (menuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [menuOpen]);

  // Handle Escape key to close mobile drawer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setAccountOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setAccountOpen(false);
    setMenuOpen(false);
    router.push("/login");
    router.refresh();
  }

  const accountName = account?.displayName ?? "";
  const initials = accountName ? accountName.slice(0, 2).toUpperCase() : "";
  const publicProfileHref = account ? `/profile/${account.id}` : "/login";

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-2 px-3 sm:px-4 md:px-6">
        <Link href="/" className="min-w-0 shrink-0 text-zinc-950">
          <BrandMark className="[&>img]:h-8 [&>img]:max-w-[7.5rem] sm:[&>img]:h-12 sm:[&>img]:max-w-none" priority />
        </Link>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <NavLink key={href} href={href} label={label} active={isActive(href)} />
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {/* Notifications on desktop / tablet */}
          {account && <NotificationBell userId={account.id} />}

          {/* Desktop logged-in account menu */}
          {account ? (
            <div className="relative hidden sm:block" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white p-1.5 transition hover:border-orange-200 xl:h-auto xl:w-auto xl:justify-start xl:gap-2 xl:py-1.5 xl:pl-1.5 xl:pr-3"
                aria-expanded={accountOpen}
                aria-label="Account menu"
              >
                <LocalBrandedPlaceholder
                  variant="avatar"
                  title={accountName}
                  initials={initials}
                  className="h-8 w-8 rounded-full from-orange-600 to-orange-600 text-xs font-bold"
                />
                <span className="hidden max-w-28 truncate text-sm font-bold text-zinc-800 xl:inline">
                  {accountName}
                </span>
                <ChevronDown className={cn("hidden h-4 w-4 text-zinc-400 xl:block transition-transform", accountOpen && "rotate-180")} />
              </button>
              {accountOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-zinc-200 bg-white py-2 shadow-xl">
                  <p className="truncate px-4 py-2 text-sm font-black text-zinc-900">{accountName}</p>
                  <div className="my-1 border-t border-zinc-100" />
                  <Link href="/dashboard" className="block px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:text-orange-600">
                    Dashboard
                  </Link>
                  <Link href="/events/my-tickets" className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:text-orange-600">
                    <Ticket className="h-4 w-4" />
                    My tickets
                  </Link>
                  <Link href={publicProfileHref} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:text-orange-600">
                    <UserRound className="h-4 w-4" />
                    View Profile
                  </Link>
                  <Link href="/dashboard/settings/profile" className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:text-orange-600">
                    <Settings className="h-4 w-4" />
                    Account settings
                  </Link>
                  <div className="my-1 border-t border-zinc-100" />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="block w-full px-4 py-2 text-left text-sm font-bold text-red-600 hover:bg-red-50"
                  >
                    Log out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-bold text-zinc-700 hover:text-orange-600">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-black text-white transition hover:bg-zinc-800"
              >
                Sign up
              </Link>
            </div>
          )}

          {/* Mobile hamburger menu button — the ONLY menu trigger on mobile */}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-300 bg-white text-zinc-900 shadow-2xs transition hover:border-orange-500 hover:text-orange-600 active:scale-95 lg:hidden"
            aria-expanded={menuOpen}
            aria-label="Open navigation menu"
          >
            <Menu className="h-6 w-6 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Slide-out Mobile Navigation Drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Slide-in drawer container */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation drawer"
            className="fixed inset-y-0 right-0 z-50 flex w-[85vw] max-w-sm flex-col justify-between bg-white shadow-2xl transition-transform duration-300 ease-out"
          >
            {/* Drawer Top Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
              <BrandMark className="[&>img]:h-8 [&>img]:max-w-[7rem]" priority />
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-950 active:scale-95"
                aria-label="Close menu"
              >
                <X className="h-5 w-5 stroke-[2.5]" />
              </button>
            </div>

            {/* Scrollable Drawer Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Authenticated user profile banner */}
              {account ? (
                <div className="rounded-2xl border border-orange-100 bg-orange-50/70 p-4">
                  <div className="flex items-center gap-3">
                    <LocalBrandedPlaceholder
                      variant="avatar"
                      title={accountName}
                      initials={initials}
                      className="h-11 w-11 rounded-full from-orange-600 to-orange-600 text-sm font-bold text-white shrink-0 shadow-xs"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-black text-zinc-950">{accountName}</p>
                      {account.email && (
                        <p className="truncate text-xs font-medium text-zinc-500">{account.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 border-t border-orange-200/60 pt-3">
                    <Link
                      href={publicProfileHref}
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-zinc-800 shadow-2xs border border-orange-200/50 hover:bg-orange-50"
                    >
                      <UserRound className="h-3.5 w-3.5 text-orange-600" />
                      My Profile
                    </Link>
                    <Link
                      href="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-3 py-2 text-xs font-black text-white shadow-2xs hover:bg-orange-700"
                    >
                      <LayoutDashboard className="h-3.5 w-3.5" />
                      Dashboard
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                  <p className="text-sm font-black text-zinc-900">Welcome to Aldriva</p>
                  <p className="mt-1 text-xs text-zinc-500 font-medium">
                    Sign in to manage events, support fundraisers, and track tickets.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Link
                      href="/login"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-center rounded-xl border border-zinc-200 bg-white py-2.5 text-center text-xs font-bold text-zinc-800 shadow-2xs hover:bg-zinc-50"
                    >
                      Log in
                    </Link>
                    <Link
                      href="/signup"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-center rounded-xl bg-orange-600 py-2.5 text-center text-xs font-black text-white shadow-2xs hover:bg-orange-700"
                    >
                      Sign up
                    </Link>
                  </div>
                </div>
              )}

              {/* Discover & Navigation */}
              <div className="space-y-1.5">
                <p className="px-1 text-[11px] font-black uppercase tracking-wider text-zinc-400">
                  Discover
                </p>
                <Link
                  href="/"
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition",
                    pathname === "/"
                      ? "bg-orange-50 text-orange-700 font-black"
                      : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
                  )}
                >
                  <Home className="h-4 w-4 shrink-0 text-zinc-500" />
                  Home
                </Link>
                {NAV_LINKS.map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold transition",
                      isActive(href)
                        ? "bg-orange-50 text-orange-700 font-black"
                        : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-zinc-500" />
                    {label}
                  </Link>
                ))}
              </div>

              {/* Account Quick Links if Authenticated */}
              {account && (
                <div className="space-y-1.5 border-t border-zinc-100 pt-4">
                  <p className="px-1 text-[11px] font-black uppercase tracking-wider text-zinc-400">
                    Account
                  </p>
                  <Link
                    href="/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 transition"
                  >
                    <LayoutDashboard className="h-4 w-4 shrink-0 text-zinc-500" />
                    Dashboard
                  </Link>
                  <Link
                    href="/events/my-tickets"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 transition"
                  >
                    <Ticket className="h-4 w-4 shrink-0 text-zinc-500" />
                    My tickets
                  </Link>
                  <Link
                    href="/dashboard/settings/profile"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 transition"
                  >
                    <Settings className="h-4 w-4 shrink-0 text-zinc-500" />
                    Account settings
                  </Link>
                </div>
              )}
            </div>

            {/* Drawer Bottom Actions */}
            {account && (
              <div className="border-t border-zinc-200 p-4">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-50 py-3 text-sm font-black text-red-600 transition hover:bg-red-100 active:scale-98"
                >
                  <LogOut className="h-4 w-4 shrink-0" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
