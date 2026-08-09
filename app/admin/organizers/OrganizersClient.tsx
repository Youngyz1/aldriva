"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, TrendingUp, History, RefreshCw } from "lucide-react";
import AdminStatsCards from "@/components/admin/AdminStatsCards";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminManagementToolbar from "@/components/admin/AdminManagementToolbar";
import AdminDrawer from "@/components/admin/AdminDrawer";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";
import { ModerationBadge, StatusBadge } from "@/components/admin/ModerationBadge";
import { formatAdminDate, formatAdminMoney } from "@/lib/admin-query";
import type {
  AdminOrganizerDetail,
  AdminOrganizerRow,
  AdminOrganizerStats,
} from "@/types/admin-management";

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "verified", label: "Verified" },
  { value: "suspended", label: "Suspended" },
  { value: "rejected", label: "Rejected" },
];

function getOrganizerActions(status: string) {
  switch (status) {
    case "pending":
      return ["verify", "reject"] as const;
    case "verified":
      return ["suspend"] as const;
    case "suspended":
      return ["restore", "reject"] as const;
    case "rejected":
      return ["restore"] as const;
    default:
      return [] as const;
  }
}

const ACTION_LABELS: Record<string, string> = {
  verify: "Verify",
  reject: "Reject",
  suspend: "Suspend",
  restore: "Restore",
};

const ACTION_STYLES: Record<string, string> = {
  verify: "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
  reject: "border-red-200 text-red-600 hover:bg-red-50",
  suspend: "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
  restore: "border-violet-200 text-violet-700 hover:bg-violet-50",
};

const AUDIT_FIELD_LABELS: Record<string, string> = {
  follower_offset: "Follower Boost",
  events_offset: "Events Boost",
  payment_enabled: "Payment Enabled",
  fundraising_approved: "Fundraising Approved",
};

