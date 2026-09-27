import type { Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#c2410c",
};

function NavbarFallback() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200/80 bg-white/95 backdrop-blur-md supports-[backdrop-filter]:bg-white/80">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 md:gap-4 md:px-6">
        <BrandMark textClassName="hidden sm:inline text-zinc-950" priority />
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
    <html lang={locale} className={`h-full antialiased ${font.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getWebsiteJsonLd()).replace(/</g, "\\u003c"),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <IntlProvider
          locale={locale}
          messages={messages}
        >
          <PwaRegister />
          <Suspense fallback={<NavbarFallback />}>
            <Navbar />
          </Suspense>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          <CookieConsent />
        </IntlProvider>
      </body>
      <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID!} />
    </html>
  );
}
