/**
 * app/api/ai/conversations/[id]/route.ts — Stage 22 (P4a).
 *
 * Same gate as the collection route (401/403 JSON, isAdmin first, per-user
 * studioChat bucket). PATCH renames (title 1–80 chars). DELETE hard-deletes:
 * messages cascade, audit tables are never referenced (migration 152).
 * Unknown or unowned ids answer 404 either way (owner RLS returns no row).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase-server';
import { enforceRateLimit } from '@/lib/rate-limit';

async function gate(req: NextRequest): Promise<{ id: string } | NextResponse> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const limited = await enforceRateLimit('studioChat', req, user.id);
  if (limited) return limited;
  return { id: user.id };
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 80) : '';
  if (!title) return NextResponse.json({ error: 'title is required (1-80 chars)' }, { status: 400 });

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('studio_chat_conversations')
    .update({ title, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,title,provider,status,created_at,updated_at')
    .limit(1);
  if (error) return NextResponse.json({ error: 'AI service error. Please try again.' }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  return NextResponse.json({ success: true, conversation: data[0] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  const { id } = await params;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('studio_chat_conversations')
    .delete()
    .eq('id', id)
    .select('id')
    .limit(1);
  if (error) return NextResponse.json({ error: 'AI service error. Please try again.' }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  return NextResponse.json({ success: true, deleted: data[0].id });
}
