"use client";

/**
 * app/dashboard/events/[id]/invitation-page/wizard/InvitationPageWizard.tsx
 *
 * 8-step wizard for building and publishing an invitation page.
 * Mobile-first, works at 320–1440px. Each step is fully independent.
 *
 * Steps:
 *  1. Template — pick from the registry (grouped by category)
 *  2. Basics   — locale, display title, eyebrow, host names, timezone
 *  3. Hero     — hero image upload (cms-media), alt, focus, scroll prompt
 *  4. Story    — story headline, text (max 3000), story image
 *  5. Details  — venue override, address, parking, dress code, notes, hashtag
 *  6. Media    — audio upload (invitation-media), gallery (cms-media, max 12)
 *  7. Extras   — template-specific fields (wedding partners / birthday celebrant)
 *  8. Publish  — review & publish / unpublish
 */

import { useState, useCallback, useTransition } from "react";
import { ChevronLeft, ChevronRight, Globe, Check } from "lucide-react";
import type { InvitationPageDraftData } from "@/lib/types/invitation-page-snapshot";
import type { InvitationPageDraftInput } from "@/lib/invitation-page-schema";
import {
  saveInvitationPageDraft,
  publishInvitationPage,
  unpublishInvitationPage,
} from "@/lib/actions/invitation-page";

// Step components (imported below via dynamic to keep bundle lean)
import { WizardStepTemplate } from "./steps/WizardStepTemplate";
import { WizardStepBasics } from "./steps/WizardStepBasics";
import { WizardStepHero } from "./steps/WizardStepHero";
import { WizardStepStory } from "./steps/WizardStepStory";
import { WizardStepDetails } from "./steps/WizardStepDetails";
import { WizardStepMedia } from "./steps/WizardStepMedia";
import { WizardStepExtras } from "./steps/WizardStepExtras";
import { WizardStepPublish } from "./steps/WizardStepPublish";

export interface WizardDraft extends InvitationPageDraftInput {
  // all fields come from InvitationPageDraftInput — no extras needed
}

const STEP_LABELS = [
  "Template",
  "Basics",
  "Hero",
  "Story",
  "Details",
  "Media",
  "Extras",
  "Publish",
] as const;

export type WizardStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
const TOTAL_STEPS = STEP_LABELS.length;

