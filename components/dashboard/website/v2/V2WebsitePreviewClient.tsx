"use client";

/* eslint-disable @next/next/no-img-element -- preview media is already sanitized and this iframe uses direct browser rendering. */

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import type { V2BuilderState, V2MenuItemChoice } from "@/lib/actions/website-v2";
import type { ContentDoc } from "@/lib/website-content";
import { normalizeContent } from "@/lib/website-content";
import { getFlagshipTemplate, type WebsiteTemplateV2 } from "@/lib/website-template-v2";
import { FLAGSHIP_SAMPLES } from "@/lib/website-template-samples";
import { resolveTemplateContent } from "@/lib/website-template-resolver";
import { normalizeCurrencyCode } from "@/lib/website-blocks";
import { getWebsiteBackgroundPatternStyle, v2ThemeStyle, WEBSITE_APPEARANCE_DRAFT_EXTRA_KEY } from "@/lib/website-v2-theme";
import { formatMoney as formatSharedMoney } from "@/lib/money";
import type { Locale } from "@/i18n/routing";
import { isSameOriginWebsitePreviewMessage, isWebsitePreviewMessage, WEBSITE_PREVIEW_MESSAGE_SOURCE } from "@/lib/website-preview-channel";
import { safeImageSrc } from "@/lib/image-url";
import { sanitizeUrl } from "@/lib/sanitize-html";
import { getSitePageSlug, resolveSiteHref } from "@/lib/site-paths";
import { V2SiteHeader } from "@/components/site/v2/V2SiteHeader";
import { V2SiteFooter } from "@/components/site/v2/V2SiteFooter";
import type { ResolvedPage } from "@/lib/website-template-resolver";
import { getBusinessOfferings } from "@/lib/business-offerings";
import { isOvernightWebsiteInterval } from "@/lib/website-hours";

interface V2WebsitePreviewClientProps {
  websiteId: string;
  tenantId: string;
  siteTitle: string;
  siteSlug: string;
  template: WebsiteTemplateV2;
  initialContent: ContentDoc;
  initialPageSlug: string;
  menuItems: V2MenuItemChoice[];
  emittedPages: ResolvedPage[];
  accentId?: string;
  paletteId?: string;
  backgroundPattern?: "none" | "dots";
  /** Site price display default; block currency wins when set. */
  currency?: string;
  currencyLocale?: Locale;
  business: V2BuilderState["storefront"];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function image(value: unknown): string | undefined {
  const src = typeof value === "string" ? safeImageSrc(value) : "";
  return src || undefined;
}

export function PreviewBlock({ block, menuItems, currency, currencyLocale, nextDayLabel, closedLabel, addFirstDishLabel, manageMenuLabel, siteSlug, onPageNavigate, tableFlame = false }: { block: unknown; menuItems: V2MenuItemChoice[]; tenantId?: string; currency: string; currencyLocale: Locale; nextDayLabel: string; closedLabel: string; addFirstDishLabel: string; manageMenuLabel: string; siteSlug?: string; onPageNavigate?: (pageSlug: string) => void; tableFlame?: boolean }) {
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const value = block as Record<string, unknown>;
  const rows = (key: string): Array<Record<string, unknown>> => Array.isArray(value[key]) ? (value[key] as unknown[]).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];
  const internalLink = (rawHref: unknown) => {
    if (typeof rawHref !== "string") return undefined;
    const href = sanitizeUrl(resolveSiteHref(siteSlug, rawHref));
    if (!href) return undefined;
    const pageSlug = siteSlug ? getSitePageSlug(siteSlug, href) : undefined;
    return {
      href,
      onClick: pageSlug && onPageNavigate
        ? (event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            onPageNavigate(pageSlug);
          }
        : undefined,
    };
  };

