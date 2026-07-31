"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HowItWorksStep {
  /** Short step title. */
  title: string;
  /** 1–2 sentence supporting description. */
  description: string;
  /** Tailwind background gradient classes for the preview panel when this step is active. */
  bgGradientClass?: string;
  /**
   * Media mockup shown in the synced left panel when this step is active.
   * Supplied by the caller so the layout stays product-agnostic and reusable
   * (Fundraisers, Events, etc.) — no domain language lives in this component.
   */
  media: React.ReactNode;
}

interface HowItWorksProps {
  eyebrow?: string;
  heading: string;
  subheading?: string;
  steps: HowItWorksStep[];
}

/** How long an autoplay-advanced or manually-selected step stays on screen before the next auto-advance. */
const AUTOPLAY_INTERVAL_MS = 4500;
/** How long after the last user interaction before autoplay resumes. */
const RESUME_AFTER_MS = 6000;
/** Minimum horizontal drag distance (px) to register as a swipe. */
const SWIPE_THRESHOLD_PX = 40;

function wrapIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

/**
 * Generic "how it works" section.
 *
 * Desktop (≥lg): a synced media mockup on the left and a set of numbered,
 * selectable steps on the right — unchanged from the original design.
 *
 * Mobile (<lg): a compact interactive walkthrough showing one step at a time
 * (illustration + title + description), with autoplay, swipe, prev/next, and
 * tappable step dots — its own isolated state so it can never affect the
 * desktop layout's behavior.
 */
