/**
 * components/dashboard/website/builder/BlockPalette.tsx
 *
 * Left-side workspace drawer containing the block library catalog and page structure outline.
 */

"use client";

import React from "react";
import {
  LayoutTemplate,
  Grid,
  User,
  Image as ImageIcon,
  MessageSquareQuote,
  PhoneCall,
  HelpCircle,
  Calendar,
  ShoppingBag,
  HeartHandshake,
  FileText,
  Megaphone,
  Plus,
  Layers,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  AlertCircle,
} from "lucide-react";
import { Block } from "@/lib/website-blocks";
import { BLOCK_CATALOG } from "./defaultBlocks";
import { BuilderState } from "./types";

interface BlockPaletteProps {
  state: BuilderState;
  onAddBlock: (block: Block, insertAtIndex?: number) => void;
  onSelectBlock: (index: number | null) => void;
  onMoveBlock: (fromIndex: number, toIndex: number) => void;
  onDuplicateBlock: (index: number) => void;
  onRemoveBlock: (index: number) => void;
  onSetTab: (tab: "add" | "structure") => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutTemplate: <LayoutTemplate className="h-4 w-4 text-brand-600 dark:text-brand-400" />,
  Grid: <Grid className="h-4 w-4 text-blue-600 dark:text-blue-400" />,
  User: <User className="h-4 w-4 text-purple-600 dark:text-purple-400" />,
  Image: <ImageIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
  MessageSquareQuote: <MessageSquareQuote className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
  PhoneCall: <PhoneCall className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
  HelpCircle: <HelpCircle className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />,
  Calendar: <Calendar className="h-4 w-4 text-rose-600 dark:text-rose-400" />,
  ShoppingBag: <ShoppingBag className="h-4 w-4 text-teal-600 dark:text-teal-400" />,
  HeartHandshake: <HeartHandshake className="h-4 w-4 text-pink-600 dark:text-pink-400" />,
  FileText: <FileText className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />,
  Megaphone: <Megaphone className="h-4 w-4 text-orange-600 dark:text-orange-400" />,
};

function getBlockTitle(block: Block, index: number): string {
  const matchingCatalog = BLOCK_CATALOG.find((c) => c.type === block.type);
  const typeLabel = matchingCatalog?.label || block.type;

  const heading = (block as { heading?: string }).heading;
  if (heading && heading.trim()) {
    return `${typeLabel}: ${heading.slice(0, 24)}${heading.length > 24 ? "..." : ""}`;
  }
  return `${index + 1}. ${typeLabel}`;
}

