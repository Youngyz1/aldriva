"use client";

/**
 * components/invitation/InvitationPreviewPanel.tsx
 *
 * Universal live preview panel for invitation pages across all dashboard surfaces:
 * - Builder live preview column (split view on desktop, Preview tab on mobile).
 * - Invitation Home / Overview page ("Back to preview" view mode).
 *
 * Features:
 * - Viewport mode toggle (Mobile 390px / Desktop 1440px).
 * - Optional locale toggle (EN / FR).
 * - Responsive container measurement (ResizeObserver + visibility re-measure).
 * - Pure-CSS device chassis (iPhone-style mobile frame with Dynamic Island & home
 *   indicator / Browser desktop chrome) via InvitationDevicePreviewFrame.
 * - Wrapper sized to scaled dimensions so the parent box shrinks without whitespace
 *   and with zero horizontal overflow or dragging.
 * - Strict overflow-x-hidden enforcement across all wrappers.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { InvitationDevicePreviewFrame } from "./InvitationDevicePreviewFrame";

export type PreviewViewport = 390 | 1440;

export interface InvitationPreviewPanelProps {
  iframeSrc: string;
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  title?: string;
  caption?: string;
  showLocaleToggle?: boolean;
  locale?: "en" | "fr";
  onLocaleChange?: (locale: "en" | "fr") => void;
  defaultViewport?: PreviewViewport;
  viewport?: PreviewViewport;
  onViewportChange?: (viewport: PreviewViewport) => void;
  className?: string;
  containerClassName?: string;
}

export function InvitationPreviewPanel({
  iframeSrc,
  iframeRef,
  title,
  caption,
  showLocaleToggle = false,
  locale = "en",
  onLocaleChange,
  defaultViewport = 390,
  viewport: controlledViewport,
  onViewportChange,
  className,
  containerClassName,
}: InvitationPreviewPanelProps) {
  const t = useTranslations("Events");
  const displayTitle = title ?? t("invitationPreviewLiveTitle");
  const [internalViewport, setInternalViewport] = useState<PreviewViewport>(defaultViewport);
  const currentViewport = controlledViewport !== undefined ? controlledViewport : internalViewport;

  const handleViewportChange = useCallback(
    (next: PreviewViewport) => {
      if (controlledViewport === undefined) {
        setInternalViewport(next);
      }
      onViewportChange?.(next);
    },
    [controlledViewport, onViewportChange]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerDimensions, setContainerDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  // Re-measure whenever viewport or visibility changes (e.g. mobile tab switches to visible)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      const w = rect.width || el.clientWidth;
      const h = el.clientHeight || rect.height;
      if (w > 0) {
        setContainerDimensions((prev) =>
          prev.width === w && prev.height === h ? prev : { width: w, height: h }
        );
      }
    };

    measure();
    const raf1 = requestAnimationFrame(measure);
    const timer = setTimeout(measure, 50);

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          if (cr.width > 0) {
            setContainerDimensions({ width: cr.width, height: cr.height });
          }
        }
      });
      ro.observe(el);
      return () => {
        cancelAnimationFrame(raf1);
        clearTimeout(timer);
        ro.disconnect();
      };
    } else {
      window.addEventListener("resize", measure);
      return () => {
        cancelAnimationFrame(raf1);
        clearTimeout(timer);
        window.removeEventListener("resize", measure);
      };
    }
  }, [currentViewport]);

  const fallbackWidth =
    typeof window !== "undefined" ? Math.min(window.innerWidth - 32, 600) : 390;
  const measuredWidth = containerDimensions.width || fallbackWidth;
  const measuredHeight = containerDimensions.height || 750;

  // Local ref if none provided from parent
  const localIframeRef = useRef<HTMLIFrameElement>(null);
  const activeIframeRef = iframeRef || localIframeRef;

  return (
    <div
      data-testid="invitation-preview-panel"
      className={cn(
        "w-full max-w-full overflow-x-hidden rounded-xl border border-zinc-200 bg-white shadow-xs",
        className
      )}
    >
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 px-3 py-2">
        <div
          className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
          role="group"
          aria-label={t("invitationPreviewMode")}
        >
          {([390, 1440] as PreviewViewport[]).map((w) => (
            <button
              key={w}
              type="button"
              aria-pressed={currentViewport === w}
              onClick={() => handleViewportChange(w)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-bold tabular-nums",
                currentViewport === w ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
              )}
            >
              {w === 390 ? t("invitationPreviewMobile") : t("invitationPreviewDesktop")}
            </button>
          ))}
        </div>

        {showLocaleToggle && onLocaleChange && (
          <div
            className="flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5"
            role="group"
            aria-label={t("invitationPreviewLanguage")}
          >
            {(["en", "fr"] as const).map((loc) => (
              <button
                key={loc}
                type="button"
                aria-pressed={locale === loc}
                onClick={() => onLocaleChange(loc)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-bold uppercase",
                  locale === loc ? "bg-white text-zinc-900 shadow-xs" : "text-zinc-500 hover:text-zinc-800"
                )}
              >
                {loc}
              </button>
            ))}
          </div>
        )}

        {caption && (
          <span className="ml-auto text-[11px] font-medium text-zinc-500">
            {caption}
          </span>
        )}
      </div>

      {/* Frame Container */}
      <div
        ref={containerRef}
        className={cn(
          "w-full max-w-full overflow-x-hidden bg-zinc-100 p-3 sm:p-4 flex flex-col items-center justify-start min-h-[500px]",
          containerClassName
        )}
      >
        <InvitationDevicePreviewFrame
          mode={currentViewport === 390 ? "mobile" : "desktop"}
          containerWidth={measuredWidth}
          containerHeight={measuredHeight}
          iframeRef={activeIframeRef}
          iframeSrc={iframeSrc}
          title={displayTitle}
        />
      </div>
    </div>
  );
}
