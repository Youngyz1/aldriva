import Link from "next/link";
import { IconArrowRight } from "@tabler/icons-react";
import { safeImageSrc } from "@/lib/image-url";

export interface CategoryTileData {
  id: string;
  name: string;
  count: number;
  /** First item's photo — there is no owner-settable category image yet. */
  image: string | null;
}

export interface CategoryTilesProps {
  categories: CategoryTileData[];
  catalogHref: string;
  heading: string;
  itemCountLabel: (count: number) => string;
  arrowLabel: string;
}

/**
 * "Browse by category" tiles: one per catalog category, linking to the
 * catalog filtered to that section (?section=<id>, the same deep-link
 * StorefrontBrowse already supports for favourites/search). Hidden entirely
 * with only one category — nothing to browse by.
 */
export function CategoryTiles({ categories, catalogHref, heading, itemCountLabel, arrowLabel }: CategoryTilesProps) {
  if (categories.length <= 1) return null;

  return (
    <div className="mx-auto max-w-[1280px]">
      <h2 className="showcase-section-title mb-[var(--ps-space-4)] text-[18px] font-semibold leading-[1.25] text-[var(--tf-ink)] sm:text-[22px]">
        {heading}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {categories.map((category) => {
          const safeImage = category.image ? safeImageSrc(category.image) : null;
          return (
            <Link
              key={category.id}
              href={`${catalogHref}?section=${encodeURIComponent(category.id)}`}
              className="group relative block aspect-[4/3] overflow-hidden rounded-2xl bg-[var(--tf-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
            >
              {safeImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={safeImage}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
              ) : null}
              {safeImage ? (
                <div
                  aria-hidden="true"
                  className="absolute inset-0"
                  style={{
                    backgroundImage: "linear-gradient(to top, rgba(var(--tf-scrim-rgb), 0.78) 0%, rgba(var(--tf-scrim-rgb), 0.35) 45%, transparent 72%)",
                  }}
                />
              ) : null}
              <div className={`absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3 ${safeImage ? "text-[var(--tf-on-scrim)]" : "text-[var(--tf-ink)]"}`}>
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold leading-tight">{category.name}</p>
                  <p className="text-xs opacity-85">{itemCountLabel(category.count)}</p>
                </div>
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--tf-card)] text-[var(--tf-ink)]"
                >
                  <IconArrowRight size={16} aria-label={arrowLabel} />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
