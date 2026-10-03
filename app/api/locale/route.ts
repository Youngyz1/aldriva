import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { isValidLocale } from '@/i18n/routing';

export async function POST(req: NextRequest) {
  try {
    const { locale } = await req.json();
    if (!isValidLocale(locale)) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set('NEXT_LOCALE', locale, { path: '/', maxAge: 31536000, sameSite: 'lax' });

    // If logged in, persist to profile
    try {
      const supabase = await createSupabaseServer();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Try locale column, fallback to preferences JSON if column not yet migrated
        const { error } = await supabase.from('profiles').update({ locale }).eq('id', user.id);
        if (error) {
          // Fallback: store in preferences JSON
          // Fetch current preferences
          const { data: profile } = await supabase.from('profiles').select('preferences').eq('id', user.id).single();
          const prefs = (profile?.preferences as any) || {};
          await supabase.from('profiles').update({ preferences: { ...prefs, locale } }).eq('id', user.id);
        }
      }
    } catch {
      // ignore profile persistence errors — cookie is primary
    }

    return res;
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const locale = req.cookies.get('NEXT_LOCALE')?.value ?? 'en';
  return NextResponse.json({ locale });
}
