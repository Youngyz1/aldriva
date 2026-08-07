"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, Copy } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ORGANIZER_PUBLIC_COLUMNS } from "@/lib/organizer-public-columns";
import VerifiedBadge from "@/components/ui/VerifiedBadge";
import StarRating from "@/components/StarRating";
import OrganizerProfileCard from "@/components/ui/profile-card";

// Bios longer than this get clamped with a "Read more" toggle — short enough
// that a 3-4 line clamp at this font size never has anything left to expand.
const BIO_TRUNCATE_LENGTH = 220;


type Organizer = {
  id: string;
  name: string;
  bio: string | null;
  photo: string | null;
  banner: string | null;
  facebook: string | null;
  twitter: string | null;
  website: string | null;
  user_id: string;
  status: string | null;
  follower_offset?: number;
  events_offset?: number;
  average_rating?: number;
  review_count?: number;
};

type Event = {
  id: string;
  title: string;
  slug: string;
  event_date: string | null;
  venue: string | null;
  city: string | null;
  banner: string | null;
  category: string | null;
  user_id?: string | null;
};

type Fundraiser = {
  id: string;
  title: string;
  slug: string;
  banner: string | null;
  image_url: string | null;
  goal: number | string | null;
  raised: number | string | null;
  category: string | null;
};

function formatCount(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatEventDate(dateStr: string | null) {
  if (!dateStr) return "Date TBA";
  const date = new Date(dateStr);

  return (
    date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }) +
    " · " +
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
  );
}

function WebsiteIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
      <circle cx="12" cy="12" r="9" />
      <path d="M3.6 9h16.8M3.6 15h16.8M12 3c-2.5 3-4 6-4 9s1.5 6 4 9M12 3c2.5 3 4 6 4 9s-1.5 6-4 9" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M4 4h16v16H4z" />
      <path d="m22 6-10 7L2 6" />
    </svg>
  );
}

export default function OrganizerProfileClient({
  id: propId,
  initialData,
}: {
  id?: string;
  initialData?: Organizer;
}) {
  const params = useParams();
  const router = useRouter();
  const [organizer, setOrganizer] = useState<Organizer | null>(initialData || null);
  const [events, setEvents] = useState<Event[]>([]);
  const [fundraisers, setFundraisers] = useState<Fundraiser[]>([]);
  const [loading, setLoading] = useState(!initialData);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past" | "fundraisers">("upcoming");
  const [isFollowing, setIsFollowing] = useState(false);
  const [followerCount, setFollowerCount] = useState(initialData ? (initialData.follower_offset ?? 0) : 0);
  const [isOwner, setIsOwner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [bioExpanded, setBioExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const organizerId = propId || (params?.id as string);
    if (!organizerId) return;

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user) setCurrentUserId(session.user.id);

      let org = organizer;
      if (!org) {
        const { data, error } = await supabase
          .from("organizers")
          .select(ORGANIZER_PUBLIC_COLUMNS)
          .eq("id", organizerId)
          .single();

        if (error || !data) {
          router.push("/404");
          return;
        }
        org = data;
        setOrganizer(org);
      }

      if (!org) return;

      setIsOwner(session?.user?.id === org.user_id);

      const { data: evts } = await supabase
        .from("events")
        .select("id, title, slug, event_date, venue, city, banner, category, user_id")
        .eq("organizer_id", organizerId)
        .order("event_date", { ascending: true });

      setEvents(evts ?? []);

      const { data: raisers } = await supabase
        .from("fundraisers")
        .select("id, title, slug, banner, image_url, goal, raised, category")
        .eq("organizer_id", organizerId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      setFundraisers(raisers ?? []);

      // Aggregate view rather than a head-count over organizer_follows:
      // migration_53 restricted that table to the follower and the organizer,
      // so an anonymous visitor counting rows directly would now always see 0.
      const { data: followRow } = await supabase
        .from("organizer_follower_counts")
        .select("follower_count")
        .eq("organizer_id", organizerId)
        .maybeSingle();

      setFollowerCount(
        Number(followRow?.follower_count ?? 0) + (org.follower_offset ?? 0)
      );

      if (session?.user) {
        const { data: follow } = await supabase
          .from("organizer_follows")
          .select("id")
          .eq("organizer_id", organizerId)
          .eq("user_id", session.user.id)
          .maybeSingle();

        setIsFollowing(!!follow);
      }

      setLoading(false);
    }

    load();
  }, [propId, params?.id, router, initialData]);

  async function toggleFollow() {
    if (!currentUserId || !organizer) {
      router.push("/login");
      return;
    }

    if (isFollowing) {
      const { error } = await supabase
        .from("organizer_follows")
        .delete()
        .eq("organizer_id", organizer.id)
        .eq("user_id", currentUserId);

      if (!error) {
        setIsFollowing(false);
        setFollowerCount((count) => Math.max(0, count - 1));
      }
    } else {
      const { error } = await supabase
        .from("organizer_follows")
        .insert({ organizer_id: organizer.id, user_id: currentUserId });

      if (!error) {
        setIsFollowing(true);
        setFollowerCount((count) => count + 1);
      }
    }
  }

  async function shareProfile() {
    if (typeof window === "undefined") return;
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  const now = new Date();
  const upcomingEvents = events.filter((event) => !event.event_date || new Date(event.event_date) >= now);
  const pastEvents = events.filter((event) => event.event_date && new Date(event.event_date) < now);
  const displayedEvents = activeTab === "upcoming" ? upcomingEvents : pastEvents;
  const totalCampaigns = events.length + fundraisers.length + (organizer?.events_offset ?? 0);
  const activeNow = upcomingEvents.length + fundraisers.length;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-50">
        <p className="text-xl font-semibold text-zinc-400">Loading...</p>
      </main>
    );
  }

  if (!organizer) return null;

  return (
    <main className="min-h-screen bg-white text-zinc-950">
       

      <section className="border-b border-zinc-200 bg-white">
        <div className="relative h-[220px] w-full overflow-hidden bg-zinc-900 sm:h-[300px] md:h-[360px]">
          {organizer.banner ? (
            <Image
              src={organizer.banner}
              alt=""
              fill
              priority
              sizes="100vw"
              className="object-cover"
            />
          ) : (
            <div className="h-full w-full bg-[linear-gradient(135deg,#27272a_0%,#52525b_100%)]" />
          )}
          <div className="absolute inset-0 bg-black/5" />

          {isOwner && (
            <Link
              href={`/organizers/${organizer.id}/edit`}
              className="absolute bottom-5 right-6 rounded-xl bg-black/70 px-5 py-3 text-base font-bold text-white backdrop-blur transition hover:bg-black"
            >
              Edit profile
            </Link>
          )}
        </div>

        <div className="mx-auto max-w-4xl px-4 py-8 md:py-12 -mt-16 md:-mt-24 relative z-10">
          <OrganizerProfileCard
            organizer={organizer}
            upcomingEvents={upcomingEvents}
            pastEvents={pastEvents}
            fundraisers={fundraisers}
            isFollowing={isFollowing}
            onToggleFollow={toggleFollow}
          />
        </div>
      </section>

    </main>
  );
}
