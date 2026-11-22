/**
 * components/dashboard/overview/StatusChip.tsx
 *
 * Semantic status chip mapped to live CHECK constraints via lib/dashboard/status-map.ts.
 * docs/design/dashboard-overview/04-components.md §3.
 */

import { resolveStatus, humanizeStatus } from "@/lib/dashboard/status-map";
import type { StatusDomain, Tone } from "@/lib/dashboard/types";

export interface StatusChipProps {
  domain: StatusDomain;
  value: string;
  size?: "sm" | "md";
  dot?: boolean;
  className?: string;
}

const TONE_CLASSES: Record<Tone, { bg: string; text: string; dot: string }> = {
  neutral: {
    bg: "bg-zinc-100",
    text: "text-zinc-700",
    dot: "bg-zinc-400",
  },
  info: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    dot: "bg-blue-500",
  },
  success: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-500",
  },
  critical: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
  },
};

export function StatusChip({
  domain,
  value,
  size = "md",
  dot = true,
  className = "",
}: StatusChipProps) {
  const meta = resolveStatus(domain, value);
  const toneStyle = TONE_CLASSES[meta.tone] || TONE_CLASSES.neutral;
  const label = meta.label || humanizeStatus(value);

  const sizeClasses =
    size === "sm"
      ? "h-5 px-1.5 text-[11px] gap-1"
      : "h-6 px-2 text-[12px] gap-1.5";

  return (
    <span
      title={`${domain}: ${value}`}
      className={`inline-flex items-center font-medium rounded-full ${sizeClasses} ${toneStyle.bg} ${toneStyle.text} ${className}`}
    >
      {dot && (
        <span
          className={`h-1.5 w-1.5 rounded-full shrink-0 ${toneStyle.dot}`}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}
