"use client";

/** One selection writes a complete card + page pair only after Apply. */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Check, CheckCircle2, Loader2 } from "lucide-react";
import {
  DEFAULT_UNIFIED_FOR_OCCASION,
  UNIFIED_INVITATION_TEMPLATES,
  getUnifiedTemplateNameKey,
  resolveUnifiedPair,
  type UnifiedInvitationTemplate,
} from "@/lib/unified-invitation-templates";
import { setUnifiedInvitationTemplate } from "@/lib/actions/unified-invitation-template";
import { extrasForTemplate, TYPE_FIELD_LABELS, type InvitationType } from "@/lib/invitation-type-fields";
import { getTemplateById, INVITATION_TEMPLATES } from "@/components/invitation/templates/registry";
import { InvitationCardRenderer, type InvitationCardData } from "@/components/invitation/InvitationCardRenderer";
import type { InvitationTemplate } from "@/lib/invitation-types";
import {
  buildInvitationTemplatePreviewData,
  getInvitationTemplateSampleData,
} from "@/lib/invitation-template-preview-data";
import { cn } from "@/lib/utils";

const PAGE_SWATCH: Record<string, { bg: string; ink: string; accent: string }> = {
  "gala-editorial": { bg: "#F8F5F0", ink: "#1C1A18", accent: "#7A5C3A" },
  "black-tie": { bg: "#09090B", ink: "#FFFFFF", accent: "#FBBF24" },
  "wedding-romantic": { bg: "#FAF8F5", ink: "#2C2220", accent: "#A37068" },
  "birthday-bold": { bg: "#FFFDF7", ink: "#141218", accent: "#FF5E5B" },
  cover: { bg: "#101014", ink: "#FFFFFF", accent: "#C2410C" },
};

const SAMPLE_CARD_GUEST: InvitationCardData = {
  eventTitle: "Exclusive Event",
  guestName: "",
  hostNames: "",
  eventDate: null,
  venue: null,
  city: null,
  customMessage: null,
  headerBadgeText: null,
  backgroundImageUrl: null,
};

export interface UnifiedTemplatePickerProps {
  eventId: string;
  /** Current card slug resolved from storage; may be null for custom cards. */
  cardSlug: string | null;
  /** Active card catalog. A missing current card does not hide the picker. */
  cardTemplates: InvitationTemplate[];
  draft: Record<string, unknown>;
  event: Record<string, unknown>;
  currentPageId: string;
  candidatePageId: string | null;
  isPublished: boolean;
  invitationType: InvitationType | null;
  disabled?: boolean;
  /** Flush content edits before the atomic template RPC. */
  onBeforeApply: () => Promise<void>;
  /** Sync the RPC-persisted page ID locally without another autosave. */
  onApplied: (pageId: string) => void;
  onCandidateTemplate: (pageId: string | null) => void;
  onJumpToPublish: () => void;
  getHiddenForPage: (pageId: string) => string[];
}

function cardBySlug(cardTemplates: InvitationTemplate[], slug: string | null) {
  if (!slug) return undefined;
  return cardTemplates.find((template) => template.slug === slug || template.id === slug);
}

