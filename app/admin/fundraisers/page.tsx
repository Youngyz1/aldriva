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
import AdminTable from "@/components/admin/table/AdminTable";
import TableToolbar from "@/components/admin/table/TableToolbar";
import type { AdminColumn, RowActionsConfig } from "@/components/admin/table/types";
import { pageRange } from "@/components/admin/table/logic";
import { tableStrings } from "@/components/admin/table/strings";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { adminPageCopy, buildStats } from "@/components/admin/page-strings";
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

  const statValues = useMemo(
    () => ({
      total: allItems.length,
      pending_review: statusCounts.pending_review,
      featured: allItems.filter((f) => f.is_featured).length,
      results: filtered.length,
    }),
    [allItems, filtered.length, statusCounts.pending_review]
  );

  const { start: rangeStart, end: rangeEnd } = pageRange(
    page,
    perPage,
    filtered.length,
    paged.length
  );

  // Priority hiding (detail first, then meta; title/value never hide):
  // goal + created below 1024px container, % funded + featured below 800px,
  // progress bar desktop-only per spec.
  const columns: AdminColumn[] = [
    { id: "title", header: "Title", role: "title" },
    { id: "raised", header: "Raised", role: "value", align: "right" },
    { id: "organizer", header: "Organizer", role: "meta" },
    { id: "status", header: "Status", role: "meta" },
    { id: "pct", header: "% Funded", role: "meta", hideBelow: "md" },
    { id: "goal", header: "Goal", role: "detail", align: "right", hideBelow: "lg" },
    { id: "featured", header: "Featured", role: "detail", hideBelow: "md" },
    { id: "created", header: "Created", role: "detail", align: "right", hideBelow: "lg" },
    { id: "progress", header: "Progress", role: "detail", desktopOnly: true },
  ];

  /**
   * Primary View opens the detail drawer (same as before). Manage links to
   * /admin/fundraisers/[id]; Approve/Feature hit PATCH
   * /api/admin/fundraisers/[id] with { status: "published" } / { is_featured }
   * (same calls as before). Backdate and Reject live in the drawer (Date
   * Settings + Review Status sections), so those menu items open it; Reject
   * stays destructive and last via sortMenuActions.
   */
  function buildRowActions(f: FundraiserRow): RowActionsConfig {
    const menu: RowActionsConfig["menu"] = [
      { key: "manage", label: "Manage", href: `/admin/fundraisers/${f.id}` },
    ];
    if (f.status === "pending_review") {
      menu.push({
        key: "approve",
        label: "Approve",
        onSelect: () => approveFundraiser(f.id),
        disabled: working === f.id,
      });
    }
    menu.push({
      key: "feature",
      label: f.is_featured ? "Unfeature" : "Feature",
      onSelect: () => patchFundraiser(f.id, { is_featured: !f.is_featured }),
      disabled: working === f.id,
    });
    menu.push({ key: "backdate", label: "Backdate…", onSelect: () => openDrawer(f) });
    if (f.status !== "rejected") {
      menu.push({
        key: "reject",
        label: "Reject…",
        onSelect: () => openDrawer(f),
        destructive: true,
      });
    }
    return {
      primary: { key: "view", label: tableStrings.view, onSelect: () => openDrawer(f) },
      menu,
    };
  }

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
      <PageHeader
        eyebrow={adminPageCopy.fundraisers.eyebrow}
        title={adminPageCopy.fundraisers.title}
        description={adminPageCopy.fundraisers.description}
      />

      {!loading && (
        <StatStrip
          items={[
            ...buildStats(adminPageCopy.fundraisers.stats, statValues),
            {
              label: "Total Raised",
              value: money(allItems.reduce((s, f) => s + (f.raised ?? 0), 0)),
            },
          ]}
        />
      )}

      <TableToolbar
        search={{
          value: search,
          placeholder:
            adminPageCopy.fundraisers.searchPlaceholder ?? "Search fundraisers...",
          onChange: (v) => updateParams({ search: v || null }),
        }}
        tabs={(adminPageCopy.fundraisers.tabs ?? []).map((t) => ({
          ...t,
          count:
            t.value === "all"
              ? statusCounts.all
              : statusCounts[t.value as keyof typeof statusCounts],
          active: statusTab === t.value,
          onSelect: () =>
            updateParams({ status: t.value === "all" ? null : t.value }),
        }))}
        filters={[]}
        sort={{
          value: sort,
          options: adminPageCopy.fundraisers.sortOptions ?? [],
          onChange: (v) => updateParams({ sort: v === "newest" ? null : v }),
        }}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        </div>
      ) : (
        <AdminTable
          columns={columns}
          rows={paged.map((f) => {
            const pct = calcProgress(f.raised, f.goal);
            return {
              id: f.id,
              cells: [
                <span key="title" className="block max-w-[220px] truncate">
                  {f.title}
                </span>,
                <span key="raised" className="font-black tabular-nums text-brand-800">
                  {money(f.raised)}
                </span>,
                <span key="organizer" className="block max-w-[130px] truncate text-zinc-500">
                  {f.organizer || "—"}
                </span>,
                <span key="status" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${
                      f.status === "published"
                        ? "bg-emerald-500"
                        : f.status === "rejected"
                          ? "bg-red-500"
                          : "bg-amber-500"
                    }`}
                  />
                  <span>{STATUS_LABELS[f.status] ?? f.status}</span>
                </span>,
                <span key="pct" className="tabular-nums text-zinc-600">
                  {pct}%
                </span>,
                <span key="goal" className="tabular-nums text-zinc-500">
                  {money(f.goal)}
                </span>,
                <span key="featured">{f.is_featured ? "Yes" : "No"}</span>,
                <span key="created" className="whitespace-nowrap text-zinc-500">
                  {formatAdminDate(f.created_at)}
                </span>,
                <span key="progress" className="flex items-center gap-2">
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100">
                    <span
                      className="block h-full rounded-full bg-brand-600"
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="text-xs font-bold tabular-nums text-zinc-500">
                    {pct}%
                  </span>
                </span>,
              ],
              detailExtra:
                f.status === "rejected" && f.rejection_reason
                  ? [{ label: "Rejection reason", value: f.rejection_reason }]
                  : [],
              actions: buildRowActions(f),
              onOpen: () => openDrawer(f),
              detailHref: `/admin/fundraisers/${f.id}`,
            };
          })}
          emptyMessage={adminPageCopy.fundraisers.empty}
        />
      )}
      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-zinc-400">
            {loading || filtered.length === 0
              ? tableStrings.showingNone(filtered.length)
              : tableStrings.showingResults(rangeStart, rangeEnd, filtered.length)}
          </p>
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
