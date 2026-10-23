"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { IconCircleCheck as CheckCircle2, IconCircle as Circle, IconChevronDown as ChevronDown, IconChevronUp as ChevronUp, IconSparkles as Sparkles } from "@tabler/icons-react";
import type { SetupChecklistItem } from "@/lib/overview-types";

export interface SetupChecklistProps {
  organizerId: string;
  data: {
    isComplete: boolean;
    items: SetupChecklistItem[];
    completedCount: number;
    totalCount: number;
  };
}

export function SetupChecklist({ organizerId, data }: SetupChecklistProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Check localStorage for dismissed / collapsed preference
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`aldriva_setup_dismissed_${organizerId}`);
      if (stored === "true") {
        setDismissed(true);
      }
      const isCollapsed = localStorage.getItem(`aldriva_setup_collapsed_${organizerId}`);
      if (isCollapsed === "true" || data.isComplete) {
        setCollapsed(true);
      }
    } catch {
      // Non-fatal if localStorage is restricted
    }
  }, [organizerId, data.isComplete]);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(`aldriva_setup_collapsed_${organizerId}`, String(next));
    } catch {
      // Non-fatal
    }
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(`aldriva_setup_dismissed_${organizerId}`, "true");
    } catch {
      // Non-fatal
    }
  }

  if (dismissed) return null;

  // Resolved paths for links
  const resolveHref = (path: string) => {
    return path
      .replace("SETTINGS_PATH", `${organizerId}/settings`)
      .replace("MENU_PATH", `${organizerId}/menu`)
      .replace("SERVICES_PATH", `${organizerId}/services`)
      .replace("BUILDER_PATH", `${organizerId}/website/builder`);
  };

  // If complete, collapse to a small single-line badge
  if (data.isComplete) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-xs text-emerald-800">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <span className="font-bold">Setup complete</span>
          <span className="text-emerald-700">All essential setup steps are finished.</span>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 transition"
        >
          Dismiss
        </button>
      </div>
    );
  }

  const progressPercent = Math.round((data.completedCount / data.totalCount) * 100);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-zinc-100">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-black text-sm text-zinc-950">
              Get Started with Your Business ({data.completedCount}/{data.totalCount} completed)
            </h2>
            <div className="mt-1 flex items-center gap-2">
              <div className="w-32 sm:w-48 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                <div
                  className="h-full bg-orange-600 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs font-semibold text-zinc-400 tabular-nums">
                {progressPercent}%
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleCollapse}
            aria-expanded={!collapsed}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold text-zinc-600 hover:bg-zinc-100 transition"
          >
            {collapsed ? (
              <>
                <span>Show</span>
                <ChevronDown className="h-4 w-4" />
              </>
            ) : (
              <>
                <span>Hide</span>
                <ChevronUp className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="divide-y divide-zinc-100 bg-zinc-50/30">
          {data.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3.5 sm:px-5 hover:bg-zinc-50/80 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.completed ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <Circle className="h-4 w-4 shrink-0 text-zinc-300" />
                )}
                <span
                  className={`text-sm truncate ${
                    item.completed
                      ? "line-through text-zinc-400"
                      : "font-medium text-zinc-800"
                  }`}
                >
                  {item.label}
                </span>
              </div>

              {!item.completed && (
                <Link
                  href={resolveHref(item.href)}
                  className="inline-flex min-h-[44px] items-center rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 transition"
                >
                  Configure →
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
