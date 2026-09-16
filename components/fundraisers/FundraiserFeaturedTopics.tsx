import { Sprout } from "lucide-react";

import FeaturedTopics, { type FeaturedTopic } from "@/components/marketing/FeaturedTopics";
import { normalizeImageUrl } from "@/lib/image-url";
import { getFundraiserList } from "@/lib/fundraiser-data";

/**
 * Fundraisers "featured topics" row. Every destination is real:
 *  1. Needs a boost  → the needs-momentum smart filter, fronted by a real
 *     campaign that has an actual banner image. Links directly to that
 *     campaign's detail page (/fundraisers/{slug}), not the filtered list.
 *  2. Just launched  → dedicated standalone route /fundraisers/just-launched
 *     (not a query param on the shared /fundraisers page). Its only campaign
 *     ("Tiny Toadlets") has NO banner image, so this card uses a branded tile
 *     rather than a stock photo (deliberately avoiding stock imagery).
 *  3. Learn more     → the real /reviews page. Uses /images/reviews-card.png
 *     (public/images/reviews-card.png) with next/image object-cover.
 */

// Real campaign banner for card 1 (on an allowed host — see lib/image-url.ts).
const NEEDS_BOOST_IMAGE =
  "https://d2g8igdw686xgo.cloudfront.net/104399749_1780270023625266_r.jpg";

const NEEDS_BOOST_FALLBACK_SLUG = "donate-to-supporting-miracle-amiris-recovery-and-rebuilding-organized-by-destiny-keith";

export default async function FundraiserFeaturedTopics() {
  // Resolve the "needs a boost" card to the actual fundraiser that currently
  // qualifies for the needs-momentum smart filter, so the CTA goes directly
  // to /fundraisers/{slug} like any other campaign card. Falls back to the
  // known hardcoded campaign if the filter is temporarily empty.
  let needsBoostHref = `/fundraisers/${NEEDS_BOOST_FALLBACK_SLUG}`;
  let needsBoostTitle = "Miracle & Amiri's Recovery and Rebuilding";
  let needsBoostImage = NEEDS_BOOST_IMAGE;
  let needsBoostImageAlt = "Miracle & Amiri's recovery and rebuilding fundraiser";
  try {
    const { fundraisers } = await getFundraiserList({
      smartFilter: "needs-momentum",
      page: 1,
      pageSize: 1,
    });
    const top = fundraisers[0];
    if (top?.slug) {
      needsBoostHref = `/fundraisers/${top.slug}`;
      needsBoostTitle = top.title;
      // Use the campaign's real image if it has one, otherwise keep the known good fallback image.
      needsBoostImage = top.image || NEEDS_BOOST_IMAGE;
      needsBoostImageAlt = top.title;
    }
  } catch {
    // Keep fallback — card still renders, just points to known campaign.
  }

  const TOPICS: FeaturedTopic[] = [
    {
      tag: "Needs a boost",
      tone: "emerald-solid",
      image: normalizeImageUrl(needsBoostImage, ""),
      imageAlt: needsBoostImageAlt,
      title: needsBoostTitle,
      href: needsBoostHref,
      cta: "Donate now",
    },
    {
      tag: "Just launched",
      tone: "emerald-soft",
      icon: <Sprout className="h-12 w-12" />,
      title: "Help the Tiny Toadlets Cross the Road this Summer",
      href: "/fundraisers/just-launched",
      cta: "Donate now",
    },
    {
      tag: "Learn more",
      tone: "neutral",
      image: "/images/reviews-card.png",
      imageAlt: "Real reviews from our community",
      title: "Real reviews from our community",
      href: "/reviews",
      cta: "Read more",
    },
  ];

  return <FeaturedTopics heading="Featured topics" topics={TOPICS} />;
}
