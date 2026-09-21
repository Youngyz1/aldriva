/**
 * components/dashboard/website/builder/types.ts
 *
 * Types for the Aldriva Visual Website Builder Canvas & State Management (Phase 4 Task 4.3).
 */

import { Block } from "@/lib/website-blocks";
import { EntityRole } from "@/lib/entity-auth";
import { BuilderEmbedOptions } from "@/lib/actions/website-builder";

export type BuilderDevice = "desktop" | "tablet" | "mobile";

export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type PublishStatus = "idle" | "publishing" | "published" | "error";

export interface ValidationErrorIssue {
  path?: string;
  message: string;
}

export interface ValidationState {
  invalidBlockIndex?: number;
  issues?: ValidationErrorIssue[];
  errorMessage?: string;
}

export interface BuilderState {
  // Undo / Redo History Stacks (In-Memory Canvas State)
  past: Block[][];
  present: Block[];
  future: Block[][];

  // Selection & UI State
  selectedBlockIndex: number | null;
  device: BuilderDevice;
  sidebarTab: "add" | "structure";

  // Persistence & Draft Tracking
  isDirty: boolean;
  saveStatus: SaveStatus;
  publishStatus: PublishStatus;
  version: number;
  lastSavedAt: string | null;
  hasDraft: boolean;

  // Validation & Error Surfacing
  validation: ValidationState | null;
  errorMessage: string | null;
  successMessage: string | null;

  // Metadata & Context
  pageId: string;
  websiteId: string;
  pageSlug: string;
  pageTitle: string;
  pageStatus: string;
  tenantId: string;
  websiteSlug: string;
  canPublish: boolean;
  userRole: EntityRole | "super_admin";
  availableEmbedOptions: BuilderEmbedOptions;

  // Modals
  isDiscardModalOpen: boolean;
}

export type BuilderAction =
  | { type: "SET_BLOCKS"; blocks: Block[]; markDirty?: boolean }
  | { type: "SELECT_BLOCK"; index: number | null }
  | { type: "UPDATE_BLOCK"; index: number; block: Block }
  | { type: "ADD_BLOCK"; block: Block; insertAtIndex?: number }
  | { type: "REMOVE_BLOCK"; index: number }
  | { type: "MOVE_BLOCK"; fromIndex: number; toIndex: number }
  | { type: "DUPLICATE_BLOCK"; index: number }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET_DEVICE"; device: BuilderDevice }
  | { type: "SET_SIDEBAR_TAB"; tab: "add" | "structure" }
  | { type: "SET_SAVE_STATUS"; status: SaveStatus; version?: number; savedAt?: string; error?: string }
  | { type: "SET_PUBLISH_STATUS"; status: PublishStatus; error?: string; validation?: ValidationState }
  | { type: "CLEAR_VALIDATION" }
  | { type: "CLEAR_MESSAGES" }
  | { type: "SET_DISCARD_MODAL_OPEN"; open: boolean }
  | { type: "DRAFT_DISCARDED"; liveBlocks: Block[] }
  | { type: "DRAFT_PUBLISHED"; publishedAt: string };
