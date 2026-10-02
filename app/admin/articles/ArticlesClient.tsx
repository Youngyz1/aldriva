"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminPagination from "@/components/admin/AdminPagination";
import RejectionReasonModal from "@/components/admin/RejectionReasonModal";
import AdminTable from "@/components/admin/table/AdminTable";
import TableToolbar from "@/components/admin/table/TableToolbar";
import type { AdminColumn, RowActionsConfig } from "@/components/admin/table/types";
import { pageRange } from "@/components/admin/table/logic";
import { tableStrings } from "@/components/admin/table/strings";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { adminPageCopy, buildStats } from "@/components/admin/page-strings";
import { useApprovalAction } from "@/hooks/use-approval-action";
import { formatAdminDate } from "@/lib/admin-query";

type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  categories: string[];
  created_at: string;
  author_name: string;
  author_email: string;
  rejection_reason: string | null;
};

type ArticleStats = {
  total: number;
  pending_review: number;
  published: number;
  draft: number;
  scheduled: number;
  rejected: number;
};

const STATUS_DOT: Record<string, string> = {
  pending_review: "bg-amber-500",
  draft: "bg-zinc-400",
  published: "bg-emerald-500",
  scheduled: "bg-blue-500",
  archived: "bg-amber-500",
  expired: "bg-red-500",
  rejected: "bg-red-500",
};

