import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BrandMark from "@/components/BrandMark";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import { getSiteUrl } from "@/lib/site-url";
import { GoogleAnalytics } from "@next/third-parties/google";
import { BRAND } from "@/config/branding";

// Navbar reads usePathname() (active nav-link state, closing menus on route
// change) during SSR, which Cache Components treats as request-time data —
// isolating it in its own <Suspense> boundary keeps that out of the root
// layout's static shell instead of blocking prerendering for every route.
// The fallback matches Navbar's own sticky h-16 header shell so there's no
// layout shift while it resolves.
function NavbarFallback() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 md:gap-4 md:px-6">
        <BrandMark textClassName="hidden sm:inline text-zinc-950" />
      </div>
    </header>
  );
}

const font = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  applicationName: BRAND.name,
  title: { default: BRAND.seo.defaultTitle, template: BRAND.seo.titleTemplate },
  description: BRAND.seo.defaultDescription,
  keywords: [...BRAND.seo.keywords],
  verification: {
    google: "po4G29Q4YxDRxL3h7QbPGk_Wz4eYvinBleV7ISM5LBA",
  },
  openGraph: {
    siteName: BRAND.name,
    title: BRAND.seo.defaultTitle,
    description: BRAND.seo.defaultDescription,
    type: "website",
    images: [{ url: BRAND.assets.ogImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND.seo.defaultTitle,
    description: BRAND.seo.defaultDescription,
    images: [BRAND.assets.ogImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteUrl = getSiteUrl().replace(/\/$/, "");

  return (
    <html lang="en" className={`h-full antialiased ${font.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: BRAND.name,
              url: siteUrl,
              description: BRAND.seo.defaultDescription,
              potentialAction: {
                "@type": "SearchAction",
                target: `${siteUrl}/search?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            }).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<NavbarFallback />}>
          <Navbar />
        </Suspense>
        <div className="flex-1">
          {children}
        </div>
        <Footer />
        <CookieConsent />
      </body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!} />
    </html>
  );
}
