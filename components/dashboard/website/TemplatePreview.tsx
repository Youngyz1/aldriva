"use client";

import type { CanonicalTemplate } from "@/lib/website-template-registry";
import { isBlockVisible } from "@/lib/website-blocks";
import { getSpacingClass, getBackgroundStyle } from "@/lib/section-helpers";

interface TemplatePreviewProps {
  template: CanonicalTemplate;
  mode?: "desktop" | "mobile";
}

export function TemplatePreview({ template, mode = "desktop" }: TemplatePreviewProps) {
  const homePage = template.pages.find((p) => p.isHome) ?? template.pages[0];
  if (!homePage) return null;
  // Do not mutate canonical — read-only view
  const blocks = homePage.blocks;

  const containerClass = mode === "mobile" ? "max-w-[390px] mx-auto" : "max-w-full";

  return (
    <div className={containerClass}>
      <div className="bg-white overflow-hidden rounded-xl border border-zinc-200 shadow-xs">
        <div
          className="h-10 flex items-center px-4 text-xs font-semibold text-white"
          style={{ backgroundColor: template.theme.primaryColor || template.previewColor }}
        >
          <span className="truncate">{template.name} — Preview</span>
        </div>
        <div className="max-h-[480px] overflow-auto">
          {blocks.map((block, idx) => {
            const raw = block as unknown as Record<string, unknown>;
            if (!isBlockVisible(block as never)) return null;
            const spacingClass = raw.spacing ? getSpacingClass(raw.spacing as never) : "";
            const bg = raw.background as never;
            const bgStyle = bg ? getBackgroundStyle(bg) : undefined;
            const heading = (raw.heading as string) || (raw.html as string)?.slice(0, 60) || block.type;
            return (
              <div
                key={`${(block as { id?: string }).id ?? idx}-${template.id}`}
                className={`border-b border-zinc-100 px-4 py-3 ${spacingClass}`}
                style={bgStyle as React.CSSProperties}
              >
                <p className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  {(block.type as string).replace("_", " ")}
                </p>
                <p className="text-sm font-semibold text-zinc-900 truncate">{heading}</p>
                {raw.subheading ? (
                  <p className="text-xs text-zinc-600 line-clamp-2">{String(raw.subheading)}</p>
                ) : null}
              </div>
            );
          })}
        </div>
        <div className="h-8 flex items-center justify-center px-4 text-[11px] text-zinc-500 border-t border-zinc-100 bg-zinc-50">
          Footer — configured · {template.navigation.length} nav items
        </div>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500 text-center">
        {blocks.length} sections · {template.version} · {mode} · {template.style}
      </p>
    </div>
  );
}