  if (value.type === "hero") {
    const heroImage = image(value.backgroundImage);
    const primaryLink = internalLink(value.ctaHref);
    const secondaryLink = internalLink(value.secondaryCtaHref);
    const heroStyle: CSSProperties | undefined = heroImage
      ? {
          backgroundImage: tableFlame
            ? `linear-gradient(90deg, rgba(var(--tf-scrim-rgb),.68), rgba(var(--tf-scrim-rgb),.12)), url("${heroImage}")`
            : `linear-gradient(90deg, rgba(0,0,0,.68), rgba(0,0,0,.12)), url("${heroImage}")`,
          backgroundPosition: "center",
          backgroundSize: "cover",
        }
      : tableFlame
        ? { backgroundImage: "linear-gradient(125deg, var(--tf-accent) 0%, var(--tf-accent-deep) 48%, var(--tf-band) 100%)" }
        : undefined;
    const heroClass = tableFlame
      ? "relative flex min-h-[520px] items-center px-[var(--ps-space-6)] py-[var(--ps-space-16)] bg-[var(--tf-band)] text-[var(--tf-on-scrim)] md:min-h-[600px] md:px-[var(--ps-space-16)]"
      : "relative flex min-h-[520px] items-center bg-[var(--ps-text)] px-[var(--ps-space-6)] py-[var(--ps-space-16)] text-white md:min-h-[600px] md:px-[var(--ps-space-16)]";
    const headingClass = "font-[var(--v2-heading-font)] text-4xl font-bold leading-tight md:text-6xl" + (tableFlame ? " text-[var(--tf-on-scrim)]" : "");
    const subheadingClass = tableFlame
      ? "mt-[var(--ps-space-6)] max-w-xl text-base leading-7 md:text-lg text-[var(--tf-on-scrim)]"
      : "mt-[var(--ps-space-6)] max-w-xl text-base leading-7 text-white/85 md:text-lg";
    return <section className={heroClass} style={heroStyle}>
      <div className="mx-auto w-full max-w-6xl"><div className="max-w-2xl">
        {value.tagline ? <p className={`mb-[var(--ps-space-3)] text-sm font-semibold uppercase tracking-[.16em] ${tableFlame ? "text-[var(--tf-on-scrim)]" : "text-white/75"}`}>{text(value.tagline)}</p> : null}
        <h1 className={headingClass}>{text(value.heading) || "Your headline"}</h1>
        {value.subheading ? <p className={subheadingClass}>{text(value.subheading)}</p> : null}
        {value.ctaLabel && primaryLink ? <a {...primaryLink} className="mt-[var(--ps-space-8)] inline-flex rounded-lg px-[var(--ps-space-6)] py-[var(--ps-space-3)] text-sm font-semibold" style={{ backgroundColor: "var(--site-primary)", color: tableFlame ? "var(--tf-on-accent)" : "#ffffff" }}>{text(value.ctaLabel)}</a> : null}
        {value.secondaryCtaLabel && secondaryLink ? <a {...secondaryLink} className={`ml-[var(--ps-space-3)] mt-[var(--ps-space-8)] inline-flex rounded-lg border px-[var(--ps-space-6)] py-[var(--ps-space-3)] text-sm font-semibold ${tableFlame ? "border-[var(--tf-on-scrim)] text-[var(--tf-on-scrim)]" : "border-white/60 text-white"}`}>{text(value.secondaryCtaLabel)}</a> : null}
      </div></div>
    </section>;
  }
  if (value.type === "features") return <section id={value.heading === "How it works" ? "how-it-works" : undefined} className="mx-auto max-w-6xl px-[var(--ps-space-6)] py-[var(--ps-space-16)] md:px-[var(--ps-space-12)]">{value.heading ? <h2 className="mb-[var(--ps-space-6)] font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2> : null}<div className="grid gap-[var(--ps-space-6)] md:grid-cols-3">{rows("items").map((item, index) => <article key={index} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs"><h3 className="font-semibold text-[var(--ps-text)]">{text(item.title)}</h3>{item.description ? <p className="mt-[var(--ps-space-2)] text-sm leading-6 text-[var(--ps-muted)]">{text(item.description)}</p> : null}</article>)}</div></section>;
  if (value.type === "about") return <section id="about" className="mx-auto grid max-w-6xl gap-[var(--ps-space-12)] px-[var(--ps-space-6)] py-[var(--ps-space-16)] md:grid-cols-2 md:px-[var(--ps-space-12)]">{image(value.founderImage) ? <img src={image(value.founderImage)} alt="" className="h-full min-h-64 w-full rounded-xl object-cover"/> : <div className="min-h-64 rounded-xl bg-[var(--ps-neutral)]"/>}<div className="self-center"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">Our story</h2><p className="mt-[var(--ps-space-4)] whitespace-pre-line leading-7 text-[var(--ps-muted)]">{text(value.story)}</p>{rows("highlights").length > 0 ? <div className="mt-[var(--ps-space-8)] grid grid-cols-3 gap-[var(--ps-space-3)]">{rows("highlights").map((item, index) => <div key={index}><strong className="block text-xl">{text(item.value)}</strong><span className="text-xs text-[var(--ps-muted)]">{text(item.label)}</span></div>)}</div> : null}</div></section>;
  if (value.type === "gallery") return <section className="mx-auto grid max-w-6xl grid-cols-2 gap-[var(--ps-space-3)] px-[var(--ps-space-6)] py-[var(--ps-space-12)] md:grid-cols-3 md:px-[var(--ps-space-12)]">{rows("images").map((item, index) => image(item.src) ? <img key={index} src={image(item.src)} alt={text(item.alt)} className="aspect-[4/3] w-full rounded-lg object-cover"/> : null)}</section>;
  if (value.type === "testimonials") return <section className="mx-auto grid max-w-6xl gap-[var(--ps-space-6)] px-[var(--ps-space-6)] py-[var(--ps-space-16)] md:grid-cols-3 md:px-[var(--ps-space-12)]">{rows("items").map((item, index) => <figure key={index} className="rounded-xl bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs"><blockquote className="leading-7 text-[var(--ps-muted)]">“{text(item.quote)}”</blockquote><figcaption className="mt-[var(--ps-space-4)] text-sm font-semibold text-[var(--ps-text)]">{text(item.author)}</figcaption></figure>)}</section>;
  if (value.type === "faq") return <section id="faq" className="mx-auto max-w-4xl space-y-[var(--ps-space-4)] px-[var(--ps-space-6)] py-[var(--ps-space-16)]"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2>{rows("items").map((item, index) => <article key={index} className="border-b border-[var(--ps-border)] py-[var(--ps-space-4)]"><h3 className="font-semibold">{text(item.question)}</h3><p className="mt-[var(--ps-space-2)] text-sm leading-6 text-[var(--ps-muted)]">{text(item.answer)}</p></article>)}</section>;
  if (value.type === "contact") return <section id="contact" className="mx-auto max-w-5xl px-[var(--ps-space-6)] py-[var(--ps-space-16)]"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2><div className="mt-[var(--ps-space-6)] grid gap-[var(--ps-space-4)] md:grid-cols-2"><div className="space-y-[var(--ps-space-2)] text-sm text-[var(--ps-muted)]">{value.address ? <p>{text(value.address)}</p> : null}{value.phone ? <p>{text(value.phone)}</p> : null}{value.email ? <p>{text(value.email)}</p> : null}{typeof value.directionsUrl === "string" && sanitizeUrl(value.directionsUrl) ? <a className="inline-block text-[var(--ps-accent-hover)] underline" href={sanitizeUrl(value.directionsUrl)} target="_blank" rel="noreferrer">Get directions</a> : null}</div><div className="space-y-[var(--ps-space-2)] text-sm text-[var(--ps-muted)]">{rows("hoursTable").map((row, index) => <p key={index}>{text(row.day)} · {row.closed ? closedLabel : `${text(row.open)}–${text(row.close)}${isOvernightWebsiteInterval(row.open, row.close) ? ` (${nextDayLabel})` : ""}`}</p>)}</div></div></section>;
  if (value.type === "menu_embed") {
    const selected = Array.isArray(value.selectedItemIds) ? value.selectedItemIds.filter((id): id is string => typeof id === "string") : [];
    const items = selected.length > 0 ? menuItems.filter((item) => selected.includes(item.id)) : menuItems.slice(0, 6);
    if (items.length === 0) return <section className="mx-auto max-w-6xl px-[var(--ps-space-6)] py-[var(--ps-space-16)]"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2><div className="mt-[var(--ps-space-8)] rounded-xl border border-dashed border-[var(--ps-border)] bg-[var(--ps-neutral)] p-[var(--ps-space-6)] text-center"><p className="text-sm text-[var(--ps-muted)]">{addFirstDishLabel}</p><button type="button" onClick={() => { window.parent.postMessage({ source: WEBSITE_PREVIEW_MESSAGE_SOURCE, kind: "open_menu_editor" }, window.location.origin); }} className="mt-[var(--ps-space-3)] inline-flex rounded-lg bg-[var(--ps-accent)] px-[var(--ps-space-4)] py-[var(--ps-space-2)] text-sm font-semibold text-[var(--ps-accent-foreground)] hover:bg-[var(--ps-accent-hover)]">{manageMenuLabel}</button></div></section>;
    const displayCurrency = normalizeCurrencyCode(value.currency) ?? currency;
    return <section className="mx-auto max-w-6xl px-[var(--ps-space-6)] py-[var(--ps-space-16)]"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2><div className="mt-[var(--ps-space-8)] grid gap-[var(--ps-space-4)] sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)]"><div className="p-[var(--ps-space-6)]"><p className="text-xs font-medium uppercase tracking-wide text-[var(--ps-muted)]">{item.sectionName}</p><h3 className="mt-[var(--ps-space-1)] font-semibold">{item.name}</h3>{item.description ? <p className="mt-[var(--ps-space-2)] text-sm text-[var(--ps-muted)]">{item.description}</p> : null}{item.price != null ? <p className="mt-[var(--ps-space-3)] text-sm font-semibold">{formatSharedMoney(Number(item.price), displayCurrency, currencyLocale)}</p> : null}</div></article>)}</div></section>;
  }
  if (value.type === "cta_banner") {
    const link = internalLink(value.ctaHref);
    return <section className={`px-[var(--ps-space-6)] py-[var(--ps-space-16)] text-center ${tableFlame ? "text-[var(--tf-on-band)]" : "text-white"}`} style={{ backgroundColor: tableFlame ? "var(--tf-band)" : "var(--site-primary)" }}><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2>{value.ctaLabel && link ? <a {...link} className={`mt-[var(--ps-space-6)] inline-flex rounded-lg px-[var(--ps-space-6)] py-[var(--ps-space-3)] text-sm font-semibold ${tableFlame ? "" : "bg-[var(--ps-surface)] text-[var(--ps-text)]"}`} style={tableFlame ? { backgroundColor: "var(--ps-accent)", color: "var(--tf-on-accent)" } : undefined}>{text(value.ctaLabel)}</a> : null}</section>;
  }
  return null;
}

