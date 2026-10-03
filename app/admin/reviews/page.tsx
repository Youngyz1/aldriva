"use client";

import { useEffect, useMemo, useState } from "react";
import StarRating from "@/components/StarRating";
import AdminTable from "@/components/admin/table/AdminTable";
import TableToolbar from "@/components/admin/table/TableToolbar";
import type { AdminColumn, RowActionsConfig } from "@/components/admin/table/types";
import { tableStrings } from "@/components/admin/table/strings";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { adminPageCopy, buildStats } from "@/components/admin/page-strings";
import { formatAdminDate } from "@/lib/admin-query";

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

  const statValues = useMemo(() => {
    const approved = reviews.filter((r) => r.is_approved).length;
    return {
      total: reviews.length,
      approved,
      hidden: reviews.length - approved,
    };
  }, [reviews]);

  // Priority hiding (detail first, then meta; title/value never hide):
  // review text below 1024px container, date below 800px.
  const columns: AdminColumn[] = [
    { id: "reviewer", header: "Reviewer", role: "title" },
    { id: "rating", header: "Rating", role: "value" },
    { id: "status", header: "Status", role: "meta" },
    { id: "created", header: "Date", role: "meta", align: "right", hideBelow: "md" },
    { id: "review", header: "Review", role: "detail", hideBelow: "lg" },
  ];

  /**
   * No detail view exists for reviews, so the primary is the moderation
   * toggle itself (Approve while hidden, Hide while approved — same PATCH
   * /api/admin/reviews/[id] { action } as before). Delete keeps its
   * confirm() dialog (same DELETE /api/admin/reviews/[id]), destructive
   * last, so the ⋯ menu is always present.
   */
  function buildRowActions(r: ReviewRow): RowActionsConfig {
    return {
      primary: r.is_approved
        ? {
            key: "hide",
            label: "Hide",
            onSelect: () => handleModerate(r.id, "hide"),
            disabled: working === r.id,
          }
        : {
            key: "approve",
            label: "Approve",
            onSelect: () => handleModerate(r.id, "approve"),
            disabled: working === r.id,
          },
      menu: [
        {
          key: "delete",
          label: "Delete",
          onSelect: () => handleDelete(r.id),
          disabled: working === r.id,
          destructive: true,
        },
      ],
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={adminPageCopy.reviews.eyebrow}
        title={adminPageCopy.reviews.title}
        description={adminPageCopy.reviews.description}
      />

      {!loading && (
        <StatStrip items={buildStats(adminPageCopy.reviews.stats, statValues)} />
      )}

      <TableToolbar
        tabs={(adminPageCopy.reviews.tabs ?? []).map((t) => ({
          ...t,
          count:
            t.value === "all"
              ? statValues.total
              : statValues[t.value as keyof typeof statValues],
          active: statusFilter === t.value,
          onSelect: () =>
            setStatusFilter(t.value as "all" | "approved" | "hidden"),
        }))}
        filters={[]}
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      ) : (
        <AdminTable
          columns={columns}
          rows={reviews.map((r) => ({
            id: r.id,
            cells: [
              <span key="reviewer" className="block">
                <span className="block">{r.profiles?.display_name || "Anonymous"}</span>
                <span className="block max-w-[200px] truncate text-xs font-normal text-zinc-500">
                  {getTargetName(r)}
                </span>
              </span>,
              <span key="rating" className="flex items-center gap-1">
                <StarRating value={r.rating} size={14} />
                <span className="text-xs font-bold tabular-nums text-zinc-600">
                  ({r.rating})
                </span>
              </span>,
              <span key="status" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    r.is_approved ? "bg-emerald-500" : "bg-red-500"
                  }`}
                />
                <span>{r.is_approved ? "Approved" : "Hidden"}</span>
              </span>,
              <span key="created" className="whitespace-nowrap text-zinc-500">
                {formatAdminDate(r.created_at)}
              </span>,
              <span key="review" className="block max-w-[250px]">
                {r.title && (
                  <span className="block font-bold text-zinc-950">{r.title}</span>
                )}
                {r.review && (
                  <span className="block text-xs text-zinc-600">{r.review}</span>
                )}
              </span>,
            ],
            detailExtra: [
              { label: "Reviewer ID", value: r.user_id },
              { label: "Verified", value: r.is_verified ? "Yes" : "No" },
            ],
            actions: buildRowActions(r),
          }))}
          emptyMessage={adminPageCopy.reviews.empty}
        />
      )}

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-400">
            {loading || reviews.length === 0
              ? tableStrings.showingNone(reviews.length)
              : tableStrings.showingResults(1, reviews.length, reviews.length)}
          </p>
        </div>
      </div>
    </div>
  );
}
