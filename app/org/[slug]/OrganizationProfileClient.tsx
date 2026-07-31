"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { safeImageSrc } from "@/lib/image-url";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import StarRating from "@/components/StarRating";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import ProfileHeader from "@/components/profile/ProfileHeader";
import ProfileMetrics from "@/components/profile/ProfileMetrics";
import ProfileTabs, { type ProfileTabDef } from "@/components/profile/ProfileTabs";
import ProfileSidebar from "@/components/profile/ProfileSidebar";
import ProfileSection from "@/components/profile/ProfileSection";
import ProfileCard from "@/components/profile/ProfileCard";
import FollowButton from "@/components/profile/FollowButton";
import ShareButton from "@/components/profile/ShareButton";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import { getEnabledModules, type ProfileModuleId } from "@/lib/profile-modules";
import {
  Globe, Mail, Check, Share2, Heart, Users, Calendar, Target, DollarSign,
  MapPin, ExternalLink, ArrowUpRight, Pencil,
} from "lucide-react";
import {
  FaFacebookF, FaXTwitter, FaInstagram, FaLinkedinIn,
  FaYoutube, FaTiktok
} from "react-icons/fa6";

// ── Types ─────────────────────────────────────────────────────────────────────

type Organization = {
  id: string;
  slug: string | null;
  name: string;
  bio: string | null;
  photo: string | null;
  banner: string | null;
  org_type: string | null;
  contact_email: string | null;
  facebook: string | null;
  twitter: string | null;
  instagram: string | null;
  linkedin: string | null;
  youtube: string | null;
  tiktok: string | null;
  website: string | null;
  user_id: string;
  status: string | null;
  average_rating?: number | null;
  review_count?: number | null;
  follower_offset?: number;
  events_offset?: number;
};

type EventItem = {
  id: string;
  title: string;
  slug: string;
  event_date: string | null;
  venue: string | null;
  city: string | null;
  banner: string | null;
  category: string | null;
};

