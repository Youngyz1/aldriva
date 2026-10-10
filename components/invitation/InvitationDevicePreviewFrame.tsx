"use client";

/**
 * components/invitation/InvitationDevicePreviewFrame.tsx
 *
 * Device frame for the invitation builder live preview:
 * - Mobile mode: iPhone-style hardware frame drawn with pure CSS (rounded
 *   body ~48px radius, thin dark bezel, dynamic island, subtle side buttons).
 *   Screen content is exactly 390x844 logical px. No Safari chrome.
 * - Desktop mode: Plain browser frame (traffic light dots + address bar).
 * - Scales to fit available width and height (never exceeds 1.0).
 * - Wrapper takes scaled width/height so parent layout box shrinks accurately
 *   with zero empty space, zero horizontal overflow, and no sideways drag.
 * - Single persistent iframe element across mode transitions (no remount/reload).
 */

import React from "react";
import { cn } from "@/lib/utils";
import { calculatePreviewFitScale } from "@/lib/invitation-preview-channel";

export interface InvitationDevicePreviewFrameProps {
  mode: "mobile" | "desktop";
  containerWidth: number;
  containerHeight?: number;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  iframeSrc: string;
  title?: string;
  className?: string;
}

export function InvitationDevicePreviewFrame({
  mode,
  containerWidth,
  containerHeight,
  iframeRef,
  iframeSrc,
  title = "Live invitation preview",
  className,
}: InvitationDevicePreviewFrameProps) {
  const isMobile = mode === "mobile";

  // Screen content dimensions (logical viewport seen by iframe media queries)
  const contentWidth = isMobile ? 390 : 1440;
  const contentHeight = isMobile ? 844 : 820;

  // Frame outer dimensions (including chassis bezels / chrome)
  const frameWidth = isMobile ? 414 : 1440; // 390 + 24px bezel
  const frameHeight = isMobile ? 868 : 860; // 844 + 24px bezel vs 820 + 40px chrome

  // Fit scale: fits available width and height, never exceeds 1.0
  const scale = calculatePreviewFitScale({
    containerWidth,
    containerHeight,
    frameWidth,
    frameHeight,
    paddingX: 16,
    paddingY: 16,
  });

  const scaledWidth = Math.round(frameWidth * scale);
  const scaledHeight = Math.round(frameHeight * scale);

  return (
    <div
      data-testid="preview-device-wrapper"
      className={cn(
        "relative mx-auto shrink-0 select-none overflow-hidden transition-[width,height] duration-200 ease-out",
        className
      )}
      style={{
        width: scaledWidth,
        height: scaledHeight,
      }}
    >
      <div
        data-testid="preview-device-frame"
        style={{
          width: frameWidth,
          height: frameHeight,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
        className={cn(
          "origin-top-left transition-transform duration-200 ease-out flex flex-col",
          isMobile
            ? "relative rounded-[48px] border border-zinc-800 bg-zinc-950 p-[12px] shadow-2xl ring-1 ring-zinc-850 items-center"
            : "rounded-xl border border-zinc-300 bg-zinc-100 shadow-xl overflow-hidden"
        )}
      >
        {/* Mobile-only hardware accents: side buttons */}
        {isMobile && (
          <div aria-hidden="true" className="pointer-events-none">
            {/* Left buttons: mute switch, volume up, volume down */}
            <div className="absolute -left-[3px] top-[110px] h-6 w-[3px] rounded-l-xs bg-zinc-700" />
            <div className="absolute -left-[3px] top-[150px] h-12 w-[3px] rounded-l-xs bg-zinc-700" />
            <div className="absolute -left-[3px] top-[215px] h-12 w-[3px] rounded-l-xs bg-zinc-700" />
            {/* Right button: power / side key */}
            <div className="absolute -right-[3px] top-[165px] h-16 w-[3px] rounded-r-xs bg-zinc-700" />
          </div>
        )}

        {/* Desktop-only browser chrome */}
        {!isMobile && (
          <div className="flex h-10 w-full items-center gap-2 border-b border-zinc-200 bg-zinc-100 px-4 shrink-0">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <div className="h-3 w-3 rounded-full bg-zinc-300" />
              <div className="h-3 w-3 rounded-full bg-zinc-300" />
              <div className="h-3 w-3 rounded-full bg-zinc-300" />
            </div>
            <div className="mx-auto flex h-6 w-full max-w-sm items-center justify-center rounded-md border border-zinc-200 bg-white px-3 text-[11px] font-medium text-zinc-500 shadow-2xs">
              <span className="truncate">aldriva.com/invitation/preview</span>
            </div>
          </div>
        )}

        {/* Screen viewport container: single persistent iframe */}
        <div
          data-testid="preview-screen-viewport"
          className={cn(
            "relative overflow-hidden bg-white",
            isMobile ? "rounded-[38px]" : "rounded-none"
          )}
          style={{ width: contentWidth, height: contentHeight }}
        >
          {/* Mobile Dynamic Island & Home indicator overlay */}
          {isMobile && (
            <>
              <div
                data-testid="dynamic-island"
                aria-hidden="true"
                className="pointer-events-none absolute top-3 left-1/2 z-20 flex h-7 w-28 -translate-x-1/2 items-center justify-between rounded-full bg-zinc-950 px-3 shadow-xs"
              >
                <div className="h-3 w-3 rounded-full bg-zinc-900 ring-1 ring-zinc-800" />
                <div className="h-2 w-2 rounded-full bg-zinc-900" />
              </div>
              <div
                data-testid="home-indicator"
                aria-hidden="true"
                className="pointer-events-none absolute bottom-2 left-1/2 z-20 h-1 w-32 -translate-x-1/2 rounded-full bg-zinc-900/30 backdrop-blur-xs"
              />
            </>
          )}

          <iframe
            ref={iframeRef}
            data-testid="invitation-preview"
            title={title}
            src={iframeSrc}
            className="block h-full w-full border-0 bg-white"
            style={{ width: contentWidth, height: contentHeight }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
