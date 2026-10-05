/**
 * app/api/ai/conversations/route.ts — Stage 22 (P4a).
 *
 * Studio chat threads (migration 152). Admin API convention: 401 when no
 * user, 403 when not admin (isAdmin first, before parsing), per-user rate
 * limit (studioChat bucket keyed on the admin id, never IP).
 *
 * GET: own conversations, newest first (limit 50). POST: create with an
 * optional title (defaults server-side on first persisted turn).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase-server';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const limited = await enforceRateLimit('studioChat', req, user.id);
  if (limited) return limited;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('studio_chat_conversations')
    .select('id,title,provider,status,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: 'AI service error. Please try again.' }, { status: 500 });
  return NextResponse.json({ success: true, conversations: data ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const limited = await enforceRateLimit('studioChat', req, user.id);
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 80) : 'Untitled chat';

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('studio_chat_conversations')
    .insert({ user_id: user.id, title })
    .select('id,title,provider,status,created_at,updated_at')
    .limit(1);
  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: 'AI service error. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ success: true, conversation: data[0] });
}
