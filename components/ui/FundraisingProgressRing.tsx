"use client";

import { useEffect, useId, useState } from "react";

export type FundraisingProgressRingProps = {
  raised?: number;
  goal?: number;
  percentage?: number;
  size?: number; // Default 220
  strokeWidth?: number; // Default 16
  animated?: boolean; // Default true
  showDetails?: boolean; // Default true
  className?: string;
  textColor?: string;
  trackColor?: string;
  progressColor?: string;
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function getMilestoneGlow(pct: number): { containerClass: string; svgStyle: React.CSSProperties } {
  if (pct >= 100) {
    return {
      containerClass: "transition-all duration-700 ease-out",
      svgStyle: {
        filter: "drop-shadow(0 6px 18px rgba(249, 115, 22, 0.35))",
      },
    };
  }
  if (pct >= 75) {
    return {
      containerClass: "transition-all duration-700 ease-out",
      svgStyle: {
        filter: "drop-shadow(0 4px 14px rgba(234, 179, 8, 0.28))",
      },
    };
  }
  if (pct >= 50) {
    return {
      containerClass: "transition-all duration-700 ease-out",
      svgStyle: {
        filter: "drop-shadow(0 4px 12px rgba(132, 204, 22, 0.22))",
      },
    };
  }
  if (pct >= 25) {
    return {
      containerClass: "transition-all duration-700 ease-out scale-[1.01]",
      svgStyle: {
        filter: "drop-shadow(0 2px 8px rgba(34, 197, 94, 0.15))",
      },
    };
  }
  return {
    containerClass: "transition-all duration-700 ease-out",
    svgStyle: {},
  };
}

export default function FundraisingProgressRing({
  raised,
  goal,
  percentage,
  size = 220,
  strokeWidth = 16,
  animated = true,
  showDetails = true,
  className = "",
  textColor,
  trackColor = "#154D40",
  progressColor,
}: FundraisingProgressRingProps) {
  const reactId = useId();
  const gradientId = `fundraising-gradient-${reactId.replace(/:/g, "-")}`;

  // Calculate percentage if not directly provided
  const targetPct = (() => {
    if (percentage !== undefined && percentage !== null) {
      return Math.max(0, Math.min(100, percentage));
    }
    if (raised !== undefined && goal !== undefined && goal > 0) {
      return Math.max(0, Math.min(100, Math.round((raised / goal) * 100)));
    }
    return 0;
  })();

  const [displayedPct, setDisplayedPct] = useState(0);

  useEffect(() => {
    if (!animated) {
      setDisplayedPct(targetPct);
      return;
    }

    // Check prefers-reduced-motion
    if (typeof window !== "undefined") {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced) {
        setDisplayedPct(targetPct);
        return;
      }
    }

    let startTime: number | null = null;
    const duration = 800; // ms (within 700-900ms requirement)
    let animationFrameId: number;

    const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progressFactor = Math.min(1, elapsed / duration);
      const easedProgress = easeOutCubic(progressFactor);

      setDisplayedPct(Math.round(easedProgress * targetPct));

      if (progressFactor < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [targetPct, animated]);

  // SVG dimensions
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (displayedPct / 100) * circumference;

  const milestone = getMilestoneGlow(targetPct);

  // Accessible description
  const ariaText = raised !== undefined && goal !== undefined
    ? `Fundraising progress: ${displayedPct}% (${formatMoney(raised)} of ${formatMoney(goal)} reached)`
    : `Fundraising progress: ${displayedPct}% reached`;

  return (
    <div
      role="progressbar"
      aria-label={ariaText}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={displayedPct}
      className={`relative inline-flex items-center justify-center max-w-full ${milestone.containerClass} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="rotate-[-90deg] overflow-visible"
        style={milestone.svgStyle}
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#22C55E" />
            <stop offset="35%" stopColor="#84CC16" />
            <stop offset="70%" stopColor="#EAB308" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
        </defs>

        {/* Background track circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />

        {/* Progress stroke circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={progressColor || `url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: "stroke-dashoffset 800ms cubic-bezier(0.33, 1, 0.68, 1)",
          }}
        />
      </svg>

      {/* Center typography */}
      {showDetails && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-0.5 pointer-events-none">
          <span
            className={`font-black tracking-tight leading-none select-none ${textColor || "text-zinc-950"}`}
            style={{ fontSize: Math.max(11, Math.round(size * 0.28)) }}
          >
            {displayedPct}%
          </span>

          {raised !== undefined && goal !== undefined && size >= 140 && (
            <span
              className="font-semibold text-zinc-500 leading-tight mt-1.5 truncate max-w-[90%]"
              style={{ fontSize: Math.max(10, Math.round(size * 0.062)) }}
            >
              {formatMoney(raised)} of {formatMoney(goal)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
