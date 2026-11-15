"use client";

/**
 * components/invitation/InvitationBuilderPersistenceContext.tsx
 *
 * Phase 5: lets every builder section branch between the server-backed
 * path (default, unchanged) and the anonymous local-draft path, WITHOUT
 * changing any section's prop signature. The default context value is
 * `{ mode: "server" }` with every handler undefined — any section rendered
 * without an ancestor Provider (every existing test, every authenticated
 * mount today) behaves exactly as before, since `mode !== "local"` always
 * takes the original code path.
 *
 * Lives here (not under app/dashboard/.../builder/) because consumers
 * include components/invitation/UnifiedTemplatePicker.tsx, which is a
 * shared component outside that route's dynamic segment.
 *
 * InvitationPageBuilder is the only Provider. Sections only ever consume.
 */

import { createContext, useContext } from "react";

export interface InvitationBuilderPersistence {
  mode: "server" | "local";
  /** Local mode only: handle a cropped File for a single-image field (hero/story/evergreen photo slots). onError fires (instead of onUploaded) when the file fails type/size validation. */
  handleLocalImageCropped?: (fieldKey: string, file: File, previewUrl: string, onUploaded: (url: string) => void, onError?: (message: string) => void) => void;
  /** Local mode only: handle a cropped File for one gallery image. onError fires (instead of onUploaded) when the file fails type/size validation. */
  handleLocalGalleryImageCropped?: (file: File, previewUrl: string, onUploaded: (url: string) => void, onError?: (message: string) => void) => void;
  /** Local mode only: apply a template switch without the setUnifiedInvitationTemplate RPC. */
  handleLocalTemplateSwitch?: (pageId: string) => void;
  /** Local mode only: apply title/date/venue/address/city fields without the updateInvitationEventFields action. */
  handleLocalBasicsUpdate?: (patch: Record<string, unknown>) => void;
  /** Local mode only: flush the local draft, then navigate to /login carrying draftId + templateId. Phase 6 builds the return half. */
  handleLocalSignInToPublish?: () => void;
}

const DEFAULT_PERSISTENCE: InvitationBuilderPersistence = { mode: "server" };

const InvitationBuilderPersistenceContext = createContext<InvitationBuilderPersistence>(DEFAULT_PERSISTENCE);

export function useInvitationBuilderPersistence(): InvitationBuilderPersistence {
  return useContext(InvitationBuilderPersistenceContext);
}

export const InvitationBuilderPersistenceProvider = InvitationBuilderPersistenceContext.Provider;
