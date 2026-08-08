import Link from "next/link";
import { PenSquare } from "lucide-react";
import { cacheLife } from "next/cache";
import { getDistinctArticleCategories } from "@/lib/articles-data";
import CategoriesDropdown from "@/components/articles/CategoriesDropdown";

/**
 * Content-specific sticky sub-nav for the Articles hub. The global <Navbar/>
 * (root layout) already provides the logo, search, notifications, and
 * account avatar site-wide — duplicating those here would just stack two
 * near-identical bars. This adds only what's genuinely specific to Articles:
 * a categories dropdown and the "Write Article" entry point. Sticks directly
 * beneath the global nav (top-16 matches Navbar's h-16).
 */
export default async function ArticlesSubNav() {
  "use cache";
  cacheLife({ revalidate: 300 });

  const categories = await getDistinctArticleCategories();

  return (
    <div className="sticky top-16 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-6">
          <span className="hidden text-sm font-black text-zinc-950 sm:inline">Articles</span>
          {categories.length > 0 && <CategoriesDropdown categories={categories} />}
        </div>

        <Link
          href="/dashboard/articles/new"
          className="btn-ripple inline-flex items-center gap-1.5 rounded-full bg-orange-600 px-4 py-2 text-xs font-black text-white transition hover:bg-orange-700 sm:text-sm"
        >
          <PenSquare className="h-3.5 w-3.5" />
          Write Article
        </Link>
      </div>
    </div>
  );
}
