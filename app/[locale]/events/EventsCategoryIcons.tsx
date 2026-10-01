import CategoryGrid from "@/components/CategoryGrid";
import { getCategoryChips } from "@/lib/category-chips";
import { cacheLife } from "next/cache";

/**
 * Category chip row — shared with the homepage, admin-managed, same for
 * every visitor regardless of filters. Homepage-only (app/events/page.tsx
 * passes showCategoryIcons; city pages don't), part of the static shell.
 */
export default async function EventsCategoryIcons() {
  "use cache";
  cacheLife({ revalidate: 300 });

  const categories = await getCategoryChips();

  return (
    <section className="bg-white px-3 sm:px-6 lg:px-8">
      <CategoryGrid categories={categories} />
    </section>
  );
}
