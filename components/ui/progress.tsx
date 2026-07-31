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

/** Linear progress bar (goal/raised style). */
function Progress({ value, className, trackClassName, fillClassName }: ProgressProps) {
  const pct = clampPct(value);
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-zinc-100", trackClassName, className)}
    >
      <div
        className={cn("h-full rounded-full bg-emerald-500 transition-all duration-500", fillClassName)}
        style={{ width: `${pct}%` }}
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

/** Circular progress ring, with an optional centered label/content slot. */
function ProgressRing({
  value,
  size = 96,
  strokeWidth = 10,
  trackColor = "#e4e4e7",
  fillColor = "#059669",
  className,
  children,
}: ProgressRingProps) {
  const pct = clampPct(value);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  const center = size / 2;

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={fillColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      {children && <div className="absolute flex flex-col items-center justify-center">{children}</div>}
    </div>
  );
}

export { Progress, ProgressRing };
