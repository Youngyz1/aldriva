import { getFundraiserList } from "@/lib/fundraiser-data";
import { getDonationCounts } from "@/lib/donation-counts";
import { getSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { MarketingSection } from "@/components/footers";
import FilterableCampaignShowcase from "@/components/fundraisers/FilterableCampaignShowcase";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Browse All — Aldriva",
  description: "Browse all fundraising campaigns on Aldriva.",
  alternates: {
    canonical: `${getSiteUrl()}/fundraisers/browse-all`,
  },
  openGraph: {
    title: "Browse All — Aldriva",
    description: "Browse all fundraising campaigns on Aldriva.",
    url: `${getSiteUrl()}/fundraisers/browse-all`,
    siteName: "Aldriva",
    images: [{ url: "/aldriva-og-image-v2.png", width: 1200, height: 630, alt: "Browse All" }],
  },
  twitter: { card: "summary_large_image", images: ["/aldriva-og-image-v2.png"] },
};

import { redirect } from "next/navigation";

const PAGE_SIZE = 12;

export default async function BrowseAllPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const resolved = await searchParams;
  if (resolved?.q?.trim()) {
    const params = new URLSearchParams();
    params.set("q", resolved.q.trim());
    if (resolved.page) params.set("page", resolved.page);
    redirect(`/fundraisers/search?${params.toString()}`);
  }

  const page = Math.max(1, parseInt(resolved.page || "1", 10) || 1);

  const { fundraisers, total } = await getFundraiserList({
    smartFilter: "all",
    page,
    pageSize: PAGE_SIZE,
  });

  const donationCounts = fundraisers.length
    ? await getDonationCounts(fundraisers.map((f) => f.id))
    : new Map<string, number>();

  const initialItems = fundraisers.map((f) => ({
    id: f.id,
    slug: f.slug,
    title: f.title,
    raised: f.raised,
    goal: f.goal,
    image: f.image,
    category: f.category,
    organizer: f.organizer,
    donorCount: donationCounts.get(f.id),
  }));

  return (
    <MarketingSection>
      <main className="min-h-screen bg-zinc-50 text-zinc-950 pb-16">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
          <FilterableCampaignShowcase
            initialFilter="all"
            initialItems={initialItems}
            initialTotal={total}
            initialPage={page}
          />
        </div>
      </main>
    </MarketingSection>
  );
}
