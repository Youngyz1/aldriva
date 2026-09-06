import React from "react";
import { getRelatedArticles, getAuthorProfileMap, type ArticleRow } from "@/lib/articles-data";
import ArticleCard from "@/components/ArticleCard";

interface ArticleRelatedSectionProps {
  currentArticleId: string;
  categories: string[];
}

export default async function ArticleRelatedSection({
  currentArticleId,
  categories,
}: ArticleRelatedSectionProps) {
  const relatedArticles = await getRelatedArticles(currentArticleId, categories, 3);
  if (!relatedArticles || relatedArticles.length === 0) return null;

  const authorMap = await getAuthorProfileMap(relatedArticles.map((a) => a.owner_id));

  return (
    <section className="mt-16 border-t border-zinc-150 pt-12">
      <div className="mb-8">
        <p className="text-xs font-black uppercase tracking-widest text-orange-600">More to Explore</p>
        <h3 className="mt-1 text-2xl font-black text-zinc-950">Related Stories</h3>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {relatedArticles.map((article) => {
          const author = authorMap.get(article.owner_id);
          return (
            <ArticleCard
              key={article.id}
              title={article.title}
              excerpt={article.excerpt}
              coverImage={article.cover_image_url}
              slug={article.slug}
              categories={article.categories ?? []}
              tags={article.tags ?? []}
              readingTime={article.reading_time}
              publishedAt={article.published_at}
              createdAt={article.created_at}
              author={{
                name: author?.display_name || "Community Author",
                avatarUrl: author?.avatar_url ?? null,
              }}
              showActions
            />
          );
        })}
      </div>
    </section>
  );
}
