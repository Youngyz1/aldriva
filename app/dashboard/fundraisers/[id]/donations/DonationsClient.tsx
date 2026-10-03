"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  Heart,
  ArrowUpDown,
  Filter,
  ExternalLink,
} from "lucide-react";
import StickyTableToolbar, { StickyTablePagination } from "@/components/ui/sticky-table-toolbar";
import type { DonationRow, DonationMetrics } from "./page";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " +
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function statusMeta(status: string | null) {
  switch (status) {
    case "succeeded":
      return { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    case "pending":
      return { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "failed":
      return { label: "Failed", cls: "bg-red-50 text-red-600 border-red-200" };
    case "refunded":
      return { label: "Refunded", cls: "bg-zinc-100 text-zinc-600 border-zinc-200" };
    default:
      return { label: "Completed", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
}

function methodLabel(paymentIntentId: string | null): string {
  if (!paymentIntentId) return "—";
  if (paymentIntentId.startsWith("pi_")) return "Card";
  if (paymentIntentId.startsWith("NOWPay")) return "Crypto";
  return "Online";
}

// ── Metrics strip ─────────────────────────────────────────────────────────────

function MetricsStrip({ metrics }: { metrics: DonationMetrics }) {
  const cards = [
    { label: "Total Donations", value: metrics.total.toLocaleString(), sub: "transactions" },
    { label: "Total Raised", value: formatCurrency(metrics.totalAmount), sub: "succeeded" },
    { label: "Average Donation", value: formatCurrency(metrics.avgAmount), sub: "per donation" },
    {
      label: "Today",
      value: formatCurrency(metrics.todayAmount),
      sub: `${metrics.todayCount} ${metrics.todayCount === 1 ? "gift" : "gifts"} today`,
    },
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

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  const { label, cls } = statusMeta(status);
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ── Donation detail sheet ─────────────────────────────────────────────────────

function DonationDetailSheet({
  donation,
  fundraiserTitle,
  onClose,
}: {
  donation: DonationRow;
  fundraiserTitle: string;
  onClose: () => void;
}) {
  const { label } = statusMeta(donation.status);
  const refDisplay = donation.payment_intent_id
    ? donation.payment_intent_id.slice(-8).toUpperCase()
    : "—";

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
        aria-label="Donation details"
        className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-zinc-200 bg-white px-5 pb-10 pt-5 shadow-2xl sm:inset-auto sm:right-5 sm:top-1/2 sm:w-96 sm:translate-y-[-50%] sm:rounded-2xl sm:border"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-black text-zinc-950">Donation Details</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <dl className="space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <dt className="text-sm text-zinc-500">Donor</dt>
            <dd className="text-sm font-bold text-zinc-900">
              {donation.donor_name === "Anonymous" || !donation.donor_name ? "Anonymous" : donation.donor_name}
            </dd>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <dt className="text-sm text-zinc-500">Amount</dt>
            <dd className="text-sm font-bold tabular-nums text-zinc-900">
              {formatCurrency(donation.amount)}
            </dd>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <dt className="text-sm text-zinc-500">Date</dt>
            <dd className="text-sm font-semibold text-zinc-900">{formatDateTime(donation.created_at)}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <dt className="text-sm text-zinc-500">Status</dt>
            <dd><StatusBadge status={donation.status} /></dd>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <dt className="text-sm text-zinc-500">Method</dt>
            <dd className="text-sm font-semibold text-zinc-900">{methodLabel(donation.payment_intent_id)}</dd>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <dt className="text-sm text-zinc-500">Reference</dt>
            <dd className="font-mono text-xs text-zinc-500">{refDisplay}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-sm text-zinc-500">Fundraiser</dt>
            <dd className="max-w-[180px] truncate text-sm font-semibold text-zinc-900">{fundraiserTitle}</dd>
          </div>
        </dl>
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
        {totalCount === 0 ? "No results" : `${from}–${to} of ${totalCount.toLocaleString()}`}
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

export default function DonationsClient({
  fundraiserId,
  fundraiserTitle,
  donations,
  totalCount,
  pageSize,
  currentPage,
  currentQ,
  currentStatus,
  currentSort,
  metrics,
}: {
  fundraiserId: string;
  fundraiserTitle: string;
  donations: DonationRow[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  currentQ: string;
  currentStatus: string;
  currentSort: string;
  metrics: DonationMetrics;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [selectedDonation, setSelectedDonation] = useState<DonationRow | null>(null);
  const [searchValue, setSearchValue] = useState(currentQ);

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams();
    const current = { q: currentQ, status: currentStatus, sort: currentSort, page: String(currentPage) };
    const merged = { ...current, ...overrides };
    if (merged.q) p.set("q", merged.q);
    if (merged.status && merged.status !== "all") p.set("status", merged.status);
    if (merged.sort && merged.sort !== "newest") p.set("sort", merged.sort);
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
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
    { value: "amount_desc", label: "Highest Amount" },
    { value: "amount_asc", label: "Lowest Amount" },
  ];

  const statusOptions = [
    { value: "all", label: "All Statuses" },
    { value: "succeeded", label: "Completed" },
    { value: "pending", label: "Pending" },
    { value: "failed", label: "Failed" },
    { value: "refunded", label: "Refunded" },
  ];

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="pb-5">
        <h1 className="text-2xl font-black text-zinc-950">Donations</h1>
        <p className="mt-1 text-sm text-zinc-500">Donations received by {fundraiserTitle}</p>
      </div>

      {/* Summary metrics */}
      <div className="pb-5">
        <MetricsStrip metrics={metrics} />
      </div>

      {/* Sticky toolbar */}
      <StickyTableToolbar>
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              placeholder="Search donations..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              className="h-9 w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              aria-label="Search donations"
            />
          </div>

          {/* Status filter */}
          <div className="relative flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-zinc-400" />
            <select
              value={currentStatus}
              onChange={(e) => navigate({ status: e.target.value, page: "1" })}
              className="h-9 rounded-lg border border-zinc-200 bg-white pl-2 pr-7 text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              aria-label="Filter by status"
            >
              {statusOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <div className="relative flex items-center gap-1">
            <ArrowUpDown className="h-3.5 w-3.5 text-zinc-400" />
            <select
              value={currentSort}
              onChange={(e) => navigate({ sort: e.target.value, page: "1" })}
              className="h-9 rounded-lg border border-zinc-200 bg-white pl-2 pr-7 text-sm font-medium text-zinc-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              aria-label="Sort donations"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Clear search */}
          {(currentQ || currentStatus !== "all") && (
            <button
              type="button"
              onClick={() => { setSearchValue(""); navigate({ q: "", status: "all", page: "1" }); }}
              className="flex h-9 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-600 hover:bg-zinc-50"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}

          {isPending && (
            <span className="text-xs text-zinc-400 animate-pulse">Loading…</span>
          )}
        </form>
      </StickyTableToolbar>

      {/* Table */}
      <div className="min-h-[200px]">
        {donations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Heart className="h-10 w-10 text-zinc-200" />
            <p className="text-sm font-semibold text-zinc-900">
              {currentQ || currentStatus !== "all" ? "No donations match your filters." : "No donations yet."}
            </p>
            {!currentQ && currentStatus === "all" && (
              <p className="text-xs text-zinc-500">Share your fundraiser to get your first donation.</p>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <table className="w-full border-collapse text-sm" role="table" aria-label="Donations">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50/60">
                    <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Donor</th>
                    <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Amount</th>
                    <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Date</th>
                    <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Status</th>
                    <th scope="col" className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Method</th>
                    <th scope="col" className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {donations.map((d) => (
                    <tr
                      key={d.id}
                      className="bg-white transition hover:bg-zinc-50/60"
                    >
                      <td className="px-4 py-3 font-semibold text-zinc-900">
                        {d.donor_name === "Anonymous" || !d.donor_name ? (
                          <span className="text-zinc-400 italic">Anonymous</span>
                        ) : (
                          d.donor_name
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-zinc-900">
                        {formatCurrency(d.amount)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{formatDate(d.created_at)}</td>
                      <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                      <td className="px-4 py-3 text-zinc-600">{methodLabel(d.payment_intent_id)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedDonation(d)}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-700 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-zinc-100">
              {donations.map((d) => (
                <div key={d.id} className="bg-white px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-zinc-900">
                        {d.donor_name === "Anonymous" || !d.donor_name ? (
                          <span className="text-zinc-400 italic">Anonymous</span>
                        ) : d.donor_name}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        <span className="font-semibold tabular-nums text-zinc-700">{formatCurrency(d.amount)}</span>
                        {" · "}
                        <StatusBadge status={d.status} />
                        {" · "}
                        {methodLabel(d.payment_intent_id)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-zinc-400">{formatDate(d.created_at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedDonation(d)}
                      className="shrink-0 rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                    >
                      View
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

      {/* Donation detail sheet */}
      {selectedDonation && (
        <DonationDetailSheet
          donation={selectedDonation}
          fundraiserTitle={fundraiserTitle}
          onClose={() => setSelectedDonation(null)}
        />
      )}
    </div>
  );
}
