import {defineRouting} from 'next-intl/routing';

export const locales = ['en', 'fr'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'en';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  localeDetection: true,
  localeCookie: {
    // next-intl uses NEXT_LOCALE by default, but we make it explicit
    name: 'NEXT_LOCALE'
  }
});

export function isValidLocale(locale: string | null | undefined): locale is Locale {
  return !!locale && (locales as readonly string[]).includes(locale);
}

export function getLocaleFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return defaultLocale;
  const parts = header.split(',').map(p => p.split(';')[0].trim().toLowerCase());
  for (const part of parts) {
    if (part.startsWith('fr')) return 'fr';
    if (part.startsWith('en')) return 'en';
  }
  return defaultLocale;
}

export function getLocaleForRequest(cookieLocale: string | null | undefined, acceptLanguage: string | null | undefined, pathLocale: string | null | undefined): Locale {
  // Priority: path prefix > explicit cookie > browser Accept-Language > default
  // Note: DB preference (profiles.locale) is handled at app level if present
  if (pathLocale && isValidLocale(pathLocale)) return pathLocale;
  if (cookieLocale && isValidLocale(cookieLocale)) return cookieLocale as Locale;
  return getLocaleFromAcceptLanguage(acceptLanguage);
}
