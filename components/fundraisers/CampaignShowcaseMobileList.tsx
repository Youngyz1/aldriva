"use client";

import { useState } from "react";
import CampaignShowcaseMobileCard from "@/components/fundraisers/CampaignShowcaseMobileCard";
import type { CampaignShowcaseItem } from "@/components/fundraisers/CampaignShowcase";

interface CampaignShowcaseMobileListProps {
  featured: CampaignShowcaseItem | null;
  items: CampaignShowcaseItem[];
}

/** Rows visible before the first "Show more" click. */
const INITIAL_VISIBLE = 4;
/** Additional rows revealed per click. */
const REVEAL_STEP = 4;

/**
 * Mobile campaign browse list — a true vertical list (GoFundMe-style), not
 * a carousel. Rows are separated by hairline dividers rather than boxed
 * individually, so it reads as a scannable list rather than a stack of
 * cards — letting several campaigns' titles/amounts be visible at once
 * without any horizontal scrolling.
 *
 * Starts at a short list and reveals more on demand, matching /fundraisers.
 * The whole batch is already fetched by the page, so revealing is instant
 * local state — no extra request.
 */
export default function CampaignShowcaseMobileList({
  featured,
  items,
}: CampaignShowcaseMobileListProps) {
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const cards = featured ? [featured, ...items] : items;

  if (cards.length === 0) return null;

  const visible = cards.slice(0, visibleCount);
  const remaining = cards.length - visible.length;

  return (
    <>
      <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-100">
        {visible.map((item) => (
          <CampaignShowcaseMobileCard
            key={item.id}
            slug={item.slug}
            title={item.title}
            raised={item.raised}
            goal={item.goal}
            image={item.image}
            donorCount={item.donorCount}
            featured={item.id === featured?.id}
          />
        ))}
      </div>

      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisibleCount((current) => current + REVEAL_STEP)}
          className="mt-4 w-full rounded-full border border-zinc-200 bg-white px-6 py-3 text-sm font-black text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 active:scale-[0.99]"
        >
          Show more
          <span className="ml-1.5 font-bold text-zinc-400">({remaining})</span>
        </button>
      )}
    </>
  );
}
