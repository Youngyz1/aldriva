"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { safeImageSrc } from "@/lib/image-url";
import { cn } from "@/lib/utils";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import {
  Clock,
  Mail,
  ArrowUpRight,
  Globe,
  Sparkles,
  HeartHandshake
} from "lucide-react";
import { FaFacebookF, FaXTwitter } from "react-icons/fa6";

// ── Types ───────────────────────────────────────────────────────────────────

export interface EventItem {
  id: string;
  title: string;
  slug: string;
  event_date: string | null;
  venue?: string | null;
  city?: string | null;
  banner?: string | null;
  category?: string | null;
}

export interface FundraiserItem {
  id: string;
  title: string;
  slug: string;
  banner?: string | null;
  image_url?: string | null;
  goal: string | number | null;
  raised: string | number | null;
  category?: string | null;
}

interface OrganizerProfileCardProps {
  organizer?: {
    id: string;
    name: string;
    bio?: string | null;
    photo?: string | null;
    status?: string | null; // e.g. 'verified'
    website?: string | null;
    facebook?: string | null;
    twitter?: string | null;
  };
  upcomingEvents?: EventItem[];
  pastEvents?: EventItem[];
  fundraisers?: FundraiserItem[];
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  className?: string;
}

// ── Default Mock Data (for demo mode) ────────────────────────────────────────

const DEFAULT_ORGANIZER = {
  id: "demo-org",
  name: "Greenwood Community Alliance",
  bio: "Empowering neighborhoods through local green initiatives, neighborhood events, and micro-grants for community-driven schools.",
  photo: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400&h=400&fit=crop",
  status: "verified",
  website: "https://greenwoodalliance.org",
  facebook: "https://facebook.com/greenwood",
  twitter: "https://twitter.com/greenwood",
};

const DEFAULT_UPCOMING: EventItem[] = [
  {
    id: "evt-1",
    title: "Annual Neighborhood Tree Planting",
    slug: "tree-planting-2026",
    event_date: "2026-10-15T09:00:00Z",
    venue: "Oakwood Park",
    city: "Greenwood",
    category: "Environment",
  },
  {
    id: "evt-2",
    title: "Community Charity Auction",
    slug: "charity-auction",
    event_date: "2026-11-20T18:00:00Z",
    venue: "Alliance Hall",
    city: "Greenwood",
    category: "Social Cause",
  }
];

const DEFAULT_PAST: EventItem[] = [
  {
    id: "evt-3",
    title: "Summer Block Party & Food Drive",
    slug: "block-party-2025",
    event_date: "2025-07-12T12:00:00Z",
    venue: "Main Street",
    city: "Greenwood",
    category: "Social Cause",
  }
];

const DEFAULT_FUNDRAISERS: FundraiserItem[] = [
  {
    id: "fund-1",
    title: "School Library Renovation Drive",
    slug: "library-drive",
    goal: 15000,
    raised: 12450,
    category: "Education",
  },
  {
    id: "fund-2",
    title: "Winter Shelter Warmth Fund",
    slug: "winter-shelter",
    goal: 5000,
    raised: 5200,
    category: "Relief",
  }
];

// ── Component Implementation ────────────────────────────────────────────────

