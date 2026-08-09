"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, History } from "lucide-react";
import AdminStatsCards from "@/components/admin/AdminStatsCards";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminManagementToolbar from "@/components/admin/AdminManagementToolbar";
import AdminDrawer from "@/components/admin/AdminDrawer";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";
import { RoleBadge, StatusBadge } from "@/components/admin/ModerationBadge";
import { formatAdminDate, formatAdminMoney } from "@/lib/admin-query";
import type {
  AdminUserDetail,
  AdminUserRow,
  AdminUserStats,
} from "@/types/admin-management";

const BULK_ACTIONS = [
  { id: "activate", label: "Activate" },
  { id: "suspend", label: "Suspend" },
  { id: "promote", label: "Promote" },
  { id: "demote", label: "Demote" },
] as const;

function getIdentityActions(identityStatus: string) {
  switch (identityStatus) {
    case "pending":
      return ["identity_verify", "identity_reject"] as const;
    case "verified":
      return ["identity_reject"] as const;
    case "rejected":
      return ["identity_verify"] as const;
    default:
      return [] as const;
  }
}

const IDENTITY_ACTION_LABELS: Record<string, string> = {
  identity_verify: "Verify Identity",
  identity_reject: "Reject Identity",
};

const IDENTITY_ACTION_STYLES: Record<string, string> = {
  identity_verify: "border-emerald-200 text-emerald-700 hover:bg-emerald-50",
  identity_reject: "border-red-200 text-red-600 hover:bg-red-50",
};

