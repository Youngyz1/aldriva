"use client";

/**
 * app/admin/ai/rejections/RejectionsClient.tsx
 * Client half of the AI guard-rejections audit: the server page keeps
 * headers() + requireAdmin() plus the service-role query and passes
 * plain rows. The log is read-only, so rows carry no actions.
 */

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import AdminTable from "@/components/admin/table/AdminTable";
import type { AdminColumn } from "@/components/admin/table/types";
import { tableStrings } from "@/components/admin/table/strings";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { adminPageCopy, buildStats } from "@/components/admin/page-strings";

/**
 * Audit timestamps render identically on server and client in every
 * timezone: explicit locale + IANA zone (UTC, matching the overview range
 * math in components/admin/overview/data.ts which buckets in UTC). The
 * same stored instant shows the same string for every viewer, so SSR and
 * hydration can never disagree on it.
 */
const AUDIT_LOCALE = "en-US";
const AUDIT_TIME_ZONE = "UTC";

function formatAuditDateTime(iso: string) {
  return new Date(iso).toLocaleString(AUDIT_LOCALE, {
    timeZone: AUDIT_TIME_ZONE,
  });
}

export interface GuardRejectionRow {
  id: string;
  context: string;
  category: string;
  reason: string;
  excerpt: string | null;
  content_type: string | null;
  source_id: string | null;
  verdict: "flagged" | "rejected";
  created_at: string;
}

type Props = {
  rows: GuardRejectionRow[];
  error: string | null;
};

export default function RejectionsClient({ rows, error }: Props) {
  const statValues = useMemo(() => {
    const rejected = rows.filter((r) => r.verdict === "rejected").length;
    return {
      total: rows.length,
      rejected,
      flagged: rows.length - rejected,
    };
  }, [rows]);

  // Priority hiding (detail first, then meta; title/value never hide):
  // content + reason + excerpt below 1024px container, date below 800px.
  const columns: AdminColumn[] = [
    { id: "context", header: "Context", role: "title" },
    { id: "verdict", header: "Verdict", role: "value", width: "110px" },
    { id: "category", header: "Category", role: "meta" },
    { id: "created", header: "Date", role: "meta", align: "right", hideBelow: "md" },
    { id: "content", header: "Content", role: "detail", hideBelow: "lg" },
    { id: "reason", header: "Reason", role: "detail", hideBelow: "lg" },
    { id: "excerpt", header: "Excerpt", role: "detail", hideBelow: "lg" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/ai"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Growth Studio <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Security Audit</span>
      </Link>

      <PageHeader
        eyebrow={adminPageCopy["ai-rejections"].eyebrow}
        title={adminPageCopy["ai-rejections"].title}
        description={adminPageCopy["ai-rejections"].description}
        action={
          <Link
            href="/admin/ai/rejections"
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </Link>
        }
      />

      <StatStrip
        items={buildStats(adminPageCopy["ai-rejections"].stats, statValues)}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          <span className="font-bold">Error querying ai_guard_rejections table:</span>{" "}
          {error}
        </div>
      )}

      <AdminTable
        columns={columns}
        rows={rows.map((row) => ({
          id: row.id,
          cells: [
            <span key="context" className="block max-w-[220px] truncate font-mono text-[13px]">
              {row.context}
            </span>,
            <span key="verdict" className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 rounded-full ${
                  row.verdict === "rejected" ? "bg-red-500" : "bg-amber-500"
                }`}
              />
              <span className="capitalize">{row.verdict}</span>
            </span>,
            <span key="category" className="font-mono text-[13px] text-zinc-600">
              {row.category}
            </span>,
            <span key="created" className="whitespace-nowrap font-mono text-xs text-zinc-500">
              {formatAuditDateTime(row.created_at)}
            </span>,
            <span key="content" className="block font-mono text-xs text-zinc-600">
              {row.content_type || "n/a"}{" "}
              {row.source_id ? (
                <span className="text-zinc-400">({row.source_id.slice(0, 8)}…)</span>
              ) : null}
            </span>,
            <span key="reason" className="block max-w-[280px] text-zinc-700">
              {row.reason}
            </span>,
            <span key="excerpt" className="block max-w-[320px] font-mono text-xs text-zinc-500">
              {row.excerpt || "—"}
            </span>,
          ],
          detailExtra:
            row.source_id != null
              ? [{ label: "Source ID", value: row.source_id }]
              : [],
        }))}
        emptyMessage={adminPageCopy["ai-rejections"].empty}
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-400">
            {rows.length === 0
              ? tableStrings.showingNone(rows.length)
              : tableStrings.showingResults(1, rows.length, rows.length)}
          </p>
        </div>
      </div>
    </div>
  );
}
