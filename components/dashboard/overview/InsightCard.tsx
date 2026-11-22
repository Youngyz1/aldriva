/**
 * components/dashboard/overview/InsightCard.tsx
 *
 * Operational recommendation card.
 * docs/design/dashboard-overview/04-components.md §6 and 05 §1.
 */

import React from "react";
import Link from "next/link";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";

export interface InsightCardProps {
  ruleId: string;
  severity: "info" | "warning" | "critical";
  title: string;
  evidence?: string;
  action: {
    label: string;
    href: string;
  };
  className?: string;
}

const SEVERITY_CLASSES: Record<"info" | "warning" | "critical", { border: string; badge: string }> = {
  info: {
    border: "border-l-blue-500",
    badge: "bg-blue-50 text-blue-700",
  },
  warning: {
    border: "border-l-amber-500",
    badge: "bg-amber-50 text-amber-700",
  },
  critical: {
    border: "border-l-red-500",
    badge: "bg-red-50 text-red-700",
  },
};

export function InsightCard({
  ruleId,
  severity,
  title,
  evidence,
  action,
  className = "",
}: InsightCardProps) {
  const sev = SEVERITY_CLASSES[severity] || SEVERITY_CLASSES.info;

  return (
    <div
      data-rule-id={ruleId}
      className={`min-h-[88px] p-4 rounded-xl border border-zinc-200 border-l-4 ${sev.border} bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="space-y-1 min-w-0">
        <p className="text-[14px] sm:text-[15px] font-bold text-zinc-900 leading-snug">
          {title}
        </p>
        {evidence && (
          <p className="text-xs text-zinc-600">
            {evidence}
          </p>
        )}
      </div>

      <Link
        href={action.href}
        className="inline-flex min-h-[44px] items-center gap-1.5 text-xs font-bold text-brand-700 hover:text-brand-800 shrink-0 self-start sm:self-center"
      >
        <span>{action.label}</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
