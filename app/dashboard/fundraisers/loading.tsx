// app/dashboard/fundraisers/loading.tsx — Fundraiser cards skeleton
export default function FundraisersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <div className="space-y-2">
          <div className="h-2.5 w-16 rounded bg-zinc-200" />
          <div className="h-7 w-32 rounded bg-zinc-200" />
          <div className="h-2.5 w-56 rounded bg-zinc-200" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-zinc-200" />
      </div>
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm sm:p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-zinc-200/60 bg-zinc-50/60 p-5">
            <div className="h-4 w-48 rounded bg-zinc-200" />
            <div className="mt-3 flex gap-8">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <div className="h-2 w-12 rounded bg-zinc-200" />
                  <div className="h-4 w-16 rounded bg-zinc-200" />
                </div>
              ))}
            </div>
            <div className="mt-4 h-2.5 w-full rounded-full bg-zinc-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
