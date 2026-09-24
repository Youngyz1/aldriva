import {getRequestConfig} from 'next-intl/server';
import {routing, type Locale} from './routing';
import {cookies, headers} from 'next/headers';
import {getLocaleFromAcceptLanguage, isValidLocale} from './routing';

export default getRequestConfig(async ({requestLocale}) => {
  // requestLocale is set by next-intl middleware/proxy when using localePrefix.
  // Since we handle locale in proxy.ts rewrite and also support bare paths via cookie,
  // we resolve in order: 1) requestLocale (path prefix) 2) cookie 3) Accept-Language 4) default
  let locale: string | undefined = await requestLocale;

  if (!locale || !isValidLocale(locale)) {
    const cookieStore = await cookies();
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value;
    if (cookieLocale && isValidLocale(cookieLocale)) {
      locale = cookieLocale;
    } else {
      const headerStore = await headers();
      const acceptLang = headerStore.get('accept-language');
      locale = getLocaleFromAcceptLanguage(acceptLang);
    }
  }

  if (!locale || !isValidLocale(locale)) {
    locale = routing.defaultLocale;
  }

  return {
    locale: locale as Locale,
    messages: (await import(`../messages/${locale}.json`)).default
  };
});
