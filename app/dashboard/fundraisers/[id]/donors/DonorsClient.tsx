"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Users,
  ArrowUpDown,
  ArrowRight,
} from "lucide-react";
import StickyTableToolbar, { StickyTablePagination } from "@/components/ui/sticky-table-toolbar";
import type { DonorRecord, DonorMetrics, DonorDonation } from "./page";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Donor avatar ─────────────────────────────────────────────────────────────

function DonorAvatar({ name, isAnonymous }: { name: string; isAnonymous: boolean }) {
  const initials = isAnonymous ? "?" : name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className={
      `flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
        isAnonymous ? "bg-zinc-100 text-zinc-400" : "bg-orange-100 text-orange-700"
      }`
    }>
      {initials}
    </div>
  );
}

// ── Metrics strip ─────────────────────────────────────────────────────────────

function MetricsStrip({ metrics }: { metrics: DonorMetrics }) {
  const cards = [
    { label: "Total Donors", value: metrics.totalDonors.toLocaleString(), sub: "unique supporters" },
    { label: "Total Given", value: formatCurrency(metrics.totalGiven), sub: "from all donors" },
    { label: "Avg Donor Value", value: formatCurrency(metrics.avgDonorValue), sub: "per donor" },
    { label: "Repeat Donors", value: metrics.repeatDonors.toLocaleString(), sub: "gave more than once" },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{c.label}</dt>
          <dd className="truncate text-xl font-bold tabular-nums text-zinc-900">{c.value}</dd>
          <span className="text-[11px] text-zinc-400">{c.sub}</span>
        </div>
      ))}
    </dl>
  );
}

// ── Donor detail sheet ────────────────────────────────────────────────────────

