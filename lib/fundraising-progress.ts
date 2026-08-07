import type { CSSProperties } from "react";

export const FUNDRAISING_PROGRESS_DURATION = "260ms";
export const FUNDRAISING_PROGRESS_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

type ProgressStop = {
  pct: number;
  color: string;
};

const PROGRESS_STOPS: ProgressStop[] = [
  { pct: 0, color: "#dcfce7" },
  { pct: 10, color: "#bbf7d0" },
  { pct: 25, color: "#4ade80" },
  { pct: 50, color: "#10b981" },
  { pct: 70, color: "#059669" },
  { pct: 90, color: "#16a34a" },
  { pct: 100, color: "#d4af37" },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function parseHex(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function toHex(value: number) {
  return Math.round(value).toString(16).padStart(2, "0");
}

function interpolateColor(from: string, to: string, amount: number) {
  const start = parseHex(from);
  const end = parseHex(to);
  return `#${toHex(start.r + (end.r - start.r) * amount)}${toHex(
    start.g + (end.g - start.g) * amount
  )}${toHex(start.b + (end.b - start.b) * amount)}`;
}

export function calculateFundraisingPercentage(
  raised: number | string | null | undefined,
  goal: number | string | null | undefined
) {
  const safeRaised = Math.max(0, Number(raised ?? 0));
  const safeGoal = Number(goal ?? 0);

  if (!Number.isFinite(safeRaised) || !Number.isFinite(safeGoal) || safeGoal <= 0) {
    return 0;
  }

  return clamp(Math.round((safeRaised / safeGoal) * 100), 0, 100);
}

export function getFundraisingProgressColor(percentage: number) {
  const pct = clamp(Number.isFinite(percentage) ? percentage : 0, 0, 100);
  const nextStop = PROGRESS_STOPS.find((stop) => stop.pct >= pct) ?? PROGRESS_STOPS[PROGRESS_STOPS.length - 1];
  const previousStop =
    [...PROGRESS_STOPS].reverse().find((stop) => stop.pct <= pct) ?? PROGRESS_STOPS[0];

  if (nextStop.pct === previousStop.pct) return nextStop.color;

  const span = nextStop.pct - previousStop.pct;
  const amount = span > 0 ? (pct - previousStop.pct) / span : 0;
  return interpolateColor(previousStop.color, nextStop.color, amount);
}

export function getFundraisingProgressGlow(percentage: number) {
  const pct = clamp(Number.isFinite(percentage) ? percentage : 0, 0, 100);
  const color = getFundraisingProgressColor(pct);
  const alpha = pct >= 90 ? 0.42 : pct >= 70 ? 0.32 : pct >= 50 ? 0.24 : 0.14;
  const { r, g, b } = parseHex(color);
  return `0 0 ${pct >= 90 ? 22 : 14}px rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getFundraisingProgressVars(percentage: number): CSSProperties {
  const pct = clamp(Number.isFinite(percentage) ? percentage : 0, 0, 100);

  return {
    "--fundraising-progress-fill": getFundraisingProgressColor(pct),
    "--fundraising-progress-glow": getFundraisingProgressGlow(pct),
    "--fundraising-progress-duration": FUNDRAISING_PROGRESS_DURATION,
    "--fundraising-progress-ease": FUNDRAISING_PROGRESS_EASING,
  } as CSSProperties;
}

export function fundraisingProgressLabel(percentage: number) {
  const pct = clamp(Number.isFinite(percentage) ? percentage : 0, 0, 100);
  return `${pct}% funded`;
}
