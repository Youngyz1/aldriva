/**
 * components/ReviewSection.tsx
 * Full reviews section: displays existing reviews, aggregate rating,
 * and a form allowing signed-in users to leave or edit their own review.
 *
 * Usage:
 *   <ReviewSection targetType="event" targetId={event.id} accentColor="orange" />
 *   <ReviewSection targetType="fundraiser" targetId={fundraiser.id} accentColor="green" />
 *   <ReviewSection targetType="organizer" targetId={organizer.id} accentColor="violet" />
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import StarRating from "@/components/StarRating";
import ReviewForm, { type ReviewFormValues } from "@/components/ReviewForm";
import { supabase } from "@/lib/supabase";

type ReviewTarget = "event" | "fundraiser" | "organizer" | "platform";
type AccentColor = "orange" | "violet" | "green";

interface ReviewItem {
  id: string;
  rating: number;
  title: string | null;
  review: string | null;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
  user_id: string;
}

interface ReviewSectionProps {
  targetType: ReviewTarget;
  targetId: string;
  accentColor?: AccentColor;
  /** Optional pre-loaded average / count from SSR (avoids an extra fetch). */
  initialAverage?: number;
  initialCount?: number;
}

// Query param key for each target type (excluding platform)
const paramKey: Record<Exclude<ReviewTarget, "platform">, string> = {
  event: "event_id",
  fundraiser: "fundraiser_id",
  organizer: "organizer_id",
};

// Human-readable target label
const targetLabel: Record<ReviewTarget, string> = {
  event: "event",
  fundraiser: "campaign",
  organizer: "organizer",
  platform: "platform",
};

const accentBtn: Record<AccentColor, string> = {
  orange: "bg-orange-500 hover:bg-orange-600",
  violet: "bg-violet-600 hover:bg-violet-700",
  green:  "bg-emerald-600 hover:bg-emerald-700",
};