function DonorDetailSheet({
  donor,
  fundraiserTitle,
  onClose,
}: {
  donor: DonorRecord;
  fundraiserTitle: string;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-zinc-950/30 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Donor details"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white px-5 pb-10 pt-5 shadow-2xl sm:inset-auto sm:right-5 sm:top-1/2 sm:w-96 sm:translate-y-[-50%] sm:rounded-2xl sm:border"
      >
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DonorAvatar name={donor.displayName} isAnonymous={donor.isAnonymous} />
            <div>
              <h2 className="text-base font-black text-zinc-950">
                {donor.isAnonymous ? "Anonymous Donor" : donor.displayName}
              </h2>
              <p className="text-xs text-zinc-400">{fundraiserTitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Aggregated stats */}
        <dl className="mb-5 grid grid-cols-2 gap-3">
          {[
            { label: "Total Given", value: formatCurrency(donor.totalGiven) },
            { label: "Donations", value: donor.donationCount.toString() },
            { label: "Avg Gift", value: formatCurrency(donor.avgGift) },
            { label: "Repeat Donor", value: donor.isRepeat ? "Yes" : "No" },
          ].map((item) => (
            <div key={item.label} className="rounded-lg bg-zinc-50 px-3 py-2.5">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{item.label}</dt>
              <dd className="mt-0.5 text-sm font-bold text-zinc-900">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">Donation History</h3>
          <span className="text-xs text-zinc-400">This fundraiser only</span>
        </div>

        {/* Donation history for this donor, this fundraiser only */}
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {donor.donations.map((d: DonorDonation) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-xs text-zinc-500">{formatDate(d.created_at)}</span>
              <span className="text-sm font-bold tabular-nums text-zinc-900">{formatCurrency(d.amount)}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-center text-[11px] text-zinc-400">
          First: {formatDate(donor.firstDonation)} · Last: {formatDate(donor.lastDonation)}
        </p>
      </div>
    </>
  );
}

// ── Pagination controls ───────────────────────────────────────────────────────

function PaginationControls({
  currentPage,
  totalCount,
  pageSize,
  onPage,
}: {
  currentPage: number;
  totalCount: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const from = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalCount);

  function buildPages(): (number | "...")[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | "...")[] = [1];
    if (currentPage > 3) pages.push("...");
    for (let p = Math.max(2, currentPage - 1); p <= Math.min(totalPages - 1, currentPage + 1); p++) pages.push(p);
    if (currentPage < totalPages - 2) pages.push("...");
    pages.push(totalPages);
    return pages;
  }

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-xs text-zinc-500">
        {totalCount === 0 ? "No results" : `${from}–${to} of ${totalCount.toLocaleString()} donors`}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {buildPages().map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-1 text-zinc-400">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p as number)}
              className={
                p === currentPage
                  ? "flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-orange-600 px-2 text-xs font-bold text-white"
                  : "flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-zinc-200 px-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
              }
              aria-current={p === currentPage ? "page" : undefined}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DonorsClient({
  fundraiserId,
  fundraiserTitle,
  donors,
  totalCount,
  pageSize,
  currentPage,
  currentQ,
  currentSort,
  metrics,
}: {
  fundraiserId: string;
  fundraiserTitle: string;
  donors: DonorRecord[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  currentQ: string;
  currentSort: string;
  metrics: DonorMetrics;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [selectedDonor, setSelectedDonor] = useState<DonorRecord | null>(null);
  const [searchValue, setSearchValue] = useState(currentQ);

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const current = { q: currentQ, sort: currentSort, page: String(currentPage) };
    const merged = { ...current, ...overrides };
    if (merged.q) p.set("q", merged.q);
    if (merged.sort && merged.sort !== "total_desc") p.set("sort", merged.sort);
    if (merged.page && merged.page !== "1") p.set("page", merged.page);
    const qs = p.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function navigate(overrides: Record<string, string>) {
    startTransition(() => router.push(buildUrl(overrides)));
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ q: searchValue, page: "1" });
  }

  function handlePage(p: number) {
    navigate({ page: String(p) });
  }

  const sortOptions = [
    { value: "total_desc", label: "Highest Total" },
    { value: "total_asc", label: "Lowest Total" },
    { value: "count_desc", label: "Most Donations" },
    { value: "newest", label: "Most Recent Activity" },
    { value: "oldest", label: "Earliest Activity" },
  ];

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="pb-5">
        <h1 className="text-2xl font-black text-zinc-950">Donors</h1>
        <p className="mt-1 text-sm text-zinc-500">Supporters of {fundraiserTitle}</p>
      </div>

      {/* Summary metrics */}
      <div className="pb-5">
        <MetricsStrip metrics={metrics} />
      </div>

      {/* Sticky toolbar */}
      <StickyTableToolbar>
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              placeholder="Search donors..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              aria-label="Search donors"
            />
          </div>

          {/* Sort */}
          <div className="relative flex items-center gap-1">
            <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400" />
            <select
              value={currentSort}
              onChange={(e) => navigate({ sort: e.target.value, page: "1" })}
              className="h-9 rounded-lg border border-zinc-200 bg-white pl-2 pr-7 text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              aria-label="Sort donors"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {currentQ && (
            <button
              type="button"
              onClick={() => { setSearchValue(""); navigate({ q: "", page: "1" }); }}
              className="flex h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}

          {isPending && <span className="text-xs text-zinc-400 animate-pulse">Loading…</span>}
        </form>
      </StickyTableToolbar>

      {/* Table */}
      <div className="min-h-[200px]">
        {donors.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Users className="h-10 w-10 text-zinc-200" />
            <p className="text-sm font-semibold text-zinc-900">
              {currentQ ? "No donors match your search." : "No donors yet."}
            </p>
            {!currentQ && (
              <p className="text-xs text-zinc-500">Donors will appear here once the first donation is received.</p>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full border-collapse text-sm" role="table" aria-label="Donors">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/60">
                    <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Donor</th>
                    <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Donations</th>
                    <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Total Given</th>
                    <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Avg Gift</th>
                    <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Last Donation</th>
                    <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {donors.map((d) => (
                    <tr key={d.key} className="bg-white transition hover:bg-zinc-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <DonorAvatar name={d.displayName} isAnonymous={d.isAnonymous} />
                          <div className="min-w-0">
                            <p className={
                              `truncate text-sm font-semibold ${d.isAnonymous ? "italic text-zinc-400" : "text-zinc-900"}`
                            }>
                              {d.displayName}
                            </p>
                            {d.isRepeat && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600">
                                Repeat donor
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-zinc-900">
                        {d.donationCount}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-zinc-900">
                        {formatCurrency(d.totalGiven)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                        {formatCurrency(d.avgGift)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{formatDate(d.lastDonation)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedDonor(d)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                        >
                          View
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-zinc-100">
              {donors.map((d) => (
                <div key={d.key} className="bg-white px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <DonorAvatar name={d.displayName} isAnonymous={d.isAnonymous} />
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-bold ${d.isAnonymous ? "italic text-zinc-400" : "text-zinc-900"}`}>
                          {d.displayName}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {d.donationCount} {d.donationCount === 1 ? "donation" : "donations"} ·{" "}
                          <span className="font-semibold tabular-nums text-zinc-700">{formatCurrency(d.totalGiven)}</span>
                          {" "} total ·{" "}
                          <span className="tabular-nums">{formatCurrency(d.avgGift)}</span> avg
                        </p>
                        <p className="mt-0.5 text-[11px] text-zinc-400">
                          Last: {formatDate(d.lastDonation)}
                          {d.isRepeat && <span className="ml-1.5 font-semibold text-orange-600">· Repeat</span>}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDonor(d)}
                      className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                    >
                      View →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Sticky pagination */}
      {totalCount > pageSize && (
        <StickyTablePagination>
          <PaginationControls
            currentPage={currentPage}
            totalCount={totalCount}
            pageSize={pageSize}
            onPage={handlePage}
          />
        </StickyTablePagination>
      )}

      {/* Donor detail sheet */}
      {selectedDonor && (
        <DonorDetailSheet
          donor={selectedDonor}
          fundraiserTitle={fundraiserTitle}
          onClose={() => setSelectedDonor(null)}
        />
      )}
    </div>
  );
}
