"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { adaptPlan } from "@/lib/seating-adapter";
import type { FullVenueLayout, SeatGeometry } from "@/lib/seating";

const VenueSeatPicker3D = dynamic(
  () =>
    import("@/components/ui/venue-seat-picker-3d").then((m) => m.VenueSeatPicker3D),
  { ssr: false }
);

const ASSIGNED_PLACEHOLDER = "00000000-0000-4000-8000-000000000000";

// Synthetic overlay (P1): deterministic, in-memory only. The fixture files
// are never written. Toggleable so the all-available baseline stays viewable.
function applySyntheticTaken(seats: SeatGeometry[]): SeatGeometry[] {
  const sorted = [...seats].sort((a, b) => (a.id < b.id ? -1 : 1));
  const in5min = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const ago5min = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  return sorted.map((s, i) => {
    if (i < 3) return { ...s, status: "sold" as const };
    if (i < 5) return { ...s, status: "reserved" as const, reserved_until: in5min };
    if (i === 5) return { ...s, status: "reserved" as const, reserved_until: ago5min };
    if (i === 6) return { ...s, assigned_invitation_id: ASSIGNED_PLACEHOLDER };
    return s;
  });
}

export default function PreviewClient({
  layout,
  seats,
}: {
  layout: FullVenueLayout;
  seats: SeatGeometry[];
}) {
  const [synthetic, setSynthetic] = useState(true);
  const plan = useMemo(
    () =>
      adaptPlan({
        ...layout,
        seats: synthetic ? applySyntheticTaken(seats) : seats,
      } as FullVenueLayout),
    [layout, seats, synthetic]
  );

  return (
    <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          Dev preview — not linked in production
        </p>
        <h1 className="text-xl font-black">3D seat picker preview</h1>
        <p className="text-sm text-zinc-500">
          Real staging fixture ({seats.length} seats) → adapter → picker. demo off,
          seatRadius 13.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSynthetic((v) => !v)}
          aria-pressed={synthetic}
          className="rounded-xl border border-zinc-300 px-3 py-2 text-sm font-bold hover:bg-zinc-50"
        >
          Synthetic taken seats: {synthetic ? "on" : "off"}
        </button>
        {synthetic && (
          <p
            role="status"
            className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800"
          >
            SYNTHETIC — 3 sold, 2 active-reserved, 1 expired-reserved, 1
            invitation-held seat altered in memory only. Fixture files untouched.
          </p>
        )}
      </div>

      <VenueSeatPicker3D venue={plan} seatRadius={13} maxSeats={10} currency="USD" />
    </main>
  );
}