export default function OrganizersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<AdminOrganizerRow[]>([]);
  const [stats, setStats] = useState<AdminOrganizerStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerOrg, setDrawerOrg] = useState<AdminOrganizerDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Visibility boost state
  const [followerOffsetInput, setFollowerOffsetInput] = useState("");
  const [eventsOffsetInput, setEventsOffsetInput] = useState("");
  const [visibilitySaving, setVisibilitySaving] = useState(false);
  const [visibilityError, setVisibilityError] = useState("");
  const [visibilitySuccess, setVisibilitySuccess] = useState(false);

  useEffect(() => {
    if (drawerOrg) {
      setFollowerOffsetInput(String(drawerOrg.follower_offset ?? 0));
      setEventsOffsetInput(String(drawerOrg.events_offset ?? 0));
      setVisibilityError("");
      setVisibilitySuccess(false);
    }
  }, [drawerOrg]);

  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "25");
  const search = searchParams.get("search") ?? "";
  const tab = searchParams.get("tab") ?? searchParams.get("status") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const date = searchParams.get("date") ?? "all";
  const sort = searchParams.get("sort") ?? "newest";

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
    if (date !== "all") params.set("date", date);
    if (sort !== "newest") params.set("sort", sort);
    return params.toString();
  }, [page, perPage, search, tab, status, date, sort]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/organizers?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load organizations.");
      setRows(data.organizers ?? []);
      setStats(data.stats ?? null);
      setTotal(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load organizations.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function updateStatus(id: string, action: string) {
    const statusMap: Record<string, string> = {
      verify: "verified",
      reject: "rejected",
      suspend: "suspended",
      restore: "verified",
    };
    const nextStatus = statusMap[action];
    if (!nextStatus) return;

    setWorking(id);
    setError("");
    const res = await fetch(`/api/admin/organizers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Update failed.");
    } else {
      await fetchData();
      if (drawerOrg?.id === id) openDrawer(id);
    }
    setWorking(null);
  }

  async function updateCapability(
    id: string,
    field: "payment_enabled" | "fundraising_approved",
    value: boolean
  ) {
    setWorking(id);
    setError("");
    const res = await fetch(`/api/admin/organizers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Update failed.");
    } else {
      await fetchData();
      if (drawerOrg?.id === id) openDrawer(id);
    }
    setWorking(null);
  }

  async function bulkAction(action: string) {
    setWorking("bulk");
    setError("");
    const res = await fetch("/api/admin/organizers/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Bulk action failed.");
    } else {
      setConfirmAction(null);
      await fetchData();
    }
    setWorking(null);
  }

  async function openDrawer(id: string) {
    setDrawerLoading(true);
    setDrawerOrg(null);
    try {
      const res = await fetch(`/api/admin/organizers/${id}`);
      const data = await res.json();
      if (res.ok) setDrawerOrg(data.organizer ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function saveVisibilityBoost() {
    if (!drawerOrg) return;
    setVisibilitySaving(true);
    setVisibilityError("");
    setVisibilitySuccess(false);

    try {
      const followerVal = parseInt(followerOffsetInput, 10);
      const eventsVal = parseInt(eventsOffsetInput, 10);

      if (isNaN(followerVal) || followerVal < 0) {
        throw new Error("Follower boost must be a non-negative integer.");
      }
      if (isNaN(eventsVal) || eventsVal < 0) {
        throw new Error("Event boost must be a non-negative integer.");
      }

      const res = await fetch(`/api/admin/organizers/${drawerOrg.id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          follower_offset: followerVal,
          events_offset: eventsVal,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save visibility boost.");

      setVisibilitySuccess(true);
      await openDrawer(drawerOrg.id);
      await fetchData();
    } catch (err) {
      setVisibilityError(err instanceof Error ? err.message : "Failed to save visibility boost.");
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function resetVisibilityBoost() {
    if (!drawerOrg) return;
    setVisibilitySaving(true);
    setVisibilityError("");
    setVisibilitySuccess(false);

    try {
      const res = await fetch(`/api/admin/organizers/${drawerOrg.id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reset visibility boost.");

      setVisibilitySuccess(true);
      setFollowerOffsetInput("0");
      setEventsOffsetInput("0");
      await openDrawer(drawerOrg.id);
      await fetchData();
    } catch (err) {
      setVisibilityError(err instanceof Error ? err.message : "Failed to reset visibility boost.");
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams(queryString);
      params.delete("page");
      params.delete("per_page");
      const res = await fetch(`/api/admin/organizers/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "organizations-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export CSV.");
    } finally {
      setExporting(false);
    }
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const statItems = stats
    ? [
        { label: "Pending", value: stats.pending },
        { label: "Verified", value: stats.verified },
        { label: "Suspended", value: stats.suspended },
        { label: "Rejected", value: stats.rejected },
        { label: "Total", value: stats.total },
      ]
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="rounded-xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:rounded-2xl sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Organizations</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">
          Moderate organization profiles with search, filters, and bulk actions.
        </p>
      </header>

      {stats && <AdminStatsCards items={statItems} />}

      <AdminManagementToolbar
        search={search}
        searchPlaceholder="Search organizations..."
        onSearchChange={(v) => updateParams({ search: v || null })}
        tabs={STATUS_TABS.map((t) => ({
          ...t,
          count: t.value === "all" ? stats?.total : stats?.[t.value as keyof AdminOrganizerStats],
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
              { value: "pending", label: "Pending" },
              { value: "verified", label: "Verified" },
              { value: "suspended", label: "Suspended" },
              { value: "rejected", label: "Rejected" },
            ],
            onChange: (v) =>
              updateParams({
                status: v === "all" ? null : v,
                tab: v === "all" ? null : v,
              }),
          },
          {
            id: "date",
            label: "Date",
            value: date,
            options: [
              { value: "all", label: "All Time" },
              { value: "today", label: "Today" },
              { value: "week", label: "This Week" },
              { value: "month", label: "This Month" },
              { value: "year", label: "This Year" },
            ],
            onChange: (v) => updateParams({ date: v === "all" ? null : v }),
          },
        ]}
        sort={{
          id: "sort",
          label: "Sort",
          value: sort,
          options: [
            { value: "newest", label: "Newest First" },
            { value: "oldest", label: "Oldest First" },
            { value: "alphabetical", label: "Alphabetical" },
            { value: "most_events", label: "Most Events" },
            { value: "most_fundraisers", label: "Most Fundraisers" },
          ],
          onChange: (v) => updateParams({ sort: v === "newest" ? null : v }),
        }}
        selectedCount={selected.size}
        bulkActions={
          <>
            {(["verify", "reject", "suspend", "restore"] as const).map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => setConfirmAction(action)}
                className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100"
              >
                {ACTION_LABELS[action]}
              </button>
            ))}
          </>
        }
        onExport={handleExport}
        exporting={exporting}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
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
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-zinc-300"
                    />
                  </th>
                  <th className="py-3 pr-4">Name</th>
                  <th className="py-3 pr-4">Owner</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Events</th>
                  <th className="py-3 pr-4">Fundraisers</th>
                  <th className="py-3 pr-4">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => {
                  const actions = getOrganizerActions(row.status);
                  return (
                    <tr key={row.id} className="hover:bg-zinc-50/70">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                          className="rounded border-zinc-300"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <div className="space-y-1">
                          <button
                            type="button"
                            onClick={() => openDrawer(row.id)}
                            className="font-black text-zinc-900 hover:text-violet-700 hover:underline"
                          >
                            {row.name}
                          </button>
                          <div className="flex flex-wrap gap-1">
                            {row.badges.map((b) => (
                              <ModerationBadge key={b} type={b} />
                            ))}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-semibold text-zinc-800">{row.owner_name}</p>
                        <p className="text-xs text-zinc-500">{row.email || "—"}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="py-3 pr-4 font-black text-zinc-900">{row.event_count}</td>
                      <td className="py-3 pr-4 font-black text-zinc-900">{row.fundraiser_count}</td>
                      <td className="py-3 pr-4 text-zinc-500">{formatAdminDate(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDrawer(row.id)}
                            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                          >
                            View
                          </button>
                          {actions.map((action) => (
                            <button
                              key={action}
                              type="button"
                              disabled={working === row.id}
                              onClick={() => updateStatus(row.id, action)}
                              className={`rounded-lg border bg-white px-2.5 py-1.5 text-xs font-black disabled:opacity-50 ${ACTION_STYLES[action]}`}
                            >
                              {working === row.id ? "…" : ACTION_LABELS[action]}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={working === row.id}
                            onClick={() => updateCapability(row.id, "payment_enabled", !row.payment_enabled)}
                            className="rounded-lg border border-blue-200 bg-white px-2.5 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                          >
                            {row.payment_enabled ? "Disable Payment" : "Enable Payment"}
                          </button>
                          <button
                            type="button"
                            disabled={working === row.id}
                            onClick={() => updateCapability(row.id, "fundraising_approved", !row.fundraising_approved)}
                            className="rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-black text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                          >
                            {row.fundraising_approved ? "Revoke Fundraising" : "Approve Fundraising"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm font-semibold text-zinc-400">
                      No organizations match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <AdminPagination
          page={page}
          totalPages={totalPages}
          perPage={perPage}
          total={total}
          onPageChange={(p) => updateParams({ page: String(p) })}
          onPerPageChange={(n) => updateParams({ per_page: String(n), page: "1" })}
        />
      </div>

      <AdminDrawer
        open={drawerOrg !== null || drawerLoading}
        onClose={() => { setDrawerOrg(null); setDrawerLoading(false); }}
        title={drawerOrg?.name ?? "Organization"}
        subtitle={drawerOrg?.email}
        footer={
          drawerOrg && (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/organizers/${drawerOrg.id}`}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-black text-zinc-700 hover:bg-white"
              >
                Public Profile
              </Link>
              {getOrganizerActions(drawerOrg.status).map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={working === drawerOrg.id}
                  onClick={() => updateStatus(drawerOrg.id, action)}
                  className={`rounded-xl border bg-white px-4 py-2 text-sm font-black disabled:opacity-50 ${ACTION_STYLES[action]}`}
                >
                  {ACTION_LABELS[action]}
                </button>
              ))}
            </div>
          )
        }
      >
        {drawerLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : drawerOrg ? (
          <div className="space-y-6">
            <section>
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Organization Profile</h3>
              <p className="mt-2 text-sm font-semibold text-zinc-700">{drawerOrg.bio || "No bio provided."}</p>
              {drawerOrg.website && (
                <a href={drawerOrg.website} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-violet-700 hover:underline">
                  {drawerOrg.website}
                </a>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3">
              {[
                ["Events", (drawerOrg.event_count || 0) + (drawerOrg.events_offset || 0)],
                ["Fundraisers", drawerOrg.fundraiser_count],
                ["Followers", (drawerOrg.follower_count || 0) + (drawerOrg.follower_offset || 0)],
                ["Revenue", formatAdminMoney(drawerOrg.revenue)],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-black text-zinc-950">{value}</p>
                </div>
              ))}
            </section>

            {/* Visibility Boost Section */}
            <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-4">
              <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-400">
                <TrendingUp className="h-4 w-4 text-violet-500" />
                Visibility Boost
              </h3>
              <p className="text-xs text-zinc-500">
                Add virtual offset metrics to boost the organization's public presence.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="follower-offset-input" className="block text-[10px] font-black uppercase text-zinc-400 mb-1">
                    Follower Boost
                  </label>
                  <input
                    id="follower-offset-input"
                    type="number"
                    min="0"
                    value={followerOffsetInput}
                    onChange={(e) => {
                      setFollowerOffsetInput(e.target.value);
                      setVisibilityError("");
                      setVisibilitySuccess(false);
                    }}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold focus:border-violet-500 focus:outline-none"
                    placeholder="0"
                  />
                  <p className="mt-1 text-[10px] text-zinc-400">
                    Real: {drawerOrg.follower_count || 0}
                  </p>
                </div>

                <div>
                  <label htmlFor="events-offset-input" className="block text-[10px] font-black uppercase text-zinc-400 mb-1">
                    Events Boost
                  </label>
                  <input
                    id="events-offset-input"
                    type="number"
                    min="0"
                    value={eventsOffsetInput}
                    onChange={(e) => {
                      setEventsOffsetInput(e.target.value);
                      setVisibilityError("");
                      setVisibilitySuccess(false);
                    }}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-semibold focus:border-violet-500 focus:outline-none"
                    placeholder="0"
                  />
                  <p className="mt-1 text-[10px] text-zinc-400">
                    Real: {drawerOrg.event_count || 0}
                  </p>
                </div>
              </div>

              {visibilityError && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs font-semibold text-red-700">
                  {visibilityError}
                </div>
              )}
              {visibilitySuccess && (
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs font-semibold text-emerald-700">
                  Boosts updated successfully.
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    visibilitySaving ||
                    (followerOffsetInput === String(drawerOrg.follower_offset ?? 0) &&
                      eventsOffsetInput === String(drawerOrg.events_offset ?? 0))
                  }
                  onClick={saveVisibilityBoost}
                  className="flex-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {visibilitySaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Save Boosts"
                  )}
                </button>
                <button
                  type="button"
                  disabled={
                    visibilitySaving ||
                    ((drawerOrg.follower_offset ?? 0) === 0 && (drawerOrg.events_offset ?? 0) === 0)
                  }
                  onClick={resetVisibilityBoost}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 flex items-center gap-1"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Reset
                </button>
              </div>
            </section>

            {/* Capabilities — Payment Enabled / Fundraising Approved */}
            <section className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Capabilities</h3>
              <p className="text-xs text-zinc-500">
                Independent from verification status — tracked here, not yet enforced against payment or fundraiser creation.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Payment</p>
                  <p className="mt-1 text-sm font-black text-zinc-950">
                    {drawerOrg.payment_enabled ? "Enabled" : "Not enabled"}
                  </p>
                  <button
                    type="button"
                    disabled={working === drawerOrg.id}
                    onClick={() => updateCapability(drawerOrg.id, "payment_enabled", !drawerOrg.payment_enabled)}
                    className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                  >
                    {drawerOrg.payment_enabled ? "Disable" : "Enable"}
                  </button>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Fundraising</p>
                  <p className="mt-1 text-sm font-black text-zinc-950">
                    {drawerOrg.fundraising_approved ? "Approved" : "Not approved"}
                  </p>
                  <button
                    type="button"
                    disabled={working === drawerOrg.id}
                    onClick={() => updateCapability(drawerOrg.id, "fundraising_approved", !drawerOrg.fundraising_approved)}
                    className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-black text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {drawerOrg.fundraising_approved ? "Revoke" : "Approve"}
                  </button>
                </div>
              </div>
            </section>

            {/* Visibility Boost + Capability Change History */}
            {drawerOrg.visibility_history && drawerOrg.visibility_history.length > 0 && (
              <section className="space-y-3">
                <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-400">
                  <History className="h-4 w-4" />
                  Change History
                </h3>
                <div className="max-h-[180px] overflow-y-auto divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-white text-xs">
                  {drawerOrg.visibility_history.map((entry) => (
                    <div key={entry.id} className="p-3 space-y-1">
                      <div className="flex justify-between font-semibold text-zinc-800">
                        <span>{AUDIT_FIELD_LABELS[entry.field_name] ?? entry.field_name}</span>
                        <span className="text-zinc-500">
                          {entry.old_value} → {entry.new_value}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>By {entry.admin_name || "Admin"}</span>
                        <span>{formatAdminDate(entry.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Owner Information</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div><dt className="text-xs font-bold text-zinc-400">Name</dt><dd className="font-semibold">{drawerOrg.owner_name}</dd></div>
                <div><dt className="text-xs font-bold text-zinc-400">Email</dt><dd className="font-semibold">{drawerOrg.email}</dd></div>
                <div><dt className="text-xs font-bold text-zinc-400">Status</dt><dd><StatusBadge status={drawerOrg.status} /></dd></div>
              </dl>
            </section>

            <section>
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Status History</h3>
              <div className="mt-3 space-y-2">
                {drawerOrg.status_history.map((entry, i) => (
                  <div key={`${entry.status}-${i}`} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-sm">
                    <span className="font-semibold text-zinc-800">{entry.label}</span>
                    <span className="text-xs text-zinc-500">{formatAdminDate(entry.at)}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </AdminDrawer>

      <AdminConfirmDialog
        open={confirmAction !== null}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={`Bulk ${confirmAction ? ACTION_LABELS[confirmAction] : ""}`}
        description={`Apply "${confirmAction ? ACTION_LABELS[confirmAction] : ""}" to ${selected.size} selected organization(s)?`}
        confirmLabel={confirmAction ? ACTION_LABELS[confirmAction] : "Confirm"}
        onConfirm={() => confirmAction && bulkAction(confirmAction)}
        loading={working === "bulk"}
      />
    </div>
  );
}
