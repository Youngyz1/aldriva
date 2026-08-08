import { Suspense } from "react";
import { getSiteUrl } from "@/lib/site-url";
import OrganizersHero from "@/app/organizers/OrganizersHero";
import OrganizersDirectory, {
  type OrganizersPageFilters,
} from "@/app/organizers/OrganizersDirectory";
import type { Metadata } from "next";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Organizations — Aldriva",
  description: "Discover organizations and causes on Aldriva.",
  alternates: {
    canonical: `${getSiteUrl()}/organizers`,
  },
  openGraph: {
    title: "Organizations — Aldriva",
    description: "Discover organizations and causes on Aldriva.",
    url: `${getSiteUrl()}/organizers`,
    siteName: "Aldriva",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Aldriva Organizations" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
};

// Fallback for OrganizersDirectory — the "Search Directory" heading (no
// filter dependency of its own, but lives inside the boundary — see the
// comment on OrganizersDirectory) plus a skeleton for the search input and
// result cards, so resolving the filter-dependent listing doesn't shift
// layout.
function OrganizersDirectoryFallback() {
  return (
    <div>
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
  );
}

export default function OrganizersDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<OrganizersPageFilters>;
}) {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950 pb-16">
      {/* ── Hero: CMS-managed copy + site-wide stats, same for every visitor
          regardless of filters — cached, part of the instant static shell. ── */}
      <OrganizersHero />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {/* ── The one genuinely per-request piece of this page: featured
            picks, the main directory listing, and pagination all depend on
            searchParams (search/status/sort/page). ── */}
        <Suspense fallback={<OrganizersDirectoryFallback />}>
          <OrganizersDirectory filters={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
