"use client";

import React from "react";
import { InvitationTemplate, LayoutSlotConfig } from "@/lib/invitation-types";

export interface InvitationCardData {
  eventTitle: string;
  guestName: string;
  /** Host-facing name line for builder previews; never guest personalization. */
  hostNames?: string | null;
  guestTitle?: string | null;
  organization?: string | null;
  eventDate?: string | null;
  venue?: string | null;
  city?: string | null;
  customMessage?: string | null;
  headerBadgeText?: string | null;
  /**
   * Round 5 Cover: per-event hero art. Falls back to the template's fixed
   * background_image_url when absent (all existing templates).
   */
  backgroundImageUrl?: string | null;
}

import {
  formatEventDateTime,
  formatEventLocation,
  formatGuestDisplayName,
  getAdaptiveFontSize,
  truncateText,
} from "@/lib/invitation-card-utils";

// Re-export so existing callers of this module still work without changes.
export {
  formatEventDateTime,
  formatEventLocation,
  formatGuestDisplayName,
  getAdaptiveFontSize,
  truncateText,
};


export function renderSlotStyle(
  slot?: LayoutSlotConfig,
  options?: { overrideFontSize?: number; maxHeight?: number | string; lineHeight?: number; scale?: number }
): React.CSSProperties {
  if (!slot) return { display: "none" };

  const scale = options?.scale ?? 1;
  const fontSize = Number(((options?.overrideFontSize || slot.fontSize) * scale).toFixed(2));
  const maxHeight = typeof options?.maxHeight === "number"
    ? Number((options.maxHeight * scale).toFixed(2))
    : typeof options?.maxHeight === "string" && options.maxHeight.endsWith("px")
      ? `${Number((Number.parseFloat(options.maxHeight) * scale).toFixed(2))}px`
      : options?.maxHeight;
  return {
    position: "absolute",
    top: `${slot.topPercent}%`,
    left: `${slot.leftPercent}%`,
    width: `${slot.widthPercent}%`,
    display: "flex",
    flexDirection: "column",
    alignItems: slot.textAlign === "center" ? "center" : slot.textAlign === "right" ? "flex-end" : "flex-start",
    justifyContent: "center",
    textAlign: slot.textAlign || "center",
    fontSize: `${fontSize}px`,
    fontWeight: (slot.fontWeight as any) || 400,
    fontFamily: slot.fontFamily || "inherit",
    letterSpacing: slot.letterSpacing ? `${slot.letterSpacing * scale}px` : undefined,
    textTransform: slot.textTransform || "none",
    color: slot.color,
    lineHeight: options?.lineHeight || slot.lineHeight || 1.25,
    maxHeight,
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

export function InvitationCardRenderer({
  template,
  data,
  scale = 1,
  className = "",
}: {
  template: InvitationTemplate;
  data: InvitationCardData;
  scale?: number;
  className?: string;
}) {
  const { layout_config } = template;
  const { slots, colorPalette, typography } = layout_config;

  const hostDisplay = data.hostNames?.trim() || null;
  const guestDisplay = hostDisplay ? null : formatGuestDisplayName(data.guestName, data.guestTitle, data.organization);
  const nameDisplay = truncateText(hostDisplay || guestDisplay || "", 75);
  const nameSlot = hostDisplay ? (slots.hostNames || slots.guestName) : slots.guestName;
  const nameFontSize = getAdaptiveFontSize(nameDisplay, nameSlot?.fontSize || 26);

  const titleFontSize = getAdaptiveFontSize(data.eventTitle, slots.eventTitle?.fontSize || 36);

  const eventDateTime = formatEventDateTime(data.eventDate);
  const locationText = formatEventLocation(data.venue, data.city);
  const metaDisplay = `${eventDateTime}  ·  ${locationText}`;

  const bgStyle: React.CSSProperties = {
    backgroundColor: colorPalette.background,
    backgroundImage: `radial-gradient(ellipse 80% 80% at 50% -20%, ${colorPalette.primary}25, transparent), radial-gradient(ellipse 80% 80% at 50% 120%, ${colorPalette.accent}20, transparent)`,
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl shadow-2xl border border-white/10 ${className}`}
      style={{
        width: 1200 * scale,
        height: 630 * scale,
        maxWidth: "100%",
        aspectRatio: "1200 / 630",
        fontFamily: typography.bodyFont || "Plus Jakarta Sans, sans-serif",
        ...bgStyle,
      }}
    >
      {/* Background image if present */}
      {(() => {
        const bgUrl = data.backgroundImageUrl || template.background_image_url || "";
        if (!bgUrl) return null;
        const heroDim = template.layout_config.heroDim;
        return (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={bgUrl}
            alt={template.name}
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            style={heroDim !== undefined ? { filter: `brightness(${heroDim})` } : undefined}
          />
        );
      })()}

      {/* Decorative Frame */}
      <div
        className="absolute inset-4 sm:inset-6 rounded-xl border border-white/10 pointer-events-none"
        style={{
          borderColor: `${colorPalette.primary}40`,
        }}
      />
      <div
        className="absolute inset-5 sm:inset-7 rounded-lg border border-white/5 pointer-events-none"
        style={{
          borderColor: `${colorPalette.primary}20`,
        }}
      />

      {/* Slots */}
      {slots.headerBadge && (
        <div data-card-slot="header-badge" style={renderSlotStyle(slots.headerBadge, { scale })}>
          <span>{data.headerBadgeText || "OFFICIAL INVITATION"}</span>
        </div>
      )}

      {slots.eventTitle && (
        <div data-card-slot="event-title" style={renderSlotStyle(slots.eventTitle, { overrideFontSize: titleFontSize, maxHeight: "80px", lineHeight: 1.2, scale })}>
          <span style={{ fontFamily: slots.eventTitle.fontFamily || typography.titleFont }}>
            {data.eventTitle}
          </span>
        </div>
      )}

      {nameDisplay && nameSlot && (
        <div data-card-slot={hostDisplay && slots.hostNames ? "host-names" : hostDisplay ? "host-names-fallback" : "guest-name"} style={renderSlotStyle(nameSlot, { overrideFontSize: nameFontSize, maxHeight: "58px", lineHeight: 1.22, scale })}>
          <span style={{ fontFamily: nameSlot.fontFamily || typography.accentFont || typography.titleFont }}>
            {nameDisplay}
          </span>
        </div>
      )}

      {/* Optional Custom Message */}
      {slots.customMessage && data.customMessage && (
        <div data-card-slot="custom-message" style={renderSlotStyle(slots.customMessage, { maxHeight: "48px", lineHeight: 1.35, scale })}>
          <span style={{ fontFamily: slots.customMessage.fontFamily || typography.bodyFont }}>
            &ldquo;{data.customMessage}&rdquo;
          </span>
        </div>
      )}

      {slots.eventMeta && (
        <div data-card-slot="event-meta" style={renderSlotStyle(slots.eventMeta, { maxHeight: "36px", scale })}>
          <span style={{ fontFamily: slots.eventMeta.fontFamily || typography.bodyFont }}>
            {metaDisplay}
          </span>
        </div>
      )}
    </div>
  );
}
