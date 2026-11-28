"use client";

/**
 * components/dashboard/overview/OverviewShell.tsx
 *
 * Padding-free, mobile-first workspace overview container.
 * docs/design/dashboard-overview/01-overview-anatomy.md §3.
 * Layout owns padding; shell owns max-width and auto-refresh.
 */

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export interface OverviewShellProps {
  workspaceName: string;
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  refreshInterval?: number;
}

export function OverviewShell({
  workspaceName,
  header,
  children,
  className = "",
  refreshInterval = 60_000,
}: OverviewShellProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [minutesAgo, setMinutesAgo] = useState(0);

  // Auto-refresh when tab is visible
  useEffect(() => {
    let lastRefresh = Date.now();

    const refreshTimer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        startTransition(() => {
          router.refresh();
          lastRefresh = Date.now();
          setMinutesAgo(0);
        });
      }
    }, refreshInterval);

    const minutesTimer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - lastRefresh) / 60_000);
      setMinutesAgo(elapsed);
    }, 30_000);

    return () => {
      clearInterval(refreshTimer);
      clearInterval(minutesTimer);
    };
  }, [router, refreshInterval]);

  return (
    <div className={`w-full max-w-6xl mx-auto ${className}`}>
      {/* Accessible document outline heading */}
      <h1 className="sr-only">{workspaceName} Overview</h1>

      {header}

      <div className="space-y-6 pt-4">
        {children}

        {/* Refresh status indicator */}
        <div className="pt-4 pb-2 text-center">
          <p className="text-[11px] font-medium text-zinc-400">
            {minutesAgo === 0 ? "Updated just now" : `Updated ${minutesAgo}m ago`} · Auto-refreshes every 60s
          </p>
        </div>
      </div>
    </div>
  );
}
