"use client";

import { useEffect, useState } from "react";
import StarRating from "@/components/StarRating";

type ReviewRow = {
  id: string;
  rating: number;
  title: string | null;
  review: string | null;
  is_approved: boolean;
  is_verified: boolean;
  created_at: string;
  user_id: string;
  event_id: string | null;
  fundraiser_id: string | null;
  organizer_id: string | null;
  review_type?: string | null;
  profiles?: { display_name: string | null } | null;
  events?: { title: string } | null;
  fundraisers?: { title: string } | null;
  organizers?: { name: string } | null;
};

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "approved" | "hidden">("all");

  useEffect(() => {
    setLoading(true);
    const url = statusFilter === "all" ? "/api/admin/reviews" : `/api/admin/reviews?status=${statusFilter}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setReviews(d.reviews ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load reviews.");
        setLoading(false);
      });
  }, [statusFilter]);

  async function handleModerate(id: string, action: "approve" | "hide") {
    setWorking(id);
    setError("");
    const res = await fetch(`/api/admin/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (res.ok) {
      const updated = await res.json();
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, is_approved: updated.review.is_approved } : r))
      );
    } else {
      const d = await res.json();
      setError(d.error ?? "Moderation failed.");
    }
    setWorking(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Permanently delete this review? This cannot be undone.")) return;
    setWorking(id);
    setError("");
    const res = await fetch(`/api/admin/reviews/${id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setReviews((prev) => prev.filter((r) => r.id !== id));
    } else {
      const d = await res.json();
      setError(d.error ?? "Deletion failed.");
    }
    setWorking(null);
  }

  function getTargetName(r: ReviewRow) {
    if (r.review_type === "platform" || (!r.event_id && !r.fundraiser_id && !r.organizer_id)) {
      return "Platform Review";
    }
    if (r.events) return `Event: ${r.events.title}`;
    if (r.fundraisers) return `Campaign: ${r.fundraisers.title}`;
    if (r.organizers) return `Organization: ${r.organizers.name}`;
    return "Platform Review";
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Reviews</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">Moderate and manage platform reviews.</p>
      </header>

      <div className="flex gap-2">
        {(["all", "approved", "hidden"] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setStatusFilter(filter)}
            className={`rounded-xl px-4 py-2 text-xs font-black capitalize transition ${
              statusFilter === filter
                ? "bg-slate-900 text-white"
                : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-zinc-200 text-xs font-black uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="py-3 pr-4">Reviewer</th>
                  <th className="py-3 pr-4">Target</th>
                  <th className="py-3 pr-4">Rating</th>
                  <th className="py-3 pr-4">Content</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 pr-4 font-semibold max-w-[150px] truncate">
                      {r.profiles?.display_name || "Anonymous"}
                      <p className="text-[10px] font-normal text-zinc-400 truncate">{r.user_id}</p>
                    </td>
                    <td className="py-3 pr-4 text-zinc-500 max-w-[200px] truncate">
                      {getTargetName(r)}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-1">
                        <StarRating value={r.rating} size={14} />
                        <span className="text-xs font-bold text-zinc-600">({r.rating})</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 max-w-[250px]">
                      {r.title && <p className="font-bold text-zinc-950 truncate">{r.title}</p>}
                      {r.review && <p className="text-zinc-600 line-clamp-2 text-xs">{r.review}</p>}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${
                          r.is_approved ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                        }`}
                      >
                        {r.is_approved ? "Approved" : "Hidden"}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {r.is_approved ? (
                          <button
                            disabled={working === r.id}
                            onClick={() => handleModerate(r.id, "hide")}
                            className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            Hide
                          </button>
                        ) : (
                          <button
                            disabled={working === r.id}
                            onClick={() => handleModerate(r.id, "approve")}
                            className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          disabled={working === r.id}
                          onClick={() => handleDelete(r.id)}
                          className="rounded-lg border border-red-300 bg-red-600 px-2.5 py-1.5 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {reviews.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-sm text-zinc-400">
                      No reviews found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
