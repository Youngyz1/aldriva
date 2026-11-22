import Link from "next/link";
import { IconCheck as Check } from "@tabler/icons-react";
import { safeImageSrc } from "@/lib/image-url";
import { formatMoney as formatCurrency, isPriceEmpty } from "@/lib/money";
import { getSiteSegmentsHref } from "@/lib/site-paths";
import { buildServicePath } from "@/lib/services-route-resolver";
import type { PublicServiceCategory, PublicServiceItem } from "@/lib/services-public-data";
import { ServiceCard } from "./ServiceCard";
import type { Locale } from "@/i18n/routing";

/** Virtual /services/<service> (or /services/<category>/<service>) page. */
export function ServiceDetailPage({
  service,
  related,
  relatedCategoriesById,
  bookHref,
  bookLabel,
  siteSlug,
  currency,
  currencyLocale,
}: {
  service: PublicServiceItem;
  related: PublicServiceItem[];
  /** Lookup for each related item's own category (may differ from `category`), used to build its correct path. */
  relatedCategoriesById: Map<string, PublicServiceCategory>;
  bookHref: string | null;
  bookLabel: string;
  siteSlug: string;
  currency: string;
  currencyLocale: Locale;
}) {
  const heroSrc = safeImageSrc(service.hero_image_url || service.image_url || "");
  const locale: Locale = currencyLocale === "fr" ? "fr" : "en";
  const includes = service.includes.filter((item) => item.trim());

  return (
    <div className="w-full">
      <section className="mx-auto w-full max-w-5xl px-6 py-[var(--ps-space-16)]">
        <div className="grid grid-cols-1 gap-[var(--ps-space-10)] md:grid-cols-2 md:items-center">
          <div>
            <h1 className="font-[var(--v2-heading-font)] text-3xl font-bold text-[var(--ps-text)] sm:text-4xl">{service.title}</h1>
            {service.summary && <p className="mt-[var(--ps-space-3)] text-lg text-[var(--ps-muted)]">{service.summary}</p>}
            {service.description && <p className="mt-[var(--ps-space-4)] text-base leading-7 text-[var(--ps-muted)]">{service.description}</p>}

            {includes.length > 0 && (
              <ul className="mt-[var(--ps-space-6)] flex flex-col gap-[var(--ps-space-2)]">
                {includes.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-[var(--ps-space-2)] text-sm text-[var(--ps-text)]">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--ps-accent)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-[var(--ps-space-6)] flex items-center gap-[var(--ps-space-4)]">
              {!isPriceEmpty(service.price) && (
                <span className="text-lg font-bold text-[var(--ps-text)]">
                  {formatCurrency(service.price, currency, locale)}
                </span>
              )}
              {service.duration_minutes != null && service.duration_minutes > 0 && (
                <span className="text-sm text-[var(--ps-muted)]">{service.duration_minutes} min</span>
              )}
            </div>

            {bookHref && (
              <div className="mt-[var(--ps-space-8)]">
                <Link
                  href={bookHref}
                  className="ps-button ps-button-primary inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--ps-accent)] px-6 py-3 text-sm font-semibold text-[var(--ps-accent-foreground)]"
                >
                  {bookLabel}
                </Link>
              </div>
            )}
          </div>

          <div className="aspect-4/3 w-full overflow-hidden rounded-xl bg-[var(--ps-neutral)]">
            {heroSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={heroSrc} alt={service.title} className="h-full w-full object-cover" loading="lazy" />
            ) : null}
          </div>
        </div>
      </section>

      {related.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-6 pb-[var(--ps-space-16)]">
          <h2 className="mb-[var(--ps-space-6)] text-xl font-bold text-[var(--ps-text)]">Related services</h2>
          <div className="grid grid-cols-1 gap-[var(--ps-space-6)] sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => {
              const itemCategory = item.category_id ? relatedCategoriesById.get(item.category_id) ?? null : null;
              return (
                <ServiceCard
                  key={item.id}
                  service={item}
                  href={getSiteSegmentsHref(siteSlug, buildServicePath(item, itemCategory))}
                  currency={currency}
                  currencyLocale={currencyLocale}
                />
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
