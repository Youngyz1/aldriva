// Mirrors OrganizationProfileClient's real DOM shape (max-w-6xl shell,
// avatar/name header, lg:grid-cols-[288px_1fr] sidebar+content split, pill
// tab bar, campaign rows) so the skeleton is stable and top-anchored. Same
// rationale as app/fundraisers/[slug]/loading.tsx: without a route-specific
// loading boundary, the transition blocks on the full server response and
// the old page's scroll position stays frozen until the whole new page
// commits at once — this skeleton lets the router commit almost instantly
// instead, so Next's scroll-to-top correction fires against a short, empty
// page rather than a long-delayed one.

function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-zinc-100 ${className}`} />;
}

function CampaignRowSkeleton() {
  return (
    <div className="flex gap-4 rounded-xl border border-zinc-100 p-3">
      <Block className="h-16 w-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 space-y-2">
        <Block className="h-4 w-3/4" />
        <Block className="h-1.5 w-full rounded-full" />
        <Block className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export default function OrganizationProfileLoading() {
  return (
    <main className="min-h-screen bg-white px-4 py-6 text-zinc-950 sm:py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header — avatar, name, badges, actions (mirrors ProfileHeader) */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
          <Block className="h-20 w-20 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Block className="h-5 w-24 rounded-full" />
            <Block className="h-7 w-64" />
            <Block className="h-4 w-48" />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:shrink-0">
            <Block className="h-10 w-24 rounded-xl" />
            <Block className="h-10 w-24 rounded-xl" />
            <Block className="h-10 w-28 rounded-xl" />
          </div>
        </div>

        <div className="mt-8 grid gap-8 border-t border-zinc-200 pt-8 lg:grid-cols-[288px_1fr]">
          {/* Sidebar — desktop only, mirrors ProfileSidebar */}
          <aside className="hidden space-y-5 lg:block lg:border-r lg:border-zinc-200 lg:pr-8">
            <div className="space-y-4">
              <Block className="h-3 w-16" />
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Block className="h-4 w-20" />
                  <Block className="h-4 w-10" />
                </div>
              ))}
            </div>
          </aside>

          {/* Main column */}
          <div className="min-w-0 space-y-6">
            {/* Mobile metrics strip — mirrors ProfileMetrics layout="strip" */}
            <div className="grid grid-cols-2 gap-3 lg:hidden">
              <Block className="h-16 w-full rounded-xl" />
              <Block className="h-16 w-full rounded-xl" />
            </div>

            {/* Tab bar — mirrors ProfileTabs */}
            <Block className="h-11 w-full rounded-full sm:w-96" />

            {/* About text */}
            <div className="space-y-2">
              <Block className="h-4 w-full" />
              <Block className="h-4 w-2/3" />
            </div>

            {/* Top campaigns */}
            <div className="space-y-3">
              <CampaignRowSkeleton />
              <CampaignRowSkeleton />
              <CampaignRowSkeleton />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
