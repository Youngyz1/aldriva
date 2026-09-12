"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Ticket } from "lucide-react";

/**
 * Standalone search section on /events, directly below the marketing hero.
 * Wires to the same endpoint as the nav-bar search (`/search?q=…`) rather
 * than a second search system. Find Tickets sits beside it as a secondary
 * action linking to the existing /find-tickets route.
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form
        onSubmit={onSubmit}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-zinc-200 bg-white p-2 pl-5 shadow-md shadow-zinc-200/60"
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
      <Link
        href="/find-tickets"
        className="flex shrink-0 items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-5 py-3 text-sm font-black text-zinc-900 shadow-md shadow-zinc-200/60 transition hover:border-orange-500 hover:text-orange-600 sm:w-auto sm:px-6"
      >
        <Ticket className="h-4 w-4 shrink-0" />
        Find Tickets
      </Link>
    </div>
  );
}
