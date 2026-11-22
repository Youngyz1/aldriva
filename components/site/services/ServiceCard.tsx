import Link from "next/link";
import { IconTag as Tag } from "@tabler/icons-react";
import { safeImageSrc } from "@/lib/image-url";
import { formatMoney as formatCurrency, isPriceEmpty } from "@/lib/money";
import type { Locale } from "@/i18n/routing";

export interface ServiceCardItem {
  id: string;
  title: string;
  summary?: string | null;
  description?: string | null;
  price: number | null;
  duration_minutes: number | null;
  image_url: string | null;
}

/**
 * Shared public-site service card: used by the /services index listing and
 * category pages. Always links to the service's detail path (unlike the
 * teaser services_embed block elsewhere, which stays unlinked/unchanged).
 */
export function ServiceCard({
  service,
  href,
  currency,
  currencyLocale,
}: {
  service: ServiceCardItem;
  href: string;
  currency: string;
  currencyLocale: Locale;
}) {
  const safeImg = service.image_url ? safeImageSrc(service.image_url) : "";
  const locale: Locale = currencyLocale === "fr" ? "fr" : "en";
  const blurb = service.summary || service.description;

  return (
    <Link
      href={href}
      className="flex flex-col overflow-hidden rounded-xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xs transition hover:border-[var(--ps-accent)]"
    >
      <div className="relative aspect-4/3 w-full bg-[var(--ps-neutral)]">
        {safeImg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={safeImg} alt={service.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--ps-muted)]">
            <Tag className="h-8 w-8" />
          </div>
        )}
      </div>
      <div className="p-[var(--ps-space-6)]">
        <h3 className="text-base font-bold text-[var(--ps-text)]">{service.title}</h3>
        {blurb && <p className="mt-[var(--ps-space-1)] text-xs text-[var(--ps-muted)] line-clamp-2">{blurb}</p>}
        <div className="mt-[var(--ps-space-3)] flex items-center justify-between">
          {!isPriceEmpty(service.price) && (
            <span className="text-sm font-bold text-[var(--ps-text)]">
              {formatCurrency(service.price, currency, locale)}
            </span>
          )}
          {service.duration_minutes != null && service.duration_minutes > 0 && (
            <span className="text-xs text-[var(--ps-muted)]">{service.duration_minutes} min</span>
          )}
        </div>
      </div>
    </Link>
  );
}
