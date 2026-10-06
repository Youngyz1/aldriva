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
  return <InvitationPageBuilder eventId={eventId} initialData={initialData} />;
}
