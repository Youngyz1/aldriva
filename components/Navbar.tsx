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

  // Invitation routes (/invitation/[token], /invitation/preview) are standalone chrome-free experiences
  if (pathname?.includes("/invitation")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      {/*
        Layout: 3-column flex row.
        - Left (shrink-0):  BrandMark — always a fixed, small size.
        - Center (min-w-0, flex-1): HomeAdaptiveNav — shrinks freely. NO overflow-hidden:
          the dropdown panel must not be clipped by a flex ancestor.
        - Right (shrink-0): EN|FR + Notification + auth button — NEVER shrinks.
        At 320px: BrandMark ~60px, right cluster ~72px (logged-out) or ~40px (logged-in avatar)
        leaves ~188px for the center, which collapses to the icon-only trigger.
      */}
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-1 px-2 sm:h-16 sm:gap-2 sm:px-4 md:px-6">

        {/* Left: brand */}
        <Link href="/" className="shrink-0 text-zinc-950">
          <BrandMark className="[&>img]:h-7 [&>img]:max-w-[6rem] sm:[&>img]:h-10 sm:[&>img]:max-w-none" priority />
        </Link>

        {/* Center: adaptive nav — shrinks freely via min-w-0 flex-1.
            NO overflow-hidden: the dropdown panel is absolutely/fixed positioned
            and must not be clipped by its flex ancestor. */}
        <div className="flex min-w-0 flex-1 items-center justify-center">
          <HomeAdaptiveNav />
        </div>

        {/* Right: EN|FR + notification bell + auth button — ALWAYS visible, never shrinks */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">

          {/* Language switcher — inline compact on mobile */}
          <LanguageSwitcher variant="inline" />

          {/* Notification bell — only when signed in */}
          {account && <NotificationBell userId={account.id} />}

          {account ? (
            /* ── Signed-in: avatar button ── */
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                onClick={() => setAccountOpen((o) => !o)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white p-1 transition hover:border-orange-200 sm:h-auto sm:w-auto sm:justify-start sm:gap-2 sm:py-1.5 sm:pl-1.5 sm:pr-3"
                aria-expanded={accountOpen}
                aria-label="Account menu"
              >
                <LocalBrandedPlaceholder
                  variant="avatar"
                  title={accountName}
                  initials={initials}
                  className="h-7 w-7 rounded-full from-orange-600 to-orange-600 text-xs font-bold sm:h-8 sm:w-8"
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
            /* ── Signed-out: Login pill — always visible, never hidden ── */
            <Link
              href="/login"
              className={cn(
                "rounded-full border border-zinc-200 bg-white font-bold text-zinc-700 transition hover:border-zinc-300 hover:text-orange-600",
                // Mobile: compact pill, text-xs
                "px-2.5 py-1.5 text-xs",
                // sm+: normal size, show Sign up too
                "sm:hidden"
              )}
              aria-label="Login"
            >
              {tNav('login')}
            </Link>
          )}

          {/* sm+: Sign in + Sign up pair (hidden on mobile; mobile uses the pill above) */}
          {!account && (
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
        </div>
      </div>
    </header>
  );
}
