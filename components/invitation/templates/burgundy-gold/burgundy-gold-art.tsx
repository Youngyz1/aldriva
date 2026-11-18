"use client";

/**
 * components/invitation/templates/burgundy-gold/burgundy-gold-art.tsx
 *
 * The ONLY artwork module for Burgundy Gold. Every drawn piece below is
 * code-only (CSS/SVG) and sits behind this one file so a supplied image or
 * hand-tuned SVG can replace it by editing nothing else.
 *
 * Swap contract: each export accepts `size` (rendered box, px or CSS length)
 * and `className`, plus an optional `tone` colour. Keep those props and the
 * layout call sites keep working when a real asset lands.
 *
 * No screenshot from `public/images/invitations/burgundy-gold/` is traced,
 * cropped or painted behind text.
 */

import type { CSSProperties, ReactNode } from "react";

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
 * Idle float / sparkle and the lift-and-tilt reveal. Kept here so the whole
 * gift animation is artwork-owned, and disabled wholesale under
 * prefers-reduced-motion (the caller then opens immediately).
 */
const GIFT_ANIMATION_CSS = `
@keyframes bgg-float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
@keyframes bgg-twinkle { 0%,100% { opacity: .2; transform: scale(.85) } 50% { opacity: .95; transform: scale(1.1) } }
@keyframes bgg-rise { 0% { opacity: 0; transform: translateY(4px) scale(.7) } 28% { opacity: 1 } 100% { opacity: 0; transform: translateY(-30px) scale(1.2) } }
.bgg-float { animation: bgg-float 4.6s ease-in-out infinite }
.bgg-spark { animation: bgg-twinkle 3.2s ease-in-out infinite }
.bgg-lid { transform-box: fill-box; transform-origin: 4% 96%; transition: transform 460ms cubic-bezier(.3,.9,.3,1.15) }
.bgg-box[data-gift-open="true"] .bgg-lid { transform: translate(-7px, -11px) rotate(-16deg) }
.bgg-box[data-gift-open="true"] .bgg-spark { animation: bgg-rise 900ms ease-out forwards }
@media (prefers-reduced-motion: reduce) {
  .bgg-float, .bgg-spark { animation: none }
  .bgg-lid { transition: none }
  .bgg-box[data-gift-open="true"] .bgg-lid { transform: none }
  .bgg-box[data-gift-open="true"] .bgg-spark { animation: none; opacity: 0 }
}
`;

/**
 * Gift box. A real <button> so keyboard and screen-reader use come for free;
 * the drawing carries no text — the accessible name arrives via `label`.
 * `open` lifts and tilts the lid and lets the sparkles rise.
 */
export function GiftBoxArt({
  size = 132,
  className,
  style,
  tone = GOLD_BRIGHT,
  open = false,
  onOpen,
  label,
  disabled = false,
}: BurgundyArtProps & {
  open?: boolean;
  onOpen?: () => void;
  /** Accessible name for the button; also used as a tooltip. */
  label?: string;
  disabled?: boolean;
}) {
  return (
    <span className={`inline-flex flex-col items-center ${className ?? ""}`} style={style}>
      <style>{GIFT_ANIMATION_CSS}</style>
      <button
        type="button"
        onClick={onOpen}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        data-burgundy-gift-open="true"
        data-gift-open={open ? "true" : "false"}
        className="bgg-box inline-flex items-center justify-center rounded-full transition-transform hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:cursor-default"
        style={{
          width: boxSize(size, 132),
          height: boxSize(size, 132),
          color: tone,
          outlineColor: GOLD_BRIGHT,
          backgroundImage: `radial-gradient(circle at 50% 42%, ${GOLD}1f 0%, transparent 68%)`,
        }}
      >
        <span className="bgg-float block h-full w-full">
          <svg
            viewBox="0 0 64 64"
            className="h-full w-full"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            {/* body */}
            <path d="M11 28h42v26H11z" />
            <path d="M11 36h42" opacity="0.45" />
            <path d="M32 28v26" opacity="0.75" />
            {/* lid */}
            <g className="bgg-lid">
              <path d="M7 21h50v8H7z" />
              <path d="M32 21c-3-7-8-10-12-8-3 2-2 6 3 8M32 21c3-7 8-10 12-8 3 2 2 6-3 8" />
            </g>
            {/* sparkles */}
            <path className="bgg-spark" d="M14 15l.9 2.3L17 18l-2.1.7L14 21l-.9-2.3L11 18l2.1-.7z" fill="currentColor" stroke="none" style={{ animationDelay: "0ms" }} />
            <path className="bgg-spark" d="M50 12l.8 2L53 15l-2.2.9L50 18l-.8-2.1L47 15l2.2-1z" fill="currentColor" stroke="none" style={{ animationDelay: "700ms" }} />
            <circle className="bgg-spark" cx="32" cy="10" r="1.6" fill="currentColor" stroke="none" style={{ animationDelay: "1300ms" }} />
          </svg>
        </span>
      </button>
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
