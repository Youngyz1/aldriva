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
import { getTranslations } from "next-intl/server";
import { sanitizeArticleHtml, sanitizeUrl } from "@/lib/sanitize-html";
import { resolveSiteHref } from "@/lib/site-paths";
import { safeImageSrc } from "@/lib/image-url";
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
import type { TemplateSourceMapEntry } from "@/lib/website-template-resolver";
import { StorefrontBrowse, type StorefrontOrderConfig } from "./StorefrontBrowse";
import { ReservationRequestForm, type StorefrontReservationConfig, type ReservationFormLabels } from "./ReservationForm";
import { hasBrowseableItems, type BrowseGroup } from "@/lib/storefront-browse";
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
        ? "text-right items-end"
        : "text-center items-center";

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
}: {
  block: HeroBlock;
  siteSlug?: string;
  scopeInternalLinks?: boolean;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
}) {
  const safeBgImage = block.backgroundImage ? safeImageSrc(block.backgroundImage) : "";
  const safeCtaHref = block.ctaHref
    ? sanitizeUrl(scopeInternalLinks ? resolveSiteHref(siteSlug, block.ctaHref) : block.ctaHref)
    : "";
  const safeSecCtaHref = block.secondaryCtaHref
    ? sanitizeUrl(scopeInternalLinks ? resolveSiteHref(siteSlug, block.secondaryCtaHref) : block.secondaryCtaHref)
    : "";
  const safeVideoUrl = block.videoUrl ? sanitizeUrl(block.videoUrl) : "";

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
      <section className={`ps-section-spacious relative w-full overflow-hidden ${hasMedia ? "bg-[var(--ps-surface)]" : "bg-[var(--ps-accent-light)]"} py-[var(--ps-space-16)] md:py-[var(--ps-space-16)] border-b border-[var(--ps-border)]`}>
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
      <section {...elementPathProps(editMode, sourceMap, "image")} className="relative flex min-h-[520px] w-full flex-col justify-center overflow-hidden px-[var(--ps-space-6)] py-[var(--ps-space-16)]">
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
      className="ps-section-spacious relative flex min-h-[480px] w-full flex-col justify-center overflow-hidden px-[var(--ps-space-6)] py-[var(--ps-space-16)]"
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
}: {
  block: FeaturesBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
}) {
  const cols = block.columns ?? 3;
  const colClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section id={block.heading === "How it works" ? "how-it-works" : undefined} className="w-full py-[var(--ps-space-16)]">
      <SectionHeading heading={block.heading} subheading={block.subheading} />
      <div className={`grid grid-cols-1 gap-[var(--ps-space-6)] ${colClass}`}>
        {(block.items ?? []).map((item, i) => {
          const safeItemHref = item.href ? sanitizeUrl(item.href) : "";
          return (
            <div
              key={i}
              className="flex flex-col justify-between rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs transition hover:shadow-sm"
            >
              <div>
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
    </section>
  );
}

// ── 3. About Block ───────────────────────────────────────────────────────────

function AboutBlockRenderer({
  block,
  editMode,
  sourceMap,
}: {
  block: AboutBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
}) {
  const safeFounderImage = block.founderImage ? safeImageSrc(block.founderImage) : "";

  return (
    <section id="about" className="w-full py-[var(--ps-space-16)]">
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
}: {
  block: GalleryBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
}) {
  const cols = block.columns ?? 3;
  const layout = block.layout ?? "grid";

  const colClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="w-full py-[var(--ps-space-16)]">
      <SectionHeading heading={block.heading} subheading={block.subheading} />

      {layout === "carousel" ? (
        <div className="flex gap-[var(--ps-space-4)] overflow-x-auto pb-[var(--ps-space-4)] snap-x snap-mandatory scrollbar-thin">
          {(block.images ?? []).map((img, i) => {
            const safeImgSrc = safeImageSrc(img.src);
            if (!safeImgSrc) return null;
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
          {(block.images ?? []).map((img, i) => {
            const safeImgSrc = safeImageSrc(img.src);
            if (!safeImgSrc) return null;
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
        <div className={`grid grid-cols-1 gap-[var(--ps-space-4)] ${colClass}`}>
          {(block.images ?? []).map((img, i) => {
            const safeImgSrc = safeImageSrc(img.src);
            if (!safeImgSrc) return null;
            return (
              <figure
                key={i}
                className="overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-neutral)] shadow-xs"
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
      )}
    </section>
  );
}

// ── 5. Testimonials Block ────────────────────────────────────────────────────

function TestimonialsBlockRenderer({
  block,
  editMode,
  sourceMap,
}: {
  block: TestimonialsBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
}) {
  const layout = block.layout ?? "grid";

  return (
    <section className="w-full py-[var(--ps-space-16)]">
      <SectionHeading heading={block.heading} subheading={block.subheading} />

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
                <p {...elementPathProps(editMode, sourceMap, "items[" + i + "].quote")} className="text-sm leading-relaxed text-[var(--ps-muted)]">
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
}: {
  block: ContactBlock;
  editMode?: boolean;
  sourceMap?: ElementSourceMap;
  nextDayLabel: string;
  closedLabel: string;
}) {
  const safeEmail = block.email ? sanitizeUrl(`mailto:${block.email}`) : "";
  const safePhone = block.phone ? sanitizeUrl(`tel:${block.phone}`) : "";
  const mapSearch = block.mapQuery || block.address;
  const safeMapLink = mapSearch
    ? sanitizeUrl(`https://maps.google.com/?q=${encodeURIComponent(mapSearch)}`)
    : "";

  return (
    <section id="contact" className="w-full py-[var(--ps-space-16)]">
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
    <section id="faq" className="w-full py-[var(--ps-space-16)]">
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
    <section className="w-full py-[var(--ps-space-16)]">
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
}: {
  block: ProductsEmbedBlock;
  tenantId?: string;
  isTeamMember?: boolean;
  currencyLocale?: Locale;
  accentColor?: string;
}) {
  const products = tenantId
    ? await resolveProductsEmbed(block, tenantId, Boolean(isTeamMember))
    : [];
  const locale: Locale = currencyLocale === "fr" ? "fr" : "en";
  const t = await getTranslations("Storefront");
  // Shop prices live in Stripe (products store no local price): resolve once
  // per render, per-item failures omit the price but keep the card + link.
  const priceMap = await resolveShopPrices(
    products.map((product) => ({ id: product.id, stripe_price_id: product.stripe_price_id }))
  );
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
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        image: firstImg || null,
        priceLabel: price ? formatCurrency(price.amount, price.currency, locale) : null,
        tags: product.tags,
        detailRows: [
          {
            label: t("stock"),
            value:
              product.stock_quantity === null
                ? t("unlimited")
                : product.stock_quantity === 0
                  ? t("outOfStock")
                  : String(product.stock_quantity),
          },
        ],
        action: { label: t("viewProduct"), href: `/products/${product.slug}` },
      };
    }),
  }));

  const layout = block.layout ?? "grid";

  return (
    <section className="w-full py-[var(--ps-space-16)]">
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
      <section className="w-full py-[var(--ps-space-16)]">
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
      <section className="w-full py-[var(--ps-space-16)]">
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
    <section className="w-full py-[var(--ps-space-16)]">
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
    <section className="w-full py-[var(--ps-space-16)]">
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
  accentColor,
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
  accentColor?: string;
}) {
  const sections = tenantId ? await resolveMenuEmbed(block, tenantId, Boolean(isTeamMember)) : [];
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
    viewOrder: t("viewOrder"),
    yourOrder: t("yourOrder"),
    emptyCart: t("emptyCart"),
    subtotal: t("subtotal"),
    deliveryFee: t("deliveryFee"),
    deliveryFeeNotice: t("deliveryFeeNotice"),
    freeDelivery: t("freeDelivery"),
    freeDeliveryProgress: t("freeDeliveryProgress"),
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
  const menuGroups: BrowseGroup[] = populatedSections.map((sec: ResolvedMenuSection) => ({
    id: sec.id,
    title: sec.name,
    items: sec.items.map((it) => {
      const isPromo = it.promo_price != null && it.promo_price < it.price && it.promo_price >= 0;
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
        options: og.options.map((opt) => ({
          id: opt.id,
          name: opt.name,
          priceDelta: Number(opt.price_delta) || 0,
          priceDeltaLabel: opt.price_delta !== 0
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
  return (
    <section className="w-full py-[var(--ps-space-16)]">
      <div {...elementPathProps(editMode, sourceMap, "heading")}>
        <SectionHeading heading={block.heading || "Our Menu"} subheading={block.subheading} />
      </div>
      {!hasMenuItems ? (
        <p className="py-[var(--ps-space-4)] text-center text-sm text-[var(--ps-muted)]">{t("menuComingSoon")}</p>
      ) : (
        <StorefrontBrowse groups={menuGroups} labels={browseLabels} showGroups={populatedSections.length > 1} orderConfig={orderConfig} accentColor={accentColor}>
        <div className="space-y-[var(--ps-space-8)]">
          {populatedSections.map((sec: ResolvedMenuSection) => (
            <div key={sec.id} className="rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs">
              <div className="flex items-center gap-[var(--ps-space-2)]">
                <h3 className="text-lg font-bold text-[var(--ps-text)]">{sec.name}</h3>
                {sec.isDraft && <DraftBadge />}
              </div>
              {sec.description && <p className="mt-[var(--ps-space-1)] text-sm text-[var(--ps-muted)]">{sec.description}</p>}
              <div className="mt-[var(--ps-space-4)] grid gap-[var(--ps-space-4)] sm:grid-cols-2">
                {sec.items.length === 0 ? (
                  <div className="text-xs text-[var(--ps-muted)]">No items in this section.</div>
                ) : (
                  sec.items.map((it) => {
                    const safeImg = safeImageSrc(it.image_url);
                    const isPromo = it.promo_price != null && it.promo_price < it.price && it.promo_price >= 0;
                    return (
                      <div
                        key={it.id}
                        {...elementPathProps(
                          editMode,
                          sourceMap,
                          "selectedItemIds[" + (block.selectedItemIds?.indexOf(it.id) ?? -1) + "]"
                        )}
                        className="flex gap-[var(--ps-space-3)] rounded-lg border border-[var(--ps-border)] p-[var(--ps-space-3)]"
                      >
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--ps-neutral)]">
                          {safeImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={safeImg} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[var(--ps-muted)]"><Tag className="h-4 w-4" /></div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-[var(--ps-space-2)]">
                            <span className="text-sm font-semibold text-[var(--ps-text)]">{it.name}</span>
                            {it.is_featured && <span className="rounded-full bg-amber-100 px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold text-amber-700">Featured</span>}
                            {it.is_sold_out && <span className="rounded-full bg-[var(--ps-neutral)] px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-bold text-[var(--ps-muted)] border border-[var(--ps-border)]">{t("soldOut")}</span>}
                            {it.isDraft && <DraftBadge />}
                          </div>
                          {it.description && <p className="text-xs text-[var(--ps-muted)] line-clamp-1">{it.description}</p>}
                          <div className="mt-[var(--ps-space-1)] flex flex-wrap gap-[var(--ps-space-1)]">
                            {it.dietary_tags.map((t) => (
                              <span key={t} className="rounded-full bg-emerald-50 px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium text-emerald-700 border border-emerald-200 capitalize">{t.replace("_"," ")}</span>
                            ))}
                            {it.allergens.map((a) => (
                              <span key={a} className="rounded-full bg-red-50 px-[var(--ps-space-2)] py-[var(--ps-space-1)] text-xs font-medium text-red-700 border border-red-200 capitalize">{a}</span>
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
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
        </StorefrontBrowse>
      )}
      {siteSlug && !block.selectedItemIds?.length && hasMenuItems ? (
        <div className="mt-[var(--ps-space-8)] text-center">
          <a
            href={`/site/${encodeURIComponent(siteSlug)}/menu`}
            className="ps-button ps-button-secondary inline-flex items-center gap-[var(--ps-space-2)] text-sm font-semibold transition-colors"
          >
            {t("viewFullMenu")}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </a>
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
      <section className="w-full py-[var(--ps-space-16)]">
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
    <section className="w-full py-[var(--ps-space-16)]">
      <ReservationRequestForm config={reservationConfig} labels={labels} siteSlug={siteSlug ?? reservationConfig.slug} />
    </section>
  );
}

// ── 13. Legacy Rich Text Block ───────────────────────────────────────────────

function RichTextBlockRenderer({ block }: { block: RichTextBlock }) {
  const safeHtml = sanitizeArticleHtml(block.html);
  return (
    <section className="mx-auto w-full max-w-3xl px-[var(--ps-space-6)] py-[var(--ps-space-12)]">
      <div
        className="prose prose-zinc max-w-none prose-headings:font-bold prose-a:text-[var(--ps-accent-hover)]"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </section>
  );
}

// ── 12. Legacy CTA Banner Block ──────────────────────────────────────────────

function CtaBannerBlockRenderer({ block, siteSlug, scopeInternalLinks }: { block: CtaBannerBlock; siteSlug?: string; scopeInternalLinks?: boolean }) {
  const variantClasses =
    block.variant === "dark"
      ? "bg-[var(--ps-text)] text-white"
      : block.variant === "light"
        ? "bg-[var(--ps-neutral)] text-[var(--ps-text)] border border-[var(--ps-border)]"
        : "text-white";

  const safeCtaHref = block.ctaHref
    ? sanitizeUrl(scopeInternalLinks ? resolveSiteHref(siteSlug, block.ctaHref) : block.ctaHref)
    : "";

  return (
    <section
      className={`w-full px-[var(--ps-space-6)] py-[var(--ps-space-16)] text-center ${variantClasses}`}
      style={
        block.variant !== "dark" && block.variant !== "light"
          ? { backgroundColor: "var(--ps-accent)" }
          : {}
      }
    >
      <div className="mx-auto max-w-3xl">
        {block.heading && (
          <h2 className="text-3xl font-bold">{block.heading}</h2>
        )}
        {block.subheading && (
          <p className="mt-[var(--ps-space-3)] text-lg opacity-90">{block.subheading}</p>
        )}
        {block.ctaLabel && safeCtaHref && (
          <a
            href={safeCtaHref}
            className="ps-button ps-button-secondary mt-[var(--ps-space-8)] inline-flex items-center text-sm font-semibold shadow-xs transition"
          >
            {block.ctaLabel}
          </a>
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
}: {
  block: Block;
  children: React.ReactNode;
  blockId?: string;
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
  const containerClass = getContainerClass(container as never);

  // Respect visibility — hidden sections already filtered via isBlockVisible at call sites, but keep guard
  const isVisible = raw.visible !== false;
  if (!isVisible) return null as unknown as React.ReactElement;

  const wrapperStyle = bgStyle as React.CSSProperties | undefined;
  // Outer section carries background, spacing, visibility, overlay — full-width
  const outerClass = [hiddenClass, spacingClass, hasOverlay ? "relative" : ""].filter(Boolean).join(" ");
  const hasOuter = Boolean(hiddenClass || spacingClass || bgStyle || hasOverlay);

  if (hasOuter) {
    return (
      <div data-block-id={blockId} className={outerClass} style={wrapperStyle}>
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
  return <div data-block-id={blockId} className={containerClass}>{children}</div>;
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
  scopeInternalLinks,
  accentColor,
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
  scopeInternalLinks?: boolean;
  accentColor?: string;
}) {
  if (!block || typeof block !== "object" || !("type" in block)) {
    return null;
  }

  const b = block as Block;
  const blockSourceMap = b.id ? sourceMap?.[b.id] : undefined;

  // G2: hidden sections do not render publicly
  if (!isBlockVisible(b)) return null;

  let content: React.ReactNode;
  switch (b.type) {
    case "hero":
      content = <HeroBlockRenderer block={b} siteSlug={siteSlug} scopeInternalLinks={scopeInternalLinks} editMode={editMode} sourceMap={blockSourceMap} />;
      break;
    case "features":
      content = <FeaturesBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} />;
      break;
    case "about":
      content = <AboutBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} />;
      break;
    case "gallery":
      content = <GalleryBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} />;
      break;
    case "testimonials":
      content = <TestimonialsBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} />;
      break;
    case "contact":
      {
        const t = await getTranslations("Storefront");
        content = <ContactBlockRenderer block={b} editMode={editMode} sourceMap={blockSourceMap} nextDayLabel={t("nextDay")} closedLabel={t("closed")} />;
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
      content = (
        <MenuEmbedBlockRenderer
          block={b}
          tenantId={tenantId}
          isTeamMember={isTeamMember}
          editMode={editMode}
          sourceMap={blockSourceMap}
          currency={currency}
          currencyLocale={currencyLocale}
          orderConfig={orderConfig}
          siteSlug={siteSlug}
          accentColor={accentColor}
        />
      );
      break;
    case "rich_text":
      content = <RichTextBlockRenderer block={b} />;
      break;
    case "cta_banner":
      content = <CtaBannerBlockRenderer block={b} siteSlug={siteSlug} scopeInternalLinks={scopeInternalLinks} />;
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

  return (
    <SectionEnvelopeWrapper
      block={b}
      blockId={editMode && blockSourceMap ? b.id : undefined}
    >
      {content}
    </SectionEnvelopeWrapper>
  );
}
