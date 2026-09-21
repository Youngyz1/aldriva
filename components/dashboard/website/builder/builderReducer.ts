/**
 * components/dashboard/website/builder/builderReducer.ts
 *
 * Pure React Reducer for Canvas State, In-Memory Undo/Redo Stacks, and Selection.
 */

import { Block } from "@/lib/website-blocks";
import { BuilderState, BuilderAction } from "./types";

const MAX_HISTORY_LENGTH = 30;

export function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case "SET_BLOCKS": {
      const newPresent = action.blocks;
      return {
        ...state,
        past: action.markDirty ? [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present] : state.past,
        present: newPresent,
        future: action.markDirty ? [] : state.future,
        isDirty: action.markDirty ? true : state.isDirty,
        saveStatus: action.markDirty ? "idle" : state.saveStatus,
        validation: null,
      };
    }

    case "SELECT_BLOCK": {
      return {
        ...state,
        selectedBlockIndex: action.index,
      };
    }

    case "UPDATE_BLOCK": {
      if (action.index < 0 || action.index >= state.present.length) return state;
      const updatedPresent = [...state.present];
      updatedPresent[action.index] = action.block;

      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        isDirty: true,
        saveStatus: "idle",
        validation: null,
      };
    }

    case "ADD_BLOCK": {
      const insertAt =
        typeof action.insertAtIndex === "number" &&
        action.insertAtIndex >= 0 &&
        action.insertAtIndex <= state.present.length
          ? action.insertAtIndex
          : state.present.length;

      const updatedPresent = [
        ...state.present.slice(0, insertAt),
        action.block,
        ...state.present.slice(insertAt),
      ];

      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        selectedBlockIndex: insertAt,
        isDirty: true,
        saveStatus: "idle",
        validation: null,
      };
    }

    case "REMOVE_BLOCK": {
      if (action.index < 0 || action.index >= state.present.length) return state;
      const updatedPresent = state.present.filter((_, idx) => idx !== action.index);

      let nextSelectedIndex: number | null = null;
      if (updatedPresent.length > 0) {
        if (state.selectedBlockIndex === action.index) {
          nextSelectedIndex = Math.min(action.index, updatedPresent.length - 1);
        } else if (state.selectedBlockIndex !== null && state.selectedBlockIndex > action.index) {
          nextSelectedIndex = state.selectedBlockIndex - 1;
        } else {
          nextSelectedIndex = state.selectedBlockIndex;
        }
      }

      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        selectedBlockIndex: nextSelectedIndex,
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

      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
        selectedBlockIndex: toIndex,
        isDirty: true,
        saveStatus: "idle",
        validation: null,
      };
    }

    case "DUPLICATE_BLOCK": {
      if (action.index < 0 || action.index >= state.present.length) return state;
      const original = state.present[action.index];
      // Deep clone block
      const duplicated: Block = JSON.parse(JSON.stringify(original));
      const targetIndex = action.index + 1;

      const updatedPresent = [
        ...state.present.slice(0, targetIndex),
        duplicated,
        ...state.present.slice(targetIndex),
      ];

      return {
        ...state,
        past: [...state.past.slice(-MAX_HISTORY_LENGTH + 1), state.present],
        present: updatedPresent,
        future: [],
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

      return {
        ...state,
        past: newPast,
        present: previous,
        future: [state.present, ...state.future],
        isDirty: true,
        saveStatus: "idle",
        validation: null,
        selectedBlockIndex:
          state.selectedBlockIndex !== null && state.selectedBlockIndex < previous.length
            ? state.selectedBlockIndex
            : previous.length > 0
              ? 0
              : null,
      };
    }

    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const newFuture = state.future.slice(1);

      return {
        ...state,
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
        isDirty: true,
        saveStatus: "idle",
        validation: null,
        selectedBlockIndex:
          state.selectedBlockIndex !== null && state.selectedBlockIndex < next.length
            ? state.selectedBlockIndex
            : next.length > 0
              ? 0
              : null,
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
      return {
        ...state,
        publishStatus: action.status,
        errorMessage: action.error || null,
        validation: action.validation || null,
        selectedBlockIndex:
          action.validation?.invalidBlockIndex !== undefined
            ? action.validation.invalidBlockIndex
            : state.selectedBlockIndex,
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
      return {
        ...state,
        past: [],
        present: action.liveBlocks,
        future: [],
        isDirty: false,
        hasDraft: false,
        version: 0,
        selectedBlockIndex: action.liveBlocks.length > 0 ? 0 : null,
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
