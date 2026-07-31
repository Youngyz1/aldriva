
import type { Metadata } from "next";
import EventCard from "@/components/EventCard";
import ExternalEventCard, { ExternalSourceCredit } from "@/components/events/ExternalEventCard";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { searchExternalEvents } from "@/lib/external-events";

// Live external results are fetched per request and cached for 5 minutes inside
// the lib; revalidate the page on the same cadence so a statically-rendered city
// page never serves stale (or build-frozen) external data.
export const revalidate = 300;

// Generate static params for known cities
export async function generateStaticParams() {
  const cities = [
    "Newark", "Jersey City", "Montclair", "Hoboken", "Atlantic City",
    "Princeton", "Trenton", "Asbury Park", "Morristown", "New Brunswick",
    "Philadelphia", "Wilmington", "New York", "Los Angeles", "Chicago",
    "Miami", "Boston", "Atlanta", "San Francisco"
  ];
  
  return cities.map((city) => ({ city }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city } = await params;
  const cityName = decodeURIComponent(city)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const title = `Things to Do in ${cityName} — Aldriva`;
  const description = `Discover events, fundraisers, and community gatherings in ${cityName}.`;

  return {
    metadataBase: new URL("https://www.fund4agoodcause.com"),
    title,
    description,
    alternates: {
      canonical: `https://www.fund4agoodcause.com/things-to-do/${city}`,
    },
    openGraph: {
      title,
      description,
      url: `https://www.fund4agoodcause.com/things-to-do/${city}`,
      siteName: "Aldriva",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: ["/og-image.png"] },
  };
}

export default async function ThingsToDoPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const { city } = await params;
  const decodedCity = decodeURIComponent(city);

  // Fetch events in this city
  const { data: events } = await supabase
    .from("events")
    .select("*")
    .ilike("city", `%${decodedCity}%`)
    .order("event_date", { ascending: true })
    .limit(20);

  // Live external events happening in this city (Ticketmaster + SeatGeek).
  // Fetched per view, never stored; cap the block at 9.
  const externalEvents = (await searchExternalEvents({ location: decodedCity })).slice(0, 9);

  // Attraction categories to show
  const attractionCategories = [
    { name: "Museums & Galleries", emoji: "🎨", query: `museums in ${decodedCity}` },
    { name: "Parks & Nature", emoji: "🌳", query: `parks in ${decodedCity}` },
    { name: "Food & Dining", emoji: "🍽️", query: `restaurants in ${decodedCity}` },
    { name: "Nightlife", emoji: "🌙", query: `nightlife in ${decodedCity}` },
    { name: "Shopping", emoji: "🛍️", query: `shopping in ${decodedCity}` },
    { name: "Sports & Recreation", emoji: "⚽", query: `sports in ${decodedCity}` },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
       

      <section className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <Link 
            href="/" 
            className="text-blue-200 hover:text-white font-medium mb-4 inline-flex items-center gap-2"
          >
            ← Back to home
          </Link>
          <h1 className="text-5xl font-black mt-2">
            Things to do in {decodedCity}
          </h1>
          <p className="text-xl text-blue-100 mt-4 max-w-2xl">
            Discover events, attractions, and activities in {decodedCity}.
          </p>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-black mb-6">Explore by category</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {attractionCategories.map((cat) => (
            <Link
              key={cat.name}
              href={`/events?location=${encodeURIComponent(decodedCity)}&category=${encodeURIComponent(cat.name)}`}
              className="bg-white rounded-xl p-6 text-center shadow-sm border border-zinc-200 hover:border-orange-500 hover:shadow-md transition"
            >
              <div className="text-4xl mb-3">{cat.emoji}</div>
              <p className="font-bold text-zinc-900 text-sm">{cat.name}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Events in this city */}
      <section className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black">📅 Upcoming Events in {decodedCity}</h2>
          <Link 
            href={`/events?location=${encodeURIComponent(decodedCity)}`}
            className="text-orange-500 font-semibold hover:text-orange-600"
          >
            View all events →
          </Link>
        </div>

        {events && events.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {events.slice(0, 6).map((event) => (
              <EventCard
                key={event.id}
                slug={event.slug}
                title={event.title}
                date={event.event_date
                  ? new Date(event.event_date).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })
                  : "Date TBA"}
                eventDate={event.event_date}
                location={event.city || event.venue || "Location TBA"}
                image={
                  event.banner ||
                  "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop"
                }
              />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-zinc-300 p-12 text-center">
            <p className="text-4xl mb-4">🎭</p>
            <h3 className="text-xl font-black">No events found in {decodedCity}</h3>
            <p className="text-zinc-500 mt-2">
              Be the first to <Link href="/create-event" className="text-orange-500 font-semibold hover:underline">create an event</Link> in this city!
            </p>
          </div>
        )}
      </section>

      {/* Live external events happening in this city */}
      {externalEvents.length > 0 && (
        <section className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-6">
            <p className="text-xs font-black uppercase tracking-wider text-orange-500">Beyond Aldriva</p>
            <h2 className="text-2xl font-black mt-1">🎟️ Happening in {decodedCity}</h2>
            <p className="text-sm font-medium text-zinc-500 mt-1">
              Live from other platforms — tickets are sold on the source site.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {externalEvents.map((event) => (
              <ExternalEventCard key={event.id} event={event} />
            ))}
          </div>
          <ExternalSourceCredit sources={externalEvents.map((e) => e.source)} />
        </section>
      )}

      {/* More things to do - external suggestions */}
      <section className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-2xl font-black mb-6">🔍 Quick search</h2>
          <p className="text-zinc-600 mb-6">
            Looking for something specific? Search our events database:
          </p>
          
          <form action="/events" className="flex gap-4">
            <input 
              type="hidden" 
              name="location" 
              value={decodedCity} 
            />
            <input
              name="q"
              type="text"
              placeholder="Search events, activities..."
              className="flex-1 border border-zinc-200 rounded-xl px-4 py-3 outline-none focus:border-orange-500"
            />
            <button className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold transition">
              Search
            </button>
          </form>

          <div className="mt-10 grid md:grid-cols-2 gap-6">
            <a
              href={`https://www.google.com/maps/search/attractions+in+${encodeURIComponent(decodedCity)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-6 bg-blue-50 rounded-xl hover:bg-blue-100 transition"
            >
              <span className="text-3xl">🗺️</span>
              <div>
                <p className="font-bold text-zinc-900">View on Google Maps</p>
                <p className="text-sm text-zinc-600">Find attractions and places near {decodedCity}</p>
              </div>
            </a>
            <a
              href={`https://www.google.com/search?hl=en&q=things+to+do+in+${encodeURIComponent(decodedCity)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-6 bg-green-50 rounded-xl hover:bg-green-100 transition"
            >
              <span className="text-3xl">🔎</span>
              <div>
                <p className="font-bold text-zinc-900">Google Search</p>
                <p className="text-sm text-zinc-600">More things to do in {decodedCity}</p>
              </div>
            </a>
          </div>
        </div>
      </section>

    </main>
  );
}