export default function ArticlesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [stats, setStats] = useState<ArticleStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const { updateStatus } = useApprovalAction("/api/admin/articles");

  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "25");
  const search = searchParams.get("search") ?? "";
  const tab = searchParams.get("tab") ?? searchParams.get("status") ?? "all";
  const status = searchParams.get("status") ?? "all";

  const effectiveStatus = status !== "all" ? status : tab;

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      if (!("page" in updates) && Object.keys(updates).some((k) => k !== "page")) {
        params.set("page", "1");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("per_page", String(perPage));
    if (search) params.set("search", search);
    if (tab !== "all") params.set("tab", tab);
    if (status !== "all") params.set("status", status);
    return params.toString();
  }, [page, perPage, search, tab, status]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/articles?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load articles.");
      setRows(data.articles ?? []);
      setStats(data.stats ?? null);
      setTotal(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load articles.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleUnpublish(id: string) {
    setWorking(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to unpublish article.");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setWorking(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this article permanently?")) {
      return;
    }
    setWorking(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/articles/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete article.");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setWorking(null);
    }
  }

  async function handleApprove(id: string) {
    setWorking(id);
    setError("");
    const result = await updateStatus(id, { status: "published" });
    if (!result.success) setError(result.error || "Failed to approve article.");
    else await fetchData();
    setWorking(null);
  }

  async function handleReject(id: string, reason: string) {
    setWorking(id);
    setError("");
    const result = await updateStatus(id, { status: "rejected", rejection_reason: reason || null });
    if (!result.success) setError(result.error || "Failed to reject article.");
    else await fetchData();
    setWorking(null);
  }

  const { start: rangeStart, end: rangeEnd } = pageRange(page, perPage, total, rows.length);

  // Priority hiding (detail first, then meta; title/value never hide):
  // email below 1024px container, categories + created below 800px.
  const columns: AdminColumn[] = [
    { id: "title", header: "Article", role: "title" },
    { id: "status", header: "Status", role: "value", width: "110px" },
    { id: "author", header: "Author", role: "meta" },
    { id: "created", header: "Created", role: "meta", align: "right", hideBelow: "md" },
    { id: "email", header: "Author Email", role: "detail", hideBelow: "lg" },
    { id: "categories", header: "Categories", role: "detail", hideBelow: "md" },
  ];

  /**
   * Primary is Approve while pending_review, View otherwise. The menu holds
   * the remaining status-appropriate actions: View, Reject (same
   * RejectionReasonModal as before), Unpublish (same PATCH
   * /api/admin/articles/[id] { status: "draft" } as before, shown exactly
   * when it was shown before), Delete with its existing confirm() dialog
   * (same DELETE /api/admin/articles/[id]), destructive last.
   */
  function buildRowActions(row: ArticleRow): RowActionsConfig {
    const pending = row.status === "pending_review";
    const menu: RowActionsConfig["menu"] = [];
    if (pending) {
      menu.push({
        key: "view",
        label: "View",
        href: `/articles/${row.slug}`,
      });
      menu.push({
        key: "reject",
        label: "Reject…",
        onSelect: () => setRejectTarget(row.id),
        disabled: working === row.id,
      });
    } else {
      if (row.status !== "draft") {
        menu.push({
          key: "unpublish",
          label: "Unpublish",
          onSelect: () => handleUnpublish(row.id),
          disabled: working === row.id,
        });
      }
    }
    menu.push({
      key: "delete",
      label: "Delete",
      onSelect: () => handleDelete(row.id),
      disabled: working === row.id,
      destructive: true,
    });
    return {
      primary: pending
        ? {
            key: "approve",
            label: "Approve",
            onSelect: () => handleApprove(row.id),
            disabled: working === row.id,
          }
        : { key: "view", label: "View", href: `/articles/${row.slug}` },
      menu,
    };
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow={adminPageCopy.articles.eyebrow}
        title={adminPageCopy.articles.title}
        description={adminPageCopy.articles.description}
      />

      <StatStrip items={buildStats(adminPageCopy.articles.stats, stats)} />

      <TableToolbar
        search={{
          value: search,
          placeholder:
            adminPageCopy.articles.searchPlaceholder ?? "Search articles...",
          onChange: (v) => updateParams({ search: v || null }),
        }}
        tabs={(adminPageCopy.articles.tabs ?? []).map((t) => ({
          ...t,
          count: t.value === "all" ? stats?.total : stats?.[t.value as keyof ArticleStats],
          active: effectiveStatus === t.value,
          onSelect: () =>
            updateParams({
              tab: t.value === "all" ? null : t.value,
              status: t.value === "all" ? null : t.value,
            }),
        }))}
        filters={[
          {
            id: "status",
            label: "Status",
            value: effectiveStatus,
            options: [
              { value: "all", label: "All Statuses" },
              ...((adminPageCopy.articles.tabs ?? []).filter((t) => t.value !== "all")),
            ],
            onChange: (v) =>
              updateParams({
                status: v === "all" ? null : v,
                tab: v === "all" ? null : v,
              }),
          },
        ]}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
        </div>
      ) : (
        <AdminTable
          columns={columns}
          rows={rows.map((row) => ({
            id: row.id,
            cells: [
              <span key="title" className="block max-w-[280px] truncate">
                {row.title}
              </span>,
              <span
                key="status"
                title={row.status === "rejected" ? row.rejection_reason || undefined : undefined}
                className="inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[row.status] ?? "bg-zinc-400"}`}
                />
                <span className="capitalize">{row.status.replace("_", " ")}</span>
              </span>,
              <span key="author" className="font-medium text-zinc-800">
                {row.author_name}
              </span>,
              <span key="created" className="whitespace-nowrap text-zinc-500">
                {formatAdminDate(row.created_at)}
              </span>,
              <span key="email" className="block max-w-[220px] truncate text-zinc-600">
                {row.author_email || "—"}
              </span>,
              <span key="categories" className="block max-w-[180px] truncate text-zinc-600">
                {row.categories && row.categories.length > 0 ? row.categories.join(", ") : "—"}
              </span>,
            ],
            detailExtra:
              row.status === "rejected" && row.rejection_reason
                ? [{ label: "Rejection reason", value: row.rejection_reason }]
                : [],
            actions: buildRowActions(row),
          }))}
          emptyMessage={adminPageCopy.articles.empty}
        />
      )}
      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-400">
            {loading || total === 0
              ? tableStrings.showingNone(total)
              : tableStrings.showingResults(rangeStart, rangeEnd, total)}
          </p>
          <AdminPagination
            showCount={false}
            page={page}
            totalPages={totalPages}
            perPage={perPage}
            total={total}
            onPageChange={(p) => updateParams({ page: String(p) })}
            onPerPageChange={(pp) => updateParams({ per_page: String(pp) })}
          />
        </div>
      </div>

      {rejectTarget && (
        <RejectionReasonModal
          onCancel={() => setRejectTarget(null)}
          onConfirm={(reason) => {
            const id = rejectTarget;
            setRejectTarget(null);
            handleReject(id, reason);
          }}
        />
      )}
    </div>
  );
}
