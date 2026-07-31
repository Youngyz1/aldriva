import Link from "next/link";
import { cn } from "@/lib/utils";

type PublicPaginationProps = {
  currentPage: number;
  totalPages: number;
  buildHref: (page: number) => string;
  className?: string;
};

export default function PublicPagination({
  currentPage,
  totalPages,
  buildHref,
  className,
}: PublicPaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
  );

  return (
    <nav
      aria-label="Pagination"
      className={cn("mt-10 flex items-center justify-center gap-1", className)}
    >
      {currentPage > 1 && (
        <Link
          href={buildHref(currentPage - 1)}
          className="rounded-lg px-3 py-2 text-sm font-bold text-zinc-600 transition hover:bg-zinc-100 hover:text-orange-600"
        >
          Previous
        </Link>
      )}
      {pages.map((page, index) => {
        const prev = pages[index - 1];
        const showEllipsis = prev !== undefined && page - prev > 1;

        return (
          <span key={page} className="flex items-center gap-1">
            {showEllipsis && <span className="px-2 text-zinc-400">…</span>}
            <Link
              href={buildHref(page)}
              aria-current={page === currentPage ? "page" : undefined}
              className={cn(
                "min-w-[2.25rem] rounded-lg px-3 py-2 text-center text-sm font-black transition",
                page === currentPage
                  ? "bg-orange-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-orange-600"
              )}
            >
              {page}
            </Link>
          </span>
        );
      })}
      {currentPage < totalPages && (
        <Link
          href={buildHref(currentPage + 1)}
          className="rounded-lg px-3 py-2 text-sm font-bold text-zinc-600 transition hover:bg-zinc-100 hover:text-orange-600"
        >
          Next
        </Link>
      )}
    </nav>
  );
}
