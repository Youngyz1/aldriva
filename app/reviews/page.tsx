import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import ReviewSection from "@/components/ReviewSection";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: "Reviews — Aldriva",
  description: "See what people are saying about Aldriva.",
  alternates: {
    canonical: `${getSiteUrl()}/reviews`,
  },
  openGraph: {
    title: "Reviews — Aldriva",
    description: "See what people are saying about Aldriva.",
    url: `${getSiteUrl()}/reviews`,
    siteName: "Aldriva",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Aldriva Reviews" }],
  },
  twitter: { card: "summary_large_image", images: ["/og-image.png"] },
};

export default function PlatformReviewsPage() {
  return (
    <main className="min-h-screen bg-zinc-50/50 py-10 sm:py-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <header className="mb-10 text-center sm:mb-14">
          <p className="text-xs font-black uppercase tracking-widest text-violet-600">
            Reviews
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-zinc-950 sm:text-5xl">
            Community Feedback
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium text-zinc-500 sm:text-base">
            Tell us about your experience with ease of use, fundraising, ticketing, and support on Aldriva.
          </p>
        </header>

        {/* Reviews Section widget configured for platform reviews */}
        <div className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-sm sm:p-10">
          <ReviewSection
            targetType="platform"
            targetId="platform"
            accentColor="violet"
          />
        </div>

      </div>
    </main>
  );
}
