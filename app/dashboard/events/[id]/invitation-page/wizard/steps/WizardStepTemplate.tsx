"use client";

import React from "react";
import { INVITATION_TEMPLATES, TemplateCategory } from "@/components/invitation/templates/registry";
import { Check } from "lucide-react";
import type { WizardDraft } from "../InvitationPageWizard";
import type { EventLiveFields } from "@/lib/types/invitation-page-snapshot";

interface StepProps {
  eventId: string;
  draft: WizardDraft;
  event: EventLiveFields;
  updateDraft: (patch: Partial<WizardDraft>) => void;
  disabled?: boolean;
}

const CATEGORY_ORDER: { id: TemplateCategory; label: string }[] = [
  { id: "gala_corporate", label: "Gala & Corporate" },
  { id: "wedding", label: "Wedding" },
  { id: "birthday", label: "Birthday Celebration" },
];

export function WizardStepTemplate({ draft, updateDraft, disabled }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-bold text-zinc-900">Choose an Invitation Template</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Select a layout that fits your event. You can customize the wording, imagery, and sections in the next steps.
        </p>
      </div>

      <div className="space-y-6">
        {CATEGORY_ORDER.map(({ id: catId, label }) => {
          const templates = INVITATION_TEMPLATES.filter((t) => t.category === catId);
          if (templates.length === 0) return null;

          return (
            <div key={catId} className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">{label}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {templates.map((tpl) => {
                  const isSelected = draft.template_id === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => updateDraft({ template_id: tpl.id })}
                      className={`relative flex flex-col justify-between rounded-xl border p-4 text-left transition ${
                        isSelected
                          ? "border-orange-500 bg-orange-50/50 shadow-xs ring-2 ring-orange-500"
                          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
                      } disabled:opacity-50`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-zinc-950">{tpl.name}</span>
                          {isSelected && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-white">
                              <Check size={12} strokeWidth={3} />
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-600 leading-relaxed">{tpl.description}</p>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <span className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
                          {tpl.categoryLabel}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
