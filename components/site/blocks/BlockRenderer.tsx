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
 *  - URL attributes (href, src, bgImage) are sanitized via sanitizeUrl().
 *  - Embed resolvers are executed server-side with injected tenantId and isTeamMember gating.
 */

import React from "react";
import Link from "next/link";
import { sanitizeArticleHtml, sanitizeUrl } from "@/lib/sanitize-html";
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
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  resolveEventsEmbed,
  resolveProductsEmbed,
  resolveFundraiserEmbed,
  resolveServicesEmbed,
  resolveMenuEmbed,
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
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 border border-amber-300">
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
    <div className={`mb-12 flex flex-col ${alignClasses}`}>
      {heading && (
        <h2 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          {heading}
        </h2>
      )}
      {subheading && (
        <p className="mt-3 max-w-2xl text-lg text-zinc-600 leading-relaxed">
          {subheading}
        </p>
      )}
    </div>
  );
}

// ── 1. Hero Block ────────────────────────────────────────────────────────────

function HeroBlockRenderer({ block }: { block: HeroBlock }) {
  const safeBgImage = block.backgroundImage ? sanitizeUrl(block.backgroundImage) : "";
  const safeCtaHref = block.ctaHref ? sanitizeUrl(block.ctaHref) : "";
  const safeSecCtaHref = block.secondaryCtaHref ? sanitizeUrl(block.secondaryCtaHref) : "";
  const safeVideoUrl = block.videoUrl ? sanitizeUrl(block.videoUrl) : "";

  const alignClass =
    block.align === "left"
      ? "text-left items-start"
      : block.align === "right"
        ? "text-right items-end"
        : "text-center items-center";

  // Variant: Split (2-column layout)
  if (block.variant === "split") {
    return (
      <section className="relative w-full overflow-hidden bg-white py-16 md:py-24 border-b border-zinc-100">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div className="flex flex-col items-start gap-6">
              {block.badge && (
                <span className="inline-flex items-center rounded-full bg-[var(--site-primary-light,#ffedd5)] px-3 py-1 text-xs font-semibold text-[var(--site-primary,#c2410c)]">
                  {block.badge}
                </span>
              )}
              {block.heading && (
                <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl">
                  {block.heading}
                </h1>
              )}
              {block.subheading && (
                <p className="text-lg text-zinc-600 leading-relaxed">
                  {block.subheading}
                </p>
              )}
              {(block.ctaLabel || block.secondaryCtaLabel) && (
                <div className="flex flex-wrap gap-3 pt-2">
                  {block.ctaLabel && safeCtaHref && (
                    <a href={safeCtaHref} className={cn(buttonVariants({ variant: "default" }), "gap-2")}>
                      {block.ctaLabel}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  )}
                  {block.secondaryCtaLabel && safeSecCtaHref && (
                    <a href={safeSecCtaHref} className={cn(buttonVariants({ variant: "outline" }))}>
                      {block.secondaryCtaLabel}
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-zinc-100 shadow-sm">
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
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400">
                  <span className="text-sm font-medium">Hero Media</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Variant: Video Background
  if (block.variant === "video_bg" && safeVideoUrl) {
    return (
      <section className="relative flex min-h-[520px] w-full flex-col justify-center overflow-hidden px-6 py-24">
        <video
          src={safeVideoUrl}
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px]" aria-hidden="true" />
        <div className={`relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-6 ${alignClass}`}>
          {block.badge && (
            <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-xs">
              {block.badge}
            </span>
          )}
          {block.heading && (
            <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              {block.heading}
            </h1>
          )}
          {block.subheading && (
            <p className="max-w-2xl text-lg text-white/90 sm:text-xl leading-relaxed">
              {block.subheading}
            </p>
          )}
          {(block.ctaLabel || block.secondaryCtaLabel) && (
            <div className="flex flex-wrap gap-3 pt-2">
              {block.ctaLabel && safeCtaHref && (
                <a
                  href={safeCtaHref}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-xs transition hover:bg-zinc-100"
                >
                  {block.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </a>
              )}
              {block.secondaryCtaLabel && safeSecCtaHref && (
                <a
                  href={safeSecCtaHref}
                  className="inline-flex items-center rounded-xl border border-white/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
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
  return (
    <section
      className="relative flex min-h-[480px] w-full flex-col justify-center overflow-hidden px-6 py-20"
      style={{
        backgroundColor: block.backgroundColor || "var(--site-primary, #c2410c)",
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
        className={`relative z-10 mx-auto flex w-full max-w-4xl flex-col gap-6 ${alignClass}`}
      >
        {block.badge && (
          <span className="inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur-xs">
            {block.badge}
          </span>
        )}
        {block.heading && (
          <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
            {block.heading}
          </h1>
        )}
        {block.subheading && (
          <p className="max-w-2xl text-lg text-white/90 sm:text-xl leading-relaxed">
            {block.subheading}
          </p>
        )}
        {(block.ctaLabel || block.secondaryCtaLabel) && (
          <div className="flex flex-wrap gap-3 pt-2">
            {block.ctaLabel && safeCtaHref && (
              <a
                href={safeCtaHref}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-zinc-900 shadow-xs transition hover:bg-zinc-100"
              >
                {block.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </a>
            )}
            {block.secondaryCtaLabel && safeSecCtaHref && (
              <a
                href={safeSecCtaHref}
                className="inline-flex items-center rounded-xl border border-white/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
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

function FeaturesBlockRenderer({ block }: { block: FeaturesBlock }) {
  const cols = block.columns ?? 3;
  const colClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="w-full py-16">
      <SectionHeading heading={block.heading} subheading={block.subheading} />
      <div className={`grid grid-cols-1 gap-6 ${colClass}`}>
        {(block.items ?? []).map((item, i) => {
          const safeItemHref = item.href ? sanitizeUrl(item.href) : "";
          return (
            <div
              key={i}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-6 shadow-xs transition hover:shadow-sm"
            >
              <div>
                {item.icon && (
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--site-primary-light,#ffedd5)] text-lg text-[var(--site-primary,#c2410c)] font-semibold">
                    {item.icon}
                  </div>
                )}
                <h3 className="text-lg font-semibold text-zinc-900">{item.title}</h3>
                {item.description && (
                  <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                    {item.description}
                  </p>
                )}
              </div>
              {safeItemHref && (
                <a
                  href={safeItemHref}
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--site-primary,#c2410c)] hover:underline"
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

function AboutBlockRenderer({ block }: { block: AboutBlock }) {
  const safeFounderImage = block.founderImage ? sanitizeUrl(block.founderImage) : "";

  return (
    <section className="w-full py-16">
      <SectionHeading heading={block.heading} subheading={block.subheading} />
      
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 items-start">
        {/* Story Narrative & Mission */}
        <div className={`flex flex-col gap-6 ${safeFounderImage || block.founderName ? "lg:col-span-7" : "lg:col-span-12"}`}>
          {block.story && (
            <div className="prose prose-zinc max-w-none text-base leading-relaxed text-zinc-700">
              <p>{block.story}</p>
            </div>
          )}

          {block.mission && (
            <div className="rounded-xl border-l-4 border-[var(--site-primary,#c2410c)] bg-zinc-50 p-6 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--site-primary,#c2410c)]">
                Our Mission
              </span>
              <p className="mt-2 text-base italic text-zinc-800 leading-relaxed">
                &ldquo;{block.mission}&rdquo;
              </p>
            </div>
          )}

          {/* Metric Highlights Grid */}
          {block.highlights && block.highlights.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {block.highlights.map((hl, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs text-center"
                >
                  {hl.icon && <div className="text-xl mb-1">{hl.icon}</div>}
                  <div className="text-2xl font-bold text-zinc-900">
                    {hl.value}
                  </div>
                  <div className="text-xs font-medium text-zinc-500 mt-0.5">
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
            <div className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-6 shadow-xs">
              {safeFounderImage && (
                <div className="aspect-4/3 w-full overflow-hidden rounded-lg bg-zinc-100 mb-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={safeFounderImage}
                    alt={block.founderName || "Founder"}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              )}
              {block.founderName && (
                <h3 className="text-lg font-bold text-zinc-900">
                  {block.founderName}
                </h3>
              )}
              {block.founderRole && (
                <p className="text-sm font-medium text-[var(--site-primary,#c2410c)]">
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

function GalleryBlockRenderer({ block }: { block: GalleryBlock }) {
  const cols = block.columns ?? 3;
  const layout = block.layout ?? "grid";

  const colClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <section className="w-full py-16">
      <SectionHeading heading={block.heading} subheading={block.subheading} />

      {layout === "carousel" ? (
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-thin">
          {(block.images ?? []).map((img, i) => {
            const safeImgSrc = sanitizeUrl(img.src);
            if (!safeImgSrc) return null;
            return (
              <figure
                key={i}
                className="w-72 shrink-0 snap-start overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-xs sm:w-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={safeImgSrc}
                  alt={img.alt ?? ""}
                  className="h-56 w-full object-cover"
                  loading="lazy"
                />
                {img.caption && (
                  <figcaption className="px-3 py-2 text-center text-xs text-zinc-500">
                    {img.caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      ) : layout === "masonry" ? (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
          {(block.images ?? []).map((img, i) => {
            const safeImgSrc = sanitizeUrl(img.src);
            if (!safeImgSrc) return null;
            return (
              <figure
                key={i}
                className="mb-4 break-inside-avoid overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-xs"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={safeImgSrc}
                  alt={img.alt ?? ""}
                  className="w-full object-cover"
                  loading="lazy"
                />
                {img.caption && (
                  <figcaption className="px-3 py-2 text-center text-xs text-zinc-500">
                    {img.caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-4 ${colClass}`}>
          {(block.images ?? []).map((img, i) => {
            const safeImgSrc = sanitizeUrl(img.src);
            if (!safeImgSrc) return null;
            return (
              <figure
                key={i}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 shadow-xs"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={safeImgSrc}
                  alt={img.alt ?? ""}
                  className="h-56 w-full object-cover"
                  loading="lazy"
                />
                {img.caption && (
                  <figcaption className="px-3 py-2 text-center text-xs text-zinc-500">
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

function TestimonialsBlockRenderer({ block }: { block: TestimonialsBlock }) {
  const layout = block.layout ?? "grid";

  return (
    <section className="w-full py-16">
      <SectionHeading heading={block.heading} subheading={block.subheading} />

      <div
        className={
          layout === "carousel"
            ? "flex gap-6 overflow-x-auto pb-4 snap-x snap-mandatory"
            : "grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
        }
      >
        {(block.items ?? []).map((t, i) => {
          const safeAvatar = t.avatar ? sanitizeUrl(t.avatar) : "";
          const rating = t.rating ? Math.min(Math.max(1, Math.round(t.rating)), 5) : 0;

          return (
            <blockquote
              key={i}
              className={`flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-6 shadow-xs ${
                layout === "carousel" ? "w-80 shrink-0 snap-start" : ""
              }`}
            >
              <div className="flex flex-col gap-3">
                {rating > 0 && (
                  <div className="flex items-center gap-1 text-amber-400">
                    {Array.from({ length: 5 }).map((_, idx) => (
                      <Star
                        key={idx}
                        className={`h-4 w-4 ${
                          idx < rating ? "fill-amber-400 text-amber-400" : "text-zinc-200"
                        }`}
                      />
                    ))}
                  </div>
                )}
                <p className="text-sm leading-relaxed text-zinc-700">
                  &ldquo;{t.quote}&rdquo;
                </p>
              </div>
              <footer className="mt-5 flex items-center gap-3 border-t border-zinc-100 pt-4">
                {safeAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={safeAvatar}
                    alt={t.author ?? ""}
                    className="h-10 w-10 rounded-full object-cover border border-zinc-200"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
                    {t.author ? t.author.charAt(0).toUpperCase() : "★"}
                  </div>
                )}
                <div>
                  {t.author && (
                    <cite className="not-italic text-sm font-semibold text-zinc-900 block">
                      {t.author}
                    </cite>
                  )}
                  {t.role && (
                    <span className="text-xs text-zinc-500 block">{t.role}</span>
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

function ContactBlockRenderer({ block }: { block: ContactBlock }) {
  const safeEmail = block.email ? sanitizeUrl(`mailto:${block.email}`) : "";
  const safePhone = block.phone ? sanitizeUrl(`tel:${block.phone}`) : "";
  const mapSearch = block.mapQuery || block.address;
  const safeMapLink = mapSearch
    ? sanitizeUrl(`https://maps.google.com/?q=${encodeURIComponent(mapSearch)}`)
    : "";

  return (
    <section className="w-full py-16">
      <SectionHeading heading={block.heading} subheading={block.subheading} />

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 items-start">
        {/* Contact Info Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {block.email && (
            <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--site-primary-light,#ffedd5)] text-[var(--site-primary,#c2410c)]">
                <Mail className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Email
              </span>
              {safeEmail ? (
                <a
                  href={safeEmail}
                  className="mt-1 text-sm font-medium text-zinc-900 hover:text-[var(--site-primary,#c2410c)] hover:underline truncate"
                >
                  {block.email}
                </a>
              ) : (
                <span className="mt-1 text-sm font-medium text-zinc-900 truncate">
                  {block.email}
                </span>
              )}
            </div>
          )}

          {block.phone && (
            <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--site-primary-light,#ffedd5)] text-[var(--site-primary,#c2410c)]">
                <Phone className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Phone
              </span>
              {safePhone ? (
                <a
                  href={safePhone}
                  className="mt-1 text-sm font-medium text-zinc-900 hover:text-[var(--site-primary,#c2410c)] hover:underline truncate"
                >
                  {block.phone}
                </a>
              ) : (
                <span className="mt-1 text-sm font-medium text-zinc-900 truncate">
                  {block.phone}
                </span>
              )}
            </div>
          )}

          {block.address && (
            <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-xs sm:col-span-2">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--site-primary-light,#ffedd5)] text-[var(--site-primary,#c2410c)]">
                <MapPin className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Address
              </span>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {block.address}
              </p>
            </div>
          )}

          {block.hours && (
            <div className="flex flex-col rounded-xl border border-zinc-200 bg-white p-5 shadow-xs sm:col-span-2">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--site-primary-light,#ffedd5)] text-[var(--site-primary,#c2410c)]">
                <Clock className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Opening Hours
              </span>
              <p className="mt-1 text-sm font-medium text-zinc-900">
                {block.hours}
              </p>
            </div>
          )}
        </div>

        {/* Map Preview or Direction Link */}
        <div className="flex h-full min-h-[260px] flex-col justify-center rounded-xl border border-zinc-200 bg-zinc-50 p-6 text-center shadow-xs">
          <MapPin className="mx-auto h-8 w-8 text-[var(--site-primary,#c2410c)]" />
          <h4 className="mt-3 text-base font-semibold text-zinc-900">
            Find Us on the Map
          </h4>
          <p className="mt-1 text-sm text-zinc-500">
            {block.address || block.mapQuery || "Visit our physical location."}
          </p>
          {safeMapLink && (
            <div className="mt-5">
              <a
                href={safeMapLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-800 border border-zinc-200 shadow-xs transition hover:bg-zinc-100"
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

function FaqBlockRenderer({ block }: { block: FaqBlock }) {
  return (
    <section className="w-full py-16">
      <SectionHeading heading={block.heading} subheading={block.subheading} />
      <div className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white p-6 shadow-xs">
        {(block.items ?? []).map((item, i) => (
          <details key={i} className="group py-4 first:pt-0 last:pb-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-zinc-900 transition hover:text-[var(--site-primary,#c2410c)]">
              <span className="text-base">{item.question}</span>
              <span className="shrink-0 text-zinc-400 transition group-open:rotate-180">
                ▾
              </span>
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600">
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
    <section className="w-full py-16">
      <SectionHeading heading={block.heading || "Upcoming Events"} subheading={block.subheading} />

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          No events scheduled at this time.
        </div>
      ) : layout === "list" ? (
        <div className="flex flex-col gap-4">
          {events.map((event: ResolvedEventItem) => (
            <div
              key={event.id}
              className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:shadow-sm"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-zinc-900">{event.title}</h3>
                  {event.isDraft && <DraftBadge />}
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 mt-1">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    {new Date(event.event_date).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {(event.venue_name || event.city) && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {[event.venue_name, event.city].filter(Boolean).join(", ")}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-zinc-900">
                  {event.ticket_price_min != null && event.ticket_price_min > 0
                    ? `${event.currency} $${event.ticket_price_min.toFixed(2)}`
                    : "Free"}
                </span>
                <Link
                  href={`/events/${event.slug}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-[var(--site-primary,#c2410c)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[var(--site-primary-hover,#9a3412)]"
                >
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event: ResolvedEventItem) => {
            const safeCover = event.cover_image ? sanitizeUrl(event.cover_image) : "";
            return (
              <div
                key={event.id}
                className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition hover:shadow-sm"
              >
                <div className="relative aspect-16/9 w-full bg-zinc-100">
                  {safeCover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={safeCover}
                      alt={event.title}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-100 text-zinc-400">
                      <Calendar className="h-8 w-8" />
                    </div>
                  )}
                  {event.isDraft && (
                    <div className="absolute top-3 left-3">
                      <DraftBadge />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--site-primary,#c2410c)] mb-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(event.event_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </div>
                    <h3 className="text-base font-bold text-zinc-900 line-clamp-1">
                      {event.title}
                    </h3>
                    {(event.venue_name || event.city) && (
                      <p className="mt-1 text-xs text-zinc-500 line-clamp-1">
                        {[event.venue_name, event.city].filter(Boolean).join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                    <span className="text-sm font-semibold text-zinc-900">
                      {event.ticket_price_min != null && event.ticket_price_min > 0
                        ? `${event.currency} $${event.ticket_price_min.toFixed(2)}`
                        : "Free"}
                    </span>
                    <Link
                      href={`/events/${event.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--site-primary,#c2410c)] hover:underline"
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
}: {
  block: ProductsEmbedBlock;
  tenantId?: string;
  isTeamMember?: boolean;
}) {
  const products = tenantId
    ? await resolveProductsEmbed(block, tenantId, Boolean(isTeamMember))
    : [];

  const layout = block.layout ?? "grid";

  return (
    <section className="w-full py-16">
      <SectionHeading heading={block.heading || "Featured Products"} subheading={block.subheading} />

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          No products available at this time.
        </div>
      ) : layout === "list" ? (
        <div className="flex flex-col gap-4">
          {products.map((product: ResolvedProductItem) => {
            const firstImg = product.images?.[0] ? sanitizeUrl(product.images[0]) : "";
            return (
              <div
                key={product.id}
                className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                    {firstImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={firstImg}
                        alt={product.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-400">
                        <Tag className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-zinc-900">{product.name}</h3>
                      {product.isDraft && <DraftBadge />}
                    </div>
                    {product.description && (
                      <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">
                        {product.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold capitalize text-zinc-700">
                    {product.price_type}
                  </span>
                  <Link
                    href={`/products/${product.slug}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--site-primary,#c2410c)] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[var(--site-primary-hover,#9a3412)]"
                  >
                    View Product
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product: ResolvedProductItem) => {
            const firstImg = product.images?.[0] ? sanitizeUrl(product.images[0]) : "";
            return (
              <div
                key={product.id}
                className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition hover:shadow-sm"
              >
                <div className="relative aspect-4/3 w-full bg-zinc-100">
                  {firstImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={firstImg}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-400">
                      <Tag className="h-8 w-8" />
                    </div>
                  )}
                  {product.isDraft && (
                    <div className="absolute top-3 left-3">
                      <DraftBadge />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 line-clamp-1">
                      {product.name}
                    </h3>
                    {product.description && (
                      <p className="mt-1 text-xs text-zinc-500 line-clamp-2">
                        {product.description}
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                    <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                      {product.price_type}
                    </span>
                    <Link
                      href={`/products/${product.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--site-primary,#c2410c)] hover:underline"
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
      <section className="w-full py-16">
        <SectionHeading heading={block.heading || "Fundraising Campaigns"} subheading={block.subheading} />
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          No active fundraisers at this time.
        </div>
      </section>
    );
  }

  // Layout: Banner (Single prominent featured campaign)
  if (layout === "banner") {
    const featured = fundraisers[0];
    const safeImage = featured.image_url ? sanitizeUrl(featured.image_url) : "";
    const progressPercent = Math.min(
      100,
      Math.round((featured.raised / (featured.goal_amount || 1)) * 100)
    );

    return (
      <section className="w-full py-16">
        <SectionHeading heading={block.heading} subheading={block.subheading} />
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs lg:grid lg:grid-cols-12 items-center">
          {safeImage && (
            <div className="relative aspect-16/9 w-full bg-zinc-100 lg:col-span-5 lg:h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={safeImage}
                alt={featured.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className={`p-8 lg:p-10 ${safeImage ? "lg:col-span-7" : "lg:col-span-12"}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[var(--site-primary,#c2410c)]">
                <Heart className="h-3.5 w-3.5 fill-current" />
                Featured Cause
              </span>
              {featured.isDraft && <DraftBadge />}
            </div>
            <h3 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
              {featured.title}
            </h3>

            {/* Progress bar */}
            <div className="mt-6">
              <div className="flex justify-between text-sm font-semibold mb-2">
                <span className="text-zinc-900">
                  ${featured.raised.toLocaleString()} {featured.currency} raised
                </span>
                <span className="text-zinc-500">
                  Goal: ${featured.goal_amount.toLocaleString()}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-[var(--site-primary,#c2410c)] transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-1.5 text-right text-xs font-semibold text-[var(--site-primary,#c2410c)]">
                {progressPercent}% funded
              </div>
            </div>

            <div className="mt-8">
              <Link
                href={`/fundraisers/${featured.slug}`}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--site-primary,#c2410c)] px-6 py-3 text-sm font-semibold text-white shadow-xs transition hover:bg-[var(--site-primary-hover,#9a3412)]"
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
    <section className="w-full py-16">
      <SectionHeading heading={block.heading || "Active Campaigns"} subheading={block.subheading} />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {fundraisers.map((f: ResolvedFundraiserItem) => {
          const safeImage = f.image_url ? sanitizeUrl(f.image_url) : "";
          const progressPercent = Math.min(
            100,
            Math.round((f.raised / (f.goal_amount || 1)) * 100)
          );

          return (
            <div
              key={f.id}
              className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs transition hover:shadow-sm"
            >
              <div className="relative aspect-16/9 w-full bg-zinc-100">
                {safeImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={safeImage}
                    alt={f.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-zinc-400">
                    <Heart className="h-8 w-8" />
                  </div>
                )}
                {f.isDraft && (
                  <div className="absolute top-3 left-3">
                    <DraftBadge />
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between p-5">
                <div>
                  <h3 className="text-base font-bold text-zinc-900 line-clamp-1">
                    {f.title}
                  </h3>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span className="text-zinc-900">
                        ${f.raised.toLocaleString()}
                      </span>
                      <span className="text-zinc-500">
                        ${f.goal_amount.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-[var(--site-primary,#c2410c)]"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-5 border-t border-zinc-100 pt-3">
                  <Link
                    href={`/fundraisers/${f.slug}`}
                    className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--site-primary,#c2410c)] py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[var(--site-primary-hover,#9a3412)]"
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
    <section className="w-full py-16">
      <SectionHeading heading={block.heading || "Our Services"} subheading={block.subheading} />
      {services.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">No services available at this time.</div>
      ) : layout === "list" ? (
        <div className="flex flex-col gap-4">
          {services.map((svc: ResolvedServiceItem) => {
            const safeImg = svc.image_url ? sanitizeUrl(svc.image_url) : "";
            return (
              <div key={svc.id} className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-xs">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                    {safeImg ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={safeImg} alt={svc.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-zinc-400"><Tag className="h-5 w-5" /></div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2"><h3 className="text-base font-bold text-zinc-900">{svc.title}</h3>{svc.isDraft && <DraftBadge />}</div>
                    {svc.description && <p className="mt-0.5 text-xs text-zinc-500 line-clamp-1">{svc.description}</p>}
                    {svc.duration_minutes && <p className="text-xs text-zinc-400">{svc.duration_minutes} min</p>}
                  </div>
                </div>
                <div className="text-sm font-semibold text-zinc-900">${svc.price.toFixed(2)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc: ResolvedServiceItem) => {
            const safeImg = svc.image_url ? sanitizeUrl(svc.image_url) : "";
            return (
              <div key={svc.id} className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
                <div className="relative aspect-4/3 w-full bg-zinc-100">
                  {safeImg ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={safeImg} alt={svc.title} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-zinc-400"><Tag className="h-8 w-8" /></div>
                  )}
                  {svc.isDraft && <div className="absolute top-3 left-3"><DraftBadge /></div>}
                </div>
                <div className="p-5">
                  <h3 className="text-base font-bold text-zinc-900">{svc.title}</h3>
                  {svc.description && <p className="mt-1 text-xs text-zinc-500 line-clamp-2">{svc.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-bold">${svc.price.toFixed(2)}</span>
                    {svc.duration_minutes && <span className="text-xs text-zinc-500">{svc.duration_minutes} min</span>}
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
}: {
  block: MenuEmbedBlock;
  tenantId?: string;
  isTeamMember?: boolean;
}) {
  const sections = tenantId ? await resolveMenuEmbed(block, tenantId, Boolean(isTeamMember)) : [];
  return (
    <section className="w-full py-16">
      <SectionHeading heading={block.heading || "Our Menu"} subheading={block.subheading} />
      {sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">No menu available at this time.</div>
      ) : (
        <div className="space-y-8">
          {sections.map((sec: ResolvedMenuSection) => (
            <div key={sec.id} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-zinc-900">{sec.name}</h3>
                {sec.isDraft && <DraftBadge />}
              </div>
              {sec.description && <p className="mt-1 text-sm text-zinc-500">{sec.description}</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {sec.items.length === 0 ? (
                  <div className="text-xs text-zinc-400">No items in this section.</div>
                ) : (
                  sec.items.map((it) => {
                    const safeImg = it.image_url ? sanitizeUrl(it.image_url) : "";
                    return (
                      <div key={it.id} className="flex gap-3 rounded-lg border border-zinc-100 p-3">
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
                          {safeImg ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={safeImg} alt={it.name} className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-zinc-300"><Tag className="h-4 w-4" /></div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-zinc-900">{it.name}</span>
                            {it.is_featured && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Featured</span>}
                            {it.isDraft && <DraftBadge />}
                          </div>
                          {it.description && <p className="text-xs text-zinc-500 line-clamp-1">{it.description}</p>}
                          <div className="mt-1 flex flex-wrap gap-1">
                            {it.dietary_tags.map((t) => (
                              <span key={t} className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200 capitalize">{t.replace("_"," ")}</span>
                            ))}
                            {it.allergens.map((a) => (
                              <span key={a} className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 border border-red-200 capitalize">{a}</span>
                            ))}
                          </div>
                          <div className="mt-1 text-xs font-semibold">${Number(it.price).toFixed(2)} {it.modifiers.length > 0 && <span className="font-normal text-zinc-500">+ {it.modifiers.length} modifiers</span>}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── 13. Legacy Rich Text Block ───────────────────────────────────────────────

function RichTextBlockRenderer({ block }: { block: RichTextBlock }) {
  const safeHtml = sanitizeArticleHtml(block.html);
  return (
    <section className="mx-auto w-full max-w-3xl px-6 py-12">
      <div
        className="prose prose-zinc max-w-none prose-headings:font-bold prose-a:text-[var(--site-primary,#c2410c)]"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </section>
  );
}

// ── 12. Legacy CTA Banner Block ──────────────────────────────────────────────

function CtaBannerBlockRenderer({ block }: { block: CtaBannerBlock }) {
  const variantClasses =
    block.variant === "dark"
      ? "bg-zinc-900 text-white"
      : block.variant === "light"
        ? "bg-zinc-50 text-zinc-900 border border-zinc-200"
        : "text-white";

  const safeCtaHref = block.ctaHref ? sanitizeUrl(block.ctaHref) : "";

  return (
    <section
      className={`w-full px-6 py-16 text-center ${variantClasses}`}
      style={
        block.variant !== "dark" && block.variant !== "light"
          ? { backgroundColor: "var(--site-primary, #c2410c)" }
          : {}
      }
    >
      <div className="mx-auto max-w-3xl">
        {block.heading && (
          <h2 className="text-3xl font-bold">{block.heading}</h2>
        )}
        {block.subheading && (
          <p className="mt-3 text-lg opacity-90">{block.subheading}</p>
        )}
        {block.ctaLabel && safeCtaHref && (
          <a
            href={safeCtaHref}
            className="mt-8 inline-flex items-center rounded-xl bg-white px-8 py-3 text-sm font-semibold text-zinc-900 shadow-xs transition hover:bg-zinc-100"
          >
            {block.ctaLabel}
          </a>
        )}
      </div>
    </section>
  );
}

// ── Section Envelope Wrapper (G2 + H1) ───────────────────────────────────────
function SectionEnvelopeWrapper({ block, children }: { block: Block; children: React.ReactNode }) {
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
      <div className={outerClass} style={wrapperStyle}>
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
  return <div className={containerClass}>{children}</div>;
}

// ── Main Dispatcher ──────────────────────────────────────────────────────────

export async function BlockRenderer({
  block,
  tenantId,
  isTeamMember,
}: {
  block: unknown;
  tenantId?: string;
  isTeamMember?: boolean;
}) {
  if (!block || typeof block !== "object" || !("type" in block)) {
    return null;
  }

  const b = block as Block;

  // G2: hidden sections do not render publicly
  if (!isBlockVisible(b)) return null;

  let content: React.ReactNode;
  switch (b.type) {
    case "hero":
      content = <HeroBlockRenderer block={b} />;
      break;
    case "features":
      content = <FeaturesBlockRenderer block={b} />;
      break;
    case "about":
      content = <AboutBlockRenderer block={b} />;
      break;
    case "gallery":
      content = <GalleryBlockRenderer block={b} />;
      break;
    case "testimonials":
      content = <TestimonialsBlockRenderer block={b} />;
      break;
    case "contact":
      content = <ContactBlockRenderer block={b} />;
      break;
    case "faq":
      content = <FaqBlockRenderer block={b} />;
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
        />
      );
      break;
    case "rich_text":
      content = <RichTextBlockRenderer block={b} />;
      break;
    case "cta_banner":
      content = <CtaBannerBlockRenderer block={b} />;
      break;
    default:
      console.warn(
        `[BlockRenderer] Unknown block type: "${(b as { type: string }).type}" — skipping.`
      );
      return null;
  }

  return <SectionEnvelopeWrapper block={b}>{content}</SectionEnvelopeWrapper>;
}
