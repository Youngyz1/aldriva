"use client";

import { Bookmark, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocalArticleActions } from "@/hooks/use-local-article-actions";

/**
 * Like + bookmark toggle buttons for an article card. Local-only (see
 * hooks/use-local-article-actions.ts) — isolated into its own client
 * component so the rest of ArticleCard stays a server component.
 */
export default function ArticleCardActions({ articleSlug }: { articleSlug: string }) {
  const { liked, bookmarked, toggleLike, toggleBookmark } = useLocalArticleActions(articleSlug);

  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          toggleLike();
        }}
        aria-pressed={liked}
        aria-label={liked ? "Unlike this article" : "Like this article"}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border transition",
          liked
            ? "border-orange-200 bg-orange-50 text-orange-600"
            : "border-zinc-200 bg-white text-zinc-400 hover:border-orange-200 hover:text-orange-500"
        )}
      >
        <Heart className={cn("h-4 w-4", liked && "fill-orange-500")} />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          toggleBookmark();
        }}
        aria-pressed={bookmarked}
        aria-label={bookmarked ? "Remove bookmark" : "Bookmark this article"}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full border transition",
          bookmarked
            ? "border-orange-200 bg-orange-50 text-orange-600"
            : "border-zinc-200 bg-white text-zinc-400 hover:border-orange-200 hover:text-orange-500"
        )}
      >
        <Bookmark className={cn("h-4 w-4", bookmarked && "fill-orange-500")} />
      </button>
    </div>
  );
}
