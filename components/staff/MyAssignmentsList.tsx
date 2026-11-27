"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listMyRentalAssignments,
  respondToMyAssignment,
  type MyRentalAssignment,
} from "@/lib/actions/my-rental-assignments";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// My open rental assignments (delivery, pickup, chauffeur: the label is the
// business's own role). The database returns only my rows; this list shows them
// and lets me accept or decline.
export default function MyAssignmentsList({ businessId }: { businessId: string }) {
  const [rows, setRows] = useState<MyRentalAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listMyRentalAssignments(businessId);
    if (res.success) setRows(res.data);
    else setError(res.error);
    setLoading(false);
  }, [businessId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRespond(id: string, response: "accepted" | "declined") {
    setError(null);
    setBusyId(id);
    const res = await respondToMyAssignment(businessId, id, response);
    setBusyId(null);
    if (!res.success) {
      setError(res.error);
      return;
    }
    await load();
  }

  if (loading) return <p className="text-sm text-zinc-500">Loading...</p>;

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">You have no open assignments.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.assignment_id} className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono font-bold text-zinc-900">{r.booking_number}</span>
                <span className="text-xs font-semibold text-zinc-500">{r.assignment_status}</span>
              </div>
              {r.role_name && <p className="text-xs text-zinc-500">Role: {r.role_name}</p>}
              <p className="text-zinc-700">
                {formatDateTime(r.starts_at)} to {formatDateTime(r.ends_at)}
              </p>
              {(r.pickup_branch_label || r.return_branch_label) && (
                <p className="text-xs text-zinc-500">
                  {r.pickup_branch_label ? `Pickup: ${r.pickup_branch_label}` : ""}
                  {r.pickup_branch_label && r.return_branch_label ? " - " : ""}
                  {r.return_branch_label ? `Return: ${r.return_branch_label}` : ""}
                </p>
              )}
              <p className="text-zinc-700">
                {r.customer_name}
                {r.customer_phone ? ` - ${r.customer_phone}` : ""}
              </p>
              {r.assignment_notes && <p className="text-xs text-zinc-500">{r.assignment_notes}</p>}
              {r.assignment_status === "assigned" && (
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleRespond(r.assignment_id, "accepted")}
                    disabled={busyId === r.assignment_id}
                    className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespond(r.assignment_id, "declined")}
                    disabled={busyId === r.assignment_id}
                    className="rounded-full border border-red-300 px-4 py-2 text-xs font-bold text-red-600 disabled:opacity-60"
                  >
                    Decline
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}