"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  LayoutDashboard,
  ShoppingBag,
  Ticket,
  UserRound,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import BrandMark from "@/components/BrandMark";
import NotificationBell from "@/components/notifications/NotificationBell";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { cn } from "@/lib/utils";
import HomeAdaptiveNav from "@/components/nav/HomeAdaptiveNav";

type Account = {
  id: string;
  displayName: string;
  email?: string;
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [account, setAccount] = useState<Account | null>(null);
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
    setAccountOpen(false);
  }, [pathname]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAccountOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setAccountOpen(false);
    router.push("/login");
    router.refresh();
  }

  const accountName = account?.displayName ?? "";
  const initials = accountName ? accountName.slice(0, 2).toUpperCase() : "";
  const publicProfileHref = account ? `/profile/${account.id}` : "/login";

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center justify-between gap-2 px-3 sm:px-4 md:px-6">
        <Link href="/" className="min-w-0 shrink-0 text-zinc-950">
          <BrandMark className="[&>img]:h-8 [&>img]:max-w-[7.5rem] sm:[&>img]:h-12 sm:[&>img]:max-w-none" priority />
        </Link>

        {/* Center: Home adaptive navigation — public platform nav */}
        <div className="flex flex-1 items-center justify-center px-2">
          <HomeAdaptiveNav />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {account && <NotificationBell userId={account.id} />}

          {account ? (
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white p-1.5 transition hover:border-orange-200 sm:h-auto sm:w-auto sm:justify-start sm:gap-2 sm:py-1.5 sm:pl-1.5 sm:pr-3"
                aria-expanded={accountOpen}
                aria-label="Account menu"
              >
                <LocalBrandedPlaceholder
                  variant="avatar"
                  title={accountName}
                  initials={initials}
                  className="h-8 w-8 rounded-full from-orange-600 to-orange-600 text-xs font-bold"
                />
                <span className="hidden max-w-28 truncate text-sm font-bold text-zinc-800 sm:inline">
                  {accountName}
                </span>
                <ChevronDown className={cn("hidden h-4 w-4 text-zinc-400 sm:block transition-transform", accountOpen && "rotate-180")} />
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
                  <Link href="/products/library" className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:text-orange-600">
                    <ShoppingBag className="h-4 w-4" />
                    My library
                  </Link>
                  <Link href={publicProfileHref} className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:text-orange-600">
                    <UserRound className="h-4 w-4" />
                    View Profile
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
          {/* Mobile login link when not authenticated and Home is centered */}
          {!account && (
            <Link href="/login" className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-700 sm:hidden">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
