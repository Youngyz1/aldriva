// Locale-aware formatting helpers using Intl
import { routing } from '@/i18n/routing';
import type { Locale } from '@/i18n/routing';

export function formatDate(date: Date | string, locale: Locale, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const opts: Intl.DateTimeFormatOptions = options ?? { year: 'numeric', month: 'long', day: 'numeric' };
  return new Intl.DateTimeFormat(locale, opts).format(d);
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCurrency(value: number, currency: string, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
}

export function formatPercent(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

export function isValidLocale(locale: string | null | undefined): boolean {
  return !!locale && (routing.locales as readonly string[]).includes(locale);
}
