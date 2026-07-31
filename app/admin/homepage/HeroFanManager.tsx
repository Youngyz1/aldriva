"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Trash2, Plus, Upload, Search, Loader2, X } from "lucide-react";
import { useImageUpload } from "@/hooks/use-image-upload";

const MAX_IMAGES = 5;

interface Candidate {
  id: string;
  title: string;
  slug: string;
  image: string;
}

/**
 * Admin control for the /fundraisers Hero photo fan. Manages an ordered list of
 * up to 5 image URLs (reorder / remove), lets the admin add either an existing
 * campaign banner (load-verified via the candidates endpoint + onError drop) or
 * a freshly uploaded photo, and saves the list to the `fundraisers_hero_images`
 * platform setting. /fundraisers is dynamic, so saved changes show on next load.
 */
export default function HeroFanManager({ initialImages }: { initialImages: string[] }) {
  const [images, setImages] = useState<string[]>(initialImages.slice(0, MAX_IMAGES));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [brokenCandidates, setBrokenCandidates] = useState<Set<string>>(new Set());

  const atMax = images.length >= MAX_IMAGES;

  const { uploading, fileInputRef, triggerUpload, handleFileChange } = useImageUpload({
    folder: "hero-fan",
    onSuccess: (url) => addImage(url),
    onError: (text) => setMsg({ kind: "err", text }),
  });

  function addImage(url: string) {
    setMsg(null);
    setImages((prev) => {
      if (prev.includes(url) || prev.length >= MAX_IMAGES) return prev;
      return [...prev, url];
    });
  }

  function removeAt(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    setImages((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  useEffect(() => {
    if (!picking) return;
    let active = true;
    setSearching(true);
    const handle = setTimeout(() => {
      fetch(`/api/admin/homepage/hero-images/candidates?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((j) => {
          if (active) setCandidates((j.candidates as Candidate[]) ?? []);
        })
        .catch(() => {
          if (active) setCandidates([]);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [picking, query]);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/homepage/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: [{ key: "fundraisers_hero_images", value: JSON.stringify(images) }],
        }),
      });
      if (res.ok) {
        setMsg({ kind: "ok", text: "Hero photos saved. They'll appear on the next /fundraisers load." });
      } else {
        const j = await res.json().catch(() => ({}));
        setMsg({ kind: "err", text: j.error ?? "Save failed." });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-zinc-950">Hero Photo Fan</h2>
          <p className="mt-0.5 text-xs font-semibold text-zinc-500">
            Up to {MAX_IMAGES} images, in order. Empty falls back to the curated default set.
          </p>
        </div>
        <span className="text-xs font-black text-zinc-400">{images.length}/{MAX_IMAGES}</span>
      </div>

      {/* Current set */}
      {images.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-sm font-semibold text-zinc-500">
          No hero images set — the fan currently uses the curated default.
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {images.map((url, i) => (
            <li key={url} className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Hero image ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
              <span className="absolute left-1.5 top-1.5 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-black text-white">
                {i + 1}
              </span>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/60 p-1.5 opacity-0 transition group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded-md bg-white/90 p-1 text-zinc-800 disabled:opacity-40"
                  aria-label="Move left"
                >
                  <ArrowUp className="h-3.5 w-3.5 -rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1}
                  className="rounded-md bg-white/90 p-1 text-zinc-800 disabled:opacity-40"
                  aria-label="Move right"
                >
                  <ArrowDown className="h-3.5 w-3.5 -rotate-90" />
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="rounded-md bg-red-500 p-1 text-white"
                  aria-label="Remove"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add controls */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setPicking((v) => !v)}
          disabled={atMax}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-black text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> From campaigns
        </button>
        <button
          type="button"
          onClick={triggerUpload}
          disabled={atMax || uploading}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-black text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-40"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Upload photo
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {atMax && (
        <p className="mt-2 text-xs font-semibold text-amber-600">
          Maximum of {MAX_IMAGES} reached — remove one to add another.
        </p>
      )}

      {/* Campaign picker */}
      {picking && !atMax && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search campaigns by title…"
                className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold outline-none focus:border-violet-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
              aria-label="Close picker"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {searching ? (
            <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </p>
          ) : (
            <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-4">
              {candidates
                .filter((c) => !brokenCandidates.has(c.image) && !images.includes(c.image))
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addImage(c.image)}
                    className="group relative overflow-hidden rounded-lg border border-zinc-200 bg-white text-left"
                    title={c.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.image}
                      alt={c.title}
                      className="aspect-[3/4] w-full object-cover"
                      onError={() =>
                        setBrokenCandidates((prev) => new Set(prev).add(c.image))
                      }
                    />
                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1.5 py-1 text-[10px] font-bold text-white">
                      {c.title}
                    </span>
                  </button>
                ))}
              {candidates.length === 0 && (
                <p className="col-span-full py-4 text-center text-sm font-semibold text-zinc-500">
                  No campaigns with a loadable photo found.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Save */}
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Hero Photos"}
        </button>
        {msg && (
          <span
            className={`text-sm font-bold ${msg.kind === "ok" ? "text-emerald-600" : "text-red-600"}`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
