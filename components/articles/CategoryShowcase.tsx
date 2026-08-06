import Link from "next/link";
import { cacheLife } from "next/cache";
import { getDistinctArticleCategories } from "@/lib/articles-data";
import { getCategoryStyle } from "@/lib/article-category-style";

export default async function CategoryShowcase() {
  "use cache";
  cacheLife({ revalidate: 300 });

  const categories = await getDistinctArticleCategories();
  if (categories.length === 0) return null;

  return (
    <section className="bg-zinc-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 text-center sm:mb-10">
          <p className="text-xs font-black uppercase tracking-widest text-orange-600">Explore</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">Browse by Category</h2>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-6">
          {categories.map((category) => {
            const { icon: Icon, gradient } = getCategoryStyle(category);
            return (
              <Link
                key={category}
                href={`/articles?category=${encodeURIComponent(category)}#latest-articles`}
                className={`group relative flex flex-col items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-br ${gradient} px-4 py-7 text-center shadow-md transition hover:-translate-y-1 hover:shadow-xl`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur transition group-hover:scale-110 sm:h-14 sm:w-14">
                  <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={1.8} />
                </span>
                <span className="text-sm font-black text-white sm:text-base">{category}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
