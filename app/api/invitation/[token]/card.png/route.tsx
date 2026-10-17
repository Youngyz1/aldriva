import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { BotanicalStationeryCard } from "@/components/invitation/BotanicalStationeryCard";
import { LuxeEditorialInvitationCard } from "@/components/invitation/LuxeEditorialInvitationCard";
import type { InvitationCardData } from "@/components/invitation/InvitationCardRenderer";
import { getInvitationByToken } from "@/lib/invitations";
import { getInvitationTemplateById } from "@/lib/invitation-templates";
import { loadInvitationFonts } from "@/lib/invitation-fonts";
import { getPublishedInvitationPage } from "@/lib/actions/invitation-page";
import { fetchCoverHeroDataUri } from "@/lib/invitation-cover-art";
import {
  formatEventDateTime,
  formatEventLocation,
  formatGuestDisplayName,
  getAdaptiveFontSize,
  truncateText,
} from "@/lib/invitation-card-utils";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
const CARD_IMAGE_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
};

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
  const isCoverTemplate = template.id === "cover" || template.slug === "cover";
  const isBotanicalTemplate = template.layout_config.design === "botanical-reverie" || template.slug === "botanical-reverie";
  const isLuxeEditorialTemplate = template.layout_config.design === "luxe-editorial" || template.slug === "luxe-editorial";

  // Cover and Botanical card artwork comes from the PUBLISHED snapshot only —
  // guests must never see unpublished draft edits. No published page means
  // no hero (the card's authored design remains visible).
  let publishedSnapshot: NonNullable<Awaited<ReturnType<typeof getPublishedInvitationPage>>>["published_snapshot"] | null = null;
  if ((isCoverTemplate || isBotanicalTemplate || isLuxeEditorialTemplate) && event?.id) {
    publishedSnapshot = (await getPublishedInvitationPage(event.id))?.published_snapshot ?? null;
  }
  let coverHero: string | null = null;
  if (isCoverTemplate) {
    const snapshotHero = publishedSnapshot?.hero_image_url ?? null;
    if (snapshotHero) {
      coverHero = await fetchCoverHeroDataUri(snapshotHero);
      if (!coverHero) console.error("[invitation/card.png] Cover hero unavailable; rendering palette fallback.");
    }
  }
  let botanicalHero: string | null = null;
  if (isBotanicalTemplate) {
    const snapshotHero = publishedSnapshot?.hero_image_url ?? null;
    if (snapshotHero) {
      botanicalHero = await fetchCoverHeroDataUri(snapshotHero);
      if (!botanicalHero) console.error("[invitation/card.png] Botanical hero unavailable; rendering stationery without the photo.");
    }
  }
  let luxeEditorialHero: string | null = null;
  if (isLuxeEditorialTemplate) {
    const snapshotHero = publishedSnapshot?.hero_image_url ?? null;
    if (snapshotHero) {
      luxeEditorialHero = await fetchCoverHeroDataUri(snapshotHero);
      if (!luxeEditorialHero) console.error("[invitation/card.png] Luxe Editorial hero unavailable; rendering stationery without the photo.");
    }
  }

  const { layout_config } = template;
  const { slots, colorPalette, typography } = layout_config;

  const fonts = await loadInvitationFonts([
    typography.titleFont,
    typography.bodyFont,
    typography.accentFont || typography.titleFont,
  ]);

  if (isBotanicalTemplate) {
    const snapshot = publishedSnapshot as (NonNullable<typeof publishedSnapshot> & {
      host_names?: string | null;
      partner1_name?: string | null;
      partner2_name?: string | null;
      locale?: "en" | "fr";
    }) | null;
    const partnerNames = [snapshot?.partner1_name, snapshot?.partner2_name].filter((name): name is string => Boolean(name?.trim())).join(" & ");
    const botanicalData: InvitationCardData = {
      eventTitle: event?.title || "Wedding Invitation",
      guestName: "",
      hostNames: snapshot?.host_names?.trim() || partnerNames || null,
      eventDate: event?.event_date || null,
      venue: event?.venue || null,
      city: event?.city || null,
      locale: snapshot?.locale === "fr" ? "fr" : "en",
      backgroundImageUrl: botanicalHero,
    };
    const canvas = layout_config.canvas;
    return new ImageResponse(
      <BotanicalStationeryCard template={template} data={botanicalData} />,
      {
        width: canvas.width,
        height: canvas.height,
        fonts: fonts.map((f) => ({ name: f.name, data: f.data, weight: f.weight, style: f.style })),
        headers: CARD_IMAGE_CACHE_HEADERS,
      }
    );
  }

  if (isLuxeEditorialTemplate) {
    const snapshot = publishedSnapshot as (NonNullable<typeof publishedSnapshot> & {
      host_names?: string | null;
      partner1_name?: string | null;
      partner2_name?: string | null;
      locale?: "en" | "fr";
    }) | null;
    const partnerNames = [snapshot?.partner1_name, snapshot?.partner2_name]
      .filter((name): name is string => Boolean(name?.trim()))
      .join(" & ");
    const luxeEditorialData: InvitationCardData = {
      eventTitle: event?.title || "Wedding Invitation",
      guestName: "",
      hostNames: partnerNames || snapshot?.host_names?.trim() || null,
      eventDate: event?.event_date || null,
      venue: event?.venue || null,
      city: event?.city || null,
      locale: snapshot?.locale === "fr" ? "fr" : "en",
      backgroundImageUrl: luxeEditorialHero,
    };
    const canvas = layout_config.canvas;
    return new ImageResponse(
      <LuxeEditorialInvitationCard template={template} data={luxeEditorialData} />,
      {
        width: canvas.width,
        height: canvas.height,
        fonts: fonts.map((font) => ({ name: font.name, data: font.data, weight: font.weight, style: font.style })),
        headers: CARD_IMAGE_CACHE_HEADERS,
      }
    );
  }

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
          backgroundImage: isCoverTemplate
            ? "none"
            : `radial-gradient(ellipse 80% 80% at 50% -20%, ${colorPalette.primary}33, transparent), radial-gradient(ellipse 80% 80% at 50% 120%, ${colorPalette.accent}26, transparent)`,
          fontFamily: typography.bodyFont || "Plus Jakarta Sans",
          color: colorPalette.secondary || "#ffffff",
          overflow: "hidden",
        }}
      >
        {/* Background Image if present (Cover: snapshot hero, else fixed art) */}
        {(() => {
          const bgSrc = coverHero || template.background_image_url || "";
          if (!bgSrc) return null;
          const heroDim = layout_config.heroDim;
          return (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={bgSrc}
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
                ...(heroDim !== undefined ? { filter: `brightness(${heroDim})` } : {}),
              }}
            />
          );
        })()}
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
      headers: CARD_IMAGE_CACHE_HEADERS,
    }
  );
}
