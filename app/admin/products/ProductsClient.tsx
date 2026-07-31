"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Eye, Trash2 } from "lucide-react";
import AdminStatsCards from "@/components/admin/AdminStatsCards";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminManagementToolbar from "@/components/admin/AdminManagementToolbar";
import ApprovalActionButtons from "@/components/admin/ApprovalActionButtons";
import { useApprovalAction } from "@/hooks/use-approval-action";
import { formatAdminDate } from "@/lib/admin-query";

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  price_type: string;
  status: string;
  stock_quantity: number | null;
  rejection_reason: string | null;
  created_at: string;
  owner_name: string;
  owner_email: string;
};

type ProductStats = {
  total: number;
  pending_review: number;
  active: number;
  out_of_stock: number;
  rejected: number;
  archived: number;
};

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending_review", label: "Pending Review" },
  { value: "active", label: "Active" },
  { value: "out_of_stock", label: "Out of Stock" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

const priceTypeBadgeStyles: Record<string, string> = {
  one_time: "bg-blue-50 text-blue-700 border-blue-200",
  subscription: "bg-purple-50 text-purple-700 border-purple-200",
};

const statusBadgeStyles: Record<string, string> = {
  pending_review: "bg-amber-50 text-amber-700 border-amber-200",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  out_of_stock: "bg-amber-50 text-amber-700 border-amber-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  archived: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export default function ProductsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [stats, setStats] = useState<ProductStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const { updateStatus } = useApprovalAction("/api/admin/products");

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
      const res = await fetch(`/api/admin/products?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load products.");
      setRows(data.products ?? []);
      setStats(data.stats ?? null);
      setTotal(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleApprove(id: string) {
    setWorking(id);
    setError("");
    const result = await updateStatus(id, { status: "active" });
    if (!result.success) setError(result.error || "Failed to approve product.");
    else await fetchData();
    setWorking(null);
  }

  async function handleReject(id: string, reason: string) {
    setWorking(id);
    setError("");
    const result = await updateStatus(id, { status: "rejected", rejection_reason: reason || null });
    if (!result.success) setError(result.error || "Failed to reject product.");
    else await fetchData();
    setWorking(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this product permanently?")) {
      return;
    }
    setWorking(id);
    setError("");
    try {
      const res = await fetch(`/api/admin/products/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete product.");
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setWorking(null);
    }
  }

  const statItems = [
    { label: "Total Products", value: stats?.total ?? 0 },
    { label: "Pending Review", value: stats?.pending_review ?? 0, accent: "text-amber-600" },
    { label: "Active", value: stats?.active ?? 0, accent: "text-emerald-600" },
    { label: "Out of Stock", value: stats?.out_of_stock ?? 0, accent: "text-amber-600" },
    { label: "Rejected", value: stats?.rejected ?? 0, accent: "text-red-600" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="rounded-xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:rounded-2xl sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Products</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">
          Moderate product listings across all users with search, filters, and moderation actions.
        </p>
      </header>

      {stats && <AdminStatsCards items={statItems} />}

      <AdminManagementToolbar
        search={search}
        searchPlaceholder="Search products by name or owner..."
        onSearchChange={(v) => updateParams({ search: v || null })}
        tabs={STATUS_TABS.map((t) => ({
          ...t,
          count: t.value === "all" ? stats?.total : stats?.[t.value as keyof ProductStats],
        }))}
        activeTab={effectiveStatus}
        onTabChange={(v) =>
          updateParams({
            tab: v === "all" ? null : v,
            status: v === "all" ? null : v,
          })
        }
        filters={[
          {
            id: "status",
            label: "Status",
            value: effectiveStatus,
            options: [
              { value: "all", label: "All Statuses" },
              { value: "pending_review", label: "Pending Review" },
              { value: "active", label: "Active" },
              { value: "out_of_stock", label: "Out of Stock" },
              { value: "rejected", label: "Rejected" },
              { value: "archived", label: "Archived" },
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

      <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-sm sm:rounded-2xl">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-black uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-6 py-3">Product</th>
                  <th className="py-3 pr-4">Owner</th>
                  <th className="py-3 pr-4">Price Type</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Stock</th>
                  <th className="py-3 pr-4">Created</th>
                  <th className="px-6 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-zinc-50/50 transition">
                    <td className="px-6 py-4 font-black text-zinc-900 max-w-[280px] truncate">
                      {row.name}
                    </td>
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-zinc-800">{row.owner_name}</p>
                      <p className="text-xs text-zinc-500">{row.owner_email || "—"}</p>
                    </td>
                    <td className="py-4 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${
                          priceTypeBadgeStyles[row.price_type] || "bg-zinc-100 text-zinc-700 border-zinc-200"
                        }`}
                      >
                        {row.price_type === "one_time" ? "One-time" : "Subscription"}
                      </span>
                    </td>
                    <td className="py-4 pr-4">
                      <span
                        title={row.status === "rejected" ? row.rejection_reason || undefined : undefined}
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${
                          statusBadgeStyles[row.status] || "bg-zinc-100 text-zinc-700 border-zinc-200"
                        }`}
                      >
                        {row.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-zinc-500">
                      {row.stock_quantity === null ? (
                        <span className="text-zinc-400">Unlimited</span>
                      ) : (
                        <span className="font-bold text-zinc-700">{row.stock_quantity}</span>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-zinc-500">{formatAdminDate(row.created_at)}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/products/${row.slug}`}
                          target="_blank"
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-250 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Link>
                        {row.status === "pending_review" && (
                          <ApprovalActionButtons
                            disabled={working === row.id}
                            onApprove={() => handleApprove(row.id)}
                            onReject={(reason) => handleReject(row.id, reason)}
                          />
                        )}
                        <button
                          type="button"
                          disabled={working === row.id}
                          onClick={() => handleDelete(row.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-sm font-semibold text-zinc-400 bg-white">
                      No products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <AdminPagination
            page={page}
            totalPages={totalPages}
            perPage={perPage}
            total={total}
            onPageChange={(p) => updateParams({ page: String(p) })}
            onPerPageChange={(pp) => updateParams({ per_page: String(pp) })}
          />
        )}
      </div>
    </div>
  );
}