type FundraiserItem = {
  id: string;
  title: string;
  slug: string;
  banner: string | null;
  image_url: string | null;
  goal: number | string | null;
  raised: number | string | null;
  category: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const ORG_TYPE_LABELS: Record<string, string> = {
  nonprofit: "Nonprofit",
  business: "Business",
  church: "Church",
  school: "School",
  creator: "Creator",
  community: "Community",
  government: "Government",
  restaurant: "Restaurant",
  sports_club: "Sports Club",
  other: "Organization",
};

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "Date TBA";
  return new Date(dateStr).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function formatMoney(val: number | string | null) {
  const n = Number(val ?? 0);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

// ── Row renderers (shared between the Overview preview and full tab lists) ────

function EventRow({ evt }: { evt: EventItem }) {
  const bannerSrc = safeImageSrc(evt.banner);
  return (
    <Link
      href={`/events/${evt.slug}`}
      className="group flex gap-4 rounded-xl border border-zinc-100 p-3 transition hover:border-orange-200 hover:bg-orange-50/40"
    >
      <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
        {bannerSrc ? (
          <Image src={bannerSrc} alt={evt.title} fill className="object-cover" sizes="80px" />
        ) : (
          <LocalBrandedPlaceholder
            variant="event"
            label=""
            className="from-transparent to-transparent"
            iconClassName="h-6 w-6 text-orange-400"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-black text-zinc-900 line-clamp-1 group-hover:text-orange-700">{evt.title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
          <Calendar className="h-3 w-3 shrink-0" />
          {formatDate(evt.event_date)}
        </p>
        {(evt.venue || evt.city) && (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
            <MapPin className="h-3 w-3 shrink-0" />
            {[evt.venue, evt.city].filter(Boolean).join(", ")}
          </p>
        )}
      </div>
      <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300 group-hover:text-orange-500" />
    </Link>
  );
}

function FundraiserRow({ f }: { f: FundraiserItem }) {
  const goal = Number(f.goal ?? 0);
  const raised = Number(f.raised ?? 0);
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
  // safeImageSrc validates against the allowed-host list and returns null for
  // HTML-page proxies (Google imgres, Bing, Pinterest, etc.) so next/image
  // never receives an invalid src and throws a runtime error.
  const imageSrc = safeImageSrc(f.image_url || f.banner);
  return (
    <Link
      href={`/fundraisers/${f.slug}`}
      className="group flex gap-4 rounded-xl border border-zinc-100 p-3 transition hover:border-orange-200 hover:bg-orange-50/40"
    >
      <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
        {imageSrc ? (
          <Image src={imageSrc} alt={f.title} fill className="object-cover" sizes="80px" />
        ) : (
          <LocalBrandedPlaceholder
            variant="fundraiser"
            label=""
            className="from-transparent to-transparent"
            iconClassName="h-6 w-6 text-emerald-500"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-black text-zinc-900 line-clamp-1 group-hover:text-orange-700">{f.title}</p>
        <Progress value={pct} className="mt-1.5" />
        <p className="mt-1 text-xs text-zinc-500">
          <span className="font-bold text-emerald-700">{formatMoney(raised)}</span> raised of {formatMoney(goal)} goal
        </p>
      </div>
      <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300 group-hover:text-orange-500" />
    </Link>
  );
}

function EmptyTabState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100">
        <Calendar className="h-6 w-6 text-zinc-400" />
      </div>
      <p className="text-sm font-medium text-zinc-500">{label}</p>
    </div>
  );
}

// ── Social Link ───────────────────────────────────────────────────────────────

function SocialLink({
  href,
  icon: Icon,
  label,
}: {
  href: string | null | undefined;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  if (!href) return null;
  const url = href.startsWith("http") ? href : `https://${href}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition hover:bg-zinc-950 hover:text-white"
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrganizationProfileClient({
  initialData,
}: {
  initialData: Organization;
}) {
  const [org] = useState<Organization>(initialData);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [fundraisers, setFundraisers] = useState<FundraiserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileModuleId>("overview");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(org.follower_offset ?? 0);
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [eventsView, setEventsView] = useState<"upcoming" | "past">("upcoming");

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
        // Ownership check today is single-owner (organizers.user_id). Kept
        // isolated here so swapping in a membership table later (multiple
        // managers per organization) only touches this one lookup.
        setIsOwner(session.user.id === org.user_id);
      }

      const [{ data: evts }, { data: raisers }, { count }] = await Promise.all([
        supabase
          .from("events")
          .select("id, title, slug, event_date, venue, city, banner, category")
          .eq("organizer_id", org.id)
          .order("event_date", { ascending: true }),
        supabase
          .from("fundraisers")
          .select("id, title, slug, banner, image_url, goal, raised, category")
          .eq("organizer_id", org.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        supabase
          .from("organizer_follows")
          .select("*", { count: "exact", head: true })
          .eq("organizer_id", org.id),
      ]);

      setEvents(evts ?? []);
      setFundraisers(raisers ?? []);
      setFollowerCount((count ?? 0) + (org.follower_offset ?? 0));

      if (session?.user) {
        const { data: follow } = await supabase
          .from("organizer_follows")
          .select("id")
          .eq("organizer_id", org.id)
          .eq("user_id", session.user.id)
          .maybeSingle();
        setIsFollowing(!!follow);
      }

      setLoading(false);
    }
    load();
  }, [org.id, org.user_id, org.follower_offset]);

  const now = new Date();
  const upcomingEvents = useMemo(
    () => events.filter((e) => !e.event_date || new Date(e.event_date) >= now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events]
  );
  const pastEvents = useMemo(
    () => events.filter((e) => e.event_date && new Date(e.event_date) < now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events]
  );
  const eventsForView = eventsView === "upcoming" ? upcomingEvents : pastEvents;
  const totalRaised = useMemo(
    () => fundraisers.reduce((sum, f) => sum + Number(f.raised ?? 0), 0),
    [fundraisers]
  );

  const orgTypeLabel = ORG_TYPE_LABELS[org.org_type ?? "other"] ?? "Organization";
  const verified = org.status === "verified";
  const shareUrl =
    typeof window !== "undefined" ? `${window.location.origin}/org/${org.slug ?? org.id}` : "";

  const enabledModules = useMemo(() => getEnabledModules(org.org_type), [org.org_type]);

  const metrics = [
    { id: "events", label: "Events", value: formatCount(events.length + (org.events_offset ?? 0)), icon: <Calendar className="h-4 w-4" /> },
    { id: "campaigns", label: "Campaigns", value: formatCount(fundraisers.length), icon: <Target className="h-4 w-4" /> },
    { id: "followers", label: "Followers", value: formatCount(followerCount), icon: <Users className="h-4 w-4" /> },
    ...(totalRaised > 0
      ? [{ id: "raised", label: "Raised", value: formatMoney(totalRaised), accent: "text-emerald-600", icon: <DollarSign className="h-4 w-4" /> }]
      : []),
  ].filter((m) => enabledModules.includes("events") || m.id !== "events")
   .filter((m) => enabledModules.includes("campaigns") || (m.id !== "campaigns" && m.id !== "raised"));

  const tabDefs: Record<ProfileModuleId, ProfileTabDef | null> = {
    overview: {
      id: "overview",
      label: "Overview",
      content: (
        <div className="space-y-6">
          {loading ? (
            <TabSpinner />
          ) : upcomingEvents.length === 0 && fundraisers.length === 0 ? (
            <EmptyTabState label="Nothing to show yet — check back soon." />
          ) : (
            <>
              {enabledModules.includes("events") && upcomingEvents.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wide text-zinc-400">Next event</h3>
                    {upcomingEvents.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("events")}
                        className="text-xs font-bold text-orange-600 hover:text-orange-700"
                      >
                        View all
                      </button>
                    )}
                  </div>
                  <EventRow evt={upcomingEvents[0]} />
                </div>
              )}
              {enabledModules.includes("campaigns") && fundraisers.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wide text-zinc-400">Active campaigns</h3>
                    {fundraisers.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab("campaigns")}
                        className="text-xs font-bold text-orange-600 hover:text-orange-700"
                      >
                        View all
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {fundraisers.slice(0, 2).map((f) => <FundraiserRow key={f.id} f={f} />)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      ),
    },
    events: {
      id: "events",
      label: "Events",
      count: events.length,
      content: (
        <div>
          <div className="mb-4 inline-flex rounded-lg bg-zinc-100 p-1">
            {(["upcoming", "past"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setEventsView(v)}
                className={`rounded-md px-3 py-1.5 text-xs font-bold capitalize transition ${
                  eventsView === v ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-500 hover:text-zinc-800"
                }`}
              >
                {v} {v === "upcoming" ? `(${upcomingEvents.length})` : `(${pastEvents.length})`}
              </button>
            ))}
          </div>
          {loading ? (
            <TabSpinner />
          ) : eventsForView.length === 0 ? (
            <EmptyTabState label={eventsView === "upcoming" ? "No upcoming events scheduled." : "No past events yet."} />
          ) : (
            <div className="space-y-3">
              {eventsForView.map((evt) => <EventRow key={evt.id} evt={evt} />)}
            </div>
          )}
        </div>
      ),
    },
    campaigns: {
      id: "campaigns",
      label: "Campaigns",
      count: fundraisers.length,
      content: loading ? (
        <TabSpinner />
      ) : fundraisers.length === 0 ? (
        <EmptyTabState label="No active fundraisers yet." />
      ) : (
        <div className="space-y-3">
          {fundraisers.map((f) => <FundraiserRow key={f.id} f={f} />)}
        </div>
      ),
    },
    about: null, // rendered in the sidebar, not as a tab — see below
  };

  const tabs = enabledModules
    .map((id) => tabDefs[id])
    .filter((t): t is ProfileTabDef => t !== null);

  return (
    <main className="min-h-screen bg-zinc-50 pb-16 text-zinc-950">
      <div className="mx-auto max-w-7xl px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
        {/* ── Compact header + KPIs (no banner) ── */}
        <ProfileCard className="mb-6">
          <ProfileHeader
            name={org.name}
            avatarUrl={org.photo}
            avatarFallback={org.name.charAt(0).toUpperCase()}
            avatarShape="square"
            tagline={org.bio}
            badges={
              <>
                <Badge variant="orange">{orgTypeLabel}</Badge>
                {verified && <VerifiedBadge verified size="sm" />}
                {Boolean(org.average_rating) && Boolean(org.review_count) && (
                  <span className="flex items-center gap-1">
                    <StarRating value={Number(org.average_rating)} size={16} />
                    <span className="text-xs text-zinc-500">({org.review_count})</span>
                  </span>
                )}
              </>
            }
            actions={
              <>
                <FollowButton
                  key={loading ? "pending" : "ready"}
                  targetType="organizer"
                  targetId={org.id}
                  initialIsFollowing={isFollowing}
                  initialFollowerCount={followerCount}
                  isLoggedIn={currentUserId !== null}
                  onChange={({ isFollowing: nowFollowing, followerCount: rawCount }) => {
                    setIsFollowing(nowFollowing);
                    setFollowerCount(rawCount + (org.follower_offset ?? 0));
                  }}
                  className={({ isFollowing: following }) =>
                    `flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black transition ${
                      following
                        ? "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                        : "bg-zinc-950 text-white hover:bg-orange-600"
                    }`
                  }
                >
                  {({ isFollowing: following }) => (
                    <>
                      <Heart className={`h-4 w-4 ${following ? "fill-current" : ""}`} />
                      {following ? "Following" : "Follow"}
                    </>
                  )}
                </FollowButton>
                <ShareButton
                  url={shareUrl}
                  className={() =>
                    "flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
                  }
                >
                  {({ copied }) => (
                    <>
                      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
                      {copied ? "Copied!" : "Share"}
                    </>
                  )}
                </ShareButton>
                {org.contact_email && (
                  <a
                    href={`mailto:${org.contact_email}`}
                    className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    <Mail className="h-4 w-4" />
                    Contact
                  </a>
                )}
                {isOwner && (
                  <Link
                    href={`/dashboard/org/${org.id}/settings`}
                    className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Link>
                )}
              </>
            }
          />
          <div className="mt-6 border-t border-zinc-100 pt-6">
            <ProfileMetrics metrics={metrics} />
          </div>
        </ProfileCard>

        {/* ── Sidebar (About/Connect) + tab workspace. Sidebar renders after
            the workspace on mobile (order-2) so events/campaigns are reachable
            without scrolling past bio content first; desktop keeps it as a
            left rail (lg:order-1). ── */}
        <div className="grid gap-6 lg:grid-cols-3">
          <ProfileSidebar className="order-2 lg:order-1 lg:col-span-1">
            {org.bio && <ProfileSection title="About">
              <p className="text-sm leading-relaxed text-zinc-700">{org.bio}</p>
            </ProfileSection>}

            <ProfileSection title="Connect">
              <div className="space-y-3">
                {org.website && (
                  <a
                    href={org.website.startsWith("http") ? org.website : `https://${org.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 text-sm font-medium text-zinc-700 hover:text-orange-600"
                  >
                    <Globe className="h-4 w-4 shrink-0 text-zinc-400" />
                    <span className="truncate">{org.website.replace(/^https?:\/\//, "")}</span>
                    <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-300" />
                  </a>
                )}
                {org.contact_email && (
                  <a
                    href={`mailto:${org.contact_email}`}
                    className="flex items-center gap-2.5 text-sm font-medium text-zinc-700 hover:text-orange-600"
                  >
                    <Mail className="h-4 w-4 shrink-0 text-zinc-400" />
                    <span className="truncate">{org.contact_email}</span>
                  </a>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <SocialLink href={org.facebook} icon={FaFacebookF} label="Facebook" />
                <SocialLink href={org.twitter} icon={FaXTwitter} label="X (Twitter)" />
                <SocialLink href={org.instagram} icon={FaInstagram} label="Instagram" />
                <SocialLink href={org.linkedin} icon={FaLinkedinIn} label="LinkedIn" />
                <SocialLink href={org.youtube} icon={FaYoutube} label="YouTube" />
                <SocialLink href={org.tiktok} icon={FaTiktok} label="TikTok" />
              </div>
            </ProfileSection>
          </ProfileSidebar>

          <div className="order-1 lg:order-2 lg:col-span-2">
            <ProfileCard padding={false} className="overflow-hidden">
              <ProfileTabs tabs={tabs} value={activeTab} onValueChange={(id) => setActiveTab(id as ProfileModuleId)} />
            </ProfileCard>
          </div>
        </div>
      </div>
    </main>
  );
}

function TabSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-7 w-7 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
    </div>
  );
}
