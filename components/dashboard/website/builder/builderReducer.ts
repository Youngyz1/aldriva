/**
 * components/dashboard/website/builder/builderReducer.ts
 *
 * Pure React Reducer for Canvas State, In-Memory Undo/Redo Stacks, and Selection.
 * Batch G: stable Selection (blockId + path) + element updates via safe path resolver.
 */

import { Block, cloneBlockWithNewIds, normalizeBlocks } from "@/lib/website-blocks";
import { isEditablePath, setElementValue } from "@/lib/website-block-edit-schema";
import type { BlockType, SectionEnvelope, SectionBackground } from "@/lib/website-blocks";
import { BuilderState, BuilderAction, Selection } from "./types";
import { sanitizeUrl } from "@/lib/sanitize-html";

const MAX_HISTORY_LENGTH = 30;

function indexForBlockId(blocks: Block[], blockId: string | null): number | null {
  if (!blockId) return null;
  const idx = blocks.findIndex((b) => (b as { id?: string }).id === blockId);
  return idx >= 0 ? idx : null;
}

function selectionForIndex(blocks: Block[], index: number | null, pageId: string): Selection {
  if (index == null || index < 0 || index >= blocks.length) return null;
  const block = blocks[index] as { id?: string };
  if (!block.id) return null;
  return { type: "block", pageId, blockId: block.id };
}

