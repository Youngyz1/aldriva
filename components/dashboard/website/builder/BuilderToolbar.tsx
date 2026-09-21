/**
 * components/dashboard/website/builder/BuilderToolbar.tsx
 *
 * Top workspace toolbar with device switcher, history controls, autosave indicator,
 * discard draft modal, and role-gated publish trigger.
 */

"use client";

import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Monitor,
  Tablet,
  Smartphone,
  Undo2,
  Redo2,
  Save,
  Send,
  Trash2,
  CheckCircle2,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import { BuilderState, BuilderDevice } from "./types";

interface BuilderToolbarProps {
  state: BuilderState;
  onDeviceChange: (device: BuilderDevice) => void;
  onUndo: () => void;
  onRedo: () => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  onOpenDiscardModal: () => void;
  previewMode?: boolean;
  onTogglePreview?: () => void;
}

export function BuilderToolbar({
  state,
  onDeviceChange,
  onUndo,
  onRedo,
  onSaveDraft,
  onPublish,
  onOpenDiscardModal,
  previewMode,
  onTogglePreview,
}: BuilderToolbarProps) {
  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;
  const isSaving = state.saveStatus === "saving";
  const isPublishing = state.publishStatus === "publishing";

  return (
    <header className="sticky top-0 z-40 flex h-14 w-full items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 shadow-xs">
      {/* Left: Back Link & Page Status */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/org/${state.tenantId}/website`}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          title="Return to Website Overview"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Overview</span>
        </Link>

        <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800" />

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-[160px] md:max-w-[220px]">
            {state.pageTitle || "Page Builder"}
          </span>

          {state.pageStatus === "published" && !state.hasDraft && !state.isDirty ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              Draft
            </span>
          )}
        </div>
      </div>

      {/* Center: Device Switcher & Undo/Redo */}
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Device Switcher — hidden on mobile (builder uses full-screen canvas there) */}
        <div className="hidden lg:flex items-center rounded-xl bg-zinc-100 p-0.5 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => onDeviceChange("desktop")}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all ${
              state.device === "desktop"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Desktop View (Full Width)"
          >
            <Monitor className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Desktop</span>
          </button>
          <button
            type="button"
            onClick={() => onDeviceChange("tablet")}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all ${
              state.device === "tablet"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Tablet View (768px)"
          >
            <Tablet className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Tablet</span>
          </button>
          <button
            type="button"
            onClick={() => onDeviceChange("mobile")}
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all ${
              state.device === "mobile"
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
            title="Mobile View (375px)"
          >
            <Smartphone className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Mobile</span>
          </button>
        </div>

        <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800 hidden sm:block" />

        {/* History: Undo / Redo */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 transition-colors"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Right: Autosave + Preview + Publish */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {onTogglePreview && (
          <button
            type="button"
            onClick={onTogglePreview}
            className={`hidden sm:inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${previewMode ? "border-primary bg-primary text-primary-foreground" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}
            title={previewMode ? "Exit preview" : "Preview"}
          >
            {previewMode ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            <span className="hidden lg:inline">{previewMode ? "Editing" : "Preview"}</span>
          </button>
        )}
        {/* Autosave / Status Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-600" />
              <span>Saving draft...</span>
            </>
          ) : state.isDirty ? (
            <>
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              <span>Unsaved changes</span>
            </>
          ) : state.hasDraft ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" />
              <span>Draft saved (v{state.version || 1})</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span>All changes live</span>
            </>
          )}
        </div>

        {/* Discard Draft Button */}
        {(state.hasDraft || state.isDirty) && (
          <button
            type="button"
            onClick={onOpenDiscardModal}
            className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors"
            title="Discard working draft"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">Discard</span>
          </button>
        )}

        {/* Save Draft Button (Manual) */}
        <button
          type="button"
          onClick={onSaveDraft}
          disabled={isSaving || !state.isDirty}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-750 transition-colors"
          title="Save draft (Ctrl+S)"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          <span>Save</span>
        </button>

        {/* Publish Button */}
        {state.canPublish ? (
          <button
            type="button"
            onClick={onPublish}
            disabled={isPublishing || isSaving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-800 active:bg-brand-900 disabled:opacity-50 transition-colors"
            title="Publish draft to live website"
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Publishing...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Publish</span>
              </>
            )}
          </button>
        ) : (
          <div
            className="inline-flex items-center gap-1 rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed border border-zinc-200 dark:border-zinc-700"
            title="Editor role cannot publish. Manager, admin, or owner approval required."
          >
            <Send className="h-3.5 w-3.5 opacity-50" />
            <span>Publish (Manager only)</span>
          </div>
        )}
      </div>
    </header>
  );
}
