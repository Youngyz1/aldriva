"use client";

/**
 * components/invitation/InvitationTemplateSelect.tsx
 *
 * Template picker: an accessible native dropdown plus a static thumbnail
 * grid. Thumbnails are static (palette swatch mock, or a static image file
 * when `thumbnailUrl` is provided for a template) — never live iframes.
 * Hovering or tapping a thumbnail enlarges it with the template
 * description. Selecting a template applies instantly (parent updates the
 * draft + live preview; the template-switch warning lives in Publish).
 */

import { useState } from "react";
import { Check } from "lucide-react";
import { INVITATION_TEMPLATES } from "@/components/invitation/templates/registry";
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

function TemplateThumbnail({ templateId, name, large }: { templateId: string; name: string; large?: boolean }) {
  const staticUrl = STATIC_THUMBNAIL_BY_TEMPLATE[templateId] ?? null;
  const swatch = SWATCH_BY_TEMPLATE[templateId] ?? { bg: "#FFFFFF", ink: "#18181B", accent: "#C2410C" };
  return (
    <div
      className={cn("relative w-full overflow-hidden rounded-lg border border-zinc-200", large ? "aspect-[4/3]" : "aspect-[16/10]")}
      style={{ background: swatch.bg }}
      role="img"
      aria-label={`${name} template preview`}
    >
      {staticUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={staticUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2">
          <div className="h-1.5 w-2/3 rounded-full" style={{ background: swatch.accent }} />
          <div className="h-2 w-1/2 rounded-full" style={{ background: swatch.ink, opacity: 0.85 }} />
          <div className="h-1.5 w-1/3 rounded-full" style={{ background: swatch.ink, opacity: 0.4 }} />
          <div
            className="mt-1 flex items-center justify-center rounded-sm px-2 py-0.5 text-[8px] font-black uppercase tracking-widest"
            style={{ background: swatch.accent, color: swatch.bg }}
          >
            {name}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  value: string;
  onChange: (templateId: string) => void;
  invitationType: InvitationType | null;
  disabled?: boolean;
}

export function InvitationTemplateSelect({ value, onChange, invitationType, disabled }: Props) {
  const [enlargedId, setEnlargedId] = useState<string | null>(null);
  const { matching, others } = orderTemplatesForType(INVITATION_TEMPLATES, invitationType);

  return (
    <div className="space-y-3">
      <label htmlFor="invitation-template" className="text-xs font-bold text-zinc-700">
        Template
      </label>
      <select
        id="invitation-template"
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 disabled:bg-zinc-50"
      >
        {matching.length > 0 && (
          <optgroup label={`For ${invitationType}`}>
            {matching.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} — {t.categoryLabel}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={matching.length > 0 ? "All templates" : "Templates"}>
          {(matching.length > 0 ? others : INVITATION_TEMPLATES).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.categoryLabel}
            </option>
          ))}
        </optgroup>
      </select>

      {/* Static thumbnail grid (no live iframes) */}
      <div className="grid grid-cols-2 gap-2">
        {INVITATION_TEMPLATES.map((t) => {
          const selected = value === t.id;
          const enlarged = enlargedId === t.id;
          return (
            <div key={t.id} className="space-y-1">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(t.id)}
                onMouseEnter={() => setEnlargedId(t.id)}
                onMouseLeave={() => setEnlargedId((cur) => (cur === t.id ? null : cur))}
                onFocus={() => setEnlargedId(t.id)}
                onBlur={() => setEnlargedId((cur) => (cur === t.id ? null : cur))}
                aria-pressed={selected}
                aria-label={`Use ${t.name} template`}
                className={cn(
                  "relative block w-full rounded-xl border-2 p-1 transition disabled:opacity-50",
                  selected
                    ? "border-orange-600 ring-2 ring-orange-500"
                    : "border-zinc-200 bg-white hover:border-zinc-300"
                )}
              >
                <TemplateThumbnail templateId={t.id} name={t.name} large={enlarged} />
                {selected && (
                  <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-orange-600 text-white">
                    <Check size={12} />
                  </span>
                )}
              </button>
              <p className="text-[11px] font-bold text-zinc-700">{t.name}</p>
              {enlarged && <p className="text-[11px] text-zinc-500">{t.description}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
