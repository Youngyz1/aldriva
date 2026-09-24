"use client";

import { useState } from "react";
import { useTranslations } from 'next-intl';
import Link from "next/link";
import {
  Calendar,
  Gift,
  HeartHandshake,
  MapPin,
  Newspaper,
  CalendarDays,
  ShoppingBag,
  Store,
  ChevronDown,
  ChevronUp,
  Home,
  Ticket,
  LayoutDashboard,
  Compass,
  TrendingUp,
} from "lucide-react";
import FollowButton from "@/components/profile/FollowButton";
import ProfileSettingsModal from "@/components/profile/ProfileSettingsModal";
import FollowsListModal from "@/components/profile/FollowsListModal";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import type { ProfileMenuData } from "@/lib/profile-menu-data";

type Fundraiser = {
  id: string;
  title: string;
  slug: string;
  banner: string | null;
  image_url: string | null;
  goal: number | string | null;
  raised: number | string | null;
  raised_amount: number | string | null;
  category: string | null;
  created_at: string | null;
  status?: string | null;
};

type EventItem = {
  id: string;
  title: string;
  slug: string | null;
  banner: string | null;
  event_date: string | null;
  venue: string | null;
  city: string | null;
  status?: string | null;
  created_at: string | null;
};

type BusinessItem = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  banner_url: string | null;
  category: string | null;
  city: string | null;
  status?: string | null;
  created_at: string | null;
};

type ArticleItem = {
  id: string;
  title: string;
  slug: string;
  cover_image: string | null;
  excerpt: string | null;
  category: string | null;
  status?: string | null;
  published_at: string | null;
  created_at: string | null;
};

type ProductItem = {
  id: string;
  name: string;
  slug: string | null;
  price: number | string | null;
  status?: string | null;
  created_at: string | null;
};

type DonationActivity = {
  id: string;
  amount: number | string | null;
  created_at: string;
  fundraiser: {
    title: string;
    slug: string;
  };
};

interface ProfileClientProps {
  profile: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
  fundraisers: Fundraiser[];
  events?: EventItem[];
  businesses?: BusinessItem[];
  articles?: ArticleItem[];
  products?: ProductItem[];
  donations: DonationActivity[];
  menuData: ProfileMenuData | null;
}

