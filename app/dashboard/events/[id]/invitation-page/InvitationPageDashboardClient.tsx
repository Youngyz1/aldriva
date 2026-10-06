"use client";

import React, { useState } from "react";
import { Eye, CheckCircle2, AlertCircle } from "lucide-react";
import type { InvitationPageDraftData } from "@/lib/types/invitation-page-snapshot";
import { createOrRegeneratePreviewToken } from "@/lib/actions/invitation-page";
import { InvitationPageWizard } from "./wizard/InvitationPageWizard";

export interface InvitationPageDashboardClientProps {
  eventId: string;
  initialData: InvitationPageDraftData;
}

export default function InvitationPageDashboardClient({
  eventId,
  initialData,
}: InvitationPageDashboardClientProps) {
  const [data] = useState<InvitationPageDraftData>(initialData);
  const [previewLoading, setPreviewLoading] = useState(false);

  const isPublished = data.draft.page_status === "published";
  const hasUnpublished = data.hasUnpublishedChanges;

  const handleGeneratePreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await createOrRegeneratePreviewToken(eventId);
      if (res.ok && res.token) {
        const url = `/invitation/preview/${res.token}`;
        window.open(url, "_blank");
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-zinc-950">
              {data.event.title} — Invitation Page
            </h1>
            {isPublished ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                <CheckCircle2 size={12} />
                Live
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600">
                Draft
              </span>
            )}
            {hasUnpublished && isPublished && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                <AlertCircle size={12} />
                Unpublished changes
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-500 font-medium">
            Customize and publish a full interactive guest invitation page for this event.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGeneratePreview}
            disabled={previewLoading}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-800 shadow-xs hover:bg-zinc-50 transition disabled:opacity-50"
          >
            <Eye size={14} className="text-zinc-500" />
            <span>{previewLoading ? "Opening..." : "Preview Draft"}</span>
          </button>
        </div>
      </div>

      {/* Wizard mount */}
      <div id="invitation-wizard-mount">
        <InvitationPageWizard eventId={eventId} initialData={initialData} />
      </div>
    </div>
  );
}
