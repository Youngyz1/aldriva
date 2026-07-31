"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function LocationSearch() {
  const router = useRouter();
  const [userLocation, setUserLocation] = useState<{ city: string; state: string } | null>(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [searchQuery, setSearchQuery] = useState('');
  const [cityResults, setCityResults] = useState<{ city: string }[]>([]);
  const mountedRef = useRef(false);

  const detectLocation = () => {
    if (!mountedRef.current) return;
    if (!navigator.geolocation) { setLocationStatus('denied'); return; }
    setLocationStatus('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (!mountedRef.current) return;
        try {
          const response = await fetch(`/api/geocode?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`);
          if (!mountedRef.current) return;
          if (response.ok) {
            const data = await response.json();
            if (!mountedRef.current) return;
            setUserLocation(data);
            setLocationStatus('granted');
          }
          else setLocationStatus('denied');
        } catch {
          if (mountedRef.current) setLocationStatus('denied');
        }
      },
      () => {
        if (mountedRef.current) setLocationStatus('denied');
      },
      { timeout: 10000 }
    );
  };

  useEffect(() => {
    mountedRef.current = true;
    // Defer calling detectLocation to avoid synchronous setState inside the effect
    const t = setTimeout(() => detectLocation(), 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const searchCities = async () => {
      if (searchQuery.length < 2) { setCityResults([]); return; }
      try {
        const response = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery)}`);
        if (response.ok) {
          const results = await response.json();
          if (active) setCityResults(results);
        }
      } catch (e) { console.error(e); }
    };
    const debounce = setTimeout(searchCities, 300);
    return () => {
      active = false;
      clearTimeout(debounce);
    };
  }, [searchQuery]);

  

  return (
    <div className="relative space-y-3">
      {locationStatus === 'granted' && userLocation && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <i className="ti ti-map-pin text-lg text-blue-600" aria-hidden="true" />
            <div>
              <p className="text-xs font-black text-blue-600">Your location</p>
              <p className="truncate text-sm font-bold">{userLocation.city}, {userLocation.state}</p>
            </div>
          </div>
          <button
            onClick={() => router.push(`/events?location=${encodeURIComponent(userLocation.city)}`)}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white"
          >
            Find
          </button>
        </div>
      )}
      {locationStatus === 'loading' && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-500">
          Detecting location...
        </div>
      )}
      {locationStatus === 'denied' && (
        <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-600">
          <i className="ti ti-current-location text-base text-orange-600" aria-hidden="true" />
          Enable location or pick a city.
        </div>
      )}
      <div className="relative">
        <i className="ti ti-map-pin-search absolute left-3 top-1/2 -translate-y-1/2 text-lg text-zinc-400" aria-hidden="true" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search city"
          className="w-full rounded-xl border border-zinc-200 px-10 py-3 text-sm font-semibold outline-none focus:border-orange-500"
        />
      </div>
      {cityResults.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg">
          {cityResults.map((c, i) => (
            <button
              key={i}
              onClick={() => router.push(`/events?location=${encodeURIComponent(c.city)}`)}
              className="block w-full px-4 py-3 text-left text-sm font-bold hover:bg-orange-50"
            >
              {c.city}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {['New York', 'Los Angeles', 'Chicago', 'Miami', 'Boston'].map(city => (
          <button
            key={city}
            onClick={() => router.push(`/events?location=${encodeURIComponent(city)}`)}
            className="shrink-0 rounded-full bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-800 hover:bg-orange-100 hover:text-orange-700"
          >
            {city}
          </button>
        ))}
      </div>
    </div>
  );
}
