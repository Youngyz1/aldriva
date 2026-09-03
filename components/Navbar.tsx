"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  Heart,
  Menu,
  Search,
  Settings,
  ShoppingBag,
  Ticket,
  UserRound,
  X,
  BookOpen,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import BrandMark from "@/components/BrandMark";
import NotificationBell from "@/components/notifications/NotificationBell";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { cn } from "@/lib/utils";

type Account = {
  id: string;
  displayName: string;
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const accountRef = useRef<HTMLDivElement>(null);

  function accountFromUser(user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined) {
    if (!user?.email) return null;
    const displayName =
      typeof user.user_metadata?.display_name === "string" && user.user_metadata.display_name.trim()
        ? user.user_metadata.display_name.trim()
        : user.email.split("@")[0];
    return { id: user.id, displayName };
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
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setSearchOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setAccountOpen(false);
    router.push("/login");
    router.refresh();
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = searchQuery.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
    setSearchOpen(false);
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
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-1 px-2 sm:gap-2 sm:px-4 md:gap-4 md:px-6">
        <Link href="/" className="min-w-0 shrink text-zinc-950 sm:shrink-0">
          <BrandMark className="[&>img]:h-9 [&>img]:max-w-[7.75rem] sm:[&>img]:h-14 sm:[&>img]:max-w-none" priority />
        </Link>

        {/* Desktop search */}
        <form onSubmit={submitSearch} className="hidden min-w-0 flex-1 md:block lg:max-w-md xl:max-w-lg">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search events, fundraisers, organizers…"
              className="h-10 w-full rounded-full border border-zinc-200 bg-zinc-50 pl-10 pr-4 text-sm font-semibold outline-none transition focus:border-orange-500 focus:bg-white focus:ring-2 focus:ring-orange-500/20"
            />
          </label>
        </form>

        {/* Desktop nav links */}
        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map(({ label, href }) => (
            <NavLink key={href} href={href} label={label} active={isActive(href)} />
          ))}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Mobile search toggle */}
          <button
            type="button"
            onClick={() => setSearchOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 text-zinc-600 transition hover:border-orange-200 hover:text-orange-600 md:hidden"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Notifications */}
          {account && <NotificationBell userId={account.id} />}

          {account ? (
            <div className="relative hidden sm:block" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white p-1.5 transition hover:border-orange-200 xl:h-auto xl:w-auto xl:justify-start xl:gap-2 xl:py-1.5 xl:pl-1.5 xl:pr-3"
              >
                <LocalBrandedPlaceholder
                  variant="avatar"
                  title={accountName}
                  initials={initials}
                  className="h-8 w-8 rounded-full from-orange-600 to-orange-600 text-xs"
                />
                <span className="hidden max-w-24 truncate text-sm font-bold text-zinc-800 xl:inline">
                  {accountName}
                </span>
                <ChevronDown className={cn("hidden h-4 w-4 text-zinc-400 xl:block", accountOpen && "rotate-180")} />
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

          {/* Mobile menu */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-800 lg:hidden"
            aria-expanded={menuOpen}
            aria-label="Toggle navigation"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile search panel */}
      {searchOpen && (
        <div className="border-t border-zinc-100 px-4 py-3 md:hidden">
          <form onSubmit={submitSearch} className="flex gap-2">
            <input
              type="search"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search…"
              className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm font-semibold outline-none focus:border-orange-500"
            />
            <button type="submit" className="rounded-xl bg-orange-600 px-4 text-sm font-black text-white">
              Go
            </button>
          </form>
        </div>
      )}

      {/* Mobile menu panel */}
      {menuOpen && (
        <div className="border-t border-zinc-200 bg-white px-4 py-4 lg:hidden">
          <nav className="grid gap-1">
            <NavLink href="/" label="Home" active={pathname === "/"} onClick={() => setMenuOpen(false)} />
            {NAV_LINKS.map(({ label, href }) => (
              <NavLink key={href} href={href} label={label} active={isActive(href)} onClick={() => setMenuOpen(false)} />
            ))}
          </nav>

          {account ? (
            <div className="mt-4 grid gap-1 border-t border-zinc-100 pt-4">
              <Link href="/dashboard" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50">
                Dashboard
              </Link>
              <Link href="/events/my-tickets" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50">
                My tickets
              </Link>
              <Link href={publicProfileHref} onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50">
                View Profile
              </Link>
              <Link href="/dashboard/settings/profile" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-bold text-zinc-700 hover:bg-zinc-50">
                Account settings
              </Link>
              <button type="button" onClick={handleLogout} className="rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-600 hover:bg-red-50">
                Log out
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 pt-4">
              <Link href="/login" onClick={() => setMenuOpen(false)} className="rounded-xl bg-zinc-100 py-3 text-center text-sm font-bold">
                Log in
              </Link>
              <Link href="/signup" onClick={() => setMenuOpen(false)} className="rounded-xl bg-orange-600 py-3 text-center text-sm font-black text-white">
                Sign up
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}