export default function OrganizerProfileCard({
  organizer = DEFAULT_ORGANIZER,
  upcomingEvents = DEFAULT_UPCOMING,
  pastEvents = DEFAULT_PAST,
  fundraisers = DEFAULT_FUNDRAISERS,
  isFollowing = false,
  onToggleFollow,
  className,
}: OrganizerProfileCardProps) {
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "fundraisers">("upcoming");
  const [copied, setCopied] = useState(false);

  // Active status color configurations
  const isVerified = organizer.status === "verified";
  const statusColor = isVerified ? "bg-emerald-500" : "bg-amber-500";
  const statusText = isVerified ? "Verified Organizer" : "Registered Organizer";

  // Dynamic live clock representation
  const timeText = useMemo(() => {
    const now = new Date();
    const h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, "0");
    const hour12 = ((h + 11) % 12) + 1;
    const ampm = h >= 12 ? "PM" : "AM";
    return `${hour12}:${m} ${ampm}`;
  }, []);

  const handleCopyLink = async () => {
    if (typeof window === "undefined") return;
    try {
      const url = `${window.location.origin}/organizers/${organizer.id}`;
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const activeItems = useMemo(() => {
    if (activeTab === "upcoming") return upcomingEvents;
    if (activeTab === "past") return pastEvents;
    return fundraisers;
  }, [activeTab, upcomingEvents, pastEvents, fundraisers]);

  // Format Helper for dates
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Date TBA";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn("relative w-full max-w-3xl mx-auto my-6", className)}
    >
      {/* ── Background Decorative Blobs ── */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      </div>

      <Card className="group relative overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-xl transition-all duration-300 hover:shadow-2xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-blue-600" />
        
        <CardContent className="relative p-6 sm:p-8 space-y-6">
          
          {/* ── Header Bar ── */}
          <div className="flex items-center justify-between border-b border-zinc-100 pb-4">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-2 items-center justify-center">
                <span className={cn("absolute h-2 w-2 rounded-full animate-pulse", statusColor)} />
                <span className={cn("absolute h-2 w-2 rounded-full", statusColor, "animate-ping")} />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">{statusText}</span>
            </div>
            <div className="flex items-center gap-1.5 text-zinc-400">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-xs font-mono font-bold">{timeText}</span>
            </div>
          </div>

          {/* ── Profile Header ── */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Avatar block with glow ring */}
            <div className="relative h-20 w-20 flex-shrink-0">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-400 to-blue-500 blur opacity-40 group-hover:opacity-60 transition-opacity" />
              <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-100">
                {safeImageSrc(organizer.photo) ? (
                  <Image
                    src={safeImageSrc(organizer.photo)!}
                    alt={`${organizer.name} logo`}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <LocalBrandedPlaceholder
                    variant="avatar"
                    title={organizer.name}
                    initials={organizer.name.charAt(0).toUpperCase()}
                    className="from-zinc-900 to-zinc-900 text-2xl"
                  />
                )}
              </div>
            </div>

            <div className="flex-1 text-center sm:text-left space-y-2">
              <h3 className="text-2xl font-black tracking-tight text-zinc-900">
                {organizer.name}
              </h3>
              <p className="text-sm font-medium text-zinc-600 leading-relaxed max-w-xl">
                {organizer.bio || "Supporting great causes and organizing events for the local community."}
              </p>
            </div>
          </div>

          {/* ── Interactive Content Tabs ── */}
          <div className="space-y-4">
            {/* Tab Selectors */}
            <div className="flex items-center gap-1 border-b border-zinc-100 pb-0.5">
              {(["upcoming", "past", "fundraisers"] as const).map((tab) => {
                const isActive = activeTab === tab;
                const count = tab === "upcoming" ? upcomingEvents.length : tab === "past" ? pastEvents.length : fundraisers.length;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "relative px-4 py-2 text-sm font-bold capitalize transition-colors rounded-t-xl",
                      isActive 
                        ? "text-emerald-700 bg-emerald-50/50 border-t border-x border-zinc-200 -mb-[1px]" 
                        : "text-zinc-500 hover:text-zinc-800"
                    )}
                  >
                    {tab}
                    <span className={cn(
                      "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-black tracking-normal",
                      isActive ? "bg-emerald-200 text-emerald-800" : "bg-zinc-100 text-zinc-600"
                    )}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Content Container */}
            <div className="min-h-[140px] rounded-2xl border border-zinc-100 bg-zinc-50/30 p-3 sm:p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-2.5"
                >
                  {activeItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-zinc-400">
                      <HeartHandshake className="h-8 w-8 stroke-[1.5] text-zinc-300 mb-2" />
                      <p className="text-sm font-bold">No active listings posted yet</p>
                    </div>
                  ) : activeTab === "fundraisers" ? (
                    (activeItems as FundraiserItem[]).map((fund) => {
                      const raisedNum = Number(fund.raised ?? 0);
                      const goalNum = Number(fund.goal ?? 0);
                      const pct = Math.min(100, Math.round((raisedNum / (goalNum || 1)) * 100)) || 0;
                      return (
                        <Link
                          key={fund.id}
                          href={`/fundraisers/${fund.slug}`}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-zinc-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group/item"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-100">
                              {fund.category || "Fundraiser"}
                            </span>
                            <h4 className="mt-1 text-sm font-black text-zinc-800 truncate group-hover/item:text-emerald-700 transition-colors">
                              {fund.title}
                            </h4>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            {/* Simple inline progress metric */}
                            <div className="text-right">
                              <p className="text-xs font-black text-zinc-900">${raisedNum.toLocaleString()} raised</p>
                              <p className="text-[10px] text-zinc-500">of ${goalNum.toLocaleString()} goal</p>
                            </div>
                            <div className="relative flex h-8 w-8 items-center justify-center shrink-0">
                              <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
                                <circle cx="18" cy="18" r="14" fill="none" stroke="#F1F0EB" strokeWidth="3" />
                                <circle
                                  cx="18" cy="18" r="14"
                                  fill="none" stroke="#059669" strokeWidth="3"
                                  strokeDasharray="88" strokeDashoffset={88 - (88 * pct) / 100}
                                  strokeLinecap="round"
                                />
                              </svg>
                              <span className="absolute text-[8px] font-black text-emerald-800">{pct}%</span>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  ) : (
                    (activeItems as EventItem[]).map((event) => (
                      <Link
                        key={event.id}
                        href={`/events/${event.slug}`}
                        className="flex items-center justify-between gap-4 p-3 rounded-xl border border-zinc-200 bg-white hover:border-emerald-300 hover:shadow-sm transition-all group/item"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
                            {event.category || "Event"}
                          </span>
                          <h4 className="mt-1 text-sm font-black text-zinc-800 truncate group-hover/item:text-emerald-700 transition-colors">
                            {event.title}
                          </h4>
                          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
                            {event.venue} {event.city ? `· ${event.city}` : ""}
                          </p>
                        </div>
                        <div className="shrink-0 text-right flex items-center gap-2">
                          <div className="text-zinc-500 hidden sm:block">
                            <p className="text-xs font-bold text-zinc-800">{formatDate(event.event_date)}</p>
                          </div>
                          <div className="h-7 w-7 rounded-lg bg-zinc-50 flex items-center justify-center border border-zinc-100 group-hover/item:bg-emerald-50 group-hover/item:border-emerald-200 transition-colors">
                            <ArrowUpRight className="h-4 w-4 text-zinc-400 group-hover/item:text-emerald-600 transition-colors" />
                          </div>
                        </div>
                      </Link>
                    ))
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          {/* ── Call To Actions ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            {onToggleFollow ? (
              <>
                <Button
                  onClick={onToggleFollow}
                  className={cn(
                    "w-full h-12 rounded-xl font-bold transition-all cursor-pointer shadow",
                    isFollowing
                      ? "bg-zinc-150 hover:bg-zinc-200 text-zinc-800 border border-zinc-300"
                      : "bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-700 hover:to-teal-700"
                  )}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isFollowing ? "Following" : "Follow"}
                </Button>

                <a
                  href={`mailto:support@fund4agoodcause.com?subject=${encodeURIComponent(
                    `Contact ${organizer.name}`
                  )}`}
                  className="w-full"
                >
                  <Button
                    variant="outline"
                    className="w-full h-12 rounded-xl border-zinc-200 bg-white font-bold text-zinc-700 hover:bg-zinc-50 transition-all cursor-pointer"
                  >
                    <Mail className="mr-2 h-4 w-4" />
                    Contact Organizer
                  </Button>
                </a>
              </>
            ) : (
              <>
                <Link href={`/organizers/${organizer.id}`} className="w-full">
                  <Button className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 font-bold text-white shadow hover:from-emerald-700 hover:to-teal-700 transition-all cursor-pointer">
                    <Sparkles className="mr-2 h-4 w-4" />
                    View Full Profile
                  </Button>
                </Link>

                <Button
                  onClick={handleCopyLink}
                  variant="outline"
                  className="h-12 rounded-xl border-zinc-200 bg-white font-bold text-zinc-700 hover:bg-zinc-50 transition-all cursor-pointer"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {copied ? "Link Copied!" : "Copy Profile Link"}
                </Button>
              </>
            )}
          </div>

          {/* ── Social Footer ── */}
          {(organizer.website || organizer.facebook || organizer.twitter) && (
            <div className="flex items-center justify-center gap-3 pt-2 border-t border-zinc-100">
              {organizer.website && (
                <a
                  href={organizer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-zinc-50 p-2.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 border border-zinc-150 transition-colors"
                  aria-label="Website"
                >
                  <Globe className="h-4 w-4" />
                </a>
              )}
              {organizer.facebook && (
                <a
                  href={organizer.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-zinc-50 p-2.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 border border-zinc-150 transition-colors"
                  aria-label="Facebook"
                >
                  <FaFacebookF className="h-4 w-4" />
                </a>
              )}
              {organizer.twitter && (
                <a
                  href={organizer.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-zinc-50 p-2.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 border border-zinc-150 transition-colors"
                  aria-label="Twitter"
                >
                  <FaXTwitter className="h-4 w-4" />
                </a>
              )}
            </div>
          )}

        </CardContent>
      </Card>
    </motion.div>
  );
}