function draftFromData(data: InvitationPageDraftData): WizardDraft {
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

interface Props {
  eventId: string;
  initialData: InvitationPageDraftData;
}

export function InvitationPageWizard({ eventId, initialData }: Props) {
  const [step, setStep] = useState<WizardStep>(0);
  const [draft, setDraft] = useState<WizardDraft>(() => draftFromData(initialData));
  const [pageStatus, setPageStatus] = useState(initialData.draft.page_status);
  const [publishedAt, setPublishedAt] = useState<string | null>(initialData.publishedAt);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const updateDraft = useCallback((patch: Partial<WizardDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = useCallback(
    async (nextStep?: WizardStep) => {
      setSaveError(null);
      setSaveSuccess(false);
      startTransition(async () => {
        const result = await saveInvitationPageDraft(eventId, draft);
        if (result.ok) {
          setSaveSuccess(true);
          if (nextStep !== undefined) setStep(nextStep);
        } else {
          setSaveError(result.error ?? "Save failed. Please try again.");
        }
      });
    },
    [eventId, draft]
  );

  const handleNext = useCallback(() => {
    handleSave(Math.min(step + 1, TOTAL_STEPS - 1) as WizardStep);
  }, [handleSave, step]);

  const handleBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0) as WizardStep);
  }, []);

  const handlePublish = useCallback(
    async (locale: "en" | "fr") => {
      setSaveError(null);
      startTransition(async () => {
        const result = await publishInvitationPage(eventId, locale);
        if (result.ok) {
          setPageStatus("published");
          setPublishedAt(result.publishedAt ?? new Date().toISOString());
          setSaveSuccess(true);
        } else {
          setSaveError(
            result.error ?? (result.errors?.map((e) => e.message).join(" · ") ?? "Publish failed.")
          );
        }
      });
    },
    [eventId]
  );

  const handleUnpublish = useCallback(async () => {
    setSaveError(null);
    startTransition(async () => {
      const result = await unpublishInvitationPage(eventId);
      if (result.ok) {
        setPageStatus("draft");
        setSaveSuccess(true);
      } else {
        setSaveError(result.error ?? "Unpublish failed.");
      }
    });
  }, [eventId]);

  const stepProps = {
    eventId,
    draft,
    event: initialData.event,
    updateDraft,
    disabled: isPending,
  };

  return (
    <div className="space-y-0">
      {/* Progress bar */}
      <ProgressBar current={step} total={TOTAL_STEPS} labels={STEP_LABELS} onJump={(s) => setStep(s as WizardStep)} />

      {/* Step content */}
      <div className="rounded-b-xl border border-t-0 border-zinc-200 bg-white p-5 sm:p-6 shadow-xs">
        {step === 0 && <WizardStepTemplate {...stepProps} />}
        {step === 1 && <WizardStepBasics {...stepProps} />}
        {step === 2 && <WizardStepHero {...stepProps} />}
        {step === 3 && <WizardStepStory {...stepProps} />}
        {step === 4 && <WizardStepDetails {...stepProps} />}
        {step === 5 && <WizardStepMedia {...stepProps} />}
        {step === 6 && <WizardStepExtras {...stepProps} />}
        {step === 7 && (
          <WizardStepPublish
            {...stepProps}
            pageStatus={pageStatus}
            publishedAt={publishedAt}
            onPublish={handlePublish}
            onUnpublish={handleUnpublish}
          />
        )}

        {/* Inline feedback */}
        {saveError && (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-700">
            {saveError}
          </p>
        )}
        {saveSuccess && !saveError && (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
            <Check size={13} /> Saved
          </p>
        )}

        {/* Navigation */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleBack}
            disabled={step === 0 || isPending}
            className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 transition disabled:opacity-40"
          >
            <ChevronLeft size={15} />
            Back
          </button>

          <div className="flex items-center gap-2">
            {step < TOTAL_STEPS - 1 && (
              <>
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={isPending}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 transition disabled:opacity-40"
                >
                  {isPending ? "Saving…" : "Save draft"}
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-xs hover:bg-orange-700 transition disabled:opacity-40"
                >
                  {isPending ? "Saving…" : "Save & Next"}
                  <ChevronRight size={15} />
                </button>
              </>
            )}
            {step === TOTAL_STEPS - 1 && (
              <button
                type="button"
                onClick={() => handleSave()}
                disabled={isPending}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 transition disabled:opacity-40"
              >
                {isPending ? "Saving…" : "Save draft"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────

interface ProgressBarProps {
  current: number;
  total: number;
  labels: readonly string[];
  onJump: (step: number) => void;
}

function ProgressBar({ current, total, labels, onJump }: ProgressBarProps) {
  return (
    <div className="rounded-t-xl border border-zinc-200 bg-zinc-50 px-4 py-3 shadow-xs">
      {/* Mobile: step indicator */}
      <div className="flex items-center justify-between sm:hidden mb-2">
        <span className="text-xs font-bold text-zinc-700">
          Step {current + 1} of {total}: {labels[current]}
        </span>
        <span className="text-xs text-zinc-400">{Math.round(((current + 1) / total) * 100)}%</span>
      </div>
      <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden sm:hidden">
        <div
          className="h-full bg-orange-500 rounded-full transition-all duration-300"
          style={{ width: `${((current + 1) / total) * 100}%` }}
        />
      </div>

      {/* Desktop: pill steps */}
      <div className="hidden sm:flex items-center gap-1">
        {labels.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <button
              key={label}
              type="button"
              onClick={() => onJump(i)}
              className={[
                "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition",
                active
                  ? "bg-orange-600 text-white"
                  : done
                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                  : "bg-transparent text-zinc-500 hover:bg-zinc-200",
              ].join(" ")}
            >
              {done && <Check size={10} />}
              {!done && !active && (
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] text-zinc-500">
                  {i + 1}
                </span>
              )}
              {active && (
                <Globe size={10} />
              )}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
