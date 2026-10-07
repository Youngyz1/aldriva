"use client";

import React from "react";
import type { InvitationPageDraftData } from "@/lib/types/invitation-page-snapshot";
import { InvitationPageBuilder } from "./builder/InvitationPageBuilder";

export interface InvitationPageDashboardClientProps {
  eventId: string;
  initialData: InvitationPageDraftData;
}

export default function InvitationPageDashboardClient({
  eventId,
  initialData,
}: InvitationPageDashboardClientProps) {
  // A page row already exists (id !== "") → skip template choice.
  // Fresh drafts start at "type" (template choice, then the form).
  const initialSection = initialData.draft.id ? "basics" : "type";
  return <InvitationPageBuilder eventId={eventId} initialData={initialData} initialSection={initialSection} />;
}
