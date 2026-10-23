"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconSearch as Search } from "@tabler/icons-react";

export default function ArticlesSearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/articles?q=${encodeURIComponent(trimmed)}#latest-articles` : "/articles#latest-articles");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-2.5 sm:flex-row"
    >
      <div className="relative flex-1">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search articles"
          placeholder="Search stories, topics, or authors..."
          className="h-12 w-full rounded-xl border border-zinc-200 bg-white pl-12 pr-4 text-sm font-semibold text-zinc-950 outline-none placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-orange-500 sm:h-11"
        />
      </div>
      <button
        type="submit"
        className="btn-ripple inline-flex h-12 items-center justify-center rounded-full bg-orange-600 px-7 text-sm font-black text-white transition hover:bg-orange-700 active:scale-[0.98] sm:h-11"
      >
        Search
      </button>
    </form>
  );
}
