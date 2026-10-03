/**
 * components/dashboard/website/builder/canvas/CanvasBlockPreview.tsx
 *
 * Visual renderer for blocks inside the interactive canvas workspace.
 * Batch G: editor-only element hit targets with stable IDs.
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
import { sanitizeArticleHtml } from "@/lib/sanitize-html";
import {
  Calendar,
  MapPin,
  ShoppingBag,
  Heart,
  Mail,
  Phone,
  Clock,
  Image as ImageIcon,
} from "lucide-react";

interface CanvasBlockPreviewProps {
  block: Block;
  embedOptions?: BuilderEmbedOptions;
  selectedElementPath?: string | null;
  onSelectElement?: (path: string) => void;
}

function Hit({
  path,
  selectedPath,
  onSelect,
  children,
  label,
}: {
  path: string;
  selectedPath: string | null;
  onSelect?: (path: string) => void;
  children: React.ReactNode;
  label?: string;
}) {
  const isSelected = selectedPath === path;
  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(path);
      }}
      data-element-path={path}
      title={label ?? path}
      className={`relative rounded-md cursor-pointer transition ${isSelected ? "ring-2 ring-brand-600 ring-offset-1" : "hover:ring-1 hover:ring-zinc-300 hover:ring-offset-1"}`}
    >
      {isSelected && (
        <span className="absolute -top-2 -left-1 z-10 rounded bg-brand-600 px-1 py-0.5 text-[10px] font-bold leading-none text-white">
          {label ?? path}
        </span>
      )}
      {children}
    </div>
  );
}

export function CanvasBlockPreview({ block, embedOptions, selectedElementPath, onSelectElement }: CanvasBlockPreviewProps) {
  const sel = selectedElementPath ?? null;
  const onSel = onSelectElement;

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
          {b.backgroundImage && <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px]" />}
          <Hit path="backgroundImage" selectedPath={sel} onSelect={onSel} label="Image">
            <div className="absolute inset-0 pointer-events-none" />
          </Hit>

          <div className="relative z-10 mx-auto max-w-3xl space-y-4">
            {b.badge ? (
              <Hit path="badge" selectedPath={sel} onSelect={onSel} label="Badge">
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-100/90 px-3 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-900/60 dark:text-brand-300">
                  {b.badge}
                </span>
              </Hit>
            ) : (
              <Hit path="badge" selectedPath={sel} onSelect={onSel} label="Badge">
                <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-3 py-1 text-xs text-zinc-400">
                  + Badge
                </span>
              </Hit>
            )}
            <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{b.heading || "Hero Heading Goes Here"}</h1>
            </Hit>
            {b.subheading ? (
              <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                <p className="text-base sm:text-lg opacity-90 leading-relaxed max-w-2xl mx-auto">{b.subheading}</p>
              </Hit>
            ) : (
              <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                <p className="text-sm text-zinc-400 italic">+ Add subheading</p>
              </Hit>
            )}
            <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
              {b.ctaLabel ? (
                <Hit path="ctaLabel" selectedPath={sel} onSelect={onSel} label="CTA Label">
                  <button type="button" className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs">
                    {b.ctaLabel}
                  </button>
                </Hit>
              ) : (
                <Hit path="ctaLabel" selectedPath={sel} onSelect={onSel} label="CTA Label">
                  <span className="rounded-xl border border-dashed border-zinc-300 px-5 py-2.5 text-xs text-zinc-400">+ CTA</span>
                </Hit>
              )}
              {b.ctaHref && (
                <Hit path="ctaHref" selectedPath={sel} onSelect={onSel} label="CTA Link">
                  <span className="text-xs font-mono text-zinc-500">{b.ctaHref}</span>
                </Hit>
              )}
              {b.secondaryCtaLabel && (
                <Hit path="secondaryCtaLabel" selectedPath={sel} onSelect={onSel} label="Secondary CTA">
                  <button type="button" className="rounded-xl border border-zinc-300 bg-white/80 px-5 py-2.5 text-sm font-semibold text-zinc-800 shadow-xs">
                    {b.secondaryCtaLabel}
                  </button>
                </Hit>
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
            <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
              <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 sm:text-3xl">{b.heading || "Features"}</h2>
            </Hit>
            {b.subheading ? (
              <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">{b.subheading}</p>
              </Hit>
            ) : (
              <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                <p className="text-xs text-zinc-400 italic">+ Subheading</p>
              </Hit>
            )}
          </div>

          <div className={`grid gap-6 ${colClass}`}>
            {(b.items || []).map((item) => {
              const itemId = (item as { id?: string }).id ?? String((item as unknown as { title?: string }).title ?? "");
              return (
                <div key={itemId} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-2">
                  <Hit path={`items[${itemId}].title`} selectedPath={sel} onSelect={onSel} label="Item Title">
                    <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{item.title || "Feature"}</h3>
                  </Hit>
                  {item.description ? (
                    <Hit path={`items[${itemId}].description`} selectedPath={sel} onSelect={onSel} label="Description">
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{item.description}</p>
                    </Hit>
                  ) : (
                    <Hit path={`items[${itemId}].description`} selectedPath={sel} onSelect={onSel} label="Description">
                      <p className="text-xs text-zinc-400 italic">+ Description</p>
                    </Hit>
                  )}
                  <Hit path={`items[${itemId}].icon`} selectedPath={sel} onSelect={onSel} label="Icon">
                    <span className="text-xs text-zinc-500">Icon: {item.icon || "—"}</span>
                  </Hit>
                </div>
              );
            })}
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
              <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
                <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">{b.heading || "About Us"}</h2>
              </Hit>
              {b.subheading && (
                <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
                </Hit>
              )}
            </div>
            {b.mission && (
              <Hit path="mission" selectedPath={sel} onSelect={onSel} label="Mission">
                <div className="rounded-xl border-l-4 border-brand-600 bg-white p-4 shadow-xs dark:bg-zinc-900">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 italic">"{b.mission}"</p>
                </div>
              </Hit>
            )}
            {b.story && (
              <Hit path="story" selectedPath={sel} onSelect={onSel} label="Story">
                <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-line">{b.story}</p>
              </Hit>
            )}
            {b.highlights && b.highlights.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4">
                {b.highlights.map((h) => {
                  const hid = (h as { id?: string }).id ?? h.label;
                  return (
                    <Hit key={hid} path={`highlights[${hid}].value`} selectedPath={sel} onSelect={onSel} label="Highlight">
                      <div className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                        <span className="text-xl font-extrabold text-brand-700 dark:text-brand-400">{h.value}</span>
                        <p className="text-xs text-zinc-500 mt-0.5">{h.label}</p>
                      </div>
                    </Hit>
                  );
                })}
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
            <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">{b.heading || "Gallery"}</h2>
            </Hit>
            {b.subheading && (
              <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
              </Hit>
            )}
          </div>
          {images.length === 0 ? (
            <Hit path="images" selectedPath={sel} onSelect={onSel} label="Images">
              <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-400 dark:border-zinc-700">
                <ImageIcon className="mx-auto h-8 w-8 mb-2 opacity-50" />
                <p className="text-xs">No images added to gallery yet.</p>
              </div>
            </Hit>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {images.map((img) => {
                const iid = (img as { id?: string }).id ?? img.src;
                return (
                  <Hit key={iid} path={`images[${iid}].src`} selectedPath={sel} onSelect={onSel} label="Image">
                    <div className="group overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 shadow-xs">
                      <img src={img.src} alt={img.alt || `Gallery Image`} className="h-44 w-full object-cover" />
                      {img.caption && (
                        <Hit path={`images[${iid}].caption`} selectedPath={sel} onSelect={onSel} label="Caption">
                          <div className="p-2.5 bg-white dark:bg-zinc-900">
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 truncate">{img.caption}</p>
                          </div>
                        </Hit>
                      )}
                    </div>
                  </Hit>
                );
              })}
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
            <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">{b.heading || "Testimonials"}</h2>
            </Hit>
            {b.subheading && (
              <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
              </Hit>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {items.map((item) => {
              const tid = (item as { id?: string }).id ?? item.quote.slice(0, 8);
              return (
                <Hit key={tid} path={`items[${tid}].quote`} selectedPath={sel} onSelect={onSel} label="Quote">
                  <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 italic leading-relaxed">"{item.quote}"</p>
                    <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 block">{item.author || "Supporter"}</span>
                      {item.role && <span className="text-[11px] text-zinc-500 block">{item.role}</span>}
                    </div>
                  </div>
                </Hit>
              );
            })}
          </div>
        </section>
      );
    }

    case "contact": {
      const b = block as ContactBlock;
      return (
        <section className="py-12 px-6 sm:px-8">
          <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
            <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">{b.heading || "Contact Us"}</h2>
            </Hit>
            {b.subheading && (
              <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
              </Hit>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {b.email && (
              <Hit path="email" selectedPath={sel} onSelect={onSel} label="Email">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                  <Mail className="mx-auto h-5 w-5 text-brand-600 mb-2" />
                  <span className="text-xs font-semibold block text-zinc-900 dark:text-zinc-100">Email</span>
                  <span className="text-xs text-zinc-500 truncate block mt-0.5">{b.email}</span>
                </div>
              </Hit>
            )}
            {b.phone && (
              <Hit path="phone" selectedPath={sel} onSelect={onSel} label="Phone">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                  <Phone className="mx-auto h-5 w-5 text-brand-600 mb-2" />
                  <span className="text-xs text-zinc-500 truncate block mt-0.5">{b.phone}</span>
                </div>
              </Hit>
            )}
            {b.address && (
              <Hit path="address" selectedPath={sel} onSelect={onSel} label="Address">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                  <MapPin className="mx-auto h-5 w-5 text-brand-600 mb-2" />
                  <span className="text-xs text-zinc-500 truncate block mt-0.5">{b.address}</span>
                </div>
              </Hit>
            )}
            {b.hours && (
              <Hit path="hours" selectedPath={sel} onSelect={onSel} label="Hours">
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 text-center">
                  <Clock className="mx-auto h-5 w-5 text-brand-600 mb-2" />
                  <span className="text-xs text-zinc-500 truncate block mt-0.5">{b.hours}</span>
                </div>
              </Hit>
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
            <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">{b.heading || "FAQ"}</h2>
            </Hit>
            {b.subheading && (
              <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{b.subheading}</p>
              </Hit>
            )}
          </div>
          <div className="space-y-3">
            {items.map((item) => {
              const fid = (item as { id?: string }).id ?? item.question.slice(0, 8);
              return (
                <Hit key={fid} path={`items[${fid}].question`} selectedPath={sel} onSelect={onSel} label="Question">
                  <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 block">{item.question}</span>
                    <Hit path={`items[${fid}].answer`} selectedPath={sel} onSelect={onSel} label="Answer">
                      <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">{item.answer}</p>
                    </Hit>
                  </div>
                </Hit>
              );
            })}
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
          <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
            <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">{b.heading || "Upcoming Events"}</h2>
            </div>
          </Hit>
          {displayEvents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-400 dark:border-zinc-700">
              <Calendar className="mx-auto h-8 w-8 mb-2 opacity-50 text-rose-500" />
              <p className="text-xs">No events currently published in this organization.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {displayEvents.map((ev) => (
                <div key={ev.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-2">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{ev.title}</h3>
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
          <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
            <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">{b.heading || "Featured Products"}</h2>
            </div>
          </Hit>
          {displayProducts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-400 dark:border-zinc-700">
              <ShoppingBag className="mx-auto h-8 w-8 mb-2 opacity-50 text-teal-500" />
              <p className="text-xs">No products currently published in your storefront.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
              {displayProducts.map((p) => (
                <div key={p.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-2">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{p.title}</h3>
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
          <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
            <div className="mx-auto max-w-4xl text-center mb-8 space-y-2">
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 sm:text-3xl">{b.heading || "Support our Campaign"}</h2>
            </div>
          </Hit>
          {displayFundraisers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-zinc-400 dark:border-zinc-700">
              <Heart className="mx-auto h-8 w-8 mb-2 opacity-50 text-pink-500" />
              <p className="text-xs">No active fundraisers found in this organization.</p>
            </div>
          ) : (
            <div className="max-w-xl mx-auto space-y-4">
              {displayFundraisers.map((f) => (
                <div key={f.id} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 space-y-3">
                  <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">{f.title}</h3>
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
        <Hit path="html" selectedPath={sel} onSelect={onSel} label="Content">
          <section className="py-10 px-6 sm:px-8 max-w-3xl mx-auto prose dark:prose-invert">
            <div
              dangerouslySetInnerHTML={{
                __html: sanitizeArticleHtml(b.html) || "<p>Rich text prose content goes here...</p>",
              }}
            />
          </section>
        </Hit>
      );
    }

    case "cta_banner": {
      const b = block as CtaBannerBlock;
      return (
        <section className="py-12 px-6 sm:px-8 text-center bg-brand-700 text-white rounded-xl shadow-xs">
          <div className="mx-auto max-w-2xl space-y-3">
            <Hit path="heading" selectedPath={sel} onSelect={onSel} label="Heading">
              <h2 className="text-2xl font-bold sm:text-3xl">{b.heading || "Ready to Take Action?"}</h2>
            </Hit>
            {b.subheading && (
              <Hit path="subheading" selectedPath={sel} onSelect={onSel} label="Subheading">
                <p className="text-sm opacity-90">{b.subheading}</p>
              </Hit>
            )}
            {b.ctaLabel && (
              <Hit path="ctaLabel" selectedPath={sel} onSelect={onSel} label="CTA Label">
                <div className="pt-2">
                  <button type="button" className="rounded-xl bg-white px-6 py-2.5 text-xs font-bold text-brand-800 shadow-xs">
                    {b.ctaLabel}
                  </button>
                </div>
              </Hit>
            )}
          </div>
        </section>
      );
    }

    default:
      return (
        <div className="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500">Unknown block</div>
      );
  }
}
