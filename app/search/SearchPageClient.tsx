"use client";

import { Search } from "lucide-react";

import { Suspense } from "react";
import PublicSearchBar from "@/components/public/PublicSearchBar";
import PublicPageHeader from "@/components/public/PublicPageHeader";
import PublicEmptyState from "@/components/public/PublicEmptyState";
import EventCard from "@/components/EventCard";
import FundraiserCard from "@/components/FundraiserCard";
import OrganizerCard from "@/components/public/OrganizerCard";
import ArticleCard from "@/components/ArticleCard";
import ExternalEventCard, { ExternalSourceCredit } from "@/components/events/ExternalEventCard";
import type { ExternalEvent } from "@/lib/external-events";
import Link from "next/link";

type SearchResultsProps = {
  query: string;
  events: Array<{
    id: string;
    title: string;
    slug: string;
    event_date: string | null;
    city: string | null;
    venue: string | null;
    banner: string | null;
    category: string | null;
  }>;
  fundraisers: Array<{
    id: string;
    title: string;
    slug: string;
    goal: number | null;
    raised: number | null;
    banner: string | null;
    category: string | null;
  }>;
  organizers: Array<{
    id: string;
    name: string;
    bio: string | null;
    photo: string | null;
    banner: string | null;
    status: string | null;
  }>;
  articles: Array<{
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    cover_image_url: string | null;
    categories: string[] | null;
    tags: string[] | null;
    reading_time: number | null;
    published_at: string | null;
    created_at: string;
  }>;
  products: Array<{
    id: string;
    name: string;
    slug: string;
    description: string;
    cover_image_url: string | null;
    images: string[] | null;
    product_type: string | null;
    category: string | null;
  }>;
  externalEvents: ExternalEvent[];
};