function money(value: number | string | null) {
  return "$" + Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function dateLabel(value: string | null) {
  if (!value) return "Recently";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fundraiserRaised(fundraiser: Fundraiser) {
  return Number(fundraiser.raised_amount ?? fundraiser.raised ?? 0);
}

export default function ProfileClient({
  profile,
  followerCount: initialFollowerCount,
  followingCount,
  isFollowing: initialIsFollowing,
  isOwnProfile,
  isLoggedIn,
  fundraisers = [],
  events = [],
  businesses = [],
  articles = [],
  products = [],
  donations = [],
  menuData,
}: ProfileClientProps) {
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [activeFollowModal, setActiveFollowModal] = useState<"followers" | "following" | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "campaigns" | "events" | "businesses" | "articles" | "products">("overview");
  const [impactExpanded, setImpactExpanded] = useState(false);
  const t = useTranslations('Profile');

  const name = profile.display_name?.trim() || "Aldriva Member";
  const avatarInitial = name.charAt(0).toUpperCase() || "M";

  // Calculate real metrics for Digital Summary (no fabricated or meaningless zero stats)
  const totalRaisedOnCampaigns = fundraisers.reduce((sum, f) => sum + fundraiserRaised(f), 0);
  const totalDonated = donations.reduce((sum, d) => sum + Number(d.amount || 0), 0);

  // Define dynamic content tabs (only render tabs with real content)
  const availableTabs = [
    { id: "overview" as const, label: t('overview'), count: undefined },
    ...(fundraisers.length > 0 ? [{ id: "campaigns" as const, label: t('campaigns'), count: fundraisers.length }] : []),
    ...(events.length > 0 ? [{ id: "events" as const, label: t('events'), count: events.length }] : []),
    ...(businesses.length > 0 ? [{ id: "businesses" as const, label: t('businesses'), count: businesses.length }] : []),
    ...(articles.length > 0 ? [{ id: "articles" as const, label: t('articles'), count: articles.length }] : []),
    ...(products.length > 0 ? [{ id: "products" as const, label: t('products'), count: products.length }] : []),
  ];

  // Distinct campaigns supported by donations
  const uniqueCampaignsSupported = new Set(donations.map((d) => d.fundraiser.slug)).size;

  return (
    <main className="min-h-screen bg-white px-4 pt-6 pb-24 text-zinc-950 sm:pt-10 sm:pb-16">
      <div className="mx-auto max-w-4xl space-y-8">
        
        {/* AREA 1: PROFILE HEADER */}
        <section className="pb-6 border-b border-zinc-200/80">
          {/* Top Bar: Title & Explore / Action Button */}
          <div className="flex items-center justify-between pb-5">
            <span className="text-xs font-black uppercase tracking-wider text-orange-700">
              {isOwnProfile ? "My Profile" : "User Profile"}
            </span>

            {/* Top-Right Single Control: Explore for owner, Follow for external visitor */}
            <div className="relative">
              {isOwnProfile ? (
                <ProfileSettingsModal menuData={menuData} />
              ) : (
                <FollowButton
                  targetType="user"
                  targetId={profile.id}
                  initialIsFollowing={initialIsFollowing}
                  initialFollowerCount={initialFollowerCount}
                  isLoggedIn={isLoggedIn}
                  onChange={({ followerCount: count }) => setFollowerCount(count)}
                  className={({ isFollowing: following }) =>
                    "rounded-xl px-4 py-2 text-xs font-black shadow-xs transition disabled:opacity-60 " +
                    (following
                      ? "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                      : "bg-brand-700 text-white hover:bg-brand-800")
                  }
                >
                  {({ isFollowing: following, pending }) =>
                    pending ? "Saving..." : following ? "Following" : "Follow"
                  }
                </FollowButton>
              )}
            </div>
          </div>

          {/* Identity Section */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-full object-cover ring-4 ring-orange-50"
              />
            ) : (
              <LocalBrandedPlaceholder
                variant="avatar"
                title={name}
                initials={avatarInitial}
                className="h-20 w-20 sm:h-24 sm:w-24 shrink-0 rounded-full from-orange-600 to-orange-600 text-2xl sm:text-3xl text-white ring-4 ring-orange-50"
              />
            )}

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
                {name}
              </h1>

              {/* Social Counts */}
              <div className="mt-3 flex items-center gap-5 text-sm">
                {isOwnProfile ? (
                  <button
                    type="button"
                    onClick={() => setActiveFollowModal("followers")}
                    className="group inline-flex items-center gap-1.5 transition hover:opacity-80"
                    aria-label="View followers list"
                  >
                    <span className="font-black text-zinc-950 group-hover:text-orange-700 tabular-nums">
                      {followerCount.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-zinc-500 group-hover:text-orange-700">
                      Followers
                    </span>
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="font-black text-zinc-950 tabular-nums">
                      {followerCount.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-zinc-500">
                      Followers
                    </span>
                  </div>
                )}

                <span className="text-zinc-300">·</span>

                {isOwnProfile ? (
                  <button
                    type="button"
                    onClick={() => setActiveFollowModal("following")}
                    className="group inline-flex items-center gap-1.5 transition hover:opacity-80"
                    aria-label="View following list"
                  >
                    <span className="font-black text-zinc-950 group-hover:text-orange-700 tabular-nums">
                      {followingCount.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-zinc-500 group-hover:text-orange-700">
                      Following
                    </span>
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-1.5">
                    <span className="font-black text-zinc-950 tabular-nums">
                      {followingCount.toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-zinc-500">
                      Following
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* AREA 2: CONTENT TABS */}
        <section className="border-b border-zinc-200">
          <div className="flex overflow-x-auto no-scrollbar gap-2 sm:gap-4">
            {availableTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={
                    "inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-bold transition " +
                    (isActive
                      ? "border-orange-700 text-orange-700"
                      : "border-transparent text-zinc-600 hover:border-zinc-300 hover:text-zinc-950")
                  }
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === "number" && (
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-[11px] font-black " +
                        (isActive
                          ? "bg-orange-100 text-orange-800"
                          : "bg-zinc-100 text-zinc-600")
                      }
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* AREA 3: PROFILE OVERVIEW / CONTENT */}
        {activeTab === "overview" && (
          <div className="space-y-6 sm:space-y-8">
            {/* 1. Digital Summary (Real metrics only) */}
            <div className="space-y-3">
              <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                Activity Summary
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                {fundraisers.length > 0 && (
                  <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500">Campaigns</span>
                      <HeartHandshake className="h-4 w-4 text-emerald-600" />
                    </div>
                    <p className="mt-2 text-2xl font-black text-zinc-950 tabular-nums">
                      {fundraisers.length}
                    </p>
                  </div>
                )}

                {totalRaisedOnCampaigns > 0 && (
                  <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500">Total Raised</span>
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                    </div>
                    <p className="mt-2 text-2xl font-black text-emerald-700 tabular-nums">
                      {money(totalRaisedOnCampaigns)}
                    </p>
                  </div>
                )}

                {events.length > 0 && (
                  <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500">Events</span>
                      <Calendar className="h-4 w-4 text-orange-600" />
                    </div>
                    <p className="mt-2 text-2xl font-black text-zinc-950 tabular-nums">
                      {events.length}
                    </p>
                  </div>
                )}

                {businesses.length > 0 && (
                  <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500">Businesses</span>
                      <Store className="h-4 w-4 text-zinc-600" />
                    </div>
                    <p className="mt-2 text-2xl font-black text-zinc-950 tabular-nums">
                      {businesses.length}
                    </p>
                  </div>
                )}

                {articles.length > 0 && (
                  <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500">Articles</span>
                      <Newspaper className="h-4 w-4 text-sky-600" />
                    </div>
                    <p className="mt-2 text-2xl font-black text-zinc-950 tabular-nums">
                      {articles.length}
                    </p>
                  </div>
                )}

                {products.length > 0 && (
                  <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500">Products</span>
                      <ShoppingBag className="h-4 w-4 text-purple-600" />
                    </div>
                    <p className="mt-2 text-2xl font-black text-zinc-950 tabular-nums">
                      {products.length}
                    </p>
                  </div>
                )}

                {isOwnProfile && menuData?.personal.hasTickets && (
                  <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500">Tickets</span>
                      <Ticket className="h-4 w-4 text-orange-600" />
                    </div>
                    <p className="mt-2 text-2xl font-black text-zinc-950 tabular-nums">
                      {menuData.personal.ticketCount}
                    </p>
                  </div>
                )}

                {isOwnProfile && menuData?.personal.hasDonations && (
                  <div className="rounded-xl border border-zinc-200/80 bg-white p-4 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-zinc-500">Donations</span>
                      <Gift className="h-4 w-4 text-pink-600" />
                    </div>
                    <p className="mt-2 text-2xl font-black text-zinc-950 tabular-nums">
                      {menuData.personal.donationCount}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Impact Section (Collapsible & Purposeful) */}
            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 sm:p-6 shadow-xs">
              <button
                type="button"
                onClick={() => setImpactExpanded((prev) => !prev)}
                className="flex w-full items-center justify-between text-left"
                aria-expanded={impactExpanded}
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-700">
                    <Gift className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-black tracking-tight text-zinc-950">Impact</h2>
                    <p className="text-xs font-semibold text-zinc-500">
                      {donations.length > 0
                        ? money(totalDonated) + " donated · " + uniqueCampaignsSupported + " campaign" + (uniqueCampaignsSupported === 1 ? "" : "s") + " supported"
                        : "Personal donation and contribution activity"}
                    </p>
                  </div>
                </div>

                <div className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
                  {impactExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {impactExpanded && (
                <div className="mt-4 border-t border-zinc-100 pt-4">
                  {donations.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                        Recent Donations
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {donations.map((donation) => (
                          <div
                            key={donation.id}
                            className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-black text-zinc-950 tabular-nums">
                                {money(donation.amount)}
                              </span>
                              <span className="text-[11px] font-semibold text-zinc-400">
                                {dateLabel(donation.created_at)}
                              </span>
                            </div>
                            <Link
                              href={"/fundraisers/" + donation.fundraiser.slug}
                              className="mt-1 block line-clamp-1 text-xs font-bold text-orange-700 hover:underline"
                            >
                              {donation.fundraiser.title}
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs font-medium text-zinc-500">
                      No public donation activity yet.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 3. Empty state if no personal activity at all */}
            {fundraisers.length === 0 &&
              events.length === 0 &&
              businesses.length === 0 &&
              articles.length === 0 &&
              products.length === 0 &&
              donations.length === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center shadow-xs">
                  <h3 className="text-base font-black text-zinc-900">No public activity yet</h3>
                  <p className="mt-2 text-sm text-zinc-500">
                    Personal campaigns, events, articles, and public contribution activity will appear here when published.
                  </p>
                </div>
              )}
          </div>
        )}

        {/* Individual Content Tabs: Campaigns */}
        {activeTab === "campaigns" && (
          <div className="space-y-4">
            <h2 className="text-base font-black text-zinc-950">Campaigns</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {fundraisers.map((fundraiser) => (
                <Link
                  key={fundraiser.id}
                  href={"/fundraisers/" + fundraiser.slug}
                  className="group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition hover:border-emerald-200 hover:bg-emerald-50/20"
                >
                  {(fundraiser.image_url || fundraiser.banner) && (
                    <img
                      src={fundraiser.image_url || fundraiser.banner || ""}
                      alt=""
                      className="h-32 w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  )}
                  <div className="p-4">
                    {fundraiser.category && (
                      <p className="text-[11px] font-black uppercase tracking-wide text-emerald-700">
                        {fundraiser.category}
                      </p>
                    )}
                    <h3 className="mt-1 line-clamp-2 text-sm font-black text-zinc-950 group-hover:text-emerald-800">
                      {fundraiser.title}
                    </h3>
                    {fundraiser.status && fundraiser.status !== "published" && (
                      <span
                        className={
                          "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide " +
                          (fundraiser.status === "rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700")
                        }
                      >
                        {fundraiser.status === "rejected" ? "Rejected" : "Pending review"}
                      </span>
                    )}
                    <p className="mt-2 text-xs font-semibold text-zinc-500 tabular-nums">
                      {money(fundraiserRaised(fundraiser))} raised
                      {fundraiser.goal ? " of " + money(fundraiser.goal) : ""}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Individual Content Tabs: Events */}
        {activeTab === "events" && (
          <div className="space-y-4">
            <h2 className="text-base font-black text-zinc-950">Events</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {events.map((ev) => (
                <Link
                  key={ev.id}
                  href={ev.slug ? "/events/" + ev.slug : "/dashboard/events/" + ev.id + "/overview"}
                  className="group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition hover:border-orange-200 hover:bg-orange-50/20"
                >
                  {ev.banner && (
                    <img
                      src={ev.banner}
                      alt=""
                      className="h-32 w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  )}
                  <div className="p-4">
                    <h3 className="line-clamp-2 text-sm font-black text-zinc-950 group-hover:text-orange-800">
                      {ev.title}
                    </h3>
                    <div className="mt-2 space-y-1 text-xs text-zinc-500">
                      {ev.event_date && (
                        <div className="flex items-center gap-1.5">
                          <CalendarDays className="h-3.5 w-3.5 text-zinc-400" />
                          <span>{dateLabel(ev.event_date)}</span>
                        </div>
                      )}
                      {(ev.venue || ev.city) && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                          <span className="truncate">
                            {[ev.venue, ev.city].filter(Boolean).join(", ")}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Individual Content Tabs: Businesses */}
        {activeTab === "businesses" && (
          <div className="space-y-4">
            <h2 className="text-base font-black text-zinc-950">Businesses</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {businesses.map((biz) => (
                <Link
                  key={biz.id}
                  href={biz.slug ? "/businesses/" + biz.slug : "/dashboard/businesses/" + biz.id + "/overview"}
                  className="group overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-xs transition hover:border-zinc-300 hover:bg-zinc-50"
                >
                  <div className="flex items-center gap-3">
                    {biz.logo_url ? (
                      <img
                        src={biz.logo_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-black text-zinc-700">
                        {biz.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-zinc-950 group-hover:text-orange-700">
                        {biz.name}
                      </h3>
                      <p className="truncate text-xs font-semibold text-zinc-400">
                        {[biz.category, biz.city].filter(Boolean).join(" · ") || "Local Business"}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Individual Content Tabs: Articles */}
        {activeTab === "articles" && (
          <div className="space-y-4">
            <h2 className="text-base font-black text-zinc-950">Articles</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {articles.map((art) => (
                <Link
                  key={art.id}
                  href={"/articles/" + art.slug}
                  className="group overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition hover:border-sky-200 hover:bg-sky-50/20"
                >
                  {art.cover_image && (
                    <img
                      src={art.cover_image}
                      alt=""
                      className="h-32 w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  )}
                  <div className="p-4">
                    {art.category && (
                      <p className="text-[11px] font-black uppercase tracking-wide text-sky-700">
                        {art.category}
                      </p>
                    )}
                    <h3 className="mt-1 line-clamp-2 text-sm font-black text-zinc-950 group-hover:text-sky-800">
                      {art.title}
                    </h3>
                    {art.excerpt && (
                      <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{art.excerpt}</p>
                    )}
                    <p className="mt-2 text-[11px] font-semibold text-zinc-400">
                      {dateLabel(art.published_at || art.created_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Individual Content Tabs: Products */}
        {activeTab === "products" && (
          <div className="space-y-4">
            <h2 className="text-base font-black text-zinc-950">Products</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {products.map((prod) => (
                <Link
                  key={prod.id}
                  href={prod.slug ? "/products/" + prod.slug : "/dashboard/products"}
                  className="group overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 shadow-xs transition hover:border-purple-200 hover:bg-purple-50/20"
                >
                  <h3 className="truncate text-sm font-black text-zinc-950 group-hover:text-purple-800">
                    {prod.name}
                  </h3>
                  {prod.price !== null && prod.price !== undefined && (
                    <p className="mt-2 text-xs font-black text-zinc-950 tabular-nums">
                      {money(prod.price)}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AREA 4: COMPACT BOTTOM NAVIGATION (Mobile only, 4 items max, minimal) */}
      <nav
        aria-label="Profile mobile navigation"
        className="fixed bottom-0 inset-x-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur-xs px-4 py-2 sm:hidden shadow-lg"
      >
        <div className="mx-auto flex max-w-md items-center justify-around">
          <Link
            href="/"
            className="flex flex-col items-center gap-0.5 text-zinc-600 hover:text-orange-700"
          >
            <Home className="h-5 w-5" />
            <span className="text-[10px] font-bold">Home</span>
          </Link>

          <Link
            href={isLoggedIn ? "/events/my-tickets" : "/events"}
            className="flex flex-col items-center gap-0.5 text-zinc-600 hover:text-orange-700"
          >
            <Ticket className="h-5 w-5" />
            <span className="text-[10px] font-bold">Tickets</span>
          </Link>

          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-0.5 text-zinc-600 hover:text-orange-700"
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="text-[10px] font-bold">Dashboard</span>
          </Link>

          {isOwnProfile ? (
            <ProfileSettingsModal
              menuData={menuData}
              trigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  className="flex flex-col items-center gap-0.5 text-orange-700"
                  aria-label="Open Explore navigation"
                >
                  <Compass className="h-5 w-5" />
                  <span className="text-[10px] font-bold">Explore</span>
                </button>
              )}
            />
          ) : (
            <Link
              href="/events"
              className="flex flex-col items-center gap-0.5 text-zinc-600 hover:text-orange-700"
            >
              <Compass className="h-5 w-5" />
              <span className="text-[10px] font-bold">Explore</span>
            </Link>
          )}
        </div>
      </nav>

      {/* Owner-only Followers / Following Modal */}
      {isOwnProfile && activeFollowModal && (
        <FollowsListModal
          type={activeFollowModal}
          profileId={profile.id}
          isOpen={Boolean(activeFollowModal)}
          onClose={() => setActiveFollowModal(null)}
        />
      )}
    </main>
  );
}


