"use client";

import { FormEvent, useEffect, useState } from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { useRouter } from "next/navigation";

type LocationStatus = "idle" | "detecting" | "ready" | "manual";

export default function MobileHomepageSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<LocationStatus>("idle");

  useEffect(() => {
    if (!window.matchMedia("(max-width: 1023px)").matches) return;

    if (!navigator.geolocation) {
      setStatus("manual");
      return;
    }

    setStatus("detecting");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await fetch(
            `/api/geocode?lat=${position.coords.latitude}&lng=${position.coords.longitude}`
          );

          if (!response.ok) {
            setStatus("manual");
            return;
          }

          const data = (await response.json()) as { city?: string; state?: string };
          const detectedCity = [data.city, data.state].filter(Boolean).join(", ");

          if (detectedCity) {
            setCity(detectedCity);
            setStatus("ready");
          } else {
            setStatus("manual");
          }
        } catch {
          setStatus("manual");
        }
      },
      () => {
        setStatus("manual");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
    );
  }, []);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (city.trim()) params.set("location", city.trim());

    router.push(`/events${params.toString() ? `?${params.toString()}` : ""}`);
  }

  const cityLabel = city.trim() || "you";

  return (
    <section className="border-b border-zinc-800 bg-zinc-950 px-5 py-2 lg:hidden">
      <div className="mx-auto max-w-xl">
        <p className="mb-2 flex items-center gap-2 text-[10px] font-black text-zinc-100">
          <LocateFixed className="h-3 w-3 text-orange-600" />
          {status === "detecting" ? "Finding events near you..." : `Events near ${cityLabel}`}
        </p>

        <form onSubmit={submitSearch} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <label className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search"
              className="h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-8 pr-2 text-[10px] font-semibold text-white outline-none placeholder:text-zinc-400 focus:border-orange-500"
            />
          </label>

          <label className="relative min-w-0">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500" />
            <input
              value={city}
              onChange={(event) => {
                setCity(event.target.value);
                setStatus("manual");
              }}
              type="search"
              placeholder="City"
              className="h-8 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-8 pr-2 text-[10px] font-semibold text-white outline-none placeholder:text-zinc-400 focus:border-orange-500"
            />
          </label>

          <button
            type="submit"
            className="flex h-8 w-9 items-center justify-center rounded-xl bg-orange-600 text-white shadow-sm transition hover:bg-orange-700"
            aria-label="Search events"
          >
            <Search className="h-4 w-4" />
          </button>
        </form>
      </div>
    </section>
  );
}
