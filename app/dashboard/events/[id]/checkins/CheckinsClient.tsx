"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Scan, Users, CheckCircle2, Search, ArrowLeft, Loader2, UserCheck } from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardStatsCards from "@/components/dashboard/DashboardStatsCards";
import DashboardToolbar from "@/components/dashboard/DashboardToolbar";
import DashboardTableCard from "@/components/dashboard/DashboardTableCard";
import DashboardEmptyState from "@/components/dashboard/DashboardEmptyState";
import { formatAdminDate } from "@/lib/admin-query";

type Stats = {
  total_sold: number;
  checked_in: number;
  not_arrived: number;
  attendance_rate: number;
};

type ScannerBreakdownItem = {
  scanner_id: string;
  name: string;
  email: string;
  count: number;
};

type CheckinHistoryRow = {
  id: string;
  buyer_name: string | null;
  buyer_email: string | null;
  seat_label: string | null;
  quantity: number;
  checked_in_at: string | null;
  qr_code: string;
  scanned_by_name: string;
};

type Props = {
  eventId: string;
  eventTitle: string;
};

export default function CheckinsClient({ eventId, eventTitle }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [scannerBreakdown, setScannerBreakdown] = useState<ScannerBreakdownItem[]>([]);
  const [historyRows, setHistoryRows] = useState<CheckinHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [scannerFilter, setScannerFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
        search,
        scanner_id: scannerFilter,
      });

      const res = await fetch(`/api/events/${eventId}/checkins?${params}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to load check-in data.");

      setStats(data.stats || null);
      setScannerBreakdown(data.scanner_breakdown || []);
      setHistoryRows(data.history?.items || []);
      setTotalCount(data.history?.total || 0);
      setTotalPages(data.history?.total_pages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load check-in data.");
    } finally {
      setLoading(false);
    }
  }, [eventId, page, perPage, search, scannerFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const statItems = useMemo(
    () =>
      stats
        ? [
            { label: "Total Sold", value: stats.total_sold },
            { label: "Checked In", value: stats.checked_in, accent: "text-emerald-600" },
            { label: "Attendance Rate", value: `${stats.attendance_rate}%`, accent: "text-orange-600" },
            { label: "Not Arrived", value: stats.not_arrived, accent: "text-zinc-500" },
          ]
        : [],
    [stats]
  );

  const scannerOptions = useMemo(
    () => [
      { value: "all", label: "All Scanners" },
      ...scannerBreakdown.map((s) => ({
        value: s.scanner_id,
        label: `${s.name} (${s.count})`,
      })),
    ],
    [scannerBreakdown]
  );

  return (
    <div className="space-y-6">
      <DashboardPageHeader
        eyebrow="Event Attendance"
        title={`Check-Ins — ${eventTitle}`}
        description="Live attendance rates, staff scanner breakdowns, and verified check-in history."
        action={
          <div className="flex gap-2">
            <Link
              href={`/dashboard/events/${eventId}/scan`}
              className="flex items-center gap-1.5 shrink-0 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white hover:bg-orange-700"
            >
              <Scan size={15} /> Launch Door Scanner
            </Link>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Headline Stats Cards */}
      {stats && <DashboardStatsCards items={statItems} />}

      {/* Breakdown by Scanner Section */}
      {scannerBreakdown.length > 0 && (
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-xs sm:p-6 space-y-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-800 flex items-center gap-2">
            <UserCheck size={18} className="text-orange-600" /> Door Staff Breakdown
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scannerBreakdown.map((item) => (
              <div
                key={item.scanner_id}
                className="rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-4 flex items-center justify-between"
              >
                <div className="min-w-0 pr-2">
                  <p className="font-black text-zinc-950 text-sm truncate">{item.name}</p>
                  <p className="text-xs font-medium text-zinc-500 truncate">{item.email}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="text-lg font-black text-orange-600">{item.count}</span>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">Scans</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <DashboardToolbar
        search={search}
        searchPlaceholder="Search guest name, email, or code..."
        onSearchChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        filters={[
          {
            id: "scanner",
            label: "Scanner Staff",
            value: scannerFilter,
            options: scannerOptions,
            onChange: (v) => {
              setScannerFilter(v);
              setPage(1);
            },
          },
        ]}
        filtersOpen={filtersOpen}
        onToggleFilters={() => setFiltersOpen((v) => !v)}
      />

      {/* Filterable Check-In History Table Card */}
      <DashboardTableCard
        loading={loading}
        page={page}
        totalPages={totalPages}
        perPage={perPage}
        total={totalCount}
        onPageChange={(p) => setPage(p)}
        onPerPageChange={(n) => {
          setPerPage(n);
          setPage(1);
        }}
        isEmpty={historyRows.length === 0}
        empty={
          <DashboardEmptyState
            title="No check-ins found"
            description="Check-ins recorded at the door will appear here live."
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-xs font-black uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-4 py-3">Guest Name</th>
                <th className="py-3 pr-4">Email</th>
                <th className="py-3 pr-4">Seat / Qty</th>
                <th className="py-3 pr-4">Checked In At</th>
                <th className="px-4 py-3">Scanned By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {historyRows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-50/70">
                  <td className="px-4 py-3 font-black text-zinc-950">
                    {row.buyer_name || "Guest"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-600 font-medium">
                    {row.buyer_email || "—"}
                  </td>
                  <td className="py-3 pr-4 text-zinc-700 font-semibold">
                    {row.seat_label ? `${row.seat_label} (${row.quantity}x)` : `${row.quantity} ticket(s)`}
                  </td>
                  <td className="py-3 pr-4 font-bold text-emerald-700">
                    {row.checked_in_at ? formatAdminDate(row.checked_in_at) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-700">
                      {row.scanned_by_name}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardTableCard>
    </div>
  );
}
