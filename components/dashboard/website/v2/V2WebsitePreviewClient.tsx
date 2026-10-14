"use client";

/* eslint-disable @next/next/no-img-element -- preview media is already sanitized and this iframe uses direct browser rendering. */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import type { V2BuilderState, V2MenuItemChoice } from "@/lib/actions/website-v2";
import type { ContentDoc } from "@/lib/website-content";
import { normalizeContent } from "@/lib/website-content";
import { getFlagshipTemplate, type WebsiteTemplateV2 } from "@/lib/website-template-v2";
import { FLAGSHIP_SAMPLES } from "@/lib/website-template-samples";
import { resolveTemplateContent } from "@/lib/website-template-resolver";
import { normalizeCurrencyCode } from "@/lib/website-blocks";
import { v2ThemeStyle } from "@/lib/website-v2-theme";
import { formatCurrency } from "@/lib/format-locale";
import type { Locale } from "@/i18n/routing";
import { isSameOriginWebsitePreviewMessage, isWebsitePreviewMessage, WEBSITE_PREVIEW_MESSAGE_SOURCE } from "@/lib/website-preview-channel";
import { safeImageSrc } from "@/lib/image-url";
import { sanitizeUrl } from "@/lib/sanitize-html";
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

export function PreviewBlock({ block, menuItems, currency, currencyLocale, nextDayLabel, closedLabel, addFirstDishLabel, manageMenuLabel }: { block: unknown; menuItems: V2MenuItemChoice[]; tenantId?: string; currency: string; currencyLocale: Locale; nextDayLabel: string; closedLabel: string; addFirstDishLabel: string; manageMenuLabel: string }) {
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const value = block as Record<string, unknown>;
  const rows = (key: string): Array<Record<string, unknown>> => Array.isArray(value[key]) ? (value[key] as unknown[]).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row)) : [];

  if (value.type === "hero") {
    const heroImage = image(value.backgroundImage);
    return <section className="relative flex min-h-[520px] items-center bg-zinc-900 px-6 py-20 text-white md:min-h-[600px] md:px-14" style={heroImage ? { backgroundImage: `linear-gradient(90deg, rgba(0,0,0,.68), rgba(0,0,0,.12)), url("${heroImage}")`, backgroundPosition: "center", backgroundSize: "cover" } : undefined}>
      <div className="mx-auto w-full max-w-6xl"><div className="max-w-2xl">
        {value.tagline ? <p className="mb-3 text-sm font-semibold uppercase tracking-[.16em] text-white/75">{text(value.tagline)}</p> : null}
        <h1 className="font-[var(--v2-heading-font)] text-4xl font-bold leading-tight md:text-6xl">{text(value.heading) || "Your headline"}</h1>
        {value.subheading ? <p className="mt-5 max-w-xl text-base leading-7 text-white/85 md:text-lg">{text(value.subheading)}</p> : null}
        {value.ctaLabel ? <span className="mt-7 inline-flex rounded-lg px-5 py-3 text-sm font-semibold text-white" style={{ backgroundColor: "var(--site-primary)" }}>{text(value.ctaLabel)}</span> : null}
      </div></div>
    </section>;
  }
  if (value.type === "features") return <section className="mx-auto max-w-6xl px-6 py-16 md:px-10">{value.heading ? <h2 className="mb-6 font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2> : null}<div className="grid gap-5 md:grid-cols-3">{rows("items").map((item, index) => <article key={index} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs"><h3 className="font-semibold text-zinc-900">{text(item.title)}</h3>{item.description ? <p className="mt-2 text-sm leading-6 text-zinc-600">{text(item.description)}</p> : null}</article>)}</div></section>;
  if (value.type === "about") return <section className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:px-10">{image(value.founderImage) ? <img src={image(value.founderImage)} alt="" className="h-full min-h-64 w-full rounded-xl object-cover"/> : <div className="min-h-64 rounded-xl bg-zinc-100"/>}<div className="self-center"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">Our story</h2><p className="mt-4 whitespace-pre-line leading-7 text-zinc-600">{text(value.story)}</p>{rows("highlights").length > 0 ? <div className="mt-7 grid grid-cols-3 gap-3">{rows("highlights").map((item, index) => <div key={index}><strong className="block text-xl">{text(item.value)}</strong><span className="text-xs text-zinc-500">{text(item.label)}</span></div>)}</div> : null}</div></section>;
  if (value.type === "gallery") return <section className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-6 py-12 md:grid-cols-3 md:px-10">{rows("images").map((item, index) => image(item.src) ? <img key={index} src={image(item.src)} alt={text(item.alt)} className="aspect-[4/3] w-full rounded-lg object-cover"/> : null)}</section>;
  if (value.type === "testimonials") return <section className="mx-auto grid max-w-6xl gap-5 px-6 py-16 md:grid-cols-3 md:px-10">{rows("items").map((item, index) => <figure key={index} className="rounded-xl bg-white p-6 shadow-xs"><blockquote className="leading-7 text-zinc-700">“{text(item.quote)}”</blockquote><figcaption className="mt-4 text-sm font-semibold text-zinc-900">{text(item.author)}</figcaption></figure>)}</section>;
  if (value.type === "faq") return <section className="mx-auto max-w-4xl space-y-4 px-6 py-16"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2>{rows("items").map((item, index) => <article key={index} className="border-b border-zinc-200 py-4"><h3 className="font-semibold">{text(item.question)}</h3><p className="mt-2 text-sm leading-6 text-zinc-600">{text(item.answer)}</p></article>)}</section>;
  if (value.type === "contact") return <section className="mx-auto max-w-5xl px-6 py-16"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2><div className="mt-6 grid gap-4 md:grid-cols-2"><div className="space-y-2 text-sm text-zinc-700">{value.address ? <p>{text(value.address)}</p> : null}{value.phone ? <p>{text(value.phone)}</p> : null}{value.email ? <p>{text(value.email)}</p> : null}{typeof value.directionsUrl === "string" && sanitizeUrl(value.directionsUrl) ? <a className="inline-block text-orange-700 underline" href={sanitizeUrl(value.directionsUrl)} target="_blank" rel="noreferrer">Get directions</a> : null}</div><div className="space-y-2 text-sm text-zinc-700">{rows("hoursTable").map((row, index) => <p key={index}>{text(row.day)} · {row.closed ? closedLabel : `${text(row.open)}–${text(row.close)}${isOvernightWebsiteInterval(row.open, row.close) ? ` (${nextDayLabel})` : ""}`}</p>)}</div></div></section>;
  if (value.type === "menu_embed") {
    const selected = Array.isArray(value.selectedItemIds) ? value.selectedItemIds.filter((id): id is string => typeof id === "string") : [];
    const items = selected.length > 0 ? menuItems.filter((item) => selected.includes(item.id)) : menuItems.slice(0, 6);
    if (items.length === 0) return <section className="mx-auto max-w-6xl px-6 py-16"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2><div className="mt-7 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center"><p className="text-sm text-zinc-600">{addFirstDishLabel}</p><button type="button" onClick={() => { window.parent.postMessage({ source: WEBSITE_PREVIEW_MESSAGE_SOURCE, kind: "open_menu_editor" }, window.location.origin); }} className="mt-3 inline-flex rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">{manageMenuLabel}</button></div></section>;
    const displayCurrency = normalizeCurrencyCode(value.currency) ?? currency;
    return <section className="mx-auto max-w-6xl px-6 py-16"><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <article key={item.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white"><div className="p-5"><p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{item.sectionName}</p><h3 className="mt-1 font-semibold">{item.name}</h3>{item.description ? <p className="mt-2 text-sm text-zinc-600">{item.description}</p> : null}{item.price != null ? <p className="mt-3 text-sm font-semibold">{formatCurrency(Number(item.price), displayCurrency, currencyLocale)}</p> : null}</div></article>)}</div></section>;
  }
  if (value.type === "cta_banner") return <section className="px-6 py-14 text-center text-white" style={{ backgroundColor: "var(--site-primary)" }}><h2 className="font-[var(--v2-heading-font)] text-3xl font-bold">{text(value.heading)}</h2></section>;
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
    currency: displayCurrency,
    business: { ...business, offerings: currentOfferings, offeringLabels },
    viewMenuLabel: storeT("viewMenu"),
    rentalContactCta: storeT("rentalContactCta"),
    primaryActionLabels: {
      orderNow: storeT("orderNow"),
      reserveTable: storeT("reserveTable"),
      bookNow: storeT("bookNow"),
      viewMenu: storeT("viewMenu"),
      contact: storeT("contact"),
      rentalContactCta: storeT("rentalContactCta"),
    },
    offeringsHeading: storeT("whatWeOffer"),
    restaurantCtaBandHeading: storeT("restaurantBrandMessage"),
    rentalCtaBandHeading: storeT("rentalBrandMessage"),
    timeZone: business.timeZone,
  }), [business, content, currentOfferings, displayCurrency, offeringLabels, storeT, template.id, template.version]);
  const page = resolved.pages.find((candidate) => candidate.slug === pageSlug) ?? resolved.pages.find((candidate) => candidate.isHome) ?? resolved.pages[0];
  const templateForPage = getFlagshipTemplate(template.id, template.version) ?? template;
  const sampleContent = FLAGSHIP_SAMPLES[template.id] as ContentDoc | undefined;
  const navigation = resolved.navigation.map((item) => ({ ...item, href: "#", target: "_self" as const }));
  const themeStyle = v2ThemeStyle(template) as CSSProperties;

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
    <div style={themeStyle} className="min-h-screen bg-white font-sans text-zinc-900">
      <V2SiteHeader template={templateForPage} content={content} sampleContent={sampleContent} navigation={navigation} siteTitle={siteTitle} siteSlug={siteSlug} previewMode editMode sourceMap={resolved.chromeSourceMap.menuBar} storefrontFeatures={resolved.storefrontFeatures} primaryAction={resolved.primaryAction.primary} />
      <main>{page?.blocks.map((block, index) => {
        const blockMap = resolved.sourceMap[block.id ?? ""] ?? {};
        const hasSample = Object.values(blockMap).some((entry) => entry.sampled);
        return <div key={block.id ?? index} className="relative" data-sample-content={hasSample ? "true" : undefined}>
          {hasSample ? <span className="absolute right-4 top-3 z-10 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900">Sample content</span> : null}
          <PreviewBlock block={block} menuItems={currentMenuItems} currency={displayCurrency} currencyLocale={locale} nextDayLabel={storeT("nextDay")} closedLabel={storeT("closed")} addFirstDishLabel={storeT("addFirstDish")} manageMenuLabel={storeT("manageMenu")} />
        </div>;
      })}</main>
      <V2SiteFooter template={templateForPage} content={content} sampleContent={sampleContent} navigation={navigation} siteTitle={siteTitle} siteSlug={siteSlug} previewMode editMode sourceMap={resolved.chromeSourceMap.footer} storefrontFeatures={resolved.storefrontFeatures} todayHours={resolved.todayHours} />
    </div>
  );
}
