"use client";

import type { ReactNode } from "react";
import type { InvitationPageData } from "@/types/invitation-template";
import type { PageActionHandler } from "@/lib/page-actions";
import { isRecord, type PageBlocksLayout, type PageLayoutBlock } from "@/lib/page-composition";
import {
  INVITATION_BLOCK_TYPES,
  isInvitationGalleryPresentation,
  type InvitationBlockType,
  type InvitationDetailsPresentation,
  type InvitationGalleryPresentation,
} from "@/lib/invitation-template-registry";
import { ActionPortalBlock, type ActionPortalType } from "@/components/invitation/blocks/ActionPortalBlock";
import {
  CountdownBlock,
  DetailsBlock,
  GalleryBlock,
  HeroBlock,
  LocationMapBlock,
  MusicBlock,
  RomanticHeroBlock,
  ScheduleBlock,
  StoryBlock,
} from "@/components/invitation/blocks/InvitationPresentationBlocks";
import { resolveInvitationBindings } from "@/lib/invitation-page-layout";

interface InvitationBlockRenderContext {
  block: PageLayoutBlock;
  data: InvitationPageData;
  layout: PageBlocksLayout;
  onAction?: PageActionHandler;
  shared: boolean;
  romanticEnvelope: boolean;
  botanicalReverie: boolean;
  detailsPresentation: InvitationDetailsPresentation;
  galleryPresentation: InvitationGalleryPresentation;
}

type BlockComponent = (context: InvitationBlockRenderContext) => ReactNode;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function imageFocus(value: unknown): { x: number; y: number } | null {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number"
    ? { x: value.x, y: value.y }
    : null;
}

const BLOCK_COMPONENTS = {
  interactive_envelope: () => null,
  hero: ({ block, data, layout, romanticEnvelope, detailsPresentation }) => {
    const content = resolvedContent(block, data);
    const coupleNames = [data.partner1Name, data.partner2Name].filter((name) => name?.trim()).join(" & ");
    const title = detailsPresentation === "luxe-editorial" ? coupleNames || text(content.title) || data.title : text(content.title) ?? data.title;
    return <HeroBlock title={title} eyebrow={text(content.eyebrow)} subtitle={text(content.subtitle)} image={text(content.image)} imageAlt={text(content.imageAlt)} imageFocus={imageFocus(content.imageFocus)} scrollPrompt={text(content.scrollPrompt)} theme={layout.global_theme} locale={data.locale} romanticEnvelope={romanticEnvelope} luxeEditorial={detailsPresentation === "luxe-editorial"} eventDate={data.eventDate} timezone={data.timezone} venue={data.venue} address={data.address} city={data.city} />;
  },
  romantic_hero: ({ block, data, layout, botanicalReverie }) => {
    const content = resolvedContent(block, data);
    const coupleNames = [data.partner1Name, data.partner2Name].filter((name) => name?.trim()).join(" & ");
    const title = botanicalReverie ? coupleNames || text(content.title) || data.title : text(content.title) ?? data.title;
    return <RomanticHeroBlock title={title} eyebrow={text(content.eyebrow)} subtitle={text(content.subtitle)} image={text(content.image)} imageAlt={text(content.imageAlt)} imageFocus={imageFocus(content.imageFocus)} scrollPrompt={text(content.scrollPrompt)} theme={layout.global_theme} locale={data.locale} botanicalReverie={botanicalReverie} eventDate={data.eventDate} timezone={data.timezone} familyNote={data.familyNote} />;
  },
  story: ({ block, data, layout }) => {
    const content = resolvedContent(block, data);
    return <StoryBlock heading={text(content.heading)} text={text(content.text)} image={text(content.image)} moments={Array.isArray(content.moments) ? content.moments as { title?: string | null; text?: string | null; image?: string | null }[] : null} theme={layout.global_theme} locale={data.locale} />;
  },
  details: ({ block, data, layout, romanticEnvelope, botanicalReverie, detailsPresentation }) => {
    const content = resolvedContent(block, data);
    return <DetailsBlock data={{ ...data, ...content } as InvitationPageData} theme={layout.global_theme} romanticEnvelope={romanticEnvelope} botanicalReverie={botanicalReverie} presentation={detailsPresentation} showOverview={detailsPresentation !== "luxe-editorial"} />;
  },
  countdown: ({ block, data, layout, romanticEnvelope, botanicalReverie, detailsPresentation }) => {
    const content = resolvedContent(block, data);
    return <CountdownBlock targetDate={text(content.targetDate) ?? data.eventDate} theme={layout.global_theme} locale={data.locale} romanticEnvelope={romanticEnvelope} botanicalReverie={botanicalReverie} luxeEditorial={detailsPresentation === "luxe-editorial"} />;
  },
  location_map: ({ block, data, layout }) => {
    const content = resolvedContent(block, data);
    return <LocationMapBlock latitude={content.latitude} longitude={content.longitude} venue={text(content.venue)} address={text(content.address)} city={text(content.city)} theme={layout.global_theme} locale={data.locale} />;
  },
  schedule: ({ block, data, layout, romanticEnvelope, botanicalReverie, detailsPresentation }) => {
    const content = resolvedContent(block, data);
    return <ScheduleBlock timeline={Array.isArray(content.timeline) ? content.timeline as InvitationPageData["schedule"] : null} theme={layout.global_theme} locale={data.locale} romanticEnvelope={romanticEnvelope} botanicalReverie={botanicalReverie} presentation={detailsPresentation} />;
  },
  gallery: ({ block, data, layout, botanicalReverie, galleryPresentation }) => {
    const content = resolvedContent(block, data);
    // Organizer override wins over the template's code-owned default.
    const requested = text(content.presentation);
    const presentation = isInvitationGalleryPresentation(requested) ? requested : galleryPresentation;
    return <GalleryBlock images={Array.isArray(content.images) ? content.images as InvitationPageData["gallery"] : null} theme={layout.global_theme} locale={data.locale} botanicalReverie={botanicalReverie} presentation={presentation} />;
  },
  music: ({ block, data }) => {
    const content = resolvedContent(block, data);
    return <MusicBlock data={{ ...data, musicAudioUrl: text(content.audioUrl), musicTitle: text(content.title), musicLinks: Array.isArray(content.links) ? content.links as InvitationPageData["musicLinks"] : null }} />;
  },
  action_portal: ({ block, data, layout, onAction, shared }) => {
    const content = resolvedContent(block, data);
    if (content.actionType !== "RSVP_SUBMISSION" && content.actionType !== "BUSINESS_LEAD") return null;
    const actionType: ActionPortalType = content.actionType;
    return <ActionPortalBlock actionType={actionType} title={text(content.title) ?? undefined} description={text(content.description) ?? undefined} guestName={data.guest.name} currentResponse={data.guest.rsvpStatus} invitationData={data} theme={layout.global_theme} onAction={onAction} shared={shared} />;
  },
} satisfies Record<InvitationBlockType, BlockComponent>;

function resolvedContent(block: PageLayoutBlock, data: InvitationPageData): Record<string, unknown> {
  const value = resolveInvitationBindings(block.content, data);
  return isRecord(value) ? value : {};
}

const supportedTypes = new Set<string>(INVITATION_BLOCK_TYPES);

/** Resolves a JSON block only through the code-owned component map. */
export function renderInvitationBlock(context: InvitationBlockRenderContext): ReactNode {
  if (!supportedTypes.has(context.block.type)) return null;
  const component = BLOCK_COMPONENTS[context.block.type as InvitationBlockType];
  return <>{component(context)}</>;
}

