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
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Pencil, Eye } from "lucide-react";
import type { InvitationPageDraftData } from "@/lib/types/invitation-page-snapshot";
import type { InvitationTemplate } from "@/lib/invitation-types";
import type { InvitationPageDraftInput } from "@/lib/invitation-page-schema";
import { saveInvitationPageDraft } from "@/lib/actions/invitation-page";
import { hasDraftChanges, summarizeInvitationMusic } from "@/lib/invitation-page-helpers";
import { createDraftSaveQueue, type SaveStatus } from "@/lib/draft-save-queue";
import {
  DEFAULT_TEMPLATE_FOR_TYPE,
  hiddenContentOnTemplateSwitch,
  invitationTypeForTemplate,
  type InvitationType,
} from "@/lib/invitation-type-fields";
import { getUnifiedTemplateNameKey } from "@/lib/unified-invitation-templates";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import {
  isPreviewMessage,
  isSameOriginMessage,
  PREVIEW_MESSAGE_SOURCE,
  type PreviewDraftMessage,
} from "@/lib/invitation-preview-channel";
import { InvitationPreviewPanel } from "@/components/invitation/InvitationPreviewPanel";
import { BasicsSection } from "./sections/BasicsSection";
import { HeroSection } from "./sections/HeroSection";
import { StorySection } from "./sections/StorySection";
import { DetailsSection } from "./sections/DetailsSection";
import { GallerySection } from "./sections/GallerySection";
import { EvergreenPhotosSection } from "./sections/EvergreenPhotosSection";
import { EvergreenDetailsSection } from "./sections/EvergreenDetailsSection";
import { MusicSection } from "./sections/MusicSection";
import { ExtrasSection } from "./sections/ExtrasSection";
import { DesignSection } from "./sections/DesignSection";
import { PublishSection } from "./sections/PublishSection";
import { publishInvitationPage, unpublishInvitationPage } from "@/lib/actions/invitation-page";
import type { BuilderSectionId } from "@/lib/invitation-publish-nav";
import { InvitationTypePicker } from "@/components/invitation/InvitationTypePicker";
import { UnifiedTemplatePicker } from "@/components/invitation/UnifiedTemplatePicker";
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
    blocks_layout: d.template_id === "evergreen-envelope" && d.blocks_layout
      ? legacyInvitationTemplateToLayout(d.template_id, d.blocks_layout)
      : d.blocks_layout ?? null,
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
    music_links: d.music_links ?? null,
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
          icon: s.icon ?? null,
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
  "design",
  "basics",
  "hero",
  "story",
  "details",
  "evergreen",
  "photos",
  "gallery",
  "music",
  "extras",
  "publish",
] as const;

type SectionId = (typeof SECTION_IDS)[number];

const SECTION_TITLES: Record<SectionId, string> = {
  type: "Type of invitation",
  template: "Template",
  design: "Design / Aesthetics",
  basics: "Basics",
  hero: "Hero",
  story: "Story",
  details: "Details & Schedule",
  evergreen: "Evergreen details",
  photos: "Photos",
  gallery: "Gallery",
  music: "Music",
  extras: "Special fields",
  publish: "Publish",
};

const TYPE_NAME_MESSAGE_KEYS = {
  wedding: "invitationTypeWedding",
  birthday: "invitationTypeBirthday",
  gala: "invitationTypeGala",
  other: "invitationTypeOther",
} as const satisfies Record<InvitationType, string>;

type PreviewViewport = 390 | 1440;

const TYPE_FIELD_MESSAGE_KEYS = {
  "Partner 1 name": "invitationTypeFieldPartner1Name",
  "Partner 2 name": "invitationTypeFieldPartner2Name",
  "Family note": "invitationTypeFieldFamilyNote",
  "Wedding subtype": "invitationTypeFieldWeddingSubtype",
  "Registry note": "invitationTypeFieldRegistryNote",
  "Ceremony & reception venues": "invitationTypeFieldVenues",
  Accommodations: "invitationTypeFieldAccommodations",
  "Colors of the day": "invitationTypeFieldColorsOfTheDay",
  "Celebrant name": "invitationTypeFieldCelebrantName",
  "Age milestone": "invitationTypeFieldAgeMilestone",
  "Party theme": "invitationTypeFieldPartyTheme",
  "Gift note": "invitationTypeFieldGiftNote",
  "Evergreen details and photos": "invitationTypeFieldEvergreenDetails",
} as const;

