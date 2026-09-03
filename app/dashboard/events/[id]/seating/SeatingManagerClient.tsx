"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  Star,
  StarOff,
  Filter,
  Search,
  X,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  TableProperties,
  List,
} from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardEmptyState from "@/components/dashboard/DashboardEmptyState";

// ─── Types ───────────────────────────────────────────────────────────────────

export type SeatRow = {
  id: string;
  event_id: string;
  layout_id: string;
  section: string;
  row_label: string;
  seat_number: number;
  table_number: string | null;
  table_name: string | null;
  table_capacity: number | null;
  is_vip: boolean;
  status: string;
  reserved_until: string | null;
  price_override: number | null;
  ticket_id: string | null;
  assigned_invitation_id: string | null;
  invitation?: {
    id: string;
    guest_name: string;
    guest_title: string | null;
    organization: string | null;
    invitation_status: string;
    rsvp_status: string;
  } | null;
};

export type InvitationOption = {
  id: string;
  guest_name: string;
  guest_title: string | null;
  organization: string | null;
  invitation_status: string;
  rsvp_status: string;
  current_seat_id: string | null;
};

export type LayoutInfo = {
  id: string;
  name: string;
  sections: { name: string; rows: number; seatsPerRow: number }[];
} | null;

type Props = {
  eventId: string;
  eventTitle: string;
  layout: LayoutInfo;
  initialSeats: SeatRow[];
  invitations: InvitationOption[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isActivelyReserved(seat: SeatRow): boolean {
  return (
    seat.status === "reserved" &&
    !!seat.reserved_until &&
    new Date(seat.reserved_until) > new Date()
  );
}

function isAssignable(seat: SeatRow): boolean {
  return seat.status !== "sold" && !isActivelyReserved(seat);
}

function seatLabel(seat: SeatRow): string {
  if (seat.table_number) {
    const tablePart = seat.table_name
      ? `Table ${seat.table_number} (${seat.table_name})`
      : `Table ${seat.table_number}`;
    return `${tablePart}, Seat ${seat.seat_number}`;
  }
  return `${seat.section} · Row ${seat.row_label} · Seat ${seat.seat_number}`;
}

function statusBadge(seat: SeatRow) {
  if (seat.status === "sold")
    return { label: "Sold", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" };
  if (isActivelyReserved(seat))
    return { label: "Reserved", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  if (seat.assigned_invitation_id)
    return { label: "Guest", cls: "bg-violet-50 text-violet-700 border-violet-200" };
  if (seat.status === "available")
    return { label: "Available", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  return { label: seat.status, cls: "bg-zinc-50 text-zinc-600 border-zinc-200" };
}

// ─── Toast ───────────────────────────────────────────────────────────────────

type Toast = { type: "success" | "error"; message: string } | null;

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SeatingManagerClient({
  eventId,
  eventTitle,
  layout,
  initialSeats,
  invitations: initialInvitations,
}: Props) {
  const [seats, setSeats] = useState<SeatRow[]>(initialSeats);
  const [invitations, setInvitations] = useState<InvitationOption[]>(initialInvitations);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "table-groups">("list");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [metaEditing, setMetaEditing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedSeat = useMemo(
    () => seats.find((s) => s.id === selectedSeatId) ?? null,
    [seats, selectedSeatId]
  );

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  // ── Refresh from API ──────────────────────────────────────────────────────
  const refreshSeats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/seating`);
      if (!res.ok) throw new Error("Failed to refresh");
      const data = await res.json();
      setSeats(data.seats ?? []);
      setInvitations(data.invitations ?? []);
    } catch {
      showToast("error", "Failed to refresh seating data.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // ── Derived Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = seats.length;
    const sold = seats.filter((s) => s.status === "sold").length;
    const reserved = seats.filter((s) => isActivelyReserved(s)).length;
    const guestAssigned = seats.filter((s) => !!s.assigned_invitation_id).length;
    const vip = seats.filter((s) => s.is_vip).length;
    const available = seats.filter(
      (s) => s.status === "available" && !s.assigned_invitation_id && !isActivelyReserved(s)
    ).length;
    return { total, sold, reserved, guestAssigned, vip, available };
  }, [seats]);

  // ── Filtered & Searched Seats ─────────────────────────────────────────────
  const filteredSeats = useMemo(() => {
    let result = seats;

    // Filter
    if (filter === "available")
      result = result.filter(
        (s) => s.status === "available" && !s.assigned_invitation_id && !isActivelyReserved(s)
      );
    else if (filter === "reserved") result = result.filter(isActivelyReserved);
    else if (filter === "sold") result = result.filter((s) => s.status === "sold");
    else if (filter === "guest")
      result = result.filter((s) => !!s.assigned_invitation_id);
    else if (filter === "vip") result = result.filter((s) => s.is_vip);

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.section.toLowerCase().includes(q) ||
          s.row_label.toLowerCase().includes(q) ||
          String(s.seat_number).includes(q) ||
          (s.table_number ?? "").toLowerCase().includes(q) ||
          (s.table_name ?? "").toLowerCase().includes(q) ||
          (s.invitation?.guest_name ?? "").toLowerCase().includes(q)
      );
    }

    return result;
  }, [seats, filter, search]);

  // ── Table Groups ──────────────────────────────────────────────────────────
  const tableGroups = useMemo(() => {
    const groups = new Map<string, SeatRow[]>();
    const ungrouped: SeatRow[] = [];
    filteredSeats.forEach((s) => {
      if (s.table_number) {
        const key = s.table_number;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(s);
      } else {
        ungrouped.push(s);
      }
    });
    return { groups, ungrouped };
  }, [filteredSeats]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  async function mutate(body: object): Promise<boolean> {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/seating`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("error", data.error ?? "Operation failed.");
        return false;
      }
      await refreshSeats();
      return true;
    } catch {
      showToast("error", "Network error. Please try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleAssignSeat(invitationId: string) {
    if (!selectedSeatId) return;
    const ok = await mutate({ op: "assign_seat", seatId: selectedSeatId, invitationId });
    if (ok) {
      showToast("success", "Guest assigned to seat successfully.");
      setShowAssignModal(false);
    }
  }

  async function handleRemoveSeat() {
    if (!selectedSeat?.assigned_invitation_id) return;
    const ok = await mutate({
      op: "remove_seat",
      invitationId: selectedSeat.assigned_invitation_id,
    });
    if (ok) {
      showToast("success", "Seat assignment removed.");
      setConfirmRemove(false);
    }
  }

  async function handleToggleVip(seat: SeatRow) {
    const ok = await mutate({
      op: "update_seat_meta",
      seatId: seat.id,
      is_vip: !seat.is_vip,
    });
    if (ok) showToast("success", `VIP status ${!seat.is_vip ? "enabled" : "removed"}.`);
  }

  async function handleMarkTableVip(tableNumber: string, setVip: boolean) {
    const tableSeats = seats.filter((s) => s.table_number === tableNumber);
    for (const s of tableSeats) {
      await mutate({ op: "update_seat_meta", seatId: s.id, is_vip: setVip });
    }
    showToast("success", `Table ${tableNumber} seats ${setVip ? "marked" : "unmarked"} as VIP.`);
  }

  // ── Seat Meta Edit ────────────────────────────────────────────────────────
  const [metaForm, setMetaForm] = useState({
    table_number: "",
    table_name: "",
    table_capacity: "",
  });

  useEffect(() => {
    if (selectedSeat) {
      setMetaForm({
        table_number: selectedSeat.table_number ?? "",
        table_name: selectedSeat.table_name ?? "",
        table_capacity: selectedSeat.table_capacity ? String(selectedSeat.table_capacity) : "",
      });
      setMetaEditing(false);
      setConfirmRemove(false);
    }
  }, [selectedSeat?.id]);

  async function handleSaveMeta() {
    if (!selectedSeatId) return;
    const cap = metaForm.table_capacity ? parseInt(metaForm.table_capacity, 10) : null;
    if (metaForm.table_capacity && (isNaN(cap!) || cap! <= 0)) {
      showToast("error", "Table capacity must be a positive integer.");
      return;
    }
    const ok = await mutate({
      op: "update_seat_meta",
      seatId: selectedSeatId,
      table_number: metaForm.table_number || null,
      table_name: metaForm.table_name || null,
      table_capacity: cap,
    });
    if (ok) {
      showToast("success", "Seat metadata updated.");
      setMetaEditing(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <DashboardPageHeader
        eyebrow="Event Management"
        title="Seating Manager"
        description={eventTitle}
      />

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-5 py-3 text-sm font-black shadow-xl transition-all ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {toast.type === "success" ? <Check size={14} className="mr-1.5 inline" /> : <AlertCircle size={14} className="mr-1.5 inline" />}
          {toast.message}
        </div>
      )}

      {/* No Layout */}
      {!layout ? (
        <DashboardEmptyState
          title="No seating layout configured"
          description="This event does not have a seating layout. Seating is configured when creating or editing an event. General Admission events do not use assigned seating."
        />
      ) : (
        <>
          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Total Seats", value: stats.total, color: "text-zinc-900" },
              { label: "Available", value: stats.available, color: "text-emerald-700" },
              { label: "Reserved", value: stats.reserved, color: "text-amber-700" },
              { label: "Sold", value: stats.sold, color: "text-zinc-500" },
              { label: "Guest Assigned", value: stats.guestAssigned, color: "text-violet-700" },
              { label: "VIP Seats", value: stats.vip, color: "text-orange-600" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm"
              >
                <p className={`text-2xl font-black ${color}`}>{value}</p>
                <p className="mt-0.5 text-xs font-semibold text-zinc-500">{label}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="Search section, row, seat, table, guest…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-4 text-sm font-semibold placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* View Mode */}
            <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-white p-1">
              <button
                onClick={() => setViewMode("list")}
                className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                  viewMode === "list"
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <List size={13} className="mr-1 inline" />
                List
              </button>
              <button
                onClick={() => setViewMode("table-groups")}
                className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all ${
                  viewMode === "table-groups"
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-500 hover:text-zinc-900"
                }`}
              >
                <TableProperties size={13} className="mr-1 inline" />
                Tables
              </button>
            </div>

            {/* Loading */}
            {loading && <Loader2 size={18} className="animate-spin text-violet-500" />}
          </div>

          {/* Filter Chips */}
          <div className="flex flex-wrap gap-2">
            {[
              { id: "all", label: "All" },
              { id: "available", label: "Available" },
              { id: "reserved", label: "Reserved" },
              { id: "sold", label: "Sold" },
              { id: "guest", label: "Guest Assigned" },
              { id: "vip", label: "VIP" },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`rounded-xl border px-3.5 py-1.5 text-xs font-black transition-all ${
                  filter === id
                    ? "border-violet-500 bg-violet-600 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Main Layout: Seat List + Side Panel */}
          <div className="flex gap-5 lg:items-start">
            {/* Seat List / Table Groups */}
            <div className="min-w-0 flex-1">
              {filteredSeats.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-12 text-center">
                  <Filter size={24} className="mx-auto mb-3 text-zinc-300" />
                  <p className="text-sm font-black text-zinc-500">No seats match your filter.</p>
                </div>
              ) : viewMode === "list" ? (
                <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="border-b border-zinc-100 bg-zinc-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-black text-zinc-500">Seat</th>
                        <th className="hidden px-4 py-3 text-left text-xs font-black text-zinc-500 sm:table-cell">Table</th>
                        <th className="px-4 py-3 text-left text-xs font-black text-zinc-500">Status</th>
                        <th className="hidden px-4 py-3 text-left text-xs font-black text-zinc-500 md:table-cell">Guest</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {filteredSeats.map((seat) => {
                        const badge = statusBadge(seat);
                        const isSelected = seat.id === selectedSeatId;
                        return (
                          <tr
                            key={seat.id}
                            onClick={() => setSelectedSeatId(isSelected ? null : seat.id)}
                            className={`cursor-pointer transition-colors hover:bg-zinc-50 ${
                              isSelected ? "bg-violet-50" : ""
                            }`}
                          >
                            <td className="px-4 py-3">
                              <p className="font-black text-zinc-900">
                                {seat.section} · {seat.row_label}{seat.seat_number}
                              </p>
                              {seat.is_vip && (
                                <span className="mt-0.5 inline-flex items-center gap-1 rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-black text-orange-600">
                                  <Star size={9} />
                                  VIP
                                </span>
                              )}
                            </td>
                            <td className="hidden px-4 py-3 sm:table-cell">
                              {seat.table_number ? (
                                <span className="text-xs font-semibold text-zinc-600">
                                  Table {seat.table_number}
                                  {seat.table_name && ` · ${seat.table_name}`}
                                </span>
                              ) : (
                                <span className="text-xs text-zinc-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-black ${badge.cls}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="hidden px-4 py-3 md:table-cell">
                              {seat.invitation ? (
                                <div>
                                  <p className="text-xs font-black text-violet-800">
                                    {seat.invitation.guest_name}
                                  </p>
                                  {seat.invitation.guest_title && (
                                    <p className="text-[10px] font-semibold text-zinc-400">
                                      {seat.invitation.guest_title}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-300">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <ChevronRight
                                size={14}
                                className={isSelected ? "text-violet-500" : "text-zinc-300"}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                /* Table Groups View */
                <div className="space-y-4">
                  {Array.from(tableGroups.groups.entries()).map(([tableNumber, tableSeats]) => {
                    const firstSeat = tableSeats[0];
                    const assignedCount = tableSeats.filter((s) => s.assigned_invitation_id).length;
                    const capacity = firstSeat.table_capacity ?? tableSeats.length;
                    const allVip = tableSeats.every((s) => s.is_vip);
                    return (
                      <div key={tableNumber} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                          <div>
                            <p className="font-black text-zinc-900">
                              Table {tableNumber}
                              {firstSeat.table_name && ` — ${firstSeat.table_name}`}
                            </p>
                            <p className="text-xs font-semibold text-zinc-500">
                              Capacity: {capacity} · {assignedCount}/{tableSeats.length} assigned
                            </p>
                          </div>
                          <button
                            onClick={() => handleMarkTableVip(tableNumber, !allVip)}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-black transition-all ${
                              allVip
                                ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                            }`}
                          >
                            {allVip ? <StarOff size={12} /> : <Star size={12} />}
                            {allVip ? "Unmark VIP" : "Mark All VIP"}
                          </button>
                        </div>
                        <div className="divide-y divide-zinc-100">
                          {tableSeats.map((seat) => {
                            const badge = statusBadge(seat);
                            const isSelected = seat.id === selectedSeatId;
                            return (
                              <div
                                key={seat.id}
                                onClick={() => setSelectedSeatId(isSelected ? null : seat.id)}
                                className={`flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-zinc-50 ${
                                  isSelected ? "bg-violet-50" : ""
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <span className="text-sm font-black text-zinc-700">
                                    Seat {seat.seat_number}
                                  </span>
                                  {seat.is_vip && (
                                    <span className="rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-black text-orange-600">
                                      VIP
                                    </span>
                                  )}
                                  <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-black ${badge.cls}`}>
                                    {badge.label}
                                  </span>
                                </div>
                                <div className="text-right">
                                  {seat.invitation ? (
                                    <p className="text-xs font-black text-violet-700">
                                      {seat.invitation.guest_name}
                                    </p>
                                  ) : (
                                    <span className="text-xs text-zinc-300">Unassigned</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Ungrouped seats */}
                  {tableGroups.ungrouped.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
                        <p className="font-black text-zinc-900">General Seating</p>
                        <p className="text-xs font-semibold text-zinc-500">
                          {tableGroups.ungrouped.length} seats without table assignment
                        </p>
                      </div>
                      <div className="divide-y divide-zinc-100">
                        {tableGroups.ungrouped.map((seat) => {
                          const badge = statusBadge(seat);
                          const isSelected = seat.id === selectedSeatId;
                          return (
                            <div
                              key={seat.id}
                              onClick={() => setSelectedSeatId(isSelected ? null : seat.id)}
                              className={`flex cursor-pointer items-center justify-between px-4 py-3 transition-colors hover:bg-zinc-50 ${
                                isSelected ? "bg-violet-50" : ""
                              }`}
                            >
                              <span className="text-sm font-semibold text-zinc-700">
                                {seat.section} · Row {seat.row_label} · Seat {seat.seat_number}
                              </span>
                              <span className={`rounded-lg border px-2 py-0.5 text-[11px] font-black ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Side Panel */}
            {selectedSeat && (
              <div className="w-80 shrink-0 rounded-2xl border border-zinc-200 bg-white shadow-sm lg:sticky lg:top-6">
                {/* Panel Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                  <p className="font-black text-zinc-900">{seatLabel(selectedSeat)}</p>
                  <button
                    onClick={() => setSelectedSeatId(null)}
                    className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-4 p-4">
                  {/* Status */}
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">Status</p>
                    <span className={`rounded-lg border px-2.5 py-1 text-xs font-black ${statusBadge(selectedSeat).cls}`}>
                      {statusBadge(selectedSeat).label}
                    </span>
                    {selectedSeat.status === "sold" && (
                      <p className="mt-1.5 text-[11px] font-semibold text-zinc-500">
                        This seat has been sold. It cannot be assigned to an invited guest.
                      </p>
                    )}
                    {isActivelyReserved(selectedSeat) && (
                      <p className="mt-1.5 text-[11px] font-semibold text-amber-700">
                        Active purchase reservation until{" "}
                        {new Date(selectedSeat.reserved_until!).toLocaleTimeString()}.
                      </p>
                    )}
                  </div>

                  {/* VIP Toggle */}
                  {selectedSeat.status !== "sold" && (
                    <div>
                      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">VIP</p>
                      <button
                        onClick={() => handleToggleVip(selectedSeat)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-black transition-all ${
                          selectedSeat.is_vip
                            ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
                            : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100"
                        }`}
                      >
                        {selectedSeat.is_vip ? <StarOff size={13} /> : <Star size={13} />}
                        {selectedSeat.is_vip ? "Remove VIP" : "Mark as VIP"}
                      </button>
                    </div>
                  )}

                  {/* Table Metadata */}
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Table Info</p>
                      {selectedSeat.status !== "sold" && (
                        <button
                          onClick={() => setMetaEditing((e) => !e)}
                          className="text-[10px] font-black text-violet-600 hover:underline"
                        >
                          {metaEditing ? "Cancel" : "Edit"}
                        </button>
                      )}
                    </div>
                    {metaEditing ? (
                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          placeholder="Table number (e.g. 12)"
                          value={metaForm.table_number}
                          onChange={(e) => setMetaForm((f) => ({ ...f, table_number: e.target.value }))}
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        <input
                          type="text"
                          placeholder="Table name (optional)"
                          value={metaForm.table_name}
                          onChange={(e) => setMetaForm((f) => ({ ...f, table_name: e.target.value }))}
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        <input
                          type="number"
                          placeholder="Table capacity"
                          value={metaForm.table_capacity}
                          min={1}
                          onChange={(e) => setMetaForm((f) => ({ ...f, table_capacity: e.target.value }))}
                          className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
                        />
                        <button
                          onClick={handleSaveMeta}
                          className="w-full rounded-xl bg-violet-600 py-2 text-xs font-black text-white hover:bg-violet-700"
                        >
                          Save Table Info
                        </button>
                      </div>
                    ) : (
                      <div className="mt-2 space-y-1">
                        <p className="text-xs font-semibold text-zinc-700">
                          {selectedSeat.table_number
                            ? `Table ${selectedSeat.table_number}`
                            : "No table assigned"}
                          {selectedSeat.table_name && ` — ${selectedSeat.table_name}`}
                        </p>
                        {selectedSeat.table_capacity && (
                          <p className="text-[11px] text-zinc-500">
                            Capacity: {selectedSeat.table_capacity}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Guest Assignment */}
                  <div>
                    <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                      Guest Assignment
                    </p>
                    {selectedSeat.invitation ? (
                      <div className="rounded-xl border border-violet-100 bg-violet-50 p-3">
                        <p className="font-black text-violet-900">
                          {selectedSeat.invitation.guest_name}
                        </p>
                        {selectedSeat.invitation.guest_title && (
                          <p className="text-[11px] font-semibold text-violet-600">
                            {selectedSeat.invitation.guest_title}
                          </p>
                        )}
                        {selectedSeat.invitation.organization && (
                          <p className="text-[11px] text-violet-500">
                            {selectedSeat.invitation.organization}
                          </p>
                        )}
                        <div className="mt-2 flex gap-1.5">
                          <span className="rounded-md border border-violet-200 bg-white px-1.5 py-0.5 text-[10px] font-black text-violet-700">
                            {selectedSeat.invitation.invitation_status}
                          </span>
                          <span className="rounded-md border border-violet-200 bg-white px-1.5 py-0.5 text-[10px] font-black text-violet-700">
                            RSVP: {selectedSeat.invitation.rsvp_status}
                          </span>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => setShowAssignModal(true)}
                            className="flex-1 rounded-xl border border-violet-300 bg-white py-1.5 text-xs font-black text-violet-700 hover:bg-violet-50"
                          >
                            Change Guest
                          </button>
                          <button
                            onClick={() => setConfirmRemove(true)}
                            className="flex-1 rounded-xl border border-red-200 bg-white py-1.5 text-xs font-black text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                        {confirmRemove && (
                          <div className="mt-2 rounded-xl border border-red-100 bg-red-50 p-3">
                            <p className="text-xs font-black text-red-800">
                              Remove guest from this seat?
                            </p>
                            <p className="mt-0.5 text-[11px] text-red-600">
                              The invitation and QR credential remain valid.
                            </p>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={handleRemoveSeat}
                                className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-black text-white hover:bg-red-700"
                              >
                                Yes, Remove
                              </button>
                              <button
                                onClick={() => setConfirmRemove(false)}
                                className="flex-1 rounded-lg bg-white py-1.5 text-xs font-black text-zinc-700 hover:bg-zinc-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : selectedSeat.status === "sold" ? (
                      <p className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-500">
                        Sold seat — guest assignment not available.
                      </p>
                    ) : isActivelyReserved(selectedSeat) ? (
                      <p className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-700">
                        Seat is temporarily reserved for a buyer — cannot assign guest.
                      </p>
                    ) : (
                      <button
                        onClick={() => setShowAssignModal(true)}
                        className="w-full rounded-xl bg-violet-600 py-2.5 text-xs font-black text-white hover:bg-violet-700"
                      >
                        <Users size={13} className="mr-1.5 inline" />
                        Assign Guest
                      </button>
                    )}
                  </div>

                  {/* Price info */}
                  {selectedSeat.price_override != null && (
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                        Price Override
                      </p>
                      <p className="mt-1 text-sm font-black text-zinc-800">
                        ${selectedSeat.price_override.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Assign Modal */}
      {showAssignModal && selectedSeat && (
        <InvitationAssignModal
          seat={selectedSeat}
          invitations={invitations}
          onAssign={handleAssignSeat}
          onClose={() => setShowAssignModal(false)}
        />
      )}
    </div>
  );
}

// ─── Invitation Assign Modal ──────────────────────────────────────────────────

function InvitationAssignModal({
  seat,
  invitations,
  onAssign,
  onClose,
}: {
  seat: SeatRow;
  invitations: InvitationOption[];
  onAssign: (invitationId: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return invitations.filter(
      (inv) =>
        inv.guest_name.toLowerCase().includes(q) ||
        (inv.organization ?? "").toLowerCase().includes(q) ||
        (inv.guest_title ?? "").toLowerCase().includes(q)
    );
  }, [invitations, search]);

  const inactive = (status: string) =>
    ["cancelled", "revoked", "expired"].includes(status);

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    await onAssign(selected);
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div>
            <p className="font-black text-zinc-900">Assign Guest</p>
            <p className="text-xs font-semibold text-zinc-500">{seatLabel(seat)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-3">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search guest name or organization…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 py-2 pl-8 pr-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
              autoFocus
            />
          </div>

          {invitations.length === 0 ? (
            <p className="py-6 text-center text-sm font-semibold text-zinc-500">
              No invitations found for this event.
            </p>
          ) : (
            <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {filtered.map((inv) => {
                const isInactive = inactive(inv.invitation_status);
                const isSelected = selected === inv.id;
                const hasCurrentSeat = inv.current_seat_id && inv.current_seat_id !== seat.id;
                return (
                  <button
                    key={inv.id}
                    disabled={isInactive}
                    onClick={() => setSelected(isSelected ? null : inv.id)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                      isSelected
                        ? "border-violet-400 bg-violet-50"
                        : "border-zinc-200 bg-white hover:bg-zinc-50"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        isSelected ? "border-violet-500 bg-violet-500" : "border-zinc-300"
                      }`}
                    >
                      {isSelected && <Check size={9} className="text-white" />}
                    </div>
                    <div className="min-w-0">
                      <p className="font-black text-zinc-900">{inv.guest_name}</p>
                      {inv.guest_title && (
                        <p className="text-[11px] font-semibold text-zinc-500">{inv.guest_title}</p>
                      )}
                      {inv.organization && (
                        <p className="text-[11px] text-zinc-400">{inv.organization}</p>
                      )}
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-black text-zinc-600">
                          {inv.invitation_status}
                        </span>
                        <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-black text-zinc-600">
                          RSVP: {inv.rsvp_status}
                        </span>
                        {hasCurrentSeat && (
                          <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                            Will reassign
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="py-4 text-center text-xs font-semibold text-zinc-400">
                  No invitations match your search.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-zinc-100 px-4 py-4">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-black text-zinc-600 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || loading}
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="mx-auto animate-spin" /> : "Confirm Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}
