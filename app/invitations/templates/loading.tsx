export default function InvitationTemplatesGalleryLoading() {
  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-10 md:px-6">
      <div className="mb-8 max-w-2xl space-y-2">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-4 w-full animate-pulse rounded-lg bg-zinc-100" />
      </div>
      <div className="mb-8 flex gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-9 w-24 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border border-zinc-200">
            <div className="aspect-[3/4] animate-pulse bg-zinc-100" />
            <div className="space-y-2 p-4">
              <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
              <div className="h-4 w-32 animate-pulse rounded bg-zinc-100" />
              <div className="h-3 w-full animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
