import { getFundraiserList } from "@/lib/fundraiser-data";
import { getDonationCounts } from "@/lib/donation-counts";
import { getSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { MarketingSection } from "@/components/footers";
import FilterableCampaignShowcase from "@/components/fundraisers/FilterableCampaignShowcase";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Close to Target — Aldriva",
  description: "Fundraisers close to reaching their goal on Aldriva.",
  alternates: {
    canonical: `${getSiteUrl()}/fundraisers/close-to-target`,
  },
  openGraph: {
    title: "Close to Target — Aldriva",
    description: "Fundraisers close to reaching their goal on Aldriva.",
    url: `${getSiteUrl()}/fundraisers/close-to-target`,
    siteName: "Aldriva",
    images: [{ url: "/aldriva-og-image-v2.png", width: 1200, height: 630, alt: "Close to Target" }],
  },
  twitter: { card: "summary_large_image", images: ["/aldriva-og-image-v2.png"] },
};

const PAGE_SIZE = 12;

export default async function CloseToTargetPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const resolved = await searchParams;
  const page = Math.max(1, parseInt(resolved.page || "1", 10) || 1);

  const { fundraisers, total } = await getFundraiserList({
    smartFilter: "close-to-target",
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
            initialFilter="close-to-target"
            initialItems={initialItems}
            initialTotal={total}
            initialPage={page}
          />
        </div>
      </main>
    </MarketingSection>
  );
}
