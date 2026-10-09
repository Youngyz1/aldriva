"use client";

import React from "react";
import type { InvitationPageDraftData } from "@/lib/types/invitation-page-snapshot";
import type { InvitationTemplate } from "@/lib/invitation-types";
import { InvitationPageBuilder } from "./builder/InvitationPageBuilder";

export interface InvitationPageDashboardClientProps {
  eventId: string;
  initialData: InvitationPageDraftData;
  /** Current card slug (UUID resolved server-side). Null when none selected. */
  cardSlug?: string | null;
  /** Card catalog for the unified picker (art + layout configs). */
  cardTemplates?: InvitationTemplate[];
}

export default function InvitationPageDashboardClient({
  eventId,
  initialData,
  cardSlug = null,
  cardTemplates = [],
}: InvitationPageDashboardClientProps) {
  // A page row already exists (id !== "") → skip template choice.
  // Fresh drafts start at "type" (template choice, then the form).
  const initialSection = initialData.draft.id ? "basics" : "type";
  return (
    <InvitationPageBuilder
      eventId={eventId}
      initialData={initialData}
      initialSection={initialSection}
      cardSlug={cardSlug}
      cardTemplates={cardTemplates}
    />
  );
}
