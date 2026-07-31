"use client";

import { useState } from "react";

export default function FundraiserCommentForm({
  fundraiserId,
}: {
  fundraiserId: string;
}) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    const body = message.trim();
    if (!body) return;

    setSubmitting(true);
    setError("");

    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        targetId: fundraiserId,
        targetType: "fundraiser",
        authorName: name.trim() || "Anonymous",
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Could not post your comment.");
      setSubmitting(false);
      return;
    }

    setMessage("");
    setName("");
    setSuccess(true);
    setSubmitting(false);
    setTimeout(() => setSuccess(false), 4000);
  }

  return (
    <div className="mt-4 space-y-3 w-full max-w-full min-w-0">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name (optional)"
        className="w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-base md:text-sm outline-none focus:border-emerald-500"
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, 150))}
        maxLength={150}
        rows={4}
        placeholder="Leave a word of support..."
        className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base md:text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-emerald-500"
      />
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{message.length}/150</span>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !message.trim()}
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:bg-emerald-300"
        >
          {submitting ? "Posting..." : "Post support"}
        </button>
      </div>
      {success && (
        <p className="text-sm font-semibold text-emerald-600">
          ✓ Your support has been posted!
        </p>
      )}
      {error && (
        <p className="text-sm font-semibold text-red-600">{error}</p>
      )}
    </div>
  );
}