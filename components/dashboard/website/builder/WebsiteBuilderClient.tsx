/**
 * components/dashboard/website/builder/WebsiteBuilderClient.tsx
 *
 * Master Client Orchestrator for the Aldriva Visual Website Builder (Phase 4 Task 4.3).
 *
 * Implements:
 *  1. 3-panel workspace: Left Palette/Outline, Center Responsive Canvas, Right Property Inspector.
 *  2. React Reducer with in-memory Undo/Redo history stacks.
 *  3. Debounced autosave (1200ms) with in-flight race resolution before publish.
 *  4. Strict role gating (publish restricted to manager/admin/owner; editor drafts allowed).
 *  5. Direct block/field error routing on publish validation failure.
 *  6. Safe discard draft workflow.
 */

"use client";

import React, { useReducer, useEffect, useRef, useCallback, useState } from "react";
import { Block } from "@/lib/website-blocks";
import {
  PageBuilderData,
  savePageDraft,
  publishPageDraft,
  discardPageDraft,
  BuilderEmbedOptions,
} from "@/lib/actions/website-builder";
import { BuilderState } from "./types";
import { builderReducer } from "./builderReducer";
import { BuilderToolbar } from "./BuilderToolbar";
import { BlockPalette } from "./BlockPalette";
import { BuilderCanvas } from "./BuilderCanvas";
import { BlockInspector } from "./inspectors/BlockInspector";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AlertCircle,
  CheckCircle2,
  X,
  SlidersHorizontal,
  Blocks,
  Layers,
  PanelRight,
  Eye,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface WebsiteBuilderClientProps {
  initialData: PageBuilderData;
  availableEmbedOptions: BuilderEmbedOptions;
}

const AUTOSAVE_DEBOUNCE_MS = 1200;