export function V2WebsitePreviewClient({
  websiteId,
  siteTitle,
  siteSlug,
  template,
  initialContent,
  initialPageSlug,
  menuItems,
  emittedPages,
  accentId,
  paletteId,
  backgroundPattern = "none",
  currency,
  currencyLocale,
  business,
}: V2WebsitePreviewClientProps) {
  const storeT = useTranslations("Storefront");
  const offeringT = useTranslations("BusinessOfferings");
  const displayCurrency = normalizeCurrencyCode(currency) ?? "USD";
  const locale: Locale = currencyLocale === "fr" ? "fr" : "en";
  const [content, setContent] = useState<ContentDoc>(() => normalizeContent(initialContent));
  const [currentMenuItems, setCurrentMenuItems] = useState<V2MenuItemChoice[]>(menuItems);
  const [currentOfferings, setCurrentOfferings] = useState<string[]>(business.offerings ?? []);
  const [pageSlug, setPageSlug] = useState(initialPageSlug);
  const catalog = getBusinessOfferings(business.businessType, business.category);
  const getOfferingLabel = offeringT as unknown as (key: string) => string;
  const offeringLabels = useMemo(() => Object.fromEntries(catalog.map((offering) => [offering.key, getOfferingLabel(`labels.${offering.labelKey}`)])), [catalog, getOfferingLabel]);
  const resolved = useMemo(() => resolveTemplateContent(template.id, template.version, content, {
    includeSamples: true,
    includeSourceMap: true,
    siteSlug,
    currency: displayCurrency,
    business: { ...business, offerings: currentOfferings, offeringLabels },
    viewMenuLabel: storeT("viewMenu"),
    rentalContactCta: storeT("rentalContactCta"),
    primaryActionLabels: {
      orderNow: storeT("orderNow"),
      reserveTable: storeT("reserveTable"),
      bookNow: storeT("bookNow"),
      viewMenu: storeT("viewMenu"),
      viewProducts: storeT("viewProducts"),
      contact: storeT("contact"),
      rentalContactCta: storeT("rentalContactCta"),
    },
    offeringsHeading: storeT("whatWeOffer"),
    restaurantCtaBandHeading: storeT("restaurantBrandMessage"),
    rentalCtaBandHeading: storeT("rentalBrandMessage"),
    timeZone: business.timeZone,
  }), [business, content, currentOfferings, displayCurrency, offeringLabels, siteSlug, storeT, template.id, template.version]);
  const page = resolved.pages.find((candidate) => candidate.slug === pageSlug) ?? resolved.pages.find((candidate) => candidate.isHome) ?? resolved.pages[0];
  const templateForPage = getFlagshipTemplate(template.id, template.version) ?? template;
  const sampleContent = FLAGSHIP_SAMPLES[template.id] as ContentDoc | undefined;
  const navigation = resolved.navigation;
  const navigateToPreviewPage = (targetSlug: string) => {
    if (resolved.pages.some((candidate) => candidate.slug === targetSlug)) setPageSlug(targetSlug);
  };
  const appearanceExtras = content.template_extras && typeof content.template_extras === "object"
    ? content.template_extras as Record<string, unknown>
    : {};
  const draftAppearance = appearanceExtras[WEBSITE_APPEARANCE_DRAFT_EXTRA_KEY];
  const draftAppearanceRecord = draftAppearance && typeof draftAppearance === "object" && !Array.isArray(draftAppearance)
    ? draftAppearance as Record<string, unknown>
    : {};
  const activePaletteId = template.palettes?.some((palette) => palette.id === draftAppearanceRecord.paletteId)
    ? draftAppearanceRecord.paletteId as string
    : paletteId;
  const activePattern = template.patterns?.some((pattern) => pattern.id === draftAppearanceRecord.backgroundPattern)
    ? draftAppearanceRecord.backgroundPattern as "none" | "dots"
    : backgroundPattern;
  const themeStyle = {
    ...v2ThemeStyle(template, { brand: { accentId, paletteId: activePaletteId, backgroundPattern: activePattern } }),
    ...getWebsiteBackgroundPatternStyle(template, activePattern),
  } as CSSProperties;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [pageSlug]);

  useEffect(() => {
    const parentOrigin = window.location.origin;
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (event.source !== window.parent) return;
      if (!isSameOriginWebsitePreviewMessage(event.origin, window.location.origin)) return;
      const message = event.data;
      if (!isWebsitePreviewMessage(message) || message.kind === "ready" || message.kind === "open_menu_editor") return;
      if (message.kind === "hello") {
        if (message.websiteId === websiteId) {
          window.parent.postMessage({ source: WEBSITE_PREVIEW_MESSAGE_SOURCE, kind: "ready" }, parentOrigin);
        }
        return;
      }
      if (message.kind === "update_menu_items") {
        if (message.websiteId === websiteId) {
          setCurrentMenuItems(message.menuItems);
        }
        return;
      }
      if (message.kind === "update_offerings") {
        if (message.websiteId === websiteId) {
          setCurrentOfferings(message.offerings);
        }
        return;
      }
      if (message.websiteId !== websiteId) return;
      if (!emittedPages.some((candidate) => candidate.slug === message.pageSlug)) return;
      setPageSlug(message.pageSlug);
      if (message.kind === "draft") setContent(normalizeContent(message.content));
    };
    window.addEventListener("message", handleMessage);
    window.parent.postMessage({ source: WEBSITE_PREVIEW_MESSAGE_SOURCE, kind: "ready" }, parentOrigin);
    return () => window.removeEventListener("message", handleMessage);
  }, [emittedPages, websiteId]);

  return (
    <div style={themeStyle} data-background-pattern={template.palettes?.length ? activePattern : undefined} className="public-site min-h-screen bg-[var(--ps-surface)] font-sans text-[var(--ps-text)]">
      <V2SiteHeader template={templateForPage} content={content} sampleContent={sampleContent} navigation={navigation} siteTitle={siteTitle} siteSlug={siteSlug} previewMode editMode sourceMap={resolved.chromeSourceMap.menuBar} storefrontFeatures={resolved.storefrontFeatures} primaryAction={resolved.primaryAction.primary} availablePageSlugs={resolved.pages.map((candidate) => candidate.slug)} onPageNavigate={navigateToPreviewPage} />
      <main>{page?.blocks.map((block, index) => {
        const blockMap = resolved.sourceMap[block.id ?? ""] ?? {};
        const hasSample = Object.values(blockMap).some((entry) => entry.sampled);
        return <div key={block.id ?? index} className="relative" data-sample-content={hasSample ? "true" : undefined}>
          {hasSample ? <span className="absolute right-4 top-3 z-10 rounded-full bg-amber-100 px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-semibold text-amber-900">Sample content</span> : null}
          <PreviewBlock block={block} menuItems={currentMenuItems} currency={displayCurrency} currencyLocale={locale} nextDayLabel={storeT("nextDay")} closedLabel={storeT("closed")} addFirstDishLabel={storeT("addFirstDish")} manageMenuLabel={storeT("manageMenu")} siteSlug={siteSlug} onPageNavigate={navigateToPreviewPage} tableFlame={template.id === "restaurant-table-flame"} />
        </div>;
      })}</main>
      <V2SiteFooter template={templateForPage} content={content} sampleContent={sampleContent} navigation={navigation} siteTitle={siteTitle} siteSlug={siteSlug} previewMode editMode sourceMap={resolved.chromeSourceMap.footer} storefrontFeatures={resolved.storefrontFeatures} availablePageSlugs={resolved.pages.map((candidate) => candidate.slug)} todayHours={resolved.todayHours} onPageNavigate={navigateToPreviewPage} />
    </div>
  );
}