const accentText: Record<AccentColor, string> = {
  orange: "text-orange-600",
  violet: "text-violet-600",
  green:  "text-emerald-600",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StarSummary({
  average,
  count,
  accent,
}: {
  average: number;
  count: number;
  accent: AccentColor;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-3">
      <StarRating value={average} size={18} />
      <span className={`text-sm font-black ${accentText[accent]}`}>
        {average.toFixed(1)}
      </span>
      <span className="text-sm text-zinc-500">
        ({count} {count === 1 ? "review" : "reviews"})
      </span>
    </div>
  );
}

export default function ReviewSection({
  targetType,
  targetId,
  accentColor = "violet",
  initialAverage,
  initialCount,
}: ReviewSectionProps) {
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [average, setAverage] = useState(initialAverage ?? 0);
  const [count, setCount] = useState(initialCount ?? 0);

  // Auth state
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // UI state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");

  // ── Fetch auth ──────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setAuthLoading(false);
    });
  }, []);

  // ── Fetch reviews ───────────────────────────────────────────────────────────
  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const url = targetType === "platform"
        ? "/api/reviews"
        : `/api/reviews?${paramKey[targetType]}=${targetId}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const items: ReviewItem[] = json.reviews ?? [];
      setReviews(items);

      // Recalculate aggregate from fetched data
      if (items.length > 0) {
        const avg = items.reduce((s, r) => s + r.rating, 0) / items.length;
        setAverage(Math.round(avg * 10) / 10);
        setCount(items.length);
      } else {
        setAverage(0);
        setCount(0);
      }
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const myReview = userId ? reviews.find((r) => r.user_id === userId) : undefined;

  // ── Submit (create or edit) ─────────────────────────────────────────────────
  async function handleSubmit(values: ReviewFormValues) {
    setSubmitError("");

    if (editingId) {
      // Edit existing
      const res = await fetch(`/api/reviews/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update review.");
      }
    } else {
      // Create new
      const payload = targetType === "platform"
        ? { review_type: "platform", ...values }
        : { [`${paramKey[targetType]}`]: targetId, ...values };
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to submit review.");
      }
    }

    setShowForm(false);
    setEditingId(null);
    await fetchReviews();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete your review? This cannot be undone.")) return;
    const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    if (res.ok) {
      await fetchReviews();
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section className="mt-12 border-t border-zinc-100 pt-10">
      {/* Section header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-zinc-950">Reviews</h2>
          {count > 0 && (
            <div className="mt-1">
              <StarSummary average={average} count={count} accent={accentColor} />
            </div>
          )}
        </div>

        {/* Write-a-review button (only when not already showing form) */}
        {!authLoading && userId && !myReview && !showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingId(null);
            }}
            className={`self-start rounded-xl px-5 py-2.5 text-sm font-black text-white transition ${accentBtn[accentColor]}`}
          >
            Write a Review
          </button>
        )}
      </div>

      {/* Review form (create) */}
      {showForm && !editingId && (
        <div className="mb-8 rounded-2xl border border-zinc-200 bg-zinc-50 p-5">
          <h3 className="mb-4 text-base font-black text-zinc-950">
            Your Review
          </h3>
          <ReviewForm
            accent={accentColor}
            onSubmit={handleSubmit}
            onCancel={() => setShowForm(false)}
          />
          {submitError && (
            <p className="mt-3 text-sm text-red-600">{submitError}</p>
          )}
        </div>
      )}

      {/* Sign-in prompt */}
      {!authLoading && !userId && (
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-6 text-center">
          <p className="text-sm font-semibold text-zinc-600">
            <a href="/login" className={`font-black ${accentText[accentColor]} hover:underline`}>
              Sign in
            </a>{" "}
            to leave a review for this {targetLabel[targetType]}.
          </p>
        </div>
      )}

      {/* Already reviewed notice */}
      {!authLoading && userId && myReview && !showForm && !editingId && (
        <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-3 text-sm font-semibold text-zinc-600">
          You have already reviewed this {targetLabel[targetType]}.{" "}
          <button
            onClick={() => {
              setEditingId(myReview.id);
              setShowForm(false);
            }}
            className={`font-black ${accentText[accentColor]} hover:underline`}
          >
            Edit your review
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-2xl bg-zinc-100"
            />
          ))}
        </div>
      )}

      {/* Reviews list */}
      {!loading && reviews.length === 0 && (
        <p className="text-sm text-zinc-500">
          No reviews yet. Be the first to share your experience!
        </p>
      )}

      {!loading && reviews.length > 0 && (
        <div className="space-y-4">
          {reviews.map((r) => (
            <article
              key={r.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5"
            >
              {/* Edit form inline */}
              {editingId === r.id ? (
                <>
                  <h3 className="mb-4 text-sm font-black text-zinc-950">
                    Edit your review
                  </h3>
                  <ReviewForm
                    accent={accentColor}
                    initialValues={{
                      rating: r.rating,
                      title: r.title ?? "",
                      review: r.review ?? "",
                    }}
                    submitLabel="Save Changes"
                    onSubmit={handleSubmit}
                    onCancel={() => setEditingId(null)}
                  />
                </>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <StarRating value={r.rating} size={16} />
                      {r.is_verified && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                          Verified
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-zinc-400">
                      {formatDate(r.created_at)}
                    </span>
                  </div>

                  {r.title && (
                    <p className="mt-2 font-bold text-zinc-950">{r.title}</p>
                  )}
                  {r.review && (
                    <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                      {r.review}
                    </p>
                  )}

                  {/* Owner actions */}
                  {userId === r.user_id && (
                    <div className="mt-3 flex items-center gap-3 border-t border-zinc-100 pt-3">
                      <button
                        onClick={() => setEditingId(r.id)}
                        className={`text-xs font-bold ${accentText[accentColor]} hover:underline`}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="text-xs font-bold text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
