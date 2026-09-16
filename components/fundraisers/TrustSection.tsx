import Link from "next/link";
import Image from "next/image";

import TrustBand from "@/components/marketing/TrustBand";

/**
 * Fundraisers trust band. Both inline links are real destinations:
 *  - /reviews : the Platform Reviews page (also used in FeaturedTopics).
 *  - #faq     : in-page FAQ anchor (placeholder — FAQ isn't built yet; the
 *               future FAQ section must carry id="faq", per the project note).
 *
 * Right column: Donation.jpeg from public/images/Donation.jpeg — verified at
 * public/images/Donation.jpeg (capital D, case-sensitive). Replaces the
 * previous curated fundraiser photo (getCuratedFundraiserImages) per request.
 */
export default function TrustSection() {
  const media = (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl shadow-xl ring-1 ring-white/10">
      <Image
        src="/images/Donation.jpeg"
        alt="Mother and child — safe and secure donations"
        fill
        sizes="(max-width: 1024px) 100vw, 40vw"
        className="object-cover"
      />
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
