/**
 * components/ReviewForm.tsx
 * Controlled form for creating or editing a review.
 * Handles star selection, optional title, and review body.
 */
"use client";

import { useState } from "react";
import StarRating from "@/components/StarRating";

export interface ReviewFormValues {
  rating: number;
  title: string;
  review: string;
}

interface ReviewFormProps {
  /** Pre-populated values for edit mode. */
  initialValues?: Partial<ReviewFormValues>;
  /** Called on successful submit with the submitted values. */
  onSubmit: (values: ReviewFormValues) => Promise<void>;
  /** Called when the user cancels (edit mode). */
  onCancel?: () => void;
  /** Accent color matching the page theme. */
  accent?: "orange" | "violet" | "green";
  /** Label for the submit button. */
  submitLabel?: string;
}

const accentBtn: Record<string, string> = {
  orange: "bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200",
  violet: "bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300",
  green:  "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300",
};

const accentRing: Record<string, string> = {
  orange: "focus:ring-orange-400",
  violet: "focus:ring-violet-400",
  green:  "focus:ring-emerald-400",
};

export default function ReviewForm({
  initialValues,
  onSubmit,
  onCancel,
  accent = "violet",
  submitLabel = "Submit Review",
}: ReviewFormProps) {
  const [rating, setRating] = useState(initialValues?.rating ?? 0);
  const [title, setTitle] = useState(initialValues?.title ?? "");
  const [review, setReview] = useState(initialValues?.review ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const btnClass = accentBtn[accent];
  const ringClass = accentRing[accent];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (rating < 1 || rating > 5) {
      setError("Please select a star rating before submitting.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({ rating, title: title.trim(), review: review.trim() });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {/* Star selector */}
      <div>
        <label className="mb-1.5 block text-sm font-bold text-zinc-700">
          Your rating <span className="text-red-500">*</span>
        </label>
        <StarRating
          value={rating}
          interactive
          onChange={setRating}
          size={28}
        />
      </div>

      {/* Optional title */}
      <div>
        <label
          htmlFor="review-title"
          className="mb-1 block text-sm font-bold text-zinc-700"
        >
          Review title <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <input
          id="review-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          maxLength={200}
          placeholder="Summarise your experience"
          className={`w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:ring-2 ${ringClass} transition`}
        />
        <p className="mt-1 text-right text-xs text-zinc-400">{title.length}/200</p>
      </div>

      {/* Review body */}
      <div>
        <label
          htmlFor="review-body"
          className="mb-1 block text-sm font-bold text-zinc-700"
        >
          Review <span className="text-zinc-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="review-body"
          value={review}
          onChange={(e) => setReview(e.target.value.slice(0, 2000))}
          maxLength={2000}
          rows={4}
          placeholder="Tell others about your experience…"
          className={`w-full resize-none rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:ring-2 ${ringClass} transition`}
        />
        <p className="mt-1 text-right text-xs text-zinc-400">{review.length}/2000</p>
      </div>

      {/* Error message */}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={submitting}
          className={`rounded-xl px-6 py-2.5 text-sm font-black text-white transition ${btnClass}`}
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm font-bold text-zinc-500 transition hover:text-zinc-900"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
