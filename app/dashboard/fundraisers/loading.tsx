// app/dashboard/fundraisers/loading.tsx — Fundraiser cards skeleton
export default function FundraisersLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header — open skeleton mirroring the open page header. Card skeletons below mirror kept entity cards. */}
      <div className="flex items-center justify-between pb-1">
        <div className="space-y-2">
          <div className="h-2.5 w-16 rounded bg-zinc-200" />
          <div className="h-7 w-32 rounded bg-zinc-200" />
          <div className="h-2.5 w-56 rounded bg-zinc-200" />
        </div>
        <div className="h-10 w-36 rounded-xl bg-zinc-200" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-t border-zinc-200 pt-4 first:border-0 first:pt-0">
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
