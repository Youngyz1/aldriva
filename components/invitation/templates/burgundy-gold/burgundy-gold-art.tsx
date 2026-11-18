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
@keyframes bgg-bow-wiggle { 0%,100% { transform: rotate(0) } 25% { transform: rotate(5deg) } 75% { transform: rotate(-5deg) } }
@keyframes bgg-shine-sweep { 0% { transform: translateX(-140%) } 60% { transform: translateX(140%) } 100% { transform: translateX(140%) } }
@keyframes bgg-spark-twinkle { 0%,100% { opacity: .3; transform: scale(.8) } 50% { opacity: 1; transform: scale(1.2) } }
@keyframes bgg-lid-lift { to { transform: translateY(-10px) rotate(-14deg) } }
@keyframes bgg-burst { 0% { opacity: 0; transform: translateY(6px) scale(.6) } 35% { opacity: 1 } 100% { opacity: 0; transform: translateY(-30px) scale(1.3) } }
.bgg-float { animation: bgg-float 4.6s ease-in-out infinite }
.bgg-bow { animation: bgg-bow-wiggle 3s ease-in-out infinite }
.bgg-shine { animation: bgg-shine-sweep 3s linear infinite }
.bgg-spark { animation: bgg-spark-twinkle 3.2s ease-in-out infinite }
.bgg-lid { transform-origin: 50% 0%; transition: transform 460ms cubic-bezier(.3,.9,.3,1.15) }
.bgg-box[data-gift-open="true"] .bgg-lid { transform: translate(-6px, -10px) rotate(-14deg) }
.bgg-box[data-gift-open="true"] .bgg-spark { animation: bgg-burst 700ms ease-out forwards }
@media (prefers-reduced-motion: reduce) {
  .bgg-float, .bgg-spark { animation: none }
  .bgg-bow, .bgg-shine { animation: none }
  .bgg-lid { transition: none }
  .bgg-box[data-gift-open="true"] .bgg-lid { transform: none }
  .bgg-box[data-gift-open="true"] .bgg-spark { animation: none; opacity: 0 }
}
`;

/**
 * Gift box. A real <button> so keyboard and screen-reader use come for free;
 * the drawing carries no text — the accessible name arrives via `label`.
 * `open` lifts and tilts the lid and lets the sparkles burst. Roughly
 * 220–260 px wide on mobile. All artwork is filled CSS/SVG shapes, no assets.
 */
export function GiftBoxArt({
  size = 220,
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
          width: boxSize(size, 220),
          height: boxSize(size, 220),
          color: tone,
          outlineColor: GOLD_BRIGHT,
          boxShadow: `0 10px 30px rgba(0,0,0,0.45)`,
        }}
      >
        <span className="bgg-float block h-full w-full">
          <svg
            viewBox="0 0 100 100"
            className="h-full w-full"
            fill="none"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <radialGradient id="bgg-shine" cx="30%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
                <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* soft shadow beneath the box */}
            <ellipse cx="50" cy="86" rx="26" ry="7" fill="#000000" opacity="0.30" />
            {/* burgundy box body */}
            <rect x="20" y="46" width="60" height="40" fill="#4a0d1c" />
            <rect x="20" y="54" width="60" height="2" fill="#2b0710" opacity="0.7" />
            {/* lid */}
            <g className="bgg-lid">
              <rect x="17" y="40" width="66" height="9" fill="#2b0710" />
              <rect x="17" y="46" width="66" height="2" fill="#4a0d1c" opacity="0.5" />
            </g>
            {/* gold ribbon cross */}
            <rect x="47" y="46" width="6" height="40" fill="#cdb073" className="bgg-ribbon" />
            <rect x="20" y="61" width="60" height="6" fill="#cdb073" className="bgg-ribbon" />
            {/* gradient shine sweeping across the ribbon */}
            <rect x="20" y="61" width="60" height="6" fill="url(#bgg-shine)" className="bgg-shine" />
            {/* gold bow */}
            <g className="bgg-bow" fill="#cdb073">
              <ellipse cx="32" cy="55" rx="6" ry="9" transform="rotate(-22 32 55)" />
              <ellipse cx="68" cy="55" rx="6" ry="9" transform="rotate(22 68 55)" />
              <rect x="46" y="51" width="8" height="14" />
              <rect x="43" y="63" width="4" height="10" />
              <rect x="53" y="63" width="4" height="10" />
            </g>
            {/* twinkling gold sparkles */}
            <g className="bgg-spark" fill="#e7cf98">
              <path d="M24 22l1 2.6 1.6-1 -2.1 0.6 -1-2.6 -1.6 1z" />
              <path d="M76 28l1 2.6 1.6-1 -2.1 0.6 -1-2.6 -1.6 1z" />
              <path d="M50 16l1 2.6 1.6-1 -2.1 0.6 -1-2.6 -1.6 1z" />
              <path d="M34 62l1 2.6 1.6-1 -2.1 0.6 -1-2.6 -1.6 1z" />
              <path d="M66 62l1 2.6 1.6-1 -2.1 0.6 -1-2.6 -1.6 1z" />
            </g>
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
          <span className="text-[0.66rem] uppercase tracking-[0.14em]" style={{ color: "#f6ead0" }}>
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
              <span className="text-[0.6rem] uppercase tracking-[0.1em]">Photo unavailable</span>
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