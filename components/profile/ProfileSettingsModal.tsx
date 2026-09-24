"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Compass,
  X,
  UserPen,
  Ticket,
  Gift,
  Heart,
  Calendar,
  Newspaper,
  ShoppingBag,
  Store,
  Building2,
  LayoutDashboard,
  LogOut,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { ProfileMenuData } from "@/lib/profile-menu-data";

interface ProfileSettingsModalProps {
  menuData: ProfileMenuData | null;
  className?: string;
  trigger?: (open: () => void) => React.ReactNode;
}

export default function ProfileSettingsModal({
  menuData,
  className,
  trigger,
}: ProfileSettingsModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  // Organizers accordion starts COLLAPSED by default
  const [organizersExpanded, setOrganizersExpanded] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      // Only lock scroll on mobile (sheet covers screen)
      if (window.innerWidth < 640) {
        document.body.style.overflow = "hidden";
      }
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // Close when navigating away
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (!menuData || !menuData.isOwner) {
    return null;
  }

  const { personal, organizerResources, organizers } = menuData;

  const hasAnyOrgResources =
    organizerResources.hasEvents ||
    organizerResources.hasFundraisers ||
    organizerResources.hasBusinesses ||
    organizerResources.hasArticles ||
    organizerResources.hasProducts ||
    organizers.length > 0;

  async function handleLogout() {
    try {
      setIsLoggingOut(true);
      await supabase.auth.signOut();
      setIsOpen(false);
      window.location.href = "/login";
    } catch {
      setIsLoggingOut(false);
      router.push("/login");
    }
  }

  function close() {
    setIsOpen(false);
  }

  // Shared menu content used in both desktop popover and mobile sheet
  const menuContent = (
    <div className="space-y-5">
      {/* Section 1: PERSONAL */}
      <div>
        <h3 className="px-1 text-[10px] font-black uppercase tracking-widest text-orange-700">
          Personal
        </h3>
        <div className="mt-1.5 grid gap-0.5">
          {personal.hasTickets && (
            <Link
              href="/events/my-tickets"
              onClick={close}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-orange-50/60 hover:text-orange-700"
            >
              <div className="flex items-center gap-2.5">
                <Ticket className="h-4 w-4 text-zinc-400" />
                <span>My Tickets</span>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                {personal.ticketCount}
              </span>
            </Link>
          )}

          {personal.hasDonations && (
            <Link
              href="/dashboard/donations"
              onClick={close}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-orange-50/60 hover:text-orange-700"
            >
              <div className="flex items-center gap-2.5">
                <Gift className="h-4 w-4 text-zinc-400" />
                <span>My Donations</span>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                {personal.donationCount}
              </span>
            </Link>
          )}

          {personal.hasCampaigns && (
            <Link
              href="/dashboard"
              onClick={close}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-orange-50/60 hover:text-orange-700"
            >
              <div className="flex items-center gap-2.5">
                <Heart className="h-4 w-4 text-zinc-400" />
                <span>My Campaigns</span>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                {personal.campaignCount}
              </span>
            </Link>
          )}

          {personal.hasEvents && (
            <Link
              href="/dashboard"
              onClick={close}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-orange-50/60 hover:text-orange-700"
            >
              <div className="flex items-center gap-2.5">
                <Calendar className="h-4 w-4 text-zinc-400" />
                <span>My Events</span>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                {personal.eventCount}
              </span>
            </Link>
          )}

          {personal.hasArticles && (
            <Link
              href="/dashboard"
              onClick={close}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-orange-50/60 hover:text-orange-700"
            >
              <div className="flex items-center gap-2.5">
                <Newspaper className="h-4 w-4 text-zinc-400" />
                <span>My Articles</span>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                {personal.articleCount}
              </span>
            </Link>
          )}

          {personal.hasProducts && (
            <Link
              href="/dashboard"
              onClick={close}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-orange-50/60 hover:text-orange-700"
            >
              <div className="flex items-center gap-2.5">
                <ShoppingBag className="h-4 w-4 text-zinc-400" />
                <span>My Products</span>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600">
                {personal.productCount}
              </span>
            </Link>
          )}
        </div>
      </div>

      {/* Section 2: ORGANIZER RESOURCES */}
      {hasAnyOrgResources && (
        <div>
          <h3 className="px-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">
            Organizer Resources
          </h3>

          {/* My Organizers compact accordion */}
          {organizers.length > 0 && (
            <div className="mt-1.5 rounded-xl border border-zinc-200/80 bg-zinc-50/50 p-2">
              <button
                type="button"
                onClick={() => setOrganizersExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-left text-xs font-black text-zinc-800 hover:text-orange-700"
                aria-expanded={organizersExpanded}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-zinc-400" />
                  <span>My Organizers ({organizers.length})</span>
                </div>
                <ChevronDown
                  className={"h-4 w-4 text-zinc-400 transition-transform " + (organizersExpanded ? "rotate-180" : "")}
                />
              </button>

              {organizersExpanded && (
                <div className="mt-2 space-y-1 border-t border-zinc-200/60 pt-2">
                  {organizers.map((org) => (
                    <Link
                      key={org.id}
                      href={"/dashboard/org/" + org.id + "/overview"}
                      onClick={close}
                      className="flex items-center justify-between rounded-lg bg-white p-2 text-xs font-bold text-zinc-800 shadow-2xs transition hover:bg-orange-50/50 hover:text-orange-700"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {org.photo ? (
                          <img
                            src={org.photo}
                            alt=""
                            className="h-5 w-5 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-zinc-200 text-[10px] font-black text-zinc-700">
                            {(org.name || "O").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="truncate">{org.name}</span>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-orange-700">
                        Workspace →
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aggregate links */}
          <div className="mt-1.5 grid gap-0.5">
            {organizerResources.hasEvents && (
              <Link
                href="/dashboard/events"
                onClick={close}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span>Events</span>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </Link>
            )}
            {organizerResources.hasFundraisers && (
              <Link
                href="/dashboard/fundraisers"
                onClick={close}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                <div className="flex items-center gap-2.5">
                  <Heart className="h-4 w-4 text-zinc-400" />
                  <span>Fundraisers</span>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </Link>
            )}
            {organizerResources.hasBusinesses && (
              <Link
                href="/dashboard/businesses"
                onClick={close}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                <div className="flex items-center gap-2.5">
                  <Store className="h-4 w-4 text-zinc-400" />
                  <span>Businesses</span>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </Link>
            )}
            {organizerResources.hasArticles && (
              <Link
                href="/dashboard/articles"
                onClick={close}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                <div className="flex items-center gap-2.5">
                  <Newspaper className="h-4 w-4 text-zinc-400" />
                  <span>Articles</span>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </Link>
            )}
            {organizerResources.hasProducts && (
              <Link
                href="/dashboard/products"
                onClick={close}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 hover:text-zinc-950"
              >
                <div className="flex items-center gap-2.5">
                  <ShoppingBag className="h-4 w-4 text-zinc-400" />
                  <span>Products</span>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Section 3: ACCOUNT */}
      <div className="border-t border-zinc-100 pt-3 space-y-1">
        <h3 className="px-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">
          Account
        </h3>
        <Link
          href="/dashboard"
          onClick={close}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-zinc-100 hover:text-zinc-950"
        >
          <LayoutDashboard className="h-4 w-4 text-zinc-400" />
          <span>Dashboard</span>
        </Link>
        <Link
          href="/dashboard/settings/profile"
          onClick={close}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-zinc-800 transition hover:bg-orange-50/60 hover:text-orange-700"
        >
          <UserPen className="h-4 w-4 text-zinc-400" />
          <span>Edit Profile</span>
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50/70 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          <span>{isLoggingOut ? "Logging out..." : "Log Out"}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Trigger button */}
      {trigger ? (
        trigger(() => setIsOpen(true))
      ) : (
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen((o) => !o)}
          className={
            className ??
            "inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-black text-zinc-800 shadow-xs transition hover:border-orange-200 hover:bg-orange-50/50 hover:text-orange-700 active:scale-95"
          }
          aria-label="Explore profile navigation"
          aria-expanded={isOpen}
        >
          <Compass className="h-4 w-4 text-zinc-600" />
          <span className="text-xs font-black">Explore</span>
          <ChevronDown className={"h-3.5 w-3.5 text-zinc-400 transition-transform " + (isOpen ? "rotate-180" : "")} />
        </button>
      )}

      {/* DESKTOP: compact absolute popover anchored below trigger */}
      {isOpen && (
        <>
          {/* Desktop popover */}
          <div className="hidden sm:block">
            {/* Click-outside backdrop (invisible) */}
            <div
              className="fixed inset-0 z-40"
              onClick={close}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Explore navigation"
              className="absolute right-0 top-full z-50 mt-2 w-72 max-h-[80vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl"
            >
              <div className="mb-3 flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-orange-700" />
                  <span className="text-sm font-black text-zinc-950">Explore</span>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label="Close explore menu"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {menuContent}
            </div>
          </div>

          {/* MOBILE: bottom sheet */}
          <div className="sm:hidden">
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-zinc-950/40 backdrop-blur-xs"
              onClick={close}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Explore navigation"
              className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white px-4 pb-8 pt-4 shadow-2xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Compass className="h-4 w-4 text-orange-700" />
                  <span className="text-base font-black text-zinc-950">Explore</span>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label="Close explore menu"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {menuContent}
            </div>
          </div>
        </>
      )}
    </>
  );
}
