"use client";

import { useMemo, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { adaptPlan } from "@/lib/seating-adapter";
import { clampStressCount, generateStressSeats } from "./stress";
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

// Page-rAF frame-time stats (rolling ~5 s window). This measures the page's
// own rAF cadence as a main-thread-jank proxy while orbiting — not the picker
// engine's internals. Preview-only.
function useFrameStats(active: boolean) {
  const [stats, setStats] = useState<{ p50: number; p95: number; n: number } | null>(null);
  useEffect(() => {
    if (!active) return;
    const deltas: number[] = [];
    let raf = 0;
    let last = performance.now();
    let lastReport = last;
    const loop = (now: number) => {
      deltas.push(now - last);
      last = now;
      if (deltas.length > 300) deltas.splice(0, deltas.length - 300);
      if (now - lastReport > 1000) {
        lastReport = now;
        const sorted = [...deltas].sort((a, b) => a - b);
        const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
        setStats({ p50: q(0.5), p95: q(0.95), n: sorted.length });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return stats;
}

export default function PreviewClient({
  layout,
  seats,
}: {
  layout: FullVenueLayout;
  seats: SeatGeometry[];
}) {
  const [synthetic, setSynthetic] = useState(true);
  // Stress mode (?seats=N, capped at 5000): generated seats replace the
  // fixture in memory. Read post-mount to avoid SSR/hydration mismatch.
  const [stressCount, setStressCount] = useState<number | null>(null);
  useEffect(() => {
    setStressCount(clampStressCount(new URLSearchParams(window.location.search).get("seats")));
  }, []);
  const frameStats = useFrameStats(stressCount != null);
  const sourceSeats = useMemo(
    () => (stressCount != null ? generateStressSeats(stressCount) : seats),
    [stressCount, seats]
  );
  const sourceLayout = useMemo<FullVenueLayout>(
    () =>
      stressCount != null
        ? {
            ...layout,
            name: `${layout.name} (stress)`,
            sections: [{ name: "Stress" }],
            venue_objects: [],
          }
        : layout,
    [stressCount, layout]
  );
  const plan = useMemo(
    () =>
      adaptPlan({
        ...sourceLayout,
        seats: synthetic && stressCount == null ? applySyntheticTaken(sourceSeats) : sourceSeats,
      } as FullVenueLayout),
    [sourceLayout, sourceSeats, synthetic, stressCount]
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
        {stressCount != null && (
          <p
            role="status"
            className="rounded-md bg-purple-50 px-2.5 py-1.5 text-xs font-bold text-purple-800"
          >
            SYNTHETIC STRESS DATA — {stressCount} generated seats in memory only;
            nothing written to disk. Append ?seats=N (cap 5000) to change the count.
            {frameStats && (
              <>
                {" "}Frame times (page rAF, rolling ~5 s): p50 {frameStats.p50.toFixed(1)} ms ·
                p95 {frameStats.p95.toFixed(1)} ms (n={frameStats.n}).
              </>
            )}
          </p>
        )}
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
