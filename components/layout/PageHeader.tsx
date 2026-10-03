import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: { label: string; variant?: "neutral" | "orange" | "emerald" | "amber" | "rose" };
  actions?: React.ReactNode;
  className?: string;
};

/**
 * PageHeader — standardized page top: eyebrow + title + description + actions.
 * Responsive: stacks on mobile, row on sm+; actions wrap.
 * Use in dashboard pages and website settings instead of bespoke <header>.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            {title}
          </h1>
          {badge && (
            <Badge variant={badge.variant ?? "neutral"} size="sm">
              {badge.label}
            </Badge>
          )}
        </div>
        {description && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end sm:shrink-0">
          {actions}
        </div>
      )}
    </header>
  );
}

export function PageHeaderLinkAction({
  href,
  children,
  variant = "default",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "default" | "secondary";
}) {
  const cls =
    variant === "secondary"
      ? "inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 shadow-xs"
      : "inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-xs";
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}
