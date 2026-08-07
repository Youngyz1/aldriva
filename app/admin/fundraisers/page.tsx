"use client";

/**
 * app/admin/fundraisers/page.tsx
 * Fundraiser moderation — feature/unfeature and backdate fundraiser creation date.
 * Uses the same admin design system as the organizers/events admin pages.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CalendarDays, Star, StarOff } from "lucide-react";
import AdminDrawer from "@/components/admin/AdminDrawer";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminManagementToolbar from "@/components/admin/AdminManagementToolbar";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import { formatAdminDate, formatAdminMoney } from "@/lib/admin-query";

type FundraiserStatus = "pending_review" | "published" | "rejected";

type FundraiserRow = {
  id: string;
  title: string;
  slug: string | null;
  organizer: string;
  raised: number;
  goal: number;
  is_featured: boolean;
  status: FundraiserStatus;
  rejection_reason: string | null;
  created_at: string;
};

const PAGE_SIZE = 25;

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending",
  published: "Published",
  rejected: "Rejected",
};

function StatusBadge({ status }: { status: string }) {
  const style =
    status === "published"
      ? "bg-brand-100 text-brand-800"
      : status === "rejected"
      ? "bg-red-100 text-red-700"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${style}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function money(n: number) {
  return formatAdminMoney(n);
}

/** Format ISO date string to YYYY-MM-DD for <input type="date"> */
function toDateInputValue(iso: string) {
  return iso ? iso.slice(0, 10) : "";
}

/** Percentage funded, capped at 100% */
function calcProgress(raised: number, goal: number) {
  if (!goal) return 0;
  return Math.min(Math.round((raised / goal) * 100), 100);
}

