"use client";

import FundraisingProgressRing, {
  type FundraisingProgressRingProps,
} from "./FundraisingProgressRing";

export { default as FundraisingProgressRing } from "./FundraisingProgressRing";
export type { FundraisingProgressRingProps };

// Continuous progression color milestone helper
const COLOR_STOPS = [
  { pct: 0, r: 187, g: 247, b: 208 },   // 0% -> Pale Green (#bbf7d0)
  { pct: 20, r: 110, g: 231, b: 183 },  // 20% -> Mint (#6ee7b7)
  { pct: 40, r: 16, g: 185, b: 129 },   // 40% -> Emerald (#10b981)
  { pct: 60, r: 5, g: 150, b: 105 },    // 60% -> Forest Green (#059669)
  { pct: 80, r: 4, g: 120, b: 87 },     // 80% -> Deep Emerald (#047857)
  { pct: 100, r: 234, g: 179, b: 8 },   // 100% -> Premium Gold-Green (#eab308)
];

export function getContinuousProgressColor(percentage: number): string {
  const p = Math.max(0, Math.min(100, percentage));

  let lower = COLOR_STOPS[0];
  let upper = COLOR_STOPS[COLOR_STOPS.length - 1];

  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (p >= COLOR_STOPS[i].pct && p <= COLOR_STOPS[i + 1].pct) {
      lower = COLOR_STOPS[i];
      upper = COLOR_STOPS[i + 1];
      break;
    }
  }

  const range = upper.pct - lower.pct;
  const t = range === 0 ? 0 : (p - lower.pct) / range;

  const r = Math.round(lower.r + t * (upper.r - lower.r));
  const g = Math.round(lower.g + t * (upper.g - lower.g));
  const b = Math.round(lower.b + t * (upper.b - lower.b));

  return `rgb(${r}, ${g}, ${b})`;
}

type ProgressRingProps = {
  percentage?: number;
  raised?: number;
  goal?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showText?: boolean;
  showDetails?: boolean;
  animated?: boolean;
  textColor?: string;
  trackColor?: string;
  progressColor?: string;
};

export default function ProgressRing({
  percentage,
  raised,
  goal,
  size = 96,
  strokeWidth = 10,
  className = "",
  showText = true,
  showDetails,
  animated = true,
  textColor,
  trackColor,
  progressColor,
}: ProgressRingProps) {
  return (
    <FundraisingProgressRing
      percentage={percentage}
      raised={raised}
      goal={goal}
      size={size}
      strokeWidth={strokeWidth}
      showDetails={showDetails !== undefined ? showDetails : (raised !== undefined && goal !== undefined ? true : showText)}
      animated={animated}
      className={className}
      textColor={textColor}
      trackColor={trackColor}
      progressColor={progressColor}
    />
  );
}
