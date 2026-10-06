"use client";

/**
 * Builder Gallery section — thin wrapper over InvitationGalleryManager
 * (up/down reorder, delete, alt text, 12 max, per-item retry).
 */

import type { BuilderDraft } from "../InvitationPageBuilder";
import { InvitationGalleryManager } from "@/components/invitation/InvitationGalleryManager";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

export function GallerySection({ eventId, draft, updateDraft, disabled }: Props) {
  return (
    <InvitationGalleryManager
      eventId={eventId}
      items={draft.gallery || []}
      onChange={(gallery) => updateDraft({ gallery })}
      disabled={disabled}
    />
  );
}
