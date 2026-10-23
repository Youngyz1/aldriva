"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconRotateClockwise as RotateCw } from "@tabler/icons-react";

export interface OverviewShellProps {
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
}

export function OverviewShell({
  title,
  subtitle,
  badge,
  children,
}: OverviewShellProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 60-second auto-refresh when the tab is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        startTransition(() => {
          router.refresh();
        });
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [router]);

  function handleManualRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-zinc-200/80 pb-5">
        <div>
          {badge && (
            <p className="text-xs font-black uppercase tracking-wider text-orange-600 mb-0.5">
              {badge}
            </p>
          )}
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl text-zinc-950">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-sm font-medium text-zinc-500">{subtitle}</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleManualRefresh}
          disabled={isPending}
          className="inline-flex min-h-[44px] items-center gap-2 self-start sm:self-auto rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 transition active:scale-95 disabled:opacity-50"
          title="Refresh dashboard"
        >
          <RotateCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin text-orange-600" : "text-zinc-500"}`} />
          <span>Refresh</span>
        </button>
      </header>

      <div className="space-y-6">{children}</div>
    </div>
  );
}
