"use client";

import PublicSearchBar from "@/components/public/PublicSearchBar";

export default function HomepageHeroSearch() {
  return (
    <div className="relative z-10 mt-6 max-w-2xl sm:mt-8">
      <PublicSearchBar
        action="/search"
        placeholder="Search events, fundraisers, organizers…"
        showLocation
        size="lg"
        className="rounded-2xl bg-white/95 p-2 shadow-xl shadow-black/20 backdrop-blur-sm sm:p-2.5"
      />
    </div>
  );
}
