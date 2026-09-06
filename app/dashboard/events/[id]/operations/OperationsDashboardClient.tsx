"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Activity,
  Users,
  CheckCircle2,
  Armchair,
  Ticket,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  ShieldCheck,
  Download,
  QrCode,
  Calendar,
  MapPin,
  Mail,
  UserCheck,
  AlertCircle,
  FileSpreadsheet,
} from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardStatsCards from "@/components/dashboard/DashboardStatsCards";
import type { OperationalMetrics } from "@/lib/event-metrics";
import type { AuditLogEntry } from "@/lib/event-audit";

interface Props {
  eventId: string;
  initialMetrics: OperationalMetrics;
  initialAudit: AuditLogEntry[];
}

export default function OperationsDashboardClient({
  eventId,
  initialMetrics,
  initialAudit,
}: Props) {
  const [metrics, setMetrics] = useState<OperationalMetrics>(initialMetrics);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(initialAudit);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/operations?include_audit=true`);
      if (res.ok) {
        const data = await res.json();
        if (data.metrics) setMetrics(data.metrics);
        if (data.auditHistory) setAuditLogs(data.auditHistory);
        setLastRefreshed(new Date());
      }
    } catch (err) {
      console.warn("Failed to refresh operational metrics:", err);
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  const { event, guests, tickets, seating, checkin, vip, alerts } = metrics;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <DashboardPageHeader
        title="Event Operations Center"
        description="Authoritative live operational overview, seating utilization, attendance velocity, and audit trail."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchLatest}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 shadow-sm transition hover:bg-zinc-50 active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin text-orange-500" : ""} />
              {loading ? "Refreshing..." : "Refresh"}
            </button>
            <Link
              href={`/dashboard/events/${eventId}/scan`}
              className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-orange-700"
            >
              <QrCode size={14} />
              Open Door Scanner
            </Link>
          </div>
        }
      />

      {/* Operational Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-start gap-3 rounded-2xl border p-4 shadow-sm ${
                alert.level === "critical"
                  ? "border-red-200 bg-red-50 text-red-900"
                  : alert.level === "warning"
                  ? "border-amber-200 bg-amber-50 text-amber-900"
                  : "border-blue-200 bg-blue-50 text-blue-900"
              }`}
            >
              <AlertCircle
                size={18}
                className={`mt-0.5 shrink-0 ${
                  alert.level === "critical"
                    ? "text-red-600"
                    : alert.level === "warning"
                    ? "text-amber-600"
                    : "text-blue-600"
                }`}
              />
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider">{alert.title}</h4>
                <p className="mt-0.5 text-xs font-medium">{alert.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Top 4 Operational KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Check-in / Attendance */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Live Attendance</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserCheck size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-zinc-900">{checkin.total_checked_in}</span>
            <span className="text-xs font-bold text-zinc-500">/ {tickets.total_issued} credentials</span>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs font-semibold text-zinc-600">
              <span>Attendance Rate</span>
              <span>{checkin.attendance_rate}%</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(checkin.attendance_rate, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Seating Utilization */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Seating Capacity</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
              <Armchair size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-zinc-900">
              {seating.assigned + seating.sold}
            </span>
            <span className="text-xs font-bold text-zinc-500">/ {seating.total_seats} seats</span>
          </div>
          <div className="mt-3">
            <div className="flex justify-between text-xs font-semibold text-zinc-600">
              <span>Utilization</span>
              <span>{seating.utilization_percentage}%</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full bg-violet-600 transition-all duration-500"
                style={{ width: `${Math.min(seating.utilization_percentage, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Card 3: Guest RSVPs */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Guest RSVPs</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
              <Mail size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-zinc-900">{guests.accepted}</span>
            <span className="text-xs font-bold text-zinc-500">accepted / {guests.total_invited} invited</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-semibold text-zinc-600">
            <span className="text-amber-600">{guests.pending_rsvp} pending</span>
            <span className="text-zinc-400">{guests.declined} declined</span>
          </div>
        </div>

        {/* Card 4: Ticket Revenue / Reconciliation */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Ticket Revenue</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Ticket size={18} />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-black text-zinc-900">${tickets.gross_revenue.toLocaleString()}</span>
            <span className="text-xs font-bold text-zinc-500">reconciled</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs font-semibold text-zinc-600">
            <span>{tickets.paid_sold} tickets sold</span>
            <span className="text-emerald-600">{tickets.tickets_available} remaining</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Operational Panels */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column (2 spans): Check-in Stream & Seating Breakdown */}
        <div className="space-y-6 lg:col-span-2">
          {/* Quick Operations Shortcuts */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
              Operational Command Shortcuts
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Link
                href={`/dashboard/events/${eventId}/guests`}
                className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-center transition hover:border-orange-200 hover:bg-orange-50/30"
              >
                <Users className="mb-2 text-orange-600" size={20} />
                <span className="text-xs font-bold text-zinc-900">Manage Guests</span>
                <span className="text-[10px] text-zinc-500">{guests.total_invited} Records</span>
              </Link>
              <Link
                href={`/dashboard/events/${eventId}/seating`}
                className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-center transition hover:border-violet-200 hover:bg-violet-50/30"
              >
                <Armchair className="mb-2 text-violet-600" size={20} />
                <span className="text-xs font-bold text-zinc-900">Venue & Seating</span>
                <span className="text-[10px] text-zinc-500">{seating.total_seats} Seats</span>
              </Link>
              <Link
                href={`/dashboard/events/${eventId}/checkins`}
                className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-center transition hover:border-emerald-200 hover:bg-emerald-50/30"
              >
                <CheckCircle2 className="mb-2 text-emerald-600" size={20} />
                <span className="text-xs font-bold text-zinc-900">Check-in Roster</span>
                <span className="text-[10px] text-zinc-500">{checkin.total_checked_in} Arrived</span>
              </Link>
              <Link
                href={`/api/events/${eventId}/export?type=guests`}
                target="_blank"
                className="flex flex-col items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-center transition hover:border-blue-200 hover:bg-blue-50/30"
              >
                <FileSpreadsheet className="mb-2 text-blue-600" size={20} />
                <span className="text-xs font-bold text-zinc-900">Export Guest List</span>
                <span className="text-[10px] text-zinc-500">RFC 4180 CSV</span>
              </Link>
            </div>
          </div>

          {/* Recent Door Check-ins Stream */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h3 className="text-sm font-black text-zinc-900">Live Check-in Activity</h3>
                <p className="text-xs text-zinc-500">Real-time gate scan verification stream</p>
              </div>
              <Link
                href={`/dashboard/events/${eventId}/checkins`}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:underline"
              >
                View Full Roster <ArrowRight size={12} />
              </Link>
            </div>

            <div className="mt-3 divide-y divide-zinc-100">
              {checkin.recent_checkins.length > 0 ? (
                checkin.recent_checkins.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <UserCheck size={14} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-zinc-900">{item.guest_or_buyer_name}</span>
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-600">
                            {item.tier_name}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {item.seat_label || "General Admission"}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-emerald-600">Verified</span>
                      <div className="text-[10px] text-zinc-400">
                        {new Date(item.checked_in_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-xs text-zinc-400">
                  No check-ins recorded yet for this event.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Seating Status & Audit Trail */}
        <div className="space-y-6">
          {/* Seating Occupancy Snapshot */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-black text-zinc-900">Seating Distribution</h3>
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-700">
                  <span>Available Seats</span>
                  <span>{seating.available}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: seating.total_seats > 0 ? `${(seating.available / seating.total_seats) * 100}%` : "0%",
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-700">
                  <span>Assigned to Invited Guests</span>
                  <span>{seating.assigned}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full bg-orange-500"
                    style={{
                      width: seating.total_seats > 0 ? `${(seating.assigned / seating.total_seats) * 100}%` : "0%",
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-700">
                  <span>Sold via Ticketing</span>
                  <span>{seating.sold}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full bg-violet-600"
                    style={{
                      width: seating.total_seats > 0 ? `${(seating.sold / seating.total_seats) * 100}%` : "0%",
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-zinc-700">
                  <span>Active Purchase Holds</span>
                  <span>{seating.reserved}</span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className="h-full bg-amber-400"
                    style={{
                      width: seating.total_seats > 0 ? `${(seating.reserved / seating.total_seats) * 100}%` : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Operational Audit Log Stream */}
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-zinc-600" />
                <h3 className="text-sm font-black text-zinc-900">Operational Audit Trail</h3>
              </div>
              <span className="text-[10px] font-bold text-zinc-400">Append-Only</span>
            </div>

            <div className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
              {auditLogs && auditLogs.length > 0 ? (
                auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-900">
                        {log.action.replace(/_/g, " ").toUpperCase()}
                      </span>
                      <span className="text-[10px] text-zinc-400">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-600">
                      Actor: <span className="font-semibold text-zinc-800">{log.actor_name || log.actor_role}</span>
                      {log.target_type && ` · Target: ${log.target_type}`}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-6 text-center text-xs text-zinc-400">
                  No audit log entries recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
