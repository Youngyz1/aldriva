import type { CSSProperties } from "react";
import type { InvitationTemplate } from "@/lib/invitation-types";
import type { InvitationCardData } from "@/components/invitation/InvitationCardRenderer";
import { formatLocalizedEventDate } from "@/lib/invitation-i18n";
import { truncateText } from "@/lib/invitation-card-utils";
import { invitationImageClassName } from "@/lib/invitation-image-presentation";

/** Shared portrait stationery card for the page preview and token-protected PNG. */
export function LuxeEditorialInvitationCard({
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
  const { width, height } = template.layout_config.canvas;
  const { colorPalette, typography } = template.layout_config;
  const hostNames = truncateText(data.hostNames?.trim() || data.eventTitle || "", 75);
  const guest = truncateText(data.guestName?.trim() || "", 55);
  const date = data.eventDate ? formatLocalizedEventDate(data.eventDate, data.locale, null) : null;
  const location = [data.venue, data.city].filter((part) => part?.trim()).join(" · ");
  const style: CSSProperties = {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    overflow: "hidden",
    width: width * scale,
    height: height * scale,
    maxWidth: "100%",
    aspectRatio: `${width} / ${height}`,
    backgroundColor: colorPalette.background,
    color: colorPalette.secondary,
    fontFamily: typography.bodyFont || "Montserrat, sans-serif",
    boxShadow: "0 18px 48px rgba(74, 58, 44, .16)",
  };
  const frameInset = 20 * scale;

  return (
    <div className={`relative isolate ${className}`} style={style} aria-label={`${hostNames}${date?.dateDisplay ? `, ${date.dateDisplay}` : ""}${location ? `, ${location}` : ""}`}>
      <div style={{ position: "absolute", inset: frameInset, border: `1px solid ${colorPalette.accent}b0`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: frameInset + 8 * scale, border: `1px solid ${colorPalette.accent}60`, pointerEvents: "none" }} />

      {data.backgroundImageUrl ? (
        <div style={{ position: "relative", flexShrink: 0, width: width * 0.78 * scale, height: height * 0.29 * scale, marginTop: 44 * scale, overflow: "hidden", border: `1px solid ${colorPalette.accent}b0` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.backgroundImageUrl} alt="" className={invitationImageClassName("framed", "absolute inset-0")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <div style={{ height: 130 * scale, flexShrink: 0 }} />
      )}

      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", width: width * 0.78 * scale, marginTop: -18 * scale, padding: `${34 * scale}px ${28 * scale}px`, border: `1px solid ${colorPalette.accent}80`, backgroundColor: "#fffdf9", textAlign: "center", boxShadow: "0 12px 30px rgba(74, 58, 44, .12)" }}>
        <p style={{ margin: 0, color: colorPalette.primary, fontFamily: typography.bodyFont, fontSize: 10 * scale, fontWeight: 600, letterSpacing: 3 * scale, lineHeight: 1.5, textTransform: "uppercase" }}>
          {data.locale === "fr" ? "Invitation au mariage" : "A wedding invitation"}
        </p>
        <span style={{ marginTop: 18 * scale, width: 40 * scale, height: 1, backgroundColor: colorPalette.accent }} />
        <h1 style={{ margin: `${22 * scale}px 0 0`, maxWidth: "100%", color: colorPalette.secondary, fontFamily: typography.titleFont, fontSize: 43 * scale, fontWeight: 400, lineHeight: 1.08, overflowWrap: "anywhere" }}>
          {hostNames}
        </h1>
        <p style={{ margin: `${18 * scale}px 0 0`, color: colorPalette.primary, fontFamily: typography.bodyFont, fontSize: 11 * scale, letterSpacing: 1.5 * scale, lineHeight: 1.6, textTransform: "uppercase" }}>
          {data.locale === "fr" ? "ont l'honneur de vous inviter" : "request the honor of your presence"}
        </p>
        {guest ? <p style={{ margin: `${18 * scale}px 0 0`, color: colorPalette.secondary, fontFamily: typography.titleFont, fontSize: 17 * scale, fontStyle: "italic", lineHeight: 1.35, overflowWrap: "anywhere" }}>{guest}</p> : null}
        {data.customMessage ? <p style={{ margin: `${12 * scale}px 0 0`, maxWidth: "100%", color: colorPalette.primary, fontFamily: typography.bodyFont, fontSize: 10 * scale, lineHeight: 1.5, overflowWrap: "anywhere" }}>{truncateText(data.customMessage, 110)}</p> : null}
        {date?.dateDisplay ? <p style={{ margin: `${23 * scale}px 0 0`, color: colorPalette.secondary, fontFamily: typography.titleFont, fontSize: 15 * scale, lineHeight: 1.45 }}>{date.dateDisplay}</p> : null}
        {location ? <p style={{ margin: `${10 * scale}px 0 0`, color: colorPalette.primary, fontFamily: typography.bodyFont, fontSize: 10 * scale, letterSpacing: 1 * scale, lineHeight: 1.5, textTransform: "uppercase", overflowWrap: "anywhere" }}>{location}</p> : null}
      </div>

      <p style={{ margin: `${24 * scale}px 0 0`, color: colorPalette.primary, fontFamily: typography.bodyFont, fontSize: 9 * scale, letterSpacing: 2.4 * scale, textTransform: "uppercase" }}>
        {data.locale === "fr" ? "Avec amour" : "With love"}
      </p>
    </div>
  );
}
