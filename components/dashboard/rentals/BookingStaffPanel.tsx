"use client";

import { useCallback, useEffect, useState } from "react";
import {
  assignStaffToBooking,
  listAssignableStaff,
  listBookingStaffAssignments,
  unassignStaffFromBooking,
  type AssignableStaffMember,
  type BookingStaffAssignment,
} from "@/lib/actions/rental-staff-assignments";

// Staff on one rental booking (delivery, pickup, chauffeur: the label is the
// business's own role). The database decides who may assign; this panel only
// shows its answer.
export default function BookingStaffPanel({
  organizerId,
  bookingId,
}: {
  organizerId: string;
  bookingId: string;
}) {
  const [assigned, setAssigned] = useState<BookingStaffAssignment[]>([]);
  const [people, setPeople] = useState<AssignableStaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffId, setStaffId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [a, p] = await Promise.all([
      listBookingStaffAssignments(organizerId, bookingId),
      listAssignableStaff(organizerId, bookingId),
    ]);
    if (a.success) setAssigned(a.data);
    else setError(a.error);
    if (p.success) setPeople(p.data);
    else setError(p.error);
    setLoading(false);
  }, [organizerId, bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = people.find((p) => p.id === staffId) ?? null;

  async function handleAssign() {
    if (!staffId) return;
    setError(null);
    setBusy(true);
    const res = await assignStaffToBooking(organizerId, bookingId, staffId, roleId || null);
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setStaffId("");
    setRoleId("");
    await load();
  }

  async function handleRemove(id: string) {
    setError(null);
    setRemovingId(id);
    const res = await unassignStaffFromBooking(organizerId, bookingId, id);
    setRemovingId(null);
    if (!res.success) {
      setError(res.error);
      return;
    }
    await load();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
      {loading ? (
        <p className="text-xs text-zinc-500">Loading...</p>
      ) : (
        <>
          {assigned.length === 0 ? (
            <p className="text-xs text-zinc-500">No staff assigned to this booking yet.</p>
          ) : (
            <ul className="space-y-2">
              {assigned.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm text-zinc-800">
                  <span>
                    <strong>{a.staff_name}</strong>
                    {a.role_name ? ` - ${a.role_name}` : ""}
                    <span className="ml-2 text-xs text-zinc-500">{a.status}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(a.id)}
                    disabled={removingId === a.id}
                    className="rounded-full border border-red-300 px-3 py-1 text-xs font-bold text-red-600 disabled:opacity-60"
                  >
                    {removingId === a.id ? "Removing..." : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-2 border-t border-zinc-100 pt-3">
            <select
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value);
                setRoleId("");
              }}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="">Choose a staff member</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </select>
            <select
              value={roleId}
              onChange={(e) => setRoleId(e.target.value)}
              disabled={!selected}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="">No role</option>
              {(selected?.roles ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAssign}
              disabled={busy || !staffId}
              className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {busy ? "Assigning..." : "Assign"}
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}