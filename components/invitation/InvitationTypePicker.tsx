"use client";

/**
 * Accessible invitation type dropdown. The parent owns confirmation and the
 * saved draft; this control only reports a requested type change.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Cake, ChevronDown, Gift, Heart, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { InvitationType } from "@/lib/invitation-type-fields";
import { INVITATION_TYPES } from "@/lib/invitation-type-fields";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<InvitationType, typeof Heart> = {
  wedding: Heart,
  birthday: Cake,
  gala: Sparkles,
  other: Gift,
};

const TYPE_MESSAGES = {
  wedding: { name: "invitationTypeWedding", description: "invitationTypeWeddingDescription" },
  birthday: { name: "invitationTypeBirthday", description: "invitationTypeBirthdayDescription" },
  gala: { name: "invitationTypeGala", description: "invitationTypeGalaDescription" },
  other: { name: "invitationTypeOther", description: "invitationTypeOtherDescription" },
} as const satisfies Record<InvitationType, { name: string; description: string }>;

interface Props {
  value: InvitationType | null;
  onChange: (type: InvitationType) => void;
  /** Kept for existing compact consumers; the dropdown stays one column. */
  compact?: boolean;
  disabled?: boolean;
}

export function InvitationTypePicker({ value, onChange, compact, disabled }: Props) {
  const t = useTranslations("Events");
  const listId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const selectedIndex = INVITATION_TYPES.findIndex((option) => option.id === value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(Math.max(0, selectedIndex));
  const selected = selectedIndex >= 0 ? INVITATION_TYPES[selectedIndex] : null;
  const Icon = selected ? TYPE_ICON[selected.id] : Gift;

  useEffect(() => {
    if (open && activeIndex >= 0) {
      optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, open]);

  function closeAndReturnFocus() {
    setOpen(false);
    setActiveIndex(Math.max(0, selectedIndex));
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function choose(index: number) {
    const option = INVITATION_TYPES[index];
    if (!option) return;
    setOpen(false);
    setActiveIndex(index);
    if (option.id !== value) onChange(option.id);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
        return;
      }
      setActiveIndex((current) =>
        event.key === "ArrowDown"
          ? Math.min(INVITATION_TYPES.length - 1, current + 1)
          : Math.max(0, current - 1)
      );
    } else if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(INVITATION_TYPES.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex);
      else {
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      closeAndReturnFocus();
    } else if (event.key === "Tab" && open) {
      setOpen(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <span id={`${listId}-label`} className="sr-only">
        {t("invitationTypePickerLabel")}
      </span>
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={`${listId}-options`}
          aria-activedescendant={open ? `${listId}-option-${activeIndex}` : undefined}
          aria-labelledby={`${listId}-label ${listId}-selected`}
          onClick={() => {
            if (open) setOpen(false);
            else {
              setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
              setOpen(true);
            }
          }}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-left shadow-xs transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2 disabled:opacity-50",
            compact && "py-2"
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-800" aria-hidden="true">
            <Icon size={17} />
          </span>
          <span id={`${listId}-selected`} className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-zinc-900">
              {selected ? t(TYPE_MESSAGES[selected.id].name) : t("invitationTypeChoose")}
            </span>
            {selected && (
              <span className="block truncate text-xs text-zinc-700">
                {t(TYPE_MESSAGES[selected.id].description)}
              </span>
            )}
          </span>
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={cn("shrink-0 text-zinc-700 transition-transform", open && "rotate-180")}
          />
        </button>

        {open && (
          <ul
            id={`${listId}-options`}
            role="listbox"
            aria-labelledby={`${listId}-label`}
            className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-zinc-300 bg-white py-1 shadow-lg"
          >
            {INVITATION_TYPES.map((option, index) => {
              const OptionIcon = TYPE_ICON[option.id];
              const active = index === activeIndex;
              const isSelected = option.id === value;
              return (
                <li
                  key={option.id}
                  id={`${listId}-option-${index}`}
                  ref={(node) => { optionRefs.current[index] = node; }}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => choose(index)}
                  className={cn(
                    "flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2 text-left",
                    active ? "bg-zinc-100" : "bg-white",
                    isSelected && "border-l-4 border-orange-700 bg-orange-50"
                  )}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-800" aria-hidden="true">
                    <OptionIcon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-zinc-900">
                      {t(TYPE_MESSAGES[option.id].name)}
                    </span>
                    <span className="block line-clamp-1 text-xs text-zinc-700">
                      {t(TYPE_MESSAGES[option.id].description)}
                    </span>
                  </span>
                  {isSelected && (
                    <span className="shrink-0 text-xs font-bold text-orange-900">{t("invitationTypeSelected")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
