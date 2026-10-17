"use client";

import { useTranslations } from "next-intl";
import type { MouseEvent } from "react";
import type { ContentDoc } from "@/lib/website-content";
import { readableOn } from "@/lib/readable-on";
import { sanitizeUrl } from "@/lib/sanitize-html";
import { getSitePageSlug, getSitePageHref, resolveSiteHref } from "@/lib/site-paths";
import type { TemplateSourceMapEntry, ResolvedNavigationItem } from "@/lib/website-template-resolver";
import type { WebsiteTemplateV2 } from "@/lib/website-template-v2";
import { resolveV2ThemeColor } from "@/lib/website-v2-color-resolution";
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
  availablePageSlugs?: readonly string[] | ReadonlySet<string>;
  todayHours?: ResolvedTodayHours | null;
  onPageNavigate?: (pageSlug: string) => void;
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
  availablePageSlugs,
  todayHours,
  onPageNavigate,
}: V2SiteFooterProps) {
  const tStorefront = useTranslations("Storefront");
  const businessNameValue = valueFor(content, sampleContent, "business_name", previewMode);
  const businessName =
    typeof businessNameValue === "string" && businessNameValue.trim()
      ? businessNameValue.trim()
      : siteTitle;
  const noteValue = valueFor(content, sampleContent, "footer_note", previewMode);
  const footerNote = typeof noteValue === "string" && noteValue.trim() ? noteValue.trim() : undefined;
  const addressValue = valueFor(content, sampleContent, "address", previewMode);
  const address = typeof addressValue === "string" && addressValue.trim() ? addressValue.trim() : undefined;
  const phoneValue = valueFor(content, sampleContent, "phone", previewMode);
  const phone = typeof phoneValue === "string" && phoneValue.trim() ? phoneValue.trim() : undefined;
  const directionsValue = valueFor(content, sampleContent, "directions_url", previewMode);
  const directionsUrl = typeof directionsValue === "string" ? sanitizeUrl(directionsValue) : "";
  const safePhone = phone ? sanitizeUrl(`tel:${phone}`) : "";
  const mapHref = address
    ? directionsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : "";
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
  const backgroundColor = resolveV2ThemeColor(footerBand?.color ?? template.templateBackground.base, template.id);
  const foregroundColor = readableOn(backgroundColor, ["#22201c", "#ffffff"]);
  const safeSocials = template.footer.showSocials
    ? ["instagram", "facebook", "tiktok", "x"].flatMap((network) => {
        const raw = socials[network];
        const href = typeof raw === "string" ? sanitizeUrl(raw) : "";
        return href ? [{ network, href }] : [];
      })
    : [];
  const availablePages = availablePageSlugs ? new Set(availablePageSlugs) : undefined;
  const visibleNavigation = navigation.filter((item) =>
    (!item.feature || storefrontFeatures?.[item.feature]) &&
    (!item.pageSlug || !availablePages || availablePages.has(item.pageSlug))
  );
  const hoursLine = todayHours?.closed
    ? tStorefront("closed")
    : todayHours?.open && todayHours.close
      ? `${todayHours.open}–${todayHours.close}${todayHours.overnight ? ` (${tStorefront("nextDay")})` : ""}`
      : undefined;
  const navigatePreview = (event: MouseEvent<HTMLAnchorElement>, href: string, pageSlug?: string | null) => {
    const targetPageSlug = pageSlug ?? getSitePageSlug(siteSlug, href);
    if (!onPageNavigate || !targetPageSlug) return;
    event.preventDefault();
    onPageNavigate(targetPageSlug);
  };

  return (
    <footer
      className="mt-auto border-t border-[var(--ps-border)]/10"
      style={{
        backgroundColor,
        color: foregroundColor,
        fontFamily: "var(--ps-font-body)",
        ...(template.id === "restaurant-table-flame" ? { borderTopColor: "#3a3632" } : {}),
      }}
    >
      <div
        className={template.id === "restaurant-table-flame"
          ? "mx-auto grid w-full max-w-6xl gap-[var(--ps-space-12)] px-6 py-[var(--ps-space-12)]"
          : "mx-auto grid max-w-7xl gap-[var(--ps-space-12)] px-[var(--ps-space-6)] py-[var(--ps-space-12)] md:px-[var(--ps-space-8)]"}
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))" }}
      >
        <div className="space-y-[var(--ps-space-3)]">
          <a
            href={sanitizeUrl(getSitePageHref(siteSlug, "home"))}
            {...editablePath(editMode, sourceMap, "businessName")}
            className="inline-block text-lg font-semibold"
            onClick={(event) => navigatePreview(event, getSitePageHref(siteSlug, "home"), "home")}
          >
            {businessName}
          </a>
          {footerNote && (
            <p {...editablePath(editMode, sourceMap, "footerNote")} className="max-w-sm text-sm opacity-80">
              {footerNote}
            </p>
          )}
        </div>

        <div className="space-y-[var(--ps-space-3)]">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Explore</h2>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-[var(--ps-space-4)] gap-y-[var(--ps-space-2)]">
            {visibleNavigation.length === 0 ? (
              <a href={sanitizeUrl(getSitePageHref(siteSlug, "home"))} className="text-sm opacity-80 hover:opacity-100">
                Home
              </a>
            ) : visibleNavigation.map((item, index) => {
              const scopedHref = item.pageSlug
                ? getSitePageHref(siteSlug, item.pageSlug, item.anchor)
                : resolveSiteHref(siteSlug, item.href);
              const href = sanitizeUrl(scopedHref);
              const key = item.anchor === "how-it-works"
                ? "how"
                : item.anchor ?? (item.pageSlug === "home" ? "home" : item.pageSlug ?? item.href.replace(/^\/+|\/+$/g, ""));
              const labelValue = labels[key] || (previewMode ? sampleLabels[key] : undefined);
              const label = typeof labelValue === "string" && labelValue.trim() ? labelValue.trim() : item.label;
              const path = "navigation[" + index + "].label";
              return href ? (
                <a key={item.id} {...editablePath(editMode, sourceMap, path)} href={href} onClick={(event) => navigatePreview(event, href, item.pageSlug)} className="text-sm opacity-80 hover:opacity-100">
                  {label}
                </a>
              ) : null;
            })}
          </nav>
          {safeSocials.length > 0 && (
            <div className="flex flex-wrap gap-[var(--ps-space-3)] pt-[var(--ps-space-1)]">
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

        {(address || phone) && (
          <div className="space-y-[var(--ps-space-3)]">
            {address && <p {...editablePath(editMode, sourceMap, "address")} className="text-sm opacity-85">{address}</p>}
            {phone && (safePhone ? (
              <a {...editablePath(editMode, sourceMap, "phone")} href={safePhone} className="block text-sm opacity-85 hover:opacity-100">{phone}</a>
            ) : (
              <p {...editablePath(editMode, sourceMap, "phone")} className="text-sm opacity-85">{phone}</p>
            ))}
            {address && mapHref && (
              <a {...editablePath(editMode, sourceMap, "directions_url")} href={mapHref} target="_blank" rel="noopener noreferrer" className="inline-block text-sm underline-offset-4 hover:underline">
                Get directions
              </a>
            )}
          </div>
        )}
        {hoursLine && (
          <div className="space-y-[var(--ps-space-3)]">
            <h2 className="text-sm font-semibold uppercase tracking-wide">{tStorefront("hours")}</h2>
            <p {...editablePath(editMode, sourceMap, todayHours ? "hours." + todayHours.day : "hours")} className="text-sm opacity-85">
              {tStorefront("today")}: {hoursLine}
            </p>
          </div>
        )}
      </div>
    </footer>
  );
}
