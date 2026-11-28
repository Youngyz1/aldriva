import Link from "next/link";
import { IconNews as Newspaper, IconArrowRight as ArrowRight } from "@tabler/icons-react";
import { AccountBlockRow } from "./AccountBlockRow";
import type { ArticleItem } from "@/lib/dashboard/account-blocks-registry";

interface ArticlesBlockProps {
  articles: ArticleItem[];
}

export function ArticlesBlock({ articles }: ArticlesBlockProps) {
  if (articles.length === 0) return null;

  const showViewAll = articles.length > 3;
  const displayedArticles = articles.slice(0, 3);

  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white p-4 sm:p-5">
      <header className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200/80 bg-zinc-50 text-zinc-700">
            <Newspaper className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-black text-zinc-950">Articles</h2>
            <p className="text-xs text-zinc-500">Editorial stories and announcements</p>
          </div>
        </div>

        {showViewAll && (
          <Link
            href="/dashboard/articles"
            className="flex min-h-[44px] items-center gap-1 text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline transition"
          >
            <span>View all ({articles.length})</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>

      <div className="divide-y divide-zinc-100 pt-1">
        {displayedArticles.map((a) => (
          <AccountBlockRow
            key={a.id}
            id={a.id}
            title={a.title || "Untitled Article"}
            status={a.status}
            createdAt={a.created_at}
            href={a.href}
            actionLabel="Edit"
          />
        ))}
      </div>
    </section>
  );
}
