import { connection } from "next/server";
import { Plus_Jakarta_Sans } from "next/font/google";
import "../globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import { GoogleAnalytics } from "@next/third-parties/google";
import { rootMetadata, getWebsiteJsonLd } from "@/lib/root-metadata";

// Independent root layout (its own <html>/<body>) for routes that need a
// gate check — an auth/visibility lookup that must call notFound() BEFORE
// any bytes stream, to lock in a real 404 status.
//
// IMPORTANT — this exact shape was only arrived at by directly testing HTTP
// status codes against a live server, not by trusting the pattern on paper.
// Two earlier attempts both still produced "200 OK" with 404 content for a
// nonexistent /businesses/[slug] (confirmed via the response's
// `x-nextjs-prerender: 1` / `x-nextjs-postponed: 1` headers, which mean Next
// served a prerendered shell and then streamed the rest in):
//   1. An empty-fallback <Suspense> around <body>, no connection(): the
//      <head> script has no request-time dependency, so it (and the empty
//      fallback marking body's position) still got prerendered as a static
//      shell and served with a locked-in 200 — the page's later notFound()
//      couldn't change it.
//   2. Adding `await connection()` here while KEEPING that Suspense: no
//      different. connection() only controls BUILD-TIME prerendering
//      eligibility; it doesn't stop the RUNTIME behavior where a Suspense
//      boundary rendering its fallback is itself what triggers chunked
//      streaming with an early-committed status (per this Next version's
//      streaming docs, loading.md § "Status Codes": "the response body
//      starts streaming when a Suspense fallback renders... or when a
//      Server Component suspends under a Suspense boundary").
// What actually worked: removing the Suspense boundary entirely. With
// nothing anywhere in this tree able to suspend-and-flush independently,
// and `connection()` making the whole layout ineligible for build-time
// prerendering, the full render — layout AND the gated page's async gate
// check — happens as one blocking unit before anything is sent. Verified:
// a nonexistent business/product now returns a real 404 status, not 200.
// Navbar's own usePathname() call doesn't need a Suspense boundary here the
// way it does in the shared app/layout.tsx — that boundary exists there to
// keep Navbar's request-time-ness from forcing OTHER routes' static shells
// dynamic too, which is irrelevant when this whole route group is already
// fully dynamic on purpose.
//
// Route groups with their own <html>/<body> are a separate, independent
// root layout — Next does NOT nest this under app/layout.tsx for routes in
// this group (see route-groups.md "Defining multiple root layouts" and
// layout.md "Root Layout": "Any layout without a layout.js above it is a
// root layout"). Everything app/layout.tsx provides (fonts, metadata,
// JSON-LD, Navbar/Footer/CookieConsent, analytics) has to be duplicated
// here rather than inherited — kept in sync via lib/root-metadata.ts for
// the metadata/JSON-LD, since those are real shared data, not just markup.

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata = rootMetadata;

export default async function GatedRootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();

  return (
    <html lang="en" className={`h-full antialiased ${font.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getWebsiteJsonLd()).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Navbar />
        <div className="flex-1">{children}</div>
        <Footer />
        <CookieConsent />
      </body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!} />
    </html>
  );
}
