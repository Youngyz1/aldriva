/**
 * Loading skeletons for the admin Overview sections. Each matches its
 * section's final dimensions so streaming in content does not shift layout.
 */

function Pulse({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-zinc-200/70 ${className}`}
    />
  );
}

export function SectionTitleSkeleton() {
  return <Pulse className="h-5 w-32" />;
}

export function FiguresSkeleton() {
  return (
    <>
      <section aria-label="Loading key figures">
        <SectionTitleSkeleton />
        <div className="mt-4 grid grid-cols-2 gap-6 lg:grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Pulse className="h-4 w-20" />
              <Pulse className="h-10 w-28" />
              <Pulse className="h-4 w-24" />
              <Pulse className="h-8 w-24" />
            </div>
          ))}
        </div>
      </section>
      {/* The volume chart streams in the same boundary; reserve its slot so
          nothing below shifts when it resolves. */}
      <section aria-label="Loading volume chart" className="mt-10">
        <SectionTitleSkeleton />
        <Pulse className="mt-4 h-[320px] min-h-[320px] w-full" />
      </section>
    </>
  );
}

export function GlanceSkeleton() {
  return (
    <section aria-label="Loading platform at a glance">
      <SectionTitleSkeleton />
      <div className="mt-2 space-y-0">
        {Array.from({ length: 11 }, (_, i) => (
          <div key={i} className="border-b border-zinc-200 py-3 last:border-b-0">
            <Pulse className="h-5 w-64 max-w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function AttentionSkeleton() {
  return (
    <section aria-label="Loading needs attention">
      <SectionTitleSkeleton />
      <div className="mt-4 space-y-0">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="border-b border-zinc-200 py-3 first:border-t">
            <Pulse className="h-5 w-56 max-w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function RecentSkeleton() {
  return (
    <section aria-label="Loading recent submissions">
      <SectionTitleSkeleton />
      <div className="mt-4 space-y-0">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="border-b border-zinc-200 py-2.5 first:border-t">
            <Pulse className="h-5 w-72 max-w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function TopListsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-10 sm:grid-cols-2">
      {[0, 1].map((col) => (
        <section key={col} aria-label="Loading list">
          <SectionTitleSkeleton />
          <div className="mt-4 space-y-0">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="border-b border-zinc-200 py-2.5 first:border-t">
                <Pulse className="h-5 w-48 max-w-full" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
