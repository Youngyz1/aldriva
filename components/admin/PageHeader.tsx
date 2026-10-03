/**
 * components/admin/PageHeader.tsx
 * Shared admin page header: neutral muted eyebrow (same color on every
 * page), fluid title sized with clamp() (rem-based, never bare vw),
 * description, and an optional right-aligned primary action.
 */

import type { ReactNode } from "react";

export type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
};

export default function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pb-1">
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wide text-zinc-400">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-[clamp(1.5rem,1.25rem+1.5vw,1.875rem)] font-black tracking-tight text-zinc-950">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm font-medium text-zinc-500">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
