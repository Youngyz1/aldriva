export default function LatestArticlesSkeleton() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mb-8 sm:mb-10">
        <div className="h-3 w-24 animate-pulse rounded-full bg-zinc-100" />
        <div className="mt-3 h-9 w-64 animate-pulse rounded-lg bg-zinc-100" />
      </div>

      <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="mb-6 break-inside-avoid overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="h-44 w-full animate-pulse bg-zinc-100 sm:h-52" />
            <div className="space-y-3 p-4">
              <div className="h-3 w-1/3 animate-pulse rounded-full bg-zinc-100" />
              <div className="h-4 w-full animate-pulse rounded bg-zinc-100" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
