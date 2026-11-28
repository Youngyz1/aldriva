"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { resolveTrustIcon } from "@/lib/trust-strip-icons";

export interface ServicesMarqueeItem {
  title: string;
  description?: string;
  icon?: string;
  titlePathProps?: Record<string, string>;
  descriptionPathProps?: Record<string, string>;
}

export interface ServicesMarqueeProps {
  items: ServicesMarqueeItem[];
  heading?: string;
  subheading?: string;
  sectionAlign?: "left" | "center";
  /** Owner's "Scrolling services" builder toggle (template_extras.servicesMarquee). */
  scrollingEnabled: boolean;
}

/** Constant apparent scroll speed: duration = stripWidth / PX_PER_SECOND. */
const PX_PER_SECOND = 35;
const MIN_COPIES = 2;

function Pill({
  item,
  IconComponent,
  ariaHidden,
}: {
  item: ServicesMarqueeItem;
  IconComponent: ComponentType<{ className?: string }>;
  ariaHidden: boolean;
}) {
  return (
    <div
      role={ariaHidden ? undefined : "listitem"}
      aria-hidden={ariaHidden || undefined}
      className="flex shrink-0 items-center gap-2.5 rounded-xl border border-[var(--tf-border)] bg-[var(--tf-card)] px-3.5 py-2.5 text-[var(--tf-ink)]"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--tf-soft)] text-[var(--tf-accent)]">
        <IconComponent className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0">
        <p
          {...(ariaHidden ? {} : item.titlePathProps)}
          className="text-[13px] font-semibold text-[var(--tf-ink)] whitespace-nowrap"
        >
          {item.title}
        </p>
        {item.description ? (
          <p
            {...(ariaHidden ? {} : item.descriptionPathProps)}
            className="text-[12px] text-[var(--tf-muted)] whitespace-nowrap"
          >
            {item.description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MarqueeHeading({ heading, subheading, align }: { heading?: string; subheading?: string; align?: "left" | "center" }) {
  if (!heading && !subheading) return null;
  return (
    <div className={`mx-auto mb-[var(--ps-space-4)] max-w-[1280px] ${align === "left" ? "text-left" : "text-center"}`}>
      {heading ? <h2 className="showcase-section-title text-[18px] font-semibold leading-[1.25] text-[var(--tf-ink)] sm:text-[22px]">{heading}</h2> : null}
      {subheading ? <p className="mt-1 text-[14px] text-[var(--tf-muted)]">{subheading}</p> : null}
    </div>
  );
}

/** One strip: `copies` back-to-back passes through `items`, each pill
 * separated by a consistent gap, with its OWN trailing padding equal to
 * that gap. Two such strips placed side by side (zero gap between them)
 * make a track whose total width is exactly 2x one strip's width, so
 * translateX(-50%) is an exact, seamless loop. */
function Strip({
  items,
  icons,
  copies,
  ariaHiddenAll,
  innerRef,
  className,
  style,
}: {
  items: ServicesMarqueeItem[];
  icons: ComponentType<{ className?: string }>[];
  copies: number;
  ariaHiddenAll: boolean;
  innerRef?: React.Ref<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      ref={innerRef}
      role={ariaHiddenAll ? undefined : "list"}
      aria-hidden={ariaHiddenAll || undefined}
      className={`flex shrink-0 gap-[var(--ps-space-3)] pr-[var(--ps-space-3)] ${className ?? ""}`}
      style={style}
    >
      {Array.from({ length: copies }, (_, copyIdx) =>
        items.map((item, i) => (
          <Pill key={`${copyIdx}-${i}`} item={item} IconComponent={icons[i]} ariaHidden={ariaHiddenAll || copyIdx > 0} />
        ))
      )}
    </div>
  );
}

export function ServicesMarquee({
  items,
  heading,
  subheading,
  sectionAlign,
  scrollingEnabled,
}: ServicesMarqueeProps) {
  const canAnimate = scrollingEnabled && items.length >= 3;

  const [enhanced, setEnhanced] = useState(false);
  const [copies, setCopies] = useState(MIN_COPIES);
  const [stripWidth, setStripWidth] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTouched, setIsTouched] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Enhance after mount only — server render and first client render stay
  // the static row, so there is no hydration mismatch.
  useEffect(() => {
    if (!canAnimate || typeof window === "undefined" || !window.matchMedia) {
      setEnhanced(false);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnhanced(canAnimate && !reduceMotion.matches);
    update();
    reduceMotion.addEventListener("change", update);
    return () => reduceMotion.removeEventListener("change", update);
  }, [canAnimate]);

  // How many times to repeat `items` inside one strip so the strip always
  // covers at least the visible viewport (no blank gap), re-measured on
  // resize via ResizeObserver.
  useEffect(() => {
    if (!enhanced) return;
    const viewport = viewportRef.current;
    const probe = probeRef.current;
    if (!viewport || !probe || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const naturalWidth = probe.scrollWidth;
      const viewportWidth = viewport.clientWidth;
      if (naturalWidth <= 0) return;
      setCopies(Math.max(MIN_COPIES, Math.ceil(viewportWidth / naturalWidth) + 1));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(probe);
    return () => observer.disconnect();
  }, [enhanced, items.length]);

  // Actual rendered strip width drives the animation duration, so apparent
  // speed stays a constant PX_PER_SECOND regardless of item count or copies.
  useEffect(() => {
    if (!enhanced) return;
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === "undefined") return;
    const measure = () => setStripWidth(strip.scrollWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [enhanced, copies, items.length]);

  if (items.length === 0) return null;

  const icons = items.map((item, i) => resolveTrustIcon(item.icon, i));
  const durationReady = stripWidth > 0;
  const duration = durationReady ? stripWidth / PX_PER_SECOND : 0;
  const isRunning = durationReady && !isHovered && !isTouched && !isFocused;

  if (!enhanced) {
    // Static fallback: fewer than 3 items, the owner turned scrolling off,
    // or prefers-reduced-motion. Horizontally scrollable, scroll-snap,
    // hidden scrollbar — every pill stays reachable without relying on
    // motion.
    return (
      <section className="relative w-full overflow-hidden">
        <MarqueeHeading heading={heading} subheading={subheading} align={sectionAlign} />
        <div
          className="mx-auto flex max-w-[1280px] gap-[var(--ps-space-3)] overflow-x-auto snap-x snap-mandatory scrollbar-none pb-[var(--ps-space-1)]"
          role="list"
        >
          {items.map((item, i) => (
            <div key={i} className="snap-start">
              <Pill item={item} IconComponent={icons[i]} ariaHidden={false} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="w-full overflow-hidden">
      <MarqueeHeading heading={heading} subheading={subheading} align={sectionAlign} />
      <div className="relative mx-auto max-w-[1280px]">
        <div
          ref={viewportRef}
          tabIndex={0}
          role="region"
          aria-label={heading || "Services"}
          className="showcase-marquee-fade overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onTouchStart={() => setIsTouched(true)}
          onTouchEnd={() => setIsTouched(false)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          <div className="flex w-max">
            <Strip
              innerRef={stripRef}
              items={items}
              icons={icons}
              copies={copies}
              ariaHiddenAll={false}
              className={durationReady ? "showcase-marquee-track" : ""}
              style={durationReady ? { animationDuration: `${duration}s`, animationPlayState: isRunning ? "running" : "paused" } : undefined}
            />
            <Strip items={items} icons={icons} copies={copies} ariaHiddenAll />
          </div>
        </div>
        <div ref={probeRef} aria-hidden="true" className="pointer-events-none absolute h-0 w-max overflow-hidden opacity-0">
          <Strip items={items} icons={icons} copies={1} ariaHiddenAll />
        </div>
      </div>
    </section>
  );
}
