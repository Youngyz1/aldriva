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

type BusinessRow = {
  id: string;
  name: string;
  slug: string;
  listing_tier: string;
  status: string;
  is_flagged: boolean;
  is_featured: boolean;
  rejection_reason: string | null;
  created_at: string;
  owner_name: string;
  owner_email: string;
};

type BusinessStats = {
  total: number;
  pending_review: number;
  active: number;
  rejected: number;
  archived: number;
  featured: number;
  flagged: number;
};

const STATUS_DOT: Record<string, string> = {
  pending_review: "bg-amber-500",
  active: "bg-emerald-500",
  rejected: "bg-red-500",
  archived: "bg-zinc-400",
};

export default function BusinessesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<BusinessRow[]>([]);
  const [stats, setStats] = useState<BusinessStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const { updateStatus } = useApprovalAction("/api/admin/businesses");

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
      const res = await fetch(`/api/admin/businesses?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load businesses.");
      setRows(data.businesses ?? []);
      setStats(data.stats ?? null);
      setTotal(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load businesses.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleToggleFlag(id: string, currentFlagged: boolean) {
    setWorking(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/businesses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_flagged: !currentFlagged }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update business flag status.");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setWorking(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this business listing permanently?")) {
      return;
    }
    setWorking(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/businesses/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete business listing.");
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
    const result = await updateStatus(id, { status: "active" });
    if (!result.success) setError(result.error || "Failed to approve business.");
    else await fetchData();
    setWorking(null);
  }

  async function handleReject(id: string, reason: string) {
    setWorking(id);
    setError("");
    const result = await updateStatus(id, { status: "rejected", rejection_reason: reason || null });
    if (!result.success) setError(result.error || "Failed to reject business.");
    else await fetchData();
    setWorking(null);
  }

  const { start: rangeStart, end: rangeEnd } = pageRange(page, perPage, total, rows.length);

  // Priority hiding (detail first, then meta; title/value never hide):
  // featured + tier + flagged below 800px container, created below 1024px.
  const columns: AdminColumn[] = [
    { id: "name", header: "Business", role: "title" },
    { id: "status", header: "Status", role: "value", width: "110px" },
    { id: "owner", header: "Owner", role: "meta" },
    { id: "tier", header: "Tier", role: "meta", hideBelow: "md" },
    { id: "flagged", header: "Flagged", role: "meta", hideBelow: "md" },
    { id: "featured", header: "Featured", role: "detail", hideBelow: "md" },
    { id: "created", header: "Created", role: "detail", align: "right", hideBelow: "lg" },
  ];

  /**
   * Primary View opens the public listing (same destination as before;
   * same-tab Link now, previously a new tab). Approve/Reject (pending only)
   * use the same useApprovalAction PATCH /api/admin/businesses calls as
   * before, with the same RejectionReasonModal; Flag/Unflag PATCHes
   * /api/admin/businesses/[id] { is_flagged }; Delete keeps its confirm()
   * dialog and DELETE /api/admin/businesses/[id], destructive last.
   */
  function buildRowActions(row: BusinessRow): RowActionsConfig {
    const menu: RowActionsConfig["menu"] = [];
    if (row.status === "pending_review") {
      menu.push({
        key: "approve",
        label: "Approve",
        onSelect: () => handleApprove(row.id),
        disabled: working === row.id,
      });
      menu.push({
        key: "reject",
        label: "Reject…",
        onSelect: () => setRejectTarget(row.id),
        disabled: working === row.id,
      });
    }
    menu.push({
      key: "flag",
      label: row.is_flagged ? "Unflag" : "Flag",
      onSelect: () => handleToggleFlag(row.id, row.is_flagged),
      disabled: working === row.id,
    });
    menu.push({
      key: "delete",
      label: "Delete",
      onSelect: () => handleDelete(row.id),
      disabled: working === row.id,
      destructive: true,
    });
    return {
      primary: { key: "view", label: "View", href: `/businesses/${row.slug}` },
      menu,
    };
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        eyebrow={adminPageCopy.businesses.eyebrow}
        title={adminPageCopy.businesses.title}
        description={adminPageCopy.businesses.description}
      />

      <StatStrip items={buildStats(adminPageCopy.businesses.stats, stats)} />

      <TableToolbar
        search={{
          value: search,
          placeholder:
            adminPageCopy.businesses.searchPlaceholder ?? "Search businesses...",
          onChange: (v) => updateParams({ search: v || null }),
        }}
        tabs={(adminPageCopy.businesses.tabs ?? []).map((t) => ({
          ...t,
          count: t.value === "all" ? stats?.total : stats?.[t.value as keyof BusinessStats],
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
              ...((adminPageCopy.businesses.tabs ?? []).filter((t) => t.value !== "all")),
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
              <span key="name" className="block max-w-[280px] truncate">
                {row.name}
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
              <span key="owner" className="block">
                <span className="block font-medium text-zinc-800">{row.owner_name}</span>
                <span className="block text-xs font-normal text-zinc-500">
                  {row.owner_email || "—"}
                </span>
              </span>,
              <span key="tier" className="capitalize">
                {row.listing_tier === "one_time" ? "One-time" : row.listing_tier}
              </span>,
              <span key="flagged">{row.is_flagged ? "Flagged" : "Clear"}</span>,
              <span key="featured">{row.is_featured ? "Yes" : "No"}</span>,
              <span key="created" className="whitespace-nowrap text-zinc-500">
                {formatAdminDate(row.created_at)}
              </span>,
            ],
            detailExtra:
              row.status === "rejected" && row.rejection_reason
                ? [{ label: "Rejection reason", value: row.rejection_reason }]
                : [],
            actions: buildRowActions(row),
          }))}
          emptyMessage={adminPageCopy.businesses.empty}
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
