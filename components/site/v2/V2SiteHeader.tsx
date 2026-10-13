"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { safeImageSrc } from "@/lib/image-url";
import { sanitizeUrl } from "@/lib/sanitize-html";
import type { ContentDoc } from "@/lib/website-content";
import type { TemplateSourceMapEntry, ResolvedNavigationItem } from "@/lib/website-template-resolver";
import type { WebsiteTemplateV2 } from "@/lib/website-template-v2";
import type { StorefrontFeatureState } from "@/lib/storefront-features";
import type { StorefrontAction } from "@/lib/storefront-primary-action";

interface V2SiteHeaderProps {
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
  primaryAction?: StorefrontAction;
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}

function textValue(content: ContentDoc, sampleContent: ContentDoc | undefined, key: keyof ContentDoc, previewMode: boolean): string | undefined {
  const live = content[key];
  const value = nonEmpty(live) ? live : previewMode ? sampleContent?.[key] : undefined;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

export function V2SiteHeader({
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
  primaryAction,
}: V2SiteHeaderProps) {
  const tStorefront = useTranslations("Storefront");
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 24);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  const logoValue = content.logo_url || (previewMode ? sampleContent?.logo_url : undefined);
  const logoSrc = typeof logoValue === "string" ? safeImageSrc(logoValue) : "";
  const businessName = textValue(content, sampleContent, "business_name", previewMode) || siteTitle;
  const liveCtaLabel = textValue(content, undefined, "primary_cta_label", false);
  const actionLabel = primaryAction ? tStorefront(primaryAction.labelKey) : undefined;
  const fixedFallback = primaryAction && ["viewMenu", "contact", "rentalContactCta"].includes(primaryAction.labelKey);
  const sampledCta = Boolean(previewMode && sourceMap?.ctaLabel?.sampled);
  const ctaLabel = fixedFallback
    ? actionLabel
    : liveCtaLabel || (!sampledCta ? textValue(content, sampleContent, "primary_cta_label", previewMode) : undefined) ||
      actionLabel || (editMode && sourceMap?.ctaLabel ? "Add call to action" : undefined);
  const ctaPath = primaryAction?.href;
  const ctaHref = ctaPath
    ? sanitizeUrl("/site/" + encodeURIComponent(siteSlug) + ctaPath)
    : undefined;
  const heroBand = template.templateBackground.bands.find((band) => band.zone === "hero");
  const transparent = !isScrolled && !menuOpen;
  const foreground = transparent && heroBand ? "#ffffff" : "#18181b";
  const headerStyle: CSSProperties = {
    color: foreground,
    backgroundColor: transparent ? "transparent" : template.templateBackground.base,
    fontFamily: "var(--v2-heading-font)",
  };
  const labels = content.nav_labels && typeof content.nav_labels === "object"
    ? content.nav_labels as Record<string, unknown>
    : {};
  const sampleLabels = sampleContent?.nav_labels && typeof sampleContent.nav_labels === "object"
    ? sampleContent.nav_labels as Record<string, unknown>
    : {};

  const visibleNavigation = navigation.filter((item) => !item.feature || storefrontFeatures?.[item.feature]);
  const renderNavigation = (mobile: boolean) => (
    <nav
      aria-label={mobile ? "Mobile site navigation" : "Site navigation"}
      className={mobile ? "flex flex-col gap-1 py-3" : "hidden items-center gap-6 md:flex"}
    >
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
          <a
            key={item.id}
            {...editablePath(editMode, sourceMap, path)}
            href={href}
            onClick={() => setMenuOpen(false)}
            className={mobile
              ? "rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5"
              : "text-sm font-medium hover:opacity-70"}
          >
            {label}
          </a>
        ) : (
          <span key={item.id} {...editablePath(editMode, sourceMap, path)} className="text-sm font-medium">
            {label}
          </span>
        );
      })}
      {mobile && ctaLabel && ctaHref && (
        <a
          {...editablePath(editMode, sourceMap, "ctaLabel")}
          href={ctaHref}
          className="mt-2 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white"
          style={{ backgroundColor: template.lockedTheme.primaryColor }}
          onClick={() => setMenuOpen(false)}
        >
          {ctaLabel}
        </a>
      )}
    </nav>
  );

  return (
    <header
      className={(template.header.sticky ? "sticky top-0 z-50 -mb-16 md:-mb-20 " : "relative z-20 ") +
        "border-b border-black/5 transition-colors duration-200"}
      style={headerStyle}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 md:h-20 md:px-8">
        <a
          {...editablePath(editMode, sourceMap, "logo")}
          href={sanitizeUrl("/site/" + encodeURIComponent(siteSlug))}
          aria-label={businessName}
          className="flex min-w-0 items-center gap-3 font-semibold"
        >
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoSrc} alt={businessName} className="max-h-10 max-w-40 object-contain" />
          ) : (
            <span className="truncate">{editMode && sourceMap?.logo ? "Add logo" : businessName}</span>
          )}
        </a>

        <div className="hidden items-center gap-6 md:flex">
          {renderNavigation(false)}
          {ctaLabel && ctaHref && (
            <a
              {...editablePath(editMode, sourceMap, "ctaLabel")}
              href={ctaHref}
              className="inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white shadow-xs transition-opacity hover:opacity-90"
              style={{ backgroundColor: template.lockedTheme.primaryColor }}
            >
              {ctaLabel}
            </a>
          )}
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-current/20 text-sm md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        </button>
      </div>
      {menuOpen && (
        <div className="border-t border-black/10 px-4 pb-4 md:hidden">
          {renderNavigation(true)}
        </div>
      )}
    </header>
  );
}
