import React from "react";
import Link from "next/link";
import { Sparkles, HandHeart, Calendar, PenTool } from "lucide-react";

interface ArticleCtaBannerProps {
  categories?: string[];
}

export default function ArticleCtaBanner({ categories = [] }: ArticleCtaBannerProps) {
  const isFundraising = categories.some((c) => /fundrais|charit|donat|aid/i.test(c));
  const isEvents = categories.some((c) => /event|gather|confer|meet/i.test(c));

  if (isFundraising) {
    return (
      <div className="mt-12 rounded-3xl bg-gradient-to-br from-orange-600 to-amber-600 p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-black uppercase tracking-wider backdrop-blur-sm">
              <HandHeart className="h-3.5 w-3.5" /> Start a Campaign
            </span>
            <h3 className="text-2xl font-black">Inspired to Make a Difference?</h3>
            <p className="text-sm text-orange-100 max-w-xl">
              Launch your fundraising journey today on Aldriva with zero platform fees, instant donations, and transparent tracking.
            </p>
          </div>
          <Link
            href="/create-fundraiser"
            className="rounded-2xl bg-white px-6 py-3.5 text-sm font-black text-orange-600 hover:bg-orange-50 transition shadow-lg shrink-0"
          >
            Start a Fundraiser →
          </Link>
        </div>
      </div>
    );
  }

  if (isEvents) {
    return (
      <div className="mt-12 rounded-3xl bg-gradient-to-br from-violet-600 to-purple-700 p-8 text-white shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-black uppercase tracking-wider backdrop-blur-sm">
              <Calendar className="h-3.5 w-3.5" /> Host an Event
            </span>
            <h3 className="text-2xl font-black">Bring People Together</h3>
            <p className="text-sm text-violet-100 max-w-xl">
              Organize ticketing, custom seating charts, check-in scanners, and digital invitations seamlessly on Aldriva Events.
            </p>
          </div>
          <Link
            href="/create-event"
            className="rounded-2xl bg-white px-6 py-3.5 text-sm font-black text-violet-700 hover:bg-violet-50 transition shadow-lg shrink-0"
          >
            Create an Event →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-12 rounded-3xl bg-zinc-950 p-8 text-white shadow-xl border border-zinc-800">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-600/30 border border-orange-500/30 px-3 py-1 text-xs font-black uppercase tracking-wider text-orange-300">
            <PenTool className="h-3.5 w-3.5" /> Aldriva Publishing
          </span>
          <h3 className="text-2xl font-black">Have a Story That Inspires Change?</h3>
          <p className="text-sm text-zinc-300 max-w-xl">
            Join community leaders, writers, and organizers sharing insights, milestone updates, and grassroots stories.
          </p>
        </div>
        <Link
          href="/dashboard/articles/new"
          className="rounded-2xl bg-orange-600 px-6 py-3.5 text-sm font-black text-white hover:bg-orange-700 transition shadow-lg shrink-0"
        >
          Write a Story →
        </Link>
      </div>
    </div>
  );
}
