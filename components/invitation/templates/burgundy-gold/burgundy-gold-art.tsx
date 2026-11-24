"use client";

/**
 * components/invitation/templates/burgundy-gold/burgundy-gold-art.tsx
 *
 * The ONLY artwork module for Burgundy Gold. Most pieces below are code-only
 * (CSS/SVG) and sit behind this one file so a supplied image or hand-tuned
 * SVG can replace them by editing nothing else.
 *
 * Swap contract: each export accepts `size` (rendered box, px or CSS length)
 * and `className`, plus an optional `tone` colour. Keep those props and the
 * layout call sites keep working when a real asset lands.
 *
 * Exception: the gift box (GiftBoxArt) is reference-matched art. It is built
 * from public/images/gift-box-reference.png, chroma-keyed and cropped into
 * independent transparent layers under
 * public/images/invitations/burgundy-gold/gift-box/ (lid+bow, box body, each
 * floating gift, both sparkles, the confetti cluster) — see scratch/ for the
 * extraction script. Each layer is positioned by percentage over a shared
 * stage so lid/body/bow/gifts/sparkles can animate independently.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties, ReactNode } from "react";

const GOLD = "#cdb073";
const GOLD_BRIGHT = "#e7cf98";
const BURGUNDY = "#4a0d1c";
const BURGUNDY_DEEP = "#2b0710";

export interface BurgundyArtProps {
  /** Rendered box size in px (or any CSS length). Replaced assets must match it. */
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  /** Stroke/fill colour, so the piece stays swappable for a fixed-colour asset. */
  tone?: string;
}

function boxSize(size: number | string | undefined, fallback: number) {
  const value = size ?? fallback;
  return typeof value === "number" ? `${value}px` : value;
}

/**
 * Page backdrop: dark mottled burgundy with a darker vignette toward the edges.
 * CSS gradients only and deliberately no pinstripes — the reference is a
 * cloudy, uneven dye, not a striped paper.
 */
