import Link from "next/link";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";

import TrustBand from "@/components/marketing/TrustBand";
import { getCuratedFundraiserImages } from "@/lib/fundraiser-data";

/**
 * Fundraisers trust band. Both inline links are real destinations:
 *  - /reviews : the Platform Reviews page (also used in FeaturedTopics).
 *  - #faq     : in-page FAQ anchor (placeholder — FAQ isn't built yet; the
 *               future FAQ section must carry id="faq", per the project note).
 *
 * Right column: a real, warm campaign photo from the same verified curated Hero
 * pool (getCuratedFundraiserImages). Of that pool, this is the only genuine
 * person/moment photo — MAREA is a promo poster and "we-can-do-it" is a video —
 * so it necessarily reuses the Hero's primary image. If the fetch ever returns
 * nothing, it degrades to a branded ShieldCheck tile rather than stock imagery.
 */
const TRUST_IMAGE_SLUG =
  "donate-to-supporting-miracle-amiris-recovery-and-rebuilding-organized-by-destiny-keith";

export default async function TrustSection() {
  const [trustImage] = await getCuratedFundraiserImages([TRUST_IMAGE_SLUG]);

  const media = trustImage ? (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl shadow-xl ring-1 ring-white/10">
      <Image
        src={trustImage}
        alt="A parent and child sharing a joyful moment outdoors"
        fill
        sizes="(max-width: 1024px) 100vw, 40vw"
        className="object-cover"
      />
    </div>
  ) : (
    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white/85 shadow-xl ring-1 ring-white/10">
      <ShieldCheck className="h-24 w-24" />
    </div>
  );

  return (
    <TrustBand
      pill="Safe and secure"
      headlineLines={["Every contribution is protected,", "start to finish."]}
      media={media}
    >
      There&apos;s no platform fee to start a campaign, and every donation runs
      through Stripe-secured, encrypted checkout — so supporters can give in
      seconds and you can stay focused on your cause. See what organizers say in
      our <Link href="/reviews">real reviews</Link>, or find{" "}
      <Link href="#faq">answers to common questions</Link> before you begin.
    </TrustBand>
  );
}
