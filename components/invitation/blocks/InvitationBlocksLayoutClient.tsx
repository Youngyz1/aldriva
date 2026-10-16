"use client";

import type { InvitationPageData } from "@/types/invitation-template";
import type { PageBlocksLayout, PageLayoutBlock } from "@/lib/page-composition";
import { isRecord } from "@/lib/page-composition";
import { compilePageBlocksLayoutTheme, resolveInvitationBindings } from "@/lib/invitation-page-layout";
import type { PageActionHandler } from "@/lib/page-actions";
import { PREVIEW_MESSAGE_SOURCE } from "@/lib/invitation-preview-channel";
import { ActionPortalBlock, type ActionPortalType } from "@/components/invitation/blocks/ActionPortalBlock";
import {
  CountdownBlock,
  DetailsBlock,
  GalleryBlock,
  HeroBlock,
  LocationMapBlock,
  MusicBlock,
  RomanticEnvelopeJourney,
  RomanticHeroBlock,
  ScheduleBlock,
  StoryBlock,
} from "@/components/invitation/blocks/InvitationPresentationBlocks";

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function imageFocus(value: unknown): { x: number; y: number } | null {
  return isRecord(value) && typeof value.x === "number" && typeof value.y === "number"
    ? { x: value.x, y: value.y }
    : null;
}

function renderBlock(block: PageLayoutBlock, data: InvitationPageData, layout: PageBlocksLayout, onAction?: PageActionHandler, shared = false, romanticEnvelope = false) {
  const contentValue = resolveInvitationBindings(block.content, data);
  const content = isRecord(contentValue) ? contentValue : {};
  const theme = layout.global_theme;

  switch (block.type) {
    case "hero":
      return <HeroBlock key={block.id} title={text(content.title) ?? data.title} eyebrow={text(content.eyebrow)} subtitle={text(content.subtitle)} image={text(content.image)} imageAlt={text(content.imageAlt)} imageFocus={imageFocus(content.imageFocus)} scrollPrompt={text(content.scrollPrompt)} theme={theme} locale={data.locale} romanticEnvelope={romanticEnvelope} />;
    case "romantic_hero":
      return <RomanticHeroBlock key={block.id} title={text(content.title) ?? data.title} eyebrow={text(content.eyebrow)} subtitle={text(content.subtitle)} image={text(content.image)} imageAlt={text(content.imageAlt)} imageFocus={imageFocus(content.imageFocus)} scrollPrompt={text(content.scrollPrompt)} theme={theme} locale={data.locale} />;
    case "story":
      return <StoryBlock key={block.id} heading={text(content.heading)} text={text(content.text)} image={text(content.image)} moments={Array.isArray(content.moments) ? content.moments as { title?: string | null; text?: string | null; image?: string | null }[] : null} theme={theme} locale={data.locale} />;
    case "details":
      return <DetailsBlock key={block.id} data={{ ...data, ...content } as InvitationPageData} theme={theme} romanticEnvelope={romanticEnvelope} />;
    case "gallery":
      return <GalleryBlock key={block.id} images={Array.isArray(content.images) ? content.images as InvitationPageData["gallery"] : null} theme={theme} locale={data.locale} />;
    case "schedule":
      return <ScheduleBlock key={block.id} timeline={Array.isArray(content.timeline) ? content.timeline as InvitationPageData["schedule"] : null} theme={theme} locale={data.locale} romanticEnvelope={romanticEnvelope} />;
    case "countdown":
      return <CountdownBlock key={block.id} targetDate={text(content.targetDate) ?? data.eventDate} theme={theme} locale={data.locale} romanticEnvelope={romanticEnvelope} />;
    case "location_map":
      return <LocationMapBlock key={block.id} latitude={content.latitude} longitude={content.longitude} venue={text(content.venue)} address={text(content.address)} city={text(content.city)} theme={theme} locale={data.locale} />;
    case "music":
      return <MusicBlock key={block.id} data={{ ...data, musicAudioUrl: text(content.audioUrl), musicTitle: text(content.title), musicLinks: Array.isArray(content.links) ? content.links as InvitationPageData["musicLinks"] : null }} />;
    case "action_portal": {
      if (content.actionType !== "RSVP_SUBMISSION" && content.actionType !== "BUSINESS_LEAD") return null;
      const actionType: ActionPortalType = content.actionType;
      return <ActionPortalBlock key={block.id} actionType={actionType} title={text(content.title) ?? undefined} description={text(content.description) ?? undefined} guestName={data.guest.name} currentResponse={data.guest.rsvpStatus} invitationData={data} theme={theme} onAction={onAction} shared={shared} />;
    }
    default:
      return null;
  }
}

export function InvitationBlocksLayoutClient({
  layout,
  data,
  onAction,
  shared = false,
  mode = "preview",
  isEditMode = false,
  wrapperClassName,
}: {
  layout: PageBlocksLayout;
  data: InvitationPageData;
  wrapperClassName?: string;
  onAction?: PageActionHandler;
  shared?: boolean;
  mode?: "preview" | "live" | "shared";
  isEditMode?: boolean;
}) {
  const compiledLayout = compilePageBlocksLayoutTheme(layout);
  const usesEnvelopeGate = compiledLayout.layout_blocks.some((block) =>
    block.type === "interactive_envelope" || block.type === "romantic_envelope_gate"
  );
  const renderedBlocks = compiledLayout.layout_blocks.map((block) => {
    if (block.type === "interactive_envelope" || block.type === "romantic_envelope_gate") return null;
    const content = renderBlock(block, data, compiledLayout, onAction, shared, usesEnvelopeGate);
    if (!content) return null;
    return (
      <div
        key={block.id}
        data-layout-block-id={block.id}
        data-layout-block-type={block.type}
        data-builder-selectable={isEditMode ? "true" : undefined}
        className={isEditMode ? "cursor-pointer rounded-sm hover:outline hover:outline-2 hover:outline-orange-400" : undefined}
        onClick={(event) => {
          if (!isEditMode || window.parent === window) return;
          const target = event.target;
          if (target instanceof Element && target.closest("a,button,input,textarea,select,[role='button']")) return;
          window.parent.postMessage(
            { source: PREVIEW_MESSAGE_SOURCE, kind: "block-select", blockId: block.id, blockType: block.type },
            window.location.origin
          );
        }}
      >
        {content}
      </div>
    );
  });

  return (
    <div
      className={wrapperClassName ?? compiledLayout.global_theme.classes.page ?? ""}
      style={{ fontSize: `calc(100% * ${compiledLayout.global_theme.text_scale ?? 1.0})` }}
      data-page-mode={mode}
      data-edit-mode={isEditMode ? "true" : "false"}
    >
      {usesEnvelopeGate
        ? <RomanticEnvelopeJourney title={data.title} locale={data.locale}>{renderedBlocks}</RomanticEnvelopeJourney>
        : renderedBlocks}
    </div>
  );
}