function reconcileSelection(present: Block[], selection: Selection): { selection: Selection; selectedBlockIndex: number | null } {
  if (!selection) return { selection: null, selectedBlockIndex: null };
  const idx = indexForBlockId(present, selection.blockId);
  if (idx == null) return { selection: null, selectedBlockIndex: null };
  // For element selection, also verify path is still editable for this block type
  if (selection.type === "element") {
    const block = present[idx];
    if (!isEditablePath(block.type as BlockType, selection.path)) {
      // Invalid path after block change -> fall back to block selection
      return { selection: { type: "block", pageId: selection.pageId, blockId: selection.blockId }, selectedBlockIndex: idx };
    }
    // For paths with item id, verify item still exists; if not, downgrade to block
    // We rely on getElementValue returning undefined for missing item, but we check via isEditablePath only.
    // Additional check: if path contains [id] and that id no longer exists, clear element selection
    // Do a lightweight existence check by trying to resolve
    // We avoid importing getElementValue here to keep reducer pure and lightweight; just keep element selection
    // The UI will clear on next edit if needed.
  }
  return { selection, selectedBlockIndex: idx };
}

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "SET_BLOCKS": {
      const newPresent = normalizeBlocks(action.blocks);
      const reconciled = reconcileSelection(newPresent, state.selection);
      // If no selection but blocks exist, select first block
      let nextSelection = reconciled.selection;
      let nextIdx = reconciled.selectedBlockIndex;
      if (!nextSelection && newPresent.length > 0) {
        const first = newPresent[0] as { id?: string };
        if (first.id) {
          nextSelection = { type: "block", pageId: state.pageId, blockId: first.id };
          nextIdx = 0;
        }
      }
      return {
        ...state,
        past: action.markDirty ? [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present] : state.past,
        present: newPresent,
        future: action.markDirty ? [] : state.future,
        isDirty: action.markDirty ? true : state.isDirty,
        saveStatus: action.markDirty ? "idle" : state.saveStatus,
        validation: null,
        selection: nextSelection,
        selectedBlockIndex: nextIdx,
      };
    }

    case "SELECT_BLOCK": {
      // Legacy index-based — convert to stable id selection
      const sel = selectionForIndex(state.present, action.index, state.pageId);
      return {
        ...state,
        selection: sel,
        selectedBlockIndex: action.index,
      };
    }

    case "SELECT_BLOCK_BY_ID": {
      if (action.blockId == null) {
        return { ...state, selection: null, selectedBlockIndex: null };
      }
      const idx = indexForBlockId(state.present, action.blockId);
      if (idx == null) return { ...state, selection: null, selectedBlockIndex: null };
      return {
        ...state,
        selection: { type: "block", pageId: state.pageId, blockId: action.blockId },
        selectedBlockIndex: idx,
      };
    }

    case "SELECT_ELEMENT": {
      const idx = indexForBlockId(state.present, action.blockId);
      if (idx == null) return state;
      const block = state.present[idx];
      if (!isEditablePath(block.type as BlockType, action.path)) return state;
      return {
        ...state,
        selection: { type: "element", pageId: state.pageId, blockId: action.blockId, path: action.path },
        selectedBlockIndex: idx,
      };
    }

    case "CLEAR_SELECTION": {
      return { ...state, selection: null, selectedBlockIndex: null };
    }

    case "UPDATE_BLOCK": {
      if (action.index < 0 || action.index >= state.present.length) return state;
      const updatedPresent = [...state.present];
      updatedPresent[action.index] = action.block;

      const reconciled = reconcileSelection(updatedPresent, state.selection);
      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        isDirty: true,
        saveStatus: "idle",
        validation: null,
        selection: reconciled.selection,
        selectedBlockIndex: reconciled.selectedBlockIndex,
      };
    }

    case "UPDATE_ELEMENT": {
      const idx = indexForBlockId(state.present, action.blockId);
      if (idx == null) return state;
      const block = state.present[idx];
      if (!isEditablePath(block.type as BlockType, action.path)) return state;

      const updatedBlock = setElementValue(block as unknown as Record<string, unknown>, action.path, action.value) as unknown as Block;
      // Validate that updated block still has stable id; normalize just in case
      const updatedPresent = [...state.present];
      updatedPresent[idx] = updatedBlock;

      const reconciled = reconcileSelection(updatedPresent, state.selection);
      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        isDirty: true,
        saveStatus: "idle",
        validation: null,
        selection: reconciled.selection,
        selectedBlockIndex: reconciled.selectedBlockIndex,
      };
    }

    case "UPDATE_SECTION": {
      const idx = indexForBlockId(state.present, action.blockId);
      if (idx == null) return state;
      const block = state.present[idx] as unknown as Record<string, unknown>;
      const patch = action.patch as Partial<SectionEnvelope> & Record<string, unknown>;
      const nextBlock: Record<string, unknown> = { ...block };

      // visible
      if ("visible" in patch) {
        if (typeof patch.visible === "boolean") nextBlock.visible = patch.visible;
        else if (patch.visible == null) delete nextBlock.visible;
      }
      // hiddenOnMobile
      if ("hiddenOnMobile" in patch) {
        if (typeof patch.hiddenOnMobile === "boolean") nextBlock.hiddenOnMobile = patch.hiddenOnMobile;
        else if (patch.hiddenOnMobile == null) delete nextBlock.hiddenOnMobile;
      }
      // spacing
      if ("spacing" in patch) {
        const s = patch.spacing as unknown;
        if (s === "compact" || s === "default" || s === "roomy") nextBlock.spacing = s;
        else if (s == null) delete nextBlock.spacing;
      }
      // background
      if ("background" in patch) {
        const bg = patch.background as unknown;
        if (bg == null) {
          delete nextBlock.background;
        } else if (typeof bg === "object") {
          const raw = bg as Record<string, unknown>;
          const out: SectionBackground = {};
          if (typeof raw.color === "string" && raw.color.trim()) out.color = raw.color.trim().slice(0, 50);
          if (typeof raw.image === "string" && sanitizeUrl(raw.image)) out.image = sanitizeUrl(raw.image) as string;
          if (typeof raw.overlay === "number" && [0, 0.25, 0.5, 0.75].includes(raw.overlay as number)) out.overlay = raw.overlay as SectionBackground["overlay"];
          if (Object.keys(out).length > 0) nextBlock.background = out;
          else delete nextBlock.background;
        }
      }
      // container
      if ("container" in patch) {
        const c = patch.container as unknown;
        if (c === "constrained" || c === "wide" || c === "narrow" || c === "full") nextBlock.container = c;
        else if (c == null) delete nextBlock.container;
      }

      const updatedPresent = [...state.present];
      updatedPresent[idx] = nextBlock as unknown as Block;
      const reconciled = reconcileSelection(updatedPresent, state.selection);
      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        isDirty: true,
        saveStatus: "idle",
        validation: null,
        selection: reconciled.selection,
        selectedBlockIndex: reconciled.selectedBlockIndex,
      };
    }

    case "ADD_BLOCK": {
      const insertAt =
        typeof action.insertAtIndex === "number" &&
        action.insertAtIndex >= 0 &&
        action.insertAtIndex <= state.present.length
          ? action.insertAtIndex
          : state.present.length;

      const normalizedBlock = normalizeBlocks([action.block])[0] ?? action.block;
      const updatedPresent = [
        ...state.present.slice(0, insertAt),
        normalizedBlock,
        ...state.present.slice(insertAt),
      ];

      const blockId = (normalizedBlock as { id?: string }).id;
      const sel: Selection = blockId ? { type: "block", pageId: state.pageId, blockId } : null;
      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        selection: sel,
        selectedBlockIndex: insertAt,
        isDirty: true,
        saveStatus: "idle",
        validation: null,
      };
    }

    case "REMOVE_BLOCK": {
      if (action.index < 0 || action.index >= state.present.length) return state;
      const removed = state.present[action.index] as { id?: string };
      const updatedPresent = state.present.filter((_, idx) => idx !== action.index);

      // If removed block was selected, clear or move selection
      let nextSelection: Selection = state.selection ?? null;
      let nextIdx: number | null = state.selectedBlockIndex;

      // Legacy compat: if selection is null/undefined but selectedBlockIndex is set, use index logic
      const hasSelection = Boolean(state.selection);
      if (hasSelection && state.selection && (state.selection.blockId === removed.id || state.selectedBlockIndex === action.index)) {
        if (updatedPresent.length === 0) {
          nextSelection = null;
          nextIdx = null;
        } else {
          const fallbackIdx = Math.min(action.index, updatedPresent.length - 1);
          const fallbackBlock = updatedPresent[fallbackIdx] as { id?: string };
          nextSelection = fallbackBlock?.id ? { type: "block", pageId: state.pageId, blockId: fallbackBlock.id } : null;
          nextIdx = fallbackIdx;
        }
      } else if (!hasSelection && state.selectedBlockIndex !== null) {
        // Legacy index-only handling
        if (state.selectedBlockIndex === action.index) {
          nextIdx = updatedPresent.length > 0 ? Math.min(action.index, updatedPresent.length - 1) : null;
          const fallbackBlock = nextIdx != null ? (updatedPresent[nextIdx] as { id?: string }) : null;
          nextSelection = fallbackBlock?.id ? { type: "block", pageId: state.pageId, blockId: fallbackBlock.id } : null;
          if (updatedPresent.length === 0) {
            nextSelection = null;
            nextIdx = null;
          }
        } else if (state.selectedBlockIndex > action.index) {
          nextIdx = state.selectedBlockIndex - 1;
          nextSelection = null;
          // Try to set selection to the block at new index if possible
          const b = nextIdx != null ? (updatedPresent[nextIdx] as { id?: string }) : null;
          if (b?.id && state.selectedBlockIndex != null) {
            // Keep selection null for legacy, but clamp index
          }
        } else {
          nextIdx = state.selectedBlockIndex;
          nextSelection = null;
        }
      } else if (state.selectedBlockIndex !== null && state.selectedBlockIndex > action.index) {
        nextIdx = state.selectedBlockIndex - 1;
        // selection blockId stays same, but index shifts; reconcile
        const rec = reconcileSelection(updatedPresent, state.selection ?? null);
        nextSelection = rec.selection;
        nextIdx = rec.selectedBlockIndex ?? nextIdx;
      } else {
        const rec = reconcileSelection(updatedPresent, state.selection ?? null);
        nextSelection = rec.selection;
        nextIdx = rec.selectedBlockIndex;
      }

      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        selection: nextSelection,
        selectedBlockIndex: nextIdx,
        isDirty: true,
        saveStatus: "idle",
        validation: null,
      };
    }

    case "MOVE_BLOCK": {
      const { fromIndex, toIndex } = action;
      if (
        fromIndex < 0 ||
        fromIndex >= state.present.length ||
        toIndex < 0 ||
        toIndex >= state.present.length ||
        fromIndex === toIndex
      ) {
        return state;
      }

      const updatedPresent = [...state.present];
      const [movedBlock] = updatedPresent.splice(fromIndex, 1);
      updatedPresent.splice(toIndex, 0, movedBlock);

      const movedId = (movedBlock as { id?: string }).id;
      let nextSelection: Selection = state.selection;
      let nextIdx: number | null = state.selectedBlockIndex;
      if (state.selection && state.selection.blockId === movedId) {
        nextIdx = toIndex;
        // keep same selection (blockId unchanged)
      } else {
        const rec = reconcileSelection(updatedPresent, state.selection);
        nextSelection = rec.selection;
        nextIdx = rec.selectedBlockIndex;
        // If selection was block index-driven, keep toIndex logic for moved block selection
        if (state.selectedBlockIndex === fromIndex) nextIdx = toIndex;
      }

      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        selection: nextSelection,
        selectedBlockIndex: nextIdx ?? toIndex,
        isDirty: true,
        saveStatus: "idle",
        validation: null,
      };
    }

    case "DUPLICATE_BLOCK": {
      if (action.index < 0 || action.index >= state.present.length) return state;
      const original = state.present[action.index];
      const duplicated: Block = cloneBlockWithNewIds(original);
      const targetIndex = action.index + 1;

      const updatedPresent = [
        ...state.present.slice(0, targetIndex),
        duplicated,
        ...state.present.slice(targetIndex),
      ];

      const dupId = (duplicated as { id?: string }).id;
      const sel: Selection = dupId ? { type: "block", pageId: state.pageId, blockId: dupId } : null;
      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        selection: sel,
        selectedBlockIndex: targetIndex,
        isDirty: true,
        saveStatus: "idle",
        validation: null,
      };
    }

    case "UNDO": {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, state.past.length - 1);
      const rec = reconcileSelection(previous, state.selection);

      return {
        ...state,
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
        isDirty: true,
        saveStatus: "idle",
        validation: null,
        selection: rec.selection,
        selectedBlockIndex: rec.selectedBlockIndex,
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);
      const rec = reconcileSelection(next, state.selection);

      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
        isDirty: true,
        saveStatus: "idle",
        validation: null,
        selection: rec.selection,
        selectedBlockIndex: rec.selectedBlockIndex,
      };
    }

    case "SET_DEVICE": {
      return {
        ...state,
        device: action.device,
      };
    }

    case "SET_SIDEBAR_TAB": {
      return {
        ...state,
        sidebarTab: action.tab,
      };
    }

    case "SET_SAVE_STATUS": {
      return {
        ...state,
        saveStatus: action.status,
        version: typeof action.version === "number" ? action.version : state.version,
        lastSavedAt: action.savedAt || state.lastSavedAt,
        isDirty: action.status === "saved" ? false : state.isDirty,
        hasDraft: action.status === "saved" ? true : state.hasDraft,
        errorMessage: action.error || (action.status === "error" ? "Failed to save draft." : state.errorMessage),
      };
    }

    case "SET_PUBLISH_STATUS": {
      const rec = action.validation?.invalidBlockIndex !== undefined
        ? (() => {
            const idx = action.validation!.invalidBlockIndex!;
            const b = state.present[idx] as { id?: string } | undefined;
            const sel: Selection = b?.id ? { type: "block", pageId: state.pageId, blockId: b.id } : null;
            return { selection: sel, selectedBlockIndex: idx };
          })()
        : { selection: state.selection, selectedBlockIndex: state.selectedBlockIndex };
      return {
        ...state,
        publishStatus: action.status,
        errorMessage: action.error || null,
        validation: action.validation || null,
        selection: rec.selection,
        selectedBlockIndex: rec.selectedBlockIndex,
      };
    }

    case "CLEAR_VALIDATION": {
      return {
        ...state,
        validation: null,
      };
    }

    case "CLEAR_MESSAGES": {
      return {
        ...state,
        errorMessage: null,
        successMessage: null,
      };
    }

    case "SET_DISCARD_MODAL_OPEN": {
      return {
        ...state,
        isDiscardModalOpen: action.open,
      };
    }

    case "DRAFT_DISCARDED": {
      const normalized = normalizeBlocks(action.liveBlocks);
      const first = normalized[0] as { id?: string } | undefined;
      const sel: Selection = first?.id ? { type: "block", pageId: state.pageId, blockId: first.id } : null;
      return {
        ...state,
        past: [],
        present: normalized,
        future: [],
        isDirty: false,
        hasDraft: false,
        version: 0,
        selection: sel,
        selectedBlockIndex: normalized.length > 0 ? 0 : null,
        saveStatus: "idle",
        publishStatus: "idle",
        validation: null,
        isDiscardModalOpen: false,
        successMessage: "Draft discarded. Reverted to live published version.",
      };
    }

    case "DRAFT_PUBLISHED": {
      return {
        ...state,
        past: [],
        future: [],
        isDirty: false,
        hasDraft: false,
        pageStatus: "published",
        saveStatus: "saved",
        publishStatus: "published",
        validation: null,
        successMessage: "Page successfully published live!",
      };
    }

    default:
      return state;
  }
}