export default function AdminFundraisersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get("page") ?? "1");
  const perPage = Number(searchParams.get("per_page") ?? String(PAGE_SIZE));
  const search = searchParams.get("search") ?? "";
  const sort = searchParams.get("sort") ?? "newest";
  const statusTab = searchParams.get("status") ?? "all";

  const [allItems, setAllItems] = useState<FundraiserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<FundraiserRow | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Date backdate state (per-drawer)
  const [newDate, setNewDate] = useState("");
  const [dateSaving, setDateSaving] = useState(false);
  const [dateError, setDateError] = useState("");
  const [dateSuccess, setDateSuccess] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }
      if (!("page" in updates)) params.set("page", "1");
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  // Fetch all fundraisers once
  useEffect(() => {
    setLoading(true);
    fetch("/api/admin/fundraisers")
      .then((r) => r.json())
      .then((d) => {
        setAllItems(d.fundraisers ?? []);
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load fundraisers.");
        setLoading(false);
      });
  }, []);

  // Client-side filter + sort + paginate
  const filtered = useMemo(() => {
    let rows = [...allItems];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          (f.organizer ?? "").toLowerCase().includes(q)
      );
    }
    if (statusTab !== "all") {
      rows = rows.filter((f) => f.status === statusTab);
    }
    switch (sort) {
      case "oldest":
        rows.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case "most_raised":
        rows.sort((a, b) => b.raised - a.raised);
        break;
      case "alphabetical":
        rows.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "featured":
        rows.sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
        break;
      default: // newest
        rows.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
    return rows;
  }, [allItems, search, sort, statusTab]);

  const statusCounts = useMemo(
    () => ({
      all: allItems.length,
      pending_review: allItems.filter((f) => f.status === "pending_review").length,
      published: allItems.filter((f) => f.status === "published").length,
      rejected: allItems.filter((f) => f.status === "rejected").length,
    }),
    [allItems]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paged = filtered.slice((page - 1) * perPage, page * perPage);

  // Open drawer (no separate API call needed — we have the data already)
  function openDrawer(item: FundraiserRow) {
    setDrawer(item);
    setNewDate(toDateInputValue(item.created_at));
    setDateError("");
    setDateSuccess(false);
    setRejectReason("");
  }

  function closeDrawer() {
    setDrawer(null);
    setDrawerLoading(false);
    setDateError("");
    setDateSuccess(false);
  }

  async function patchFundraiser(id: string, payload: Record<string, unknown>) {
    setWorking(id);
    setError("");
    const res = await fetch(`/api/admin/fundraisers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setAllItems((prev) =>
        prev.map((f) =>
          f.id === id ? { ...f, ...(data.fundraiser ?? {}) } : f
        )
      );
      // Sync drawer if open
      if (drawer?.id === id) {
        setDrawer((prev) =>
          prev ? { ...prev, ...(data.fundraiser ?? {}) } : prev
        );
      }
    } else {
      setError(data.error ?? "Update failed.");
    }
    setWorking(null);
    return res.ok;
  }

  async function approveFundraiser(id: string) {
    await patchFundraiser(id, { status: "published" });
  }

  async function rejectFundraiser(id: string) {
    const ok = await patchFundraiser(id, {
      status: "rejected",
      rejection_reason: rejectReason.trim() || null,
    });
    if (ok) setRejectReason("");
  }

  async function saveDate() {
    if (!drawer) return;
    setDateError("");
    setDateSuccess(false);
    if (!newDate) {
      setDateError("Please select a date.");
      return;
    }
    setDateSaving(true);
    const ok = await patchFundraiser(drawer.id, {
      created_at: new Date(newDate).toISOString(),
    });
    setDateSaving(false);
    if (ok) {
      setDateSuccess(true);
      // Update newDate to reflect saved date
      setNewDate(newDate);
    } else {
      setDateError(error || "Failed to save date.");
    }
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const tenYearsAgoStr = new Date(
    Date.now() - 10 * 365.25 * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ── Header ── */}
      <DashboardPageHeader
        eyebrow="Admin"
        title="Fundraisers"
        description="Feature campaigns and manage fundraiser settings including backdating."
      />

      {/* ── Stats bar ── */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Total", value: allItems.length },
            { label: "Pending", value: statusCounts.pending_review },
            {
              label: "Featured",
              value: allItems.filter((f) => f.is_featured).length,
            },
            {
              label: "Total Raised",
              value: money(allItems.reduce((s, f) => s + (f.raised ?? 0), 0)),
            },
            { label: "Results", value: filtered.length },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                {s.label}
              </p>
              <p className="mt-1 text-xl font-black text-zinc-950">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Toolbar ── */}
      <AdminManagementToolbar
        search={search}
        searchPlaceholder="Search fundraisers..."
        onSearchChange={(v) => updateParams({ search: v || null })}
        tabs={[
          { value: "all", label: "All", count: statusCounts.all },
          { value: "pending_review", label: "Pending", count: statusCounts.pending_review },
          { value: "published", label: "Published", count: statusCounts.published },
          { value: "rejected", label: "Rejected", count: statusCounts.rejected },
        ]}
        activeTab={statusTab}
        onTabChange={(v) => updateParams({ status: v === "all" ? null : v })}
        filters={[]}
        sort={{
          id: "sort",
          label: "Sort",
          value: sort,
          options: [
            { value: "newest", label: "Newest First" },
            { value: "oldest", label: "Oldest First" },
            { value: "alphabetical", label: "Alphabetical" },
            { value: "most_raised", label: "Most Raised" },
            { value: "featured", label: "Featured First" },
          ],
          onChange: (v) => updateParams({ sort: v === "newest" ? null : v }),
        }}
        selectedCount={0}
        bulkActions={<></>}
        filtersOpen={false}
        onToggleFilters={() => {}}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* ── Table ── */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-black uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="py-3 pl-5 pr-4">Title</th>
                  <th className="py-3 pr-4">Organizer</th>
                  <th className="py-3 pr-4">Raised</th>
                  <th className="py-3 pr-4">Goal</th>
                  <th className="py-3 pr-4">Progress</th>
                  <th className="py-3 pr-4">Created</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Featured</th>
                  <th className="py-3 pr-5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {paged.map((f) => (
                  <tr key={f.id} className="hover:bg-zinc-50/70">
                    <td className="py-3 pl-5 pr-4">
                      <button
                        type="button"
                        onClick={() => openDrawer(f)}
                        className="max-w-[200px] truncate text-left font-black text-zinc-900 hover:text-brand-800 hover:underline"
                      >
                        {f.title}
                      </button>
                    </td>
                    <td className="max-w-[130px] truncate py-3 pr-4 text-zinc-500">
                      {f.organizer || "—"}
                    </td>
                    <td className="py-3 pr-4 font-black text-brand-800">
                      {money(f.raised)}
                    </td>
                    <td className="py-3 pr-4 text-zinc-500">{money(f.goal)}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-brand-600"
                            style={{
                              width: `${calcProgress(f.raised, f.goal)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-bold text-zinc-500">
                          {calcProgress(f.raised, f.goal)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-zinc-500">
                      {formatAdminDate(f.created_at)}
                    </td>
                    <td className="py-3 pr-4">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-black uppercase ${
                          f.is_featured
                            ? "bg-brand-100 text-brand-800"
                            : "bg-zinc-100 text-zinc-500"
                        }`}
                      >
                        {f.is_featured ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="py-3 pr-5">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDrawer(f)}
                          className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                        >
                          View
                        </button>
                        <Link
                          href={`/admin/fundraisers/${f.id}`}
                          className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-black text-brand-800 hover:bg-brand-50"
                        >
                          Manage
                        </Link>
                        {f.status === "pending_review" && (
                          <button
                            type="button"
                            disabled={working === f.id}
                            onClick={() => approveFundraiser(f.id)}
                            className="rounded-lg border border-brand-200 bg-white px-2.5 py-1.5 text-xs font-black text-brand-800 hover:bg-brand-50 disabled:opacity-50"
                          >
                            Approve
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={working === f.id}
                          onClick={() =>
                            patchFundraiser(f.id, { is_featured: !f.is_featured })
                          }
                          className={`rounded-lg border bg-white px-2.5 py-1.5 text-xs font-black disabled:opacity-50 ${
                            f.is_featured
                              ? "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                              : "border-brand-200 text-brand-800 hover:bg-brand-50"
                          }`}
                        >
                          {working === f.id
                            ? "…"
                            : f.is_featured
                            ? "Unfeature"
                            : "Feature"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {paged.length === 0 && (
                  <tr>
                    <td
                      colSpan={9}
                      className="py-12 text-center text-sm font-semibold text-zinc-400"
                    >
                      No fundraisers match your filters.
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
          total={filtered.length}
          onPageChange={(p) => updateParams({ page: String(p) })}
          onPerPageChange={(n) =>
            updateParams({ per_page: String(n), page: "1" })
          }
        />
      </div>

      {/* ── Detail Drawer ── */}
      <AdminDrawer
        open={drawer !== null || drawerLoading}
        onClose={closeDrawer}
        title={drawer?.title ?? "Fundraiser"}
        subtitle={drawer ? `${money(drawer.raised)} raised · ${calcProgress(drawer.raised, drawer.goal)}% funded` : undefined}
        footer={
          drawer ? (
            <div className="flex flex-wrap gap-2">
              {drawer.slug && (
                <a
                  href={`/fundraisers/${drawer.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-black text-zinc-700 hover:bg-white"
                >
                  View Public Page
                </a>
              )}
              <Link
                href={`/admin/fundraisers/${drawer.id}`}
                className="rounded-xl border border-brand-200 px-4 py-2 text-sm font-black text-brand-800 hover:bg-brand-50"
              >
                Manage / Import
              </Link>
              <button
                type="button"
                disabled={working === drawer.id}
                onClick={() =>
                  patchFundraiser(drawer.id, {
                    is_featured: !drawer.is_featured,
                  })
                }
                className={`rounded-xl border bg-white px-4 py-2 text-sm font-black disabled:opacity-50 ${
                  drawer.is_featured
                    ? "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                    : "border-brand-200 text-brand-800 hover:bg-brand-50"
                }`}
              >
                {working === drawer.id
                  ? "…"
                  : drawer.is_featured
                  ? "Unfeature"
                  : "Feature"}
              </button>
            </div>
          ) : undefined
        }
      >
        {drawerLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          </div>
        ) : drawer ? (
          <div className="space-y-6">
            {/* Review status — approve / reject */}
            <section>
              <h3 className="text-sm font-bold text-zinc-900">
                Review Status
              </h3>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <StatusBadge status={drawer.status} />
                {drawer.status === "rejected" && drawer.rejection_reason && (
                  <span className="text-xs font-semibold text-zinc-500">
                    {drawer.rejection_reason}
                  </span>
                )}
              </div>
              {drawer.status !== "published" && (
                <button
                  type="button"
                  disabled={working === drawer.id}
                  onClick={() => approveFundraiser(drawer.id)}
                  className="mt-3 w-full rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-brand-800 disabled:opacity-50"
                >
                  {working === drawer.id ? "Working…" : "Approve & Publish"}
                </button>
              )}
              {drawer.status !== "rejected" && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Optional reason shown to the owner…"
                    rows={2}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
                  />
                  <button
                    type="button"
                    disabled={working === drawer.id}
                    onClick={() => rejectFundraiser(drawer.id)}
                    className="w-full rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-black text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    {working === drawer.id ? "Working…" : "Reject"}
                  </button>
                </div>
              )}
            </section>

            {/* Campaign Stats */}
            <section>
              <h3 className="text-sm font-bold text-zinc-900">
                Campaign Stats
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  ["Raised", money(drawer.raised)],
                  ["Goal", money(drawer.goal)],
                  ["Progress", `${calcProgress(drawer.raised, drawer.goal)}%`],
                  ["Featured", drawer.is_featured ? "Yes" : "No"],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-3"
                  >
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      {label}
                    </p>
                    <p className="mt-1 font-black text-zinc-950">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Date Settings — Backdating */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                <CalendarDays className="h-3.5 w-3.5" />
                Date Settings
              </h3>
              <p className="mt-1.5 text-xs text-zinc-500">
                Change the campaign creation date. This affects how the campaign appears in &ldquo;newest&rdquo; and &ldquo;oldest&rdquo; sort orders on public pages.
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="backdate-input"
                    className="mb-1.5 block text-xs font-bold text-zinc-600"
                  >
                    Current date: <span className="text-zinc-950">{formatAdminDate(drawer.created_at)}</span>
                  </label>
                  <input
                    id="backdate-input"
                    type="date"
                    value={newDate}
                    min={tenYearsAgoStr}
                    max={todayStr}
                    onChange={(e) => {
                      setNewDate(e.target.value);
                      setDateError("");
                      setDateSuccess(false);
                    }}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
                  />
                </div>

                {dateError && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                    {dateError}
                  </p>
                )}
                {dateSuccess && (
                  <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800">
                    Date updated successfully.
                  </p>
                )}

                <button
                  type="button"
                  disabled={dateSaving || newDate === toDateInputValue(drawer.created_at)}
                  onClick={saveDate}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-black text-white transition hover:bg-brand-800 disabled:opacity-50"
                >
                  {dateSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <CalendarDays className="h-4 w-4" />
                      Save Date
                    </>
                  )}
                </button>
              </div>
            </section>

            {/* Featured Status */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                {drawer.is_featured ? (
                  <Star className="h-3.5 w-3.5 fill-brand-600 text-brand-600" />
                ) : (
                  <StarOff className="h-3.5 w-3.5" />
                )}
                Featured Status
              </h3>
              <p className="mt-1.5 text-xs text-zinc-500">
                Featured campaigns appear at the top of the public fundraiser directory.
              </p>
              <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                  Currently
                </p>
                <p
                  className={`mt-1 font-black ${
                    drawer.is_featured ? "text-brand-700" : "text-zinc-500"
                  }`}
                >
                  {drawer.is_featured ? "Featured" : "Not Featured"}
                </p>
              </div>
            </section>
          </div>
        ) : null}
      </AdminDrawer>
    </div>
  );
}
