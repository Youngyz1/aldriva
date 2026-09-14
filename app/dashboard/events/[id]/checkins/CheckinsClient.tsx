"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Scan, UserCheck, CloudUpload, ShieldAlert } from "lucide-react";
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
  delegating_by_name?: string | null;
  scan_source?: string | null;
  offline_scanned_at?: string | null;
};

type ConflictItem = {
  id: string;
  ticket_instance_id: string;
  offline_scan_id: string;
  device_id: string;
  entrance_id: string;
  scanned_by_name: string;
  delegating_by_name: string;
  offline_scanned_at: string;
  conflict_reason: string;
  created_at: string;
};

type Props = {
  eventId: string;
  eventTitle: string;
};

export default function CheckinsClient({ eventId, eventTitle }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [conflictsCount, setConflictsCount] = useState<number>(0);
  const [conflictsList, setConflictsList] = useState<ConflictItem[]>([]);
  const [showConflictsModal, setShowConflictsModal] = useState<boolean>(false);
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
      setConflictsCount(data.conflicts_count || 0);
      setConflictsList(data.conflicts || []);
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
              className="flex items-center gap-1.5 shrink-0 rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-black text-white hover:bg-orange-700 shadow-xs"
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

      {/* Offline Conflict Alert Banner */}
      {conflictsCount > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 sm:p-5 text-amber-950 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black uppercase tracking-tight text-amber-900">
                {conflictsCount} Offline Scan Conflict{conflictsCount === 1 ? "" : "s"} Detected
              </p>
              <p className="text-xs font-medium text-amber-800 mt-0.5">
                Duplicate scans occurred while devices were offline. First scan timestamp was preserved as canonical; duplicate attempts are archived for audit.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowConflictsModal(true)}
            className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700 transition shadow-2xs"
          >
            Review Conflicts Log
          </button>
        </div>
      )}

      {/* Headline Stats Cards */}
      {stats && <DashboardStatsCards items={statItems} />}

      {/* Breakdown by Scanner Section */}
      {scannerBreakdown.length > 0 && (
        <div className="space-y-4 border-t border-zinc-200 pt-6">
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
                <th className="px-4 py-3">Scanned By / Method</th>
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
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-700">
                          {row.scanned_by_name}
                        </span>
                        {row.scan_source === "offline_sync" && (
                          <span className="rounded-full bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 text-[10px] font-bold flex items-center gap-1">
                            <CloudUpload size={10} /> Offline Sync
                          </span>
                        )}
                      </div>
                      {row.delegating_by_name && row.delegating_by_name !== row.scanned_by_name && (
                        <span className="text-[10px] text-zinc-400">
                          Authorized by: {row.delegating_by_name}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardTableCard>

      {/* Conflicts Modal */}
      {showConflictsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-zinc-200">
            <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between bg-zinc-50">
              <div className="flex items-center gap-2">
                <ShieldAlert size={18} className="text-amber-600" />
                <h3 className="text-base font-black text-zinc-950">Offline Scan Conflicts Log</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowConflictsModal(false)}
                className="text-zinc-500 hover:text-zinc-800 text-sm font-bold"
              >
                ✕ Close
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <p className="text-xs text-zinc-600">
                The following scans were attempted while multiple devices were offline or before connection returned. The canonical winning check-in remains the earliest verified scan.
              </p>
              <div className="space-y-3">
                {conflictsList.map((c) => (
                  <div key={c.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-amber-950 uppercase tracking-wide">
                        Reason: {c.conflict_reason}
                      </span>
                      <span className="text-zinc-500">{formatAdminDate(c.offline_scanned_at)}</span>
                    </div>
                    <div className="text-zinc-700 grid grid-cols-2 gap-1 pt-1">
                      <p><strong>Scanned By:</strong> {c.scanned_by_name}</p>
                      <p><strong>Prepped By:</strong> {c.delegating_by_name}</p>
                      <p className="truncate"><strong>Device ID:</strong> {c.device_id || "—"}</p>
                      <p><strong>Scan ID:</strong> {c.offline_scan_id.substring(0, 8)}...</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-6 py-3 border-t border-zinc-200 bg-zinc-50 text-right">
              <button
                type="button"
                onClick={() => setShowConflictsModal(false)}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
