"use client";

/**
 * app/admin/businesses/review/ReviewQueueClient.tsx
 * Client half of the business review queue: the server page keeps
 * requireAdmin() plus all service-role queries and passes plain rows.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminTable from "@/components/admin/table/AdminTable";
import type { AdminColumn, RowActionsConfig } from "@/components/admin/table/types";
import { pageRange } from "@/components/admin/table/logic";
import { tableStrings } from "@/components/admin/table/strings";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { adminPageCopy, buildStats } from "@/components/admin/page-strings";
import { formatAdminDate } from "@/lib/admin-query";

export type ReviewQueueRow = {
  id: string;
  name: string;
  idShort: string;
  owner: string;
  category: string;
  industry: string | null;
  risk: number | null;
  reasons: string;
  created: string;
  flagged: boolean;
};

type Props = {
  rows: ReviewQueueRow[];
  page: number;
  total: number;
  perPage: number;
};

export default function ReviewQueueClient({ rows, page, total, perPage }: Props) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Priority hiding (detail first, then meta; title/value never hide):
  // reasons + created below 1024px container, category below 800px.
  const columns: AdminColumn[] = [
    { id: "name", header: "Business", role: "title" },
    { id: "risk", header: "Risk", role: "value", align: "right" },
    { id: "owner", header: "Owner", role: "meta" },
    { id: "category", header: "Category", role: "meta", hideBelow: "md" },
    { id: "reasons", header: "Reasons", role: "detail", hideBelow: "lg" },
    { id: "created", header: "Created", role: "detail", align: "right", hideBelow: "lg" },
  ];

  /**
   * Same two actions as before: Approve POSTs
   * /api/admin/businesses/[id]?status=active (no confirm, as before) and
   * refreshes the queue; View keeps the exact
   * /admin/businesses?tab=pending_review link the Overview relies on.
   */
  async function handleApprove(id: string) {
    setWorking(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/businesses/${id}?status=active`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Approval failed.");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed.");
    } finally {
      setWorking(null);
    }
  }

  function buildRowActions(row: ReviewQueueRow): RowActionsConfig {
    return {
      primary: {
        key: "view",
        label: "View",
        href: "/admin/businesses?tab=pending_review",
      },
      menu: [
        {
          key: "approve",
          label: "Approve",
          onSelect: () => handleApprove(row.id),
          disabled: working === row.id,
        },
      ],
    };
  }

  const { start: rangeStart, end: rangeEnd } = pageRange(page, perPage, total, rows.length);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow={adminPageCopy["business-review"].eyebrow}
        title={adminPageCopy["business-review"].title}
        description={adminPageCopy["business-review"].description}
      />

      <StatStrip
        items={buildStats(adminPageCopy["business-review"].stats, { total })}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      <AdminTable
        columns={columns}
        rows={rows.map((row) => ({
          id: row.id,
          cells: [
            <span key="name" className="block">
              <span className="block">{row.name}</span>
              <span className="block text-xs font-normal text-zinc-500">
                {row.idShort}
              </span>
            </span>,
            <span key="risk" className="font-mono tabular-nums">
              {row.risk ?? "—"}
            </span>,
            <span key="owner" className="text-zinc-600">
              {row.owner}
            </span>,
            <span key="category" className="block">
              <span className="block">{row.category}</span>
              {row.industry && (
                <span className="block text-xs font-normal text-zinc-500">
                  {row.industry}
                </span>
              )}
            </span>,
            <span key="reasons" className="block max-w-[300px] truncate text-xs text-zinc-600">
              {row.reasons}
            </span>,
            <span key="created" className="whitespace-nowrap text-zinc-500">
              {formatAdminDate(row.created)}
            </span>,
          ],
          detailExtra: [
            { label: "Flagged", value: row.flagged ? "Yes" : "No" },
          ],
          actions: buildRowActions(row),
        }))}
        emptyMessage={adminPageCopy["business-review"].empty}
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-400">
            {total === 0
              ? tableStrings.showingNone(total)
              : tableStrings.showingResults(rangeStart, rangeEnd, total)}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`?page=${page - 1}`}
                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                Previous
              </Link>
            )}
            <Link
              href={`?page=${page + 1}`}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              Next (50 per page)
            </Link>
          </div>
        </div>
      </div>

      <p className="text-xs text-zinc-400">
        is_flagged toggle available in main Businesses admin (/admin/businesses)
        — already exists.
      </p>
    </div>
  );
}