export default function UsersClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerUser, setDrawerUser] = useState<AdminUserDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? "25");
  const search = searchParams.get("search") ?? "";
  const role = searchParams.get("role") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const activity = searchParams.get("activity") ?? "all";
  const sort = searchParams.get("sort") ?? "newest";

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
    if (role !== "all") params.set("role", role);
    if (status !== "all") params.set("status", status);
    if (activity !== "all") params.set("activity", activity);
    if (sort !== "newest") params.set("sort", sort);
    return params.toString();
  }, [page, perPage, search, role, status, activity, sort]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/users?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load users.");
      setRows(data.users ?? []);
      setStats(data.stats ?? null);
      setTotal(data.total ?? 0);
      setTotalPages(data.total_pages ?? 1);
      setCurrentUserId(data.current_user_id ?? null);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function patchUser(
    id: string,
    payload: { status?: string; role?: string; identity_status?: string }
  ) {
    setWorking(id);
    setError("");
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Update failed.");
    } else {
      await fetchData();
      if (drawerUser?.id === id) openDrawer(id);
    }
    setWorking(null);
  }

  async function bulkAction(action: string) {
    setWorking("bulk");
    setError("");
    const res = await fetch("/api/admin/users/bulk", {
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
    setDrawerUser(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`);
      const data = await res.json();
      if (res.ok) setDrawerUser(data.user ?? null);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams(queryString);
      params.delete("page");
      params.delete("per_page");
      const res = await fetch(`/api/admin/users/export?${params.toString()}`);
      if (!res.ok) throw new Error("Export failed.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "users-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to export CSV.");
    } finally {
      setExporting(false);
    }
  }

  const selectableRows = rows.filter((r) => !r.is_current_user);
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(selectableRows.map((r) => r.id)));
  }

  function toggleOne(id: string, isCurrent: boolean) {
    if (isCurrent) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const statItems = stats
    ? [
        { label: "Total Users", value: stats.total },
        { label: "Active Users", value: stats.active },
        { label: "Suspended", value: stats.suspended },
        { label: "Admins", value: stats.admins },
        { label: "Organizations", value: stats.organizers },
      ]
    : [];

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="rounded-xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:rounded-2xl sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Users</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">
          Full user management with roles, activity filters, and bulk moderation.
        </p>
      </header>

      {stats && <AdminStatsCards items={statItems} />}

      <AdminManagementToolbar
        search={search}
        searchPlaceholder="Search by name, username, or email..."
        onSearchChange={(v) => updateParams({ search: v || null })}
        filters={[
          {
            id: "role",
            label: "Role",
            value: role,
            options: [
              { value: "all", label: "All Roles" },
              { value: "admin", label: "Admin" },
              { value: "organizer", label: "Organizer" },
              { value: "user", label: "User" },
            ],
            onChange: (v) => updateParams({ role: v === "all" ? null : v }),
          },
          {
            id: "status",
            label: "Status",
            value: status,
            options: [
              { value: "all", label: "All Statuses" },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
            ],
            onChange: (v) => updateParams({ status: v === "all" ? null : v }),
          },
          {
            id: "activity",
            label: "Activity",
            value: activity,
            options: [
              { value: "all", label: "All Users" },
              { value: "has_events", label: "Has Events" },
              { value: "has_fundraisers", label: "Has Fundraisers" },
              { value: "has_organizers", label: "Has Organizations" },
            ],
            onChange: (v) => updateParams({ activity: v === "all" ? null : v }),
          },
        ]}
        sort={{
          id: "sort",
          label: "Sort",
          value: sort,
          options: [
            { value: "newest", label: "Newest First" },
            { value: "oldest", label: "Oldest First" },
            { value: "most_events", label: "Most Events" },
            { value: "most_organizers", label: "Most Organizations" },
            { value: "most_fundraisers", label: "Most Fundraisers" },
            { value: "alphabetical", label: "Alphabetical" },
          ],
          onChange: (v) => updateParams({ sort: v === "newest" ? null : v }),
        }}
        selectedCount={selected.size}
        bulkActions={
          <>
            {BULK_ACTIONS.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={() => setConfirmAction(action.id)}
                className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-100"
              >
                {action.label}
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
            <table className="w-full min-w-[1040px] text-left text-sm">
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
                  <th className="py-3 pr-4">Email</th>
                  <th className="py-3 pr-4">Role</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Organizations</th>
                  <th className="py-3 pr-4">Events</th>
                  <th className="py-3 pr-4">Fundraisers</th>
                  <th className="py-3 pr-4">Joined</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => {
                  const isSelf = row.is_current_user || row.id === currentUserId;
                  return (
                    <tr key={row.id} className="hover:bg-zinc-50/70">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(row.id)}
                          disabled={isSelf}
                          onChange={() => toggleOne(row.id, isSelf)}
                          className="rounded border-zinc-300 disabled:opacity-40"
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => openDrawer(row.id)}
                          className="font-black text-zinc-900 hover:text-violet-700 hover:underline"
                        >
                          {row.full_name}
                        </button>
                        {row.username && (
                          <p className="text-xs text-zinc-500">@{row.username}</p>
                        )}
                        {isSelf && (
                          <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-700">
                            You
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 font-semibold text-zinc-800">{row.email}</td>
                      <td className="py-3 pr-4"><RoleBadge role={row.role} /></td>
                      <td className="py-3 pr-4"><StatusBadge status={row.status} /></td>
                      <td className="py-3 pr-4 font-black text-zinc-900">{row.organizer_count}</td>
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
                          {!isSelf && row.status === "active" && (
                            <button
                              type="button"
                              disabled={working === row.id}
                              onClick={() => patchUser(row.id, { status: "suspended" })}
                              className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {working === row.id ? "…" : "Suspend"}
                            </button>
                          )}
                          {!isSelf && row.status === "suspended" && (
                            <button
                              type="button"
                              disabled={working === row.id}
                              onClick={() => patchUser(row.id, { status: "active" })}
                              className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                            >
                              {working === row.id ? "…" : "Activate"}
                            </button>
                          )}
                          {!isSelf && row.role !== "admin" && (
                            <button
                              type="button"
                              disabled={working === row.id}
                              onClick={() => patchUser(row.id, { role: "admin" })}
                              className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                            >
                              Promote
                            </button>
                          )}
                          {!isSelf && row.role === "admin" && (
                            <button
                              type="button"
                              disabled={working === row.id}
                              onClick={() => patchUser(row.id, { role: "user" })}
                              className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                            >
                              Demote
                            </button>
                          )}
                          {getIdentityActions(row.identity_status).map((action) => (
                            <button
                              key={action}
                              type="button"
                              disabled={working === row.id}
                              onClick={() => patchUser(row.id, { identity_status: action === "identity_verify" ? "verified" : "rejected" })}
                              className={`rounded-lg border bg-white px-2.5 py-1.5 text-xs font-black disabled:opacity-50 ${IDENTITY_ACTION_STYLES[action]}`}
                            >
                              {working === row.id ? "…" : IDENTITY_ACTION_LABELS[action]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-sm font-semibold text-zinc-400">
                      No users match your filters.
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
        open={drawerUser !== null || drawerLoading}
        onClose={() => { setDrawerUser(null); setDrawerLoading(false); }}
        title={drawerUser?.full_name ?? "User"}
        subtitle={drawerUser?.email}
        width="xl"
        footer={
          drawerUser && !drawerUser.is_current_user && (
            <div className="flex flex-wrap gap-2">
              {drawerUser.status === "active" ? (
                <button
                  type="button"
                  disabled={working === drawerUser.id}
                  onClick={() => patchUser(drawerUser.id, { status: "suspended" })}
                  className="rounded-xl border border-red-200 px-4 py-2 text-sm font-black text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  Suspend
                </button>
              ) : (
                <button
                  type="button"
                  disabled={working === drawerUser.id}
                  onClick={() => patchUser(drawerUser.id, { status: "active" })}
                  className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-black text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  Activate
                </button>
              )}
              {drawerUser.role !== "admin" ? (
                <button
                  type="button"
                  disabled={working === drawerUser.id}
                  onClick={() => patchUser(drawerUser.id, { role: "admin" })}
                  className="rounded-xl border border-violet-200 px-4 py-2 text-sm font-black text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                >
                  Promote to Admin
                </button>
              ) : (
                <button
                  type="button"
                  disabled={working === drawerUser.id}
                  onClick={() => patchUser(drawerUser.id, { role: "user" })}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Remove Admin
                </button>
              )}
              {getIdentityActions(drawerUser.identity_status).map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={working === drawerUser.id}
                  onClick={() => patchUser(drawerUser.id, { identity_status: action === "identity_verify" ? "verified" : "rejected" })}
                  className={`rounded-xl border bg-white px-4 py-2 text-sm font-black disabled:opacity-50 ${IDENTITY_ACTION_STYLES[action]}`}
                >
                  {IDENTITY_ACTION_LABELS[action]}
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
        ) : drawerUser ? (
          <div className="space-y-6">
            <section className="grid grid-cols-2 gap-3">
              {[
                ["Role", drawerUser.role],
                ["Status", drawerUser.status],
                ["Identity", drawerUser.identity_status],
                ["Joined", formatAdminDate(drawerUser.created_at)],
                ["Last Login", formatAdminDate(drawerUser.last_login)],
                ["Events", drawerUser.event_count],
                ["Fundraisers", drawerUser.fundraiser_count],
                ["Revenue", formatAdminMoney(drawerUser.revenue)],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">{label}</p>
                  <p className="mt-1 font-black text-zinc-950 capitalize">{value}</p>
                </div>
              ))}
            </section>

            <section>
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Full Profile</h3>
              <dl className="mt-3 space-y-2 text-sm">
                <div><dt className="text-xs font-bold text-zinc-400">Email</dt><dd className="font-semibold">{drawerUser.email}</dd></div>
                <div><dt className="text-xs font-bold text-zinc-400">Username</dt><dd className="font-semibold">@{drawerUser.username}</dd></div>
                {drawerUser.phone && <div><dt className="text-xs font-bold text-zinc-400">Phone</dt><dd className="font-semibold">{drawerUser.phone}</dd></div>}
                {drawerUser.location && <div><dt className="text-xs font-bold text-zinc-400">Location</dt><dd className="font-semibold">{drawerUser.location}</dd></div>}
              </dl>
            </section>

            {/* Identity verification change history — read-only oversight,
                same pattern as organizers' Change History section. */}
            {drawerUser.verification_history.length > 0 && (
              <section className="space-y-3">
                <h3 className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-zinc-400">
                  <History className="h-4 w-4" />
                  Verification History
                </h3>
                <div className="max-h-[180px] overflow-y-auto divide-y divide-zinc-100 rounded-xl border border-zinc-100 bg-white text-xs">
                  {drawerUser.verification_history.map((entry) => (
                    <div key={entry.id} className="p-3 space-y-1">
                      <div className="flex justify-between font-semibold text-zinc-800 capitalize">
                        <span>{entry.field_name.replace(/_/g, " ")}</span>
                        <span className="text-zinc-500">
                          {entry.old_value ?? "—"} → {entry.new_value ?? "—"}
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
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Organization Profiles</h3>
              <div className="mt-3 space-y-2">
                {drawerUser.organizers.length === 0 ? (
                  <p className="text-sm text-zinc-500">No organization profiles.</p>
                ) : drawerUser.organizers.map((org) => (
                  <div key={org.id} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2">
                    <div>
                      <p className="font-bold text-zinc-900">{org.name}</p>
                      <StatusBadge status={org.status} />
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/organizers/${org.id}`} className="text-xs font-black text-violet-700 hover:underline">
                        View Organization
                      </Link>
                      <Link href="/admin/events" className="text-xs font-black text-zinc-600 hover:underline">
                        Events
                      </Link>
                      <Link href="/admin/fundraisers" className="text-xs font-black text-zinc-600 hover:underline">
                        Fundraisers
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Recent Activity</h3>
              <div className="mt-3 space-y-2">
                {drawerUser.recent_activity.length === 0 ? (
                  <p className="text-sm text-zinc-500">No recent activity.</p>
                ) : drawerUser.recent_activity.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="rounded-lg border border-zinc-100 px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-zinc-900">{item.title}</p>
                        <p className="text-xs text-zinc-500">{item.detail}</p>
                      </div>
                      <span className="shrink-0 text-[10px] font-black uppercase text-zinc-400">{item.type}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-zinc-400">{formatAdminDate(item.at)}</span>
                      {item.href && (
                        <Link href={item.href} className="text-xs font-black text-violet-700 hover:underline">
                          View
                        </Link>
                      )}
                    </div>
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
        title={`Bulk ${BULK_ACTIONS.find((a) => a.id === confirmAction)?.label ?? "Action"}`}
        description={`Apply this action to ${selected.size} selected user(s)? This cannot be easily undone.`}
        confirmLabel={BULK_ACTIONS.find((a) => a.id === confirmAction)?.label ?? "Confirm"}
        onConfirm={() => confirmAction && bulkAction(confirmAction)}
        loading={working === "bulk"}
        variant={confirmAction === "suspend" || confirmAction === "demote" ? "danger" : "default"}
      />
    </div>
  );
}
