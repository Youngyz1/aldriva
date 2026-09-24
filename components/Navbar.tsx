"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from 'next-intl';
import { ChevronDown, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import BrandMark from "@/components/BrandMark";
import NotificationBell from "@/components/notifications/NotificationBell";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";
import HomeAdaptiveNav from "@/components/nav/HomeAdaptiveNav";

type Account = {
  id: string;
  displayName: string;
  email?: string;
};

export default function Navbar() {
  const pathname = usePathname();
  const tNav = useTranslations('Navigation');
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
      if (e.key === "Escape") setAccountOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

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
          <LanguageSwitcher variant="inline" />
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
                <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-zinc-200 bg-white py-2 shadow-xl">
                  <p className="truncate px-4 py-2 text-sm font-black text-zinc-900">{accountName}</p>
                  <div className="my-1 border-t border-zinc-100" />
                  <Link
                    href={publicProfileHref}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 hover:text-orange-600"
                    onClick={() => setAccountOpen(false)}
                  >
                    <UserRound className="h-4 w-4" />
                    {tNav('profile')}
                  </Link>
                  <div className="my-1 border-t border-zinc-100" />
                  <div className="px-4 py-2">
                    <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-400">{tNav('language')}</p>
                    <LanguageSwitcher variant="dropdown" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-bold text-zinc-700 hover:text-orange-600">
                {tNav('login')}
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-zinc-950 px-4 py-2 text-sm font-black text-white transition hover:bg-zinc-800"
              >
                {tNav('signup')}
              </Link>
            </div>
          )}
          {/* Mobile login link when not authenticated */}
          {!account && (
            <Link href="/login" className="rounded-lg px-2 py-1 text-xs font-bold text-zinc-700 sm:hidden">
              {tNav('login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
