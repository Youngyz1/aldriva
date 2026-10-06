"use client";

/**
 * components/invitation/InvitationTemplateSelect.tsx
 *
 * Pure template dropdown: a single custom listbox (keyboard accessible).
 * Each option shows a small static thumbnail + name + type. Templates
 * matching the chosen type come first, then "All templates". Selecting
 * closes the menu and applies to the preview instantly.
 *
 * Layout stability: the option list is an absolutely-positioned popover,
 * so nothing in the section changes height or shifts while choosing.
 * The menu scrolls (max height) so it scales from 4 templates to many.
 */

import { useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { INVITATION_TEMPLATES, type TemplateRegistryItem } from "@/components/invitation/templates/registry";
import { orderTemplatesForType, type InvitationType } from "@/lib/invitation-type-fields";
import { cn } from "@/lib/utils";

/**
 * Static thumbnail slot per page template. Drop finished static artwork
 * into `public/images/invitation-pages/<file>` and set `thumbnailUrl` —
 * no code changes needed. Until then the palette swatch renders.
 */
const STATIC_THUMBNAIL_BY_TEMPLATE: Record<string, string | null> = {
  "gala-editorial": null,
  "black-tie": null,
  "wedding-romantic": null,
  "birthday-bold": null,
};

/** Solid palette swatch per template (no gradients, per design rules). */
const SWATCH_BY_TEMPLATE: Record<string, { bg: string; ink: string; accent: string }> = {
  "gala-editorial": { bg: "#F8F5F0", ink: "#1C1A18", accent: "#7A5C3A" },
  "black-tie": { bg: "#09090B", ink: "#FFFFFF", accent: "#FBBF24" },
  "wedding-romantic": { bg: "#FAF8F5", ink: "#2C2220", accent: "#A37068" },
  "birthday-bold": { bg: "#FFFDF7", ink: "#141218", accent: "#FF5E5B" },
};

function StaticThumbnail({ templateId, name }: { templateId: string; name: string }) {
  const staticUrl = STATIC_THUMBNAIL_BY_TEMPLATE[templateId] ?? null;
  const swatch = SWATCH_BY_TEMPLATE[templateId] ?? { bg: "#FFFFFF", ink: "#18181B", accent: "#C2410C" };
  return (
    <span
      className="relative block h-9 w-14 shrink-0 overflow-hidden rounded-md border border-zinc-200"
      style={{ background: swatch.bg }}
      role="img"
      aria-label={`${name} template thumbnail`}
    >
      {staticUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={staticUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 p-1">
          <span className="h-1 w-2/3 rounded-full" style={{ background: swatch.accent }} />
          <span className="h-1 w-1/2 rounded-full" style={{ background: swatch.ink, opacity: 0.85 }} />
          <span className="h-1 w-1/3 rounded-full" style={{ background: swatch.ink, opacity: 0.4 }} />
        </span>
      )}
    </span>
  );
}

interface Props {
  value: string;
  onChange: (templateId: string) => void;
  invitationType: InvitationType | null;
  disabled?: boolean;
}

export function InvitationTemplateSelect({ value, onChange, invitationType, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const { matching, others } = orderTemplatesForType(INVITATION_TEMPLATES, invitationType);

  const groups: { label: string | null; options: TemplateRegistryItem[] }[] =
    matching.length > 0
      ? [
          { label: `For ${invitationType}`, options: matching },
          { label: "All templates", options: others },
        ]
      : [{ label: null, options: INVITATION_TEMPLATES }];

  const flat = groups.flatMap((g) => g.options);
  const selected = INVITATION_TEMPLATES.find((t) => t.id === value) ?? INVITATION_TEMPLATES[0];

  function select(index: number) {
    const option = flat[index];
    if (!option) return;
    onChange(option.id);
    setOpen(false);
    setActiveIndex(-1);
    buttonRef.current?.focus();
  }

  function moveActive(delta: number) {
    setActiveIndex((cur) => {
      const next = cur + delta;
      if (next < 0) return flat.length - 1;
      if (next >= flat.length) return 0;
      return next;
    });
  }

  function handleButtonKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(0, flat.findIndex((t) => t.id === value)));
      } else {
        moveActive(e.key === "ArrowDown" ? 1 : -1);
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open && activeIndex >= 0) select(activeIndex);
      else setOpen(true);
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      }
    } else if (e.key === "Home" && open) {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End" && open) {
      e.preventDefault();
      setActiveIndex(flat.length - 1);
    }
  }

  let optionCursor = -1;

  return (
    <div className="space-y-2">
      <span id={`${listId}-label`} className="text-xs font-bold text-zinc-700">
        Template
      </span>
      <div
        className="relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setOpen(false);
            setActiveIndex(-1);
          }
        }}
      >
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${listId}-label`}
          aria-activedescendant={open && activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={handleButtonKeyDown}
          className="flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left transition hover:bg-zinc-50 disabled:opacity-50"
        >
          <StaticThumbnail templateId={selected.id} name={selected.name} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-zinc-900">{selected.name}</span>
            <span className="block truncate text-[11px] text-zinc-500">{selected.categoryLabel}</span>
          </span>
          <ChevronDown size={15} className={cn("shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={`${listId}-label`}
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
          >
            {groups.map((group) => (
              <li key={group.label ?? "all"} role="presentation">
                {group.label && (
                  <div role="presentation" className="px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-wider text-zinc-400">
                    {group.label}
                  </div>
                )}
                <ul role="group" aria-label={group.label ?? "Templates"}>
                  {group.options.map((t) => {
                    optionCursor += 1;
                    const index = optionCursor;
                    const isActive = index === activeIndex;
                    const isSelected = t.id === value;
                    return (
                      <li
                        key={t.id}
                        id={`${listId}-option-${index}`}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => select(index)}
                        onMouseMove={() => setActiveIndex(index)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 px-3 py-2",
                          isActive ? "bg-orange-50" : "bg-white",
                          isSelected && "font-bold"
                        )}
                      >
                        <StaticThumbnail templateId={t.id} name={t.name} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-bold text-zinc-900">{t.name}</span>
                          <span className="block truncate text-[11px] text-zinc-500">{t.categoryLabel}</span>
                        </span>
                        {isSelected && <Check size={14} className="shrink-0 text-orange-600" />}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
