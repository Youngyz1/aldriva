"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface InspectorSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
}

export function InspectorSection({
  title,
  description,
  defaultOpen = true,
  collapsible = true,
  children,
  className,
  badge,
}: InspectorSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-900 shadow-xs overflow-hidden",
        className
      )}
    >
      <div
        onClick={() => collapsible && setIsOpen(!isOpen)}
        className={cn(
          "px-4 py-3 flex items-center justify-between",
          collapsible ? "cursor-pointer select-none hover:bg-zinc-50/50 dark:hover:bg-zinc-800/50 transition-colors" : ""
        )}
      >
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
              {title}
            </h4>
            {badge}
          </div>
          {description && (
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {description}
            </p>
          )}
        </div>

        {collapsible && (
          <button
            type="button"
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
            aria-label={isOpen ? "Collapse section" : "Expand section"}
          >
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="px-4 pb-4 pt-1 space-y-3.5 border-t border-zinc-100 dark:border-zinc-800">
          {children}
        </div>
      )}
    </div>
  );
}
