"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type FundraiserUpdate = {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
};

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function UpdatesClient({
  fundraiserId,
  initialUpdates,
}: {
  fundraiserId: string;
  initialUpdates: FundraiserUpdate[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [updates, setUpdates] = useState(initialUpdates);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function postUpdate(event: React.FormEvent) {
    event.preventDefault();
    setNotice("");
    setError("");

    if (content.trim().length < 20) {
      setError("Update content must be at least 20 characters.");
      return;
    }

    setBusy(true);
    const response = await fetch("/api/fundraiser-updates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundraiser_id: fundraiserId,
        title,
        content,
      }),
    });

    const result = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(result.error || "Could not post update.");
      return;
    }

    setUpdates((current) => [result.update, ...current]);
    setTitle("");
    setContent("");
    setNotice("Update posted.");
    router.refresh();
  }

  async function deleteUpdate(id: string) {
    setNotice("");
    setError("");
    const response = await fetch(`/api/fundraiser-updates/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Could not delete update.");
      return;
    }

    setUpdates((current) => current.filter((update) => update.id !== id));
    setNotice("Update deleted.");
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {(notice || error) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-bold ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || notice}
        </div>
      )}

      <form onSubmit={postUpdate} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Post new update</h2>
        <div className="mt-5 space-y-4">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="Title (optional)"
            className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            required
            minLength={20}
            rows={6}
            placeholder="Share news, milestones, or next steps..."
            className="w-full resize-none rounded-xl border border-zinc-300 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:bg-emerald-300"
          >
            {busy ? "Posting..." : "Post Update"}
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">Existing updates</h2>
        {updates.length === 0 ? (
          <p className="mt-4 text-sm font-semibold text-zinc-500">No updates yet.</p>
        ) : (
          <div className="mt-5 divide-y divide-zinc-200">
            {updates.map((update) => (
              <article key={update.id} className="flex gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-wide text-zinc-400">
                    {dateLabel(update.created_at)}
                  </p>
                  <h3 className="mt-1 truncate text-base font-black text-zinc-950">
                    {update.title || "Untitled update"}
                  </h3>
                  <p className="mt-2 line-clamp-2 text-sm font-medium leading-6 text-zinc-600">
                    {update.content}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteUpdate(update.id)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600 transition hover:bg-red-50"
                  aria-label="Delete update"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
