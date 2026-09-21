/**
 * components/dashboard/website/builder/BuilderCanvas.tsx
 *
 * Center visual canvas displaying blocks in responsive simulated device frames.
 */

"use client";

import React from "react";
import { CanvasBlockWrapper } from "./canvas/CanvasBlockWrapper";
import { BuilderState } from "./types";
import { LayoutTemplate, Plus } from "lucide-react";

interface BuilderCanvasProps {
  state: BuilderState;
  onSelectBlock: (index: number | null) => void;
  onMoveBlock: (fromIndex: number, toIndex: number) => void;
  onDuplicateBlock: (index: number) => void;
  onRemoveBlock: (index: number) => void;
  onOpenAddModal: (insertAtIndex?: number) => void;
}

export function BuilderCanvas({
  state,
  onSelectBlock,
  onMoveBlock,
  onDuplicateBlock,
  onRemoveBlock,
  onOpenAddModal,
}: BuilderCanvasProps) {
  const blocks = state.present;
  const device = state.device;

  const deviceContainerClass =
    device === "desktop"
      ? "w-full max-w-5xl"
      : device === "tablet"
        ? "w-full max-w-[768px] shadow-lg border-x border-zinc-300 dark:border-zinc-700"
        : "w-full max-w-[390px] shadow-lg border-x border-zinc-300 dark:border-zinc-700";

  return (
    <main
      className="flex-1 overflow-y-auto bg-zinc-100/80 p-4 sm:p-6 lg:p-8 dark:bg-zinc-950 flex flex-col items-center min-w-0"
      onClick={() => onSelectBlock(null)}
    >
      <div
        className={`transition-all duration-300 ease-in-out ${deviceContainerClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        {blocks.length === 0 ? (
          /* Empty Page Canvas State */
          <div className="rounded-2xl border-2 border-dashed border-zinc-300 bg-white p-12 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <LayoutTemplate className="mx-auto h-12 w-12 text-zinc-400" />
            <h3 className="mt-4 text-base font-bold text-zinc-900 dark:text-zinc-100">
              Your page is currently empty
            </h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm mx-auto">
              Start building by adding a Hero banner, feature highlights, or embedding your live events and products.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => onOpenAddModal(0)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-800 active:bg-brand-900 transition-colors"
              >
                <Plus className="h-4 w-4" />
                <span>Add Your First Block</span>
              </button>
            </div>
          </div>
        ) : (
          /* Block List in Canvas */
          <div className="space-y-2">
            {blocks.map((block, index) => {
              const isSelected = state.selectedBlockIndex === index;
              const validationIssues =
                state.validation?.invalidBlockIndex === index
                  ? state.validation.issues
                  : undefined;

              return (
                <CanvasBlockWrapper
                  key={`${block.type}-${index}`}
                  block={block}
                  index={index}
                  totalBlocks={blocks.length}
                  isSelected={isSelected}
                  validationIssues={validationIssues}
                  embedOptions={state.availableEmbedOptions}
                  onSelect={onSelectBlock}
                  onMove={onMoveBlock}
                  onDuplicate={onDuplicateBlock}
                  onRemove={onRemoveBlock}
                  onInsertBelow={(insertIdx) => onOpenAddModal(insertIdx)}
                />
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
