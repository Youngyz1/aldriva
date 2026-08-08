import { Suspense } from "react";
import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";

import ArticlesSubNav from "@/components/articles/ArticlesSubNav";
import ArticlesHero from "@/components/articles/ArticlesHero";
import FeaturedArticles from "@/components/articles/FeaturedArticles";
import CategoryShowcase from "@/components/articles/CategoryShowcase";
import TrendingArticles from "@/components/articles/TrendingArticles";
import LatestArticlesSection, {
  type LatestArticlesFilters,
} from "@/components/articles/LatestArticlesSection";
import LatestArticlesSkeleton from "@/components/articles/LatestArticlesSkeleton";
import TopWriters from "@/components/articles/TopWriters";
import ArticlesNewsletter from "@/components/articles/ArticlesNewsletter";
import ArticlesWriteCTA from "@/components/articles/ArticlesWriteCTA";
import FadeInSection from "@/components/articles/FadeInSection";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Articles & Stories — Aldriva",
  description:
    "Discover stories that inspire change — insights, success stories, business ideas, fundraising journeys, technology, and community impact from creators around the world.",
  alternates: {
    canonical: `${getSiteUrl()}/articles`,
  },
  openGraph: {
    title: "Articles & Stories — Aldriva",
    description:
      "Discover stories that inspire change — insights, success stories, business ideas, fundraising journeys, technology, and community impact from creators around the world.",
    url: `${getSiteUrl()}/articles`,
    siteName: "Aldriva",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Aldriva Articles" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
};

export default function ArticlesLandingPage({
  searchParams,
}: {
  searchParams: Promise<LatestArticlesFilters>;
}) {
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <ArticlesSubNav />
      <ArticlesHero />

      <FadeInSection>
        <FeaturedArticles />
      </FadeInSection>
      <FadeInSection>
        <CategoryShowcase />
      </FadeInSection>
      <FadeInSection>
        <TrendingArticles />
      </FadeInSection>

      {/* The only piece of this page that reads request-time searchParams
          (search query, category filter, pagination) — everything else above
          and below is cached and instant. */}
      <FadeInSection>
        <Suspense fallback={<LatestArticlesSkeleton />}>
          <LatestArticlesSection searchParams={searchParams} />
        </Suspense>
      </FadeInSection>

      <FadeInSection>
        <TopWriters />
      </FadeInSection>
      <FadeInSection>
        <ArticlesNewsletter />
      </FadeInSection>
      <FadeInSection>
        <ArticlesWriteCTA />
      </FadeInSection>
    </main>
  );
}
