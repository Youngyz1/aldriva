"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

function clampPct(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)));
}

interface ProgressProps {
  /** 0-100. Values outside that range are clamped. */
  value: number;
  className?: string;
  trackClassName?: string;
  fillClassName?: string;
}

/** Linear progress bar using the fixed gradient reveal technique. */
function Progress({ value, className, trackClassName }: ProgressProps) {
  const pct = clampPct(value);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-[#ECECEC]", trackClassName, className)}
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, #22C55E 0%, #84CC16 35%, #EAB308 70%, #F97316 100%)",
          clipPath: `inset(0 ${100 - pct}% 0 0 round 9999px)`,
          transition: "clip-path 800ms cubic-bezier(0.33, 1, 0.68, 1)",
        }}
      />
    </div>
  );
}

interface ProgressRingProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  fillColor?: string;
  className?: string;
  children?: React.ReactNode;
}

/** Circular progress ring using the fixed gradient reveal technique. */
function ProgressRing({
  value,
  size = 96,
  strokeWidth = 10,
  trackColor = "#ECECEC",
  className,
  children,
}: ProgressRingProps) {
  const reactId = useId();
  const gradientId = `ui-ring-gradient-${reactId.replace(/:/g, "-")}`;
  const pct = clampPct(value);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  const center = size / 2;

  return (
    <div className={cn("relative inline-flex items-center justify-center max-w-full", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22C55E" />
            <stop offset="35%" stopColor="#84CC16" />
            <stop offset="70%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
        </defs>
        <circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 800ms cubic-bezier(0.33, 1, 0.68, 1)" }}
        />
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

export { Progress, ProgressRing };
