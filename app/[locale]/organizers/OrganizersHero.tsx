import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { HOMEPAGE_SETTING_KEYS, getHomepageSettings } from "@/lib/homepage-hero";
import { cacheLife } from "next/cache";

// CMS hero copy + the three site-wide stats shown in the hero band
// (verified organizer count, events hosted, community raised) — same for
// every visitor regardless of filters, so this is part of the static
// shell rather than a per-request Suspense hole.
async function getOrganizersPageCmsAndStats() {
  "use cache";
  cacheLife({ revalidate: 300 });

  const adminClient = createSupabaseAdmin();
  const [
    { data: cmsRows },
    { count: verifiedCount },
    { count: hostedCount },
    { data: raisedData },
  ] = await Promise.all([
    adminClient.from("platform_settings").select("key, value").in("key", HOMEPAGE_SETTING_KEYS),
    adminClient
      .from("organizers")
      .select("id", { count: "exact", head: true })
      .eq("status", "verified")
      .eq("visibility", "public")
      .is("deleted_at", null),
    adminClient
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("visibility", "public")
      .eq("status", "approved")
      .is("deleted_at", null),
    adminClient
      .from("fundraisers")
      .select("raised")
      .eq("status", "published")
      .is("deleted_at", null),
  ]);

  const cms = getHomepageSettings(cmsRows);
  const totalVerifiedOrganizers = verifiedCount ?? 0;
  const totalEventsHosted = hostedCount ?? 0;
  const totalCommunityRaised =
    raisedData?.reduce((sum, f) => sum + Number(f.raised || 0), 0) || 0;

  return { cms, totalVerifiedOrganizers, totalEventsHosted, totalCommunityRaised };
}

function money(value: number) {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function OrganizersHero() {
  const { cms, totalVerifiedOrganizers, totalEventsHosted, totalCommunityRaised } =
    await getOrganizersPageCmsAndStats();

  return (
    <section
      className="relative flex min-h-[360px] items-center justify-center bg-cover bg-center px-4 py-16 text-center sm:min-h-[420px] sm:px-12 sm:py-20 lg:min-h-[460px]"
      style={{
        backgroundImage: `url("${cms.organizersHeroImageUrl || cms.imageUrl}")`,
      }}
    >
      <div className="absolute inset-0 bg-black/65" />
      <div className="relative w-full max-w-4xl text-white">
        <span className="inline-block rounded-full bg-violet-600/30 border border-violet-500/40 px-4 py-1.5 text-xs font-black uppercase tracking-widest text-violet-300 backdrop-blur-sm">
          {cms.organizersHeroEyebrow}
        </span>
        <h1 className="mt-6 text-4xl font-black leading-tight tracking-tight sm:text-5xl lg:text-6xl">
          {cms.organizersHeroHeadlineLine1}
          {cms.organizersHeroHeadlineLine2 && (
            <>
              <br />
              <span className="text-violet-400">{cms.organizersHeroHeadlineLine2}</span>
            </>
          )}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-300 sm:text-lg">
          {cms.organizersHeroDescription}
        </p>

        {/* Dynamic statistics — cached alongside the CMS copy above. */}
        <div className="mx-auto mt-8 flex max-w-md flex-wrap justify-center gap-x-6 gap-y-2 border-t border-white/10 pt-6 text-xs font-bold text-zinc-400 sm:text-sm">
          <span>{totalVerifiedOrganizers.toLocaleString()} Organizations</span>
          <span>•</span>
          <span>{totalEventsHosted.toLocaleString()} Events Hosted</span>
          <span>•</span>
          <span>{money(totalCommunityRaised)} Community Raised</span>
        </div>
      </div>
    </section>
  );
}
