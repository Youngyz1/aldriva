"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/**
 * Standalone search section on /events, directly below the marketing hero.
 * Wires to the same endpoint as the nav-bar search (`/search?q=…`) rather
 * than a second search system.
 */
export default function EventsHeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white p-2 pl-5 shadow-md shadow-zinc-200/60"
    >
      <Search className="h-5 w-5 shrink-0 text-zinc-400" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search events, categories, or organizers"
        aria-label="Search events, categories, or organizers"
        className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-zinc-900 outline-none placeholder:text-zinc-400 sm:text-base"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-orange-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-orange-700 sm:px-6"
      >
        Search
      </button>
    </form>
  );
}
