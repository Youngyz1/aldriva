"use client";

import type { RefObject } from "react";
import { cn } from "@/lib/utils";
import { calculatePreviewFitScale } from "@/lib/invitation-preview-channel";

export interface WebsiteDevicePreviewFrameProps {
  mode: "mobile" | "desktop";
  containerWidth: number;
  containerHeight: number;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  iframeSrc: string;
  siteTitle: string;
}

export function WebsiteDevicePreviewFrame({
  mode,
  containerWidth,
  containerHeight,
  iframeRef,
  iframeSrc,
  siteTitle,
}: WebsiteDevicePreviewFrameProps) {
  const mobile = mode === "mobile";
  const viewportWidth = mobile ? 390 : 1440;
  const viewportHeight = mobile ? 844 : 820;
  const frameWidth = mobile ? 414 : 1440;
  const frameHeight = mobile ? 868 : 860;
  const scale = calculatePreviewFitScale({
    containerWidth,
    containerHeight,
    frameWidth,
    frameHeight,
    paddingX: 16,
    paddingY: 16,
  });

  return (
    <div className="relative mx-auto shrink-0" style={{ width: Math.round(frameWidth * scale), height: Math.round(frameHeight * scale) }}>
      <div className={cn("absolute left-0 top-0 flex origin-top-left flex-col", mobile ? "rounded-[42px] border-[10px] border-zinc-900 bg-zinc-950 p-1 shadow-xl" : "overflow-hidden rounded-xl border border-zinc-300 bg-zinc-100 shadow-xl")} style={{ width: frameWidth, height: frameHeight, transform: `scale(${scale})` }}>
        {!mobile ? <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-200 px-4"><span className="h-2.5 w-2.5 rounded-full bg-zinc-300"/><span className="h-2.5 w-2.5 rounded-full bg-zinc-300"/><span className="h-2.5 w-2.5 rounded-full bg-zinc-300"/><div className="mx-auto w-2/3 truncate rounded-md border border-zinc-200 bg-white px-3 py-1 text-center text-[11px] text-zinc-500">aldriva.com/site/preview</div></div> : null}
        <div className={cn("relative overflow-hidden bg-white", mobile && "rounded-[30px]")} style={{ width: viewportWidth, height: viewportHeight }}>
          {mobile ? <><div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-3 z-20 h-6 w-24 -translate-x-1/2 rounded-full bg-zinc-950"/><div aria-hidden="true" className="pointer-events-none absolute bottom-2 left-1/2 z-20 h-1 w-28 -translate-x-1/2 rounded-full bg-zinc-900/30"/></> : null}
          <iframe ref={iframeRef} title={`${siteTitle} website preview`} src={iframeSrc} className="block h-full w-full border-0 bg-white" style={{ width: viewportWidth, height: viewportHeight }} sandbox="allow-scripts allow-same-origin" />
        </div>
      </div>
    </div>
  );
}
