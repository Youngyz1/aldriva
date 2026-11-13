import Link from "next/link";
import { IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { getSiteSegmentsHref } from "@/lib/site-paths";
import { buildCategoryPath, type ServiceRouteCategory } from "@/lib/services-route-resolver";
import type { PublicServiceCategory, PublicServiceItem } from "@/lib/services-public-data";
import { ServiceCard } from "./ServiceCard";
import type { Locale } from "@/i18n/routing";

/**
 * The /services page listing: unchanged services_embed card grid when there
 * are no categories, otherwise category links (title + link to its page)
 * followed by uncategorized services as cards — per the services_embed
 * teaser elsewhere, which stays unlinked and ungrouped.
 */
export function ServicesIndexSection({
  heading,
  subheading,
  siteSlug,
  categories,
  uncategorizedServices,
  currency,
  currencyLocale,
}: {
  heading?: string;
  subheading?: string;
  siteSlug: string;
  categories: PublicServiceCategory[];
  uncategorizedServices: PublicServiceItem[];
  currency: string;
  currencyLocale: Locale;
}) {
  const isEmpty = categories.length === 0 && uncategorizedServices.length === 0;

  return (
    <section className="w-full">
      {(heading || subheading) && (
        <div className="mb-[var(--ps-space-12)] flex flex-col items-center text-center">
          {heading && <h2 className="font-[var(--v2-heading-font)] text-3xl font-bold text-[var(--ps-text)]">{heading}</h2>}
          {subheading && <p className="mt-[var(--ps-space-3)] max-w-2xl text-base text-[var(--ps-muted)]">{subheading}</p>}
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-[var(--ps-border)] p-[var(--ps-space-8)] text-center text-sm text-[var(--ps-muted)]">
          No services available at this time.
        </div>
      ) : (
        <div className="flex flex-col gap-[var(--ps-space-8)]">
          {categories.length > 0 && (
            <div className="flex flex-col gap-[var(--ps-space-4)]">
              {categories.map((category: ServiceRouteCategory & { title: string; tagline: string | null }) => (
                <Link
                  key={category.id}
                  href={getSiteSegmentsHref(siteSlug, buildCategoryPath(category))}
                  className="flex items-center justify-between rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] p-[var(--ps-space-6)] shadow-xs transition hover:border-[var(--ps-accent)]"
                >
                  <div>
                    <h3 className="text-base font-bold text-[var(--ps-text)]">{category.title}</h3>
                    {category.tagline && <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)]">{category.tagline}</p>}
                  </div>
                  <ArrowRight className="h-5 w-5 shrink-0 text-[var(--ps-muted)]" />
                </Link>
              ))}
            </div>
          )}

          {uncategorizedServices.length > 0 && (
            <div className="grid grid-cols-1 gap-[var(--ps-space-6)] sm:grid-cols-2 lg:grid-cols-3">
              {uncategorizedServices.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  href={getSiteSegmentsHref(siteSlug, ["services", service.slug])}
                  currency={currency}
                  currencyLocale={currencyLocale}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
