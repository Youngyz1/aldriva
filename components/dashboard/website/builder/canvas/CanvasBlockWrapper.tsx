/**
 * components/dashboard/website/builder/canvas/CanvasBlockWrapper.tsx
 *
 * Interactive container wrapper for blocks in the canvas with selection state,
 * hover action controls, validation error banners, and insertion separators.
 */

"use client";

import React from "react";
import { Block } from "@/lib/website-blocks";
import { CanvasBlockPreview } from "./CanvasBlockPreview";
import { BuilderEmbedOptions } from "@/lib/actions/website-builder";
import { ValidationErrorIssue } from "../types";
import {
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  AlertCircle,
  Plus,
  SlidersHorizontal,
} from "lucide-react";

interface CanvasBlockWrapperProps {
  block: Block;
  index: number;
  totalBlocks: number;
  isSelected: boolean;
  validationIssues?: ValidationErrorIssue[];
  embedOptions?: BuilderEmbedOptions;
  onSelect: (index: number) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  onInsertBelow: (insertAtIndex: number) => void;
}

export function CanvasBlockWrapper({
  block,
  index,
  totalBlocks,
  isSelected,
  validationIssues,
  embedOptions,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  onInsertBelow,
}: CanvasBlockWrapperProps) {
  const hasErrors = Boolean(validationIssues && validationIssues.length > 0);

  return (
    <div className="relative group/block mb-4">
      {/* Block Container with Selection / Error States */}
      <div
        onClick={() => onSelect(index)}
        className={`relative rounded-xl border bg-white dark:bg-zinc-900 transition-all cursor-pointer ${
          hasErrors
            ? "border-rose-500 ring-2 ring-rose-500/80 shadow-md"
            : isSelected
              ? "border-brand-600 ring-2 ring-brand-600/80 shadow-md"
              : "border-zinc-200/80 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700 shadow-xs"
        }`}
      >
        {/* Floating Header Toolbar */}
        <div
          className={`absolute top-2 right-2 z-20 flex items-center gap-1 rounded-lg border bg-white/95 px-2 py-1 shadow-sm backdrop-blur-sm dark:bg-zinc-800/95 transition-opacity ${
            isSelected || hasErrors
              ? "opacity-100 border-zinc-300 dark:border-zinc-700"
              : "opacity-0 group-hover/block:opacity-100 border-zinc-200 dark:border-zinc-700"
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300 uppercase mr-1">
            {block.type.replace("_", " ")}
          </span>

          <button
            type="button"
            onClick={() => onMove(index, index - 1)}
            disabled={index === 0}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-20 dark:hover:bg-zinc-700"
            title="Move Up"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onMove(index, index + 1)}
            disabled={index === totalBlocks - 1}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-20 dark:hover:bg-zinc-700"
            title="Move Down"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onDuplicate(index)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-700"
            title="Duplicate Block"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onSelect(index)}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-brand-600 dark:hover:bg-zinc-700"
            title="Edit Properties"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={() => onRemove(index)}
            className="rounded p-1 text-zinc-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
            title="Remove Block"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Validation Error Banner */}
        {hasErrors && (
          <div className="rounded-t-xl bg-rose-50 px-4 py-2 border-b border-rose-200 dark:bg-rose-950/50 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Validation issue on this block:</span>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5 text-[11px]">
                {validationIssues?.map((issue, i) => (
                  <li key={i}>{issue.message}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Inner Block Visual Render */}
        <div className="overflow-hidden rounded-xl pointer-events-none select-none">
          <CanvasBlockPreview block={block} embedOptions={embedOptions} />
        </div>
      </div>

      {/* Insertion Separator ("+ Insert Block") */}
      <div className="relative py-2 flex items-center justify-center opacity-0 group-hover/block:opacity-100 transition-opacity">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-dashed border-zinc-300 dark:border-zinc-700" />
        </div>
        <button
          type="button"
          onClick={() => onInsertBelow(index + 1)}
          className="relative inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 shadow-xs border border-zinc-300 hover:bg-zinc-50 hover:text-brand-700 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-750"
        >
          <Plus className="h-3 w-3 text-brand-600" />
          <span>Insert block here</span>
        </button>
      </div>
    </div>
  );
}
