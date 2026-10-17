import type { Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import BrandMark from "@/components/BrandMark";
import CookieConsent from "@/components/CookieConsent";
import PwaRegister from "@/components/PwaRegister";
import { GoogleAnalytics } from "@next/third-parties/google";
import { rootMetadata, getWebsiteJsonLd } from "@/lib/root-metadata";
import { PlatformThemeBootstrap } from "@/components/PlatformThemeBootstrap";
import { PlatformThemeProvider } from "@/components/PlatformThemeProvider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#c2410c",
};

// Navbar reads usePathname() (active nav-link state, closing menus on route
// change) during SSR, which Cache Components treats as request-time data —
// isolating it in its own <Suspense> boundary keeps that out of the root
// layout's static shell instead of blocking prerendering for every route.
// The fallback matches Navbar's own sticky h-16 header shell so there's no
// layout shift while it resolves.
function NavbarFallback() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 md:gap-4 md:px-6">
        <BrandMark textClassName="hidden sm:inline text-zinc-950 dark:text-white" priority />
      </div>
    </header>
  );
}

const font = Geist({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});
const monoFont = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-code",
  display: "swap",
});
export const metadata = rootMetadata;

import LocaleProvider from '@/components/LocaleProvider';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`h-full antialiased ${font.variable} ${monoFont.variable}`}>
      <head>
        <PlatformThemeBootstrap />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getWebsiteJsonLd()).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <PlatformThemeProvider>
          <Suspense fallback={null}>
            <LocaleProvider>
              <PwaRegister />
              <Suspense fallback={<NavbarFallback />}>
                <Navbar />
              </Suspense>
              {/* No global footer here by design — each segment opts into the
                  correct footer tier (marketing / compact / none) via its own
                  nested layout or section shell. See
                  `components/footers/index.ts`. The flex-column wrapper lets
                  footer-bearing section shells pin their footer to the viewport
                  bottom on short pages, while workspace layouts fill the space. */}
              <div className="flex min-h-0 flex-1 flex-col">{children}</div>
              <CookieConsent />
            </LocaleProvider>
          </Suspense>
        </PlatformThemeProvider>
      </body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!} />
    </html>
  );
}
