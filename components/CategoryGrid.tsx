import Link from "next/link";
import type { CategoryChip } from "@/lib/category-chips";

/**
 * Category chip grid linking to /events?category=X. Shared by the homepage
 * and /events so both read from the same category list (lib/category-chips)
 * rather than maintaining two copies.
 */
export default function CategoryGrid({ categories }: { categories: CategoryChip[] }) {
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-4 gap-x-3 gap-y-5 py-8 sm:gap-6 sm:py-12 lg:grid-cols-8">
      {categories.map(({ name, icon: Icon }) => (
        <Link
          key={name}
          href={`/events?category=${encodeURIComponent(name)}`}
          className="group flex flex-col items-center text-center"
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-indigo-100 bg-white text-zinc-600 transition group-hover:border-orange-200 group-hover:text-orange-600 sm:h-20 sm:w-20 lg:h-24 lg:w-24">
            <Icon className="h-6 w-6 sm:h-8 sm:w-8 lg:h-9 lg:w-9" strokeWidth={1.6} />
          </span>
          <span className="mt-2 text-[11px] font-bold leading-tight text-zinc-950 sm:mt-3 sm:text-sm">{name}</span>
        </Link>
      ))}
    </div>
  );
}
