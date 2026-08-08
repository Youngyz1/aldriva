"use client";

import { useEffect, useState } from "react";

export type ProgressBarProps = {
  percentage?: number;
  raised?: number;
  goal?: number;
  height?: number; // Default 8px
  showLabel?: boolean;
  className?: string;
  animated?: boolean;
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function ProgressBar({
  percentage,
  raised,
  goal,
  height = 8,
  showLabel = false,
  className = "",
  animated = true,
}: ProgressBarProps) {
  const targetPct = (() => {
    if (percentage !== undefined && percentage !== null) {
      return Math.max(0, Math.min(100, percentage));
    }
    if (raised !== undefined && goal !== undefined && goal > 0) {
      return Math.max(0, Math.min(100, Math.round((raised / goal) * 100)));
    }
    return 0;
  })();

  const [mountedPct, setMountedPct] = useState(0);

  useEffect(() => {
    if (!animated) {
      setMountedPct(targetPct);
      return;
    }

    if (typeof window !== "undefined") {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) {
        setMountedPct(targetPct);
        return;
      }
    }

    const frame = requestAnimationFrame(() => {
      setMountedPct(targetPct);
    });
    return () => cancelAnimationFrame(frame);
  }, [targetPct, animated]);

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between gap-2 mb-1.5 text-xs font-bold text-zinc-700">
          <span className="truncate">
            {raised !== undefined && goal !== undefined
              ? `${formatMoney(raised)} raised of ${formatMoney(goal)}`
              : `${targetPct}% funded`}
          </span>
          <span className="shrink-0 text-zinc-950 font-black">{targetPct}%</span>
        </div>
      )}

      {/* Progress track with fixed gradient reveal clip-path */}
      <div
        className="relative w-full overflow-hidden rounded-full bg-[#ECECEC]"
        style={{ height }}
        role="progressbar"
        aria-valuenow={targetPct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Fundraising progress: ${targetPct}% of goal reached`}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, #22C55E 0%, #84CC16 35%, #EAB308 70%, #F97316 100%)",
            clipPath: `inset(0 ${100 - mountedPct}% 0 0 round 9999px)`,
            transition: "clip-path 800ms cubic-bezier(0.33, 1, 0.68, 1)",
          }}
        />
      </div>
    </div>
  );
}
