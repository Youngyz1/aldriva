"use client";

/**
 * Builder Gallery section — a gallery-layout selector plus a thin wrapper over
 * InvitationGalleryManager (up/down reorder, delete, alt text, 12 max,
 * per-item retry).
 *
 * The layout choice is stored as `presentation` on the `gallery` block content
 * (no schema migration), so the builder preview and the published invitation
 * render the exact same layout. "Template default" removes the override and
 * restores the template's code-owned gallery presentation.
 */

import type { BuilderDraft } from "../InvitationPageBuilder";
import { InvitationGalleryManager } from "@/components/invitation/InvitationGalleryManager";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import {
  getDefaultInvitationTemplateDefinition,
  getInvitationTemplateDefinition,
  isInvitationGalleryPresentation,
  type InvitationGalleryPresentation,
} from "@/lib/invitation-template-registry";
import { cn } from "@/lib/utils";

interface Props {
  eventId: string;
  draft: BuilderDraft;
  updateDraft: (patch: Partial<BuilderDraft>) => void;
  disabled?: boolean;
}

type LayoutChoice = "default" | InvitationGalleryPresentation;

const LAYOUT_LABELS: Record<InvitationGalleryPresentation, string> = {
  editorial: "Editorial grid",
  romantic: "Framed",
  botanical: "Masonry columns",
  "black-tie": "Masonry columns",
  birthday: "Polaroid grid",
  cover: "Masonry columns",
  accordion: "Image accordion",
};

const LAYOUT_OPTIONS: { id: LayoutChoice; label: string; hint: string }[] = [
  { id: "default", label: "Template default", hint: "Keep the layout this template was designed with." },
  { id: "editorial", label: "Editorial grid", hint: "Even grid with a featured first photo." },
  { id: "cover", label: "Masonry columns", hint: "Natural-ratio columns of varying height." },
  { id: "accordion", label: "Image accordion", hint: "Expandable photo panels — crops photos to fit each panel." },
];

export function GallerySection({ eventId, draft, updateDraft, disabled }: Props) {
  const definition = getInvitationTemplateDefinition(draft.template_id) ?? getDefaultInvitationTemplateDefinition();
  const layout = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
  const galleryBlock = layout.layout_blocks.find((block) => block.type === "gallery");
  const rawPresentation = galleryBlock?.content.presentation;
  const selected: LayoutChoice = isInvitationGalleryPresentation(rawPresentation) ? rawPresentation : "default";
  const defaultLabel = LAYOUT_LABELS[definition.galleryPresentation ?? "editorial"];

  function setLayout(next: LayoutChoice) {
    const current = legacyInvitationTemplateToLayout(draft.template_id, draft.blocks_layout);
    const layout_blocks = current.layout_blocks.map((block) => {
      if (block.type !== "gallery") return block;
      const content = { ...block.content };
      if (next === "default") {
        delete content.presentation;
      } else {
        content.presentation = next;
      }
      return { ...block, content };
    });
    updateDraft({ blocks_layout: { ...current, layout_blocks } });
  }

  return (
    <div className="space-y-5">
      <section aria-labelledby="invitation-gallery-layout-heading" className="space-y-3">
        <div>
          <h3 id="invitation-gallery-layout-heading" className="text-xs font-bold uppercase tracking-wider text-zinc-500">
            Gallery layout
          </h3>
          <p className="mt-1 text-[11px] text-zinc-500">
            Applies to the photo gallery on both the preview and the published invitation.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {LAYOUT_OPTIONS.map((option) => {
            const isSelected = selected === option.id;
            const label = option.id === "default" ? `${option.label} (${defaultLabel})` : option.label;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isSelected}
                disabled={disabled}
                onClick={() => setLayout(option.id)}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition disabled:opacity-50",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600",
                  isSelected ? "border-orange-600 bg-orange-50 ring-1 ring-orange-600" : "border-zinc-200 hover:border-zinc-400",
                )}
              >
                <span className="block text-sm font-semibold text-zinc-900">{label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{option.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="border-t border-zinc-200 pt-5">
        <InvitationGalleryManager
          eventId={eventId}
          items={draft.gallery || []}
          onChange={(gallery) => updateDraft({ gallery })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
