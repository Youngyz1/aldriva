"use client";

/**
 * components/invitation/UnifiedTemplatePicker.tsx
 *
 * Round 5, step 2: ONE template picker for card + page.
 *
 * Grid of complete unified pairs (Round 5 step 2 lists the 4 existing
 * pairs only). Each option shows the card thumbnail plus the page swatch;
 * the selected pair gets a larger preview with Card | Page tabs. A custom
 * card+page combination is never auto-rewritten — it renders a banner
 * with a one-click Unify instead. Applying writes both columns through
 * setUnifiedInvitationTemplate; failures surface as an error banner
 * (never silent). Keyboard: native radiogroup (arrows/space free) plus
 * visible focus rings; tabs are real buttons with aria-pressed.
 */

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertCircle, Check, CheckCircle2, Loader2 } from "lucide-react";
import {
  DEFAULT_UNIFIED_FOR_OCCASION,
  UNIFIED_INVITATION_TEMPLATES,
  resolveUnifiedPair,
  type UnifiedInvitationTemplate,
} from "@/lib/unified-invitation-templates";
import { setUnifiedInvitationTemplate } from "@/lib/actions/unified-invitation-template";
import {
  extrasForTemplate,
  TYPE_FIELD_LABELS,
  type InvitationType,
} from "@/lib/invitation-type-fields";
import { INVITATION_TEMPLATES } from "@/components/invitation/templates/registry";
import { InvitationCardRenderer } from "@/components/invitation/InvitationCardRenderer";
import type { InvitationTemplate } from "@/lib/invitation-types";
import { cn } from "@/lib/utils";

/** Page swatch per page template (mirrors InvitationTemplateSelect; no gradients). */
const PAGE_SWATCH: Record<string, { bg: string; ink: string; accent: string }> = {
  "gala-editorial": { bg: "#F8F5F0", ink: "#1C1A18", accent: "#7A5C3A" },
  "black-tie": { bg: "#09090B", ink: "#FFFFFF", accent: "#FBBF24" },
  "wedding-romantic": { bg: "#FAF8F5", ink: "#2C2220", accent: "#A37068" },
  "birthday-bold": { bg: "#FFFDF7", ink: "#141218", accent: "#FF5E5B" },
  cover: { bg: "#101014", ink: "#FFFFFF", accent: "#C2410C" },
};

const SAMPLE_CARD_GUEST = {
  eventTitle: "Exclusive Event",
  guestName: "Hon. Eleanor Vance",
  guestTitle: "Keynote Speaker",
  organization: "Global Tech Foundation",
  eventDate: new Date().toISOString(),
  venue: "Grand Ballroom",
  city: "San Francisco, CA",
  customMessage: "We would be deeply honored by your presence at our celebration.",
  headerBadgeText: "VIP GUEST INVITATION",
};

export interface UnifiedTemplatePickerProps {
  eventId: string;
  /** Current card slug (server-resolved). Null when none selected. */
  cardSlug: string | null;
  /** Card catalog (art + layout configs for thumbnails and preview). */
  cardTemplates: InvitationTemplate[];
  /** Draft hero URL so the Cover card preview shows real art. Null = palette fallback. */
  heroImageUrl?: string | null;
  /** Current page template id (live draft value). */
  currentPageId: string;
  /** True while the published page still renders a previous design. */
  isPublished: boolean;
  invitationType: InvitationType | null;
  disabled?: boolean;
  /** Parent syncs draft.template_id after a successful apply. */
  onApplied: (pageId: string) => void;
  /** Parent jumps to the publish section. */
  onJumpToPublish: () => void;
  /** Parent reports content sections a page switch would hide. */
  getHiddenForPage: (pageId: string) => string[];
}

function cardBySlug(cardTemplates: InvitationTemplate[], slug: string | null) {
  if (!slug) return undefined;
  return cardTemplates.find((t) => t.slug === slug || t.id === slug);
}

