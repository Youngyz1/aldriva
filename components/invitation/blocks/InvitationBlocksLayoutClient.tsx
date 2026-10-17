"use client";

import type { InvitationPageData } from "@/types/invitation-template";
import { invitationDetailsPresentationForTemplate, type InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import { compilePageBlocksLayoutTheme } from "@/lib/invitation-page-layout";
import type { PageActionHandler } from "@/lib/page-actions";
import { PREVIEW_MESSAGE_SOURCE } from "@/lib/invitation-preview-channel";
import { renderInvitationBlock } from "@/components/invitation/blocks/InvitationBlockRegistry";
import { InvitationScrollReveal } from "@/components/invitation/animation/InvitationScrollReveal";
import { InvitationPageCanvas } from "@/components/invitation/blocks/InvitationPageCanvas";
import { renderCustomInvitationPage } from "@/components/invitation/templates/InvitationPageComponentRegistry";
import { getInvitationTemplateDefinition } from "@/lib/invitation-template-registry";

export function InvitationBlocksLayoutClient({
  layout,
  data,
  templateId = "gala-editorial",
  onAction,
  shared = false,
  mode = "preview",
  isEditMode = false,
  wrapperClassName,
}: {
  layout: InvitationBlocksLayout;
  data: InvitationPageData;
  templateId?: string;
  wrapperClassName?: string;
  onAction?: PageActionHandler;
  shared?: boolean;
  mode?: "preview" | "live" | "shared";
  isEditMode?: boolean;
}) {
  const definition = getInvitationTemplateDefinition(templateId);
  const detailsPresentation = invitationDetailsPresentationForTemplate(templateId);
  const galleryPresentation = definition?.galleryPresentation ?? "editorial";
  const supportedEffects = new Set<string>(definition?.supportedEffects ?? []);
  const compiledLayout = compilePageBlocksLayoutTheme({
    ...layout,
    effects: (layout.effects ?? []).filter((effect) => supportedEffects.has(effect.type)),
  });
  const envelopeBlock = compiledLayout.layout_blocks.find((block) =>
    block.type === "interactive_envelope" || block.type === "romantic_envelope_gate"
  );
  const envelopeEffect = compiledLayout.effects?.find((effect) => effect.type === "envelope-reveal");
  const usesEnvelopeGate = envelopeEffect?.enabled ?? Boolean(
    definition?.supportedEffects.includes("envelope-reveal") && envelopeBlock && envelopeBlock.content.enabled !== false
  );
  const scrollRevealEffect = compiledLayout.effects?.find((effect) => effect.type === "scroll-reveal");
  const scrollRevealEnabled = Boolean(scrollRevealEffect?.enabled);
  const scrollRevealDurationMs = scrollRevealEffect?.durationMs ?? 500;
  const renderedBlocks = compiledLayout.layout_blocks.map((block) => {
    if (block.type === "interactive_envelope" || block.type === "romantic_envelope_gate") return null;
    const content = renderInvitationBlock({
      block, data, layout: compiledLayout, onAction, shared,
      romanticEnvelope: usesEnvelopeGate,
      botanicalReverie: templateId === "botanical-reverie",
      detailsPresentation,
      galleryPresentation,
    });
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
        <InvitationScrollReveal enabled={scrollRevealEnabled} durationMs={scrollRevealDurationMs}>
          {content}
        </InvitationScrollReveal>
      </div>
    );
  });

  const standardPage = (
    <InvitationPageCanvas
      layout={compiledLayout}
      mode={mode}
      isEditMode={isEditMode}
      wrapperClassName={wrapperClassName}
    >
      {renderedBlocks}
    </InvitationPageCanvas>
  );
  if (definition?.pageRenderer.kind === "custom") {
    return renderCustomInvitationPage(definition.pageRenderer.componentId, {
      layout: compiledLayout,
      data,
      children: renderedBlocks,
      mode,
      isEditMode,
      wrapperClassName,
    }, standardPage);
  }

  return standardPage;
}
