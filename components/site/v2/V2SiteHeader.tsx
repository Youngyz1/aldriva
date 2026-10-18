"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { safeImageSrc } from "@/lib/image-url";
import { readableOn } from "@/lib/readable-on";
import { sanitizeUrl } from "@/lib/sanitize-html";
import { getSitePageSlug, getSitePageHref, resolveSiteHref } from "@/lib/site-paths";
import type { ContentDoc } from "@/lib/website-content";
import type { TemplateSourceMapEntry, ResolvedNavigationItem } from "@/lib/website-template-resolver";
import type { WebsiteTemplateV2 } from "@/lib/website-template-v2";
import type { StorefrontFeatureState } from "@/lib/storefront-features";
import type { StorefrontAction } from "@/lib/storefront-primary-action";

export function computeV2HeaderStyle({
  transparent,
  paletteTheme,
  savannah,
  overHero,
  pastHeroThreshold,
  backgroundColor,
  solidForeground,
}: {
  transparent: boolean;
  paletteTheme: boolean;
  savannah: boolean;
  overHero: boolean;
  pastHeroThreshold: boolean;
  backgroundColor: string;
  solidForeground: string;
}): CSSProperties {
  return {
    color: transparent
      ? paletteTheme ? "var(--tf-on-scrim)" : readableOn("#23211f", ["#faf6ef", "#22201c"])
      : solidForeground,
    backgroundColor: transparent
      ? "transparent"
      : savannah && overHero && pastHeroThreshold
        ? "color-mix(in srgb, var(--tf-base) 92%, transparent)"
        : backgroundColor,
    borderColor: paletteTheme ? (transparent ? "transparent" : "var(--tf-header-border)") : undefined,
    fontFamily: "var(--ps-font-body)",
    ...(savannah && overHero && pastHeroThreshold ? { backdropFilter: "blur(12px)" } : {}),
    ...(overHero ? { marginBottom: "calc(var(--site-header-h) * -1)" } : {}),
  };
}

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
  availablePageSlugs?: readonly string[] | ReadonlySet<string>;
  onPageNavigate?: (pageSlug: string) => void;
  overHero?: boolean;
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
  availablePageSlugs,
  onPageNavigate,
  overHero = false,
}: V2SiteHeaderProps) {
  const tStorefront = useTranslations("Storefront");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pastHeroThreshold, setPastHeroThreshold] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const overlayMenu = template.header.mobileMenu === "overlay";
  const tableFlame = template.id === "restaurant-table-flame";
  const savannah = template.id === "restaurant-savannah";
  const paletteTheme = tableFlame || savannah;

  useEffect(() => {
    if (!overHero) return;
    const update = () => setPastHeroThreshold(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [overHero]);

  useEffect(() => {
    if (!paletteTheme) return;
    const root = document.querySelector<HTMLElement>(`.public-site[data-site-template="${template.id}"]`);
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.setAttribute("data-motion-ready", "true");
    const targets = root.querySelectorAll<HTMLElement>("[data-site-motion-section]");
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((target) => target.classList.add("is-visible"));
      return () => root.removeAttribute("data-motion-ready");
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    targets.forEach((target) => observer.observe(target));
    return () => {
      observer.disconnect();
      root.removeAttribute("data-motion-ready");
    };
  }, [paletteTheme, template.id]);

  useEffect(() => {
    if (!menuOpen || !overlayMenu) return;
    const scrollPosition = window.scrollY;
    const pageElement = document.documentElement;
    const previousOverflow = pageElement.style.overflow;
    pageElement.style.overflow = "hidden";
    const focusFirst = () => menuPanelRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(focusFirst);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        window.requestAnimationFrame(() => {
          menuButtonRef.current?.focus({ preventScroll: true });
          window.scrollTo(0, scrollPosition);
        });
        return;
      }
      if (event.key !== "Tab" || !menuPanelRef.current) return;
      const focusable = Array.from(menuPanelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeIndex === -1 || activeIndex === focusable.length - 1)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      pageElement.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen, overlayMenu]);

  const logoValue = content.logo_url || (previewMode ? sampleContent?.logo_url : undefined);
  const logoSrc = typeof logoValue === "string" ? safeImageSrc(logoValue) : "";
  const businessName = textValue(content, sampleContent, "business_name", previewMode) || siteTitle;
  const liveCtaLabel = textValue(content, undefined, "primary_cta_label", false);
  const actionLabel = primaryAction ? tStorefront(primaryAction.labelKey) : undefined;
  const fixedFallback = primaryAction && ["viewMenu", "viewProducts", "shopNow", "contact", "rentalContactCta"].includes(primaryAction.labelKey);
  const sampledCta = Boolean(previewMode && sourceMap?.ctaLabel?.sampled);
  const ctaLabel = fixedFallback
    ? actionLabel
    : liveCtaLabel || (!sampledCta ? textValue(content, sampleContent, "primary_cta_label", previewMode) : undefined) ||
      actionLabel || (editMode && sourceMap?.ctaLabel ? "Add call to action" : undefined);
  const ctaPath = primaryAction?.href;
  const ctaTargetSlug = ctaPath ? getSitePageSlug(siteSlug, ctaPath) : undefined;
  const availablePages = availablePageSlugs ? new Set(availablePageSlugs) : undefined;
  const ctaTargetAvailable = !availablePages || !ctaTargetSlug || availablePages.has(ctaTargetSlug);
  const ctaHref = ctaPath && ctaTargetAvailable
    ? sanitizeUrl(resolveSiteHref(siteSlug, ctaPath))
    : undefined;
  const navigatePreview = (event: MouseEvent<HTMLAnchorElement>, href: string, pageSlug?: string | null) => {
    const targetPageSlug = pageSlug ?? getSitePageSlug(siteSlug, href);
    if (!onPageNavigate || !targetPageSlug) return;
    event.preventDefault();
    onPageNavigate(targetPageSlug);
    setMenuOpen(false);
  };
  const backgroundColor = paletteTheme
    ? "var(--tf-base)"
    : template.templateBackground.base;
  const transparentOverHero = overHero && !pastHeroThreshold;
  const transparent = transparentOverHero;
  const solidForeground = paletteTheme
    ? "var(--tf-on-header)"
    : "var(--ps-text)";
  const headerStyle: CSSProperties = computeV2HeaderStyle({
    transparent,
    paletteTheme,
    savannah,
    overHero,
    pastHeroThreshold,
    backgroundColor,
    solidForeground,
  });
  const labels = content.nav_labels && typeof content.nav_labels === "object"
    ? content.nav_labels as Record<string, unknown>
    : {};
  const sampleLabels = sampleContent?.nav_labels && typeof sampleContent.nav_labels === "object"
    ? sampleContent.nav_labels as Record<string, unknown>
    : {};

  const visibleNavigation = navigation.filter((item) =>
    (!item.feature || storefrontFeatures?.[item.feature]) &&
    (!item.pageSlug || !availablePages || availablePages.has(item.pageSlug))
  );
  const closeMenu = () => {
    setMenuOpen(false);
    if (overlayMenu) {
      const scrollPosition = window.scrollY;
      window.requestAnimationFrame(() => {
        menuButtonRef.current?.focus({ preventScroll: true });
        window.scrollTo(0, scrollPosition);
      });
    }
  };
  const renderNavigation = (mobile: boolean) => (
    <nav
      aria-label={mobile ? "Mobile site navigation" : "Site navigation"}
      className={mobile
        ? overlayMenu ? "flex flex-col gap-5 py-6" : "flex flex-col gap-[var(--ps-space-1)] py-[var(--ps-space-3)]"
        : "hidden items-center gap-[var(--ps-space-6)] md:flex"}
    >
      {visibleNavigation.map((item, index) => {
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
          <a
            key={item.id}
            {...editablePath(editMode, sourceMap, path)}
            href={href}
            onClick={(event) => {
              navigatePreview(event, href, item.pageSlug);
              closeMenu();
            }}
            className={mobile
              ? overlayMenu
                ? savannah ? "rounded-none px-2 py-2 font-[var(--v2-heading-font)] text-3xl font-medium leading-tight hover:bg-[var(--tf-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]" : "rounded-lg px-2 py-2 font-[var(--v2-heading-font)] text-3xl font-medium leading-tight hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ps-accent-hover)]"
                : "rounded-lg px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-sm font-medium hover:bg-black/5"
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
          className={`ps-button ps-button-primary tf-button${savannah ? " savannah-button" : ""} mt-[var(--ps-space-2)] inline-flex min-h-11 items-center justify-center text-[var(--ps-accent-foreground)] ${overlayMenu ? "min-h-12 text-base" : ""}`}
          style={{ backgroundColor: "var(--ps-accent)" }}
          onClick={(event) => {
            navigatePreview(event, ctaHref);
            closeMenu();
          }}
        >
          {ctaLabel}
        </a>
      )}
    </nav>
  );

  return (
    <header
      className={(template.header.sticky ? "sticky top-0 z-50 " : "relative z-20 ") +
        "border-b border-[var(--ps-border)]/5 transition-colors duration-200"}
      style={headerStyle}
    >
      <div className={tableFlame
        ? "mx-auto flex h-[var(--site-header-h)] w-full max-w-6xl items-center justify-between gap-[var(--ps-space-4)] px-6"
        : "mx-auto flex h-[var(--site-header-h)] max-w-7xl items-center justify-between gap-[var(--ps-space-4)] px-[var(--ps-space-4)] md:px-[var(--ps-space-8)]"}>
        <a
          {...editablePath(editMode, sourceMap, "logo")}
          href={sanitizeUrl(getSitePageHref(siteSlug, "home"))}
          aria-label={businessName}
          className="flex min-w-0 items-center gap-[var(--ps-space-3)] font-semibold"
          onClick={(event) => navigatePreview(event, getSitePageHref(siteSlug, "home"), "home")}
        >
          {logoSrc ? (
            paletteTheme && transparent ? (
              <span className={savannah
                ? "inline-flex items-center justify-center rounded-none border border-[var(--tf-header-border)] bg-[var(--tf-base)] px-1.5 py-1 shadow-none"
                : "inline-flex items-center justify-center rounded-md border border-black/10 bg-[var(--tf-base)] px-1.5 py-1 shadow-sm"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoSrc} alt={businessName} className="max-h-10 max-w-32 object-contain" />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt={businessName} className={`max-h-10 ${tableFlame ? "max-w-32" : "max-w-40"} object-contain`} />
            )
          ) : null}
          {(!logoSrc || tableFlame || savannah) && (
            <span className="truncate">{!logoSrc && editMode && sourceMap?.logo ? "Add logo" : businessName}</span>
          )}
        </a>

        <div className="hidden items-center gap-[var(--ps-space-6)] md:flex">
          {renderNavigation(false)}
          {ctaLabel && ctaHref && (
            <a
              {...editablePath(editMode, sourceMap, "ctaLabel")}
              href={ctaHref}
              className={`ps-button ps-button-primary tf-button${savannah ? " savannah-button" : ""} inline-flex min-h-10 items-center justify-center text-[var(--ps-accent-foreground)] shadow-xs hover:opacity-90 transition-opacity duration-200 ${
                savannah && overHero
                  ? pastHeroThreshold
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none invisible"
                  : ""
              }`}
              style={{ backgroundColor: "var(--ps-accent)" }}
              onClick={(event) => navigatePreview(event, ctaHref)}
            >
              {ctaLabel}
            </a>
          )}
        </div>

        <button
          ref={menuButtonRef}
          type="button"
          className="inline-flex h-11 w-11 min-h-11 min-w-11 items-center justify-center rounded-lg border border-current/60 text-sm hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls={overlayMenu ? "v2-site-mobile-menu" : undefined}
          onClick={() => menuOpen ? closeMenu() : setMenuOpen(true)}
        >
          <span aria-hidden="true">{menuOpen ? "×" : "☰"}</span>
        </button>
      </div>
      {menuOpen && (overlayMenu ? (
        <div
          ref={menuPanelRef}
          id="v2-site-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Site menu"
          className="fixed inset-x-0 bottom-0 top-[var(--site-header-h)] z-40 overflow-y-auto bg-[var(--tf-base)] px-6 pb-10 pt-5 text-[var(--tf-on-base)] md:hidden"
        >
          <h2 className="font-[var(--v2-heading-font)] text-4xl font-medium">Menu</h2>
          {renderNavigation(true)}
        </div>
      ) : (
        <div className="border-t border-[var(--ps-border)]/10 px-[var(--ps-space-4)] pb-[var(--ps-space-4)] md:hidden">
          {renderNavigation(true)}
        </div>
      ))}
    </header>
  );
}
