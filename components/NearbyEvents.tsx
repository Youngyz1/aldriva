"use client";

import { useState, useEffect, useRef } from "react";
import EventCard from "@/components/EventCard";
import Link from "next/link";

type TMEvent = {
  id: string;
  slug: null;
  title: string;
  event_date: string | null;
  city: string;
  banner: string | null;
  url: string;
  source: "ticketmaster";
};

type LocationStatus = "detecting" | "granted" | "denied" | "idle";

export default function NearbyEvents() {
  const [events, setEvents] = useState<TMEvent[]>([]);
  const [city, setCity] = useState<string | null>(null);
  const [status, setStatus] = useState<LocationStatus>("idle");
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    const timeout = window.setTimeout(() => {
      detectAndFetch();
    }, 0);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(timeout);
    };
  }, []);

  async function detectAndFetch() {
    if (!mountedRef.current) return;
    setStatus("detecting");

    // Step 1 — try browser geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (!mountedRef.current) return;
          try {
            const res = await fetch(
              `/api/geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`
            );
            if (!mountedRef.current) return;
            if (res.ok) {
              const data = await res.json();
              if (!mountedRef.current) return;
              const detectedCity = `${data.city}, ${data.state}`;
              setCity(detectedCity);
              setStatus("granted");
              fetchEvents(detectedCity);
            } else {
              fallbackToIP();
            }
          } catch {
            fallbackToIP();
          }
        },
        () => fallbackToIP(),
        { timeout: 8000 }
      );
    } else {
      fallbackToIP();
    }
  }

  async function fallbackToIP() {
    if (!mountedRef.current) return;
    try {
      // Use https://ipwho.is/ as a free, HTTPS-compatible geolocation fallback
      const res = await fetch("https://ipwho.is/");
      if (!mountedRef.current) return;
      const data = await res.json();
      if (!mountedRef.current) return;
      if (data.success && data.city) {
        const detectedCity = `${data.city}, ${data.region}`;
        setCity(detectedCity);
        setStatus("granted");
        fetchEvents(detectedCity);
      } else {
        setStatus("denied");
      }
    } catch {
      if (mountedRef.current) setStatus("denied");
    }
  }

  async function fetchEvents(location: string) {
    if (!mountedRef.current) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/eventbrite?location=${encodeURIComponent(location)}`
      );
      if (!mountedRef.current) return;
      const data = await res.json();
      if (!mountedRef.current) return;
      setEvents(data.events || []);
    } catch {
      if (mountedRef.current) setEvents([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }

  // Skeleton loader
  if (status === "detecting" || (status === "granted" && loading)) {
    return (
      <section className="mx-auto max-w-7xl px-3 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex items-center justify-between sm:mb-10">
          <div>
            <div className="h-4 w-24 bg-zinc-200 rounded animate-pulse mb-2" />
            <div className="h-8 w-64 bg-zinc-200 rounded animate-pulse" />
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-zinc-100 rounded-2xl overflow-hidden animate-pulse">
              <div className="h-36 bg-zinc-200 sm:h-56" />
              <div className="p-5 space-y-3">
                <div className="h-3 w-24 bg-zinc-300 rounded" />
                <div className="h-5 w-full bg-zinc-300 rounded" />
                <div className="h-3 w-32 bg-zinc-300 rounded" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Denied — show city picker
  if (status === "denied") {
    const suggestedCities = [
      "New York, NY", "Los Angeles, CA", "Chicago, IL",
      "Houston, TX", "Miami, FL", "Atlanta, GA",
    ];
    return (
      <section className="mx-auto max-w-7xl px-3 py-6 sm:px-6 sm:py-12">
        <div className="mb-4 rounded-2xl border border-orange-100 bg-orange-50 p-4 sm:mb-8 sm:bg-transparent sm:p-0 sm:border-0">
          <p className="text-sm font-black uppercase tracking-wide text-orange-600">Events</p>
          <h2 className="mt-1 text-2xl font-black sm:text-4xl">More Events Near You</h2>
          <p className="mt-1 text-sm text-zinc-600 sm:mt-2 sm:text-base">Pick a city to load more nearby listings.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide sm:flex-wrap sm:gap-3">
          {suggestedCities.map((c) => (
            <button
              key={c}
              onClick={() => {
                setCity(c);
                setStatus("granted");
                fetchEvents(c);
              }}
              className="shrink-0 rounded-full bg-zinc-100 px-4 py-2 text-xs font-black transition hover:bg-orange-100 hover:text-orange-600 sm:px-5 sm:py-2.5 sm:text-sm"
            >
              {c}
            </button>
          ))}
        </div>
      </section>
    );
  }

  // Events loaded
  if (status === "granted" && !loading) {
    return (
      <section className="mx-auto max-w-7xl px-3 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex items-center justify-between sm:mb-10">
          <div>
            <p className="text-sm font-black uppercase tracking-wide text-orange-600">Near You</p>
            <h2 className="mt-1 text-2xl font-black sm:text-4xl">
              Events in {city?.split(",")[0]}
            </h2>
            <p className="text-sm text-zinc-500 mt-1">
            </p>
          </div>
          <Link
            href={`/events?location=${encodeURIComponent(city || "")}`}
            className="text-orange-500 font-semibold hover:text-orange-600 text-sm"
          >
            View all →
          </Link>
        </div>

        {events.length > 0 ? (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-8">
            {events.slice(0, 6).map((e) => (
              <a key={e.id} href={e.url} target="_blank" rel="noopener noreferrer" className="block">
                <EventCard
                  slug={null}
                  title={e.title}
                  date={
                    e.event_date
                      ? new Date(e.event_date).toLocaleDateString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                        })
                      : "Date TBA"
                  }
                  eventDate={e.event_date}
                  location={e.city || city || ""}
                  image={
                    e.banner ||
                    "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop"
                  }
                  badge="Ticketmaster"
                />
              </a>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 px-8 py-12 text-center">
            <p className="text-3xl mb-3">🎭</p>
            <p className="font-bold text-lg">No upcoming events found in {city?.split(",")[0]}</p>
            <p className="text-zinc-500 mt-1 text-sm">Try searching a nearby city</p>
            <Link
              href="/events"
              className="mt-4 inline-block bg-orange-500 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-600 transition"
            >
              Browse All Events
            </Link>
          </div>
        )}
      </section>
    );
  }

  return null;
}
