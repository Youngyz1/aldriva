"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, History } from "lucide-react";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminDrawer from "@/components/admin/AdminDrawer";
import AdminConfirmDialog from "@/components/admin/AdminConfirmDialog";
import { StatusBadge } from "@/components/admin/ModerationBadge";
import AdminTable from "@/components/admin/table/AdminTable";
import TableToolbar from "@/components/admin/table/TableToolbar";
import type { AdminColumn, RowActionsConfig } from "@/components/admin/table/types";
import { pageRange, pluralize, selectIdentityActions } from "@/components/admin/table/logic";
import { tableStrings } from "@/components/admin/table/strings";
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
  const [selectMode, setSelectMode] = useState(false);

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

  // Priority hiding (detail first, then meta; title/value never hide):
  // fundraisers + events below 1024px container, orgs + email + role below 800px.
  const columns: AdminColumn[] = [
    { id: "name", header: "Name", role: "title" },
    { id: "email", header: "Email", role: "detail", hideBelow: "md" },
    { id: "role", header: "Role", role: "meta", hideBelow: "md" },
    { id: "status", header: "Status", role: "value", width: "110px" },
    { id: "orgs", header: "Orgs", role: "detail", align: "right", hideBelow: "md" },
    { id: "events", header: "Events", role: "detail", align: "right", hideBelow: "lg" },
    { id: "fundraisers", header: "Fundraisers", role: "detail", align: "right", hideBelow: "lg" },
    { id: "joined", header: "Joined", role: "meta", align: "right" },
  ];

  /** Contextual row actions from real fields; never on the self row. */
  function buildRowActions(row: AdminUserRow, isSelf: boolean): RowActionsConfig | undefined {
    if (isSelf) return undefined;
    const menu: RowActionsConfig["menu"] = [];
    if (row.status === "active") {
      menu.push({
        key: "suspend",
        label: "Suspend",
        onSelect: () => patchUser(row.id, { status: "suspended" }),
        disabled: working === row.id,
        destructive: true,
      });
    }
    if (row.status === "suspended") {
      menu.push({
        key: "activate",
        label: "Activate",
        onSelect: () => patchUser(row.id, { status: "active" }),
        disabled: working === row.id,
      });
    }
    if (row.role === "admin") {
      menu.push({
        key: "demote",
        label: "Demote",
        onSelect: () => patchUser(row.id, { role: "user" }),
        disabled: working === row.id,
      });
    } else {
      menu.push({
        key: "promote",
        label: "Promote",
        onSelect: () => patchUser(row.id, { role: "admin" }),
        disabled: working === row.id,
      });
    }
    for (const action of selectIdentityActions(row.identity_status)) {
      menu.push({
        key: action,
        label: IDENTITY_ACTION_LABELS[action],
        onSelect: () =>
          patchUser(row.id, {
            identity_status: action === "identity_verify" ? "verified" : "rejected",
          }),
        disabled: working === row.id,
        destructive: action === "identity_reject",
      });
    }
    return {
      primary: { key: "view", label: tableStrings.view, onSelect: () => openDrawer(row.id) },
      menu,
    };
  }

  const { start: rangeStart, end: rangeEnd } = pageRange(page, perPage, total, rows.length);

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="pb-1">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Users</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">
          Full user management with roles, activity filters, and bulk moderation.
        </p>
      </header>

      <TableToolbar
        search={{
          value: search,
          placeholder: "Search by name, username, or email...",
          onChange: (v) => updateParams({ search: v || null }),
        }}
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
        selection={
          selected.size > 0
            ? {
                count: selected.size,
                actions: (
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
                ),
              }
            : null
        }
        onExport={handleExport}
        exporting={exporting}
        stats={statItems}
        selectMode={selectMode}
        onToggleSelectMode={() => setSelectMode((v) => !v)}
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
          rows={rows.map((row) => {
            const isSelf = row.is_current_user || row.id === currentUserId;
            return {
              id: row.id,
              cells: [
                <span key="name" className="block">
                  <span className="block">{row.full_name}</span>
                  {row.username && (
                    <span className="block text-xs font-normal text-zinc-500">
                      @{row.username}
                    </span>
                  )}
                  {isSelf && (
                    <span className="mt-0.5 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-black uppercase text-violet-700">
                      You
                    </span>
                  )}
                </span>,
                <span
                  key="email"
                  className="block max-w-[220px] truncate font-medium text-zinc-700"
                  title={row.email}
                >
                  {row.email}
                </span>,
                <span key="role" className="capitalize">
                  {row.role}
                </span>,
                <span
                  key="status"
                  className="inline-flex items-center gap-1.5 whitespace-nowrap"
                >
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${
                      row.status === "active" ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                  />
                  <span className="capitalize">{row.status}</span>
                </span>,
                <span key="orgs" className="tabular-nums">
                  {pluralize(row.organizer_count, "org", "orgs")}
                </span>,
                <span key="events" className="tabular-nums">
                  {row.event_count}
                </span>,
                <span key="fundraisers" className="tabular-nums">
                  {row.fundraiser_count}
                </span>,
                <span key="joined" className="whitespace-nowrap text-zinc-500">
                  {formatAdminDate(row.created_at)}
                </span>,
              ],
              actions: buildRowActions(row, isSelf),
              selection: {
                checked: selected.has(row.id),
                disabled: isSelf,
                onChange: () => toggleOne(row.id, isSelf),
                label: tableStrings.selectRow(row.full_name),
              },
              onOpen: () => openDrawer(row.id),
              detailHref: `/admin/users/${row.id}`,
            };
          })}
          selectAll={{
            checked: allSelected,
            onChange: toggleAll,
            label: tableStrings.selectAll,
          }}
          selectMode={selectMode}
          emptyMessage="No users match your filters."
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
            onPerPageChange={(n) => updateParams({ per_page: String(n), page: "1" })}
          />
        </div>
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
              {selectIdentityActions(drawerUser.identity_status).map((action) => (
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
