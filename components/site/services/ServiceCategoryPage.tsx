import { safeImageSrc } from "@/lib/image-url";
import { getSiteSegmentsHref } from "@/lib/site-paths";
import { buildServicePath } from "@/lib/services-route-resolver";
import type { PublicServiceCategory, PublicServiceItem } from "@/lib/services-public-data";
import type { CtaBannerBlock } from "@/lib/website-blocks";
import { CtaBannerBlockRenderer } from "@/components/site/blocks/BlockRenderer";
import { ServiceCard } from "./ServiceCard";
import type { Locale } from "@/i18n/routing";

/**
 * Virtual /services/<category> page. Zero active services still renders the
 * hero, description, and CTA — never an empty grid.
 */
export function ServiceCategoryPage({
  category,
  services,
  ctaBlock,
  siteSlug,
  currency,
  currencyLocale,
}: {
  category: PublicServiceCategory;
  services: PublicServiceItem[];
  ctaBlock: CtaBannerBlock | null;
  siteSlug: string;
  currency: string;
  currencyLocale: Locale;
}) {
  const safeImg = category.image_url ? safeImageSrc(category.image_url) : "";

  return (
    <div className="w-full">
      <section className="mx-auto w-full max-w-6xl px-6 py-[var(--ps-space-16)]">
        <div className="flex flex-col items-center text-center">
          <h1 className="font-[var(--v2-heading-font)] text-4xl font-bold text-[var(--ps-text)]">{category.title}</h1>
          {category.tagline && <p className="mt-[var(--ps-space-3)] text-lg text-[var(--ps-muted)]">{category.tagline}</p>}
          {category.description && (
            <p className="mt-[var(--ps-space-4)] max-w-2xl text-base text-[var(--ps-muted)]">{category.description}</p>
          )}
        </div>
        {safeImg && (
          <div className="mt-[var(--ps-space-8)] aspect-[16/7] w-full overflow-hidden rounded-xl bg-[var(--ps-neutral)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={safeImg} alt={category.title} className="h-full w-full object-cover" loading="lazy" />
          </div>
        )}
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-[var(--ps-space-16)]">
        {services.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--ps-border)] p-[var(--ps-space-8)] text-center text-sm text-[var(--ps-muted)]">
            No services in this category yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-[var(--ps-space-6)] sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                href={getSiteSegmentsHref(siteSlug, buildServicePath(service, category))}
                currency={currency}
                currencyLocale={currencyLocale}
              />
            ))}
          </div>
        )}
      </section>

      {ctaBlock && <CtaBannerBlockRenderer block={ctaBlock} siteSlug={siteSlug} scopeInternalLinks />}
    </div>
  );
}
