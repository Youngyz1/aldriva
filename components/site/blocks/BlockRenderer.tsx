/**
 * components/site/blocks/BlockRenderer.tsx
 *
 * Aldriva Website Design System & Block Catalog Component Dispatcher (Phase 3).
 *
 * Renders all 10 modern block types + 2 legacy compatibility types:
 *  1. hero             : Full-width / split / video-background hero with headlines, badges, and CTAs
 *  2. features         : Responsive grid (2, 3, 4 cols) of icon feature cards
 *  3. about            : Company story narrative, mission highlight, founder bio, and metric stats
 *  4. gallery          : Grid, masonry, or carousel image gallery with captions
 *  5. testimonials     : Customer quote cards with star ratings (1-5) and author attribution
 *  6. contact          : Contact information cards (email, phone, address, hours) and map preview
 *  7. faq              : Accessible accordion (<details>/<summary>) Q&A list
 *  8. events_embed     : Live server-side resolved events feed (grid or list)
 *  9. products_embed   : Live server-side resolved products/catalog feed (grid or list)
 * 10. fundraiser_embed : Live server-side resolved fundraising campaign banner / card / grid
 * 11. rich_text        : Server-sanitized HTML prose block (Phase 2 legacy)
 * 12. cta_banner       : Standalone call-to-action banner (Phase 2 legacy)
 *
 * Security & Data Isolation:
 *  - HTML content is sanitized server-side via isomorphic-dompurify (lib/sanitize-html.ts).
 *  - Link URLs use sanitizeUrl(); image URLs use the configured media/Supabase allowlist.
 *  - Embed resolvers are executed server-side with injected tenantId and isTeamMember gating.
 */

import React from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { sanitizeArticleHtml, sanitizeUrl } from "@/lib/sanitize-html";
import { resolveSiteHref } from "@/lib/site-paths";
import { safeImageSrc } from "@/lib/image-url";
import { CatalogCarousel } from "./CatalogCard";
import {
  Block,
  HeroBlock,
  FeaturesBlock,
  AboutBlock,
  GalleryBlock,
  TestimonialsBlock,
  ContactBlock,
  FaqBlock,
  EventsEmbedBlock,
  ProductsEmbedBlock,
  StorefrontProductPreviewItem,
  FundraiserEmbedBlock,
  ServicesEmbedBlock,
  MenuEmbedBlock,
  RichTextBlock,
  CtaBannerBlock,
  isBlockVisible,
} from "@/lib/website-blocks";
import { getBackgroundStyle, getContainerClass, getHiddenOnMobileClass, getSpacingClass } from "@/lib/section-helpers";
import { formatMoney as formatCurrency } from "@/lib/money";
import type { Locale } from "@/i18n/routing";
import { normalizeCurrencyCode } from "@/lib/website-blocks";
import { isOvernightWebsiteInterval } from "@/lib/website-hours";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { readableOn } from "@/lib/readable-on";
import type { TemplateSourceMapEntry } from "@/lib/website-template-resolver";
import { StorefrontBrowse, type StorefrontOrderConfig } from "./StorefrontBrowse";
import { ProductCarousel } from "./ProductCarousel";
import { ReservationRequestForm, type StorefrontReservationConfig, type ReservationFormLabels } from "./ReservationForm";
import { hasBrowseableItems, type BrowseGroup } from "@/lib/storefront-browse";
import { getStoreProductStockState } from "@/lib/store-product-detail";
import {
  resolveEventsEmbed,
  resolveProductsEmbed,
  resolveFundraiserEmbed,
  resolveServicesEmbed,
  resolveMenuEmbed,
  resolveShopPrices,
  ResolvedEventItem,
  ResolvedProductItem,
  ResolvedFundraiserItem,
  ResolvedServiceItem,
  ResolvedMenuSection,
} from "@/lib/website-embeds";
import {
  Calendar,
  MapPin,
  Tag,
  Heart,
  ExternalLink,
  Star,
  Phone,
  Mail,
  Clock,
  ArrowRight,
} from "lucide-react";

// ── Reusable UI Primitives ───────────────────────────────────────────────────

function DraftBadge() {
  return (
    <span className="inline-flex items-center gap-[var(--ps-space-1)] rounded-full bg-amber-100 px-[var(--ps-space-3)] py-[var(--ps-space-1)] text-xs font-semibold text-amber-800 border border-amber-300">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
      Draft Preview
    </span>
  );
}

function SectionHeading({
  heading,
  subheading,
  align = "center",
}: {
  heading?: string;
  subheading?: string;
  align?: "left" | "center" | "right";
}) {
  if (!heading && !subheading) return null;

  const alignClasses =
    align === "left"
      ? "text-left items-start"
      : align === "right"
        ? "text-right items-end ml-auto"
        : "text-center items-center mx-auto";

  return (
    <div className={`mb-[var(--ps-space-12)] flex flex-col ${alignClasses}`}>
      {heading && (
        <h2 className="text-3xl font-bold tracking-tight text-[var(--ps-text)] sm:text-4xl">
          {heading}
        </h2>
      )}
      {subheading && (
        <p className="mt-[var(--ps-space-3)] max-w-2xl text-lg text-[var(--ps-muted)] leading-relaxed">
          {subheading}
        </p>
      )}
    </div>
  );
}

function TableFlameFallbackMark({ businessName, className }: { businessName?: string; className: string }) {
  const initial = businessName?.trim().charAt(0).toUpperCase() || "T";
  return (
    <span aria-hidden="true" className={`font-[var(--v2-heading-font)] ${className} text-[var(--tf-muted)]`}>
      {initial}
    </span>
  );
}

function SavannahFallbackMark({ businessName }: { businessName?: string }) {
  return (
    <span aria-hidden="true" className="font-[var(--v2-heading-font)] text-8xl font-bold leading-none text-[var(--tf-on-soft)]">
      {businessName?.trim().charAt(0).toUpperCase() || "S"}
    </span>
  );
}

type ElementSourceMap = Record<string, TemplateSourceMapEntry>;

function elementPathProps(
  editMode: boolean | undefined,
  sourceMap: ElementSourceMap | undefined,
  elementPath: string
): { "data-element-path"?: string; "data-sample-content"?: "true" } {
  const entry = editMode ? sourceMap?.[elementPath] : undefined;
  return entry
    ? {
        "data-element-path": elementPath,
        ...(entry.sampled ? { "data-sample-content": "true" as const } : {}),
      }
    : {};
}

function hasEditorPlaceholder(
  editMode: boolean | undefined,
  sourceMap: ElementSourceMap | undefined,
  elementPath: string
): boolean {
  return Boolean(editMode && sourceMap?.[elementPath]);
}

// ── 1. Hero Block ────────────────────────────────────────────────────────────

