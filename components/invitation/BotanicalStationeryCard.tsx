import type { CSSProperties } from "react";
import type { InvitationTemplate } from "@/lib/invitation-types";
import type { InvitationCardData } from "@/components/invitation/InvitationCardRenderer";
import { formatEventDateTime, formatEventLocation, truncateText } from "@/lib/invitation-card-utils";
import { invitationImageClassName } from "@/lib/invitation-image-presentation";

/** Pure presentation shared by the builder card preview and Satori share image. */
export function BotanicalStationeryCard({
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
  const names = truncateText(data.hostNames?.trim() || data.eventTitle || "", 72);
  const dateTime = formatEventDateTime(data.eventDate);
  const location = formatEventLocation(data.venue, data.city);
  const locale = data.locale === "fr" ? "fr" : "en";
  const cardStyle: CSSProperties = {
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
    boxShadow: "0 18px 48px rgba(39, 52, 41, .2)",
  };

  return (
    <div className={`relative isolate ${className}`} style={cardStyle} aria-label={`${names}, ${dateTime}, ${location}`}>
      <div style={{ position: "absolute", inset: 16 * scale, border: `1px solid ${colorPalette.primary}70`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 24 * scale, border: `1px solid ${colorPalette.primary}45`, pointerEvents: "none" }} />

      {data.backgroundImageUrl ? (
        <div style={{ position: "absolute", top: 44 * scale, left: 52 * scale, right: 52 * scale, height: height * 0.31 * scale, overflow: "hidden", borderTopLeftRadius: width * 0.46 * scale, borderTopRightRadius: width * 0.46 * scale, border: `1px solid ${colorPalette.primary}80` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.backgroundImageUrl} alt="" className={invitationImageClassName("framed", "absolute inset-0")} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : null}

      <BotanicalSprig style={{ position: "absolute", top: 38 * scale, left: 34 * scale, width: 190 * scale, height: 250 * scale, opacity: 0.82 }} />
      <BotanicalSprig style={{ position: "absolute", right: 34 * scale, bottom: 30 * scale, width: 180 * scale, height: 235 * scale, transform: "rotate(180deg)", opacity: 0.72 }} />

      <div style={{ position: "absolute", top: (data.backgroundImageUrl ? 435 : 165) * scale, left: 90 * scale, right: 90 * scale, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <p style={{ margin: 0, color: colorPalette.primary, fontFamily: typography.bodyFont, fontSize: 11 * scale, fontWeight: 600, letterSpacing: 3.2 * scale, textTransform: "uppercase" }}>
          {locale === "fr" ? "Invitation au mariage" : "A wedding invitation"}
        </p>
        <span style={{ marginTop: 18 * scale, width: 42 * scale, height: 1, backgroundColor: colorPalette.accent }} />
        <h1 style={{ margin: `${26 * scale}px 0 0`, maxWidth: "100%", color: colorPalette.secondary, fontFamily: typography.titleFont, fontSize: 46 * scale, fontWeight: 400, lineHeight: 1.06, letterSpacing: -0.7 * scale, overflowWrap: "anywhere" }}>
          {names}
        </h1>
        <p style={{ margin: `${18 * scale}px 0 0`, color: colorPalette.primary, fontFamily: typography.bodyFont, fontSize: 11 * scale, letterSpacing: 1.8 * scale, lineHeight: 1.6, textTransform: "uppercase" }}>
          {locale === "fr" ? "ont la joie de vous convier" : "request the pleasure of your company"}
        </p>
        <span style={{ marginTop: 25 * scale, width: 118 * scale, height: 1, backgroundColor: `${colorPalette.primary}55` }} />
        <p style={{ margin: `${25 * scale}px 0 0`, color: colorPalette.secondary, fontFamily: typography.titleFont, fontSize: 19 * scale, fontWeight: 400, lineHeight: 1.45, letterSpacing: 1.1 * scale }}>
          {dateTime}
        </p>
        {location ? <p style={{ margin: `${13 * scale}px 0 0`, color: colorPalette.primary, fontFamily: typography.bodyFont, fontSize: 12 * scale, letterSpacing: 1.2 * scale, lineHeight: 1.55, textTransform: "uppercase" }}>{location}</p> : null}
        {data.customMessage ? <p style={{ margin: `${18 * scale}px 0 0`, maxWidth: "100%", color: colorPalette.secondary, fontFamily: typography.titleFont, fontSize: 13 * scale, fontStyle: "italic", lineHeight: 1.45 }}>{`“${truncateText(data.customMessage, 120)}”`}</p> : null}
      </div>

      <div style={{ position: "absolute", bottom: 54 * scale, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 13 * scale }}>
        <span style={{ height: 1, width: 35 * scale, backgroundColor: `${colorPalette.primary}70` }} />
        <span style={{ width: 8 * scale, height: 8 * scale, border: `1px solid ${colorPalette.accent}`, transform: "rotate(45deg)" }} />
        <span style={{ height: 1, width: 35 * scale, backgroundColor: `${colorPalette.primary}70` }} />
      </div>
    </div>
  );
}

function BotanicalSprig({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 220 290" fill="none" aria-hidden="true" style={style}>
      <path d="M12 278C67 217 94 150 92 27m2 185c45-22 75-58 95-112M87 232c-42-25-62-61-61-111 45 14 68 51 61 111Zm10-81c-6-46 8-82 48-113 19 43 4 83-48 113Zm9-71c-2-39 15-70 55-96 12 40-6 72-55 96Zm15 144c41-29 79-33 116-12-28 31-67 37-116 12Z" stroke="#58745f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <g fill="#81957d" fillOpacity=".62" stroke="#58745f" strokeOpacity=".75" strokeWidth="1.1">
        <path d="M87 232c-42-25-62-61-61-111 45 14 68 51 61 111Zm10-81c-6-46 8-82 48-113 19 43 4 83-48 113Zm9-71c-2-39 15-70 55-96 12 40-6 72-55 96Zm15 144c41-29 79-33 116-12-28 31-67 37-116 12Z" />
      </g>
      <g fill="#c98d88" stroke="#a86f6c" strokeWidth="1">
        <circle cx="146" cy="151" r="9"/><circle cx="139" cy="140" r="6"/><circle cx="153" cy="139" r="6"/><circle cx="138" cy="162" r="5"/><circle cx="154" cy="163" r="5"/><circle cx="146" cy="151" r="3" fill="#dbc18c" stroke="none"/>
        <circle cx="79" cy="99" r="7"/><circle cx="73" cy="90" r="4.5"/><circle cx="84" cy="89" r="4.5"/><circle cx="79" cy="99" r="2.5" fill="#dbc18c" stroke="none"/>
      </g>
    </svg>
  );
}
