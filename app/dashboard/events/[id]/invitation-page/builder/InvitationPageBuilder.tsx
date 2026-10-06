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
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Pencil, Eye } from "lucide-react";
import type { InvitationPageDraftData } from "@/lib/types/invitation-page-snapshot";
import type { InvitationPageDraftInput } from "@/lib/invitation-page-schema";
import { saveInvitationPageDraft } from "@/lib/actions/invitation-page";
import { hasDraftChanges } from "@/lib/invitation-page-helpers";
import { createDraftSaveQueue, type SaveStatus } from "@/lib/draft-save-queue";
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
import { BasicsSection } from "./sections/BasicsSection";import { HeroSection } from "./sections/HeroSection";
import { StorySection } from "./sections/StorySection";
import { DetailsSection } from "./sections/DetailsSection";
import { GallerySection } from "./sections/GallerySection";
import { MusicSection } from "./sections/MusicSection";
import { ExtrasSection } from "./sections/ExtrasSection";
import { PublishSection } from "./sections/PublishSection";
import { publishInvitationPage, unpublishInvitationPage } from "@/lib/actions/invitation-page";
import type { BuilderSectionId } from "@/lib/invitation-publish-nav";
import { InvitationTypePicker } from "@/components/invitation/InvitationTypePicker";
import { InvitationTemplateSelect } from "@/components/invitation/InvitationTemplateSelect";
import { InvitationSection } from "@/components/invitation/InvitationSection";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

interface SectionBodyProps {
  id: Exclude<SectionId, "type" | "template" | "publish">;
  eventId: string;
  draft: BuilderDraft;
  event: InvitationPageDraftData["event"];
  invitationType: InvitationType | null;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
}

