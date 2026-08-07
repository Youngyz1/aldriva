"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { TrendingUp, Share2, Check, AlertCircle } from "lucide-react";
import { copyTextToClipboard } from "@/lib/clipboard";
import ProgressRing from "@/components/ui/ProgressRing";
import { calculateFundraisingPercentage } from "@/lib/fundraising-progress";

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

function Avatar({ name }: { name: string }) {
  const letter = (name || "A").charAt(0).toUpperCase();
  const colors = ["bg-green-100 text-green-700","bg-blue-100 text-blue-700","bg-purple-100 text-purple-700","bg-amber-100 text-amber-700","bg-rose-100 text-rose-700"];
  const color = colors[letter.charCodeAt(0) % colors.length];
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${color}`}>
      {letter}
    </div>
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
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const seenIds = useRef(new Set(initialDonations.map((d) => d.id)));

  const goal = initialGoal;
  const pct = calculateFundraisingPercentage(raised, goal);
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
    const succeeded = await copyTextToClipboard(url);
    setCopyStatus(succeeded ? "copied" : "failed");
    setTimeout(() => setCopyStatus("idle"), succeeded ? 1800 : 3000);
  }

  return (
    <div id="donate" className="scroll-mt-24 rounded-3xl border border-zinc-200 bg-white p-5 sm:p-6 shadow-sm lg:sticky lg:top-24 space-y-5">
      {/* Circular progress & Raised details */}
      <section className="flex items-center gap-4">
        <div className="shrink-0">
          <ProgressRing percentage={pct} size={72} strokeWidth={7} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-black tracking-tight text-zinc-950 leading-tight">
            ${raised.toLocaleString()} raised
          </p>
          <p className="text-lg font-medium text-zinc-500 leading-snug">
            of ${goal.toLocaleString()} USD
          </p>
          <p className="text-xs font-semibold text-zinc-500 mt-1">
            {totalCount.toLocaleString()} donation{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
      </section>

      {/* Buttons */}
      <section className="flex flex-col gap-2.5">
        <a
          href={`/fundraisers/${fundraiserSlug}/donate`}
          className="flex w-full min-h-[48px] items-center justify-center rounded-full bg-[#c0f269] px-6 py-3.5 text-base font-black text-[#1b3e10] transition hover:bg-[#b5eb57] active:scale-[0.98] shadow-sm"
        >
          Donate now
        </a>
        <button
          type="button"
          onClick={handleShare}
          className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#1c3a27] px-6 py-3.5 text-base font-black text-[#c0f269] transition hover:bg-[#152f1e] active:scale-[0.98] shadow-sm"
          title={copyStatus === "failed" ? "Copy failed — long-press the link to copy manually" : undefined}
        >
          {copyStatus === "copied" ? (
            <Check className="h-4 w-4 text-[#c0f269]" />
          ) : copyStatus === "failed" ? (
            <AlertCircle className="h-4 w-4 text-red-500" />
          ) : (
            <Share2 className="h-4 w-4" />
          )}
          {copyStatus === "copied"
            ? "Link copied!"
            : copyStatus === "failed"
            ? "Failed to copy"
            : "Share"}
        </button>
      </section>

      {/* Live feed */}
      <div className="border-t border-zinc-100 pt-5">
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
                className={`flex items-center gap-3 transition-all duration-500 overflow-hidden ${
                  d.isNew ? "animate-[popIn_0.4s_ease] rounded-xl bg-green-50 px-2 py-1" : ""
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
