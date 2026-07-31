"use client";

import { useState } from "react";

export default function EventPageClient({
  eventTitle,
  eventSlug,
}: {
  eventTitle: string;
  eventSlug: string;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleShare() {
    const url = `${window.location.origin}/events/${eventSlug}`;
    if (navigator.share) {
      navigator.share({ title: eventTitle, url });
    } else {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        onClick={handleShare}
        title="Share event"
        className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 transition"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        {copied ? "Copied!" : "Share"}
      </button>
      <button
        onClick={() => setSaved((s) => !s)}
        title={saved ? "Saved" : "Save event"}
        className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
          saved
            ? "border-red-200 bg-red-50 text-red-500"
            : "border-zinc-200 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
        }`}
      >
        <svg
          className="h-4 w-4"
          fill={saved ? "currentColor" : "none"}
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
        {saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}