"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import {
  Users,
  UserPlus,
  Mail,
  Send,
  Search,
  X,
  Check,
  AlertCircle,
  Loader2,
  Edit2,
  Ban,
  CheckCircle2,
  Clock,
  Armchair,
  Star,
  RefreshCw,
} from "lucide-react";
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader";
import DashboardEmptyState from "@/components/dashboard/DashboardEmptyState";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GuestItem = {
  id: string;
  event_id: string;
  guest_name: string;
  guest_title: string | null;
  organization: string | null;
  email: string | null;
  phone: string | null;
  invitation_status: "draft" | "sent" | "cancelled" | "revoked" | "expired";
  rsvp_status: "pending" | "accepted" | "declined";
  rsvp_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  ticketInstance: {
    id: string;
    qr_code: string;
    status: string;
    checked_in_at: string | null;
    seat_label: string | null;
  } | null;
  seat: {
    id: string;
    section: string;
    row_label: string;
    seat_number: number;
    table_number: string | null;
    table_name: string | null;
    table_capacity: number | null;
    is_vip: boolean;
  } | null;
};

export type AvailableSeat = {
  id: string;
  section: string;
  row_label: string;
  seat_number: number;
  table_number: string | null;
  table_name: string | null;
  is_vip: boolean;
  status: string;
  price_override: number | null;
};

type Props = {
  eventId: string;
  eventTitle: string;
  initialGuests: GuestItem[];
  initialAvailableSeats: AvailableSeat[];
};