interface SectionBodyProps {
  id: Exclude<SectionId, "type" | "template" | "publish">;
  eventId: string;
  draft: BuilderDraft;
  event: InvitationPageDraftData["event"];
  invitationType: InvitationType | null;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  removedUnsupportedMusicLinks: boolean;
  onDismissUnsupportedMusicNotice: () => void;
}

function SectionBody({
  id,
  eventId,
  draft,
  event,
  invitationType,
  updateDraft,
  removedUnsupportedMusicLinks,
  onDismissUnsupportedMusicNotice,
}: SectionBodyProps) {
  switch (id) {
    case "design":
      return <DesignSection draft={draft} updateDraft={updateDraft} />;
    case "basics":
      return <BasicsSection draft={draft} event={event} eventId={eventId} updateDraft={updateDraft} />;
    case "hero":
      return <HeroSection eventId={eventId} draft={draft} updateDraft={updateDraft} />;
    case "story":
      return <StorySection eventId={eventId} draft={draft} updateDraft={updateDraft} />;
    case "details":
      return <DetailsSection draft={draft} event={event} updateDraft={updateDraft} />;
    case "evergreen":
      return <EvergreenDetailsSection draft={draft} updateDraft={updateDraft} />;
    case "photos":
      return <EvergreenPhotosSection eventId={eventId} draft={draft} updateDraft={updateDraft} />;
    case "gallery":
      return <GallerySection eventId={eventId} draft={draft} updateDraft={updateDraft} />;
    case "music":
      return (
        <MusicSection
          eventId={eventId}
          draft={draft}
          updateDraft={updateDraft}
          showUnsupportedLinksNotice={removedUnsupportedMusicLinks}
          onDismissUnsupportedLinksNotice={onDismissUnsupportedMusicNotice}
        />
      );
    case "extras":
      return <ExtrasSection draft={draft} invitationType={invitationType} updateDraft={updateDraft} />;
  }
}

interface Props {
  eventId: string;
  initialData: InvitationPageDraftData;
  /**
   * Override the initial open section. The dashboard passes "basics" when
   * a page row already exists (an existing page never re-asks for a
   * template); fresh drafts start at "type" (template choice, then form).
   */
  initialSection?: SectionId;
  /** Current card slug (server-resolved). Null when none selected. Round 5. */
  cardSlug?: string | null;
  /** Card catalog for the unified picker. Round 5. */
  cardTemplates?: InvitationTemplate[];
}

function summaryFor(
  draft: BuilderDraft,
  section: SectionId,
  typeSummary: string | null,
  templateSummary: string | null,
  musicSummary: string
): string | null {
  switch (section) {
    case "type":
      return typeSummary;
    case "template":
      return templateSummary ?? draft.template_id;
    case "design":
      return "Palette, typography & text size";
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
    case "evergreen":
      return "Template-specific details";
    case "photos": {
      const photos = draft.blocks_layout?.template_data;
      const count = [
        photos?.envelope_photo_url, photos?.cover_photo_url, photos?.polaroid_photo_one_url,
        photos?.polaroid_photo_two_url, photos?.story_photo_one_url, photos?.story_photo_two_url,
        photos?.closing_photo_url, photos?.rsvp_photo_url,
      ].filter(Boolean).length;
      return `${count} / 8 photos`;
    }
    case "music":
      return musicSummary;
    case "extras":
      return "Type-specific fields";
    case "publish":
      return null;
  }
}