export function BlockPalette({
  state,
  onAddBlock,
  onSelectBlock,
  onMoveBlock,
  onDuplicateBlock,
  onRemoveBlock,
  onSetTab,
}: BlockPaletteProps) {
  const currentTab = state.sidebarTab;

  return (
    <aside className="flex h-full w-80 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shrink-0 select-none">
      {/* Tab Navigation */}
      <div className="flex border-b border-zinc-200 px-3 pt-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => onSetTab("add")}
          className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 pb-2.5 text-xs font-semibold transition-colors ${
            currentTab === "add"
              ? "border-brand-700 text-brand-700 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Add Blocks</span>
        </button>
        <button
          type="button"
          onClick={() => onSetTab("structure")}
          className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 pb-2.5 text-xs font-semibold transition-colors ${
            currentTab === "structure"
              ? "border-brand-700 text-brand-700 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>Page Structure ({state.present.length})</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {currentTab === "add" ? (
          <div className="space-y-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Core Sections
              </span>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {BLOCK_CATALOG.filter(
                  (c) => c.category === "hero" || c.category === "content"
                ).map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => onAddBlock(item.createDefault())}
                    className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-2.5 text-left transition-all hover:border-brand-500 hover:bg-white hover:shadow-xs dark:border-zinc-800 dark:bg-zinc-800/50 dark:hover:border-brand-500 dark:hover:bg-zinc-800"
                  >
                    <div className="rounded-lg bg-white p-2 shadow-xs border border-zinc-200/60 dark:bg-zinc-700 dark:border-zinc-600 shrink-0">
                      {ICON_MAP[item.iconName] || <LayoutTemplate className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.label}
                        </span>
                        <Plus className="h-3.5 w-3.5 text-zinc-400 hover:text-brand-600" />
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500 line-clamp-2 dark:text-zinc-400">
                        {item.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Dynamic Embeds & Feeds
              </span>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {BLOCK_CATALOG.filter((c) => c.category === "embeds").map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => onAddBlock(item.createDefault())}
                    className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-2.5 text-left transition-all hover:border-brand-500 hover:bg-white hover:shadow-xs dark:border-zinc-800 dark:bg-zinc-800/50 dark:hover:border-brand-500 dark:hover:bg-zinc-800"
                  >
                    <div className="rounded-lg bg-white p-2 shadow-xs border border-zinc-200/60 dark:bg-zinc-700 dark:border-zinc-600 shrink-0">
                      {ICON_MAP[item.iconName] || <Calendar className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.label}
                        </span>
                        <Plus className="h-3.5 w-3.5 text-zinc-400 hover:text-brand-600" />
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500 line-clamp-2 dark:text-zinc-400">
                        {item.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Media & Social Proof
              </span>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {BLOCK_CATALOG.filter(
                  (c) => c.category === "media" || c.category === "social" || c.category === "legacy"
                ).map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => onAddBlock(item.createDefault())}
                    className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-2.5 text-left transition-all hover:border-brand-500 hover:bg-white hover:shadow-xs dark:border-zinc-800 dark:bg-zinc-800/50 dark:hover:border-brand-500 dark:hover:bg-zinc-800"
                  >
                    <div className="rounded-lg bg-white p-2 shadow-xs border border-zinc-200/60 dark:bg-zinc-700 dark:border-zinc-600 shrink-0">
                      {ICON_MAP[item.iconName] || <ImageIcon className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {item.label}
                        </span>
                        <Plus className="h-3.5 w-3.5 text-zinc-400 hover:text-brand-600" />
                      </div>
                      <p className="mt-0.5 text-[11px] text-zinc-500 line-clamp-2 dark:text-zinc-400">
                        {item.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Page Structure Tab */
          <div className="space-y-2">
            {state.present.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
                <Layers className="mx-auto h-8 w-8 text-zinc-400" />
                <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  No blocks added yet
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  Switch to the "Add Blocks" tab to place your first section.
                </p>
                <button
                  type="button"
                  onClick={() => onSetTab("add")}
                  className="mt-3 inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 dark:bg-brand-950/40 dark:text-brand-300"
                >
                  <Plus className="h-3 w-3" />
                  <span>Browse Block Catalog</span>
                </button>
              </div>
            ) : (
              state.present.map((block, idx) => {
                const isSelected = state.selectedBlockIndex === idx;
                const hasValidationError = state.validation?.invalidBlockIndex === idx;
                const matchingCatalog = BLOCK_CATALOG.find((c) => c.type === block.type);

                return (
                  <div
                    key={`${block.type}-${idx}`}
                    className={`group relative flex items-center justify-between rounded-xl border p-2.5 transition-all ${
                      hasValidationError
                        ? "border-rose-500 bg-rose-50/40 dark:bg-rose-950/20"
                        : isSelected
                          ? "border-brand-600 bg-brand-50/40 shadow-xs dark:border-brand-500 dark:bg-brand-950/20"
                          : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-800/40"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectBlock(idx)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                    >
                      <div className="shrink-0">
                        {matchingCatalog?.iconName ? (
                          ICON_MAP[matchingCatalog.iconName]
                        ) : (
                          <LayoutTemplate className="h-4 w-4 text-zinc-500" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate block">
                          {getBlockTitle(block, idx)}
                        </span>
                        <span className="text-[10px] text-zinc-400 capitalize">
                          {block.type.replace("_", " ")}
                        </span>
                      </div>
                    </button>

                    {hasValidationError && (
                      <span title="Validation issue on this block">
                        <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mr-1" />
                      </span>
                    )}

                    {/* Action Controls */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-80 group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => onMoveBlock(idx, idx - 1)}
                        disabled={idx === 0}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-20 dark:hover:bg-zinc-700"
                        title="Move Up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveBlock(idx, idx + 1)}
                        disabled={idx === state.present.length - 1}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 disabled:opacity-20 dark:hover:bg-zinc-700"
                        title="Move Down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateBlock(idx)}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-700"
                        title="Duplicate"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveBlock(idx)}
                        className="rounded p-1 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40"
                        title="Delete Block"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