export function PageBackdrop({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const layers = [
    // Vignette sits on top: transparent through the middle, darker at the edges.
    `radial-gradient(ellipse 105% 78% at 50% 44%, rgba(12,3,6,0) 34%, rgba(12,3,6,0.34) 62%, rgba(12,3,6,0.62) 84%, #120309 100%)`,
    // Base shading: lighter at the top, settling into the deep burgundy.
    `radial-gradient(ellipse 130% 90% at 50% 0%, #5e1626 0%, ${BURGUNDY} 32%, #390813 64%, ${BURGUNDY_DEEP} 100%)`,
    // Mottling: irregular dye clouds, no repeating pattern.
    `radial-gradient(circle at 16% 20%, rgba(126,34,55,0.55) 0%, rgba(126,34,55,0) 44%)`,
    `radial-gradient(circle at 84% 12%, rgba(96,24,42,0.6) 0%, rgba(96,24,42,0) 40%)`,
    `radial-gradient(circle at 71% 54%, rgba(138,40,60,0.32) 0%, rgba(138,40,60,0) 38%)`,
    `radial-gradient(circle at 24% 72%, rgba(88,19,35,0.52) 0%, rgba(88,19,35,0) 46%)`,
    `radial-gradient(circle at 54% 88%, rgba(112,28,46,0.34) 0%, rgba(112,28,46,0) 42%)`,
  ];

  // The gradient layers above are tuned for roughly one screen's worth of
  // height (the hero). `inset-0` stretches this div to the full scrollable
  // page though, and "cover" sizing a radial vignette over a page several
  // screens tall makes every section further down read visibly darker than
  // the one above it — on a page this long the gift box section, being
  // last, looked distinctly darker than Day Programme above it. Capping the
  // box to a fixed pixel height (not vh/svh — see the "no viewport-height
  // trap" test) and fading its own opacity out over the last stretch lets
  // the root page's flat BURGUNDY_DEEP background (set in
  // BurgundyGoldPageTemplate.tsx) take over seamlessly, so every section
  // below the hero shares the exact same flat colour.
  const capPx = 1200;
  const maskFade = "linear-gradient(to bottom, #000 0%, #000 82%, transparent 100%)";

  return (
    <div
      aria-hidden="true"
      data-burgundy-backdrop="true"
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${className ?? ""}`}
      style={{
        backgroundColor: BURGUNDY_DEEP,
        backgroundImage: layers.join(", "),
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
        backgroundPosition: "center",
        height: capPx,
        maskImage: maskFade,
        WebkitMaskImage: maskFade,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function FlourishMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 260 44"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.1"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 22h62c12 0 18-7 28-7 8 0 13 4 18 7" />
      <path d="M254 22h-62c-12 0-18-7-28-7-8 0-13 4-18 7" />
      <path d="M78 22c10-9 21-14 33-14 8 0 13 4 19 14-6 10-11 14-19 14-12 0-23-5-33-14Z" />
      <path d="M182 22c-10-9-21-14-33-14-8 0-13 4-19 14 6 10 11 14 19 14 12 0 23-5 33-14Z" />
      <path d="M18 15c8-6 16-8 24-6M18 29c8 6 16 8 24 6M242 15c-8-6-16-8-24-6M242 29c-8 6-16 8-24 6" />
      <path d="M95 22c4-5 9-8 15-8M165 22c-4-5-9-8-15-8" />
      <circle cx="130" cy="22" r="2.4" fill="currentColor" stroke="none" />
      <path d="M111 11c3-4 7-6 11-6M149 11c-3-4-7-6-11-6M111 33c3 4 7 6 11 6M149 33c-3 4-7 6-11 6" />
    </svg>
  );
}

/** Top flourish above the hero eyebrow. `size` is the rendered width. */
export function TopFlourish(): null {
  // Intentionally empty: no decorative ornament is rendered until artwork is
  // supplied. The export is kept so call sites and the swap contract stay
  // stable; it renders nothing.
  return null;
}

/** Corner ornament; `corner` flips it so one drawing serves all four corners. */
export function PanelCorner(): null {
  // Intentionally empty: no decorative ornament is rendered until artwork is
  // supplied. The export is kept so call sites and the swap contract stay
  // stable; it renders nothing.
  return null;
}

/** Hairline rule with a centred diamond. `size` is the rendered width. */
export function SectionDivider(): null {
  // Intentionally empty: no decorative ornament is rendered until artwork is
  // supplied. The export is kept so call sites and the swap contract stay
  // stable; it renders nothing.
  return null;
}

/**
 * Gift box scene, built from the real reference artwork (see the file header)
 * rather than drawn shapes. Idle: the box bobs, the floating gifts drift at
 * staggered speeds, the sparkles twinkle. On activation (~1.3s, transform
 * and opacity only): a brief squash-and-rock anticipation, then the lid
 * hinges straight up off its back edge (tilting back, drifting slightly to
 * one side — never flying off or fading), a gold glow rises through the
 * seam it exposes, the floating gifts shoot up and settle, and sparkles
 * burst outward — then the caller's `onActivate` fires (opening the shared
 * RSVP dialog). `revealed` keeps the box in its opened pose for as long as
 * the caller's dialog stays open, and the lid eases smoothly back down onto
 * the body the moment it is told the dialog closed — so it can be replayed.
 * prefers-reduced-motion skips the animation and calls `onActivate`
 * immediately.
 */
const GIFT_BASE = "/images/invitations/burgundy-gold/gift-box";
const STAGE_W = 274;
const STAGE_H = 246;

interface StageBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

function stagePct({ left, top, width, height }: StageBox): CSSProperties {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
}

// Lid bottom edge and body top edge share the same seam (42.68%) — no gap,
// no overlap, so the closed box reads as one solid piece.
const LID_BOW: StageBox = { left: 10.58, top: 17.07, width: 78.83, height: 25.61 };
const BOX_BODY: StageBox = { left: 10.58, top: 42.68, width: 78.83, height: 57.32 };

const FLOATING_GIFTS: Array<StageBox & { key: string; src: string; duration: number; delay: number }> = [
  { key: "green", src: `${GIFT_BASE}/gift-green.png`, left: 0, top: 0, width: 22.26, height: 22.76, duration: 5.2, delay: 0 },
  { key: "navy", src: `${GIFT_BASE}/gift-navy.png`, left: 74.45, top: 4.88, width: 23.36, height: 23.98, duration: 4.6, delay: 0.6 },
  { key: "teal", src: `${GIFT_BASE}/gift-teal.png`, left: 6.93, top: 45.53, width: 13.87, height: 14.63, duration: 5.8, delay: 1.1 },
  { key: "mixed", src: `${GIFT_BASE}/gift-mixed.png`, left: 83.58, top: 55.69, width: 9.49, height: 11.38, duration: 4.9, delay: 0.3 },
  { key: "pink", src: `${GIFT_BASE}/gift-pink-small.png`, left: 27.37, top: 68.70, width: 9.12, height: 11.38, duration: 5.4, delay: 1.6 },
  { key: "love", src: `${GIFT_BASE}/gift-love.png`, left: 11.31, top: 76.02, width: 16.42, height: 20.73, duration: 5.0, delay: 0.9 },
  { key: "red", src: `${GIFT_BASE}/gift-red.png`, left: 56.93, top: 76.02, width: 17.52, height: 16.67, duration: 5.6, delay: 0.2 },
];

const SPARKLES: Array<StageBox & { key: string; src: string; delay: number }> = [
  { key: "tl", src: `${GIFT_BASE}/sparkle-tl.png`, left: 18.98, top: 6.50, width: 12.41, height: 14.23, delay: 0 },
  { key: "tr", src: `${GIFT_BASE}/sparkle-tr.png`, left: 91.24, top: 30.49, width: 8.76, height: 9.35, delay: 1.3 },
];

const CONFETTI: StageBox = { left: 31.02, top: 0.81, width: 46.72, height: 16.26 };

/** Deterministic burst directions (no Math.random — keeps SSR/client markup identical). */
const BURST_SPARKS = [
  { key: "b1", dx: -34, dy: -40, delay: 0 },
  { key: "b2", dx: 32, dy: -44, delay: 60 },
  { key: "b3", dx: -46, dy: -10, delay: 120 },
  { key: "b4", dx: 44, dy: -6, delay: 40 },
  { key: "b5", dx: -12, dy: -50, delay: 150 },
  { key: "b6", dx: 14, dy: -48, delay: 90 },
] as const;

// Choreography (~1.2s, transform/opacity only):
//   0-220ms    anticipation — the whole box squashes ~3% and rocks (the bow
//              isn't a separable layer, so the "wiggle" reads on the unit)
//   220-860ms  the lid lifts straight up ~27% of the full box height, tilts
//              back around its top (hinge/back) edge, and drifts a touch to
//              one side — a transition (not a one-shot animation) so closing
//              reverses it smoothly back onto the body
//   380-1030ms a warm glow rises from the seam the lid exposed
//   420-1040ms the floating gifts shoot up out of it and settle back down
//   440-1150ms sparkles burst outward, staggered
// `handleActivate` holds this open pose for ~1.3s before calling onActivate.
const GIFT_SCENE_CSS = `
@keyframes bgg-unit-bob { 0%,100% { transform: translateY(0) rotate(0deg) } 50% { transform: translateY(-4px) rotate(0deg) } }
@keyframes bgg-anticipate {
  0% { transform: translateY(0) scaleY(1) scaleX(1) rotate(0deg) }
  35% { transform: translateY(1%) scaleY(.97) scaleX(1.015) rotate(-1.4deg) }
  65% { transform: translateY(0.3%) scaleY(.985) scaleX(1.008) rotate(1.2deg) }
  100% { transform: translateY(0) scaleY(1) scaleX(1) rotate(0deg) }
}
@keyframes bgg-gift-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
@keyframes bgg-gift-shoot {
  0% { transform: translateY(0) scale(1) }
  45% { transform: translateY(-38%) scale(1.22) }
  75% { transform: translateY(-9%) scale(1.04) }
  100% { transform: translateY(0) scale(1) }
}
@keyframes bgg-twinkle { 0%,100% { opacity: .55; transform: scale(.85) } 50% { opacity: 1; transform: scale(1.1) } }
@keyframes bgg-confetti-drift { 0%,100% { transform: translateY(0) rotate(0deg) } 50% { transform: translateY(-5px) rotate(4deg) } }
@keyframes bgg-spark-burst { 0% { opacity: 0; transform: translate(0,0) scale(.5) } 30% { opacity: 1 } 100% { opacity: 0; transform: translate(var(--dx,0px), var(--dy,0px)) scale(1.3) } }
@keyframes bgg-beam-rise {
  0% { opacity: 0; transform: scaleY(.35) translateY(12%) }
  55% { opacity: 1; transform: scaleY(1) translateY(0) }
  100% { opacity: 0; transform: scaleY(1.2) translateY(-14%) }
}

.bgg-unit { animation: bgg-unit-bob 4.6s ease-in-out infinite; transform-origin: 50% 85% }
button[data-gift-open="true"] .bgg-unit { animation: bgg-unit-bob 4.6s ease-in-out infinite, bgg-anticipate 220ms ease-out }

.bgg-gift-wrap { animation: bgg-gift-float 5s ease-in-out infinite }
.bgg-gift-pop { display: block; transform-origin: 50% 70% }
button[data-gift-open="true"] .bgg-gift-pop { animation: bgg-gift-shoot 620ms cubic-bezier(.3,.7,.35,1.45) 420ms both }

.bgg-sparkle { animation: bgg-twinkle 2.6s ease-in-out infinite }
.bgg-confetti { animation: bgg-confetti-drift 6s ease-in-out infinite }
.bgg-spark-burst-path { animation: bgg-spark-burst 650ms ease-out forwards }

.bgg-lidbow {
  transform-origin: 50% 6%;
  transition: transform 640ms cubic-bezier(.22,1.5,.46,1);
  transition-delay: 0s;
}
button[data-gift-open="true"] .bgg-lidbow {
  transform: translateY(-87%) translateX(8%) rotate(-10deg);
  transition-delay: 220ms;
}

.bgg-glow { opacity: 0 }
button[data-gift-open="true"] .bgg-glow { animation: bgg-beam-rise 650ms ease-out 380ms both }

@media (prefers-reduced-motion: reduce) {
  .bgg-unit, .bgg-gift-wrap, .bgg-gift-pop, .bgg-sparkle, .bgg-confetti, .bgg-spark-burst-path, .bgg-glow { animation: none !important }
  button[data-gift-open="true"] .bgg-unit { animation: bgg-unit-bob 4.6s ease-in-out infinite !important }
  .bgg-lidbow { transition: opacity 320ms ease !important; transform: none !important; transition-delay: 0s !important }
  button[data-gift-open="true"] .bgg-lidbow { opacity: .9 }
  .bgg-glow { opacity: 0 !important }
}
`;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Gift box. A real <button> so keyboard (Enter/Space) and screen-reader use
 * come for free; the drawing carries no text — the accessible name arrives
 * via `label`. Tapping it (or the caller's own CTA, which should call the
 * same handler) plays the open sequence once and hands off to `onActivate`.
 */
export function GiftBoxArt({
  size = 240,
  className,
  style,
  label,
  actionLabel,
  message,
  revealed,
  onActivate,
}: BurgundyArtProps & {
  /** Accessible name for the button. */
  label: string;
  /** "CONFIRM PRESENCE" button text; tapping it plays the same open sequence as the box. */
  actionLabel: string;
  /** Copy shown under the CTA, e.g. "Your presence would be the greatest gift!". */
  message: string;
  /** True while the caller's own RSVP dialog is open; holds the opened pose. */
  revealed: boolean;
  /** Called ~1s after activation (immediately under reduced motion). */
  onActivate: () => void;
}) {
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const handleActivate = useCallback(() => {
    if (playing) return;
    if (prefersReducedMotion()) {
      onActivate();
      return;
    }
    setPlaying(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setPlaying(false);
      onActivate();
    }, 1300);
  }, [playing, onActivate]);

  const open = playing || revealed;

  return (
    <span className={`inline-flex flex-col items-center ${className ?? ""}`} style={style}>
      <style>{GIFT_SCENE_CSS}</style>
      <button
        type="button"
        onClick={handleActivate}
        aria-label={label}
        aria-pressed={open}
        data-burgundy-gift-open="true"
        data-gift-open={open ? "true" : "false"}
        className="relative block rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        style={{
          width: boxSize(size, 240),
          aspectRatio: `${STAGE_W} / ${STAGE_H}`,
          position: "relative",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          outlineColor: GOLD_BRIGHT,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${GIFT_BASE}/confetti.png`} alt="" aria-hidden="true" className="bgg-confetti pointer-events-none absolute" style={stagePct(CONFETTI)} />

        <span aria-hidden="true" className="bgg-unit absolute inset-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${GIFT_BASE}/box-body.png`} alt="" className="absolute" style={stagePct(BOX_BODY)} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${GIFT_BASE}/lid-bow.png`} alt="" className="bgg-lidbow absolute" style={stagePct(LID_BOW)} />
        </span>

        {/* the glow "rises" from the seam the lid exposes */}
        <span
          aria-hidden="true"
          className="bgg-glow pointer-events-none absolute"
          style={{
            left: "30%",
            top: "16%",
            width: "40%",
            height: "60%",
            background: `radial-gradient(ellipse 55% 100% at 50% 55%, ${GOLD_BRIGHT}dd 0%, ${GOLD_BRIGHT}66 40%, transparent 74%)`,
          }}
        />

        {FLOATING_GIFTS.map((gift) => (
          <span
            key={gift.key}
            aria-hidden="true"
            className="bgg-gift-wrap absolute"
            style={{ ...stagePct(gift), animationDuration: `${gift.duration}s`, animationDelay: `${gift.delay}s` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={gift.src} alt="" className="bgg-gift-pop h-full w-full" />
          </span>
        ))}

        {SPARKLES.map((spark) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={spark.key}
            src={spark.src}
            alt=""
            aria-hidden="true"
            className="bgg-sparkle pointer-events-none absolute"
            style={{ ...stagePct(spark), animationDelay: `${spark.delay}s` }}
          />
        ))}

        {playing ? (
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <g transform="translate(50 40)">
              {BURST_SPARKS.map((spark) => (
                <path
                  key={spark.key}
                  className="bgg-spark-burst-path"
                  d="M0 -4l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z"
                  fill={GOLD_BRIGHT}
                  style={{ "--dx": `${spark.dx}px`, "--dy": `${spark.dy}px`, animationDelay: `${440 + spark.delay}ms` } as CSSProperties}
                />
              ))}
            </g>
          </svg>
        ) : null}
      </button>

      <button
        type="button"
        onClick={handleActivate}
        data-burgundy-gift-rsvp="true"
        className="mt-6 min-h-11 rounded-full px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.08em] transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4"
        style={{ backgroundColor: GOLD, color: BURGUNDY_DEEP, outlineColor: GOLD_BRIGHT }}
      >
        {actionLabel}
      </button>
      <p className="mx-auto mt-4 max-w-xs text-base leading-6" style={{ color: "#f6ead0dd" }}>
        {message}
      </p>
    </span>
  );
}

/**
 * Round gold face for the floating music control. `playing` swaps the glyph so
 * the same face covers both states without a separate asset.
 */
export function MusicButtonFace({
  size = 56,
  playing = false,
  className,
  style,
  tone = "#3a0d18",
}: BurgundyArtProps & { playing?: boolean }) {
  return (
    <span
      aria-hidden="true"
      data-burgundy-art="music-button-face"
      data-burgundy-art-music-state={playing ? "playing" : "idle"}
      className={`relative inline-flex items-center justify-center rounded-full ${className ?? ""}`}
      style={{
        width: boxSize(size, 56),
        height: boxSize(size, 56),
        backgroundImage: `radial-gradient(circle at 32% 26%, #f7e8c4 0%, ${GOLD_BRIGHT} 26%, ${GOLD} 58%, #a5864a 86%, #8a6d38 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,248,224,0.75), 0 2px 10px rgba(0,0,0,0.35)`,
        color: tone,
        ...style,
      }}
    >
      <svg viewBox="0 0 24 24" className="size-[46%]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {playing ? (
          <>
            <path d="M9 6v12M15 6v12" strokeWidth="2.4" />
          </>
        ) : (
          <>
            <path d="M9 17V7l9-2v10" />
            <circle cx="6.5" cy="17.5" r="2.5" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="15.5" r="2.5" fill="currentColor" stroke="none" />
          </>
        )}
      </svg>
    </span>
  );
}

