import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { getInvitationByToken } from "@/lib/invitations";
import { getInvitationTemplateById } from "@/lib/invitation-templates";
import { loadInvitationFonts } from "@/lib/invitation-fonts";
import {
  formatEventDateTime,
  formatEventLocation,
  formatGuestDisplayName,
  getAdaptiveFontSize,
  truncateText,
} from "@/lib/invitation-card-utils";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!token || typeof token !== "string" || token.length !== 64) {
    return new NextResponse("Invalid invitation token", { status: 400 });
  }

  const result = await getInvitationByToken(token);
  if (!result || !result.invitation) {
    return new NextResponse("Invitation not found", { status: 404 });
  }

  const { invitation } = result;
  const event = invitation.events as any;

  const templateId = event?.invitation_template_id || null;
  const template = await getInvitationTemplateById(templateId);

  const { layout_config } = template;
  const { slots, colorPalette, typography } = layout_config;

  const fonts = await loadInvitationFonts([
    typography.titleFont,
    typography.bodyFont,
    typography.accentFont || typography.titleFont,
  ]);

  const rawGuestDisplay = formatGuestDisplayName(
    invitation.guest_name,
    invitation.guest_title,
    invitation.organization
  );
  const guestDisplay = truncateText(rawGuestDisplay, 75);
  const guestFontSize = getAdaptiveFontSize(guestDisplay, slots.guestName?.fontSize || 26);

  const eventTitle = event?.title || "Exclusive Event";
  const titleFontSize = getAdaptiveFontSize(eventTitle, slots.eventTitle?.fontSize || 36);

  const eventDateTime = formatEventDateTime(event?.event_date);
  const locationText = formatEventLocation(event?.venue, event?.city);
  const metaDisplay = `${eventDateTime}  ·  ${locationText}`;
  const headerBadgeText = invitation.guest_title
    ? "VIP GUEST INVITATION"
    : "OFFICIAL INVITATION";

  const customMessage = (invitation as any).custom_message || null;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          position: "relative",
          width: 1200,
          height: 630,
          backgroundColor: colorPalette.background,
          backgroundImage: `radial-gradient(ellipse 80% 80% at 50% -20%, ${colorPalette.primary}33, transparent), radial-gradient(ellipse 80% 80% at 50% 120%, ${colorPalette.accent}26, transparent)`,
          fontFamily: typography.bodyFont || "Plus Jakarta Sans",
          color: colorPalette.secondary || "#ffffff",
          overflow: "hidden",
        }}
      >
        {/* Background Image if present */}
        {template.background_image_url && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={template.background_image_url}
            alt=""
            width="1200"
            height="630"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: 1200,
              height: 630,
              objectFit: "cover",
            }}
          />
        )}
        {/* Outer Border Inset */}
        <div
          style={{
            position: "absolute",
            top: 24,
            left: 24,
            right: 24,
            bottom: 24,
            borderRadius: 16,
            border: `1px solid ${colorPalette.primary}40`,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 32,
            left: 32,
            right: 32,
            bottom: 32,
            borderRadius: 12,
            border: `1px solid ${colorPalette.primary}20`,
            display: "flex",
          }}
        />

        {/* Header Badge */}
        {slots.headerBadge && (
          <div
            style={{
              position: "absolute",
              top: `${slots.headerBadge.topPercent}%`,
              left: `${slots.headerBadge.leftPercent}%`,
              width: `${slots.headerBadge.widthPercent}%`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontSize: slots.headerBadge.fontSize || 13,
              fontWeight: 700,
              letterSpacing: slots.headerBadge.letterSpacing || 4,
              textTransform: "uppercase",
              color: slots.headerBadge.color || colorPalette.primary,
            }}
          >
            {headerBadgeText}
          </div>
        )}

        {/* Event Title */}
        {slots.eventTitle && (
          <div
            style={{
              position: "absolute",
              top: `${slots.eventTitle.topPercent}%`,
              left: `${slots.eventTitle.leftPercent}%`,
              width: `${slots.eventTitle.widthPercent}%`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontSize: titleFontSize,
              fontWeight: 700,
              fontFamily: slots.eventTitle.fontFamily || typography.titleFont || "Cinzel",
              color: slots.eventTitle.color || "#ffffff",
              lineHeight: 1.2,
            }}
          >
            {truncateText(eventTitle, 60)}
          </div>
        )}

        {/* Guest Name */}
        {slots.guestName && (
          <div
            style={{
              position: "absolute",
              top: `${slots.guestName.topPercent}%`,
              left: `${slots.guestName.leftPercent}%`,
              width: `${slots.guestName.widthPercent}%`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontSize: guestFontSize,
              fontWeight: 700,
              fontFamily: slots.guestName.fontFamily || typography.accentFont || "Playfair Display",
              color: slots.guestName.color || colorPalette.primary,
              lineHeight: 1.22,
            }}
          >
            {guestDisplay}
          </div>
        )}

        {/* Optional Custom Message */}
        {slots.customMessage && customMessage && (
          <div
            style={{
              position: "absolute",
              top: `${slots.customMessage.topPercent}%`,
              left: `${slots.customMessage.leftPercent}%`,
              width: `${slots.customMessage.widthPercent}%`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontSize: slots.customMessage.fontSize || 15,
              fontWeight: 400,
              fontFamily: slots.customMessage.fontFamily || typography.bodyFont || "Montserrat",
              color: slots.customMessage.color || "#e2e8f0",
              fontStyle: "italic",
              lineHeight: 1.35,
            }}
          >
            {`\u201c${truncateText(customMessage, 120)}\u201d`}
          </div>
        )}

        {/* Event Meta */}
        {slots.eventMeta && (
          <div
            style={{
              position: "absolute",
              top: `${slots.eventMeta.topPercent}%`,
              left: `${slots.eventMeta.leftPercent}%`,
              width: `${slots.eventMeta.widthPercent}%`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontSize: slots.eventMeta.fontSize || 15,
              fontWeight: 600,
              fontFamily: slots.eventMeta.fontFamily || typography.bodyFont || "Montserrat",
              color: slots.eventMeta.color || "#94a3b8",
            }}
          >
            {metaDisplay}
          </div>
        )}
      </div>
    ),
    {
      ...size,
      fonts: fonts.map((f) => ({
        name: f.name,
        data: f.data,
        weight: f.weight,
        style: f.style,
      })),
      headers: {
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      },
    }
  );
}
