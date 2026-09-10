"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  Star,
  StarOff,
  Accessibility,
  Filter,
  Search,
  X,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  TableProperties,
  List,
  Sparkles,
  Layers,
  Sliders,
  Bot,
} from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardEmptyState from "@/components/dashboard/DashboardEmptyState";
import VenueBuilder from "./VenueBuilder";
import ManualBuilder, { ManualSectionFormItem } from "./ManualBuilder";
import AiAssistantPanel from "./AiAssistantPanel";
import { SeatGeometry, TicketTypeSummary } from "@/lib/seating";
import { summarizeSeatingPlan } from "@/lib/seating-summary";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  canvas_width?: number;
  canvas_height?: number;
  version?: number;
  is_published?: boolean;
  published_at?: string | null;
  sections?: unknown[];
  venue_objects?: unknown[];
} | null;

type Props = {
  eventId: string;
  eventTitle: string;
  layout: LayoutInfo;
  ticketTypes?: TicketTypeSummary[];
  initialSeats: SeatGeometry[];
  invitations: InvitationOption[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isActivelyReserved(seat: SeatGeometry): boolean {
  return (
    seat.status === "reserved" &&
    !!seat.reserved_until &&
    new Date(seat.reserved_until) > new Date()
  );
}

function isAssignable(seat: SeatGeometry): boolean {
  return seat.status !== "sold" && seat.status !== "unavailable" && !isActivelyReserved(seat);
}

function seatLabel(seat: SeatGeometry): string {
  if (seat.table_number) {
    const tablePart = seat.table_name
      ? `Table ${seat.table_number} (${seat.table_name})`
      : `Table ${seat.table_number}`;
    return `${tablePart}, Seat ${seat.seat_number}`;
  }
  return `${seat.section} · Row ${seat.row_label} · Seat ${seat.seat_number}`;
}

function statusBadge(seat: SeatGeometry) {
  if (seat.status === "sold")
    return { label: "Sold", cls: "bg-zinc-100 text-zinc-500 border-zinc-200" };
  if (seat.status === "unavailable")
    return { label: "Unavailable", cls: "bg-red-50 text-red-600 border-red-200" };
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
  ticketTypes = [],
  initialSeats,
  invitations: initialInvitations,
}: Props) {
  const [workspaceMode, setWorkspaceMode] = useState<"canvas" | "manual" | "roster" | "ai">("canvas");
  const [layoutState, setLayoutState] = useState<LayoutInfo>(layout);
  const [seats, setSeats] = useState<SeatGeometry[]>(initialSeats);
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
  // AI Assistant: pending sections from AI proposal + key to force ManualBuilder remount on each Apply
  const [aiPendingSections, setAiPendingSections] = useState<ManualSectionFormItem[] | null>(null);
  const [aiApplyKey, setAiApplyKey] = useState(0);
  // Phase 6E: source label for the applied AI proposal (handoff banner).
  const [aiAppliedSource, setAiAppliedSource] = useState<string | null>(null);
  // Phase 6E: unsaved-change signals from the builders. Guard tab switches
  // and AI applies so dirty work is never silently discarded.
  const [manualDirty, setManualDirty] = useState(false);
  const [visualDirty, setVisualDirty] = useState(false);
  const hasUnsavedChanges = manualDirty || visualDirty;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleManualDirty = useCallback((dirty: boolean) => setManualDirty(dirty), []);
  const handleVisualDirty = useCallback((dirty: boolean) => setVisualDirty(dirty), []);

  function requestWorkspaceMode(next: "canvas" | "manual" | "roster" | "ai") {
    if (next === workspaceMode) return;
    const leavingDirtyBuilder =
      (workspaceMode === "manual" && manualDirty) ||
      (workspaceMode === "canvas" && visualDirty);
    if (
      leavingDirtyBuilder &&
      !window.confirm(
        "You have unsaved seating changes. Switch views without saving? Your edits will be lost."
      )
    ) {
      return;
    }
    setWorkspaceMode(next);
  }

  // Phase 6E: warn on page unload only when real unsaved builder work exists.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedChanges]);

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
      if (data.layout) setLayoutState(data.layout);
      // Phase 6E: credential snapshot may be stale after any seat change.
      setCredCache({});
    } catch {
      showToast("error", "Failed to refresh seating data.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // ── Phase 6E: guest credential status (read-only) ─────────────────────────
  // For a seat holding an invitation assignment, surface the linked
  // ticketInstance credential/check-in state from the existing guests
  // endpoint (invitation_id join — no new API, no schema change).
  // Cached per invitation; the raw QR string is never rendered.
  type GuestCredential = {
    status: string;
    checked_in_at: string | null;
    seat_label: string | null;
  } | null;
  const [credCache, setCredCache] = useState<Record<string, GuestCredential>>({});
  const assignedInvitationId = selectedSeat?.assigned_invitation_id ?? null;
  useEffect(() => {
    if (!assignedInvitationId || assignedInvitationId in credCache) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/guests`);
        if (!res.ok) throw new Error("guest lookup failed");
        const data = await res.json();
        const match = (data.guests ?? []).find(
          (g: { id?: string }) => g?.id === assignedInvitationId
        );
        const ti = match?.ticketInstance ?? null;
        if (!cancelled) {
          setCredCache((prev) => ({
            ...prev,
            [assignedInvitationId]: ti
              ? {
                  status: String(ti.status ?? "unknown"),
                  checked_in_at: ti.checked_in_at ?? null,
                  seat_label: ti.seat_label ?? null,
                }
              : null,
          }));
        }
      } catch {
        if (!cancelled) {
          setCredCache((prev) => ({ ...prev, [assignedInvitationId]: null }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignedInvitationId, eventId, credCache]);

  // ── Derived Stats (Phase 6E: single shared derivation — Manual, AI and  // Visual all describe the same seats through summarizeSeatingPlan) ─────────
  const stats = useMemo(() => {
    const summary = summarizeSeatingPlan(
      seats,
      (layoutState?.venue_objects as Array<{ type?: string }> | undefined) ?? []
    );
    return {
      total: summary.total,
      sold: summary.sold,
      reserved: summary.reserved,
      guestAssigned: summary.guestAssigned,
      vip: summary.vip,
      accessible: summary.accessible,
      available: summary.available,
    };
  }, [seats, layoutState]);

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
    else if (filter === "accessible") result = result.filter((s) => s.is_accessible);

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
    const groups = new Map<string, SeatGeometry[]>();
    const ungrouped: SeatGeometry[] = [];
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

  async function handleToggleVip(seat: SeatGeometry) {
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <DashboardPageHeader
        eyebrow="Event Management"
        title="Seating Manager & Venue Builder"
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

      {/* Workspace Mode Switcher Tabs — Phase 6E: Manual, AI and Visual are
          three views of the same seating plan, persisted through one pipeline. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 pb-3">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Seating workspace views">
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === "canvas"}
            onClick={() => requestWorkspaceMode("canvas")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
              workspaceMode === "canvas"
                ? "bg-violet-600 text-white shadow-xs"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
            }`}
          >
            <Sparkles size={14} />
            Visual SVG Builder
            {visualDirty && (
              <span aria-label="unsaved changes" className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === "manual"}
            onClick={() => requestWorkspaceMode("manual")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
              workspaceMode === "manual"
                ? "bg-violet-600 text-white shadow-xs"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
            }`}
          >
            <Sliders size={14} />
            Manual Builder
            {manualDirty && (
              <span aria-label="unsaved changes" className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === "roster"}
            onClick={() => requestWorkspaceMode("roster")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
              workspaceMode === "roster"
                ? "bg-violet-600 text-white shadow-xs"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
            }`}
          >
            <TableProperties size={14} />
            Table & Guest Roster
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={workspaceMode === "ai"}
            onClick={() => requestWorkspaceMode("ai")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
              workspaceMode === "ai"
                ? "bg-violet-600 text-white shadow-xs"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 hover:text-zinc-900"
            }`}
          >
            <Bot size={14} />
            AI Assistant
          </button>
        </div>

        {loading && <Loader2 size={16} className="animate-spin text-violet-500" />}
      </div>

      {/* Phase 6E: unified plan status — one line proving all views share a plan. */}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500" aria-live="polite">
        <span>One plan — Manual, AI &amp; Visual save through the same pipeline.</span>
        <span>
          <span className="font-black text-zinc-900">{stats.total}</span> seats
        </span>
        <span>
          <span className="font-black text-emerald-700">{stats.available}</span> available
        </span>
        <span>
          <span className="font-black text-violet-700">{stats.guestAssigned}</span> assigned
        </span>
        {stats.sold > 0 && (
          <span>
            <span className="font-black text-zinc-500">{stats.sold}</span> sold
          </span>
        )}
        {stats.vip > 0 && (
          <span>
            <span className="font-black text-orange-600">{stats.vip}</span> VIP
          </span>
        )}
        {hasUnsavedChanges && (
          <span className="font-black text-amber-600">● Unsaved changes</span>
        )}
      </p>

      {/* Workspace Views */}
      {workspaceMode === "canvas" ? (
        <VenueBuilder
          eventId={eventId}
          layout={layoutState as any}
          initialSeats={seats}
          ticketTypes={ticketTypes}
          invitations={invitations}
          onRefresh={refreshSeats}
          onToast={showToast}
          onDirtyChange={handleVisualDirty}
        />
      ) : workspaceMode === "manual" ? (
        // key={aiApplyKey} forces a full remount each time AI applies a new plan,
        // proving state synchronization rather than relying on one-time useState init.
        <ManualBuilder
          key={aiApplyKey}
          eventId={eventId}
          layoutId={layoutState?.id || ""}
          canvasWidth={layoutState?.canvas_width || 1200}
          canvasHeight={layoutState?.canvas_height || 800}
          initialSeats={seats}
          venueObjects={((layoutState?.venue_objects as any) || [])}
          sections={((layoutState?.sections as any) || [])}
          ticketTypes={ticketTypes}
          aiSections={aiPendingSections ?? undefined}
          appliedSource={aiAppliedSource}
          onDirtyChange={handleManualDirty}
          onSaved={async (savedSeats, savedVenueObjects) => {
            setSeats(savedSeats);
            if (savedVenueObjects && layoutState) {
              setLayoutState((prev) => (prev ? { ...prev, venue_objects: savedVenueObjects } : prev));
            }
            await refreshSeats();
          }}
          onToast={showToast}
          onSwitchToVisual={() => requestWorkspaceMode("canvas")}
          onSwitchToRoster={() => requestWorkspaceMode("roster")}
        />
      ) : workspaceMode === "ai" ? (
        <AiAssistantPanel
          eventId={eventId}
          existingSeatsCount={stats.total}
          existingVipCount={stats.vip}
          existingRegularCount={stats.total - stats.vip - stats.accessible}
          existingAccessibleCount={stats.accessible}
          existingSectionsCount={
            Array.isArray(layoutState?.sections) ? layoutState.sections.length : 0
          }
          onApplyConfig={(formSections) => {
            // Phase 6E: applying an AI plan discards unmounted Manual state —
            // guard when the builder holds unsaved work of its own.
            if (
              manualDirty &&
              !window.confirm(
                "The Manual Builder has unsaved changes. Replace them with the AI plan?"
              )
            ) {
              return;
            }
            // Store AI sections and increment key to force ManualBuilder remount
            setAiPendingSections(formSections);
            setAiAppliedSource("AI Seating Assistant");
            setAiApplyKey((k) => k + 1);
            setWorkspaceMode("manual");
          }}
          onToast={showToast}
        />
      ) : (
        /* Workspace View 2: List & Table Groups Roster */
        <div className="space-y-4">
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
                  type="button"
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
                type="button"
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
                type="button"
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
              { id: "accessible", label: "Accessible" },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
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
                              <div className="flex items-center gap-1 mt-0.5">
                                {seat.is_vip && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-black text-orange-600">
                                    <Star size={9} />
                                    VIP
                                  </span>
                                )}
                                {seat.is_accessible && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-600">
                                    <Accessibility size={9} />
                                    Accessible
                                  </span>
                                )}
                              </div>
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
                            type="button"
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
                                  {seat.is_accessible && (
                                    <span className="rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-black text-blue-600">
                                      Accessible
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
                </div>
              )}
            </div>

            {/* Side Panel Inspector */}
            {selectedSeat && (
              <div className="w-80 shrink-0 rounded-2xl border border-zinc-200 bg-white shadow-sm lg:sticky lg:top-6">
                {/* Panel Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                  <p className="font-black text-zinc-900">{seatLabel(selectedSeat)}</p>
                  <button
                    type="button"
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
                        This seat has been sold to a ticket buyer.
                      </p>
                    )}
                  </div>

                  {/* VIP Toggle */}
                  {selectedSeat.status !== "sold" && (
                    <div>
                      <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-zinc-400">VIP</p>
                      <button
                        type="button"
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
                            type="button"
                            onClick={() => setShowAssignModal(true)}
                            className="flex-1 rounded-xl border border-violet-300 bg-white py-1.5 text-xs font-black text-violet-700 hover:bg-violet-50"
                          >
                            Reassign
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveSeat}
                            className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                        {/* Phase 6E: linked credential / check-in state (read-only,
                            existing guest → ticketInstance relationship). */}
                        {selectedSeat.assigned_invitation_id && (
                          <p className="mt-2 text-[11px] font-semibold text-violet-600">
                            {!(selectedSeat.assigned_invitation_id in credCache) ? (
                              "Checking guest credential…"
                            ) : credCache[selectedSeat.assigned_invitation_id] ? (
                              <>
                                Credential:{" "}
                                {credCache[selectedSeat.assigned_invitation_id]?.status ===
                                "used" ? (
                                  <>
                                    Used
                                    {credCache[selectedSeat.assigned_invitation_id]
                                      ?.checked_in_at &&
                                      ` · checked in ${new Date(
                                        credCache[selectedSeat.assigned_invitation_id]!
                                          .checked_in_at as string
                                      ).toLocaleString()}`}
                                  </>
                                ) : (
                                  <>
                                    {credCache[selectedSeat.assigned_invitation_id]?.status ??
                                      "Valid"}{" "}
                                    · not checked in yet
                                  </>
                                )}
                                {credCache[selectedSeat.assigned_invitation_id]?.seat_label &&
                                  ` · Seat ${credCache[selectedSeat.assigned_invitation_id]?.seat_label}`}
                              </>
                            ) : (
                              "No ticket credential found for this guest yet."
                            )}
                          </p>
                        )}
                      </div>
                    ) : isAssignable(selectedSeat) ? (
                      <button
                        type="button"
                        onClick={() => setShowAssignModal(true)}
                        className="w-full rounded-xl border border-dashed border-violet-300 bg-violet-50 py-2.5 text-xs font-black text-violet-700 hover:bg-violet-100"
                      >
                        + Assign to Invited Guest
                      </button>
                    ) : (
                      <p className="text-xs text-zinc-400">Seat cannot be assigned.</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── MODAL: ASSIGN GUEST ────────────────────────────────────────────── */}
      {showAssignModal && selectedSeat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-zinc-900">
              Assign Guest to {seatLabel(selectedSeat)}
            </h3>

            <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100 rounded-xl border border-zinc-200">
              {invitations.length === 0 ? (
                <p className="p-4 text-center text-xs text-zinc-400">No invited guests found for this event.</p>
              ) : (
                invitations.map((inv) => (
                  <div
                    key={inv.id}
                    onClick={() => handleAssignSeat(inv.id)}
                    className="flex cursor-pointer items-center justify-between p-3 hover:bg-violet-50 transition-colors"
                  >
                    <div>
                      <p className="text-xs font-black text-zinc-900">{inv.guest_name}</p>
                      {inv.guest_title && <p className="text-[10px] text-zinc-400">{inv.guest_title}</p>}
                    </div>
                    {inv.current_seat_id === selectedSeat.id && (
                      <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                        Current Seat
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-black text-zinc-600 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