export default function HowItWorks({ eyebrow, heading, subheading, steps }: HowItWorksProps) {
  const stepCount = steps.length;

  // ── Desktop state (unchanged) ──────────────────────────────────────────
  const [active, setActive] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;

    if (Math.abs(diff) > SWIPE_THRESHOLD_PX) {
      if (diff > 0) {
        // Swiped left -> Next step
        setActive((prev) => (prev < steps.length - 1 ? prev + 1 : 0));
      } else {
        // Swiped right -> Prev step
        setActive((prev) => (prev > 0 ? prev - 1 : steps.length - 1));
      }
    }
    setTouchStartX(null);
  };

  // ── Mobile walkthrough state (isolated from desktop) ───────────────────
  const [mobileActive, setMobileActive] = useState(0);
  const [isMobilePaused, setIsMobilePaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mobileTouchStartX = useRef<number | null>(null);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mql.matches);
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  const pause = useCallback(() => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    setIsMobilePaused(true);
  }, []);

  const scheduleResume = useCallback(() => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => setIsMobilePaused(false), RESUME_AFTER_MS);
  }, []);

  useEffect(() => () => {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
  }, []);

  const goToMobileStep = useCallback(
    (index: number) => {
      setMobileActive(wrapIndex(index, stepCount));
      pause();
      scheduleResume();
    },
    [stepCount, pause, scheduleResume]
  );

  const goNextMobile = useCallback(() => goToMobileStep(mobileActive + 1), [goToMobileStep, mobileActive]);
  const goPrevMobile = useCallback(() => goToMobileStep(mobileActive - 1), [goToMobileStep, mobileActive]);

  // Autoplay — resets its window on every step change (auto or manual) so
  // each step gets a full interval on screen. Disabled entirely when the
  // user prefers reduced motion, or while paused from a recent interaction.
  useEffect(() => {
    if (isMobilePaused || prefersReducedMotion || stepCount <= 1) return;
    const id = setInterval(() => {
      setMobileActive((prev) => wrapIndex(prev + 1, stepCount));
    }, AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isMobilePaused, prefersReducedMotion, stepCount, mobileActive]);

  const handleMobileTouchStart = (e: React.TouchEvent) => {
    mobileTouchStartX.current = e.touches[0].clientX;
  };

  const handleMobileTouchEnd = (e: React.TouchEvent) => {
    if (mobileTouchStartX.current === null) return;
    const diff = mobileTouchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > SWIPE_THRESHOLD_PX) {
      if (diff > 0) goNextMobile();
      else goPrevMobile();
    }
    mobileTouchStartX.current = null;
  };

  const handleMobileKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goNextMobile();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      goPrevMobile();
    }
  };

  const currentMobileStep = steps[mobileActive];

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-16 lg:py-20 lg:px-8">
        {/* ══════════════════════ Desktop (≥lg) — unchanged ══════════════════════ */}
        <div className="hidden items-center gap-10 lg:grid lg:grid-cols-2 lg:gap-16">
          {/* ── Left: synced media panel (supports swipe on touch) ── */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative min-h-[26rem] sm:min-h-[28rem] rounded-3xl p-6 ring-1 ring-zinc-200 sm:p-8 overflow-hidden bg-white touch-pan-y select-none cursor-grab active:cursor-grabbing"
          >
            {/* Synced background layers */}
            {steps.map((step, i) => (
              <div
                key={`bg-${i}`}
                className={cn(
                  "absolute inset-0 bg-gradient-to-b transition-opacity duration-500",
                  step.bgGradientClass || "from-emerald-50/60 to-white",
                  i === active ? "opacity-100 z-10" : "opacity-0 z-0"
                )}
              />
            ))}

            {steps.map((step, i) => (
              <div
                key={i}
                aria-hidden={i !== active}
                className={cn(
                  "absolute inset-0 p-6 sm:p-8 flex items-center justify-center transition-opacity duration-500",
                  i === active
                    ? "opacity-100 z-20"
                    : "opacity-0 z-0 pointer-events-none"
                )}
              >
                {step.media}
              </div>
            ))}
          </div>

          {/* ── Right: heading + numbered steps ── */}
          <div>
            {eyebrow && (
              <p className="text-xs font-black uppercase tracking-widest text-emerald-600">
                {eyebrow}
              </p>
            )}
            <h2 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">
              {heading}
            </h2>
            {subheading && (
              <p className="mt-3 max-w-lg text-base font-medium text-zinc-600">{subheading}</p>
            )}

            <ol className="mt-8 space-y-3">
              {steps.map((step, i) => {
                const isActive = i === active;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setActive(i)}
                      onMouseEnter={() => setActive(i)}
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition sm:p-5",
                        isActive
                          ? "border-emerald-200 bg-emerald-50/60 ring-1 ring-emerald-200"
                          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-black transition",
                          isActive
                            ? "bg-emerald-600 text-white"
                            : "bg-zinc-100 text-zinc-500"
                        )}
                      >
                        {i + 1}
                      </span>
                      <span>
                        <span className="block text-base font-black text-zinc-950">
                          {step.title}
                        </span>
                        <span className="mt-1 block text-sm font-medium text-zinc-600">
                          {step.description}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* ══════════════════════ Mobile (<lg) — interactive walkthrough ══════════════════════ */}
        <div className="lg:hidden">
          {eyebrow && (
            <p className="text-xs font-black uppercase tracking-widest text-emerald-600">
              {eyebrow}
            </p>
          )}
          <h2 className="mt-2 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
            {heading}
          </h2>
          {subheading && (
            <p className="mt-2 text-sm font-medium text-zinc-600">{subheading}</p>
          )}

          <div
            role="group"
            aria-roledescription="carousel"
            aria-label={`${heading} — steps`}
            tabIndex={0}
            onTouchStart={handleMobileTouchStart}
            onTouchEnd={handleMobileTouchEnd}
            onFocus={pause}
            onBlur={scheduleResume}
            onKeyDown={handleMobileKeyDown}
            className="relative mt-6 touch-pan-y select-none outline-none"
          >
            {/* Illustration — cross-fades + slides with the active step.
                min-h is sized to fit the tallest step media (the fundraiser
                step-2 card mockup, which has fixed-px internals independent
                of container width) without cropping — see step definitions
                in components/fundraisers/HowFundraisingWorks.tsx. Padding
                lives only on this panel; slides below intentionally don't
                repeat it since `inset-0` already aligns to the panel's
                padding box. */}
            <div className="relative min-h-[26rem] overflow-hidden rounded-3xl p-5 ring-1 ring-zinc-200 bg-white cursor-grab active:cursor-grabbing">
              <div
                className={cn(
                  "absolute inset-0 bg-gradient-to-b",
                  prefersReducedMotion ? "" : "transition-opacity duration-500",
                  currentMobileStep.bgGradientClass || "from-emerald-50/60 to-white"
                )}
              />
              {steps.map((step, i) => (
                <div
                  key={i}
                  aria-hidden={i !== mobileActive}
                  className={cn(
                    "absolute inset-0 flex items-center justify-center",
                    prefersReducedMotion ? "" : "transition-all duration-500 ease-out",
                    i === mobileActive
                      ? "z-10 translate-x-0 opacity-100"
                      : cn(
                          "z-0 pointer-events-none opacity-0",
                          i < mobileActive ? "-translate-x-3" : "translate-x-3"
                        )
                  )}
                >
                  <div className="mx-auto w-full max-w-[230px]">{step.media}</div>
                </div>
              ))}
            </div>

            {/* Title + description — announced to screen readers as the step changes */}
            <div className="mt-5 min-h-[6rem]" aria-live="polite" aria-atomic="true">
              <h3 className="text-lg font-black text-zinc-950">{currentMobileStep.title}</h3>
              <p className="mt-1.5 text-sm font-medium text-zinc-600">
                {currentMobileStep.description}
              </p>
            </div>

            {/* Prev / counter / Next */}
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={goPrevMobile}
                aria-label="Previous step"
                className="flex items-center gap-1 rounded-full py-2 pl-1 pr-3 text-sm font-bold text-zinc-600 transition hover:text-emerald-700"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              <span className="text-xs font-bold text-zinc-400" aria-hidden="true">
                {mobileActive + 1} / {stepCount}
              </span>
              <button
                type="button"
                onClick={goNextMobile}
                aria-label="Next step"
                className="flex items-center gap-1 rounded-full py-2 pl-3 pr-1 text-sm font-bold text-zinc-600 transition hover:text-emerald-700"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Step indicators */}
            <div className="mt-2 flex items-center justify-center gap-1.5">
              {steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goToMobileStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  aria-current={i === mobileActive ? "step" : undefined}
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    i === mobileActive ? "w-6 bg-emerald-600" : "w-2 bg-zinc-300"
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
