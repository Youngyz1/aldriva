"use client";

/**
 * components/invitation/InvitationTypePicker.tsx
 *
 * First-screen choice of the invitation builder (and, by design, of the
 * future Create Invitation flow): wedding / birthday / gala / other.
 *
 * Reusable by contract: `value` + `onChange` + optional `compact`.
 * It never touches draft data itself — the parent maps the choice to a
 * suggested template and visible fields (lib/invitation-type-fields.ts).
 */

import { Cake, Gift, Heart, Sparkles } from "lucide-react";
import type { InvitationType } from "@/lib/invitation-type-fields";
import { INVITATION_TYPES } from "@/lib/invitation-type-fields";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<InvitationType, typeof Heart> = {
  wedding: Heart,
  birthday: Cake,
  gala: Sparkles,
  other: Gift,
};

interface Props {
  value: InvitationType | null;
  onChange: (type: InvitationType) => void;
  /** Compact single-row layout for reuse inside tight surfaces. */
  compact?: boolean;
  disabled?: boolean;
}

export function InvitationTypePicker({ value, onChange, compact, disabled }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Type of invitation"
      className={cn("grid gap-2", compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2")}
    >
      {INVITATION_TYPES.map((option) => {
        const Icon = TYPE_ICON[option.id];
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(option.id)}
            className={cn(
              "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition disabled:opacity-50",
              selected
                ? "border-orange-600 bg-orange-50 ring-2 ring-orange-500"
                : "border-zinc-200 bg-white hover:bg-zinc-50"
            )}
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                selected ? "bg-orange-600 text-white" : "bg-zinc-100 text-zinc-500"
              )}
            >
              <Icon size={16} />
            </span>
            <span>
              <span className={cn("block text-sm font-bold", selected ? "text-orange-800" : "text-zinc-900")}>
                {option.label}
              </span>
              {!compact && <span className="block text-[11px] text-zinc-500">{option.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
