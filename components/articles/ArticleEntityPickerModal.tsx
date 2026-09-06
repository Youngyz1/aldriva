"use client";

import React, { useState } from "react";
import { Search, Loader2, X, HandHeart, Calendar, Building2, Plus } from "lucide-react";

export type AldrivaEntityResult = {
  type: "fundraiser" | "event" | "organization";
  id: string;
  title: string;
  slug: string;
  subtitle?: string;
  imageUrl?: string | null;
};

interface ArticleEntityPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEntity: (entity: AldrivaEntityResult) => void;
}

export default function ArticleEntityPickerModal({
  isOpen,
  onClose,
  onSelectEntity,
}: ArticleEntityPickerModalProps) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "fundraiser" | "event" | "organization">("all");
  const [results, setResults] = useState<AldrivaEntityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  if (!isOpen) return null;

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);

    try {
      const res = await fetch(`/api/articles/entities?q=${encodeURIComponent(query.trim())}&type=${typeFilter}`);
      const data = await res.json();
      setResults(data.entities || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl bg-white shadow-2xl border border-zinc-100 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-150 bg-zinc-50/80 px-6 py-4">
          <div>
            <h2 className="text-base font-black text-zinc-900">Reference Aldriva Entity</h2>
            <p className="text-xs font-semibold text-zinc-500">
              Embed a live Campaign, Event, or Organization card directly into your article.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search & Filters */}
        <div className="border-b border-zinc-150 p-6 space-y-3">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-400" />
              <input
                type="search"
                placeholder="Search active campaigns, approved events, or verified organizations..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50 pl-10 pr-4 py-2.5 text-sm font-semibold outline-none focus:border-orange-500 focus:bg-white"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white hover:bg-orange-700 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
            </button>
          </form>

          {/* Type Filters */}
          <div className="flex gap-2">
            {[
              { id: "all", label: "All Types" },
              { id: "fundraiser", label: "Campaigns" },
              { id: "event", label: "Events" },
              { id: "organization", label: "Organizations" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id as any)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  typeFilter === t.id
                    ? "bg-orange-100 text-orange-800"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin text-orange-600 mb-2" />
              <p className="text-xs font-bold">Searching platform records...</p>
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              {results.map((entity) => (
                <div
                  key={`${entity.type}-${entity.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 hover:border-orange-200 hover:shadow-md transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
                      {entity.type === "fundraiser" && <HandHeart className="h-5 w-5" />}
                      {entity.type === "event" && <Calendar className="h-5 w-5" />}
                      {entity.type === "organization" && <Building2 className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-zinc-600">
                          {entity.type}
                        </span>
                        <h4 className="font-black text-sm text-zinc-900 truncate">{entity.title}</h4>
                      </div>
                      <p className="text-xs text-zinc-500 font-semibold truncate mt-0.5">
                        {entity.subtitle}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectEntity(entity);
                      onClose();
                    }}
                    className="flex items-center gap-1 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-black text-white hover:bg-orange-700 transition shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" /> Embed
                  </button>
                </div>
              ))}
            </div>
          ) : hasSearched ? (
            <div className="py-12 text-center text-zinc-400">
              <p className="text-sm font-bold">No matching records found.</p>
              <p className="text-xs mt-1">Try a different search term or filter.</p>
            </div>
          ) : (
            <div className="py-12 text-center text-zinc-400">
              <p className="text-sm font-bold">Type a name to find Aldriva entities.</p>
              <p className="text-xs mt-1">Embed live cards for fundraisers, upcoming events, or organizations.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
