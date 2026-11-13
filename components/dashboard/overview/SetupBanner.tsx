"use client";

/**
 * components/dashboard/overview/SetupBanner.tsx
 *
 * Slim 44px setup checklist banner replacing multi-row card.
 * docs/design/dashboard-overview/01-overview-anatomy.md §1.10.
 */

import React, { useState } from "react";
import Link from "next/link";
import {
  IconChevronRight as ChevronRight,
  IconCheck as Check,
  IconCircle as Circle,
  IconX as X,
} from "@tabler/icons-react";

export interface SetupStep {
  id: string;
  label: string;
  completed: boolean;
  href: string;
}

export interface SetupBannerProps {
  steps: SetupStep[];
  className?: string;
}

export function SetupBanner({ steps, className = "" }: SetupBannerProps) {
  const [open, setOpen] = useState(false);

  if (!steps || steps.length === 0) return null;

  const completedCount = steps.filter((s) => s.completed).length;
  const totalCount = steps.length;

  // Fully completed -> do not render
  if (completedCount >= totalCount) return null;

  return (
    <>
      <div
        className={`min-h-[44px] flex items-center justify-between px-3.5 py-2 rounded-xl border border-zinc-200 bg-white text-zinc-900 ${className}`}
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-1 flex items-center justify-between text-left group min-h-[36px]"
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-zinc-900">
              Finish setup
            </span>
            <span className="text-[12px] font-medium text-zinc-500">
              · {completedCount} of {totalCount} completed
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 transition" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[var(--z-sheet-backdrop)] flex items-end justify-center">
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-full max-w-lg rounded-t-2xl bg-white p-5 z-[var(--z-sheet)] pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl animate-in slide-in-from-bottom duration-200">
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-200" />
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-bold text-zinc-900">Workspace Setup</h3>
                <p className="text-xs text-zinc-500">
                  Complete these steps to get your site ready.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="divide-y divide-zinc-100 mt-2">
              {steps.map((step) => (
                <Link
                  key={step.id}
                  href={step.href}
                  onClick={() => setOpen(false)}
                  className="min-h-[48px] flex items-center justify-between py-3 px-2 hover:bg-zinc-50 rounded-lg group transition"
                >
                  <div className="flex items-center gap-3">
                    {step.completed ? (
                      <div className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <Check className="h-3 w-3" />
                      </div>
                    ) : (
                      <Circle className="h-5 w-5 text-zinc-300" />
                    )}
                    <span
                      className={`text-sm ${
                        step.completed
                          ? "line-through text-zinc-400"
                          : "font-medium text-zinc-800"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
