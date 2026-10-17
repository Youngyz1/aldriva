import type { Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "../globals.css";
import Navbar from "@/components/Navbar";
import BrandMark from "@/components/BrandMark";
import CookieConsent from "@/components/CookieConsent";
import PwaRegister from "@/components/PwaRegister";
import { GoogleAnalytics } from "@next/third-parties/google";
import { rootMetadata, getWebsiteJsonLd } from "@/lib/root-metadata";
import IntlProvider from "@/components/IntlProvider";
import { notFound } from "next/navigation";
import { isValidLocale, locales } from "@/i18n/routing";
import { setRequestLocale } from "next-intl/server";
// Static module-scope imports: both locale message files are bundled at compile
// time. Selecting between them at runtime is a plain ternary — no I/O, no
// dynamic import(), no uncached data. This eliminates the root-layout landmine
// that was causing cacheComponents to flag the prerender for every (gated)/[slug]
// route as "uncached or runtime data outside <Suspense>".
import enMessages from "../../messages/en.json";
import frMessages from "../../messages/fr.json";
import { PlatformThemeBootstrap } from "@/components/PlatformThemeBootstrap";
import { PlatformThemeProvider } from "@/components/PlatformThemeProvider";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#c2410c",
};

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

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale;

  if (!isValidLocale(locale)) {
    notFound();
  }

  setRequestLocale(locale);

  // Select pre-bundled messages — pure ternary, no I/O.
  const messages = locale === "fr" ? frMessages : enMessages;

  return (
    <html lang={locale} suppressHydrationWarning className={`h-full antialiased ${font.variable} ${monoFont.variable}`}>
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
          <IntlProvider locale={locale} messages={messages}>
            <PwaRegister />
            <Suspense fallback={<NavbarFallback />}>
              <Navbar />
            </Suspense>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
            <CookieConsent />
          </IntlProvider>
        </PlatformThemeProvider>
      </body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!} />
    </html>
  );
}
