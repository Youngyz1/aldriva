"use client";

/**
 * components/invitation/InvitationTemplatePicker.tsx
 *
 * Single-source template picker for both the dashboard event builder and
 * any event creation flow. Reads published templates from getPublicTemplateCatalog()
 * so the registry is always the single source of truth.
 *
 * Displays both minimalism-dark-blue and burgundy-gold, while keeping unlisted
 * fixture templates hidden unless explicitly flagged via INVITATION_UNLISTED_TEMPLATE_IDS.
 */

import { useId } from "react";
import { IconCheck as Check } from "@tabler/icons-react";
import { getPublicTemplateCatalog, type PublicTemplateSummary } from "@/lib/invitation-template-public-catalog";
import { InvitationTemplatePreviewFrame } from "@/components/invitation/marketplace/InvitationTemplatePreviewFrame";
import { cn } from "@/lib/utils";

export function getInvitationTemplatesForPicker(): PublicTemplateSummary[] {
  return getPublicTemplateCatalog();
}

interface Props {
  value: string;
  onSelect: (templateId: string) => void;
  disabled?: boolean;
  className?: string;
}

export function InvitationTemplatePicker({ value, onSelect, disabled = false, className = "" }: Props) {
  const groupId = useId();
  const templates = getInvitationTemplatesForPicker();

  return (
    <div
      role="radiogroup"
      aria-labelledby={groupId}
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)}
    >
      <span id={groupId} className="sr-only">
        Choose an invitation template
      </span>
      {templates.map((template) => {
        const isSelected = template.id === value;
        return (
          <button
            key={template.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(template.id)}
            className={cn(
              "group relative flex items-start gap-3 rounded-xl border p-3 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600",
              isSelected
                ? "border-orange-600 bg-orange-50/30 ring-1 ring-orange-600"
                : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <InvitationTemplatePreviewFrame
              templateId={template.id}
              ariaLabel={template.name}
              className="aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-lg border border-zinc-200"
              eager
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-black uppercase tracking-wide text-orange-600">
                  {template.categoryLabel}
                </p>
                {isSelected && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-orange-700">
                    <Check size={14} className="stroke-[3]" aria-hidden="true" />
                    Selected
                  </span>
                )}
              </div>
              <h4 className="mt-0.5 text-sm font-bold text-zinc-950">{template.name}</h4>
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                {template.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
