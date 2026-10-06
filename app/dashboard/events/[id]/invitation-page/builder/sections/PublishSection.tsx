"use client";

/**
 * Builder Publish section — migrated from WizardStepPublish (status
 * banner, readiness checklist, validation errors, publish/unpublish),
 * plus jump links: every failing check is a button that opens, scrolls
 * to, and focuses the owning section.
 */

import { useState } from "react";
import { CheckCircle2, AlertCircle, Eye, Globe, Sparkles } from "lucide-react";
import type { BuilderDraft } from "../InvitationPageBuilder";
import type { EventLiveFields } from "@/lib/types/invitation-page-snapshot";
import { validateForPublish } from "@/lib/invitation-page-schema";
import { sectionForPublishField, type BuilderSectionId } from "@/lib/invitation-publish-nav";
import { createOrRegeneratePreviewToken } from "@/lib/actions/invitation-page";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  event: EventLiveFields;
  pageStatus: "draft" | "published";
  publishedAt: string | null;
  onPublish: (locale: "en" | "fr") => Promise<void>;
  onUnpublish: () => Promise<void>;
  onJumpToSection: (id: BuilderSectionId) => void;
  disabled?: boolean;
}

export function PublishSection({
  eventId,
  draft,
  event,
  pageStatus,
  publishedAt,
  onPublish,
  onUnpublish,
  onJumpToSection,
  disabled,
}: Props) {
  const [previewLoading, setPreviewLoading] = useState(false);
  const isPublished = pageStatus === "published";
  const validation = validateForPublish(draft, event, draft.locale || "en");

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await createOrRegeneratePreviewToken(eventId);
      if (res.ok && res.token) {
        window.open(`/invitation/preview/${res.token}`, "_blank");
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Status banner */}
      <div
        className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
          isPublished
            ? "border-emerald-200 bg-emerald-50/60"
            : "border-zinc-200 bg-zinc-50"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isPublished ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-600"
            }`}
          >
            {isPublished ? <CheckCircle2 size={20} /> : <Globe size={20} />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Status</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  isPublished
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-zinc-200 text-zinc-700"
                }`}
              >
                {isPublished ? "Live / Published" : "Draft"}
              </span>
            </div>
            <p className="text-xs font-bold text-zinc-900">
              {isPublished
                ? `Published on ${publishedAt ? new Date(publishedAt).toLocaleDateString() : "Active"}`
                : "Not published. Guests will see the standard digital card."}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handlePreview}
          disabled={disabled || previewLoading}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-bold text-zinc-800 shadow-xs hover:bg-zinc-50 disabled:opacity-50"
        >
          <Eye size={14} className="text-zinc-500" />
          {previewLoading ? "Opening..." : "Preview Draft"}
        </button>
      </div>

      {/* Validation Checklist (failures are jump links) */}
      <div className="space-y-3 border-t border-zinc-200 pt-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">Publish Readiness Checks</h3>

        <div className="divide-y divide-zinc-100">
          {/* Title check */}
          <div className="flex items-center justify-between py-2 text-xs">
            <span className="text-zinc-700">Invitation Title</span>
            <span className="font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 size={13} /> {draft.display_title || event.title}
            </span>
          </div>

          {/* Template check */}
          <div className="flex items-center justify-between py-2 text-xs">
            <span className="text-zinc-700">Selected Template</span>
            <span className="font-semibold text-emerald-600 flex items-center gap-1">
              <CheckCircle2 size={13} /> {draft.template_id}
            </span>
          </div>

          {/* Timezone check */}
          <div className="flex items-center justify-between py-2 text-xs">
            <span className="text-zinc-700">Event Timezone</span>
            {draft.timezone ? (
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={13} /> {draft.timezone}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onJumpToSection("basics")}
                className="font-semibold text-red-600 flex items-center gap-1 hover:underline"
              >
                <AlertCircle size={13} /> Missing Timezone — fix in Basics
              </button>
            )}
          </div>

          {/* Event date & time check */}
          <div className="flex items-center justify-between py-2 text-xs">
            <span className="text-zinc-700">Event Date & Time</span>
            {event.event_date ? (
              <span className="font-semibold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={13} />{" "}
                {new Date(event.event_date).toLocaleDateString(
                  draft.locale === "fr" ? "fr-FR" : "en-US",
                  { month: "short", day: "numeric", year: "numeric" }
                )}
              </span>
            ) : (
              <span className="font-semibold text-red-600 flex items-center gap-1">
                <AlertCircle size={13} /> Missing date — set it in the event settings
              </span>
            )}
          </div>

          {/* Template Specific Checks */}
          {draft.template_id === "wedding-romantic" && (
            <div className="flex items-center justify-between py-2 text-xs">
              <span className="text-zinc-700">Couple Names</span>
              {draft.partner1_name && draft.partner2_name ? (
                <span className="font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={13} /> {draft.partner1_name} & {draft.partner2_name}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onJumpToSection("extras")}
                  className="font-semibold text-red-600 flex items-center gap-1 hover:underline"
                >
                  <AlertCircle size={13} /> Both partner names required — fix in Special fields
                </button>
              )}
            </div>
          )}

          {draft.template_id === "birthday-bold" && (
            <div className="flex items-center justify-between py-2 text-xs">
              <span className="text-zinc-700">Celebrant Name</span>
              {draft.celebrant_name ? (
                <span className="font-semibold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 size={13} /> {draft.celebrant_name}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onJumpToSection("extras")}
                  className="font-semibold text-red-600 flex items-center gap-1 hover:underline"
                >
                  <AlertCircle size={13} /> Celebrant name required — fix in Special fields
                </button>
              )}
            </div>
          )}
        </div>

        {/* Validation Errors List (each a jump link to its section) */}
        {!validation.valid && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-1">
            <p className="text-xs font-bold text-red-700">Please fix the following issues before publishing:</p>
            <ul className="list-inside list-disc text-xs text-red-600 space-y-0.5">
              {validation.errors.map((err, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => onJumpToSection(sectionForPublishField(err.field))}
                    className="hover:underline"
                  >
                    {err.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Publish / Unpublish Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
        <div>
          <p className="text-xs font-bold text-zinc-900">
            {isPublished ? "Republish or Unpublish" : "Ready to launch?"}
          </p>
          <p className="text-[11px] text-zinc-500">
            Publishing captures a new frozen snapshot of your draft. Guests with existing links will immediately see the updated template.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {isPublished && (
            <button
              type="button"
              disabled={disabled}
              onClick={onUnpublish}
              className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-700 shadow-xs hover:bg-red-50 disabled:opacity-50"
            >
              Unpublish Page
            </button>
          )}

          <button
            type="button"
            disabled={disabled || !validation.valid}
            onClick={() => onPublish(draft.locale || "en")}
            className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-orange-700 transition disabled:opacity-40"
          >
            <Sparkles size={14} />
            {isPublished ? "Update Published Snapshot" : "Publish Invitation Page"}
          </button>
        </div>
      </div>
    </div>
  );
}
