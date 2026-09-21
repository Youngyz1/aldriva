/**
 * components/dashboard/website/builder/canvas/CanvasBlockPreview.tsx
 *
 * Visual renderer for blocks inside the interactive canvas workspace.
 */

"use client";

/* eslint-disable @next/next/no-img-element */
import React from "react";
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
  RichTextBlock,
  CtaBannerBlock,
} from "@/lib/website-blocks";
import { BuilderEmbedOptions } from "@/lib/actions/website-builder";
import {
  Calendar,
  MapPin,
  ShoppingBag,
  Heart,
  Star,
  Mail,
  Phone,
  Clock,
  Image as ImageIcon,
  CheckCircle,
} from "lucide-react";

interface CanvasBlockPreviewProps {
  block: Block;
  embedOptions?: BuilderEmbedOptions;
}

export function CanvasBlockPreview({ block, embedOptions }: CanvasBlockPreviewProps) {
  switch (block.type) {
    case "hero": {
      const b = block as HeroBlock;
      return (
        <section
          className={`relative overflow-hidden py-16 px-6 sm:px-12 text-center rounded-xl transition-all ${
            b.backgroundImage
              ? "bg-cover bg-center text-white"
              : "bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-900 dark:to-zinc-950 text-zinc-900 dark:text-zinc-100"
          }`}
          style={{
            backgroundImage: b.backgroundImage ? `url(${b.backgroundImage})` : undefined,
            backgroundColor: b.backgroundColor || undefined,
          }}
        >
          {b.backgroundImage && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />
          )}

          <div className="relative z-10 mx-auto max-w-3xl space-y-4">
            {b.badge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-100/90 px-3 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-900/60 dark:text-brand-300">
                {b.badge}
              </span>
            )}
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
              {b.heading || "Hero Heading Goes Here"}
            </h1>
            {b.subheading && (
              <p className="text-base sm:text-lg opacity-90 leading-relaxed max-w-2xl mx-auto">
                {b.subheading}
              </p>
            )}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              {b.ctaLabel && (
                <button
                  type="button"
                  className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-brand-800"
                >
                  {b.ctaLabel}
                </button>
              )}
              {b.secondaryCtaLabel && (
                <button
                  type="button"
                  className="rounded-xl border border-zinc-300 bg-white/80 px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-xs hover:bg-white dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-100"
                >
                  {b.secondaryCtaLabel}
                </button>
              )}
            </div>
          </div>
        </section>
      );
    }

    case "features": {
      const b = block as FeaturesBlock;
      const cols = b.columns || 3;
      const colClass =
        cols === 2
          ? "grid-cols-1 md:grid-cols-2"
          : cols === 4
            ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            : "grid-cols-1 md:grid-cols-3";

      return (
        <section className="py-12 px-6 sm:px-8">
          <div className="mx-auto max-w-5xl text-center space-y-2 mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              {b.heading || "Features"}
            </h2>
            {b.subheading && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
                {b.subheading}
              </p>
            )}
          </div>

          <div className={`grid gap-6 ${colClass}`}>
            {(b.items || []).map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-400">
                  <CheckCircle className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                  {item.title || `Feature ${i + 1}`}
                </h3>
                {item.description && (
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                    {item.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "about": {
      const b = block as AboutBlock;
      return (
        <section className="py-12 px-6 sm:px-8 bg-zinc-50/60 dark:bg-zinc-900/30 rounded-xl">
          <div className="mx-auto max-w-4xl space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
                {b.heading || "About Us"}
              </h2>
              {b.subheading && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
              )}
            </div>

            {b.mission && (
              <div className="rounded-xl border-l-4 border-brand-600 bg-white p-4 shadow-xs dark:bg-zinc-900">
                <span className="text-xs font-bold uppercase tracking-wider text-brand-700 dark:text-brand-400">
                  Our Mission
                </span>
                <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200 italic">
                  "{b.mission}"
                </p>
              </div>
            )}

            {b.story && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-line">
                {b.story}
              </p>
            )}

            {b.highlights && b.highlights.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
                {b.highlights.map((h, i) => (
                  <div
                    key={i}
                    className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <span className="text-xl font-extrabold text-brand-700 dark:text-brand-400">
                      {h.value}
                    </span>
                    <p className="text-xs text-zinc-500 mt-0.5">{h.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      );
    }

    case "gallery": {
      const b = block as GalleryBlock;
      const images = b.images || [];

      return (
        <section className="py-12 px-6 sm:px-8">
          <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              {b.heading || "Gallery"}
            </h2>
            {b.subheading && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
            )}
          </div>

          {images.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-400 dark:border-zinc-700">
              <ImageIcon className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-xs">No images added to gallery yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {images.map((img, i) => (
                <div
                  key={i}
                  className="group overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 shadow-xs"
                >
                  <img
                    src={img.src}
                    alt={img.alt || `Gallery Image ${i + 1}`}
                    className="h-44 w-full object-cover"
                  />
                  {img.caption && (
                    <div className="p-2.5 bg-white dark:bg-zinc-900">
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                        {img.caption}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }

    case "testimonials": {
      const b = block as TestimonialsBlock;
      const items = b.items || [];

      return (
        <section className="py-12 px-6 sm:px-8 bg-zinc-50/50 dark:bg-zinc-900/40 rounded-xl">
          <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              {b.heading || "Testimonials"}
            </h2>
            {b.subheading && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {items.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3"
              >
                <div className="flex items-center gap-1 text-amber-500">
                  {Array.from({ length: item.rating || 5 }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 italic leading-relaxed">
                  "{item.quote}"
                </p>
                <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                  <div>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">
                      {item.author || "Supporter"}
                    </span>
                    {item.role && (
                      <span className="text-[11px] text-zinc-500 block">{item.role}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "contact": {
      const b = block as ContactBlock;
      return (
        <section className="py-12 px-6 sm:px-8">
          <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              {b.heading || "Contact Us"}
            </h2>
            {b.subheading && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {b.email && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                <Mail className="mx-auto h-5 w-5 text-brand-600 mb-2" />
                <span className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">Email</span>
                <span className="text-xs text-zinc-500 truncate block mt-0.5">{b.email}</span>
              </div>
            )}
            {b.phone && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                <Phone className="mx-auto h-5 w-5 text-brand-600 mb-2" />
                <span className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">Phone</span>
                <span className="text-xs text-zinc-500 truncate block mt-0.5">{b.phone}</span>
              </div>
            )}
            {b.address && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                <MapPin className="mx-auto h-5 w-5 text-brand-600 mb-2" />
                <span className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">Location</span>
                <span className="text-xs text-zinc-500 truncate block mt-0.5">{b.address}</span>
              </div>
            )}
            {b.hours && (
              <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                <Clock className="mx-auto h-5 w-5 text-brand-600 mb-2" />
                <span className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">Hours</span>
                <span className="text-xs text-zinc-500 truncate block mt-0.5">{b.hours}</span>
              </div>
            )}
          </div>
        </section>
      );
    }

    case "faq": {
      const b = block as FaqBlock;
      const items = b.items || [];

      return (
        <section className="py-12 px-6 sm:px-8 max-w-3xl mx-auto space-y-4">
          <div className="text-center mb-6 space-y-2">
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              {b.heading || "FAQ"}
            </h2>
            {b.subheading && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
            )}
          </div>

          <div className="space-y-3">
            {items.map((item, i) => (
              <div
                key={i}
                className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 block">
                  {item.question}
                </span>
                <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {item.answer}
                </p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "events_embed": {
      const b = block as EventsEmbedBlock;
      const events = embedOptions?.events || [];
      const displayEvents =
        b.selectedEventIds && b.selectedEventIds.length > 0
          ? events.filter((e) => b.selectedEventIds?.includes(e.id))
          : events.slice(0, b.limit || 3);

      return (
        <section className="py-12 px-6 sm:px-8">
          <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
              <Calendar className="h-3.5 w-3.5" />
              <span>Events Feed (Live Sync)</span>
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              {b.heading || "Upcoming Events"}
            </h2>
          </div>

          {displayEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-400 dark:border-zinc-700">
              <Calendar className="mx-auto h-8 w-8 mb-2 opacity-50 text-rose-500" />
              <p className="text-xs">No events currently published in this organization.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {displayEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-2"
                >
                  <span className="text-xs font-bold text-rose-600 dark:text-rose-400 block">
                    {ev.start_date
                      ? new Date(ev.start_date).toLocaleDateString()
                      : "Upcoming"}
                  </span>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {ev.title}
                  </h3>
                  <button
                    type="button"
                    className="mt-2 w-full rounded-lg bg-zinc-100 py-1.5 text-xs font-medium text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    View Details
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }

    case "products_embed": {
      const b = block as ProductsEmbedBlock;
      const products = embedOptions?.products || [];
      const displayProducts =
        b.selectedProductIds && b.selectedProductIds.length > 0
          ? products.filter((p) => b.selectedProductIds?.includes(p.id))
          : products.slice(0, b.limit || 3);

      return (
        <section className="py-12 px-6 sm:px-8">
          <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
              <ShoppingBag className="h-3.5 w-3.5" />
              <span>Catalog Embed (Live Sync)</span>
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              {b.heading || "Featured Products"}
            </h2>
          </div>

          {displayProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-400 dark:border-zinc-700">
              <ShoppingBag className="mx-auto h-8 w-8 mb-2 opacity-50 text-teal-500" />
              <p className="text-xs">No products currently published in your storefront.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {displayProducts.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-2"
                >
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                    {p.title}
                  </h3>
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400 block">
                    {p.price_cents !== undefined
                      ? `$${(p.price_cents / 100).toFixed(2)}`
                      : "Free"}
                  </span>
                  <button
                    type="button"
                    className="mt-2 w-full rounded-lg bg-teal-50 py-1.5 text-xs font-semibold text-teal-800 dark:bg-teal-950/50 dark:text-teal-300"
                  >
                    Buy Now
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }

    case "fundraiser_embed": {
      const b = block as FundraiserEmbedBlock;
      const fundraisers = embedOptions?.fundraisers || [];
      const displayFundraisers =
        b.selectedFundraiserIds && b.selectedFundraiserIds.length > 0
          ? fundraisers.filter((f) => b.selectedFundraiserIds?.includes(f.id))
          : fundraisers.slice(0, b.limit || 1);

      return (
        <section className="py-12 px-6 sm:px-8 bg-pink-50/30 dark:bg-pink-950/10 rounded-xl">
          <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-2.5 py-0.5 text-xs font-semibold text-pink-700 dark:bg-pink-950/40 dark:text-pink-300">
              <Heart className="h-3.5 w-3.5" />
              <span>Fundraiser Embed</span>
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">
              {b.heading || "Support our Campaign"}
            </h2>
          </div>

          {displayFundraisers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-400 dark:border-zinc-700">
              <Heart className="mx-auto h-8 w-8 mb-2 opacity-50 text-pink-500" />
              <p className="text-xs">No active fundraisers found in this organization.</p>
            </div>
          ) : (
            <div className="max-w-xl mx-auto space-y-4">
              {displayFundraisers.map((f) => (
                <div
                  key={f.id}
                  className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3"
                >
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {f.title}
                  </h3>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      <span>Raised: ${((f.current_amount || 0) / 100).toLocaleString()}</span>
                      <span>Goal: ${((f.goal_amount || 100000) / 100).toLocaleString()}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-pink-600 rounded-full"
                        style={{
                          width: `${Math.min(
                            100,
                            ((f.current_amount || 0) / (f.goal_amount || 100000)) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-pink-600 py-2 text-xs font-semibold text-white shadow-xs hover:bg-pink-700"
                  >
                    Donate Now
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      );
    }

    case "rich_text": {
      const b = block as RichTextBlock;
      return (
        <section className="py-10 px-6 sm:px-8 max-w-3xl mx-auto prose dark:prose-invert">
          <div
            dangerouslySetInnerHTML={{
              __html: b.html || "<p>Rich text prose content goes here...</p>",
            }}
          />
        </section>
      );
    }

    case "cta_banner": {
      const b = block as CtaBannerBlock;
      return (
        <section className="py-12 px-6 sm:px-8 text-center bg-brand-700 text-white rounded-xl shadow-xs">
          <div className="mx-auto max-w-2xl space-y-3">
            <h2 className="text-2xl font-bold sm:text-3xl">{b.heading || "Ready to Take Action?"}</h2>
            {b.subheading && <p className="text-sm opacity-90">{b.subheading}</p>}
            {b.ctaLabel && (
              <div className="pt-2">
                <button
                  type="button"
                  className="rounded-xl bg-white px-6 py-2.5 text-xs font-bold text-brand-800 shadow-xs hover:bg-zinc-100"
                >
                  {b.ctaLabel}
                </button>
              </div>
            )}
          </div>
        </section>
      );
    }

    default:
      return (
        <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500">
          Unknown block
        </div>
      );
  }
}
