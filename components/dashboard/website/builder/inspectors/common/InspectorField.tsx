"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface InspectorFieldProps {
  label: string;
  description?: string;
  requiredForPublish?: boolean;
  currentLength?: number;
  maxLength?: number;
  error?: string;
  warning?: string;
  children: React.ReactNode;
  className?: string;
}

export function InspectorField({
  label,
  description,
  requiredForPublish,
  currentLength,
  maxLength,
  error,
  warning,
  children,
  className,
}: InspectorFieldProps) {
  const isOverLimit =
    typeof currentLength === "number" &&
    typeof maxLength === "number" &&
    currentLength > maxLength;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <label className="font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
          {label}
          {requiredForPublish && (
            <span
              className="text-[10px] font-medium text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400 px-1.5 py-0.5 rounded border border-amber-200 dark:border-amber-800"
              title="Required when publishing the live page. Can be left empty while saving drafts."
            >
              Required to publish
            </span>
          )}
        </label>
        {typeof maxLength === "number" && (
          <span
            className={cn(
              "text-[11px] tabular-nums",
              isOverLimit
                ? "text-red-600 font-semibold"
                : currentLength && currentLength > maxLength * 0.85
                  ? "text-amber-600"
                  : "text-zinc-400"
            )}
          >
            {currentLength ?? 0} / {maxLength}
          </span>
        )}
      </div>

      {description && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      )}

      {children}

      {error ? (
        <p className="text-xs font-medium text-red-600 dark:text-red-400 mt-1">
          {error}
        </p>
      ) : warning ? (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          {warning}
        </p>
      ) : null}
    </div>
  );
}
