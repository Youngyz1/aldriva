import { getTranslations } from "next-intl/server";
import { resolveSiteHref } from "@/lib/site-paths";
import { ShowcaseSearchBar } from "./ShowcaseSearchBar";

/**
 * Search field ABOVE the hero, inside the shared Home container, with the
 * filter control merged into its right end. Server wrapper resolves i18n
 * and the catalog href; ShowcaseSearchBar (client) owns the open/close sheet
 * state.
 */
export async function ShowcaseHomeSearch({
  siteSlug,
}: {
  siteSlug?: string;
}) {
  const t = await getTranslations("Storefront");
  const catalogHref = siteSlug ? resolveSiteHref(siteSlug, "menu") : "/menu";

  return (
    <div className="w-full mx-auto max-w-[1280px] px-5 sm:px-6 py-4 sm:py-6">
      <ShowcaseSearchBar
        catalogHref={catalogHref}
        searchPlaceholder={t("searchPlaceholder")}
        searchAriaLabel={t("searchLabel")}
        filterAriaLabel={t("filterLabel")}
        sortLabel={t("sortLabel")}
        sortOptions={[
          { value: "featured", label: t("sortFeatured") },
          { value: "newest", label: t("sortNewest") },
          { value: "priceAsc", label: t("sortPriceAsc") },
          { value: "priceDesc", label: t("sortPriceDesc") },
        ]}
      />
    </div>
  );
}
