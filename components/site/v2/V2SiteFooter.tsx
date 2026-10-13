"use client";

import { useTranslations } from "next-intl";
import type { ContentDoc } from "@/lib/website-content";
import { sanitizeUrl } from "@/lib/sanitize-html";
import type { TemplateSourceMapEntry, ResolvedNavigationItem } from "@/lib/website-template-resolver";
import type { WebsiteTemplateV2 } from "@/lib/website-template-v2";
import type { StorefrontFeatureState } from "@/lib/storefront-features";
import type { ResolvedTodayHours } from "@/lib/website-hours";

interface V2SiteFooterProps {
  template: WebsiteTemplateV2;
  content: ContentDoc;
  navigation: ResolvedNavigationItem[];
  siteTitle: string;
  siteSlug: string;
  previewMode?: boolean;
  sampleContent?: ContentDoc;
  editMode?: boolean;
  sourceMap?: Record<string, TemplateSourceMapEntry>;
  storefrontFeatures?: StorefrontFeatureState;
  todayHours?: ResolvedTodayHours | null;
}

function valueFor(
  content: ContentDoc,
  sampleContent: ContentDoc | undefined,
  key: keyof ContentDoc,
  previewMode: boolean
): unknown {
  const live = content[key];
  if (typeof live === "string" ? live.trim() : live !== undefined && live !== null) return live;
  return previewMode ? sampleContent?.[key] : undefined;
}

function editablePath(
  editMode: boolean | undefined,
  sourceMap: Record<string, TemplateSourceMapEntry> | undefined,
  path: string
): { "data-element-path"?: string; "data-sample-content"?: "true" } {
  const entry = editMode ? sourceMap?.[path] : undefined;
  return entry
    ? {
        "data-element-path": path,
        ...(entry.sampled ? { "data-sample-content": "true" as const } : {}),
      }
    : {};
}

export function V2SiteFooter({
  template,
  content,
  navigation,
  siteTitle,
  siteSlug,
  previewMode = false,
  sampleContent,
  editMode,
  sourceMap,
  storefrontFeatures,
  todayHours,
}: V2SiteFooterProps) {
  const tStorefront = useTranslations("Storefront");
  const businessNameValue = valueFor(content, sampleContent, "business_name", previewMode);
  const businessName =
    typeof businessNameValue === "string" && businessNameValue.trim()
      ? businessNameValue.trim()
      : editMode && sourceMap?.businessName
        ? "Add business name"
        : siteTitle;
  const noteValue = valueFor(content, sampleContent, "footer_note", previewMode);
  const footerNote = typeof noteValue === "string" && noteValue.trim() ? noteValue.trim() : undefined;
  const rawSocials = valueFor(content, sampleContent, "socials", previewMode);
  const socials = rawSocials && typeof rawSocials === "object"
    ? rawSocials as Record<string, unknown>
    : {};
  const rawLabels = valueFor(content, sampleContent, "nav_labels", previewMode);
  const labels = rawLabels && typeof rawLabels === "object"
    ? rawLabels as Record<string, unknown>
    : {};
  const sampleLabels = sampleContent?.nav_labels && typeof sampleContent.nav_labels === "object"
    ? sampleContent.nav_labels as Record<string, unknown>
    : {};
  const footerBand = template.templateBackground.bands.find((band) => band.zone === "footer");
  const backgroundColor = footerBand?.color || template.templateBackground.base;
  const foregroundColor = footerBand?.color ? "#ffffff" : "#18181b";
  const safeSocials = template.footer.showSocials
    ? ["instagram", "facebook", "tiktok", "x"].flatMap((network) => {
        const raw = socials[network];
        const href = typeof raw === "string" ? sanitizeUrl(raw) : "";
        return href ? [{ network, href }] : [];
      })
    : [];
  const visibleNavigation = navigation.filter((item) => !item.feature || storefrontFeatures?.[item.feature]);
  const hoursLine = todayHours?.closed
    ? tStorefront("closed")
    : todayHours?.open && todayHours.close
      ? `${todayHours.open}–${todayHours.close}${todayHours.overnight ? ` (${tStorefront("nextDay")})` : ""}`
      : undefined;

  return (
    <footer
      className="mt-auto border-t border-black/10"
      style={{ backgroundColor, color: foregroundColor, fontFamily: "var(--v2-heading-font)" }}
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 md:grid-cols-3 md:px-8">
        <div className="space-y-3">
          <a
            href={sanitizeUrl("/site/" + encodeURIComponent(siteSlug))}
            {...editablePath(editMode, sourceMap, "businessName")}
            className="inline-block text-lg font-semibold"
          >
            {businessName}
          </a>
          {footerNote && (
            <p {...editablePath(editMode, sourceMap, "footerNote")} className="max-w-sm text-sm opacity-80">
              {footerNote}
            </p>
          )}
          {editMode && sourceMap?.footerNote && !footerNote && (
            <p {...editablePath(editMode, sourceMap, "footerNote")} className="text-sm opacity-70">
              Add a footer note
            </p>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Explore</h2>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-4 gap-y-2">
            {visibleNavigation.map((item, index) => {
              const href = sanitizeUrl(item.href);
              const key = item.href.includes("#")
                ? (() => {
                    const anchor = item.href.slice(item.href.indexOf("#") + 1).split(/[/?]/)[0];
                    return anchor === "how-it-works" ? "how" : anchor;
                  })()
                : item.pageSlug === "home"
                  ? "home"
                  : item.pageSlug === "contact"
                    ? "contact"
                    : item.href.replace(/^\/+|\/+$/g, "");
              const labelValue = labels[key] || (previewMode ? sampleLabels[key] : undefined);
              const label = typeof labelValue === "string" && labelValue.trim() ? labelValue.trim() : item.label;
              const path = "navigation[" + index + "].label";
              return href ? (
                <a key={item.id} {...editablePath(editMode, sourceMap, path)} href={href} className="text-sm opacity-80 hover:opacity-100">
                  {label}
                </a>
              ) : null;
            })}
          </nav>
          {safeSocials.length > 0 && (
            <div className="flex flex-wrap gap-3 pt-1">
              {safeSocials.map(({ network, href }) => (
                <a
                  key={network}
                  {...editablePath(editMode, sourceMap, "socials." + network)}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm capitalize underline-offset-4 hover:underline"
                >
                  {network === "x" ? "X" : network}
                </a>
              ))}
            </div>
          )}
        </div>

        {(hoursLine || (editMode && sourceMap?.hours)) && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide">{tStorefront("hours")}</h2>
            {hoursLine ? (
              <p {...editablePath(editMode, sourceMap, todayHours ? "hours." + todayHours.day : "hours")} className="text-sm opacity-85">
                {tStorefront("today")}: {hoursLine}
              </p>
            ) : (
              <p {...editablePath(editMode, sourceMap, "hours")} className="text-sm opacity-75">
                {tStorefront("addOpeningHours")}
              </p>
            )}
          </div>
        )}
      </div>
    </footer>
  );
}