function pageName(pageId: string | null, coverName: string) {
  if (!pageId) return "—";
  if (pageId === "cover") return coverName;
  return INVITATION_TEMPLATES.find((template) => template.id === pageId)?.name ?? pageId;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ScaledPageFrame({
  pageId,
  data,
  className,
  forceRender = false,
  onReady,
  placeholderLabel,
  decorative = false,
  thumbnail = false,
}: {
  pageId: string;
  data: ReturnType<typeof buildInvitationTemplatePreviewData>;
  className: string;
  forceRender?: boolean;
  onReady?: () => void;
  placeholderLabel: string;
  decorative?: boolean;
  thumbnail?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [frameWidth, setFrameWidth] = useState(320);
  const TemplateComponent = getTemplateById(pageId).component;

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const updateWidth = () => setFrameWidth(frame.clientWidth || 320);
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(frame);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (forceRender) setIsReady(true);
  }, [forceRender]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || isReady) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsReady(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [isReady]);

  useEffect(() => {
    if (isReady) onReady?.();
  }, [isReady, onReady]);

  const scale = Math.min(frameWidth / 390, 1);
  const swatch = PAGE_SWATCH[pageId] ?? PAGE_SWATCH["gala-editorial"];

  return (
    <div
      ref={frameRef}
      className={cn("relative w-full overflow-hidden rounded-lg border border-zinc-200", className)}
      aria-hidden={decorative || undefined}
      inert={decorative || undefined}
      style={{ background: swatch.bg }}
    >
      {!isReady ? (
        <div className="flex h-full items-center justify-center bg-zinc-50 text-[10px] font-semibold text-zinc-600">
          {placeholderLabel}
        </div>
      ) : (
        <div
          className={cn("absolute left-0 top-0 origin-top-left", decorative && "pointer-events-none")}
          style={{ width: 390, transform: `scale(${scale})` }}
        >
          <TemplateComponent data={data.data} previewMode={thumbnail ? "thumbnail" : undefined} />
        </div>
      )}
    </div>
  );
}

function PagePairTile({
  pair,
  name,
  pageData,
  card,
  cardData,
  selected,
  focused,
  pagePlaceholder,
  onSelect,
  onFocus,
}: {
  pair: UnifiedInvitationTemplate;
  name: string;
  pageData: ReturnType<typeof buildInvitationTemplatePreviewData>;
  card: InvitationTemplate;
  cardData: typeof SAMPLE_CARD_GUEST;
  selected: boolean;
  focused: boolean;
  pagePlaceholder: string;
  onSelect: () => void;
  onFocus: () => void;
}) {
  const [pageReady, setPageReady] = useState(false);
  return (
    <label
      className={cn(
        "block min-w-0 cursor-pointer overflow-hidden rounded-xl border-2 bg-white transition focus-within:ring-2 focus-within:ring-orange-700 focus-within:ring-offset-2",
        selected ? "border-orange-700 bg-orange-50/40 shadow-xs" : "border-zinc-300 hover:bg-zinc-50"
      )}
    >
      <input
        type="radio"
        name="unified-template"
        value={pair.id}
        checked={selected}
        onFocus={onFocus}
        onChange={onSelect}
        className="sr-only"
      />
      <div className="relative">
        <ScaledPageFrame
          pageId={pair.pageId}
          data={pageData}
          className="aspect-[3/4] rounded-none border-0"
          forceRender={selected || focused}
          onReady={() => setPageReady(true)}
          placeholderLabel={pagePlaceholder}
          decorative
          thumbnail
        />
        {selected && <Check size={16} className="pointer-events-none absolute right-2 top-2 text-orange-800" aria-hidden="true" />}
      </div>
      <div className="flex min-w-0 items-end justify-between gap-2 p-2.5">
        <span className="block min-w-0 flex-1 whitespace-normal break-words text-sm font-bold text-zinc-900">{name}</span>
        <div
          className="pointer-events-none relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-md border border-zinc-300 bg-white shadow-xs sm:w-[72px]"
          aria-hidden="true"
          inert
        >
          {pageReady ? (
            <div
              className="absolute left-1/2 top-1/2"
              style={{ width: 1200 * 0.152, height: 630 * 0.152, transform: "translate(-50%, -50%)" }}
            >
              <InvitationCardRenderer template={card} data={cardData} scale={0.152} />
            </div>
          ) : (
            <div className="absolute inset-0 bg-zinc-100" />
          )}
        </div>
      </div>
    </label>
  );
}

