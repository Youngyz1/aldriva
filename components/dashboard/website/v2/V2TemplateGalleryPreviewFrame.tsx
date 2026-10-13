"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { calculatePreviewFitScale } from "@/lib/invitation-preview-channel";

const PREVIEW_WIDTH = 1440;
const PREVIEW_HEIGHT = 900;

export function V2TemplateGalleryPreviewFrame({ children }: { children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const rect = frame.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const scale = calculatePreviewFitScale({
    containerWidth: size.width,
    containerHeight: size.height,
    frameWidth: PREVIEW_WIDTH,
    frameHeight: PREVIEW_HEIGHT,
    paddingX: 0,
    paddingY: 0,
  });

  return (
    <div ref={frameRef} className="relative h-64 overflow-hidden border-b border-zinc-100 bg-zinc-50">
      <div
        inert
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 origin-top-left overflow-hidden bg-white"
        style={{ width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT, transform: `scale(${scale})` }}
      >
        {children}
      </div>
      <span className="pointer-events-none absolute bottom-2 right-2 rounded-full border border-zinc-200 bg-white/95 px-2 py-1 text-[10px] font-semibold text-zinc-600 shadow-xs">
        Sample preview
      </span>
    </div>
  );
}
