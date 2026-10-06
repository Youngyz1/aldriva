"use client";

import { useLocale } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

export default function LanguageSwitcher({ variant = 'inline' }: { variant?: 'inline' | 'dropdown' }) {
  const locale = useLocale() as 'en' | 'fr';
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function stripLocale(path: string): string {
    const stripped = path.replace(/^\/(en|fr)(?=\/|$)/, '');
    return stripped === '' ? '/' : stripped;
  }

  function switchTo(newLocale: 'en' | 'fr') {
    if (newLocale === locale) return;
    // persist cookie
    document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    // Also persist to profile if logged in (fire and forget)
    fetch('/api/locale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locale: newLocale }) }).catch(()=>{});
    
    // Build target path by REPLACING locale, not prepending
    const stripped = stripLocale(pathname);
    const query = searchParams?.toString();
    const suffix = query ? `?${query}` : '';
    const hash = typeof window !== 'undefined' ? window.location.hash : '';
    const target = `/${newLocale}${stripped === '/' ? '' : stripped}${suffix}${hash}`;
    startTransition(() => {
      window.location.href = target;
    });
  }

  if (variant === 'dropdown') {
    return (
      <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1">
        <button
          type="button"
          onClick={() => switchTo('en')}
          disabled={isPending}
          aria-pressed={locale === 'en'}
          className={`rounded-full px-3 py-1 text-xs font-black transition ${locale === 'en' ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => switchTo('fr')}
          disabled={isPending}
          aria-pressed={locale === 'fr'}
          className={`rounded-full px-3 py-1 text-xs font-black transition ${locale === 'fr' ? 'bg-zinc-950 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
        >
          FR
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0.5 text-xs font-bold">
      <button
        type="button"
        onClick={() => switchTo('en')}
        aria-label="Switch to English"
        aria-current={locale === 'en' ? 'true' : undefined}
        className={`px-1 py-0.5 sm:px-1.5 ${locale === 'en' ? 'text-zinc-950 underline underline-offset-4' : 'text-zinc-500 hover:text-zinc-800'}`}
      >
        EN
      </button>
      <span className="text-zinc-300">|</span>
      <button
        type="button"
        onClick={() => switchTo('fr')}
        aria-label="Passer en français"
        aria-current={locale === 'fr' ? 'true' : undefined}
        className={`px-1 py-0.5 sm:px-1.5 ${locale === 'fr' ? 'text-zinc-950 underline underline-offset-4' : 'text-zinc-500 hover:text-zinc-800'}`}
      >
        FR
      </button>
    </div>
  );
}
