import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { HOMEPAGE_SETTING_KEYS, getHomepageSettings } from "@/lib/homepage-hero";
import { getCuratedFundraiserImages } from "@/lib/fundraiser-data";
import { CURATED_HERO_FUNDRAISER_SLUGS } from "@/lib/fundraiser-hero-curation";
import { normalizeImageUrl } from "@/lib/image-url";
import { money } from "@/lib/format";
import LandingHero from "@/components/fundraisers/LandingHero";
import { cacheLife } from "next/cache";

// Hero copy — admin-managed CMS strings for the landing hero.
async function getCachedFundraisersCms() {
  "use cache";
  cacheLife({ revalidate: 300 });

  const adminClient = createSupabaseAdmin();
  const { data: cmsRows } = await adminClient
    .from("platform_settings")
    .select("key, value")
    .in("key", HOMEPAGE_SETTING_KEYS);
  return getHomepageSettings(cmsRows);
}

// Platform-wide "total raised" figure for the hero stat. Prefers the DB-side
// aggregate RPC (one number) over streaming every `raised` value to Node;
// falls back to the Node sum if the function isn't deployed yet, so the page
// stays correct before the migration is applied. Either way it's cached, so
// the aggregate/scan runs at most once per revalidate window, not per request.
async function getCachedTotalRaised() {
  "use cache";
  cacheLife({ revalidate: 300 });

  const adminClient = createSupabaseAdmin();

  const { data, error } = await adminClient.rpc("get_total_raised");
  if (!error && data != null) {
    return Number(data) || 0;
  }

  const { data: raisedData } = await adminClient
    .from("fundraisers")
    .select("raised")
    .is("deleted_at", null);
  return raisedData?.reduce((sum, f) => sum + Number(f.raised || 0), 0) || 0;
}

// Curated hero photo-fan images (fallback when no admin images are configured).
async function getCachedHeroImages() {
  "use cache";
  cacheLife({ revalidate: 600 });

  return getCuratedFundraiserImages(CURATED_HERO_FUNDRAISER_SLUGS);
}

/**
 * Fundraisers landing hero — CMS copy, platform-wide total-raised stat, and
 * hero imagery, all the same for every visitor regardless of filters. Part
 * of the static shell rather than a per-request Suspense hole.
 */
export default async function FundraisersHero() {
  const [cms, totalRaisedAmount] = await Promise.all([
    getCachedFundraisersCms(),
    getCachedTotalRaised(),
  ]);

  // Hero imagery: admin-managed via /admin/homepage → Fundraisers Landing →
  // Hero Photo Fan (stored in the `fundraisers_hero_images` platform setting).
  // When unset, fall back to the editorially-curated default set so the fan is
  // never empty pre-configuration. Order is preserved; failed URLs drop/reflow
  // client-side in LandingHeroImagery.
  const adminHeroImages = cms.fundraisersHeroImages
    .map((url) => normalizeImageUrl(url, ""))
    .filter((url): url is string => url.length > 0);
  const heroImages =
    adminHeroImages.length > 0 ? adminHeroImages : await getCachedHeroImages();

  return (
    <LandingHero
      eyebrow={cms.fundraisersHeroEyebrow}
      headline={cms.fundraisersHeroHeadlineLine1}
      headlineAccent={cms.fundraisersHeroHeadlineLine2 || undefined}
      primaryCta={{ label: "Start a Fundraiser", href: "/create-fundraiser" }}
      images={heroImages}
      benefitBadge="No platform fee to start"
      impactStatValue={money(totalRaisedAmount)}
      impactStatCaption="raised so far by people rallying behind the causes they care about."
      impactDescription="Get started in just a few minutes - with helpful new tools, it’s easier than ever to pick the perfect title, write a compelling story, and share it with the world."
    />
  );
}
