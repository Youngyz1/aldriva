"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import StarRating from "@/components/StarRating";
import {
  Globe, Mail, Copy, Check, Share2, Heart, Users, Calendar,
  MapPin, ExternalLink, ChevronRight, ArrowUpRight
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

const ORG_TYPE_COLORS: Record<string, string> = {
  nonprofit: "bg-emerald-100 text-emerald-800",
  business: "bg-blue-100 text-blue-800",
  church: "bg-purple-100 text-purple-800",
  school: "bg-yellow-100 text-yellow-800",
  creator: "bg-pink-100 text-pink-800",
  community: "bg-orange-100 text-orange-800",
  government: "bg-slate-100 text-slate-800",
  restaurant: "bg-red-100 text-red-800",
  sports_club: "bg-cyan-100 text-cyan-800",
  other: "bg-zinc-100 text-zinc-700",
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

// ── Tab types ─────────────────────────────────────────────────────────────────

type Tab = "upcoming" | "past" | "fundraisers";

// ── Main Component ────────────────────────────────────────────────────────────

export default function OrganizationProfileClient({
  initialData,
}: {
  initialData: Organization;
}) {
  const router = useRouter();
  const [org] = useState<Organization>(initialData);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [fundraisers, setFundraisers] = useState<FundraiserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("upcoming");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(org.follower_offset ?? 0);
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
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

  async function toggleFollow() {
    if (!currentUserId) { router.push("/login"); return; }
    if (isFollowing) {
      const { error } = await supabase
        .from("organizer_follows")
        .delete()
        .eq("organizer_id", org.id)
        .eq("user_id", currentUserId);
      if (!error) { setIsFollowing(false); setFollowerCount((c) => Math.max(0, c - 1)); }
    } else {
      const { error } = await supabase
        .from("organizer_follows")
        .insert({ organizer_id: org.id, user_id: currentUserId });
      if (!error) { setIsFollowing(true); setFollowerCount((c) => c + 1); }
    }
  }

  async function copyLink() {
    if (typeof window === "undefined") return;
    const url = `${window.location.origin}/organizations/${org.slug ?? org.id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const now = new Date();
  const upcomingEvents = events.filter((e) => !e.event_date || new Date(e.event_date) >= now);
  const pastEvents = events.filter((e) => e.event_date && new Date(e.event_date) < now);
  const displayedEvents = activeTab === "upcoming" ? upcomingEvents : pastEvents;

  const orgTypeLabel = ORG_TYPE_LABELS[org.org_type ?? "other"] ?? "Organization";
  const orgTypeColor = ORG_TYPE_COLORS[org.org_type ?? "other"] ?? "bg-zinc-100 text-zinc-700";
  const verified = org.status === "verified";

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: "upcoming", label: "Upcoming", count: upcomingEvents.length },
    { id: "past", label: "Past Events", count: pastEvents.length },
    { id: "fundraisers", label: "Fundraisers", count: fundraisers.length },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">

      {/* ── Banner ── */}
      <div className="relative h-56 w-full overflow-hidden bg-zinc-900 md:h-80">
        {org.banner ? (
          <Image
            src={org.banner}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-slate-800 via-slate-700 to-zinc-600" />
        )}
        <div className="absolute inset-0 bg-black/20" />

        {isOwner && (
          <Link
            href={`/dashboard/organizations/${org.slug ?? org.id}/settings`}
            className="absolute bottom-4 right-4 rounded-xl bg-black/60 px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition hover:bg-black"
          >
            Edit Organization
          </Link>
        )}
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-16">

        {/* ── Profile Header ── */}
        <div className="-mt-16 mb-6 md:-mt-20">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end">
            {/* Avatar */}
            <div className="h-28 w-28 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-xl md:h-36 md:w-36">
              {org.photo ? (
                <Image
                  src={org.photo}
                  alt={org.name}
                  width={144}
                  height={144}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-400 to-orange-600 text-4xl font-black text-white">
                  {org.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* Name + badges + actions */}
            <div className="flex flex-1 flex-col gap-3 pb-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${orgTypeColor}`}>
                    {orgTypeLabel}
                  </span>
                  {verified && <VerifiedBadge verified size="sm" />}
                  {org.average_rating && org.review_count && (
                    <span className="flex items-center gap-1">
                      <StarRating value={Number(org.average_rating)} size={16} />
                      <span className="text-xs text-zinc-500">({org.review_count})</span>
                    </span>
                  )}
                </div>
                <h1 className="mt-1.5 text-2xl font-black tracking-tight md:text-3xl">
                  {org.name}
                </h1>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={toggleFollow}
                  className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black transition ${
                    isFollowing
                      ? "bg-zinc-200 text-zinc-700 hover:bg-zinc-300"
                      : "bg-zinc-950 text-white hover:bg-orange-600"
                  }`}
                >
                  <Heart className={`h-4 w-4 ${isFollowing ? "fill-current" : ""}`} />
                  {isFollowing ? "Following" : "Follow"}
                </button>
                <button
                  onClick={copyLink}
                  className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Share2 className="h-4 w-4" />}
                  {copied ? "Copied!" : "Share"}
                </button>
                {org.contact_email && (
                  <a
                    href={`mailto:${org.contact_email}`}
                    className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-bold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    <Mail className="h-4 w-4" />
                    Contact
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">

          {/* ── Left column: bio + social + stats ── */}
          <aside className="space-y-5 lg:col-span-1">

            {/* Bio */}
            {org.bio && (
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <h2 className="mb-2 text-sm font-black uppercase tracking-wide text-zinc-400">About</h2>
                <p className="text-sm leading-relaxed text-zinc-700">{org.bio}</p>
              </div>
            )}

            {/* Impact stats */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-zinc-400">Impact</h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xl font-black text-zinc-950">{formatCount(events.length + (org.events_offset ?? 0))}</p>
                  <p className="text-xs font-medium text-zinc-500">Events</p>
                </div>
                <div>
                  <p className="text-xl font-black text-zinc-950">{formatCount(fundraisers.length)}</p>
                  <p className="text-xs font-medium text-zinc-500">Campaigns</p>
                </div>
                <div>
                  <p className="text-xl font-black text-zinc-950">{formatCount(followerCount)}</p>
                  <p className="text-xs font-medium text-zinc-500">Followers</p>
                </div>
              </div>
            </div>

            {/* Contact & Links */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-zinc-400">Connect</h2>
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
              {/* Social icons */}
              <div className="mt-4 flex flex-wrap gap-2">
                <SocialLink href={org.facebook} icon={FaFacebookF} label="Facebook" />
                <SocialLink href={org.twitter} icon={FaXTwitter} label="X (Twitter)" />
                <SocialLink href={org.instagram} icon={FaInstagram} label="Instagram" />
                <SocialLink href={org.linkedin} icon={FaLinkedinIn} label="LinkedIn" />
                <SocialLink href={org.youtube} icon={FaYoutube} label="YouTube" />
                <SocialLink href={org.tiktok} icon={FaTiktok} label="TikTok" />
              </div>
            </div>

          </aside>

          {/* ── Right column: tabs (events + fundraisers) ── */}
          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm overflow-hidden">

              {/* Tab bar */}
              <div className="flex border-b border-zinc-100">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-4 text-sm font-bold transition ${
                      activeTab === tab.id
                        ? "border-b-2 border-orange-500 text-orange-600"
                        : "text-zinc-500 hover:text-zinc-800"
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                        activeTab === tab.id ? "bg-orange-100 text-orange-700" : "bg-zinc-100 text-zinc-500"
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="p-4">
                {loading ? (
                  <div className="flex items-center justify-center py-16">
                    <div className="h-7 w-7 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
                  </div>
                ) : activeTab === "fundraisers" ? (
                  fundraisers.length === 0 ? (
                    <EmptyTabState label="No active fundraisers yet." />
                  ) : (
                    <div className="space-y-3">
                      {fundraisers.map((f) => {
                        const goal = Number(f.goal ?? 0);
                        const raised = Number(f.raised ?? 0);
                        const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;
                        return (
                          <Link
                            key={f.id}
                            href={`/fundraisers/${f.slug}`}
                            className="group flex gap-4 rounded-xl border border-zinc-100 p-3 transition hover:border-orange-200 hover:bg-orange-50/40"
                          >
                            {(f.image_url || f.banner) && (
                              <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg">
                                <Image
                                  src={f.image_url || f.banner || ""}
                                  alt={f.title}
                                  fill
                                  className="object-cover"
                                  sizes="80px"
                                />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-black text-zinc-900 line-clamp-1 group-hover:text-orange-700">
                                {f.title}
                              </p>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                                <div
                                  className="h-full rounded-full bg-emerald-500 transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="mt-1 text-xs text-zinc-500">
                                <span className="font-bold text-emerald-700">{formatMoney(raised)}</span>{" "}
                                raised of {formatMoney(goal)} goal
                              </p>
                            </div>
                            <ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-zinc-300 group-hover:text-orange-500" />
                          </Link>
                        );
                      })}
                    </div>
                  )
                ) : displayedEvents.length === 0 ? (
                  <EmptyTabState
                    label={activeTab === "upcoming" ? "No upcoming events scheduled." : "No past events yet."}
                  />
                ) : (
                  <div className="space-y-3">
                    {displayedEvents.map((evt) => (
                      <Link
                        key={evt.id}
                        href={`/events/${evt.slug}`}
                        className="group flex gap-4 rounded-xl border border-zinc-100 p-3 transition hover:border-orange-200 hover:bg-orange-50/40"
                      >
                        {evt.banner && (
                          <div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg">
                            <Image
                              src={evt.banner}
                              alt={evt.title}
                              fill
                              className="object-cover"
                              sizes="80px"
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-black text-zinc-900 line-clamp-1 group-hover:text-orange-700">
                            {evt.title}
                          </p>
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
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </main>
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