export default function WebsiteBuilderClient({
  initialData,
  availableEmbedOptions,
}: WebsiteBuilderClientProps) {
  const initialBlocks = initialData.blocks || [];

  const firstId = (initialBlocks[0] as { id?: string } | undefined)?.id ?? null;
  const initialState: BuilderState = {
    past: [],
    present: initialBlocks,
    future: [],

    selectedBlockIndex: initialBlocks.length > 0 ? 0 : null,
    selection: firstId ? { type: "block", pageId: initialData.pageId, blockId: firstId } : null,
    device: "desktop",
    sidebarTab: "add",

    isDirty: false,
    saveStatus: "idle",
    publishStatus: "idle",
    version: initialData.version || 0,
    lastSavedAt: initialData.lastSavedAt,
    hasDraft: initialData.hasDraft,

    validation: null,
    errorMessage: null,
    successMessage: null,

    pageId: initialData.pageId,
    websiteId: initialData.websiteId,
    pageSlug: initialData.pageSlug,
    pageTitle: initialData.pageTitle,
    pageStatus: initialData.pageStatus,
    tenantId: initialData.tenantId,
    websiteSlug: initialData.websiteSlug,
    canPublish: initialData.canPublish,
    userRole: initialData.userRole,
    availableEmbedOptions,

    isDiscardModalOpen: false,
  };

  const [state, dispatch] = useReducer(builderReducer, initialState);
  const [previewMode, setPreviewMode] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mobileSheet, setMobileSheet] = useState<"blocks" | "structure" | "properties" | "preview" | null>(null);

  const selectByIndex = useCallback((idx: number | null) => {
    if (idx == null) {
      dispatch({ type: "CLEAR_SELECTION" });
      return;
    }
    const b = stateRef.current.present[idx] as { id?: string } | undefined;
    if (b?.id) dispatch({ type: "SELECT_BLOCK_BY_ID", blockId: b.id });
    else dispatch({ type: "SELECT_BLOCK", index: idx });
  }, []);

  const selectElement = useCallback((blockId: string, path: string) => {
    dispatch({ type: "SELECT_ELEMENT", blockId, path });
  }, []);

  // References for race-safe autosave / publish orchestration
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightSavePromiseRef = useRef<Promise<boolean> | null>(null);

  // ── Core Draft Save Function ───────────────────────────────────────────────

  const performSaveDraft = useCallback(
    async (blocksToSave: Block[]): Promise<boolean> => {
      dispatch({ type: "SET_SAVE_STATUS", status: "saving" });

      try {
        const result = await savePageDraft(stateRef.current.pageId, blocksToSave);

        if (!result.success) {
          dispatch({
            type: "SET_SAVE_STATUS",
            status: "error",
            error: result.error || "Failed to save draft.",
          });
          return false;
        }

        dispatch({
          type: "SET_SAVE_STATUS",
          status: "saved",
          version: result.data?.version,
          savedAt: result.data?.savedAt,
        });
        return true;
      } catch (err: unknown) {
        console.error("[WebsiteBuilder] Save draft error:", err);
        dispatch({
          type: "SET_SAVE_STATUS",
          status: "error",
          error: "An unexpected error occurred while saving draft.",
        });
        return false;
      }
    },
    []
  );

  // ── Debounced Autosave Effect ───────────────────────────────────────────────

  useEffect(() => {
    if (!state.isDirty) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      const currentBlocks = stateRef.current.present;
      const savePromise = performSaveDraft(currentBlocks);
      inFlightSavePromiseRef.current = savePromise;
      savePromise.finally(() => {
        if (inFlightSavePromiseRef.current === savePromise) {
          inFlightSavePromiseRef.current = null;
        }
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [state.isDirty, state.present, performSaveDraft]);

  // ── Publish Orchestrator ───────────────────────────────────────────────────

  const handlePublish = useCallback(async () => {
    if (!state.canPublish) {
      dispatch({
        type: "SET_PUBLISH_STATUS",
        status: "error",
        error: "Your role (Editor) does not have publishing permissions. Please contact a manager.",
      });
      return;
    }

    dispatch({ type: "SET_PUBLISH_STATUS", status: "publishing" });

    // 1. Resolve pending or in-flight draft save before publishing
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (stateRef.current.isDirty) {
      const saveOk = await performSaveDraft(stateRef.current.present);
      if (!saveOk) {
        dispatch({
          type: "SET_PUBLISH_STATUS",
          status: "error",
          error: "Could not save pending draft before publishing.",
        });
        return;
      }
    } else if (inFlightSavePromiseRef.current) {
      const saveOk = await inFlightSavePromiseRef.current;
      if (!saveOk) {
        dispatch({
          type: "SET_PUBLISH_STATUS",
          status: "error",
          error: "Draft save failed before publishing.",
        });
        return;
      }
    }

    // 2. Execute atomic publish transaction
    try {
      const result = await publishPageDraft(stateRef.current.pageId);

      if (!result.success) {
        // Validation error with specific block index & issues
        if (typeof result.invalidBlockIndex === "number" && Array.isArray(result.issues)) {
          dispatch({
            type: "SET_PUBLISH_STATUS",
            status: "error",
            error: result.error || "Please fix validation issues before publishing.",
            validation: {
              invalidBlockIndex: result.invalidBlockIndex,
              issues: result.issues as Array<{ path?: string; message: string }>,
              errorMessage: result.error,
            },
          });
        } else {
          // Version mismatch (40001) or other server error
          dispatch({
            type: "SET_PUBLISH_STATUS",
            status: "error",
            error:
              result.error ||
              "Publish failed. Draft may have been modified concurrently. Please reload.",
          });
        }
        return;
      }

      // 3. Success
      dispatch({
        type: "DRAFT_PUBLISHED",
        publishedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      console.error("[WebsiteBuilder] Publish error:", err);
      dispatch({
        type: "SET_PUBLISH_STATUS",
        status: "error",
        error: "An unexpected error occurred during publishing.",
      });
    }
  }, [state.canPublish, performSaveDraft]);

  // ── Discard Draft Handler ──────────────────────────────────────────────────

  const handleConfirmDiscard = useCallback(async () => {
    try {
      const result = await discardPageDraft(stateRef.current.pageId);
      if (!result.success) {
        dispatch({
          type: "SET_SAVE_STATUS",
          status: "error",
          error: result.error || "Failed to discard draft.",
        });
        return;
      }

      dispatch({
        type: "DRAFT_DISCARDED",
        liveBlocks: initialData.liveBlocks || [],
      });
    } catch (err: unknown) {
      console.error("[WebsiteBuilder] Discard draft error:", err);
      dispatch({
        type: "SET_SAVE_STATUS",
        status: "error",
        error: "An unexpected error occurred while discarding draft.",
      });
    }
  }, [initialData.liveBlocks]);

  // ── Keyboard Shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+S) ──────────────────────

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when user is typing in form inputs/textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          e.preventDefault();
          dispatch({ type: "REDO" });
        } else {
          e.preventDefault();
          dispatch({ type: "UNDO" });
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        performSaveDraft(stateRef.current.present);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [performSaveDraft]);

  const selectedBlock =
    state.selection && state.selection.blockId
      ? (state.present.find((b) => (b as { id?: string }).id === state.selection!.blockId) ?? null)
      : state.selectedBlockIndex !== null && state.selectedBlockIndex < state.present.length
        ? state.present[state.selectedBlockIndex]
        : null;
  const selectedBlockIndexDerived =
    state.selection?.blockId != null
      ? state.present.findIndex((b) => (b as { id?: string }).id === state.selection!.blockId)
      : state.selectedBlockIndex;
  const selectedElementPath = state.selection?.type === "element" ? state.selection.path : null;

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-zinc-100 font-sans dark:bg-zinc-950">
      {/* 1. Top Workspace Toolbar */}
      <BuilderToolbar
        state={state}
        onDeviceChange={(dev) => dispatch({ type: "SET_DEVICE", device: dev })}
        onUndo={() => dispatch({ type: "UNDO" })}
        onRedo={() => dispatch({ type: "REDO" })}
        onSaveDraft={() => performSaveDraft(state.present)}
        onPublish={handlePublish}
        onOpenDiscardModal={() => dispatch({ type: "SET_DISCARD_MODAL_OPEN", open: true })}
        previewMode={previewMode}
        onTogglePreview={() => setPreviewMode((v) => !v)}
      />

      {/* 2. Global Feedback / Notification Banners */}
      {state.errorMessage && (
        <div className="bg-rose-600 px-4 py-2 text-xs font-medium text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{state.errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: "CLEAR_MESSAGES" })}
            className="rounded p-0.5 hover:bg-rose-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {state.successMessage && (
        <div className="bg-emerald-600 px-4 py-2 text-xs font-medium text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{state.successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => dispatch({ type: "CLEAR_MESSAGES" })}
            className="rounded p-0.5 hover:bg-emerald-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 3. Three-Panel Layout — desktop (lg) vs mobile */}
      <div className="flex flex-1 overflow-hidden">
        {/* Panel A: Left — collapsible on desktop, hidden on mobile */}
        {!previewMode && (
          <div className={`${leftCollapsed ? "hidden lg:hidden" : "hidden lg:flex"} shrink-0`}>
            <BlockPalette
              state={state}
              onAddBlock={(newBlock, insertAtIndex) => {
                dispatch({ type: "ADD_BLOCK", block: newBlock, insertAtIndex });
              }}
              onSelectBlock={(idx) => selectByIndex(idx)}
              onMoveBlock={(from, to) => dispatch({ type: "MOVE_BLOCK", fromIndex: from, toIndex: to })}
              onDuplicateBlock={(idx) => dispatch({ type: "DUPLICATE_BLOCK", index: idx })}
              onRemoveBlock={(idx) => dispatch({ type: "REMOVE_BLOCK", index: idx })}
              onSetTab={(tab) => dispatch({ type: "SET_SIDEBAR_TAB", tab })}
            />
          </div>
        )}
        {/* Collapse toggle for left */}
        {!previewMode && (
          <button
            type="button"
            onClick={() => setLeftCollapsed((v) => !v)}
            className="hidden lg:flex items-center justify-center w-6 shrink-0 border-r border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-400 hover:text-zinc-700"
            title={leftCollapsed ? "Show blocks" : "Hide blocks"}
          >
            {leftCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        )}

        {/* Panel B: Center Canvas — full-screen on mobile */}
        <BuilderCanvas
          state={state}
          onSelectBlock={(idx) => selectByIndex(idx)}
          onSelectElement={(blockId, path) => selectElement(blockId, path)}
          onClearSelection={() => dispatch({ type: "CLEAR_SELECTION" })}
          onMoveBlock={(from, to) => dispatch({ type: "MOVE_BLOCK", fromIndex: from, toIndex: to })}
          onDuplicateBlock={(idx) => dispatch({ type: "DUPLICATE_BLOCK", index: idx })}
          onRemoveBlock={(idx) => dispatch({ type: "REMOVE_BLOCK", index: idx })}
          onOpenAddModal={() => {
            dispatch({ type: "SET_SIDEBAR_TAB", tab: "add" });
            if (typeof window !== "undefined" && window.innerWidth < 1024) setMobileSheet("blocks");
          }}
        />

        {/* Right collapse toggle */}
        {!previewMode && !rightCollapsed && (
          <button
            type="button"
            onClick={() => setRightCollapsed(true)}
            className="hidden lg:flex items-center justify-center w-6 shrink-0 border-l border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-400 hover:text-zinc-700"
            title="Hide properties"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {rightCollapsed && !previewMode && (
          <button
            type="button"
            onClick={() => setRightCollapsed(false)}
            className="hidden lg:flex items-center justify-center w-6 shrink-0 border-l border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-400 hover:text-zinc-700"
            title="Show properties"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Panel C: Right Inspector — desktop only (H7 responsive: avoids 375 clipping) */}
        {!previewMode && !rightCollapsed && (
          <aside className="hidden lg:flex h-full w-[min(24rem,90vw)] lg:w-96 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 shrink-0 select-none overflow-hidden">
            {selectedBlock ? (
              <BlockInspector
                block={selectedBlock}
                onChange={(updatedBlock) => {
                  const idx = selectedBlockIndexDerived;
                  if (idx != null && idx >= 0) {
                    dispatch({
                      type: "UPDATE_BLOCK",
                      index: idx,
                      block: updatedBlock,
                    });
                  }
                }}
                tenantId={state.tenantId}
                availableEvents={state.availableEmbedOptions?.events}
                availableProducts={state.availableEmbedOptions?.products}
                availableFundraisers={state.availableEmbedOptions?.fundraisers}
                onClose={() => dispatch({ type: "CLEAR_SELECTION" })}
                selectedPath={selectedElementPath}
                onElementChange={(path, value) => {
                  const bid = (selectedBlock as { id?: string }).id;
                  if (!bid) return;
                  dispatch({ type: "UPDATE_ELEMENT", blockId: bid, path, value });
                }}
                onSectionChange={(patch) => {
                  const bid = (selectedBlock as { id?: string }).id;
                  if (!bid) return;
                  dispatch({ type: "UPDATE_SECTION", blockId: bid, patch: patch as never });
                }}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                <div className="rounded-2xl bg-zinc-100 p-4 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
                  <SlidersHorizontal className="h-8 w-8" />
                </div>
                <h3 className="mt-4 text-sm font-semibold text-zinc-800 dark:text-zinc-200">No Block Selected</h3>
                <p className="mt-1 text-xs text-zinc-500 max-w-[240px]">Click on any section in the canvas or page structure list to edit its content and styles.</p>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Mobile bottom bar — only below lg */}
      {!previewMode && (
        <nav className="flex lg:hidden shrink-0 items-center justify-around border-t border-zinc-200 bg-white px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <button type="button" onClick={() => setMobileSheet("blocks")} className="flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
            <Blocks className="h-5 w-5" /> Blocks
          </button>
          <button type="button" onClick={() => setMobileSheet("structure")} className="flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
            <Layers className="h-5 w-5" /> Structure
          </button>
          <button type="button" onClick={() => setMobileSheet("properties")} className="flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
            <PanelRight className="h-5 w-5" /> Properties
          </button>
          <button type="button" onClick={() => setMobileSheet("preview")} className="flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-50">
            <Eye className="h-5 w-5" /> Preview
          </button>
        </nav>
      )}

      {/* Mobile sheets */}
      <Sheet open={mobileSheet === "blocks"} onOpenChange={(o) => !o && setMobileSheet(null)}>
        <SheetContent side="bottom" className="p-0">
          <SheetHeader>
            <SheetTitle>Add Blocks</SheetTitle>
          </SheetHeader>
          <div className="max-h-[60vh] overflow-y-auto p-3">
            <BlockPalette
              state={{ ...state, sidebarTab: "add" } as never}
              onAddBlock={(b) => {
                dispatch({ type: "ADD_BLOCK", block: b });
                setMobileSheet(null);
              }}
              onSelectBlock={() => {}}
              onMoveBlock={() => {}}
              onDuplicateBlock={() => {}}
              onRemoveBlock={() => {}}
              onSetTab={() => {}}
            />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={mobileSheet === "structure"} onOpenChange={(o) => !o && setMobileSheet(null)}>
        <SheetContent side="bottom" className="p-0">
          <SheetHeader>
            <SheetTitle>Page Structure</SheetTitle>
          </SheetHeader>
          <div className="max-h-[60vh] overflow-y-auto p-3">
            <BlockPalette
              state={{ ...state, sidebarTab: "structure" } as never}
              onAddBlock={() => {}}
              onSelectBlock={(idx) => {
                selectByIndex(idx);
                setMobileSheet("properties");
              }}
              onMoveBlock={(from, to) => dispatch({ type: "MOVE_BLOCK", fromIndex: from, toIndex: to })}
              onDuplicateBlock={(idx) => dispatch({ type: "DUPLICATE_BLOCK", index: idx })}
              onRemoveBlock={(idx) => dispatch({ type: "REMOVE_BLOCK", index: idx })}
              onSetTab={() => {}}
            />
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={mobileSheet === "properties"} onOpenChange={(o) => !o && setMobileSheet(null)}>
        <SheetContent side="bottom" className="p-0">
          <SheetHeader>
            <SheetTitle>Properties</SheetTitle>
          </SheetHeader>
          <div className="max-h-[65vh] overflow-y-auto">
            {selectedBlock ? (
              <BlockInspector
                block={selectedBlock}
                onChange={(updatedBlock) => {
                  const idx = selectedBlockIndexDerived;
                  if (idx != null) dispatch({ type: "UPDATE_BLOCK", index: idx, block: updatedBlock });
                }}
                tenantId={state.tenantId}
                availableEvents={state.availableEmbedOptions?.events}
                availableProducts={state.availableEmbedOptions?.products}
                availableFundraisers={state.availableEmbedOptions?.fundraisers}
                onClose={() => setMobileSheet(null)}
                selectedPath={selectedElementPath}
                onElementChange={(path, value) => {
                  const bid = (selectedBlock as { id?: string }).id;
                  if (!bid) return;
                  dispatch({ type: "UPDATE_ELEMENT", blockId: bid, path, value });
                }}
                onSectionChange={(patch) => {
                  const bid = (selectedBlock as { id?: string }).id;
                  if (!bid) return;
                  dispatch({ type: "UPDATE_SECTION", blockId: bid, patch: patch as never });
                }}
              />
            ) : (
              <div className="p-8 text-center text-sm text-muted-foreground">Select a block to edit its properties.</div>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <Sheet open={mobileSheet === "preview"} onOpenChange={(o) => !o && setMobileSheet(null)}>
        <SheetContent side="bottom" className="p-0 bg-zinc-50">
          <SheetHeader>
            <SheetTitle>Preview</SheetTitle>
          </SheetHeader>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs">
              <p className="text-xs text-muted-foreground mb-2">Live preview of your page — reflects current draft blocks.</p>
              <div className="space-y-2">
                {state.present.map((b, i) => (
                  <div key={`${b.type}-${i}`} className="rounded-lg border border-zinc-100 p-3 text-xs">
                    <span className="font-semibold capitalize">{b.type.replace("_", " ")}</span>
                    {(b as { heading?: string }).heading && <span className="text-zinc-600"> — {(b as { heading?: string }).heading}</span>}
                  </div>
                ))}
                {state.present.length === 0 && <p className="text-sm text-muted-foreground">No blocks yet.</p>}
              </div>
              <a href={`/site/${state.websiteSlug}`} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                Open live site <Eye className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* 4. Discard Draft Confirmation — ConfirmDialog primitive */}
      <ConfirmDialog
        open={state.isDiscardModalOpen}
        onOpenChange={(o) => dispatch({ type: "SET_DISCARD_MODAL_OPEN", open: o })}
        title="Discard Working Draft?"
        description="The page will revert to the currently published live version. This cannot be undone."
        confirmLabel="Discard Changes"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleConfirmDiscard}
      />
    </div>
  );
}