function pageName(pageId: string | null, coverName: string) {
  if (!pageId) return "—";
  if (pageId === "cover") return coverName;
  return INVITATION_TEMPLATES.find((t) => t.id === pageId)?.name ?? pageId;
}

export function UnifiedTemplatePicker({
  eventId,
  cardSlug,
  cardTemplates,
  heroImageUrl = null,
  currentPageId,
  isPublished,
  invitationType,
  disabled,
  onApplied,
  onJumpToPublish,
  getHiddenForPage,
}: UnifiedTemplatePickerProps) {
  const locale = useLocale();
  const t = useTranslations("Events");
  const coverName = locale === "fr" ? t("unifiedCoverName") : "Cover Story";
  const coverCategory = locale === "fr" ? t("unifiedCoverCategory") : "Cover";
  const coverDescription = t("unifiedCoverDescription");
  const pairDescription = (pair: UnifiedInvitationTemplate) => {
    switch (pair.baseId) {
      case "royal-elegance":
        return t("unifiedRoyalEleganceDescription");
      case "festive-gold-noir":
        return t("unifiedFestiveGoldNoirDescription");
      case "grand-gala-noir":
        return t("unifiedGrandGalaNoirDescription");
      case "modern-executive":
        return t("unifiedModernExecutiveDescription");
      default:
        return coverDescription;
    }
  };
  const pairName = (pair: UnifiedInvitationTemplate) =>
    pair.baseId === "cover" ? coverName : pair.name;

  const resolved = useMemo(
    () => resolveUnifiedPair({ cardSlug, pageId: currentPageId }),
    [cardSlug, currentPageId]
  );

  const [selectedId, setSelectedId] = useState<string>(
    resolved.unifiedId ?? DEFAULT_UNIFIED_FOR_OCCASION[invitationType ?? "other"]
  );
  const [savedId, setSavedId] = useState<string | null>(resolved.isExact ? resolved.unifiedId : null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPublish, setNeedsPublish] = useState(false);
  const [previewTab, setPreviewTab] = useState<"card" | "page">("card");
  const [confirmHidden, setConfirmHidden] = useState<{ pair: UnifiedInvitationTemplate; hidden: string[] } | null>(null);

  const selected: UnifiedInvitationTemplate =
    UNIFIED_INVITATION_TEMPLATES.find((p) => p.id === selectedId) ?? UNIFIED_INVITATION_TEMPLATES[0];
  const selectedName = pairName(selected);
  const selectedCard = cardBySlug(cardTemplates, selected.cardSlug);
  const selectedSwatch = PAGE_SWATCH[selected.pageId] ?? { bg: "#FFFFFF", ink: "#18181B", accent: "#C2410C" };
  const pageFields = extrasForTemplate(selected.pageId);

  const customCardName =
    cardSlug === "cover" ? coverName : cardBySlug(cardTemplates, cardSlug)?.name ?? cardSlug;

  // Unify suggestion: the card-dominant pair for the current card, else the
  // occasion default. Never auto-applied — only on explicit click.
  const unifyTarget: UnifiedInvitationTemplate =
    getUnifiedTemplateForUnify(cardSlug) ?? UNIFIED_INVITATION_TEMPLATES[0];
  const unifyTargetName = pairName(unifyTarget);

  function getUnifiedTemplateForUnify(slug: string | null): UnifiedInvitationTemplate | undefined {
    if (slug) {
      const byCard = UNIFIED_INVITATION_TEMPLATES.find((p) => p.cardSlug === slug);
      if (byCard) return byCard;
    }
    return UNIFIED_INVITATION_TEMPLATES.find(
      (p) => p.id === DEFAULT_UNIFIED_FOR_OCCASION[invitationType ?? "other"]
    );
  }

  async function doApply(pair: UnifiedInvitationTemplate) {
    setApplying(true);
    setError(null);
    try {
      const res = await setUnifiedInvitationTemplate(eventId, pair.id);
      if (!res.ok) {
        setError(res.error || t("unifiedApplyFailed"));
        return;
      }
      setSavedId(pair.id);
      setNeedsPublish(res.needsPublish === true && isPublished);
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
    void requestApply(unifyTarget);
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-zinc-500">{t("unifiedPickerHint")}</p>

      {/* Custom combination banner — never auto-rewrites. */}
      {!resolved.isExact && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-xs font-bold text-amber-900">{t("unifiedCustomTitle")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
            {customCardName
              ? t("unifiedCustomBody", {
                  card: customCardName,
                  page: pageName(currentPageId, coverName),
                })
              : t("unifiedCustomBodyNoCard", { page: pageName(currentPageId, coverName) })}
          </p>
          <button
            type="button"
            disabled={disabled || applying}
            onClick={requestUnify}
            className="mt-2 rounded-xl bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-amber-700 active:scale-[0.98] disabled:opacity-60"
          >
            {t("unifiedUnify", { name: unifyTargetName })}
          </button>
        </div>
      )}

      {/* Pair grid (complete pairs only). Native radios: arrows/space free. */}
      <div role="radiogroup" aria-label={t("unifiedPickerTitle")} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {UNIFIED_INVITATION_TEMPLATES.map((pair) => {
          const card = cardBySlug(cardTemplates, pair.cardSlug);
          const swatch = PAGE_SWATCH[pair.pageId] ?? selectedSwatch;
          const localizedName = pairName(pair);
          const localizedCategory = pair.baseId === "cover" ? coverCategory : pair.categoryLabel;
          const isSelected = selected.id === pair.id;
          const isSaved = savedId === pair.id;
          return (
            <label
              key={pair.id}
              className={cn(
                "cursor-pointer rounded-xl border-2 p-2.5 transition focus-within:ring-2 focus-within:ring-orange-500",
                isSelected
                  ? "border-orange-600 bg-orange-50/60 shadow-xs"
                  : "border-zinc-200 bg-white hover:bg-zinc-50"
              )}
            >
              <input
                type="radio"
                name="unified-template"
                value={pair.id}
                checked={isSelected}
                disabled={disabled || applying}
                onChange={() => {
                  setSelectedId(pair.id);
                  setPreviewTab("card");
                }}
                className="sr-only"
              />
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex shrink-0 items-center gap-2">
                    {card?.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={card.thumbnail_url}
                        alt=""
                        className="h-9 w-14 shrink-0 rounded-md border border-zinc-200 object-cover"
                      />
                    ) : (
                      <span
                        className="flex h-9 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-zinc-200 p-1"
                        style={{ background: swatch.bg }}
                        role="img"
                        aria-label={`${localizedName} card thumbnail`}
                      >
                        <span className="h-1 w-2/3 rounded-full" style={{ background: swatch.accent }} />
                        <span className="h-1 w-1/2 rounded-full" style={{ background: swatch.ink, opacity: 0.85 }} />
                      </span>
                    )}
                    <span
                      className="flex h-9 w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-zinc-200 p-1"
                      style={{ background: swatch.bg }}
                      role="img"
                      aria-label={`${localizedName} page thumbnail`}
                    >
                      <span className="h-1 w-2/3 rounded-full" style={{ background: swatch.accent }} />
                      <span className="h-1 w-1/2 rounded-full" style={{ background: swatch.ink, opacity: 0.85 }} />
                    </span>
                  </div>
                  {isSelected && <Check size={14} className="shrink-0 text-orange-600" aria-hidden />}
                </div>
                <div className="min-w-0">
                  <span className="block whitespace-normal break-words text-xs font-bold text-zinc-900">{localizedName}</span>
                  <span className="block whitespace-normal break-words text-[11px] text-zinc-500">{localizedCategory}</span>
                  <span className="mt-0.5 block line-clamp-3 whitespace-normal break-words text-[10px] leading-snug text-zinc-500">
                    {pairDescription(pair)}
                  </span>
                </div>
              </div>
              {isSaved && (
                <span className="mt-1.5 inline-block rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">
                  {t("unifiedCurrent")}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {/* Larger preview with Card | Page tabs. */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
          <p className="truncate text-xs font-bold text-zinc-800">{selectedName}</p>
          <div className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5" role="group" aria-label={t("unifiedPreviewLabel")}>
            {(["card", "page"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={previewTab === tab}
                onClick={() => setPreviewTab(tab)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-bold focus-visible:outline-2 focus-visible:outline-orange-500",
                  previewTab === tab ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500"
                )}
              >
                {tab === "card" ? t("unifiedCardTab") : t("unifiedPageTab")}
              </button>
            ))}
          </div>
        </div>
        <div className="p-3">
          {previewTab === "card" ? (
            selectedCard ? (
              <InvitationCardRenderer
                template={selectedCard}
                data={{ ...SAMPLE_CARD_GUEST, backgroundImageUrl: heroImageUrl }}
                scale={1}
              />
            ) : (
              <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs font-semibold text-zinc-500">
                {t("unifiedCardUnavailable")}
              </p>
            )
          ) : (
            <div className="space-y-2">
              <div
                className="flex h-28 flex-col items-center justify-center gap-1 rounded-lg border border-zinc-200"
                style={{ background: selectedSwatch.bg }}
              >
                <span className="h-1.5 w-1/3 rounded-full" style={{ background: selectedSwatch.accent }} />
                <span className="h-1.5 w-1/2 rounded-full" style={{ background: selectedSwatch.ink, opacity: 0.85 }} />
                <span className="h-1.5 w-1/4 rounded-full" style={{ background: selectedSwatch.ink, opacity: 0.4 }} />
              </div>
              {pageFields.length > 0 && (
                <p className="text-[11px] leading-relaxed text-zinc-500">
                  {t("unifiedUsesFields")}: {pageFields.map((k) => TYPE_FIELD_LABELS[k]).join(" · ")}
                </p>
              )}
              <p className="text-[11px] leading-relaxed text-zinc-500">{t("unifiedLivePreviewNote")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Hidden-content confirm (mirrors the page-only switch guard). */}
      {confirmHidden && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5" role="alert">
          <p className="text-xs font-bold text-amber-900">{t("unifiedConfirmTitle")}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
            {t("unifiedConfirmBody", { sections: confirmHidden.hidden.join(", ") })}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={applying}
              onClick={() => void doApply(confirmHidden.pair)}
              className="rounded-xl bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-amber-700 active:scale-[0.98] disabled:opacity-60"
            >
              {t("unifiedApplyAnyway")}
            </button>
            <button
              type="button"
              onClick={() => setConfirmHidden(null)}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-bold text-zinc-600 hover:bg-zinc-50"
            >
              {t("unifiedCancel")}
            </button>
          </div>
        </div>
      )}

      {/* Publish notice: card is live, page needs republish. */}
      {needsPublish && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5" role="status">
          <p className="text-xs font-bold text-sky-900">{t("unifiedNeedsPublish")}</p>
          <button
            type="button"
            onClick={onJumpToPublish}
            className="mt-1.5 rounded-xl bg-sky-700 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-sky-800 active:scale-[0.98]"
          >
            {t("unifiedGoPublish")}
          </button>
        </div>
      )}

      {error && (
        <p className="flex items-start gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700" role="alert">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={disabled || applying}
        onClick={() => {
          const pair =
            UNIFIED_INVITATION_TEMPLATES.find((p) => p.id === selectedId) ?? UNIFIED_INVITATION_TEMPLATES[0];
          void requestApply(pair);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-xs transition hover:bg-orange-800 active:scale-[0.98] disabled:opacity-60"
      >
        {applying ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            {t("unifiedApplying")}
          </>
        ) : (
          <>
            <CheckCircle2 size={14} />
            {t("unifiedApply")}
          </>
        )}
      </button>
    </div>
  );
}
