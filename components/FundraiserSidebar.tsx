"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { TrendingUp, Share2, Check } from "lucide-react";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type Donation = {
  id: string;
  donor_name: string | null;
  amount: number;
  created_at: string;
  user_id?: string | null;
  profile?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
  isNew?: boolean;
};

type FundraiserSidebarProps = {
  fundraiserId: string;
  fundraiserSlug: string;
  fundraiserTitle: string;
  initialRaised: number;
  initialGoal: number;
  initialDonations: Donation[];
  initialTotalCount: number;
};

const POLL_INTERVAL = 12_000; // 12 s
const FEED_LIMIT = 5;

function timeAgo(iso: string) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function CircularProgress({ pct }: { pct: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="rotate-[-90deg]">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#e4e4e7" strokeWidth="12" />
      <circle
        cx="70" cy="70" r={r} fill="none"
        stroke="#22c55e" strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
    </svg>
  );
}

function Avatar({ name }: { name: string }) {
  const letter = (name || "A").charAt(0).toUpperCase();
  return (
    <LocalBrandedPlaceholder
      variant="avatar"
      title={name}
      initials={letter}
      seed={letter}
      className="h-9 w-9 shrink-0 rounded-full text-sm"
    />
  );
}

export default function FundraiserSidebar({
  fundraiserId,
  fundraiserSlug,
  fundraiserTitle,
  initialRaised,
  initialGoal,
  initialDonations,
  initialTotalCount,
}: FundraiserSidebarProps) {
  const [raised, setRaised] = useState(initialRaised);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [donations, setDonations] = useState<Donation[]>(initialDonations);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);
  const seenIds = useRef(new Set(initialDonations.map((d) => d.id)));

  const goal = initialGoal;
  const pct = goal > 0 ? Math.min(Math.round((raised / goal) * 100), 100) : 0;
  const visible = showAll ? donations : donations.slice(0, FEED_LIMIT);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/donations?fundraiserId=${fundraiserId}&limit=20`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json() as { donations: Donation[]; totalCount: number; raised: number };
      setRaised(data.raised ?? raised);
      setTotalCount(data.totalCount ?? totalCount);
      setDonations((prev) => {
        const incoming = (data.donations ?? []).map((d) => ({
          ...d,
          isNew: !seenIds.current.has(d.id),
        }));
        incoming.forEach((d) => seenIds.current.add(d.id));
        // Merge: new ones on top, deduplicate
        const merged = [
          ...incoming.filter((d) => d.isNew),
          ...prev.filter((p) => !incoming.some((i) => i.id === p.id && i.isNew)),
        ];
        // Strip isNew flag after 3 s
        setTimeout(() => {
          setDonations((cur) => cur.map((d) => ({ ...d, isNew: false })));
        }, 3000);
        return merged;
      });
    } catch {
      // silent
    }
  }, [fundraiserId, raised, totalCount]);

  useEffect(() => {
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [poll]);

  async function handleShare() {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: fundraiserTitle, url }); return; } catch {}
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div id="donate" className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white shadow-sm lg:sticky lg:top-24">
      {/* Circular progress */}
      <div className="flex flex-col items-center px-6 pt-7 pb-5">
        <div className="relative flex items-center justify-center">
          <CircularProgress pct={pct} />
          <div className="absolute flex flex-col items-center">
            <span className="text-2xl font-black leading-none">{pct}%</span>
            <span className="mt-0.5 text-xs text-zinc-500">funded</span>
          </div>
        </div>
        <p className="mt-4 text-center text-lg font-black leading-snug">
          ${raised.toLocaleString()}{" "}
          <span className="font-semibold text-zinc-500">raised of ${goal.toLocaleString()} USD</span>
        </p>
        <p className="mt-1 text-sm text-zinc-500">{totalCount.toLocaleString()} donation{totalCount !== 1 ? "s" : ""}</p>
      </div>

      {/* Buttons */}
      <div className="space-y-3 px-6 pb-6">
        <a
          href={`/fundraisers/${fundraiserSlug}/donate`}
          className="flex w-full items-center justify-center rounded-2xl bg-green-500 py-4 text-base font-black text-white transition hover:bg-green-600 active:scale-[.98]"
        >
          Donate now
        </a>
        <button
          type="button"
          onClick={handleShare}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-zinc-300 bg-white py-3.5 text-base font-black text-zinc-800 transition hover:bg-zinc-50"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <Share2 className="h-4 w-4" />}
          {copied ? "Link copied!" : "Share"}
        </button>
      </div>

      {/* Live feed */}
      <div className="border-t border-zinc-100 px-6 py-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-600" />
          <h3 className="text-sm font-black text-zinc-800">
            {totalCount.toLocaleString()} recent donation{totalCount !== 1 ? "s" : ""}
          </h3>
        </div>

        {donations.length === 0 ? (
          <p className="text-sm text-zinc-400">No donations yet — be the first!</p>
        ) : (
          <ul className="space-y-3">
            {visible.map((d) => (
              <li
                key={d.id}
                className={`flex items-center gap-3 transition-all duration-500 ${
                  d.isNew ? "animate-[popIn_0.4s_ease] rounded-xl bg-green-50 p-2 -mx-2" : ""
                }`}
              >
                {d.profile?.avatar_url && d.donor_name !== "Anonymous" ? (
                  <img
                    src={d.profile.avatar_url}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <Avatar name={d.donor_name || "Anonymous"} />
                )}
                <div className="min-w-0 flex-1">
                  {d.profile && d.donor_name !== "Anonymous" ? (
                    <Link
                      href={`/profile/${d.profile.id}`}
                      className="block truncate text-sm font-bold hover:underline"
                    >
                      {d.profile.display_name || d.donor_name || "Anonymous"}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-sm font-bold">{d.donor_name || "Anonymous"}</p>
                      {!d.user_id && (
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-zinc-500">
                          Guest
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-zinc-400">
                    ${Number(d.amount).toLocaleString()} · {timeAgo(d.created_at)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {donations.length > FEED_LIMIT && (
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-xs font-black text-green-700 hover:underline"
            >
              {showAll ? "See less" : "See all"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
