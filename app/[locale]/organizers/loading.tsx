export default function OrganizersLoading() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 pb-16">
      {/* Hero skeleton — sized to match OrganizersHero's min-h to avoid layout shift */}
      <div className="min-h-[360px] w-full animate-pulse bg-zinc-200 sm:min-h-[420px] lg:min-h-[460px]" />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        <div className="mb-8 border-b border-zinc-200 pb-6">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">Search Directory</h2>
            <p className="text-sm font-medium text-zinc-500 mt-1 font-bold">Discover creators by name, verified status, or events hosted.</p>
          </div>
          <div className="mt-6 h-11 w-full max-w-xl animate-pulse rounded-xl bg-zinc-100" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-zinc-100">
              <div className="aspect-video w-full animate-pulse bg-zinc-100" />
              <div className="space-y-2 p-5">
                <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
