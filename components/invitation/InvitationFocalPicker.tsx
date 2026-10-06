"use client";

/**
 * components/invitation/InvitationFocalPicker.tsx
 *
 * Click/drag focal-point picker for invitation hero images.
 * Replaces the two X/Y sliders: the host taps the point of interest on
 * the full image, sees the numeric x/y (0-100), and gets a live crop
 * preview rendered with the real frame shape of the selected template
 * (arch / banner / polaroid) using the same `object-position` mechanism
 * the guest templates use — so the preview matches rendering exactly.
 */

import { useCallback, useRef } from "react";
import { focalToObjectPosition, normalizeFocalPoint, pointerToFocalPoint, type FocalPoint } from "@/lib/invitation-images";
import { cn } from "@/lib/utils";

export type InvitationFrameShape = "arch" | "banner" | "polaroid";

/** Frame shape per invitation template (matches guest rendering). */
export const FRAME_SHAPE_BY_TEMPLATE: Record<string, InvitationFrameShape> = {
  "wedding-romantic": "arch",
  "gala-editorial": "banner",
  "black-tie": "banner",
  "birthday-bold": "polaroid",
};

export function frameShapeForTemplate(templateId: string | null | undefined): InvitationFrameShape {
  if (templateId && FRAME_SHAPE_BY_TEMPLATE[templateId]) return FRAME_SHAPE_BY_TEMPLATE[templateId];
  return "banner";
}

const FRAME_CLASS: Record<InvitationFrameShape, string> = {
  arch: "aspect-[3/4] rounded-t-[999px] rounded-b-2xl",
  banner: "aspect-[16/9] rounded-xl",
  polaroid: "aspect-square rounded-lg border-8 border-white",
};

const FRAME_LABEL: Record<InvitationFrameShape, string> = {
  arch: "Arch (wedding)",
  banner: "Banner (gala)",
  polaroid: "Polaroid (birthday)",
};

interface Props {
  /** Full image URL (object URL while editing, or stored cms-media URL). */
  imageUrl: string | null | undefined;
  focal: FocalPoint;
  onChange: (focal: FocalPoint) => void;
  /** Template whose real frame shape drives the live preview. */
  templateId?: string | null;
  disabled?: boolean;
}

export function InvitationFocalPicker({ imageUrl, focal, onChange, templateId, disabled }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const normalized = normalizeFocalPoint(focal.x, focal.y);
  const shape = frameShapeForTemplate(templateId);

  const pickFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const el = stageRef.current;
      if (!el || disabled) return;
      onChange(pointerToFocalPoint(clientX, clientY, el.getBoundingClientRect()));
    },
    [disabled, onChange]
  );

  if (!imageUrl) return null;

  return (
    <div className="space-y-4 border-t border-zinc-200 pt-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-800">Focal Point</h3>
          <span className="text-xs font-bold text-orange-600 tabular-nums">
            x {normalized.x} · y {normalized.y}
          </span>
        </div>
        <p className="text-[11px] text-zinc-500">
          Click or drag on the photo to set where the crop focuses on narrow screens.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Full-image picker surface */}
        <div
          ref={stageRef}
          role="application"
          aria-label="Focal point picker. Click or drag to set the focus point."
          onPointerDown={(e) => {
            if (disabled) return;
            draggingRef.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            pickFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (draggingRef.current) pickFromPointer(e.clientX, e.clientY);
          }}
          onPointerUp={() => {
            draggingRef.current = false;
          }}
          onPointerCancel={() => {
            draggingRef.current = false;
          }}
          className={cn(
            "relative w-full overflow-hidden rounded-xl bg-zinc-200 select-none",
            disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair touch-none"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" draggable={false} className="block h-auto w-full" />
          {/* Crosshair marker */}
          <div
            aria-hidden
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${normalized.x}%`, top: `${normalized.y}%` }}
          >
            <div className="absolute inset-0 rounded-full border-2 border-white shadow-xs" />
            <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-orange-600" />
          </div>
        </div>

        {/* Live crop preview in the real template frame shape */}
        <div className="flex flex-col items-center gap-2">
          <div
            className={cn(
              "relative w-full max-w-[220px] overflow-hidden bg-zinc-200 shadow-xs",
              FRAME_CLASS[shape]
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              draggable={false}
              className="h-full w-full object-cover"
              style={{ objectPosition: focalToObjectPosition(normalized) }}
            />
          </div>
          <span className="text-[11px] font-semibold text-zinc-500">{FRAME_LABEL[shape]} preview</span>
        </div>
      </div>
    </div>
  );
}