export function InvitationPageBuilder({
  eventId,
  initialData,
  initialSection = "type",
  cardSlug = null,
  cardTemplates = [],
}: Props) {
  const t = useTranslations("Events");
  const router = useRouter();
  const [draft, setDraft] = useState<BuilderDraft>(() => draftFromData(initialData));
  const [invitationType, setInvitationType] = useState<InvitationType | null>(() =>
    initialData.draft.id && initialData.draft.id !== ""
      ? invitationTypeForTemplate(draftFromData(initialData).template_id)
      : null
  );
  const [pendingTypeChange, setPendingTypeChange] = useState<{
    type: InvitationType;
    pageId: string;
    hiddenFields: string[];
  } | null>(null);
  const [candidatePreviewTemplateId, setCandidatePreviewTemplateId] = useState<string | null>(null);
  const [openSection, setOpenSection] = useState<SectionId | null>(initialSection);
  const typeSummary = invitationType ? t(TYPE_NAME_MESSAGE_KEYS[invitationType]) : null;
  const templateNameKey = getUnifiedTemplateNameKey(draft.template_id);
  const templateSummary = templateNameKey ? t(templateNameKey) : draft.template_id;
  const musicSummary = summarizeInvitationMusic(
    draft.music_audio_url,
    draft.music_title,
    draft.music_links?.length ?? 0,
    (count) => t("musicLinkCountSummary", { count })
  );
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [showUnsupportedMusicNotice, setShowUnsupportedMusicNotice] = useState(false);
  const [previewViewport, setPreviewViewport] = useState<PreviewViewport>(390);
  const [previewLocale, setPreviewLocale] = useState<"en" | "fr">(draft.locale || "en");
  const [pageStatus, setPageStatus] = useState(initialData.draft.page_status);
  const [publishedAt, setPublishedAt] = useState<string | null>(initialData.publishedAt);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (!initialData.removedUnsupportedMusicLinks) return;
    const noticeKey = `invitation-unsupported-music:${eventId}`;
    try {
      if (window.sessionStorage.getItem(noticeKey)) return;
      window.sessionStorage.setItem(noticeKey, "shown");
    } catch {
      // If storage is unavailable, show the notice for this builder visit.
    }
    setShowUnsupportedMusicNotice(true);
  }, [eventId, initialData.removedUnsupportedMusicLinks]);

  // ── Sequenced autosave (single flight, latest-wins, flush on leave) ────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const previousAutosaveDraftRef = useRef<BuilderDraft | null>(null);
  const skipTemplateAutosaveRef = useRef<string | null>(null);
  const [saveQueue] = useState(() =>
    createDraftSaveQueue<BuilderDraft>((payload) => saveInvitationPageDraft(eventId, payload))
  );
  const firstDraftRef = useRef(true);
  const typePickerFocusReturnRef = useRef<HTMLElement | null>(null);
  const typeDialogCancelRef = useRef<HTMLButtonElement | null>(null);

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
      previousAutosaveDraftRef.current = draft;
      return;
    }
    const rpcPersistedTemplate = skipTemplateAutosaveRef.current;
    const previous = previousAutosaveDraftRef.current;
    const templateOnlyRpcSync =
      rpcPersistedTemplate === draft.template_id &&
      previous !== null &&
      previous.template_id !== draft.template_id &&
      JSON.stringify(draft, (key, value) => key === "template_id" ? undefined : value) ===
        JSON.stringify(previous, (key, value) => key === "template_id" ? undefined : value);
    previousAutosaveDraftRef.current = draft;
    if (templateOnlyRpcSync) {
      skipTemplateAutosaveRef.current = null;
      return;
    }
    if (rpcPersistedTemplate) skipTemplateAutosaveRef.current = null;
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
      templateId: candidatePreviewTemplateId || draft.template_id || "gala-editorial",
      locale: previewLocale,
      draft: {
        ...draft,
        template_id: candidatePreviewTemplateId || draft.template_id || "gala-editorial",
      },
      event: { ...(initialData.event as unknown as Record<string, unknown>) },
      candidatePreview: Boolean(candidatePreviewTemplateId && candidatePreviewTemplateId !== draft.template_id),
      savedTemplateId: draft.template_id || "gala-editorial",
    };
    const timer = setTimeout(() => {
      if (latestPayloadRef.current) postToPreview(latestPayloadRef.current);
    }, 400);
    return () => clearTimeout(timer);
  }, [draft, previewLocale, initialData.event, postToPreview, candidatePreviewTemplateId]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!isSameOriginMessage(e.origin, window.location.origin)) return;
      if (!isPreviewMessage(e.data)) return;
      // The frame announces readiness so the latest draft is flushed even
      // if it was posted before the frame's listener attached.
      if (e.data.kind === "ready" && latestPayloadRef.current) {
        postToPreview(latestPayloadRef.current);
      } else if (e.data.kind === "block-select") {
        const sectionForBlock: Record<string, SectionId> = {
          hero: "hero",
          story: "story",
          details: "details",
          schedule: "details",
          gallery: "gallery",
          music: "music",
          action_portal: "publish",
        };
        const sectionId = sectionForBlock[e.data.blockType];
        if (!sectionId) return;
        setOpenSection(sectionId);
        requestAnimationFrame(() => {
          const header = document.getElementById(`inv-section-header-${sectionId}`);
          header?.scrollIntoView({ behavior: "smooth", block: "start" });
          header?.focus({ preventScroll: true });
        });
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
      if (type === invitationType) return;
      const pageId = DEFAULT_TEMPLATE_FOR_TYPE[type];
      const activeElement = document.activeElement;
      typePickerFocusReturnRef.current = activeElement instanceof HTMLElement ? activeElement : null;
      setCandidatePreviewTemplateId(pageId === draft.template_id ? null : pageId);
      setPendingTypeChange({
        type,
        pageId,
        hiddenFields: hiddenContentOnTemplateSwitch(draft, draft.template_id, pageId).map((label) => {
          const messageKey = TYPE_FIELD_MESSAGE_KEYS[label as keyof typeof TYPE_FIELD_MESSAGE_KEYS];
          return messageKey ? t(messageKey) : label;
        }),
      });
    },
    [draft, invitationType, t]
  );

  useEffect(() => {
    if (!pendingTypeChange) return;
    requestAnimationFrame(() => typeDialogCancelRef.current?.focus());
  }, [pendingTypeChange]);

  const cancelTypeChange = useCallback(() => {
    setPendingTypeChange(null);
    setCandidatePreviewTemplateId(null);
    requestAnimationFrame(() => typePickerFocusReturnRef.current?.focus());
  }, []);

  const confirmTypeChange = useCallback(() => {
    if (!pendingTypeChange) return;
    setInvitationType(pendingTypeChange.type);
    // Confirmation is the type save point; until now only the iframe used
    // the candidate page. Values remain on the draft while visibility changes.
    const evergreenData = draft.blocks_layout?.template_data;
    const blocksLayout = evergreenData
      ? { ...legacyInvitationTemplateToLayout(pendingTypeChange.pageId), template_data: evergreenData }
      : null;
    updateDraft({ template_id: pendingTypeChange.pageId, blocks_layout: blocksLayout });
    setCandidatePreviewTemplateId(null);
    setPendingTypeChange(null);
    setOpenSection(null);
    requestAnimationFrame(() => document.getElementById("inv-section-header-type")?.focus());
  }, [draft.blocks_layout, pendingTypeChange, updateDraft]);

  const handleUnifiedTemplateApplied = useCallback((pageId: string) => {
    setInvitationType(invitationTypeForTemplate(pageId));
    if (pageId !== "romantic-envelope" && pageId !== "evergreen-envelope") {
      if (draft.template_id === pageId) return;
      skipTemplateAutosaveRef.current = pageId;
      const evergreenData = draft.blocks_layout?.template_data;
      const blocksLayout = evergreenData
        ? { ...legacyInvitationTemplateToLayout(pageId), template_data: evergreenData }
        : null;
      setDraft((current) => ({ ...current, template_id: pageId, blocks_layout: blocksLayout }));
      return;
    }

    const blocksLayout = legacyInvitationTemplateToLayout(pageId, draft.blocks_layout);
    if (draft.template_id === pageId && JSON.stringify(draft.blocks_layout) === JSON.stringify(blocksLayout)) return;
    if (draft.template_id !== pageId) skipTemplateAutosaveRef.current = pageId;
    setDraft((current) => ({ ...current, template_id: pageId, blocks_layout: blocksLayout }));
  }, [draft.blocks_layout, draft.template_id]);

  const pendingTypeLabel = pendingTypeChange
    ? pendingTypeChange.type === "wedding"
      ? t("invitationTypeWedding")
      : pendingTypeChange.type === "birthday"
        ? t("invitationTypeBirthday")
        : pendingTypeChange.type === "gala"
          ? t("invitationTypeGala")
          : t("invitationTypeOther")
    : "";

  const toggleSection = useCallback((id: string) => {
    const sectionId = id as SectionId;
    if (openSection !== null && openSection !== sectionId) {
      const header = document.getElementById(`inv-section-header-${sectionId}`);
      const previousTop = header?.getBoundingClientRect().top;
      if (previousTop !== undefined) {
        requestAnimationFrame(() => {
          const currentTop = document
            .getElementById(`inv-section-header-${sectionId}`)
            ?.getBoundingClientRect().top;
          if (currentTop !== undefined) {
            const adjustment = currentTop - previousTop;
            if (adjustment !== 0) window.scrollBy({ top: adjustment, behavior: "instant" });
          }
        });
      }
    }
    setOpenSection((current) => (current === sectionId ? null : sectionId));
    // Keep the live preview in sync without moving the builder page.
    postToPreview({ source: PREVIEW_MESSAGE_SOURCE, kind: "scroll-to", sectionId: id });
  }, [openSection, postToPreview]);

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
          router.push(`/dashboard/events/${eventId}/invitation-page`);
        } else {
          setActionError(
            result.error ?? result.errors?.map((e) => e.message).join(" · ") ?? "Publish failed."
          );
        }
      } finally {
        setActionBusy(false);
      }
    },
    [eventId, router, saveQueue]
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
      {!initialData.draft.id && (
        <section
          data-testid="start-designing-intro"
          className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3"
        >
          <h2 className="text-sm font-black text-zinc-950">Start designing your invitation</h2>
          <p className="mt-1 text-xs font-medium text-zinc-600">
            Choose an invitation type and template, then add the details your guests will see.
          </p>
        </section>
      )}
      {/* Status header (plain row, hairline divider — no card) */}
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-zinc-200 px-1 pb-3">
        <h1 className="mr-auto min-w-0 flex-1 basis-48 text-base font-black text-zinc-950 [overflow-wrap:anywhere]">
          {initialData.event.title} — Invitation Page
        </h1>
        {initialData.draft.id && (
          <Link
            data-testid="back-to-preview"
            href={`/dashboard/events/${eventId}/invitation-page`}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50"
          >
            Back to preview
          </Link>
        )}
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
          <span className="text-[11px] font-semibold text-red-600">
            {saveError === "coverHeroStorageHostOnly" ? t("coverHeroStorageHostOnly") : saveError}
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

      <div
        data-testid="invitation-builder-columns"
        className="grid min-w-0 max-w-full grid-cols-1 items-start gap-4 xl:h-[calc(100dvh-10rem)] xl:grid-cols-[minmax(0,520px)_minmax(0,640px)] xl:justify-center"
      >
        {/* Form column — CSS-hidden (never unmounted) when previewing on phones */}
        <div
          data-testid="invitation-builder-form-column"
          className={cn(
            "min-w-0 space-y-3 xl:h-full xl:min-h-0 xl:max-h-full xl:overflow-x-hidden xl:overflow-y-auto xl:overscroll-contain xl:pr-3",
            mobileView === "preview" && "hidden lg:block"
          )}
        >
          {SECTION_IDS.filter((id) => (id !== "photos" && id !== "evergreen") || draft.template_id === "evergreen-envelope").map((id, i) => (
            <InvitationSection
              key={id}
              id={id}
              index={i}
              title={id === "photos" ? t("evergreenPhotosGroup") : id === "evergreen" ? t("evergreenDetailsGroup") : SECTION_TITLES[id]}
              summary={summaryFor(draft, id, typeSummary, templateSummary, musicSummary)}
              open={openSection === id}
              onToggle={toggleSection}
            >
              {id === "type" && <InvitationTypePicker value={invitationType} onChange={handleTypeChange} />}
              {id === "template" && (
                <UnifiedTemplatePicker
                  eventId={eventId}
                  cardSlug={cardSlug}
                  cardTemplates={cardTemplates}
                  draft={draft as unknown as Record<string, unknown>}
                  event={initialData.event as unknown as Record<string, unknown>}
                  currentPageId={draft.template_id || "gala-editorial"}
                  candidatePageId={candidatePreviewTemplateId}
                  isPublished={pageStatus === "published"}
                  invitationType={invitationType}
                  disabled={actionBusy}
                  onBeforeApply={async () => { await saveQueue.flush(); }}
                  onApplied={handleUnifiedTemplateApplied}
                  onCandidateTemplate={setCandidatePreviewTemplateId}
                  onJumpToPublish={() => handleJumpToSection("publish")}
                  getHiddenForPage={(pageId) =>
                    hiddenContentOnTemplateSwitch(draft, draft.template_id, pageId)
                  }
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
                  removedUnsupportedMusicLinks={showUnsupportedMusicNotice}
                  onDismissUnsupportedMusicNotice={() => setShowUnsupportedMusicNotice(false)}
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
        <div
          data-testid="invitation-builder-preview-column"
          className={cn(
            "w-full min-w-0 max-w-full xl:sticky xl:top-4 xl:w-full xl:max-w-[640px] xl:self-start xl:h-full xl:min-h-0 xl:max-h-[calc(100dvh-2rem)]",
            mobileView === "edit" && "hidden lg:block"
          )}
        >
          <InvitationPreviewPanel
            iframeSrc={`/invitation/builder-preview/${eventId}?embed=1`}
            iframeRef={iframeRef}
            title="Live invitation preview"
            className="h-full min-h-0"
            containerClassName="min-h-0 flex-1"
            caption="Preview language only — your editing language is unchanged."
            showLocaleToggle
            locale={previewLocale}
            onLocaleChange={setPreviewLocale}
            viewport={previewViewport}
            onViewportChange={setPreviewViewport}
          />
        </div>
      </div>

      {pendingTypeChange && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelTypeChange();
              return;
            }
            if (event.key !== "Tab") return;
            const buttons = [typeDialogCancelRef.current, document.getElementById("invitation-type-confirm")]
              .filter((button): button is HTMLElement => button instanceof HTMLElement);
            if (buttons.length < 2) return;
            const first = buttons[0];
            const last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="invitation-type-confirm-title"
            aria-describedby="invitation-type-confirm-body"
            className="w-full max-w-md rounded-xl border border-zinc-300 bg-white p-5 shadow-xl"
          >
            <h2 id="invitation-type-confirm-title" className="text-base font-black text-zinc-950">
              {t("invitationTypeConfirmTitle")}
            </h2>
            <p id="invitation-type-confirm-body" className="mt-2 text-sm leading-relaxed text-zinc-700">
              {pendingTypeChange.hiddenFields.length > 0
                ? t("invitationTypeConfirmBody", {
                    type: pendingTypeLabel,
                    fields: pendingTypeChange.hiddenFields.join(", "),
                  })
                : t("invitationTypeConfirmNoHidden", {
                    type: pendingTypeLabel,
                  })}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                ref={typeDialogCancelRef}
                type="button"
                onClick={cancelTypeChange}
                className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-bold text-zinc-800 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2"
              >
                {t("invitationTypeCancelAction")}
              </button>
              <button
                id="invitation-type-confirm"
                type="button"
                onClick={confirmTypeChange}
                className="rounded-xl bg-orange-800 px-4 py-2 text-sm font-bold text-white hover:bg-orange-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2"
              >
                {t("invitationTypeConfirmAction")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