function SearchResultsContent({ query, events, fundraisers, organizers, articles = [], products = [], externalEvents }: SearchResultsProps) {
  const total = events.length + fundraisers.length + organizers.length + articles.length + products.length;
  const hasAnyResults = total > 0 || externalEvents.length > 0;

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <PublicPageHeader
          eyebrow="Search"
          title={query ? `Results for “${query}”` : "Search the platform"}
          description={
            query
              ? `${total} result${total === 1 ? "" : "s"} across events, fundraisers, stories, organizations, and products${
                  externalEvents.length > 0 ? ", plus events from other platforms" : ""
                }.`
              : "Find events near you, support causes, read stories, and discover organizers."
          }
        />

        <PublicSearchBar
          action="/search"
          defaultQuery={query}
          placeholder="Search events, fundraisers, organizers…"
          showLocation={false}
          className="mb-10 max-w-2xl"
        />

        {!hasAnyResults ? (
          <PublicEmptyState
            icon={<Search className="h-8 w-8" />}
            title={query ? `No results for "${query}"` : "Start searching"}
            description={
              query
                ? "Check spelling, try different keywords, or browse a section directly."
                : "Enter a keyword to search across the platform."
            }
            action={
              query
                ? { label: "Browse fundraisers", href: "/fundraisers" }
                : { label: "Browse events", href: "/events" }
            }
          />
        ) : (
          <div className="space-y-12">
            {events.length > 0 && (
              <section>
                <div className="mb-5 flex items-end justify-between">
                  <h2 className="text-xl font-black text-zinc-950">Events</h2>
                  <Link href={`/events?q=${encodeURIComponent(query)}`} className="text-sm font-bold text-orange-600 hover:text-orange-700">
                    View all →
                  </Link>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {events.map((event) => (
                    <EventCard
                      key={event.id}
                      slug={event.slug}
                      title={event.title}
                      date={
                        event.event_date
                          ? new Date(event.event_date).toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })
                          : "Date TBA"
                      }
                      eventDate={event.event_date}
                      location={event.city || event.venue || "Location TBA"}
                      image={
                        event.banner ||
                        "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1200&auto=format&fit=crop"
                      }
                      category={event.category}
                    />
                  ))}
                </div>
              </section>
            )}

            {externalEvents.length > 0 && (
              <section>
                <div className="mb-5">
                  <h2 className="text-xl font-black text-zinc-950">Events elsewhere</h2>
                  <p className="mt-1 text-sm font-medium text-zinc-500">
                    Live from other platforms — tickets are sold on the source site.
                  </p>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {externalEvents.map((event) => (
                    <ExternalEventCard key={event.id} event={event} />
                  ))}
                </div>
                <ExternalSourceCredit sources={externalEvents.map((e) => e.source)} />
              </section>
            )}

            {fundraisers.length > 0 && (
              <section>
                <div className="mb-5 flex items-end justify-between">
                  <h2 className="text-xl font-black text-zinc-950">Fundraisers</h2>
                  <Link href="/fundraisers" className="text-sm font-bold text-orange-600 hover:text-orange-700">
                    View all →
                  </Link>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {fundraisers.map((f) => (
                    <FundraiserCard
                      key={f.id}
                      slug={f.slug}
                      title={f.title}
                      raised={f.raised ?? 0}
                      goal={f.goal ?? 0}
                      image={
                        f.banner ||
                        "https://images.unsplash.com/photo-1529390079861-591de354faf5?q=80&w=1200&auto=format&fit=crop"
                      }
                      category={f.category}
                    />
                  ))}
                </div>
              </section>
            )}

            {organizers.length > 0 && (
              <section>
                <div className="mb-5 flex items-end justify-between">
                  <h2 className="text-xl font-black text-zinc-950">Organizations</h2>
                  <Link href={`/organizers?q=${encodeURIComponent(query)}`} className="text-sm font-bold text-orange-600 hover:text-orange-700">
                    View all →
                  </Link>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {organizers.map((org) => (
                    <OrganizerCard
                      key={org.id}
                      organizer={{
                        id: org.id,
                        name: org.name,
                        bio: org.bio,
                        photo: org.photo,
                        banner: org.banner,
                        status: org.status,
                      }}
                    />
                  ))}
                </div>
              </section>
            )}

            {products.length > 0 && (
              <section>
                <div className="mb-5 flex items-end justify-between">
                  <h2 className="text-xl font-black text-zinc-950">Shop Products</h2>
                  <Link href={`/products?q=${encodeURIComponent(query)}`} className="text-sm font-bold text-orange-600 hover:text-orange-700">
                    View all →
                  </Link>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {products.map((p) => {
                    const cover = p.cover_image_url || p.images?.[0];
                    return (
                      <Link
                        key={p.id}
                        href={`/products/${p.slug}`}
                        className="group rounded-2xl border border-zinc-200 bg-white p-5 transition hover:shadow-md"
                      >
                        {cover ? (
                          <img
                            src={cover}
                            alt={p.name}
                            className="mb-4 aspect-video w-full rounded-xl bg-slate-100 object-cover"
                            loading="lazy"
                          />
                        ) : null}
                        <p className="text-xs font-bold uppercase tracking-wider text-orange-600">
                          {p.product_type && p.product_type !== "other"
                            ? p.product_type.replace(/_/g, " ")
                            : "Shop"}
                          {p.category ? ` · ${p.category}` : ""}
                        </p>
                        <h3 className="mt-1 text-base font-black text-zinc-900 group-hover:text-orange-600 transition">
                          {p.name}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm font-semibold text-zinc-500">
                          {p.description}
                        </p>
                      </Link>
                    );
                  })}
                </div>
              </section>
            )}

            {articles.length > 0 && (
              <section>
                <div className="mb-5 flex items-end justify-between">
                  <h2 className="text-xl font-black text-zinc-950">Stories & Articles</h2>
                  <Link href="/articles" className="text-sm font-bold text-orange-600 hover:text-orange-700">
                    View all →
                  </Link>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {articles.map((art) => (
                    <ArticleCard
                      key={art.id}
                      title={art.title}
                      slug={art.slug}
                      excerpt={art.excerpt}
                      coverImage={art.cover_image_url}
                      categories={art.categories || []}
                      tags={art.tags || []}
                      readingTime={art.reading_time}
                      publishedAt={art.published_at}
                      createdAt={art.created_at}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

export default function SearchPageClient(props: SearchResultsProps) {
  return (
    <Suspense fallback={<main className="min-h-screen bg-zinc-50" />}>
      <SearchResultsContent {...props} />
    </Suspense>
  );
}
