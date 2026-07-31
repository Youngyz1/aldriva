import { Sprout, Star } from "lucide-react";

import FeaturedTopics, { type FeaturedTopic } from "@/components/marketing/FeaturedTopics";
import { normalizeImageUrl } from "@/lib/image-url";

/**
 * Fundraisers "featured topics" row. Every destination is real:
 *  1. Needs a boost  → the needs-momentum smart filter, fronted by a real
 *     campaign that has an actual banner image.
 *  2. Just launched  → the just-launched smart filter. Its only campaign
 *     ("Tiny Toadlets") has NO banner image, so this card uses a branded tile
 *     rather than a stock photo (deliberately avoiding stock imagery).
 *  3. Learn more     → the real /reviews page. No image asset exists for it, so
 *     it also uses a branded tile.
 */

// Real campaign banner for card 1 (on an allowed host — see lib/image-url.ts).
const NEEDS_BOOST_IMAGE =
  "https://d2g8igdw686xgo.cloudfront.net/104399749_1780270023625266_r.jpg";

const TOPICS: FeaturedTopic[] = [
  {
    tag: "Needs a boost",
    tone: "emerald-solid",
    image: normalizeImageUrl(NEEDS_BOOST_IMAGE, ""),
    imageAlt: "Miracle & Amiri's recovery and rebuilding fundraiser",
    title: "Miracle & Amiri's Recovery and Rebuilding",
    href: "/fundraisers?filter=needs-momentum",
    cta: "Donate now",
  },
  {
    tag: "Just launched",
    tone: "emerald-soft",
    icon: <Sprout className="h-12 w-12" />,
    title: "Help the Tiny Toadlets Cross the Road this Summer",
    href: "/fundraisers?filter=just-launched",
    cta: "Donate now",
  },
  {
    tag: "Learn more",
    tone: "neutral",
    icon: <Star className="h-12 w-12" />,
    title: "Real reviews from our community",
    href: "/reviews",
    cta: "Read more",
  },
];

export default function FundraiserFeaturedTopics() {
  return <FeaturedTopics heading="Featured topics" topics={TOPICS} />;
}
