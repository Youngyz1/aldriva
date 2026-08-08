import Image from "next/image";
import { cacheLife } from "next/cache";
import { getTopWriters } from "@/lib/articles-data";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";
import FollowButton from "@/components/articles/FollowButton";

export default async function TopWriters() {
  "use cache";
  cacheLife({ revalidate: 300 });

  const writers = await getTopWriters(6);
  if (writers.length === 0) return null;

  return (
    <section className="bg-zinc-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 sm:mb-10">
          <p className="text-xs font-black uppercase tracking-widest text-orange-600">Meet the Creators</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-4xl">Top Writers</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {writers.map(({ author, articleCount }) => {
            const name = author.display_name || "Community Author";
            return (
              <div
                key={author.id}
                className="flex items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                {author.avatar_url ? (
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full">
                    <Image src={author.avatar_url} alt={name} fill sizes="56px" className="object-cover" />
                  </div>
                ) : (
                  <LocalBrandedPlaceholder
                    variant="avatar"
                    title={name}
                    initials={name.slice(0, 2).toUpperCase()}
                    className="h-14 w-14 shrink-0 rounded-full from-orange-600 to-orange-600 text-base"
                  />
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-zinc-950">{name}</p>
                  <p className="text-xs font-semibold text-zinc-500">
                    {articleCount} published {articleCount === 1 ? "article" : "articles"}
                  </p>
                </div>

                <FollowButton authorId={author.id} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