function SectionBody({ id, eventId, draft, event, invitationType, updateDraft }: SectionBodyProps) {
  switch (id) {
    case "basics":
      return <BasicsSection draft={draft} event={event} updateDraft={updateDraft} />;
    case "hero":
      return <HeroSection eventId={eventId} draft={draft} updateDraft={updateDraft} />;
    case "story":
      return <StorySection eventId={eventId} draft={draft} updateDraft={updateDraft} />;
    case "details":
      return <DetailsSection draft={draft} event={event} updateDraft={updateDraft} />;
    case "gallery":
      return <GallerySection eventId={eventId} draft={draft} updateDraft={updateDraft} />;
    case "music":
      return <MusicSection eventId={eventId} draft={draft} updateDraft={updateDraft} />;
    case "extras":
      return <ExtrasSection draft={draft} invitationType={invitationType} updateDraft={updateDraft} />;
  }
}

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
  const [pageStatus, setPageStatus] = useState(initialData.draft.page_status);
  const [publishedAt, setPublishedAt] = useState<string | null>(initialData.publishedAt);
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  // ── Sequenced autosave (single flight, latest-wins, flush on leave) ────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveQueue] = useState(() =>
    createDraftSaveQueue<BuilderDraft>((payload) => saveInvitationPageDraft(eventId, payload))
  );
  const firstDraftRef = useRef(true);

  useEffect(() => {
    return saveQueue.subscribe(() => {
      const state = saveQueue.getState();
      setSaveStatus(state.status);
      setSaveError(state.error);
    });
  }, [saveQueue]);

  // Queue every draft change (skip the initial mount — nothing is dirty yet).
  useEffect(() => {
    if (firstDraftRef.current) {
      firstDraftRef.current = false;
      return;
    }
    saveQueue.request(draft);
  }, [draft, saveQueue]);

  // Best-effort flush when the host leaves the route.
  useEffect(() => {
    function handleBeforeUnload() {
      void saveQueue.flush();
    }
    function handleVisibility() {
      if (document.visibilityState === "hidden") void saveQueue.flush();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
      void saveQueue.flush();
    };
  }, [saveQueue]);

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

  // Jump link target: open the section, scroll the form to its header,
  // and move keyboard focus there.
  const handleJumpToSection = useCallback((id: BuilderSectionId) => {
    setOpenSection(id as SectionId);
    postToPreview({ source: PREVIEW_MESSAGE_SOURCE, kind: "scroll-to", sectionId: id });
    requestAnimationFrame(() => {
      const header = document.getElementById(`inv-section-header-${id}`);
      header?.scrollIntoView({ behavior: "smooth", block: "start" });
      header?.focus({ preventScroll: true });
    });
  }, [postToPreview]);

  const handlePublish = useCallback(
    async (locale: "en" | "fr") => {
      setActionError(null);
      setActionBusy(true);
      try {
        // Flush pending autosaves first so publish snapshots the latest draft.
        await saveQueue.flush();
        const result = await publishInvitationPage(eventId, locale);
        if (result.ok) {
          setPageStatus("published");
          setPublishedAt(result.publishedAt ?? new Date().toISOString());
        } else {
          setActionError(
            result.error ?? result.errors?.map((e) => e.message).join(" · ") ?? "Publish failed."
          );
        }
      } finally {
        setActionBusy(false);
      }
    },
    [eventId, saveQueue]
  );

  const handleUnpublish = useCallback(async () => {
    setActionError(null);
    setActionBusy(true);
    try {
      const result = await unpublishInvitationPage(eventId);
      if (result.ok) {
        setPageStatus("draft");
      } else {
        setActionError(result.error ?? "Unpublish failed.");
      }
    } finally {
      setActionBusy(false);
    }
  }, [eventId]);

  const isPublished = pageStatus === "published";
  const hasUnpublished = hasDraftChanges(
    draft as unknown as Parameters<typeof hasDraftChanges>[0],
    initialData.draft.published_snapshot,
    pageStatus
  );

  return (
    <div className="space-y-4">
      {/* Status header (plain row, hairline divider — no card) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-1 pb-3">
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
        {/* Autosave status */}
        <span
          role="status"
          className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-600"
        >
          {saveStatus === "saving" && (
            <>
              <Loader2 size={12} className="animate-spin" /> Saving…
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <CheckCircle2 size={12} className="text-emerald-600" /> Saved
            </>
          )}
          {saveStatus === "failed" && (
            <>
              <AlertCircle size={12} className="text-red-600" /> Save failed
              <button
                type="button"
                onClick={() => saveQueue.retry()}
                className="ml-1 underline hover:text-red-800"
              >
                Retry
              </button>
            </>
          )}
          {saveStatus === "idle" && <>Autosave on</>}
        </span>
        {saveError && saveStatus === "failed" && (
          <span className="text-[11px] font-semibold text-red-600">{saveError}</span>
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
                <InvitationTemplateSelect
                  value={draft.template_id || "gala-editorial"}
                  onChange={handleTemplateChange}
                  invitationType={invitationType}
                />
              )}
              {id !== "type" && id !== "template" && id !== "publish" && (
                <SectionBody
                  id={id}
                  eventId={eventId}
                  draft={draft}
                  event={initialData.event}
                  invitationType={invitationType}
                  updateDraft={updateDraft}
                />
              )}
              {id === "publish" && (
                <PublishSection
                  eventId={eventId}
                  draft={draft}
                  event={initialData.event}
                  pageStatus={pageStatus}
                  publishedAt={publishedAt}
                  onPublish={handlePublish}
                  onUnpublish={handleUnpublish}
                  onJumpToSection={handleJumpToSection}
                  disabled={actionBusy}
                />
              )}
              {actionError && id === "publish" && (
                <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
                  {actionError}
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
            <div className="overflow-x-auto bg-zinc-100 p-3">
              {/*
                Exact iframe width (not max-width): the iframe establishes
                its own viewport for media queries, so 390 renders the true
                mobile template breakpoints and 1440 the true desktop ones.
                Wider than the column, it scrolls horizontally instead of
                squeezing.
              */}
              <iframe
                ref={iframeRef}
                title="Live invitation preview"
                src={`/invitation/builder-preview/${eventId}`}
                className="mx-auto block h-[720px] rounded-lg border border-zinc-200 bg-white"
                style={{ width: previewViewport }}
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Template-switch warning modal (focus trapped, Escape closes) */}
      <Dialog
        open={pendingTemplate !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTemplate(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch template?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-zinc-600">
            Switching templates will hide these completed fields. Your content
            is kept and reappears if you switch back.
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-xs font-semibold text-zinc-800">
            {hiddenOnSwitch.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setPendingTemplate(null)}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
            >
              Keep template
            </button>
            <button
              type="button"
              onClick={confirmTemplateSwitch}
              className="rounded-xl bg-orange-600 px-4 py-2 text-xs font-bold text-white hover:bg-orange-700"
            >
              Switch anyway
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