type Toast = { type: "success" | "error"; message: string } | null;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSeatBadge(seat: GuestItem["seat"], fallbackLabel?: string | null) {
  if (seat) {
    if (seat.table_number) {
      const tableName = seat.table_name ? ` (${seat.table_name})` : "";
      return `Table ${seat.table_number}${tableName}, Seat ${seat.seat_number}`;
    }
    return `${seat.section} · Row ${seat.row_label} · Seat ${seat.seat_number}`;
  }
  if (fallbackLabel) return fallbackLabel;
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GuestsClient({
  eventId,
  eventTitle,
  initialGuests,
  initialAvailableSeats,
}: Props) {
  const [guests, setGuests] = useState<GuestItem[]>(initialGuests);
  const [availableSeats, setAvailableSeats] = useState<AvailableSeat[]>(initialAvailableSeats);
  const [loading, setLoading] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  // Modals state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingGuest, setEditingGuest] = useState<GuestItem | null>(null);
  const [assigningSeatGuest, setAssigningSeatGuest] = useState<GuestItem | null>(null);
  const [cancellingGuest, setCancellingGuest] = useState<GuestItem | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  // ── Refresh Guests ────────────────────────────────────────────────────────
  const refreshGuests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`);
      if (!res.ok) throw new Error("Failed to load guests.");
      const data = await res.json();
      setGuests(data.guests || []);
      setAvailableSeats(data.availableSeats || []);
    } catch {
      showToast("error", "Failed to refresh guest list.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  // ── Derived Stats ─────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = guests.length;
    const sent = guests.filter((g) => g.invitation_status === "sent").length;
    const draft = guests.filter((g) => g.invitation_status === "draft").length;
    const seated = guests.filter((g) => Boolean(g.seat || g.ticketInstance?.seat_label)).length;
    const checkedIn = guests.filter((g) => g.ticketInstance?.status === "used").length;
    return { total, sent, draft, seated, checkedIn };
  }, [guests]);

  // ── Filtered Guests ───────────────────────────────────────────────────────
  const filteredGuests = useMemo(() => {
    let list = guests;

    if (filter === "sent") list = list.filter((g) => g.invitation_status === "sent");
    else if (filter === "draft") list = list.filter((g) => g.invitation_status === "draft");
    else if (filter === "checked_in") list = list.filter((g) => g.ticketInstance?.status === "used");
    else if (filter === "seated") list = list.filter((g) => Boolean(g.seat || g.ticketInstance?.seat_label));
    else if (filter === "unseated") list = list.filter((g) => !g.seat && !g.ticketInstance?.seat_label);
    else if (filter === "cancelled") list = list.filter((g) => g.invitation_status === "cancelled");

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (g) =>
          g.guest_name.toLowerCase().includes(q) ||
          (g.guest_title ?? "").toLowerCase().includes(q) ||
          (g.organization ?? "").toLowerCase().includes(q) ||
          (g.email ?? "").toLowerCase().includes(q) ||
          (g.ticketInstance?.seat_label ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [guests, filter, search]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleSendEmail(guest: GuestItem) {
    if (!guest.email) {
      showToast("error", "Cannot send email: guest has no email address.");
      return;
    }

    setActionLoadingId(guest.id);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "send_email",
          invitationId: guest.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast("error", data.error || "Failed to send invitation email.");
        return;
      }

      showToast("success", data.message || "Invitation email sent successfully.");
      await refreshGuests();
    } catch {
      showToast("error", "Network error. Please try again.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleCancelInvitation(invitationId: string) {
    setActionLoadingId(invitationId);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "cancel",
          invitationId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast("error", data.error || "Failed to cancel invitation.");
        return;
      }

      showToast("success", "Invitation cancelled successfully.");
      setCancellingGuest(null);
      await refreshGuests();
    } catch {
      showToast("error", "Network error. Please try again.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRemoveSeat(guest: GuestItem) {
    setActionLoadingId(guest.id);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "remove_seat",
          invitationId: guest.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        showToast("error", data.error || "Failed to remove seat.");
        return;
      }

      showToast("success", "Seat assignment removed.");
      await refreshGuests();
    } catch {
      showToast("error", "Network error. Please try again.");
    } finally {
      setActionLoadingId(null);
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
        title="Guest Management"
        description={eventTitle}
        action={
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition-all hover:bg-violet-700 active:scale-95"
          >
            <UserPlus size={16} />
            Add Guest
          </button>
        }
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-5 py-3 text-sm font-black shadow-xl transition-all ${
            toast.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {toast.type === "success" ? (
            <Check size={15} className="mr-1.5 inline" />
          ) : (
            <AlertCircle size={15} className="mr-1.5 inline" />
          )}
          {toast.message}
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: "Total Invited", value: stats.total, color: "text-zinc-900" },
          { label: "Invitations Sent", value: stats.sent, color: "text-violet-700" },
          { label: "Drafts (Unsent)", value: stats.draft, color: "text-amber-700" },
          { label: "Seated Guests", value: stats.seated, color: "text-blue-700" },
          { label: "Checked In", value: stats.checkedIn, color: "text-emerald-700" },
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
            placeholder="Search guest name, title, organization, email, seat…"
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

        {/* Refresh button */}
        <button
          onClick={refreshGuests}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs font-black text-zinc-600 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-violet-600" : ""} />
          Refresh
        </button>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: "all", label: "All Guests" },
          { id: "sent", label: "Sent" },
          { id: "draft", label: "Draft" },
          { id: "checked_in", label: "Checked In" },
          { id: "seated", label: "Seated" },
          { id: "unseated", label: "No Seat" },
          { id: "cancelled", label: "Cancelled" },
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

      {/* Guest List Table */}
      {filteredGuests.length === 0 ? (
        guests.length === 0 ? (
          <DashboardEmptyState
            title="No invited guests yet"
            description="Invite VIPs, speakers, partners, and special guests to your event. Guests receive a unified admission QR credential without needing to purchase a ticket."
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 py-12 text-center">
            <Users size={24} className="mx-auto mb-3 text-zinc-300" />
            <p className="text-sm font-black text-zinc-500">No guests match your search or filter.</p>
          </div>
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-[11px] font-black uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-4 py-3.5">Guest</th>
                  <th className="px-4 py-3.5">Contact</th>
                  <th className="px-4 py-3.5">Invitation Status</th>
                  <th className="px-4 py-3.5">Admission / Check-In</th>
                  <th className="px-4 py-3.5">Seat</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredGuests.map((guest) => {
                  const isCheckedIn = guest.ticketInstance?.status === "used";
                  const isCancelled = guest.invitation_status === "cancelled";
                  const seatBadge = formatSeatBadge(guest.seat, guest.ticketInstance?.seat_label);
                  const isActing = actionLoadingId === guest.id;

                  return (
                    <tr key={guest.id} className="transition-colors hover:bg-zinc-50/70">
                      {/* Guest Identity */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xs font-black text-violet-700 border border-violet-100">
                            {guest.guest_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-black text-zinc-900 leading-tight">
                              {guest.guest_name}
                            </p>
                            {(guest.guest_title || guest.organization) && (
                              <p className="text-xs font-semibold text-zinc-500">
                                {[guest.guest_title, guest.organization].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3.5">
                        {guest.email ? (
                          <p className="text-xs font-semibold text-zinc-700">{guest.email}</p>
                        ) : (
                          <span className="text-xs text-zinc-300">No email</span>
                        )}
                        {guest.phone && (
                          <p className="text-[11px] font-medium text-zinc-400">{guest.phone}</p>
                        )}
                      </td>

                      {/* Invitation Status */}
                      <td className="px-4 py-3.5">
                        {guest.invitation_status === "sent" ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-black text-violet-700">
                            <Send size={10} />
                            Sent
                          </span>
                        ) : guest.invitation_status === "draft" ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700">
                            <Clock size={10} />
                            Draft
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-100 px-2 py-0.5 text-[11px] font-black text-zinc-500">
                            <Ban size={10} />
                            {guest.invitation_status}
                          </span>
                        )}
                      </td>

                      {/* Check-In Status */}
                      <td className="px-4 py-3.5">
                        {isCheckedIn ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                            <CheckCircle2 size={11} />
                            Checked In
                          </span>
                        ) : isCancelled ? (
                          <span className="text-xs text-zinc-400">Cancelled</span>
                        ) : (
                          <span className="text-xs font-semibold text-zinc-500">Valid · Not Arrived</span>
                        )}
                      </td>

                      {/* Seat Assignment */}
                      <td className="px-4 py-3.5">
                        {seatBadge ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[11px] font-black text-blue-800">
                              <Armchair size={11} />
                              {seatBadge}
                            </span>
                            {guest.seat?.is_vip && (
                              <span className="inline-flex items-center gap-0.5 rounded-md bg-orange-50 px-1.5 py-0.5 text-[10px] font-black text-orange-600">
                                <Star size={9} /> VIP
                              </span>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => setAssigningSeatGuest(guest)}
                            disabled={isCancelled || isCheckedIn}
                            className="text-xs font-black text-violet-600 hover:underline disabled:opacity-40 disabled:hover:no-underline"
                          >
                            + Assign Seat
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Send / Resend Email Button */}
                          {guest.email && !isCancelled && (
                            <button
                              onClick={() => handleSendEmail(guest)}
                              disabled={isActing}
                              title={guest.invitation_status === "sent" ? "Resend Invitation Email" : "Send Invitation Email"}
                              className="inline-flex items-center gap-1 rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-black text-zinc-700 shadow-sm transition-all hover:bg-violet-50 hover:text-violet-700 disabled:opacity-50"
                            >
                              {isActing ? (
                                <Loader2 size={12} className="animate-spin text-violet-600" />
                              ) : (
                                <Mail size={12} />
                              )}
                              {guest.invitation_status === "sent" ? "Resend" : "Send"}
                            </button>
                          )}

                          {/* Seat Assign/Change Button */}
                          {!isCancelled && !isCheckedIn && seatBadge && (
                            <button
                              onClick={() => setAssigningSeatGuest(guest)}
                              title="Change or Remove Seat"
                              className="rounded-xl border border-zinc-200 bg-white p-1.5 text-zinc-500 shadow-sm hover:bg-zinc-50 hover:text-zinc-900"
                            >
                              <Armchair size={13} />
                            </button>
                          )}

                          {/* Edit Guest Button */}
                          {!isCancelled && (
                            <button
                              onClick={() => setEditingGuest(guest)}
                              title="Edit Guest Details"
                              className="rounded-xl border border-zinc-200 bg-white p-1.5 text-zinc-500 shadow-sm hover:bg-zinc-50 hover:text-zinc-900"
                            >
                              <Edit2 size={13} />
                            </button>
                          )}

                          {/* Cancel Invitation Button */}
                          {!isCancelled && !isCheckedIn && (
                            <button
                              onClick={() => setCancellingGuest(guest)}
                              title="Cancel Invitation"
                              className="rounded-xl border border-red-200 bg-white p-1.5 text-red-500 shadow-sm hover:bg-red-50 hover:text-red-700"
                            >
                              <Ban size={13} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Guest Modal ── */}
      {addModalOpen && (
        <AddGuestModal
          eventId={eventId}
          availableSeats={availableSeats}
          onSuccess={async () => {
            setAddModalOpen(false);
            showToast("success", "Guest invitation created successfully.");
            await refreshGuests();
          }}
          onClose={() => setAddModalOpen(false)}
        />
      )}

      {/* ── Edit Guest Modal ── */}
      {editingGuest && (
        <EditGuestModal
          eventId={eventId}
          guest={editingGuest}
          onSuccess={async () => {
            setEditingGuest(null);
            showToast("success", "Guest information updated.");
            await refreshGuests();
          }}
          onClose={() => setEditingGuest(null)}
        />
      )}

      {/* ── Assign Seat Modal ── */}
      {assigningSeatGuest && (
        <AssignSeatModal
          eventId={eventId}
          guest={assigningSeatGuest}
          availableSeats={availableSeats}
          onSuccess={async () => {
            setAssigningSeatGuest(null);
            showToast("success", "Seat assignment updated.");
            await refreshGuests();
          }}
          onRemoveSeat={() => handleRemoveSeat(assigningSeatGuest)}
          onClose={() => setAssigningSeatGuest(null)}
        />
      )}

      {/* ── Cancel Confirmation Modal ── */}
      {cancellingGuest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setCancellingGuest(null)}
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <Ban size={20} />
            </div>
            <h3 className="text-base font-black text-zinc-900">Cancel Invitation</h3>
            <p className="mt-1.5 text-xs font-semibold text-zinc-500">
              Are you sure you want to cancel the invitation for{" "}
              <strong className="text-zinc-900">{cancellingGuest.guest_name}</strong>?
              Any assigned seat will be released.
            </p>
            <div className="mt-5 flex gap-2.5">
              <button
                onClick={() => setCancellingGuest(null)}
                className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-xs font-black text-zinc-600 hover:bg-zinc-50"
              >
                No, Keep
              </button>
              <button
                onClick={() => handleCancelInvitation(cancellingGuest.id)}
                disabled={actionLoadingId === cancellingGuest.id}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-xs font-black text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoadingId === cancellingGuest.id ? (
                  <Loader2 size={14} className="mx-auto animate-spin" />
                ) : (
                  "Yes, Cancel"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Guest Modal ──────────────────────────────────────────────────────────

function AddGuestModal({
  eventId,
  availableSeats,
  onSuccess,
  onClose,
}: {
  eventId: string;
  availableSeats: AvailableSeat[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [guestTitle, setGuestTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [seatId, setSeatId] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!guestName.trim()) {
      setError("Guest name is required.");
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: guestName.trim(),
          guestTitle: guestTitle.trim() || null,
          organization: organization.trim() || null,
          email: email.trim().toLowerCase() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
          seatId: seatId || null,
          sendEmail: Boolean(sendEmail && email.trim()),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create guest invitation.");
        return;
      }

      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <UserPlus size={18} className="text-violet-600" />
            <h3 className="font-black text-zinc-900">Add Invited Guest</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-black text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-black text-zinc-700">Full Name *</label>
              <input
                type="text"
                placeholder="e.g. Dr. Jane Smith"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-zinc-700">Title / Honorific</label>
              <input
                type="text"
                placeholder="e.g. Keynote Speaker"
                value={guestTitle}
                onChange={(e) => setGuestTitle(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-black text-zinc-700">Email Address</label>
              <input
                type="email"
                placeholder="jane@organization.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-zinc-700">Phone</label>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black text-zinc-700">Organization / Affiliation</label>
            <input
              type="text"
              placeholder="e.g. Acme Health Corp"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          {/* Seat Assignment Option */}
          {availableSeats.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-black text-zinc-700">Assign Seat (Optional)</label>
              <select
                value={seatId}
                onChange={(e) => setSeatId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                <option value="">No seat assigned (General)</option>
                {availableSeats.map((seat) => {
                  const label = seat.table_number
                    ? `Table ${seat.table_number} · Seat ${seat.seat_number}${seat.is_vip ? " [VIP]" : ""}`
                    : `${seat.section} · Row ${seat.row_label} · Seat ${seat.seat_number}${seat.is_vip ? " [VIP]" : ""}`;
                  return (
                    <option key={seat.id} value={seat.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-black text-zinc-700">Internal Notes</label>
            <input
              type="text"
              placeholder="e.g. VIP speaker dinner access"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          {email.trim() && (
            <div className="flex items-center gap-2 rounded-xl border border-violet-100 bg-violet-50/70 p-3">
              <input
                type="checkbox"
                id="sendEmailCheckbox"
                checked={sendEmail}
                onChange={(e) => setSendEmail(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
              />
              <label htmlFor="sendEmailCheckbox" className="text-xs font-bold text-violet-900 cursor-pointer">
                Send official digital invitation email immediately
              </label>
            </div>
          )}

          <div className="flex gap-2.5 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-xs font-black text-zinc-600 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="mx-auto animate-spin" /> : "Create Invitation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Guest Modal ─────────────────────────────────────────────────────────

function EditGuestModal({
  eventId,
  guest,
  onSuccess,
  onClose,
}: {
  eventId: string;
  guest: GuestItem;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [guestName, setGuestName] = useState(guest.guest_name);
  const [guestTitle, setGuestTitle] = useState(guest.guest_title || "");
  const [organization, setOrganization] = useState(guest.organization || "");
  const [email, setEmail] = useState(guest.email || "");
  const [phone, setPhone] = useState(guest.phone || "");
  const [notes, setNotes] = useState(guest.notes || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!guestName.trim()) {
      setError("Guest name is required.");
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "update",
          invitationId: guest.id,
          guestName: guestName.trim(),
          guestTitle: guestTitle.trim() || null,
          organization: organization.trim() || null,
          email: email.trim().toLowerCase() || null,
          phone: phone.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update guest information.");
        return;
      }

      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Edit2 size={18} className="text-violet-600" />
            <h3 className="font-black text-zinc-900">Edit Guest Details</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-black text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-black text-zinc-700">Full Name *</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-zinc-700">Title / Honorific</label>
              <input
                type="text"
                value={guestTitle}
                onChange={(e) => setGuestTitle(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-black text-zinc-700">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-black text-zinc-700">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-black text-zinc-700">Organization</label>
            <input
              type="text"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-black text-zinc-700">Internal Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          </div>

          <div className="flex gap-2.5 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-xs font-black text-zinc-600 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="mx-auto animate-spin" /> : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Assign Seat Modal ────────────────────────────────────────────────────────

function AssignSeatModal({
  eventId,
  guest,
  availableSeats,
  onSuccess,
  onRemoveSeat,
  onClose,
}: {
  eventId: string;
  guest: GuestItem;
  availableSeats: AvailableSeat[];
  onSuccess: () => void;
  onRemoveSeat: () => void;
  onClose: () => void;
}) {
  const [selectedSeatId, setSelectedSeatId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentSeatBadge = formatSeatBadge(guest.seat, guest.ticketInstance?.seat_label);

  async function handleAssign() {
    if (!selectedSeatId) {
      setError("Please select a seat to assign.");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/events/${eventId}/guests`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "assign_seat",
          invitationId: guest.id,
          seatId: selectedSeatId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to assign seat.");
        return;
      }

      onSuccess();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3.5">
          <div className="flex items-center gap-2">
            <Armchair size={18} className="text-violet-600" />
            <h3 className="font-black text-zinc-900">Seat Assignment</h3>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:text-zinc-700">
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-zinc-500">Guest</p>
            <p className="text-sm font-black text-zinc-900">{guest.guest_name}</p>
          </div>

          {currentSeatBadge && (
            <div className="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 p-3">
              <div>
                <p className="text-[10px] font-black uppercase text-blue-700">Current Seat</p>
                <p className="text-xs font-black text-blue-900">{currentSeatBadge}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onRemoveSeat();
                  onClose();
                }}
                className="rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-black text-red-600 hover:bg-red-50"
              >
                Release Seat
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-black text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-black text-zinc-700">
              {currentSeatBadge ? "Reassign to New Seat" : "Select Seat"}
            </label>
            {availableSeats.length === 0 ? (
              <p className="py-4 text-center text-xs font-semibold text-zinc-400">
                No unassigned seats currently available.
              </p>
            ) : (
              <select
                value={selectedSeatId}
                onChange={(e) => setSelectedSeatId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-violet-400"
              >
                <option value="">-- Choose an available seat --</option>
                {availableSeats.map((seat) => {
                  const label = seat.table_number
                    ? `Table ${seat.table_number} · Seat ${seat.seat_number}${seat.is_vip ? " [VIP]" : ""}`
                    : `${seat.section} · Row ${seat.row_label} · Seat ${seat.seat_number}${seat.is_vip ? " [VIP]" : ""}`;
                  return (
                    <option key={seat.id} value={seat.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          <div className="flex gap-2.5 pt-2 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-xs font-black text-zinc-600 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAssign}
              disabled={loading || !selectedSeatId}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50"
            >
              {loading ? <Loader2 size={14} className="mx-auto animate-spin" /> : "Confirm Seat"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
