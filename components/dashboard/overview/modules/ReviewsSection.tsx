/**
 * components/dashboard/overview/modules/ReviewsSection.tsx
 *
 * Real tenant-scoped Reviews operational section.
 */

import React from "react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { StatCard } from "../StatCard";
import { EmptyState } from "../EmptyState";
import {
  IconStar as Star,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";

export interface ReviewsSectionProps {
  organizerId: string;
  canManage?: boolean;
}

interface ReviewRow {
  id: string;
  rating: number;
  author_name: string | null;
  comment: string | null;
  created_at: string;
}

export async function ReviewsSection({
  organizerId,
  canManage = true,
}: ReviewsSectionProps) {
  const supabase = createSupabaseAdmin();

  let reviews: ReviewRow[] = [];
  let avgRating = 0;

  try {
    const { data, error } = await supabase
      .from("reviews")
      .select("id, rating, author_name, comment, created_at")
      .eq("organizer_id", organizerId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error && Array.isArray(data)) {
      reviews = data as ReviewRow[];
      if (reviews.length > 0) {
        const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
        avgRating = Number((sum / reviews.length).toFixed(1));
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ReviewsSection] query error:", err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-brand-700" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            Customer Reviews
          </h2>
        </div>
        {canManage && (
          <Link
            href={`/dashboard/org/${organizerId}/reviews`}
            className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
          >
            <span>All reviews</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Average Rating"
          value={avgRating}
          format="count"
          hint="Out of 5 stars"
          href={`/dashboard/org/${organizerId}/reviews`}
        />
        <StatCard
          label="Total Reviews"
          value={reviews.length}
          format="count"
        />
      </div>

      {reviews.length === 0 ? (
        <EmptyState
          variant="inline"
          title="No customer reviews received yet."
          action={{
            label: "Open Reviews",
            href: `/dashboard/org/${organizerId}/reviews`,
          }}
          icon={Star}
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
          {reviews.map((r) => (
            <div
              key={r.id}
              className="min-h-[48px] p-3.5 hover:bg-zinc-50/60 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-900">
                  {r.author_name || "Customer"}
                </span>
                <span className="text-xs font-bold text-amber-600 flex items-center gap-0.5">
                  ★ {r.rating}
                </span>
              </div>
              {r.comment && (
                <p className="text-xs text-zinc-600 mt-1 line-clamp-2">
                  {r.comment}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
