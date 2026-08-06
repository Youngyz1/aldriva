import type { Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BrandMark from "@/components/BrandMark";
import Footer from "@/components/Footer";
import CookieConsent from "@/components/CookieConsent";
import { GoogleAnalytics } from "@next/third-parties/google";
import { rootMetadata, getWebsiteJsonLd } from "@/lib/root-metadata";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

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

export const metadata = rootMetadata;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
