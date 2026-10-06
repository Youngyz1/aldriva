"use client";

/**
 * app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx
 *
 * One-page invitation builder: collapsible sections on the left, sticky
 * live preview on the right (desktop); Edit/Preview toggle on phones.
 * Both panes stay mounted — the toggle only CSS-hides (no unmount, no
 * state loss).
 *
 * Slice A: shell + type picker + template dropdown + accordion.
 * Slice B: live preview iframe. Slice C: field bodies + autosave.
 * Slice D: publish section. Slice E: replaces the wizard on the route.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Pencil, Eye } from "lucide-react";
import type { InvitationPageDraftData } from "@/lib/types/invitation-page-snapshot";
import type { InvitationPageDraftInput } from "@/lib/invitation-page-schema";
import {
  DEFAULT_TEMPLATE_FOR_TYPE,
  hiddenContentOnTemplateSwitch,
  type InvitationType,
} from "@/lib/invitation-type-fields";
import {
  isPreviewMessage,
  isSameOriginMessage,
  PREVIEW_MESSAGE_SOURCE,
  type PreviewDraftMessage,
} from "@/lib/invitation-preview-channel";
import { InvitationTypePicker } from "@/components/invitation/InvitationTypePicker";
import { InvitationTemplateSelect } from "@/components/invitation/InvitationTemplateSelect";
import { InvitationSection } from "@/components/invitation/InvitationSection";
import { cn } from "@/lib/utils";

export interface BuilderDraft extends InvitationPageDraftInput {
  // all fields come from InvitationPageDraftInput — no extras needed
}

export function draftFromData(data: InvitationPageDraftData): BuilderDraft {
  const d = data.draft;
  return {
    template_id: d.template_id ?? "gala-editorial",
    locale: d.locale ?? "en",
    display_title: d.display_title ?? null,
    eyebrow: d.eyebrow ?? null,
    host_names: d.host_names ?? null,
    story_headline: d.story_headline ?? null,
    story_text: d.story_text ?? null,
    story_image_url: d.story_image_url ?? null,
    hero_image_url: d.hero_image_url ?? null,
    hero_image_alt: d.hero_image_alt ?? null,
    hero_image_focus_x: d.hero_image_focus_x ?? 50,
    hero_image_focus_y: d.hero_image_focus_y ?? 50,
    scroll_prompt: d.scroll_prompt ?? null,
    venue_name: d.venue_name ?? null,
    address: d.address ?? null,
    parking_notes: d.parking_notes ?? null,
    timezone: d.timezone ?? "",
    dress_code: d.dress_code ?? null,
    dress_code_notes: d.dress_code_notes ?? null,
    additional_notes: d.additional_notes ?? null,
    hashtag: d.hashtag ?? null,
    music_audio_url: d.music_audio_url ?? null,
    music_title: d.music_title ?? null,
    partner1_name: d.partner1_name ?? null,
    partner2_name: d.partner2_name ?? null,
    family_note: d.family_note ?? null,
    wedding_subtype: d.wedding_subtype ?? null,
    registry_note: d.registry_note ?? null,
    celebrant_name: d.celebrant_name ?? null,
    age_milestone: d.age_milestone ?? null,
    theme: d.theme ?? null,
    gift_note: d.gift_note ?? null,
    schedule: d.schedule
      ? d.schedule.map((s) => ({
          time: s.time,
          title: s.title || s.label || "",
          label: s.label || s.title || "",
          description: s.description ?? null,
          badge: s.badge ?? null,
          day: s.day ?? s.dayLabel ?? null,
          dayLabel: s.dayLabel ?? s.day ?? null,
        }))
      : null,
    gallery: d.gallery ?? null,
    venues: d.venues ?? null,
    accommodations: d.accommodations ?? null,
    colors_of_the_day: d.colors_of_the_day ?? null,
    wedding_story: d.wedding_story ?? null,
  };
}

const SECTION_IDS = [
  "type",
  "template",
  "basics",
  "hero",
  "story",
  "details",
  "gallery",
  "music",
  "extras",
  "publish",
] as const;

type SectionId = (typeof SECTION_IDS)[number];

const SECTION_TITLES: Record<SectionId, string> = {
  type: "Type of invitation",
  template: "Template",
  basics: "Basics",
  hero: "Hero",
  story: "Story",
  details: "Details & Schedule",
  gallery: "Gallery",
  music: "Music",
  extras: "Special fields",
  publish: "Publish",
};

type PreviewViewport = 390 | 1440;

interface Props {
  eventId: string;
  initialData: InvitationPageDraftData;
}

function summaryFor(draft: BuilderDraft, section: SectionId): string | null {
  switch (section) {
    case "type":
      return null;
    case "template":
      return draft.template_id;
    case "basics":
      return [draft.display_title || "Untitled", draft.timezone || "No timezone"].join(" · ");
    case "hero":
      return draft.hero_image_url
        ? `Image set · focal ${draft.hero_image_focus_x ?? 50}/${draft.hero_image_focus_y ?? 50}`
        : "No hero image";
    case "story":
      return draft.story_headline || (draft.story_text ? "Text set" : "Empty");
    case "details":
      return draft.venue_name || draft.address || "No venue override";
    case "gallery":
      return `${draft.gallery?.length ?? 0} / 12 photos`;
    case "music":
      return draft.music_audio_url ? draft.music_title || "Track set" : "No music";
    case "extras":
      return "Type-specific fields";
    case "publish":
      return null;
  }
}

export function InvitationPageBuilder({ eventId, initialData }: Props) {
  const [draft, setDraft] = useState<BuilderDraft>(() => draftFromData(initialData));
  const [invitationType, setInvitationType] = useState<InvitationType | null>(null);
  const [openSection, setOpenSection] = useState<SectionId>("type");
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>(390);
  const [previewLocale, setPreviewLocale] = useState<"en" | "fr">(draft.locale || "en");
  const [pageStatus] = useState(initialData.draft.page_status);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);

  // ── Live preview channel (same-origin iframe, debounced drafts) ────────
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestPayloadRef = useRef<PreviewDraftMessage | null>(null);

  const postToPreview = useCallback((msg: PreviewDraftMessage | { source: typeof PREVIEW_MESSAGE_SOURCE; kind: "scroll-to"; sectionId: string }) => {
    iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, []);

  useEffect(() => {
    latestPayloadRef.current = {
      source: PREVIEW_MESSAGE_SOURCE,
      kind: "draft",
      templateId: draft.template_id || "gala-editorial",
      locale: previewLocale,
      draft: { ...draft },
      event: { ...(initialData.event as unknown as Record<string, unknown>) },
    };
    const timer = setTimeout(() => {
      if (latestPayloadRef.current) postToPreview(latestPayloadRef.current);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, previewLocale, initialData.event, postToPreview]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!isSameOriginMessage(e.origin, window.location.origin)) return;
      if (!isPreviewMessage(e.data)) return;
      // The frame announces readiness so the latest draft is flushed even
      // if it was posted before the frame's listener attached.
      if (e.data.kind === "ready" && latestPayloadRef.current) {
        postToPreview(latestPayloadRef.current);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postToPreview]);

  const updateDraft = useCallback((patch: Partial<BuilderDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleTypeChange = useCallback(
    (type: InvitationType) => {
      setInvitationType(type);
      // Suggest the matching template instantly; host can still pick any.
      updateDraft({ template_id: DEFAULT_TEMPLATE_FOR_TYPE[type] });
      setOpenSection("template");
    },
    [updateDraft]
  );

  const hiddenOnSwitch = pendingTemplate
    ? hiddenContentOnTemplateSwitch(draft, draft.template_id, pendingTemplate)
    : [];

  const confirmTemplateSwitch = useCallback(() => {
    if (pendingTemplate) updateDraft({ template_id: pendingTemplate });
    setPendingTemplate(null);
  }, [pendingTemplate, updateDraft]);

  const handleTemplateChange = useCallback(
    (templateId: string) => {
      const hidden = hiddenContentOnTemplateSwitch(draft, draft.template_id, templateId);
      if (hidden.length > 0) {
        // Warn only when the switch actually hides sections with content.
        setPendingTemplate(templateId);
      } else {
        updateDraft({ template_id: templateId });
      }
    },
    [draft, updateDraft]
  );

  const toggleSection = useCallback((id: string) => {
    setOpenSection((cur) => (cur === id ? cur : (id as SectionId)));
    // Clicking a section header scrolls the live preview to that section.
    postToPreview({ source: PREVIEW_MESSAGE_SOURCE, kind: "scroll-to", sectionId: id });
  }, [postToPreview]);

  const isPublished = pageStatus === "published";
  const hasUnpublished = initialData.hasUnpublishedChanges;

  return (
    <div className="space-y-4">
      {/* Status header */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-xs">
        <h1 className="mr-auto text-base font-black text-zinc-950">
          {initialData.event.title} — Invitation Page
        </h1>
        {isPublished ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
            <CheckCircle2 size={12} /> Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600">
            Draft
          </span>
        )}
        {hasUnpublished && isPublished && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            <AlertCircle size={12} /> Unpublished changes
          </span>
        )}
        {/* Phone Edit/Preview toggle (desktop shows both panes) */}
        <div className="flex rounded-xl border border-zinc-200 bg-zinc-50 p-0.5 lg:hidden" role="group" aria-label="Edit or preview">
          <button
            type="button"
            aria-pressed={mobileView === "edit"}
            onClick={() => setMobileView("edit")}
            className={cn(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold",
              mobileView === "edit" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500"
            )}
          >
            <Pencil size={13} /> Edit
          </button>
          <button
            type="button"
            aria-pressed={mobileView === "preview"}
            onClick={() => setMobileView("preview")}
            className={cn(
              "flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold",
              mobileView === "preview" ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500"
            )}
          >
            <Eye size={13} /> Preview
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[440px_minmax(0,1fr)]">
        {/* Form column — CSS-hidden (never unmounted) when previewing on phones */}
        <div className={cn("space-y-3", mobileView === "preview" && "hidden lg:block")}>
          {SECTION_IDS.map((id, i) => (
            <InvitationSection
              key={id}
              id={id}
              index={i}
              title={SECTION_TITLES[id]}
              summary={summaryFor(draft, id)}
              open={openSection === id}
              onToggle={toggleSection}
            >
              {id === "type" && <InvitationTypePicker value={invitationType} onChange={handleTypeChange} />}
              {id === "template" && (
                <div className="space-y-3">
                  <InvitationTemplateSelect
                    value={draft.template_id || "gala-editorial"}
                    onChange={handleTemplateChange}
                    invitationType={invitationType}
                  />
                  {pendingTemplate && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3" role="alert">
                      <p className="text-xs font-bold text-amber-900">
                        Switching templates will hide these completed fields (your content is kept):
                      </p>
                      <ul className="mt-1 list-inside list-disc text-xs text-amber-800">
                        {hiddenOnSwitch.map((label) => (
                          <li key={label}>{label}</li>
                        ))}
                      </ul>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={confirmTemplateSwitch}
                          className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-700"
                        >
                          Switch anyway
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingTemplate(null)}
                          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                        >
                          Keep template
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {id !== "type" && id !== "template" && (
                <p className="text-xs text-zinc-500">
                  {SECTION_TITLES[id]} fields arrive with the next slice.
                </p>
              )}
            </InvitationSection>
          ))}
        </div>

        {/* Preview column — CSS-hidden (never unmounted) when editing on phones */}
        <div className={cn("lg:sticky lg:top-4", mobileView === "edit" && "hidden lg:block")}>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-3 py-2">
              <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5" role="group" aria-label="Preview width">
                {([390, 1440] as PreviewViewport[]).map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={previewViewport === w}
                    onClick={() => setPreviewViewport(w)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-bold tabular-nums",
                      previewViewport === w ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500"
                    )}
                  >
                    {w}px
                  </button>
                ))}
              </div>
              <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5" role="group" aria-label="Preview language">
                {(["en", "fr"] as const).map((loc) => (
                  <button
                    key={loc}
                    type="button"
                    aria-pressed={previewLocale === loc}
                    onClick={() => setPreviewLocale(loc)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11px] font-bold uppercase",
                      previewLocale === loc ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500"
                    )}
                  >
                    {loc}
                  </button>
                ))}
              </div>
              <span className="ml-auto text-[11px] text-zinc-400">
                Preview language only — your editing language is unchanged.
              </span>
            </div>
            <div className="flex justify-center bg-zinc-100 p-3">
              <iframe
                ref={iframeRef}
                title="Live invitation preview"
                src={`/dashboard/events/${eventId}/invitation-page/live-preview`}
                className="h-[720px] w-full rounded-lg border border-zinc-200 bg-white"
                style={{ maxWidth: previewViewport }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