export function HeroBlockRenderer({
  block,
  siteSlug,
  scopeInternalLinks,
  editMode,
  sourceMap,
  accentColor,
  tableFlame = false,
  savannah = false,
  businessName,
}: {
  block: HeroBlock;
  siteSlug?: string;
  scopeInternalLinks?: boolean;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
  accentColor?: string;
  tableFlame?: boolean;
  savannah?: boolean;
  businessName?: string;
}) {
  const safeBgImage = block.backgroundImage ? safeImageSrc(block.backgroundImage) || "" : "";
  const safeCtaHref = block.ctaHref
    ? sanitizeUrl(scopeInternalLinks ? resolveSiteHref(siteSlug, block.ctaHref) : block.ctaHref)
    : "";
  const safeSecCtaHref = block.secondaryCtaHref
    ? sanitizeUrl(scopeInternalLinks ? resolveSiteHref(siteSlug, block.secondaryCtaHref) : block.secondaryCtaHref)
    : "";
  const safeVideoUrl = block.videoUrl ? sanitizeUrl(block.videoUrl) : "";

  if (block.variant === "full-bleed") {
    const hasPhoto = Boolean(
      safeBgImage && !safeBgImage.endsWith("/placeholders/restaurant/hero.svg")
    );
    const paletteTheme = tableFlame || savannah;
    const accent = accentColor || (paletteTheme ? "var(--ps-accent)" : "#c65d3b");
    const ctaForeground = paletteTheme ? "var(--tf-on-accent)" : readableOn(accent, ["#090909", "#faf6ef"]);
    const heroText = paletteTheme ? "text-[var(--tf-on-scrim)]" : "text-[#faf6ef]";
    const scrim = paletteTheme
      ? "linear-gradient(to top, rgba(var(--tf-scrim-rgb), 0.72) 0%, rgba(var(--tf-scrim-rgb), 0.70) 38%, rgba(var(--tf-scrim-rgb), 0.68) 100%)"
      : "linear-gradient(to top, rgba(35, 33, 31, 0.72) 0%, rgba(35, 33, 31, 0.70) 38%, rgba(35, 33, 31, 0.68) 100%)";
    const logoMark = block.logoMark ? safeImageSrc(block.logoMark) : "";
    return (
      <section className="relative z-0 flex min-h-[440px] w-full items-end overflow-visible md:min-h-[560px]" data-site-motion-hero>
        <div
          className="absolute inset-x-0 -top-12 -bottom-12 -z-10 overflow-hidden md:-top-20 md:-bottom-20"
          style={{
            backgroundImage: hasPhoto ? undefined : paletteTheme
              ? "linear-gradient(125deg, var(--tf-accent) 0%, var(--tf-accent-deep) 48%, var(--tf-band) 100%)"
              : "linear-gradient(125deg, #c65d3b 0%, #7c2d12 48%, #23211f 100%)",
            backgroundColor: paletteTheme ? "var(--tf-band)" : "#23211f",
            backgroundSize: "cover",
            backgroundPosition: block.imagePosition || "center",
          }}
        >
          {hasPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={safeBgImage}
              alt=""
              className={`absolute inset-0 h-full w-full ${block.imageFit === "contain" ? "object-contain bg-[var(--tf-soft)]" : "object-cover"}`}
              style={{ objectPosition: block.imagePosition || "center" }}
            />
          ) : null}
          {safeVideoUrl && hasPhoto ? (
            <video
              src={safeVideoUrl}
              poster={safeBgImage}
              muted
              loop
              playsInline
              aria-label={block.heading || "Table & Flame"}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          {!hasPhoto && logoMark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoMark} alt="" className="absolute left-6 top-1/2 h-20 w-20 -translate-y-1/2 object-contain opacity-70 md:left-16 md:h-28 md:w-28" />
          ) : null}
          {!hasPhoto && savannah ? (
            <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center font-[var(--v2-heading-font)] text-[clamp(10rem,30vw,26rem)] font-bold leading-none text-[var(--tf-on-scrim)] opacity-20">
              {businessName?.trim().charAt(0).toUpperCase() || "S"}
            </span>
          ) : null}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: scrim }}
          />
        </div>
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className={`mb-10 max-w-4xl text-left ${heroText} md:mb-16`}>
            {block.tagline ? (
              <p className={`mb-4 text-[13px] font-semibold uppercase tracking-[0.08em] ${heroText}`}>{block.tagline}</p>
            ) : null}
            {block.heading ? (
              <h1 {...elementPathProps(editMode, sourceMap, "heading")} className={`max-w-4xl font-[var(--v2-heading-font)] text-[40px] font-medium leading-[1.08] tracking-[-0.025em] ${heroText} md:text-[72px]`}>
                {block.heading}
              </h1>
            ) : null}
            {block.subheading ? (
              <p className={`mt-4 max-w-2xl text-base leading-relaxed ${heroText} md:text-[17px]`}>{block.subheading}</p>
            ) : null}
            {(block.ctaLabel && safeCtaHref) || (block.secondaryCtaLabel && safeSecCtaHref) ? (
              <div className="mt-7 flex flex-wrap items-center justify-start gap-3">
                {block.ctaLabel && safeCtaHref ? (
                  <a
                    {...elementPathProps(editMode, sourceMap, "ctaLabel")}
                    href={safeCtaHref}
                    className={`tf-button${savannah ? " savannah-button" : ""} inline-flex min-h-12 items-center justify-center ${savannah ? "rounded-none" : "rounded-full"} px-6 py-3 text-sm font-semibold transition-transform duration-200 ${savannah ? "hover:opacity-85" : "hover:-translate-y-0.5"} active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 ${paletteTheme ? "focus-visible:outline-[var(--tf-on-scrim)]" : "focus-visible:outline-[#faf6ef]"}`}
                    style={{ backgroundColor: accent, color: ctaForeground }}
                  >
                    {block.ctaLabel}
                  </a>
                ) : null}
                {block.secondaryCtaLabel && safeSecCtaHref ? (
                  <a
                    {...elementPathProps(editMode, sourceMap, "secondaryCtaLabel")}
                    href={safeSecCtaHref}
                    className={`tf-button${savannah ? " savannah-button" : ""} inline-flex min-h-12 items-center justify-center ${savannah ? "rounded-none" : "rounded-full"} border-[1.5px] px-6 py-3 text-sm font-semibold transition-transform duration-200 ${savannah ? "hover:opacity-80" : "hover:-translate-y-0.5"} active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 ${paletteTheme ? "border-[var(--tf-on-scrim)] text-[var(--tf-on-scrim)] focus-visible:outline-[var(--tf-on-scrim)]" : "border-[#faf6ef] text-[#faf6ef] focus-visible:outline-[#faf6ef]"}`}
                  >
                    {block.secondaryCtaLabel}
                  </a>
                ) : null}
              </div>
            ) : null}
            {block.metaPills?.length ? (
              <ul className={`mt-6 flex flex-wrap justify-start gap-2 text-xs ${heroText}`}>
                {block.metaPills.map((pill, index) => (
                  <li key={`${pill.label}-${index}`} className={`${savannah ? "rounded-none" : "rounded-full"} border px-3 py-2 ${paletteTheme ? "border-[var(--tf-on-scrim)]/45 bg-[var(--tf-band)]/80" : "border-white/45 bg-[#23211f]/80"}`}>
                    {pill.href ? <a href={sanitizeUrl(pill.href)} className="underline-offset-4 hover:underline">{pill.label}</a> : pill.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const alignClass =
    block.align === "left"
      ? "text-left items-start"
      : block.align === "right"
        ? "text-right items-end"
        : "text-center items-center";

  // Variant: Split (2-column layout)
  if (block.variant === "split") {
    const hasMedia = Boolean(safeBgImage || safeVideoUrl);
    return (
      <section className={`relative w-full overflow-hidden ${hasMedia ? "bg-[var(--ps-surface)]" : "bg-[var(--ps-accent-light)]"} border-b border-[var(--ps-border)]`}>
        <div className="mx-auto max-w-6xl px-[var(--ps-space-6)]">
          <div className={`grid grid-cols-1 items-center gap-[var(--ps-space-12)] ${hasMedia ? "lg:grid-cols-2" : "lg:grid-cols-1"}`}>
            <div className={`flex max-w-4xl flex-col items-start gap-[var(--ps-space-6)] ${hasMedia ? "" : "mx-auto"}`}>
              {block.badge && (
                <span {...elementPathProps(editMode, sourceMap, "badge")} className="inline-flex items-center rounded-full bg-[var(--ps-accent-light)] px-[var(--ps-space-3)] py-[var(--ps-space-1)] text-xs font-semibold text-[var(--ps-accent-hover)]">
                  {block.badge}
                </span>
              )}
              {block.tagline && (
                <p {...elementPathProps(editMode, sourceMap, "tagline")} className="text-sm font-medium uppercase tracking-wide text-[var(--ps-muted)]">
                  {block.tagline}
                </p>
              )}
              {(block.heading || hasEditorPlaceholder(editMode, sourceMap, "heading")) && (
                <h1 {...elementPathProps(editMode, sourceMap, "heading")} className="text-4xl font-bold tracking-tight text-[var(--ps-text)] sm:text-5xl lg:text-6xl">
                  {block.heading || "Add headline"}
                </h1>
              )}
              {block.subheading && (
                <p {...elementPathProps(editMode, sourceMap, "subheading")} className="text-lg text-[var(--ps-muted)] leading-relaxed">
                  {block.subheading}
                </p>
              )}
              {(block.ctaLabel || block.secondaryCtaLabel) && (
                <div className="flex flex-wrap gap-[var(--ps-space-3)] pt-[var(--ps-space-2)]">
                  {block.ctaLabel && safeCtaHref && (
                    <a {...elementPathProps(editMode, sourceMap, "ctaLabel")} href={safeCtaHref} className={cn(buttonVariants({ variant: "default" }), "ps-button ps-button-primary gap-[var(--ps-space-2)] text-[var(--ps-accent-foreground)]")}>
                      {block.ctaLabel}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  )}
                  {block.secondaryCtaLabel && safeSecCtaHref && (
                    <a {...elementPathProps(editMode, sourceMap, "secondaryCtaLabel")} href={safeSecCtaHref} className={cn(buttonVariants({ variant: "outline" }), "ps-button ps-button-secondary")}>
                      {block.secondaryCtaLabel}
                    </a>
                  )}
                </div>
              )}
            </div>
            {hasMedia ? <div {...elementPathProps(editMode, sourceMap, "image")} className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-[var(--ps-neutral)] shadow-sm">
              {safeVideoUrl ? (
                <video
                  src={safeVideoUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : safeBgImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={safeBgImage}
                  alt={block.heading || "Hero"}
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div> : null}
          </div>
        </div>
      </section>
    );
  }

  // Variant: Video Background
  if (block.variant === "video_bg" && safeVideoUrl) {
    return (
      <section {...elementPathProps(editMode, sourceMap, "image")} className="relative flex min-h-[520px] w-full flex-col justify-center overflow-hidden px-[var(--ps-space-6)]">
        <video
          src={safeVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" aria-hidden="true" />
        <div className={`relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-[var(--ps-space-6)] ${alignClass}`}>
          {block.badge && (
            <span {...elementPathProps(editMode, sourceMap, "badge")} className="inline-flex items-center rounded-full bg-[var(--ps-surface)]/20 px-[var(--ps-space-3)] py-[var(--ps-space-1)] text-xs font-semibold text-white backdrop-blur-xs">
              {block.badge}
            </span>
          )}
          {block.tagline && (
            <p {...elementPathProps(editMode, sourceMap, "tagline")} className="text-sm font-medium uppercase tracking-wide text-white/80">
              {block.tagline}
            </p>
          )}
          {(block.heading || hasEditorPlaceholder(editMode, sourceMap, "heading")) && (
            <h1 {...elementPathProps(editMode, sourceMap, "heading")} className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              {block.heading || "Add headline"}
            </h1>
          )}
          {block.subheading && (
            <p {...elementPathProps(editMode, sourceMap, "subheading")} className="max-w-2xl text-lg text-white/90 sm:text-xl leading-relaxed">
              {block.subheading}
            </p>
          )}
          {(block.ctaLabel || block.secondaryCtaLabel) && (
            <div className="flex flex-wrap gap-[var(--ps-space-3)] pt-[var(--ps-space-2)]">
              {block.ctaLabel && safeCtaHref && (
                <a
                  {...elementPathProps(editMode, sourceMap, "ctaLabel")}
                  href={safeCtaHref}
                  className="inline-flex items-center gap-[var(--ps-space-2)] rounded-xl bg-[var(--ps-surface)] px-[var(--ps-space-6)] py-[var(--ps-space-3)] text-sm font-semibold text-[var(--ps-text)] shadow-xs transition hover:bg-[var(--ps-neutral)]"
                >
                  {block.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </a>
              )}
              {block.secondaryCtaLabel && safeSecCtaHref && (
                <a
                  {...elementPathProps(editMode, sourceMap, "secondaryCtaLabel")}
                  href={safeSecCtaHref}
                  className="inline-flex items-center rounded-xl border border-white/60 px-[var(--ps-space-6)] py-[var(--ps-space-3)] text-sm font-semibold text-white transition hover:bg-[var(--ps-surface)]/10"
                >
                  {block.secondaryCtaLabel}
                </a>
              )}
            </div>
          )}
        </div>
      </section>
    );
  }

  // Variant: Center (Default)
  const hasHeroImage = Boolean(safeBgImage);
  return (
      <section
      {...elementPathProps(editMode, sourceMap, "image")}
      className="relative flex min-h-[480px] w-full flex-col justify-center overflow-hidden px-[var(--ps-space-6)]"
      style={{
        backgroundColor: hasHeroImage
          ? (block.backgroundColor || "var(--ps-text)")
          : "var(--ps-accent-light)",
        ...(safeBgImage
          ? {
              backgroundImage: `url(${safeBgImage})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : {}),
      }}
    >
      {safeBgImage && (
        <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
      )}
      <div
        className={`relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-[var(--ps-space-6)] ${alignClass}`}
      >
        {block.badge && (
          <span {...elementPathProps(editMode, sourceMap, "badge")} className={`inline-flex items-center rounded-full px-[var(--ps-space-3)] py-[var(--ps-space-1)] text-xs font-semibold backdrop-blur-xs ${hasHeroImage ? "bg-[var(--ps-surface)]/20 text-white" : "bg-[var(--ps-surface)] text-[var(--ps-accent-hover)]"}`}>
            {block.badge}
          </span>
        )}
        {block.tagline && (
          <p {...elementPathProps(editMode, sourceMap, "tagline")} className={`text-sm font-medium uppercase tracking-wide ${hasHeroImage ? "text-white/80" : "text-[var(--ps-muted)]"}`}>
            {block.tagline}
          </p>
        )}
        {(block.heading || hasEditorPlaceholder(editMode, sourceMap, "heading")) && (
          <h1 {...elementPathProps(editMode, sourceMap, "heading")} className={`text-4xl font-bold leading-tight ${hasHeroImage ? "text-white" : "text-[var(--ps-text)]"} sm:text-5xl lg:text-6xl`}>
            {block.heading || "Add headline"}
          </h1>
        )}
        {block.subheading && (
          <p {...elementPathProps(editMode, sourceMap, "subheading")} className={`max-w-2xl text-lg sm:text-xl leading-relaxed ${hasHeroImage ? "text-white/90" : "text-[var(--ps-muted)]"}`}>
            {block.subheading}
          </p>
        )}
        {(block.ctaLabel || block.secondaryCtaLabel) && (
          <div className="flex flex-wrap gap-[var(--ps-space-3)] pt-[var(--ps-space-2)]">
            {block.ctaLabel && safeCtaHref && (
              <a
                {...elementPathProps(editMode, sourceMap, "ctaLabel")}
                href={safeCtaHref}
                className="ps-button ps-button-secondary inline-flex items-center gap-[var(--ps-space-2)] text-sm font-semibold shadow-xs transition"
              >
                {block.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </a>
            )}
            {block.secondaryCtaLabel && safeSecCtaHref && (
              <a
                {...elementPathProps(editMode, sourceMap, "secondaryCtaLabel")}
                href={safeSecCtaHref}
                className="ps-button inline-flex items-center border border-white/60 text-sm font-semibold text-white transition hover:bg-[var(--ps-surface)]/10"
              >
                {block.secondaryCtaLabel}
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ── 2. Features Block ────────────────────────────────────────────────────────

function FeaturesBlockRenderer({
  block,
  editMode,
  sourceMap,
  siteTemplateId,
  sectionAlign,
  businessName,
}: {
  block: FeaturesBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
  siteTemplateId?: string;
  sectionAlign?: "left" | "center";
  businessName?: string;
  businessLogo?: string;
}) {
  const cols = block.columns ?? 3;
  const tableFlame = siteTemplateId === "restaurant-table-flame";
  const savannah = siteTemplateId === "restaurant-savannah";
  const items = block.items ?? [];
  if (savannah && items.length === 0) return null;
  const colClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section id={block.heading === "How it works" ? "how-it-works" : undefined} className="w-full">
      <SectionHeading heading={block.heading} subheading={block.subheading} align={sectionAlign} />
      {savannah ? (
        (() => {
          const hasAnyImage = items.some((item) => Boolean(item.image));
          if (!hasAnyImage) {
            return (
              <div className="mx-auto max-w-6xl grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 sm:gap-x-8">
                {items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--ps-accent)] text-[var(--ps-accent-foreground)]">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span {...elementPathProps(editMode, sourceMap, "items[" + i + "].title")} className="text-[16px] font-semibold text-[var(--ps-text)]">
                      {item.title}
                    </span>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div className={`grid gap-8 ${
              items.length === 1
                ? "mx-auto max-w-md grid-cols-1"
                : items.length === 2
                  ? "mx-auto max-w-3xl sm:grid-cols-2"
                  : "mx-auto max-w-6xl sm:grid-cols-2 lg:grid-cols-3"
            }`}>
              {items.map((item, i) => {
                const itemImg = item.image ? safeImageSrc(item.image) : "";
                return (
                  <article key={i} className="savannah-card flex flex-col overflow-hidden bg-[var(--ps-surface)]">
                    {itemImg ? (
                      <div className="aspect-[16/9] w-full overflow-hidden bg-[var(--tf-soft)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={itemImg} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                      </div>
                    ) : null}
                    <div className="p-6">
                      <p className="mb-2 text-xs font-medium uppercase tracking-[0.1em] text-[var(--tf-accent-deep)]">{String(i + 1).padStart(2, "0")}</p>
                      <h3 {...elementPathProps(editMode, sourceMap, "items[" + i + "].title")} className="font-[var(--v2-heading-font)] text-xl font-bold text-[var(--ps-text)]">{item.title}</h3>
                      {item.description ? <p {...elementPathProps(editMode, sourceMap, "items[" + i + "].description")} className="mt-2 text-base leading-7 text-[var(--ps-muted)]">{item.description}</p> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })()
      ) : (
      <div className={`grid grid-cols-1 gap-[var(--ps-space-6)] ${tableFlame
        ? items.length >= 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "mx-auto w-full max-w-4xl sm:grid-cols-2"
        : colClass}`}>
        {items.map((item, i) => {
          const safeItemHref = item.href ? sanitizeUrl(item.href) : "";
          return (
            <div
              key={i}
              className={`flex flex-col justify-between rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xs transition hover:shadow-sm ${tableFlame ? "tf-card overflow-hidden p-0" : "p-[var(--ps-space-6)]"}`}
            >
              {tableFlame ? (
                <div className="flex h-32 items-center justify-center bg-[var(--tf-subtle)] sm:h-40">
                  <TableFlameFallbackMark businessName={businessName} className="text-6xl font-medium" />
                </div>
              ) : null}
              <div className={tableFlame ? "p-6" : ""}>
                {item.icon && (
                  <div className="mb-[var(--ps-space-4)] inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--ps-accent-light)] text-lg text-[var(--ps-accent-hover)] font-semibold">
                    {item.icon}
                  </div>
                )}
                <h3 {...elementPathProps(editMode, sourceMap, "items[" + i + "].title")} className="text-lg font-semibold text-[var(--ps-text)]">{item.title}</h3>
                {item.description && (
                  <p {...elementPathProps(editMode, sourceMap, "items[" + i + "].description")} className="mt-[var(--ps-space-2)] text-sm text-[var(--ps-muted)] leading-relaxed">
                    {item.description}
                  </p>
                )}
              </div>
              {safeItemHref && (
                <a
                  href={safeItemHref}
                  className="mt-[var(--ps-space-4)] inline-flex items-center gap-[var(--ps-space-2)] text-sm font-medium text-[var(--ps-accent-hover)] hover:underline"
                >
                  Learn more
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>
      )}
    </section>
  );
}

// ── 3. About Block ───────────────────────────────────────────────────────────

function AboutBlockRenderer({
  block,
  editMode,
  sourceMap,
  siteTemplateId,
  sectionAlign,
  businessName,
}: {
  block: AboutBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
  siteTemplateId?: string;
  sectionAlign?: "left" | "center";
  businessName?: string;
  businessLogo?: string;
}) {
  const safeFounderImage = block.founderImage ? safeImageSrc(block.founderImage) : "";

  if (siteTemplateId === "restaurant-table-flame") {
    return (
      <section id="about" className="w-full">
        <SectionHeading heading={block.heading || "Our Story"} subheading={block.subheading} align={sectionAlign} />
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-2 lg:gap-14">
          <div className="flex flex-col gap-6">
            {block.story ? <div {...elementPathProps(editMode, sourceMap, "story")} className="prose prose-zinc max-w-none text-base leading-relaxed text-[var(--ps-muted)]"><p>{block.story}</p></div> : null}
            {block.mission ? <div className="border-l-2 border-[var(--ps-accent)] bg-[var(--ps-neutral)] p-5"><span className="text-xs font-bold uppercase tracking-wider text-[var(--ps-accent-hover)]">Our Mission</span><p className="mt-2 text-base italic leading-relaxed text-[var(--ps-text)]">&ldquo;{block.mission}&rdquo;</p></div> : null}
            {block.highlights?.length ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {block.highlights.map((highlight, index) => (
                  <div key={index} {...elementPathProps(editMode, sourceMap, `highlights[${index}].value`)} className={`rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-4 ${sectionAlign === "center" ? "text-center" : "text-left"}`}>
                    <div className="text-2xl font-medium text-[var(--ps-text)]">{highlight.value}</div>
                    <div {...elementPathProps(editMode, sourceMap, `highlights[${index}].label`)} className="mt-1 text-xs font-medium text-[var(--ps-muted)]">{highlight.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--tf-subtle)]">
            {safeFounderImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img {...elementPathProps(editMode, sourceMap, "founderImage")} src={safeFounderImage} alt={businessName || "Our story"} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <TableFlameFallbackMark businessName={businessName} className="text-8xl font-medium" />
            )}
          </div>
        </div>
      </section>
    );
  }

  if (siteTemplateId === "restaurant-savannah") {
    return (
      <section id="about" className="w-full">
        <div className="grid grid-cols-1 items-center gap-8 md:grid-cols-12 md:gap-14">
          <div className="savannah-card flex aspect-[3/4] max-h-[520px] items-center justify-center overflow-hidden bg-[var(--tf-soft)] md:col-span-5">
            {safeFounderImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img {...elementPathProps(editMode, sourceMap, "founderImage")} src={safeFounderImage} alt={businessName || "Our story"} className="h-full w-full object-cover" loading="lazy" />
            ) : <SavannahFallbackMark businessName={businessName} />}
          </div>
          <div className="savannah-copy space-y-6 md:col-span-7">
            {block.caption ? (
              <p {...elementPathProps(editMode, sourceMap, "caption")} className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--tf-accent-deep)]">
                {block.caption}
              </p>
            ) : null}
            <h2 {...elementPathProps(editMode, sourceMap, "heading")} className="font-[var(--v2-heading-font)] text-3xl font-bold leading-tight text-[var(--ps-text)] sm:text-4xl md:text-5xl">
              {block.heading || "Our Story"}
            </h2>
            {block.subtitle ? (
              <p {...elementPathProps(editMode, sourceMap, "subtitle")} className="text-lg font-medium leading-snug text-[var(--ps-text)]">
                {block.subtitle}
              </p>
            ) : null}
            {block.story ? (
              <div {...elementPathProps(editMode, sourceMap, "story")} className="whitespace-pre-line text-base leading-7 text-[var(--ps-muted)]">
                <p>{block.story}</p>
              </div>
            ) : null}
            {block.mission ? <blockquote className="border-l border-[var(--tf-soft)] pl-5 text-lg leading-7 text-[var(--ps-text)]">&ldquo;{block.mission}&rdquo;</blockquote> : null}
            {block.highlights?.length ? (
              <div className="grid grid-cols-2 gap-6 pt-2">
                {block.highlights.map((highlight, index) => (
                  <div key={index} {...elementPathProps(editMode, sourceMap, `highlights[${index}].value`)} className="savannah-card bg-[var(--tf-soft)] p-4">
                    <div className="text-2xl font-bold text-[var(--tf-on-soft)]">{highlight.value}</div>
                    <div {...elementPathProps(editMode, sourceMap, `highlights[${index}].label`)} className="mt-1 text-xs font-medium text-[var(--ps-muted)]">{highlight.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="about" className="w-full">
      <SectionHeading heading={block.heading} subheading={block.subheading} />
      
      <div className="grid grid-cols-1 gap-[var(--ps-space-12)] lg:grid-cols-12 items-start">
        {/* Story Narrative & Mission */}
        <div className={`flex flex-col gap-[var(--ps-space-6)] ${safeFounderImage || block.founderName ? "lg:col-span-7" : "lg:col-span-12"}`}>
          {block.story && (
            <div {...elementPathProps(editMode, sourceMap, "story")} className="prose prose-zinc max-w-none text-base leading-relaxed text-[var(--ps-muted)]">
              <p>{block.story}</p>
            </div>
          )}

          {block.mission && (
            <div className="rounded-xl border-l-4 border-[var(--ps-accent)] bg-[var(--ps-neutral)] p-[var(--ps-space-6)] shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--ps-accent-hover)]">
                Our Mission
              </span>
              <p className="mt-[var(--ps-space-2)] text-base italic text-[var(--ps-text)] leading-relaxed">
                &ldquo;{block.mission}&rdquo;
              </p>
            </div>
          )}

          {/* Metric Highlights Grid */}
          {block.highlights && block.highlights.length > 0 && (
            <div className="mt-[var(--ps-space-4)] grid grid-cols-2 gap-[var(--ps-space-4)] sm:grid-cols-3">
              {block.highlights.map((hl, i) => (
                <div
                  {...elementPathProps(editMode, sourceMap, "highlights[" + i + "].value")}
                  key={i}
                  className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-4)] shadow-xs text-center"
                >
                  {hl.icon && <div className="text-xl mb-[var(--ps-space-1)]">{hl.icon}</div>}
                  <div className="text-2xl font-bold text-[var(--ps-text)]">
                    {hl.value}
                  </div>
                  <div {...elementPathProps(editMode, sourceMap, "highlights[" + i + "].label")} className="text-xs font-medium text-[var(--ps-muted)] mt-[var(--ps-space-1)]">
                    {hl.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Founder Bio Card */}
        {(safeFounderImage || block.founderName) && (
          <div className="lg:col-span-5">
            <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs">
              {safeFounderImage && (
                <div className="aspect-4/3 w-full overflow-hidden rounded-lg bg-[var(--ps-neutral)] mb-[var(--ps-space-6)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    {...elementPathProps(editMode, sourceMap, "founderImage")}
                    src={safeFounderImage}
                    alt={block.founderName || "Founder"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              {block.founderName && (
                <h3 className="text-lg font-bold text-[var(--ps-text)]">
                  {block.founderName}
                </h3>
              )}
              {block.founderRole && (
                <p className="text-sm font-medium text-[var(--ps-accent-hover)]">
                  {block.founderRole}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── 4. Gallery Block ─────────────────────────────────────────────────────────

function GalleryBlockRenderer({
  block,
  editMode,
  sourceMap,
  siteTemplateId,
  sectionAlign,
  businessName,
}: {
  block: GalleryBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
  siteTemplateId?: string;
  sectionAlign?: "left" | "center";
  businessName?: string;
}) {
  const tableFlame = siteTemplateId === "restaurant-table-flame";
  const savannah = siteTemplateId === "restaurant-savannah";
  const paletteTheme = tableFlame || savannah;
  const cols = block.columns ?? 3;
  const layout = block.layout ?? "grid";
  const images = paletteTheme && !(block.images?.length)
    ? savannah ? [] : [{ src: "", alt: "" }]
    : block.images ?? [];
  if (savannah && images.length === 0) return null;

  const colClass = paletteTheme
    ? "grid-cols-2 lg:grid-cols-3"
    :
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="w-full">
      <SectionHeading heading={block.heading} subheading={block.subheading} align={sectionAlign} />

      {layout === "carousel" ? (
        <div className="flex gap-[var(--ps-space-4)] overflow-x-auto pb-[var(--ps-space-4)] snap-x snap-mandatory scrollbar-thin">
          {images.map((img, i) => {
            const safeImgSrc = safeImageSrc(img.src);
            if (!safeImgSrc) return paletteTheme ? (
              <figure key={i} className={savannah
                ? "savannah-card flex aspect-[4/3] w-72 shrink-0 items-center justify-center snap-start overflow-hidden bg-[var(--tf-soft)] sm:w-80"
                : "flex aspect-[4/3] w-72 shrink-0 items-center justify-center snap-start overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--tf-subtle)] sm:w-80"}>
                {savannah ? <SavannahFallbackMark businessName={businessName} /> : <TableFlameFallbackMark businessName={businessName} className="text-7xl font-medium" />}
              </figure>
            ) : null;
            return (
              <figure
                key={i}
                className="w-72 shrink-0 snap-start overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)] shadow-xs sm:w-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  {...elementPathProps(editMode, sourceMap, "images[" + i + "].src")}
                  src={safeImgSrc}
                  alt={img.alt ?? ""}
                  className="h-56 w-full object-cover"
                  loading="lazy"
                />
                {img.caption && (
                  <figcaption className="px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-center text-xs text-[var(--ps-muted)]">
                    {img.caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      ) : layout === "masonry" ? (
        <div className="columns-1 gap-[var(--ps-space-4)] sm:columns-2 lg:columns-3">
          {images.map((img, i) => {
            const safeImgSrc = safeImageSrc(img.src);
            if (!safeImgSrc) return paletteTheme ? (
              <figure key={i} className={savannah
                ? "savannah-card mb-[var(--ps-space-4)] flex min-h-56 break-inside-avoid items-center justify-center overflow-hidden bg-[var(--tf-soft)]"
                : "mb-[var(--ps-space-4)] flex min-h-56 break-inside-avoid items-center justify-center overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--tf-subtle)]"}>
                {savannah ? <SavannahFallbackMark businessName={businessName} /> : <TableFlameFallbackMark businessName={businessName} className="text-7xl font-medium" />}
              </figure>
            ) : null;
            return (
              <figure
                key={i}
                className="mb-[var(--ps-space-4)] break-inside-avoid overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)] shadow-xs"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  {...elementPathProps(editMode, sourceMap, "images[" + i + "].src")}
                  src={safeImgSrc}
                  alt={img.alt ?? ""}
                  className="w-full object-cover"
                  loading="lazy"
                />
                {img.caption && (
                  <figcaption className="px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-center text-xs text-[var(--ps-muted)]">
                    {img.caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      ) : (
        <div className={`grid ${paletteTheme ? "grid-cols-2 gap-4 lg:grid-cols-3" : `grid-cols-1 gap-[var(--ps-space-4)] ${colClass}`}`}>
          {images.map((img, i) => {
            const safeImgSrc = safeImageSrc(img.src);
            if (!safeImgSrc) return paletteTheme ? (
              <figure key={i} className={savannah
                ? "savannah-card flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--tf-soft)]"
                : "flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--tf-subtle)]"}>
                {savannah ? <SavannahFallbackMark businessName={businessName} /> : <TableFlameFallbackMark businessName={businessName} className="text-7xl font-medium" />}
              </figure>
            ) : null;
            return (
              <figure
                key={i}
                className={`overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)] shadow-xs ${paletteTheme ? "aspect-[4/3]" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  {...elementPathProps(editMode, sourceMap, "images[" + i + "].src")}
                  src={safeImgSrc}
                  alt={img.alt ?? ""}
                  className={`w-full object-cover ${paletteTheme ? "h-full" : "h-56"}`}
                  loading="lazy"
                />
                {img.caption && (
                  <figcaption className="px-[var(--ps-space-3)] py-[var(--ps-space-2)] text-center text-xs text-[var(--ps-muted)]">
                    {img.caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── 5. Testimonials Block ────────────────────────────────────────────────────

function TestimonialsBlockRenderer({
  block,
  editMode,
  sourceMap,
  siteTemplateId,
  sectionAlign,
}: {
  block: TestimonialsBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
  siteTemplateId?: string;
  sectionAlign?: "left" | "center";
}) {
  const layout = block.layout ?? "grid";
  const savannah = siteTemplateId === "restaurant-savannah";

  if (savannah) {
    const item = (block.items ?? []).find((entry) => entry.quote.trim());
    if (!item) return null;
    return (
      <section className="w-full">
        <SectionHeading heading={block.heading || "A word from our guests"} subheading={block.subheading} align={sectionAlign} />
        <figure className="savannah-copy mx-auto max-w-4xl text-center">
          <blockquote {...elementPathProps(editMode, sourceMap, "items[0].quote")} className="font-[var(--v2-heading-font)] text-3xl font-bold leading-tight text-[var(--ps-text)] md:text-5xl">&ldquo;{item.quote}&rdquo;</blockquote>
          {item.author ? <figcaption {...elementPathProps(editMode, sourceMap, "items[0].author")} className="mt-6 text-xs font-medium uppercase tracking-[0.1em] text-[var(--tf-accent-deep)]">{item.author}</figcaption> : null}
        </figure>
      </section>
    );
  }

  return (
    <section className="w-full">
      <SectionHeading heading={block.heading || (siteTemplateId === "restaurant-table-flame" ? "Words from the table" : undefined)} subheading={block.subheading} align={sectionAlign} />

      <div
        className={
          layout === "carousel"
            ? "flex gap-[var(--ps-space-6)] overflow-x-auto pb-[var(--ps-space-4)] snap-x snap-mandatory"
            : "grid grid-cols-1 gap-[var(--ps-space-6)] sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {(block.items ?? []).map((t, i) => {
          const safeAvatar = t.avatar ? safeImageSrc(t.avatar) : "";
          const rating = t.rating ? Math.min(Math.max(1, Math.round(t.rating)), 5) : 0;

          return (
            <blockquote
              key={i}
              className={`flex flex-col justify-between rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs ${
                layout === "carousel" ? "w-80 shrink-0 snap-start" : ""
              }`}
            >
              <div className="flex flex-col gap-[var(--ps-space-3)]">
                {rating > 0 && (
                  <div className="flex items-center gap-[var(--ps-space-1)] text-amber-400">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className={`h-4 w-4 ${
                          idx < rating ? "fill-amber-400 text-amber-400" : "text-[var(--ps-muted)]"
                        }`}
                      />
                    ))}
                  </div>
                )}
                <p {...elementPathProps(editMode, sourceMap, "items[" + i + "].quote")} className={`${siteTemplateId === "restaurant-table-flame" ? "font-[var(--v2-heading-font)] text-xl text-[var(--ps-text)] md:text-2xl" : "text-sm text-[var(--ps-muted)]"} leading-relaxed`}>
                  &ldquo;{t.quote}&rdquo;
                </p>
              </div>
              <footer className="mt-[var(--ps-space-6)] flex items-center gap-[var(--ps-space-3)] border-t border-[var(--ps-border)] pt-[var(--ps-space-4)]">
                {safeAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={safeAvatar}
                    alt={t.author ?? ""}
                    className="h-10 w-10 rounded-full object-cover border border-[var(--ps-border)]"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--ps-neutral)] text-sm font-semibold text-[var(--ps-muted)]">
                    {t.author ? t.author.charAt(0).toUpperCase() : "★"}
                  </div>
                )}
                <div>
                  {t.author && (
                    <cite {...elementPathProps(editMode, sourceMap, "items[" + i + "].author")} className="not-italic text-sm font-semibold text-[var(--ps-text)] block">
                      {t.author}
                    </cite>
                  )}
                  {t.role && (
                    <span className="text-xs text-[var(--ps-muted)] block">{t.role}</span>
                  )}
                </div>
              </footer>
            </blockquote>
          );
        })}
      </div>
    </section>
  );
}

// ── 6. Contact Block ─────────────────────────────────────────────────────────

function ContactBlockRenderer({
  block,
  editMode,
  sourceMap,
  nextDayLabel,
  closedLabel,
  siteTemplateId,
  sectionAlign,
}: {
  block: ContactBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
  nextDayLabel: string;
  closedLabel: string;
  siteTemplateId?: string;
  sectionAlign?: "left" | "center";
}) {
  const safeEmail = block.email ? sanitizeUrl(`mailto:${block.email}`) : "";
  const safePhone = block.phone ? sanitizeUrl(`tel:${block.phone}`) : "";
  const mapSearch = block.mapQuery || block.address;
  const safeMapLink = mapSearch
    ? sanitizeUrl(`https://maps.google.com/?q=${encodeURIComponent(mapSearch)}`)
    : "";

  if (siteTemplateId === "restaurant-table-flame") {
    const safeDirections = block.directionsUrl ? sanitizeUrl(block.directionsUrl) : safeMapLink;
    const hasHours = Boolean(block.hoursTable?.length || block.hours);
    const hasLocation = Boolean(block.address || block.phone || block.email || safeDirections || block.locations?.length);
    return (
      <section id="contact" className="w-full">
        <SectionHeading heading={block.heading || "Hours & Location"} subheading={block.subheading} align={sectionAlign} />
        <div className={`grid grid-cols-1 gap-8 ${hasHours && hasLocation ? "md:grid-cols-2 md:gap-14" : ""}`}>
          {hasHours ? (
            <div>
              <h3 className="mb-4 text-xl font-medium text-[var(--ps-text)]">Opening Hours</h3>
              {block.hoursTable?.length ? (
                <ul className="divide-y divide-[var(--ps-border)] border-y border-[var(--ps-border)] text-sm">
                  {block.hoursTable.map((row, index) => (
                    <li key={index} className="flex items-center justify-between gap-4 py-3">
                      <span className="font-medium text-[var(--ps-text)]">{row.day}</span>
                      <span className="text-[var(--ps-muted)]">{row.closed ? closedLabel : [row.open, row.close].filter(Boolean).join(" – ") || "–"}{!row.closed && isOvernightWebsiteInterval(row.open, row.close) ? ` (${nextDayLabel})` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-base leading-7 text-[var(--ps-muted)]">{block.hours}</p>}
            </div>
          ) : null}
          {hasLocation ? (
            <div className="space-y-3">
              <h3 className="text-xl font-medium text-[var(--ps-text)]">Location</h3>
              {block.address ? <p className="text-base leading-7 text-[var(--ps-muted)]">{block.address}</p> : null}
              {block.phone && safePhone ? <a className="block text-base text-[var(--ps-text)] underline underline-offset-4" href={safePhone}>{block.phone}</a> : null}
              {block.email && safeEmail ? <a className="block text-base text-[var(--ps-text)] underline underline-offset-4" href={safeEmail}>{block.email}</a> : null}
              {safeDirections ? <a className="inline-block text-sm font-semibold text-[var(--ps-accent-hover)] underline underline-offset-4" href={safeDirections} target="_blank" rel="noreferrer">Get directions</a> : null}
              {block.locations?.map((location, index) => (
                <div key={index} className="border-t border-[var(--ps-border)] pt-3">
                  {location.name ? <p className="font-semibold text-[var(--ps-text)]">{location.name}</p> : null}
                  {location.address ? <p className="text-sm text-[var(--ps-muted)]">{location.address}</p> : null}
                  {location.hours ? <p className="text-sm text-[var(--ps-muted)]">{location.hours}</p> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  if (siteTemplateId === "restaurant-savannah") {
    const safeDirections = block.directionsUrl ? sanitizeUrl(block.directionsUrl) : safeMapLink;
    const hasHours = Boolean(block.hoursTable?.length || block.hours);
    const hasLocation = Boolean(block.address || block.phone || block.email || safeDirections || block.locations?.length);
    if (!hasHours && !hasLocation) return null;
    return (
      <section id="contact" className="w-full">
        <SectionHeading heading={block.heading || "Hours & Location"} subheading={block.subheading} align={sectionAlign} />
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-14">
          {hasHours ? <div className="savannah-copy space-y-4">
            <h3 className="font-[var(--v2-heading-font)] text-xl font-bold text-[var(--ps-text)]">Opening Hours</h3>
            {block.hoursTable?.length ? <ul className="space-y-3 text-sm">
              {block.hoursTable.map((row, index) => <li key={index} className="flex items-center justify-between gap-4">
                <span className="font-medium text-[var(--ps-text)]">{row.day}</span>
                <span className="text-[var(--ps-muted)]">{row.closed ? closedLabel : [row.open, row.close].filter(Boolean).join(" – ") || "–"}{!row.closed && isOvernightWebsiteInterval(row.open, row.close) ? ` (${nextDayLabel})` : ""}</span>
              </li>)}
            </ul> : <p className="text-base leading-7 text-[var(--ps-muted)]">{block.hours}</p>}
          </div> : null}
          {hasLocation ? <div className="savannah-copy space-y-3">
            <h3 className="font-[var(--v2-heading-font)] text-xl font-bold text-[var(--ps-text)]">Location</h3>
            {block.address ? <p className="text-base leading-7 text-[var(--ps-muted)]">{block.address}</p> : null}
            {block.phone && safePhone ? <a className="block text-base text-[var(--ps-text)] underline underline-offset-4" href={safePhone}>{block.phone}</a> : null}
            {block.email && safeEmail ? <a className="block text-base text-[var(--ps-text)] underline underline-offset-4" href={safeEmail}>{block.email}</a> : null}
            {safeDirections ? <a className="inline-block text-sm font-semibold text-[var(--tf-accent-deep)] underline underline-offset-4" href={safeDirections} target="_blank" rel="noreferrer">Get directions</a> : null}
            {block.locations?.map((location, index) => <div key={index} className="border-t border-[var(--tf-soft)] pt-3">
              {location.name ? <p className="font-semibold text-[var(--ps-text)]">{location.name}</p> : null}
              {location.address ? <p className="text-sm text-[var(--ps-muted)]">{location.address}</p> : null}
              {location.hours ? <p className="text-sm text-[var(--ps-muted)]">{location.hours}</p> : null}
            </div>)}
          </div> : null}
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="w-full">
      <SectionHeading heading={block.heading} subheading={block.subheading} />

      <div className="grid grid-cols-1 gap-[var(--ps-space-8)] md:grid-cols-2 items-start">
        {/* Contact Info Cards */}
        <div className="grid grid-cols-1 gap-[var(--ps-space-4)] sm:grid-cols-2">
          {block.email && (
            <div className="flex flex-col rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs">
              <div className="mb-[var(--ps-space-3)] inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]">
                <Mail className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ps-muted)]">
                Email
              </span>
              {safeEmail ? (
                <a
                  href={safeEmail}
                  {...elementPathProps(editMode, sourceMap, "email")}
                  className="mt-[var(--ps-space-1)] text-sm font-medium text-[var(--ps-text)] hover:text-[var(--ps-accent-hover)] hover:underline truncate"
                >
                  {block.email}
                </a>
              ) : (
                <span {...elementPathProps(editMode, sourceMap, "email")} className="mt-[var(--ps-space-1)] text-sm font-medium text-[var(--ps-text)] truncate">
                  {block.email}
                </span>
              )}
            </div>
          )}

          {(block.phone || hasEditorPlaceholder(editMode, sourceMap, "phone")) && (
            <div className="flex flex-col rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs">
              <div className="mb-[var(--ps-space-3)] inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]">
                <Phone className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ps-muted)]">
                Phone
              </span>
              {block.phone && safePhone ? (
                <a
                  {...elementPathProps(editMode, sourceMap, "phone")}
                  href={safePhone}
                  className="mt-[var(--ps-space-1)] text-sm font-medium text-[var(--ps-text)] hover:text-[var(--ps-accent-hover)] hover:underline truncate"
                >
                  {block.phone}
                </a>
              ) : (
                <span {...elementPathProps(editMode, sourceMap, "phone")} className="mt-[var(--ps-space-1)] text-sm font-medium text-[var(--ps-text)] truncate">
                  {block.phone || "Add phone"}
                </span>
              )}
            </div>
          )}

          {(block.address || hasEditorPlaceholder(editMode, sourceMap, "address")) && (
            <div className="flex flex-col rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs sm:col-span-2">
              <div className="mb-[var(--ps-space-3)] inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]">
                <MapPin className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ps-muted)]">
                Address
              </span>
              <p {...elementPathProps(editMode, sourceMap, "address")} className="mt-[var(--ps-space-1)] text-sm font-medium text-[var(--ps-text)]">
                {block.address || "Add address"}
              </p>
            </div>
          )}

          {block.hoursTable && block.hoursTable.length > 0 ? (
            <div className="flex flex-col rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs sm:col-span-2">
              <div className="mb-[var(--ps-space-3)] inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]">
                <Clock className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ps-muted)]">
                Opening Hours
              </span>
              <ul className="mt-[var(--ps-space-2)] divide-y divide-[var(--ps-border)] text-sm">
                {block.hoursTable.map((row, index) => (
                  <li {...elementPathProps(editMode, sourceMap, "hoursTable[" + index + "]")} key={index} className="flex items-center justify-between gap-[var(--ps-space-4)] py-[var(--ps-space-2)]">
                    <span className="font-medium text-[var(--ps-text)]">{row.day}</span>
                    <span className="text-[var(--ps-muted)]">
                      {row.closed ? closedLabel : [row.open, row.close].filter(Boolean).join(" – ") || "–"}
                      {!row.closed && isOvernightWebsiteInterval(row.open, row.close) ? ` (${nextDayLabel})` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            (block.hours || hasEditorPlaceholder(editMode, sourceMap, "hours")) && (
              <div className="flex flex-col rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs sm:col-span-2">
                <div className="mb-[var(--ps-space-3)] inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ps-muted)]">
                  Opening Hours
                </span>
                <p {...elementPathProps(editMode, sourceMap, "hours")} className="mt-[var(--ps-space-1)] text-sm font-medium text-[var(--ps-text)]">
                  {block.hours || "Add opening hours"}
                </p>
              </div>
            )
          )}

          {block.locations &&
            block.locations.map((location, index) => (
              <div
                key={index}
                {...elementPathProps(editMode, sourceMap, "locations[" + index + "].name")}
                className="flex flex-col rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs sm:col-span-2"
              >
                <div className="mb-[var(--ps-space-3)] inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--ps-accent-light)] text-[var(--ps-accent-hover)]">
                  <MapPin className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ps-muted)]">
                  {location.name || "Location"}
                </span>
                {location.address && (
                  <p {...elementPathProps(editMode, sourceMap, "locations[" + index + "].address")} className="mt-[var(--ps-space-1)] text-sm font-medium text-[var(--ps-text)]">{location.address}</p>
                )}
                {location.hours && <p {...elementPathProps(editMode, sourceMap, "locations[" + index + "].hours")} className="mt-[var(--ps-space-1)] text-sm text-[var(--ps-muted)]">{location.hours}</p>}
              </div>
            ))}

          {block.directionsUrl && sanitizeUrl(block.directionsUrl) ? (
            <div className="sm:col-span-2">
              <a
                {...elementPathProps(editMode, sourceMap, "directionsUrl")}
                href={sanitizeUrl(block.directionsUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="ps-button ps-button-primary inline-flex items-center gap-[var(--ps-space-2)] text-sm font-semibold shadow-xs transition"
              >
                Get Directions
              </a>
            </div>
          ) : null}
        </div>

        {/* Map Preview or Direction Link */}
        <div className="flex h-full min-h-[260px] flex-col justify-center rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)] p-[var(--ps-space-6)] text-center shadow-xs">
          <MapPin className="mx-auto h-8 w-8 text-[var(--ps-accent-hover)]" />
          <h4 className="mt-[var(--ps-space-3)] text-base font-semibold text-[var(--ps-text)]">
            Find Us on the Map
          </h4>
          <p className="mt-[var(--ps-space-1)] text-sm text-[var(--ps-muted)]">
            {block.address || block.mapQuery || "Visit our physical location."}
          </p>
          {safeMapLink && (
            <div className="mt-[var(--ps-space-6)]">
              <a
                href={safeMapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="ps-button ps-button-secondary inline-flex items-center gap-[var(--ps-space-2)] text-sm font-semibold shadow-xs transition"
              >
                Open in Google Maps
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── 7. FAQ Block ─────────────────────────────────────────────────────────────

function FaqBlockRenderer({
  block,
  editMode,
  sourceMap,
}: {
  block: FaqBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
}) {
  return (
    <section id="faq" className="w-full">
      <SectionHeading heading={block.heading} subheading={block.subheading} />
      <div className="divide-y divide-[var(--ps-border)] rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs">
        {(block.items ?? []).map((item, i) => (
          <details key={i} className="group py-[var(--ps-space-4)] first:pt-0 last:pb-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-[var(--ps-space-4)] font-semibold text-[var(--ps-text)] transition hover:text-[var(--ps-accent-hover)]">
              <span {...elementPathProps(editMode, sourceMap, "items[" + i + "].question")} className="text-base">{item.question}</span>
              <span className="shrink-0 text-[var(--ps-muted)] transition group-open:rotate-180">
                ▾
              </span>
            </summary>
            <p {...elementPathProps(editMode, sourceMap, "items[" + i + "].answer")} className="mt-[var(--ps-space-3)] text-sm leading-relaxed text-[var(--ps-muted)]">
              {item.answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

// ── 8. Events Embed Block (Live Data) ────────────────────────────────────────

async function EventsEmbedBlockRenderer({
  block,
  tenantId,
  isTeamMember,
}: {
  block: EventsEmbedBlock;
  tenantId?: string;
  isTeamMember?: boolean;
}) {
  const events = tenantId
    ? await resolveEventsEmbed(block, tenantId, Boolean(isTeamMember))
    : [];

  const layout = block.layout ?? "grid";

  return (
    <section className="w-full">
      <SectionHeading heading={block.heading || "Upcoming Events"} subheading={block.subheading} />

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--ps-border)] p-[var(--ps-space-8)] text-center text-sm text-[var(--ps-muted)]">
          No events scheduled at this time.
        </div>
      ) : layout === "list" ? (
        <div className="flex flex-col gap-[var(--ps-space-4)]">
          {events.map((event: ResolvedEventItem) => (
            <div
              key={event.id}
              className="flex flex-col gap-[var(--ps-space-4)] sm:flex-row sm:items-center justify-between rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs transition hover:shadow-sm"
            >
              <div className="flex flex-col gap-[var(--ps-space-1)]">
                <div className="flex items-center gap-[var(--ps-space-2)]">
                  <h3 className="text-base font-bold text-[var(--ps-text)]">{event.title}</h3>
                  {event.isDraft && <DraftBadge />}
                </div>
                <div className="flex flex-wrap items-center gap-[var(--ps-space-4)] text-xs text-[var(--ps-muted)] mt-[var(--ps-space-1)]">
                  <span className="inline-flex items-center gap-[var(--ps-space-1)]">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(event.event_date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {(event.venue_name || event.city) && (
                    <span className="inline-flex items-center gap-[var(--ps-space-1)]">
                      <MapPin className="h-3.5 w-3.5" />
                      {[event.venue_name, event.city].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-[var(--ps-space-3)]">
                <span className="text-sm font-semibold text-[var(--ps-text)]">
                  {event.ticket_price_min != null && event.ticket_price_min > 0
                    ? `${event.currency} $${event.ticket_price_min.toFixed(2)}`
                    : "Free"}
                </span>
                <Link
                  href={`/events/${event.slug}`}
                  className="ps-button ps-button-primary inline-flex items-center gap-[var(--ps-space-1)] text-xs font-semibold shadow-xs transition"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--ps-space-6)] sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event: ResolvedEventItem) => {
            const safeCover = event.cover_image ? safeImageSrc(event.cover_image) : "";
            return (
              <div
                key={event.id}
                className="flex flex-col overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xs transition hover:shadow-sm"
              >
                <div className="relative aspect-16/9 w-full bg-[var(--ps-neutral)]">
                  {safeCover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeCover}
                      alt={event.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[var(--ps-neutral)] text-[var(--ps-muted)]">
                      <Calendar className="h-8 w-8" />
                    </div>
                  )}
                  {event.isDraft && (
                    <div className="absolute top-3 left-3">
                      <DraftBadge />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between p-[var(--ps-space-6)]">
                  <div>
                    <div className="flex items-center gap-[var(--ps-space-2)] text-xs font-medium text-[var(--ps-accent-hover)] mb-[var(--ps-space-1)]">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(event.event_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <h3 className="text-base font-bold text-[var(--ps-text)] line-clamp-1">
                      {event.title}
                    </h3>
                    {(event.venue_name || event.city) && (
                      <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)] line-clamp-1">
                        {[event.venue_name, event.city].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="mt-[var(--ps-space-4)] flex items-center justify-between border-t border-[var(--ps-border)] pt-[var(--ps-space-3)]">
                    <span className="text-sm font-semibold text-[var(--ps-text)]">
                      {event.ticket_price_min != null && event.ticket_price_min > 0
                        ? `${event.currency} $${event.ticket_price_min.toFixed(2)}`
                        : "Free"}
                    </span>
                    <Link
                      href={`/events/${event.slug}`}
                      className="inline-flex items-center gap-[var(--ps-space-1)] text-xs font-semibold text-[var(--ps-accent-hover)] hover:underline"
                    >
                      View Event →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── 9. Products Embed Block (Live Data) ──────────────────────────────────────

async function ProductsEmbedBlockRenderer({
  block,
  tenantId,
  isTeamMember,
  currencyLocale,
  accentColor,
  siteSlug,
  currency,
}: {
  block: ProductsEmbedBlock;
  tenantId?: string;
  isTeamMember?: boolean;
  currencyLocale?: Locale;
  accentColor?: string;
  siteSlug?: string;
  currency?: string;
}) {
  const isStore = block.siteLocalProductDetails === true;
  const products: Array<ResolvedProductItem | StorefrontProductPreviewItem> = tenantId
    ? await resolveProductsEmbed(block, tenantId, Boolean(isTeamMember) && !isStore)
    : block.previewProducts ?? [];
  const locale: Locale = currencyLocale === "fr" ? "fr" : "en";
  const t = await getTranslations("Storefront");
  // Shop prices live in Stripe (products store no local price): resolve once
  // per render, per-item failures omit the price but keep the card + link.
  const priceMap = tenantId ? await resolveShopPrices(
    products.map((product) => ({ id: product.id, stripe_price_id: product.stripe_price_id }))
  ) : new Map<string, { amount: number; currency: string }>();
  const browseLabels = {
    categories: t("categories"),
    all: t("all"),
    searchLabel: t("searchLabel"),
    searchPlaceholder: t("searchPlaceholder"),
    clearFilters: t("clearFilters"),
    noResults: t("noProductsMatch"),
    details: t("details"),
    close: t("close"),
    allergens: t("allergens"),
  };
  const categoryOrder: string[] = [];
  const productsByCategory = new Map<string, ResolvedProductItem[]>();
  for (const product of products) {
    const key = product.category ?? "";
    if (!productsByCategory.has(key)) {
      productsByCategory.set(key, []);
      categoryOrder.push(key);
    }
    productsByCategory.get(key)!.push(product);
  }
  const productGroups: BrowseGroup[] = categoryOrder.map((key) => ({
    id: key === "" ? "uncategorized" : `category-${key}`,
    title: key === "" ? t("otherCategory") : key,
    items: (productsByCategory.get(key) ?? []).map((product) => {
      const firstImg = product.images?.[0] ? safeImageSrc(product.images[0]) : "";
      const price = priceMap.get(product.id);
      const stockState = getStoreProductStockState(product.status, product.stock_quantity);
      const storeStockLabel = stockState === "sold_out"
        ? t("storeSoldOut")
        : stockState === "low_stock"
          ? t("storeLowStock")
          : t("storeInStock");
      const stockLabel = isStore
        ? storeStockLabel
        : product.stock_quantity === null
          ? t("unlimited")
          : product.stock_quantity === 0
            ? t("outOfStock")
            : String(product.stock_quantity);
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        image: firstImg || null,
        priceLabel: price ? formatCurrency(price.amount, price.currency, locale) : null,
        numericPrice: price ? price.amount : undefined,
        createdAt: "created_at" in product ? (product.created_at ?? null) : null,
        isSoldOut: stockState === "sold_out",
        tags: product.tags,
        badge:
          stockState === "sold_out"
            ? storeStockLabel
            : stockState === "low_stock"
              ? storeStockLabel
              : null,
        badgeTone: stockState === "sold_out" ? "alert" : "muted",
        detailRows: [
          {
            label: t("stock"),
            value:
            stockLabel,
          },
        ],
        ...(product.slug
          ? {
              action: {
                label: t("viewProduct"),
                href: block.siteLocalProductDetails && siteSlug
                  ? `/site/${encodeURIComponent(siteSlug)}/products/${encodeURIComponent(product.slug)}`
                  : `/products/${product.slug}`,
              },
            }
          : {}),
      };
    }),
  }));

  if (isStore) {
    if (products.length === 0) return null;
    const publicT = await getTranslations("PublicSite");
    const realCategoryCount = productGroups.filter((group) => group.id !== "uncategorized").length;
    const staticItems = productGroups.flatMap((group) => group.items.map((item) => ({ group, item }))).slice(0, block.browsePageSize ?? 12);
    const carouselHeading = block.heading || t("storeShopHeading");
    const toCarouselItem = ({ group, item }: { group: BrowseGroup; item: (typeof staticItems)[number]["item"] }) => {
      const badge = item.badge ?? null;
      return {
        id: `${group.id}-${item.id}`,
        href: item.action && item.action.href !== "#" ? item.action.href : null,
        image: item.image ?? null,
        name: item.name,
        description: item.description ?? null,
        priceLabel: item.priceLabel,
        badge,
        badgeTone: badge ? (item.badgeTone ?? "muted") : undefined,
      };
    };
    const carouselLabels = {
      prev: t("carouselPrev"),
      next: t("carouselNext"),
      region: carouselHeading,
    };
    const sortLabels = {
      label: t("sortLabel"),
      featured: t("sortFeatured"),
      newest: t("sortNewest"),
      priceAsc: t("sortPriceAsc"),
      priceDesc: t("sortPriceDesc"),
    };
    const cartLabels = {
      title: t("storeCartTitle"),
      empty: t("storeCartEmpty"),
      emptyBody: t("storeCartEmptyBody"),
      viewCart: t("storeViewCart"),
      added: t("storeCartAdded"),
      addToCart: t("storeAddToCart"),
      checkout: t("storeCartCheckout"),
      pay: t("storeCartPay"),
      back: t("storeBackToShop"),
      continueShopping: t("storeCartContinue"),
      subtotal: t("storeCartSubtotal"),
      discount: t("storeCartDiscount"),
      total: t("storeCartTotal"),
      remove: t("storeCartRemove"),
      decrease: t("storeCartDecrease"),
      increase: t("storeCartIncrease"),
      promo: t("storeCartPromo"),
      promoPlaceholder: t("storeCartPromoPlaceholder"),
      buyerName: publicT("storeBuyerName"),
      buyerEmail: publicT("storeBuyerEmail"),
      changed: t("storeCartChanged"),
      error: publicT("storeCheckoutError"),
      unavailable: t("storeCartUnavailable"),
      locale: locale === "fr" ? "fr-FR" : "en-US",
    };
    return (
      <section className="w-full">
        <SectionHeading heading={block.heading || t("storeShopHeading")} subheading={block.subheading} />
        <StorefrontBrowse
          groups={productGroups}
          labels={{ ...browseLabels, loadMore: t("storeLoadMore") }}
          showGroups={Boolean(block.categoryTiles && realCategoryCount >= 2)}
          categoryTiles={Boolean(block.categoryTiles)}
          itemMode="links"
          pageSize={block.browsePageSize ?? 12}
          accentColor={accentColor}
          carousel={{
            prevLabel: carouselLabels.prev,
            nextLabel: carouselLabels.next,
            regionLabel: carouselLabels.region,
          }}
          sort={sortLabels}
          // Cart mounts only on real tenant renders (previews and gallery
          // samples pass no tenantId and must stay non-transactional).
          {...(siteSlug && tenantId
            ? {
                storeCart: {
                  slug: siteSlug,
                  siteCurrency:
                    currency ??
                    priceMap.values().next().value?.currency ??
                    "USD",
                  addLabel: t("storeAddToCart"),
                  labels: cartLabels,
                },
              }
            : {})}
        >
          <ProductCarousel items={staticItems.map(toCarouselItem)} labels={carouselLabels} />
        </StorefrontBrowse>
      </section>
    );
  }

  const layout = block.layout ?? "grid";

  return (
    <section className="w-full">
      <SectionHeading heading={block.heading || "Featured Products"} subheading={block.subheading} />

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--ps-border)] p-[var(--ps-space-8)] text-center text-sm text-[var(--ps-muted)]">
          No products available at this time.
        </div>
      ) : (
        <StorefrontBrowse groups={productGroups} labels={browseLabels} showGroups={categoryOrder.length > 1} accentColor={accentColor}>
        {layout === "list" ? (
        <div className="flex flex-col gap-[var(--ps-space-4)]">
          {products.map((product: ResolvedProductItem) => {
            const firstImg = product.images?.[0] ? safeImageSrc(product.images[0]) : "";
            return (
              <div
                key={product.id}
                className="flex flex-col gap-[var(--ps-space-4)] sm:flex-row sm:items-center justify-between rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs transition hover:shadow-sm"
              >
                <div className="flex items-center gap-[var(--ps-space-4)]">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--ps-neutral)]">
                    {firstImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={firstImg}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--ps-muted)]">
                        <Tag className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-[var(--ps-space-2)]">
                      <h3 className="text-base font-bold text-[var(--ps-text)]">{product.name}</h3>
                      {product.isDraft && <DraftBadge />}
                    </div>
                    {product.description && (
                      <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)] line-clamp-1">
                        {product.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-[var(--ps-space-4)]">
                  <span className="text-sm font-semibold capitalize text-[var(--ps-muted)]">
                    {product.price_type}
                  </span>
                  <Link
                    href={`/products/${product.slug}`}
                    className="ps-button ps-button-primary inline-flex items-center gap-[var(--ps-space-1)] text-xs font-semibold shadow-xs transition"
                  >
                    View Product
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--ps-space-6)] sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product: ResolvedProductItem) => {
            const firstImg = product.images?.[0] ? safeImageSrc(product.images[0]) : "";
            return (
              <div
                key={product.id}
                className="flex flex-col overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xs transition hover:shadow-sm"
              >
                <div className="relative aspect-4/3 w-full bg-[var(--ps-neutral)]">
                  {firstImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={firstImg}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--ps-muted)]">
                      <Tag className="h-8 w-8" />
                    </div>
                  )}
                  {product.isDraft && (
                    <div className="absolute top-3 left-3">
                      <DraftBadge />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between p-[var(--ps-space-6)]">
                  <div>
                    <h3 className="text-base font-bold text-[var(--ps-text)] line-clamp-1">
                      {product.name}
                    </h3>
                    {product.description && (
                      <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)] line-clamp-2">
                        {product.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-[var(--ps-space-4)] flex items-center justify-between border-t border-[var(--ps-border)] pt-[var(--ps-space-3)]">
                    <span className="text-xs font-medium uppercase tracking-wider text-[var(--ps-muted)]">
                      {product.price_type}
                    </span>
                    <Link
                      href={`/products/${product.slug}`}
                      className="inline-flex items-center gap-[var(--ps-space-1)] text-xs font-semibold text-[var(--ps-accent-hover)] hover:underline"
                    >
                      Learn More →
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
        </StorefrontBrowse>
      )}
    </section>
  );
}

// ── 10. Fundraiser Embed Block (Live Data) ───────────────────────────────────

async function FundraiserEmbedBlockRenderer({
  block,
  tenantId,
  isTeamMember,
}: {
  block: FundraiserEmbedBlock;
  tenantId?: string;
  isTeamMember?: boolean;
}) {
  const fundraisers = tenantId
    ? await resolveFundraiserEmbed(block, tenantId, Boolean(isTeamMember))
    : [];

  const layout = block.layout ?? "banner";

  if (fundraisers.length === 0) {
    return (
      <section className="w-full">
        <SectionHeading heading={block.heading || "Fundraising Campaigns"} subheading={block.subheading} />
        <div className="rounded-xl border border-dashed border-[var(--ps-border)] p-[var(--ps-space-8)] text-center text-sm text-[var(--ps-muted)]">
          No active fundraisers at this time.
        </div>
      </section>
    );
  }

  // Layout: Banner (Single prominent featured campaign)
  if (layout === "banner") {
    const featured = fundraisers[0];
    const safeImage = featured.image_url ? safeImageSrc(featured.image_url) : "";
    const progressPercent = Math.min(
      100,
      Math.round((featured.raised / (featured.goal_amount || 1)) * 100)
    );

    return (
      <section className="w-full">
        <SectionHeading heading={block.heading} subheading={block.subheading} />
        <div className="overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xs lg:grid lg:grid-cols-12 items-center">
          {safeImage && (
            <div className="relative aspect-16/9 w-full bg-[var(--ps-neutral)] lg:col-span-5 lg:h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={safeImage}
                alt={featured.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className={`p-[var(--ps-space-8)] lg:p-[var(--ps-space-12)] ${safeImage ? "lg:col-span-7" : "lg:col-span-12"}`}>
            <div className="flex items-center gap-[var(--ps-space-2)] mb-[var(--ps-space-3)]">
              <span className="inline-flex items-center gap-[var(--ps-space-1)] text-xs font-bold uppercase tracking-wider text-[var(--ps-accent-hover)]">
                <Heart className="h-3.5 w-3.5 fill-current" />
                Featured Cause
              </span>
              {featured.isDraft && <DraftBadge />}
            </div>
            <h3 className="text-2xl font-bold text-[var(--ps-text)] sm:text-3xl">
              {featured.title}
            </h3>

            {/* Progress bar */}
            <div className="mt-[var(--ps-space-6)]">
              <div className="flex justify-between text-sm font-semibold mb-[var(--ps-space-2)]">
                <span className="text-[var(--ps-text)]">
                  ${featured.raised.toLocaleString()} {featured.currency} raised
                </span>
                <span className="text-[var(--ps-muted)]">
                  Goal: ${featured.goal_amount.toLocaleString()}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--ps-neutral)]">
                <div
                  className="h-full rounded-full bg-[var(--ps-accent)] transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-[var(--ps-space-2)] text-right text-xs font-semibold text-[var(--ps-accent-hover)]">
                {progressPercent}% funded
              </div>
            </div>

            <div className="mt-[var(--ps-space-8)]">
              <Link
                href={`/fundraisers/${featured.slug}`}
                className="ps-button ps-button-primary inline-flex items-center gap-[var(--ps-space-2)] text-sm font-semibold shadow-xs transition"
              >
                Donate Now
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Layout: Grid / Cards
  return (
    <section className="w-full">
      <SectionHeading heading={block.heading || "Active Campaigns"} subheading={block.subheading} />
      <div className="grid grid-cols-1 gap-[var(--ps-space-6)] sm:grid-cols-2 lg:grid-cols-3">
        {fundraisers.map((f: ResolvedFundraiserItem) => {
          const safeImage = f.image_url ? safeImageSrc(f.image_url) : "";
          const progressPercent = Math.min(
            100,
            Math.round((f.raised / (f.goal_amount || 1)) * 100)
          );

          return (
            <div
              key={f.id}
              className="flex flex-col overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xs transition hover:shadow-sm"
            >
              <div className="relative aspect-16/9 w-full bg-[var(--ps-neutral)]">
                {safeImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={safeImage}
                    alt={f.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[var(--ps-muted)]">
                    <Heart className="h-8 w-8" />
                  </div>
                )}
                {f.isDraft && (
                  <div className="absolute top-3 left-3">
                    <DraftBadge />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between p-[var(--ps-space-6)]">
                <div>
                  <h3 className="text-base font-bold text-[var(--ps-text)] line-clamp-1">
                    {f.title}
                  </h3>
                  <div className="mt-[var(--ps-space-4)]">
                    <div className="flex justify-between text-xs font-semibold mb-[var(--ps-space-1)]">
                      <span className="text-[var(--ps-text)]">
                        ${f.raised.toLocaleString()}
                      </span>
                      <span className="text-[var(--ps-muted)]">
                        ${f.goal_amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--ps-neutral)]">
                      <div
                        className="h-full rounded-full bg-[var(--ps-accent)]"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-[var(--ps-space-6)] border-t border-[var(--ps-border)] pt-[var(--ps-space-3)]">
                  <Link
                    href={`/fundraisers/${f.slug}`}
                    className="ps-button ps-button-primary inline-flex w-full items-center justify-center text-xs font-semibold shadow-xs transition"
                  >
                    Support Campaign
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── 11. Services Embed Block (Live Data) ────────────────────────────────────

async function ServicesEmbedBlockRenderer({
  block,
  tenantId,
  isTeamMember,
}: {
  block: ServicesEmbedBlock;
  tenantId?: string;
  isTeamMember?: boolean;
}) {
  const services = tenantId ? await resolveServicesEmbed(block, tenantId, Boolean(isTeamMember)) : [];
  const layout = block.layout ?? "grid";
  return (
    <section className="w-full">
      <SectionHeading heading={block.heading || "Our Services"} subheading={block.subheading} />
      {services.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--ps-border)] p-[var(--ps-space-8)] text-center text-sm text-[var(--ps-muted)]">No services available at this time.</div>
      ) : layout === "list" ? (
        <div className="flex flex-col gap-[var(--ps-space-4)]">
          {services.map((svc: ResolvedServiceItem) => {
            const safeImg = svc.image_url ? safeImageSrc(svc.image_url) : "";
            return (
              <div key={svc.id} className="flex flex-col gap-[var(--ps-space-4)] sm:flex-row sm:items-center justify-between rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs">
                <div className="flex items-center gap-[var(--ps-space-4)]">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--ps-neutral)]">
                    {safeImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={safeImg} alt={svc.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[var(--ps-muted)]"><Tag className="h-5 w-5" /></div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-[var(--ps-space-2)]"><h3 className="text-base font-bold text-[var(--ps-text)]">{svc.title}</h3>{svc.isDraft && <DraftBadge />}</div>
                    {svc.description && <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)] line-clamp-1">{svc.description}</p>}
                    {svc.duration_minutes && <p className="text-xs text-[var(--ps-muted)]">{svc.duration_minutes} min</p>}
                  </div>
                </div>
                {/* TODO: multi-currency not in Phase 5 — hardcoded USD */}<div className="text-sm font-semibold text-[var(--ps-text)]">${svc.price.toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--ps-space-6)] sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc: ResolvedServiceItem) => {
            const safeImg = svc.image_url ? safeImageSrc(svc.image_url) : "";
            return (
              <div key={svc.id} className="flex flex-col overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xs">
                <div className="relative aspect-4/3 w-full bg-[var(--ps-neutral)]">
                  {safeImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={safeImg} alt={svc.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[var(--ps-muted)]"><Tag className="h-8 w-8" /></div>
                  )}
                  {svc.isDraft && <div className="absolute top-3 left-3"><DraftBadge /></div>}
                </div>
                <div className="p-[var(--ps-space-6)]">
                  <h3 className="text-base font-bold text-[var(--ps-text)]">{svc.title}</h3>
                  {svc.description && <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)] line-clamp-2">{svc.description}</p>}
                  <div className="mt-[var(--ps-space-3)] flex items-center justify-between">
                    <span className="text-sm font-bold">${svc.price.toFixed(2)}</span>
                    {svc.duration_minutes && <span className="text-xs text-[var(--ps-muted)]">{svc.duration_minutes} min</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ── 12. Menu Embed Block (Live Data) ───────────────────────────────────────

async function MenuEmbedBlockRenderer({
  block,
  tenantId,
  isTeamMember,
  editMode,
  sourceMap,
  currency,
  currencyLocale,
  orderConfig,
  siteSlug,
  hasPublishedMenuPage,
  accentColor,
  siteTemplateId,
  sectionAlign,
}: {
  block: MenuEmbedBlock;
  tenantId?: string;
  isTeamMember?: boolean;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
  /** Site price display default; block.currency wins when set. */
  currency?: string;
  currencyLocale?: Locale;
  orderConfig?: StorefrontOrderConfig;
  siteSlug?: string;
  hasPublishedMenuPage?: boolean;
  accentColor?: string;
  siteTemplateId?: string;
  sectionAlign?: "left" | "center";
}) {
  const sections = tenantId ? await resolveMenuEmbed(block, tenantId, Boolean(isTeamMember)) : [];
  const tableFlameRows = siteTemplateId === "restaurant-table-flame" && block.variant === "rows";
  const savannahEditorial = siteTemplateId === "restaurant-savannah" && block.variant === "editorial";
  const displayCurrency = normalizeCurrencyCode(block.currency) ?? normalizeCurrencyCode(currency) ?? "USD";
  const locale: Locale = currencyLocale === "fr" ? "fr" : "en";
  const t = await getTranslations("Storefront");
  const browseLabels = {
    categories: t("categories"),
    all: t("all"),
    searchLabel: t("searchLabel"),
    searchPlaceholder: t("searchPlaceholder"),
    clearFilters: t("clearFilters"),
    noResults: t("noDishesMatch"),
    details: t("details"),
    close: t("close"),
    allergens: t("allergens"),
    soldOut: t("soldOut"),
    required: t("required"),
    optional: t("optional"),
    options: t("options"),
    addToOrder: t("addToOrder"),
    quantityLimit: t("quantityLimit"),
    viewOrder: t("viewOrder"),
    yourOrder: t("yourOrder"),
    emptyCart: t("emptyCart"),
    subtotal: t("subtotal"),
    deliveryFee: t("deliveryFee"),
    deliveryFeeNotice: t("deliveryFeeNotice"),
    freeDelivery: t("freeDelivery"),
    total: t("total"),
    fulfilment: t("fulfilment"),
    pickup: t("pickup"),
    delivery: t("delivery"),
    deliveryAddress: t("deliveryAddress"),
    deliveryAddressPlaceholder: t("deliveryAddressPlaceholder"),
    customerDetails: t("customerDetails"),
    fullName: t("fullName"),
    phone: t("phone"),
    email: t("email"),
    orderNote: t("orderNote"),
    orderNotePlaceholder: t("orderNotePlaceholder"),
    paymentOnFulfilment: t("paymentOnFulfilment"),
    paymentMethod: t("paymentMethod"),
    payOnline: t("payOnline"),
    payingOnline: t("payingOnline"),
    onlinePaymentNotice: t("onlinePaymentNotice"),
    placeOrder: t("placeOrder"),
    placingOrder: t("placingOrder"),
    orderSuccessTitle: t("orderSuccessTitle"),
    orderSuccessSubtext: t("orderSuccessSubtext"),
    orderNumber: t("orderNumber"),
    scheduledNotice: t("scheduledNotice"),
    noUpcomingHours: t("noUpcomingHours"),
    backToMenu: t("backToMenu"),
    asap: t("asap"),
    scheduleForLater: t("scheduleForLater"),
    chooseDate: t("chooseDate"),
    chooseTime: t("chooseTime"),
    trackOrder: t("trackOrder"),
    copyTrackingLink: t("copyTrackingLink"),
    trackingLinkCopied: t("trackingLinkCopied"),
  };
  const populatedSections = sections.filter((section: ResolvedMenuSection) => section.items.length > 0);
  const menuItemsTruncated = sections.some((section: ResolvedMenuSection) => section.hasMoreItems || section.hasMoreItemsOverall);
  const menuGroups: BrowseGroup[] = populatedSections.map((sec: ResolvedMenuSection) => ({
    id: sec.id,
    title: sec.name,
    items: sec.items.map((it) => {
      const hasVariant = (it.option_groups || []).some((group) => group.kind === "variant");
      const isPromo = !hasVariant && it.promo_price != null && it.promo_price < it.price && it.promo_price >= 0;
      const priceLabel = isPromo
        ? formatCurrency(Number(it.promo_price), displayCurrency, locale)
        : formatCurrency(Number(it.price), displayCurrency, locale);
      const originalPriceLabel = isPromo
        ? formatCurrency(Number(it.price), displayCurrency, locale)
        : null;
      const formattedOptionGroups = (it.option_groups || []).map((og) => ({
        id: og.id,
        name: og.name,
        required: og.required,
        min: og.min,
        max: og.max,
        kind: og.kind || "addon",
        options: og.options.map((opt) => ({
          id: opt.id,
          name: opt.name,
          description: opt.description ?? null,
          imageUrl: safeImageSrc(opt.image_url) || null,
          allergens: Array.isArray(opt.allergens) ? opt.allergens : [],
          priceDelta: og.kind === "variant" ? 0 : Number(opt.price_delta) || 0,
          price: Number(opt.price) || 0,
          isDefault: Boolean(opt.is_default),
          isAvailable: opt.is_available !== false,
          maxQty: opt.max_qty ?? 1,
          priceDeltaLabel: og.kind === "variant"
            ? formatCurrency(Number(opt.price), displayCurrency, locale)
            : opt.price_delta !== 0
              ? (opt.price_delta > 0
                  ? `+${formatCurrency(opt.price_delta, displayCurrency, locale)}`
                  : formatCurrency(opt.price_delta, displayCurrency, locale))
              : undefined,
        })),
      }));

      return {
        id: it.id,
        name: it.name,
        description: it.description,
        image: safeImageSrc(it.image_url) || null,
        priceLabel,
        numericPrice: isPromo ? Number(it.promo_price) : Number(it.price),
        originalPriceLabel,
        isSoldOut: Boolean(it.is_sold_out),
        tags: it.dietary_tags,
        detailRows: [
          ...(it.allergens.length > 0
            ? [{ label: t("allergens"), value: it.allergens.join(", ") }]
            : []),
          ...it.modifiers.map((modifier) => ({
            label: modifier.name,
            value: formatCurrency(Number(modifier.price_delta), displayCurrency, locale),
          })),
        ],
        optionGroups: formattedOptionGroups,
      };
    }),
  }));
  const hasMenuItems = hasBrowseableItems(menuGroups);
  if (!hasMenuItems && siteTemplateId === "restaurant-savannah") return null;
  return (
    <section className="w-full">
      <div {...elementPathProps(editMode, sourceMap, "heading")}>
        <SectionHeading heading={block.heading || "Our Menu"} subheading={block.subheading} align={sectionAlign} />
      </div>
      {!hasMenuItems ? (
        <p className={`w-full text-sm text-[var(--ps-muted)] ${sectionAlign === "left" ? "text-left" : "text-center"}`}>{t("menuComingSoon")}</p>
      ) : (
        <StorefrontBrowse
          groups={menuGroups}
          labels={browseLabels}
          showGroups={
            populatedSections.length > 1 && block.variant !== "catalog-carousel"
          }
          orderConfig={orderConfig}
          accentColor={accentColor}
          carousel={
            block.variant === "catalog-carousel"
              ? {
                  prevLabel: t("carouselPrev"),
                  nextLabel: t("carouselNext"),
                  regionLabel: t("categories"),
                  imageFit: block.imageFit,
                }
              : undefined
          }
          variant={
            tableFlameRows
              ? "rows"
              : savannahEditorial
                ? "editorial"
                : block.variant === "catalog-carousel"
                  ? "catalog-carousel"
                  : "cards"
          }
        >
          {block.variant === "catalog-carousel" ? null : (
            <div className="space-y-[var(--ps-space-8)]">
          {populatedSections.map((sec: ResolvedMenuSection) => (
            <div key={sec.id} className={block.variant === "rows" || savannahEditorial ? "" : "rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs"}>
              <div className="flex items-center gap-[var(--ps-space-2)]">
                <h3 className="text-lg font-bold text-[var(--ps-text)]">{sec.name}</h3>
                {sec.isDraft && <DraftBadge />}
              </div>
              {sec.description && <p className="mt-[var(--ps-space-1)] text-sm text-[var(--ps-muted)]">{sec.description}</p>}
              <div className={block.variant === "rows" ? `mt-4 divide-y ${tableFlameRows ? "divide-[var(--tf-border)] border-y border-[var(--tf-border)]" : "divide-[#e6dccd] border-y border-[#e6dccd]"}` : savannahEditorial ? "mt-8 grid grid-cols-1 gap-8 md:grid-cols-2" : block.variant === "catalog-carousel" ? "mt-4" : "mt-[var(--ps-space-4)] grid gap-[var(--ps-space-4)] sm:grid-cols-2"}>
                {sec.items.length === 0 ? (
                  <div className="text-xs text-[var(--ps-muted)]">No items in this section.</div>
                ) : block.variant === "catalog-carousel" ? (
                  <CatalogCarousel
                    items={sec.items.map((it) => {
                      const safeImg = safeImageSrc(it.image_url);
                      const hasVariant = (it.option_groups || []).some((group) => group.kind === "variant");
                      const isPromo = !hasVariant && it.promo_price != null && it.promo_price < it.price && it.promo_price >= 0;
                      return {
                        id: it.id,
                        name: it.name,
                        description: it.description,
                        image: safeImg,
                        priceLabel: isPromo
                          ? formatCurrency(Number(it.promo_price), displayCurrency, locale)
                          : formatCurrency(Number(it.price), displayCurrency, locale),
                        numericPrice: isPromo ? Number(it.promo_price) : Number(it.price),
                        originalPriceLabel: isPromo
                          ? formatCurrency(Number(it.price), displayCurrency, locale)
                          : null,
                        isSoldOut: Boolean(it.is_sold_out),
                        isFeatured: Boolean(it.is_featured),
                      };
                    })}
                    prevLabel={t("carouselPrev")}
                    nextLabel={t("carouselNext")}
                  />
                ) : (
                  sec.items.map((it) => {
                    const safeImg = safeImageSrc(it.image_url);
                    const hasVariant = (it.option_groups || []).some((group) => group.kind === "variant");
                    const isPromo = !hasVariant && it.promo_price != null && it.promo_price < it.price && it.promo_price >= 0;
                    return (
                      <div
                        key={it.id}
                        {...elementPathProps(
                          editMode,
                          sourceMap,
                          "selectedItemIds[" + (block.selectedItemIds?.indexOf(it.id) ?? -1) + "]"
                        )}
                        className={block.variant === "rows" ? "flex min-h-11 items-center gap-5 py-4" : savannahEditorial ? "flex min-h-12 items-start gap-5" : block.variant === "catalog-carousel" ? "" : "flex gap-[var(--ps-space-3)] rounded-lg border border-[var(--ps-border)] p-[var(--ps-space-3)]"}
                      >
                        {savannahEditorial
                          ? safeImg ? <div className="h-[88px] w-[88px] shrink-0 overflow-hidden bg-[var(--tf-soft)]">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={safeImg} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                            </div> : null
                          : block.variant !== "rows" && block.variant !== "catalog-carousel" ? <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--ps-neutral)]">
                            {safeImg ? <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={safeImg} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                            </> : <div className="flex h-full w-full items-center justify-center text-[var(--ps-muted)]"><Tag className="h-4 w-4" /></div>}
                          </div> : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-[var(--ps-space-2)]">
                            <span className="text-sm font-semibold text-[var(--ps-text)]">{it.name}</span>
                            {it.is_featured && <span className={savannahEditorial ? "bg-[var(--tf-subtle)] px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold text-[var(--tf-on-subtle)]" : "rounded-full bg-amber-100 px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold text-amber-700"}>Featured</span>}
                            {it.is_sold_out && <span className="rounded-full bg-[var(--ps-neutral)] px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold text-[var(--ps-muted)] border border-[var(--ps-border)]">{t("soldOut")}</span>}
                            {it.isDraft && <DraftBadge />}
                          </div>
                          {it.description && <p className={`text-[var(--ps-muted)] ${savannahEditorial || block.variant === "rows" ? "mt-1 text-sm leading-6" : "text-xs line-clamp-1"}`}>{it.description}</p>}
                          <div className="mt-[var(--ps-space-1)] flex flex-wrap gap-[var(--ps-space-1)]">
                            {it.dietary_tags.map((t) => (
                              <span key={t} className={savannahEditorial ? "bg-[var(--tf-subtle)] px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium text-[var(--tf-on-subtle)] capitalize" : "rounded-full bg-emerald-50 px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium text-emerald-700 border border-emerald-200 capitalize"}>{t.replace("_"," ")}</span>
                            ))}
                            {it.allergens.map((a) => (
                              <span key={a} className={savannahEditorial ? "bg-[var(--tf-subtle)] px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium text-[var(--tf-on-subtle)] capitalize" : "rounded-full bg-red-50 px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium text-red-700 border border-red-200 capitalize"}>{a}</span>
                            ))}
                          </div>
                          <div className="mt-[var(--ps-space-1)] text-xs font-semibold">
                            {isPromo ? (
                              <>
                                <span className="text-[var(--ps-accent-hover)] font-bold">{formatCurrency(Number(it.promo_price), displayCurrency, locale)}</span>
                                <span className="ml-[var(--ps-space-1)] text-xs font-normal text-[var(--ps-muted)] line-through">{formatCurrency(Number(it.price), displayCurrency, locale)}</span>
                              </>
                            ) : (
                              formatCurrency(Number(it.price), displayCurrency, locale)
                            )}
                            {it.modifiers.length > 0 && <span className="font-normal text-[var(--ps-muted)]"> + {it.modifiers.length} modifiers</span>}
                            {it.option_groups && it.option_groups.length > 0 && <span className="font-normal text-[var(--ps-muted)]"> • {it.option_groups.length} {t("options").toLowerCase()}</span>}
                          </div>
                        </div>
                        {block.variant === "rows" && safeImg ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={safeImg} alt="" className={`h-[88px] w-[88px] shrink-0 rounded-xl border object-cover ${tableFlameRows ? "border-[var(--tf-border)]" : "border-[#e6dccd]"}`} loading="lazy" />
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
        )}
        </StorefrontBrowse>
      )}
      {siteSlug && hasMenuItems && (!block.selectedItemIds?.length || menuItemsTruncated) ? (
        <div className="mt-[var(--ps-space-8)] text-center">
          {menuItemsTruncated ? <p className="mb-[var(--ps-space-3)] text-sm text-[var(--ps-muted)]">{t("menuItemLimitNotice")}</p> : null}
          {hasPublishedMenuPage ? (
            <a
              href={`/site/${encodeURIComponent(siteSlug)}/menu`}
              className="ps-button ps-button-secondary inline-flex items-center gap-[var(--ps-space-2)] text-sm font-semibold transition-colors"
            >
              {t("viewFullMenu")}
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ── 12b. Reservation Form Block (Live Data) ──────────────────────────────────

async function ReservationFormBlockRenderer({
  reservationConfig,
  siteSlug,
}: {
  reservationConfig?: StorefrontReservationConfig;
  siteSlug?: string;
}) {
  const t = await getTranslations("Storefront");
  if (!reservationConfig?.enabled || !reservationConfig.settings.enabled) {
    return (
      <section className="w-full">
        <p className="py-[var(--ps-space-4)] text-center text-sm text-[var(--ps-muted)]">{t("requestNotAvailable")}</p>
      </section>
    );
  }
  const labels: ReservationFormLabels = {
    title: t("reservationTitle"),
    subtext: t("reservationSubtext"),
    fullName: t("fullName"),
    phone: t("phone"),
    email: t("email"),
    chooseDate: t("chooseDate"),
    chooseTime: t("chooseTime"),
    partySize: t("partySize"),
    specialRequest: t("specialRequest"),
    requestTable: t("requestTable"),
    requestingTable: t("requestingTable"),
    requestReceived: t("requestReceived"),
    requestReceivedSubtext: t("requestReceivedSubtext"),
    requestReference: t("requestReference"),
    trackRequest: t("trackRequest"),
    copyTrackingLink: t("copyTrackingLink"),
    trackingLinkCopied: t("trackingLinkCopied"),
    backToSite: t("backToSite"),
    noSlots: t("noSlots"),
    closedThatDay: t("closedThatDay"),
    checkDetails: t("reservationCheckDetails"),
    requestNotAvailable: t("requestNotAvailable"),
    rateLimited: t("reservationRateLimited"),
    tooManyOpenRequests: t("reservationTooManyOpen"),
    invalidPartySize: t("reservationInvalidParty"),
    requestFailed: t("reservationFailed"),
  };
  return (
    <section className="w-full">
      <ReservationRequestForm config={reservationConfig} labels={labels} siteSlug={siteSlug ?? reservationConfig.slug} />
    </section>
  );
}

// ── 13. Legacy Rich Text Block ───────────────────────────────────────────────

function RichTextBlockRenderer({ block }: { block: RichTextBlock }) {
  const safeHtml = sanitizeArticleHtml(block.html);
  return (
    <section className="mx-auto w-full max-w-3xl px-[var(--ps-space-6)]">
      <div
        className="prose prose-zinc max-w-none prose-headings:font-bold prose-a:text-[var(--ps-accent-hover)]"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </section>
  );
}

// ── 12. Legacy CTA Banner Block ──────────────────────────────────────────────

export function CtaBannerBlockRenderer({ block, siteSlug, scopeInternalLinks, sectionAlign, tableFlame = false, savannah = false }: { block: CtaBannerBlock; siteSlug?: string; scopeInternalLinks?: boolean; sectionAlign?: "left" | "center"; tableFlame?: boolean; savannah?: boolean }) {
  const paletteTheme = tableFlame || savannah;
  const safeCtaHref = block.ctaHref
    ? sanitizeUrl(scopeInternalLinks ? resolveSiteHref(siteSlug, block.ctaHref) : block.ctaHref)
    : "";

  if (block.variant === "promo") {
    const safeImage = block.image ? safeImageSrc(block.image) : "";
    return (
      <section className="mx-auto w-full max-w-6xl px-6">
        <div className="savannah-card grid grid-cols-1 overflow-hidden bg-[var(--tf-soft)] text-[var(--tf-on-soft)] md:grid-cols-12">
          {safeImage ? (
            <div className="aspect-[4/3] w-full overflow-hidden md:col-span-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={safeImage} alt={block.heading} className="h-full w-full object-cover" loading="lazy" />
            </div>
          ) : null}
          <div className={`flex flex-col justify-center p-8 md:p-12 ${safeImage ? "md:col-span-7" : "md:col-span-12"}`}>
            {block.eyebrow ? (
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--tf-accent-deep)]">
                {block.eyebrow}
              </p>
            ) : null}
            <h2 className="font-[var(--v2-heading-font)] text-2xl font-bold leading-tight sm:text-3xl md:text-4xl text-[var(--ps-text)]">
              {block.heading}
            </h2>
            {block.subheading ? (
              <p className="mt-3 text-base leading-7 text-[var(--ps-muted)]">
                {block.subheading}
              </p>
            ) : null}
            {block.endDate ? (
              <p className="mt-2 text-xs font-medium text-[var(--tf-accent-deep)]">
                Valid until {block.endDate}
              </p>
            ) : null}
            {block.ctaLabel && safeCtaHref ? (
              <div className="mt-6">
                <a
                  href={safeCtaHref}
                  className="savannah-button inline-flex min-h-11 items-center justify-center bg-[var(--ps-accent)] px-6 py-2.5 text-sm font-semibold text-[var(--ps-accent-foreground)]"
                >
                  {block.ctaLabel}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  const variantClasses =
    block.variant === "dark"
      ? tableFlame ? "bg-[var(--ps-text)] text-[var(--tf-on-ink)]" : "bg-[var(--ps-text)] text-white"
      : block.variant === "light"
        ? "bg-[var(--ps-neutral)] text-[var(--ps-text)] border border-[var(--ps-border)]"
        : block.variant === "footer"
        ? paletteTheme ? "bg-[var(--tf-band)] text-[var(--tf-on-band)]" : "bg-[#23211f] text-[#faf6ef]"
        : paletteTheme ? "bg-[var(--ps-accent)] text-[var(--ps-accent-foreground)]" : "text-white";

  return (
    <section
      className={`w-full ${sectionAlign === "left" ? "text-left" : "text-center"} ${variantClasses}`}
      style={
        block.variant === "footer"
          ? paletteTheme ? { backgroundColor: "var(--tf-band)", color: "var(--tf-on-band)" } : { backgroundColor: "#23211f", color: "#faf6ef" }
          : block.variant !== "dark" && block.variant !== "light"
          ? { backgroundColor: "var(--ps-accent)" }
          : {}
      }
    >
      <div className="mx-auto w-full max-w-6xl px-6">
        {block.heading && (
          <h2 className="text-3xl font-bold">{block.heading}</h2>
        )}
        {block.subheading && (
          <p className="mt-[var(--ps-space-3)] text-lg opacity-90">{block.subheading}</p>
        )}
        {block.ctaLabel && safeCtaHref && (
          <div className={`mt-[var(--ps-space-8)] flex w-full flex-wrap gap-3 ${sectionAlign === "left" ? "justify-start" : "justify-center"}`}>
            <a
              href={safeCtaHref}
              className={`inline-flex items-center text-sm font-semibold transition ${block.variant === "footer" ? `tf-button ${savannah ? "savannah-button rounded-none" : "rounded-full"} bg-[var(--ps-accent)] px-6 py-3 text-[var(--ps-accent-foreground)]` : "ps-button ps-button-secondary shadow-xs"}`}
            >
              {block.ctaLabel}
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Section Envelope Wrapper (G2 + H1) ───────────────────────────────────────
function SectionEnvelopeWrapper({
  block,
  children,
  blockId,
  sectionAlign,
  siteTemplateId,
}: {
  block: Block;
  children: React.ReactNode;
  blockId?: string;
  sectionAlign?: "left" | "center";
  siteTemplateId?: string;
}) {
  const raw = block as unknown as Record<string, unknown>;
  const hiddenOnMobile = Boolean(raw.hiddenOnMobile);
  const spacing = raw.spacing as string | undefined;
  const bg = raw.background as Record<string, unknown> | undefined;
  const container = raw.container as string | undefined;

  const hiddenClass = hiddenOnMobile ? getHiddenOnMobileClass(true) : "";
  const spacingClass = spacing ? getSpacingClass(spacing as never) : getSpacingClass("default");
  const bgStyle = bg ? getBackgroundStyle(bg as never) : undefined;
  const hasOverlay = Boolean(bg && typeof bg.overlay === "number" && [0.25, 0.5, 0.75].includes(bg.overlay as number));
  const tableFlame = siteTemplateId === "restaurant-table-flame";
  const savannah = siteTemplateId === "restaurant-savannah";
  const fullBleedTableFlameBlock = tableFlame && (
    (block.type === "hero" && (block as HeroBlock).variant === "full-bleed") ||
    (block.type === "cta_banner" && (block as CtaBannerBlock).variant !== "promo")
  );
  const fullBleedSavannahBlock = savannah && (
    (block.type === "hero" && (block as HeroBlock).variant === "full-bleed") ||
    (block.type === "cta_banner" && (block as CtaBannerBlock).variant !== "promo")
  );
  const containerClass = fullBleedTableFlameBlock || fullBleedSavannahBlock
    ? "w-full"
    : tableFlame || savannah
      ? "mx-auto w-full max-w-6xl px-6"
      : getContainerClass(container as never);
  const tableFlameCta = tableFlame && block.type === "cta_banner" && (block as CtaBannerBlock).variant !== "promo";
  const savannahCta = savannah && block.type === "cta_banner" && (block as CtaBannerBlock).variant !== "promo";
  const tableFlameDots = tableFlame && bg?.pattern === "dots";
  const sectionAttributes = {
    "data-block-id": blockId,
    "data-section-align": sectionAlign,
    ...(tableFlame && block.type !== "hero" ? { "data-site-motion-section": "true" } : {}),
    ...(savannah && block.type !== "hero" ? { "data-site-motion-section": "true" } : {}),
    ...(tableFlameDots ? { "data-background-pattern": "dots" } : {}),
  };

  // Respect visibility — hidden sections already filtered via isBlockVisible at call sites, but keep guard
  const isVisible = raw.visible !== false;
  if (!isVisible) return null as unknown as React.ReactElement;

  const wrapperStyle = {
    ...(bgStyle as React.CSSProperties | undefined),
    ...(tableFlameDots ? {
      backgroundImage: "radial-gradient(circle, var(--tf-dot) 1px, transparent 1px)",
      backgroundSize: "20px 20px",
    } : {}),
    ...(tableFlameCta || savannahCta ? { backgroundColor: "var(--tf-band)" } : {}),
  };
  // Outer section carries background, spacing, visibility, overlay — full-width
  const outerClass = [hiddenClass, spacingClass, hasOverlay ? "relative" : "", tableFlameCta || savannahCta ? "w-full" : ""].filter(Boolean).join(" ");
  const hasOuter = Boolean(hiddenClass || spacingClass || bgStyle || hasOverlay);

  if (hasOuter) {
    return (
      <div {...sectionAttributes} className={outerClass} style={wrapperStyle}>
        {hasOverlay && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: `rgba(0,0,0,${(bg as Record<string, unknown>).overlay})`,
              pointerEvents: "none",
            }}
          />
        )}
        <div className={`relative ${containerClass}`}>{children}</div>
      </div>
    );
  }

  // No outer background/spacing — still constrain content via container so narrow/wide/full take effect
  return <div {...sectionAttributes} className={containerClass}>{children}</div>;
}

// ── Main Dispatcher ──────────────────────────────────────────────────────────

export async function BlockRenderer({
  block,
  tenantId,
  isTeamMember,
  editMode,
  sourceMap,
  currency,
  currencyLocale,
  orderConfig,
  reservationConfig,
  siteSlug,
  hasPublishedMenuPage,
  scopeInternalLinks,
  accentColor,
  siteTemplateId,
  sectionAlign,
  businessName,
  businessLogo,
}: {
  block: unknown;
  tenantId?: string;
  isTeamMember?: boolean;
  editMode?: boolean;
  sourceMap?: Record<string, ElementSourceMap>;
  /** Site price display default for menu blocks without their own currency. */
  currency?: string;
  currencyLocale?: Locale;
  orderConfig?: StorefrontOrderConfig;
  reservationConfig?: StorefrontReservationConfig;
  siteSlug?: string;
  hasPublishedMenuPage?: boolean;
  scopeInternalLinks?: boolean;
  accentColor?: string;
  siteTemplateId?: string;
  sectionAlign?: "left" | "center";
  businessName?: string;
  businessLogo?: string;
}) {
  if (!block || typeof block !== "object" || !("type" in block)) {
    return null;
  }

  const b = block as Block;
  const blockSourceMap = b.id ? sourceMap?.[b.id] : undefined;

  // G2: hidden sections do not render publicly
  if (!isBlockVisible(b)) return null;
  if (!editMode && siteTemplateId === "restaurant-savannah") {
    if (b.type === "features" && !b.items?.length) return null;
    if (b.type === "gallery" && !b.images?.length) return null;
    if (b.type === "testimonials" && !b.items?.some((item) => item.quote.trim())) return null;
    if (b.type === "about" && !b.story && !b.mission && !b.founderImage && !b.highlights?.length) return null;
  }
  if (
    !editMode &&
    (siteTemplateId === "restaurant-table-flame" || siteTemplateId === "restaurant-savannah") &&
    b.type === "contact" &&
    !b.address && !b.phone && !b.email && !b.hours &&
    !b.hoursTable?.length && !b.locations?.length && !b.directionsUrl && !b.mapQuery
  ) return null;

  let content: React.ReactNode;
  switch (b.type) {
    case "hero":
      content = <HeroBlockRenderer block={b} siteSlug={siteSlug} scopeInternalLinks={scopeInternalLinks} editMode={editMode} sourceMap={blockSourceMap} accentColor={accentColor} tableFlame={siteTemplateId === "restaurant-table-flame"} savannah={siteTemplateId === "restaurant-savannah"} businessName={businessName} />;
      break;
    case "features":
      content = <FeaturesBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} siteTemplateId={siteTemplateId} sectionAlign={sectionAlign} businessName={businessName} businessLogo={businessLogo} />;
      break;
    case "about":
      content = <AboutBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} siteTemplateId={siteTemplateId} sectionAlign={sectionAlign} businessName={businessName} businessLogo={businessLogo} />;
      break;
    case "gallery":
      content = <GalleryBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} siteTemplateId={siteTemplateId} sectionAlign={sectionAlign} businessName={businessName} />;
      break;
    case "testimonials":
      content = <TestimonialsBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} siteTemplateId={siteTemplateId} sectionAlign={sectionAlign} />;
      break;
    case "contact":
      {
        const t = await getTranslations("Storefront");
        content = <ContactBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} nextDayLabel={t("nextDay")} closedLabel={t("closed")} siteTemplateId={siteTemplateId} sectionAlign={sectionAlign} />;
      }
      break;
    case "faq":
      content = <FaqBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} />;
      break;
    case "events_embed":
      content = (
        <EventsEmbedBlockRenderer
          block={b}
          tenantId={tenantId}
          isTeamMember={isTeamMember}
        />
      );
      break;
    case "products_embed":
      content = (
        <ProductsEmbedBlockRenderer
          block={b}
          tenantId={tenantId}
          isTeamMember={isTeamMember}
          currencyLocale={currencyLocale}
          accentColor={accentColor}
          siteSlug={siteSlug}
          currency={currency}
        />
      );
      break;
    case "fundraiser_embed":
      content = (
        <FundraiserEmbedBlockRenderer
          block={b}
          tenantId={tenantId}
          isTeamMember={isTeamMember}
        />
      );
      break;
    case "services_embed":
      content = (
        <ServicesEmbedBlockRenderer
          block={b}
          tenantId={tenantId}
          isTeamMember={isTeamMember}
        />
      );
      break;
    case "menu_embed":
      {
        const menuProps = {
          block: b,
          tenantId,
          isTeamMember,
          editMode,
          sourceMap: blockSourceMap,
          currency,
          currencyLocale,
          orderConfig,
          siteSlug,
          hasPublishedMenuPage,
          accentColor,
          siteTemplateId,
          sectionAlign,
        };
        content = siteTemplateId === "restaurant-savannah"
          ? await MenuEmbedBlockRenderer(menuProps)
          : <MenuEmbedBlockRenderer {...menuProps} />;
      }
      break;
    case "rich_text":
      content = <RichTextBlockRenderer block={b} />;
      break;
    case "cta_banner":
      content = <CtaBannerBlockRenderer block={b} siteSlug={siteSlug} scopeInternalLinks={scopeInternalLinks} sectionAlign={sectionAlign} tableFlame={siteTemplateId === "restaurant-table-flame"} savannah={siteTemplateId === "restaurant-savannah"} />;
      break;
    case "menu_order":
      return null;
    case "reservation_form":
      content = (
        <ReservationFormBlockRenderer
          reservationConfig={reservationConfig}
          siteSlug={siteSlug}
        />
      );
      break;
    default:
      console.warn(
        `[BlockRenderer] Unknown block type: "${(b as { type: string }).type}" — skipping.`
      );
      return null;
  }

  if (siteTemplateId === "restaurant-savannah" && content == null) return null;

  return (
    <SectionEnvelopeWrapper
      block={b}
      blockId={editMode && blockSourceMap ? b.id : undefined}
      sectionAlign={sectionAlign}
      siteTemplateId={siteTemplateId}
    >
      {content}
    </SectionEnvelopeWrapper>
  );
}
