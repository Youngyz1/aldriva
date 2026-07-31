"use client";

import { useEffect, useRef, useState } from "react";

export type AddressAutocompleteResult = {
  displayName: string;
  lat: number;
  lng: number;
  city: string;
  region: string;
  country: string;
};

type SearchResponse = {
  results?: AddressAutocompleteResult[];
  error?: string;
};

type Props = {
  inputClassName?: string;
  placeholder?: string;
  onSelect: (result: AddressAutocompleteResult) => void;
};

export default function AddressAutocomplete({
  inputClassName,
  placeholder = "Search an address or venue",
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressAutocompleteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const latestQuery = useRef("");

  useEffect(() => {
    const trimmed = query.trim();
    latestQuery.current = trimmed;

    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      setOpen(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/geocode/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as SearchResponse;

        if (latestQuery.current !== trimmed) return;

        if (!response.ok) {
          setResults([]);
          setError(data.error || "Address search failed.");
          setOpen(true);
          return;
        }

        setResults(data.results || []);
        setOpen(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
        setError("Address search failed.");
        setOpen(true);
      } finally {
        if (latestQuery.current === trimmed) {
          setLoading(false);
        }
      }
    }, 400);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  function selectResult(result: AddressAutocompleteResult) {
    setQuery(result.displayName);
    setResults([]);
    setOpen(false);
    setError("");
    onSelect(result);
  }

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => {
          if (results.length > 0 || error) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      />

      {(loading || open) && (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-zinc-200 bg-white py-2 shadow-xl shadow-zinc-950/10">
          {loading && results.length === 0 && (
            <p className="px-4 py-3 text-sm font-semibold text-zinc-500">Searching...</p>
          )}

          {!loading && error && (
            <p className="px-4 py-3 text-sm font-semibold text-red-600">{error}</p>
          )}

          {!loading && !error && results.length === 0 && (
            <p className="px-4 py-3 text-sm font-semibold text-zinc-500">No matches found.</p>
          )}

          {results.map((result) => (
            <button
              key={`${result.lat}:${result.lng}:${result.displayName}`}
              type="button"
              className="block w-full px-4 py-3 text-left hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectResult(result)}
            >
              <span className="block text-sm font-black text-zinc-900">{result.displayName.split(",")[0]}</span>
              <span className="mt-1 block text-xs font-medium text-zinc-500">{result.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
