"use client";
/**
 * Thin "use client" wrapper around NextIntlClientProvider.
 *
 * Why this exists:
 * The react-server export of next-intl wraps NextIntlClientProvider in
 * NextIntlClientProviderServer, which calls getFormats() and getConfigNow()
 * internally for any prop that isn't passed explicitly. Both functions call
 * getConfig() → getRequestLocale() → headers() — a dynamic read that fails
 * during PPR prerender of routes with DynamicMarker (connection() inside
 * Suspense) because the React cache set by setRequestLocale() does not cross
 * async component boundaries in PPR build-time prerender.
 *
 * Marking this wrapper "use client" forces Next.js to resolve the
 * NextIntlClientProvider import against the browser/client export condition,
 * not the react-server condition. The client variant is just a plain React
 * context provider — it calls no server functions at all. The locale and
 * messages have already been resolved by the parent server layout and are
 * passed in as serializable props.
 *
 * Server components deeper in the tree still call getTranslations() which
 * resolves via i18n/request.ts (getRequestConfig) independently of this
 * provider. Client components use useTranslations() which reads from the
 * React context this provider supplies.
 */
import { NextIntlClientProvider } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import { type Locale, defaultLocale, isValidLocale } from "@/i18n/routing";

export default function IntlProvider({
  locale,
  messages,
  children,
}: {
  locale?: Locale | string;
  messages: AbstractIntlMessages;
  children: React.ReactNode;
}) {
  const activeLocale: Locale = isValidLocale(locale) ? locale : defaultLocale;

  return (
    <NextIntlClientProvider locale={activeLocale} messages={messages} timeZone="UTC">
      {children}
    </NextIntlClientProvider>
  );
}