export function UnifiedTemplatePicker({
  eventId,
  cardSlug,
  cardTemplates,
  draft,
  event,
  currentPageId,
  candidatePageId,
  isPublished,
  invitationType,
  disabled,
  onBeforeApply,
  onApplied,
  onCandidateTemplate,
  onJumpToPublish,
  getHiddenForPage,
}: UnifiedTemplatePickerProps) {
  const t = useTranslations("Events");
  const listId = useId();
  const coverName = t("unifiedCoverName");
  const pairName = (pair: UnifiedInvitationTemplate) => {
    const nameKey = getUnifiedTemplateNameKey(pair.id);
    return nameKey ? t(nameKey) : pair.name;
  };
  const displayNameForId = (identifier: string | null) => {
    const nameKey = getUnifiedTemplateNameKey(identifier);
    return nameKey ? t(nameKey) : pageName(identifier, coverName);
  };

  const [currentCardSlug, setCurrentCardSlug] = useState(cardSlug);
  useEffect(() => setCurrentCardSlug(cardSlug), [cardSlug]);

  const resolved = useMemo(
    () => resolveUnifiedPair({ cardSlug: currentCardSlug, pageId: currentPageId }),
    [currentCardSlug, currentPageId]
  );
  const availablePairs = useMemo(
    () => UNIFIED_INVITATION_TEMPLATES.filter((pair) => {
      const pageExists = INVITATION_TEMPLATES.some((template) => template.id === pair.pageId);
      return pageExists && Boolean(cardBySlug(cardTemplates, pair.cardSlug));
    }),
    [cardTemplates]
  );
  const defaultId = DEFAULT_UNIFIED_FOR_OCCASION[invitationType ?? "other"];
  const initialId = availablePairs.some((pair) => pair.id === resolved.unifiedId)
    ? resolved.unifiedId!
    : availablePairs.some((pair) => pair.id === defaultId)
      ? defaultId
      : availablePairs[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(initialId);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPublish, setNeedsPublish] = useState(false);
  const [previewTab, setPreviewTab] = useState<"page" | "card">("page");
  const [confirmHidden, setConfirmHidden] = useState<{ pair: UnifiedInvitationTemplate; hidden: string[] } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const resolvedPairId = availablePairs.some((pair) => pair.id === resolved.unifiedId)
    ? resolved.unifiedId!
    : availablePairs.some((pair) => pair.id === defaultId)
      ? defaultId
      : availablePairs[0]?.id ?? "";

  useEffect(() => {
    setShowAll(false);
    const previewPair = candidatePageId
      ? availablePairs.find((pair) => pair.pageId === candidatePageId)
      : undefined;
    const next = previewPair?.id ?? resolvedPairId;
    setSelectedId(next);
    setPreviewTab("page");
  }, [availablePairs, candidatePageId, defaultId, invitationType, resolvedPairId, resolved.unifiedId]);

  const allPairs = availablePairs;
  const matchingPairs = allPairs.filter((pair) => pair.occasion === (invitationType ?? "other"));
  const visiblePairs = showAll || matchingPairs.length === 0 ? allPairs : matchingPairs;
  const selected = allPairs.find((pair) => pair.id === selectedId) ?? allPairs[0];
  const selectedName = selected ? pairName(selected) : "";
  const selectedCard = selected ? cardBySlug(cardTemplates, selected.cardSlug) : undefined;
  const selectedPageData = useMemo(
    () => selected ? buildInvitationTemplatePreviewData(selected.pageId, draft, event) : null,
    [selected, draft, event]
  );
  const selectedSample = selected ? getInvitationTemplateSampleData(selected.pageId) : null;
  const cardHostNames =
    nonEmptyString(draft.host_names) ?? nonEmptyString(selectedPageData?.data.hostNames) ??
    nonEmptyString(selectedSample?.hostNames) ??
    [selectedSample?.partner1Name, selectedSample?.partner2Name].filter(Boolean).join(" & ");
  const cardPreviewData = {
    ...SAMPLE_CARD_GUEST,
    eventTitle: nonEmptyString(draft.display_title) ?? nonEmptyString(event.title) ?? selectedPageData?.data.title ?? "Exclusive Event",
    hostNames: cardHostNames,
    eventDate: nonEmptyString(event.event_date) ?? selectedPageData?.data.eventDate ?? null,
    venue: nonEmptyString(draft.venue_name) ?? nonEmptyString(event.venue) ?? selectedPageData?.data.venue ?? null,
    city: nonEmptyString(event.city) ?? selectedPageData?.data.city ?? null,
    backgroundImageUrl: selected?.baseId === "cover" ? nonEmptyString(draft.hero_image_url) : null,
  };
  const pageFields = selected ? extrasForTemplate(selected.pageId) : [];

  const customCardKey = getUnifiedTemplateNameKey(currentCardSlug);
  const customCardName = customCardKey ? t(customCardKey) : cardBySlug(cardTemplates, currentCardSlug)?.name ?? null;
  const unifyTarget =
    allPairs.find((pair) => pair.cardSlug === currentCardSlug) ??
    allPairs.find((pair) => pair.id === defaultId) ?? allPairs[0];

  async function doApply(pair: UnifiedInvitationTemplate) {
    setApplying(true);
    setError(null);
    try {
      await onBeforeApply();
      const result = await setUnifiedInvitationTemplate(eventId, pair.id);
      if (!result.ok) {
        setError(result.error || t("unifiedApplyFailed"));
        return;
      }
      setCurrentCardSlug(pair.cardSlug);
      setNeedsPublish(result.needsPublish === true && isPublished);
      onCandidateTemplate(null);
      onApplied(pair.pageId);
    } catch {
      setError(t("unifiedApplyFailed"));
    } finally {
      setApplying(false);
    }
  }

  async function requestApply(pair: UnifiedInvitationTemplate) {
    setError(null);
    const hidden = getHiddenForPage(pair.pageId);
    if (hidden.length > 0 && confirmHidden?.pair.id !== pair.id) {
      setConfirmHidden({ pair, hidden });
      return;
    }
    setConfirmHidden(null);
    await doApply(pair);
  }

  function requestUnify() {
    if (unifyTarget) void requestApply(unifyTarget);
  }

  function handleSelect(pair: UnifiedInvitationTemplate) {
    setSelectedId(pair.id);
    setPreviewTab("page");
    onCandidateTemplate(pair.pageId);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-700">{t("unifiedPickerHint")}</p>

      {!resolved.isExact && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-bold text-amber-950">{t("unifiedCustomTitle")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900">
            {customCardName
              ? t("unifiedCustomBody", { card: customCardName, page: displayNameForId(currentPageId) })
              : t("unifiedCustomBodyNoCard", { page: displayNameForId(currentPageId) })}
          </p>
          {unifyTarget && (
            <button
              type="button"
              disabled={disabled || applying}
              onClick={requestUnify}
              className="mt-2 rounded-xl bg-amber-700 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed"
            >
              {t("unifiedUnify", { name: pairName(unifyTarget) })}
            </button>
          )}
        </div>
      )}

      {allPairs.length === 0 ? (
        <p className="rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-4 text-center text-xs font-semibold text-zinc-800" role="status">
          {t("unifiedNoAvailableTemplates")}
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p id={`${listId}-label`} className="text-xs font-bold text-zinc-800">{t("unifiedPickerTitle")}</p>
            {matchingPairs.length < allPairs.length && (
              <button
                type="button"
                aria-pressed={showAll}
                onClick={() => setShowAll((value) => !value)}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-orange-700"
              >
                {showAll ? t("unifiedShowMatching") : t("unifiedShowAll")}
              </button>
            )}
          </div>

          <div role="radiogroup" aria-labelledby={`${listId}-label`} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {visiblePairs.map((pair) => {
              const card = cardBySlug(cardTemplates, pair.cardSlug)!;
              const pairPageData = buildInvitationTemplatePreviewData(pair.pageId, draft, event);
              const sample = getInvitationTemplateSampleData(pair.pageId);
              const pairCardData = {
                ...SAMPLE_CARD_GUEST,
                eventTitle: nonEmptyString(draft.display_title) ?? nonEmptyString(event.title) ?? pairPageData.data.title,
                hostNames: nonEmptyString(draft.host_names) ?? nonEmptyString(pairPageData.data.hostNames) ?? nonEmptyString(sample.hostNames) ?? "",
                eventDate: nonEmptyString(event.event_date) ?? pairPageData.data.eventDate ?? null,
                venue: nonEmptyString(draft.venue_name) ?? nonEmptyString(event.venue) ?? pairPageData.data.venue ?? null,
                city: nonEmptyString(event.city) ?? pairPageData.data.city ?? null,
                backgroundImageUrl: pair.baseId === "cover" ? nonEmptyString(draft.hero_image_url) : null,
              };
              const selectedForTile = selected?.id === pair.id;
              return (
                <PagePairTile
                  key={pair.id}
                  pair={pair}
                  name={pairName(pair)}
                  pageData={pairPageData}
                  card={card}
                  cardData={pairCardData}
                  selected={selectedForTile}
                  focused={focusedId === pair.id}
                  pagePlaceholder={t("unifiedPagePreviewLoading")}
                  onSelect={() => handleSelect(pair)}
                  onFocus={() => setFocusedId(pair.id)}
                />
              );
            })}
          </div>

          {selected && selectedPageData && selectedCard && (
            <div className="overflow-hidden rounded-xl border border-zinc-300 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2">
                <p className="min-w-0 text-xs font-bold text-zinc-900">{selectedName}</p>
                <div className="flex rounded-lg border border-zinc-300 bg-zinc-50 p-0.5" role="group" aria-label={t("unifiedPreviewLabel")}>
                  {(["page", "card"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      aria-pressed={previewTab === tab}
                      onClick={() => setPreviewTab(tab)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-orange-700",
                        previewTab === tab ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-700 hover:bg-zinc-100"
                      )}
                    >
                      {tab === "page" ? t("unifiedPageTab") : t("unifiedCardTab")}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative p-3">
                {selectedPageData.sampleFields.length > 0 && (
                  <span className="absolute left-4 top-4 z-10 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-950 shadow-xs">
                    {t("invitationPreviewSampleLabel")}
                  </span>
                )}
                {previewTab === "page" ? (
                  <ScaledPageFrame
                    pageId={selected.pageId}
                    data={selectedPageData}
                    className="h-80"
                    forceRender
                    placeholderLabel={t("unifiedPagePreviewLoading")}
                  />
                ) : (
                  <InvitationCardRenderer template={selectedCard} data={cardPreviewData} scale={0.28} />
                )}
              </div>
              {pageFields.length > 0 && (
                <p className="border-t border-zinc-200 px-3 py-2 text-[11px] leading-relaxed text-zinc-700">
                  {t("unifiedUsesFields")}: {pageFields.map((key) => TYPE_FIELD_LABELS[key]).join(" · ")}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {confirmHidden && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5" role="alert">
          <p className="text-xs font-bold text-amber-950">{t("unifiedConfirmTitle")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-900">
            {t("unifiedConfirmBody", { sections: confirmHidden.hidden.join(", ") })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={applying}
              onClick={() => void doApply(confirmHidden.pair)}
              className="rounded-xl bg-amber-700 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-amber-800 focus-visible:outline-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed"
            >
              {t("unifiedApplyAnyway")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmHidden(null)}
              className="rounded-xl border border-zinc-300 bg-white px-3 py-1.5 text-[11px] font-bold text-zinc-800 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-orange-700"
            >
              {t("unifiedCancel")}
            </button>
          </div>
        </div>
      )}

      {needsPublish && (
        <div className="rounded-xl border border-sky-300 bg-sky-50 px-3 py-2.5" role="status">
          <p className="text-xs font-bold text-sky-950">{t("unifiedNeedsPublish")}</p>
          <button
            type="button"
            onClick={onJumpToPublish}
            className="mt-1.5 rounded-xl bg-sky-800 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-sky-900 focus-visible:outline-2 focus-visible:outline-orange-700"
          >
            {t("unifiedGoPublish")}
          </button>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-900" role="alert">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={disabled || applying || !selected}
        onClick={() => selected && void requestApply(selected)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-800 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-xs transition hover:bg-orange-900 focus-visible:outline-2 focus-visible:outline-orange-700 disabled:cursor-not-allowed"
      >
        {applying ? <><Loader2 size={14} className="animate-spin" />{t("unifiedApplying")}</> : <><CheckCircle2 size={14} />{t("unifiedApply")}</>}
      </button>
    </div>
  );
}
