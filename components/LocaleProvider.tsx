import { NextIntlClientProvider } from 'next-intl';
import { cookies, headers } from 'next/headers';
import { connection } from 'next/server';
import { routing } from '@/i18n/routing';
import { getLocaleFromAcceptLanguage, isValidLocale } from '@/i18n/routing';
import HtmlLangSync from './HtmlLangSync';

export default async function LocaleProvider({ children }: { children: React.ReactNode }) {
  await connection();
  const headerStore = await headers();
  const cookieStore = await cookies();
  const headerLocale = headerStore.get('x-next-intl-locale');
  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value ?? null;
  const acceptLang = headerStore.get('accept-language');
  let locale: string | null = null;
  if (headerLocale && isValidLocale(headerLocale)) locale = headerLocale;
  else if (cookieLocale && isValidLocale(cookieLocale)) locale = cookieLocale as string;
  else locale = getLocaleFromAcceptLanguage(acceptLang);
  if (!locale || !isValidLocale(locale)) locale = routing.defaultLocale;
  const typedLocale = locale as typeof routing.locales[number];
  const messages = (await import(`../messages/${typedLocale}.json`)).default;
  return (
    <NextIntlClientProvider locale={typedLocale} messages={messages} timeZone="UTC" now={new Date()}>
      <HtmlLangSync />
      {children}
    </NextIntlClientProvider>
  );
}
