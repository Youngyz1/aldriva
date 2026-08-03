import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { HOMEPAGE_SETTING_KEYS, getHomepageSettings } from "@/lib/homepage-hero";
import Link from "next/link";
import { cacheLife } from "next/cache";

async function getEventsPageCmsAndStats() {
  "use cache";
  cacheLife({ revalidate: 300 });

  const adminClient = createSupabaseAdmin();
  const [
    { data: cmsRows },
    { count: totalEventsCount },
    { data: ticketSalesData },
    { count: activeOrganizersCount }
  ] = await Promise.all([
    adminClient.from("platform_settings").select("key, value").in("key", HOMEPAGE_SETTING_KEYS),
    adminClient.from("events").select("id", { count: "exact", head: true }).eq("visibility", "public").eq("status", "approved"),
    adminClient.from("ticket_orders").select("quantity").in("status", ["valid", "used"]),
    adminClient.from("organizers").select("id", { count: "exact", head: true }).eq("visibility", "public")
  ]);

  const cms = getHomepageSettings(cmsRows);
  const totalEvents = totalEventsCount ?? 0;
  const ticketsSold = ticketSalesData?.reduce((sum, order) => sum + (order.quantity || 0), 0) || 0;
  const activeOrganizers = activeOrganizersCount ?? 0;

  return { cms, totalEvents, ticketsSold, activeOrganizers };
}

/**
 * "Sell Tickets. Organize Event" image banner — homepage-only branding
 * (app/events/page.tsx passes showHero, city pages don't). CMS-sourced, same
 * for every visitor, so this is part of the static shell (`'use cache'`
 * above) rather than a per-request Suspense hole.
 */
export default async function EventsHero() {
  const { cms } = await getEventsPageCmsAndStats();

  return (
    <section className="bg-white px-3 pt-3 sm:px-6 sm:pt-6 lg:px-8">
      <div
        className="relative mx-auto flex aspect-[4/3] max-w-7xl items-end overflow-hidden rounded-xl bg-cover bg-center px-4 py-6 sm:aspect-[16/7] sm:items-center sm:rounded-sm sm:px-12 sm:py-16 lg:aspect-[16/5] lg:rounded-b-lg lg:px-20"
        style={{
          backgroundImage: `url("${cms.eventsHeroImageUrl.replaceAll('"', "")}")`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10 sm:from-black/85 sm:via-black/48 sm:to-black/15" />
        <div className="relative w-full max-w-full sm:max-w-3xl">
          <p className="text-xs font-black uppercase tracking-wide text-white drop-shadow sm:text-sm">
            {cms.eventsHeroEyebrow}
          </p>
          <h1 className="mt-2 max-w-full text-2xl font-black leading-[1.1] tracking-tight text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.65)] sm:mt-3 sm:text-4xl md:text-5xl lg:text-6xl">
            {cms.eventsHeroHeadlineLine1}
            {cms.eventsHeroHeadlineLine2 && (
              <>
                <br />
                <span className="text-orange-400">{cms.eventsHeroHeadlineLine2}</span>
              </>
            )}
          </h1>
          <div className="relative z-10 mt-4 flex flex-wrap gap-3 sm:mt-6">
            <Link
              href="/events"
              className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-black text-zinc-950 transition hover:bg-orange-50 sm:px-7 sm:py-3 sm:text-base shadow-lg shadow-black/20"
            >
              Browse Events
            </Link>
            <Link
              href="/create-event"
              className="inline-flex rounded-full border border-white/80 bg-white/10 px-5 py-2.5 text-sm font-black text-white backdrop-blur transition hover:bg-white/20 sm:px-7 sm:py-3 sm:text-base"
            >
              Create Event
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
