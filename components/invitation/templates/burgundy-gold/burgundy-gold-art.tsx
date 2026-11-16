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
export function TopFlourish({ size = 240, className, style, tone = GOLD }: BurgundyArtProps) {
  return (
    <span
      className={`inline-block ${className ?? ""}`}
      style={{ width: boxSize(size, 240), color: tone, ...style }}
      data-burgundy-art="top-flourish"
    >
      <FlourishMark className="h-auto w-full" />
    </span>
  );
}

/** Corner ornament; `corner` flips it so one drawing serves all four corners. */
export function PanelCorner({
  size = 32,
  corner = "top-left",
  className,
  style,
  tone = GOLD,
}: BurgundyArtProps & { corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right" }) {
  const flipX = corner === "top-right" || corner === "bottom-right";
  const flipY = corner === "bottom-left" || corner === "bottom-right";
  const transform = `scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`;

  return (
    <span
      aria-hidden="true"
      data-burgundy-art="panel-corner"
      data-burgundy-art-corner={corner}
      className={`pointer-events-none block ${className ?? ""}`}
      style={{ width: boxSize(size, 32), height: boxSize(size, 32), color: tone, transform, ...style }}
    >
      <svg
        viewBox="0 0 52 52"
        className="h-full w-full"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M2 2h32M2 2v32" />
        <path d="M9 9c10 0 17 4 22 11-7 1-13 5-17 12" />
        <path d="M9 9c0 10 4 17 11 22 1-7 5-13 12-17" />
        <path d="M16 16c5-1 9 1 12 5-4 2-7 5-8 10" />
        <circle cx="7" cy="7" r="2.2" fill="currentColor" stroke="none" />
        <path d="M31 4c-2 1-3 3-3 5M4 31c1-2 3-3 5-3" />
      </svg>
    </span>
  );
}

/** Hairline rule with a centred diamond. `size` is the rendered width. */
export function SectionDivider({ size = 176, className, style, tone = GOLD }: BurgundyArtProps) {
  return (
    <span
      aria-hidden="true"
      data-burgundy-art="section-divider"
      className={`flex items-center gap-2 ${className ?? ""}`}
      style={{ width: boxSize(size, 176), color: tone, ...style }}
    >
      <span className="h-px flex-1 bg-current opacity-45" />
      <span className="flex items-center gap-1">
        <span className="h-2 w-px bg-current opacity-60" />
        <svg viewBox="0 0 20 20" className="size-2.5 shrink-0" fill="currentColor" aria-hidden="true" focusable="false">
          <path d="M10 1.5 12 8l6.5 2-6.5 2-2 6.5-2-6.5L1.5 10 8 8 10 1.5Z" />
        </svg>
        <span className="h-2 w-px bg-current opacity-60" />
      </span>
      <span className="h-px flex-1 bg-current opacity-45" />
    </span>
  );
}

/**
 * Gift box artwork — PLACEHOLDER drawing for now (no bundled asset). The gift
 * section itself is not part of this stage; this export only reserves the
 * swappable slot so the reference's present can drop in later.
 */
export function GiftBoxArt({ size = 72, className, style, tone = GOLD_BRIGHT }: BurgundyArtProps) {
  return (
    <span
      aria-hidden="true"
      data-burgundy-art="gift-box-placeholder"
      className={`inline-block ${className ?? ""}`}
      style={{ width: boxSize(size, 72), height: boxSize(size, 72), color: tone, ...style }}
    >
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
        <path d="M10 26h44v28H10z" />
        <path d="M7 20h50v8H7z" />
        <path d="M32 20v34" />
        <path d="M32 20c-3-7-8-10-12-8-3 2-2 6 3 8M32 20c3-7 8-10 12-8 3 2 2 6-3 8" />
        <path d="M10 34h44" opacity="0.5" />
      </svg>
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