/** Solid heart used as the calendar marker on the event day. */
export function HeartMark({ size = 20, className, style, tone = BURGUNDY_DEEP }: BurgundyArtProps) {
  return (
    <span
      aria-hidden="true"
      data-burgundy-art="heart-mark"
      className={`inline-block ${className ?? ""}`}
      style={{ width: boxSize(size, 20), height: boxSize(size, 20), color: tone, ...style }}
    >
      <svg viewBox="0 0 24 24" className="h-full w-full" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9Z" />
      </svg>
    </span>
  );
}

export interface GalleryPhoto {
  url: string;
  alt: string;
  width?: number | null;
  height?: number | null;
}

const GALLERY_FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function galleryScrollLockTarget(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>('[data-testid="invitation-preview"]') ?? document.body;
}

/**
 * Unified full-screen photo viewer shared by the Burgundy Gold photo gallery
 * and the inline guest-memories preview. One fixed-size stage (object-contain)
 * so every photo is displayed at identical dimensions regardless of aspect
 * ratio. Escapes, arrow keys, swipe, previous/next arrows, a thumbnail strip
 * with the current thumbnail outlined, a visible close button, a counter,
 * focus trapping, focus return to the opening tile, and body scroll lock on
 * open/release on close and unmount.
 */
export function BurgundyGoldGalleryViewer({
  open,
  photos,
  index: initialIndex,
  onClose,
  labels,
  returnTo,
}: {
  open: boolean;
  photos: GalleryPhoto[];
  index: number;
  onClose: () => void;
  labels: { close: string; previous: string; next: string; viewerLabel: string };
  /** Element to return focus to when the viewer closes. */
  returnTo: HTMLElement | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [touchStart, setTouchStart] = useState<{ x: number } | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const total = photos.length;
  const safeIndex = Math.max(0, Math.min(total - 1, currentIndex));
  const current = total > 0 ? photos[safeIndex] : undefined;

  const counter = `${safeIndex + 1} / ${total}`;

  const goPrevious = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, [total]);
  const goNext = useCallback(() => {
    if (total === 0) return;
    setCurrentIndex((prev) => Math.min(total - 1, prev + 1));
  }, [total]);
  const goTo = useCallback((n: number) => setCurrentIndex(() => Math.max(0, Math.min(total - 1, n))), [total]);

  // Scroll lock while open, released on close and unmount.
  useEffect(() => {
    if (!open) return;
    const target = galleryScrollLockTarget();
    if (!target) return;
    const previous = target.style.overflow;
    target.style.overflow = "hidden";
    return () => {
      target.style.overflow = previous;
    };
  }, [open]);

  // Focus returns to the opening tile when closed.
  useEffect(() => {
    if (open) return;
    if (returnTo && typeof returnTo.focus === "function") {
      window.setTimeout(() => returnTo.focus(), 0);
    }
  }, [open, returnTo]);

  // The stage always opens at the index the parent passed (the tapped tile).
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  // Keyboard: Escape closes, arrows navigate.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, goPrevious, goNext]);

  // Focus trap: Tab cycles within the viewer.
  useEffect(() => {
    if (!open) return;
    const root = containerRef.current;
    if (!root) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(GALLERY_FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1
      );
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  const onTouchStart = (event: React.TouchEvent) => {
    setTouchStart({ x: event.touches[0].clientX });
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    if (!touchStart) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    setTouchStart(null);
    if (Math.abs(dx) > 40) {
      if (dx < 0) goNext(); else goPrevious();
    }
  };

  const handleBackdropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const handleImageError = () => setImageFailed(true);

  if (!open) return null;

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label={labels.viewerLabel}
      onPointerDown={handleBackdropPointerDown}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
      style={{ backgroundColor: "rgba(18,3,9,0.92)" }}
    >
      <div className="relative flex flex-col h-full w-full items-center justify-center max-w-[min(28rem,calc(100vw-1.5rem))]">
        <div className="flex w-full items-center justify-between px-3 py-2">
          <span className="uppercase tracking-[0.14em]" style={{ color: "#f6ead0", fontSize: 13 }}>
            {counter}
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className="grid size-9 place-items-center rounded-full text-2xl leading-none"
            style={{ color: "#e7cf98" }}
          >
            ×
          </button>
        </div>
        <div
          ref={stageRef}
          className="mx-auto mt-2 flex items-center justify-center rounded-sm border overflow-hidden"
          style={{
            width: "min(24rem,calc(100vw-1.5rem))",
            height: "40svh",
            borderColor: "#cdb07366",
            backgroundColor: "#2b0710",
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {current ? (
            <img
              src={current.url}
              alt={current.alt?.trim() || ""}
              loading="lazy"
              decoding="async"
              onError={handleImageError}
              className="max-h-full max-w-full object-contain block"
            />
          ) : null}
          {imageFailed ? (
            <div className="flex items-center justify-center h-full w-full" style={{ color: "#e7cf98" }}>
              <span className="uppercase tracking-[0.1em]" style={{ color: "#e7cf98", fontSize: 13 }}>Photo unavailable</span>
            </div>
          ) : null}
          {total > 1 ? (
            <>
              <button
                type="button"
                aria-label={labels.previous}
                onClick={goPrevious}
                disabled={safeIndex === 0}
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 disabled:opacity-40"
              >
                ‹
              </button>
              <button
                type="button"
                aria-label={labels.next}
                onClick={goNext}
                disabled={safeIndex >= total - 1}
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/30 text-white hover:bg-black/50 disabled:opacity-40"
              >
                ›
              </button>
            </>
          ) : null}
        </div>
        <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-2">
          {photos.map((photo, photoIndex) => (
            <button
              key={photo.url}
              type="button"
              aria-label={`${labels.previous} ${photoIndex + 1}`}
              onClick={() => goTo(photoIndex)}
              className="shrink-0 size-9 rounded-sm overflow-hidden border object-cover"
              style={{
                borderColor: photoIndex === safeIndex ? "#e7cf98" : "transparent",
              }}
            >
              <img
                src={photo.url}
                alt=""
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
                onError={() => {}}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}