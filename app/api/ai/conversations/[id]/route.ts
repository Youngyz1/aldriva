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

/**
 * Stage 22 (P4b): thread read-back for the Studio chat UI.
 *
 * GET returns the conversation plus its messages oldest-first. The newest
 * 200 rows are selected (seq DESC + one extra row to detect overflow, then
 * reversed), so the response stays bounded and `truncated` tells the UI
 * older history exists. The column list is explicit — display text, tool
 * NAME, verdict and provider only. Payload rows, args, quarantined content
 * and secrets have no field to travel through (same doctrine as the P4a
 * serializers in lib/ai/studio-chat.ts).
 */
const MESSAGE_COLUMNS =
  'seq,role,content,tool_name,guard_verdict,guard_reason,provider,created_at';

/** Newest rows returned per read; one extra row is fetched to set `truncated`. */
const READ_WINDOW = 200;

function isConversationId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await gate(req);
  if (g instanceof NextResponse) return g;
  const { id } = await params;
  if (!isConversationId(id)) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const supabase = await createSupabaseServer();
  const { data: convos, error: convoError } = await supabase
    .from('studio_chat_conversations')
    .select('id,title,provider,status,created_at,updated_at')
    .eq('id', id)
    .limit(1);
  if (convoError) return NextResponse.json({ error: 'AI service error. Please try again.' }, { status: 500 });
  if (!convos || convos.length === 0) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });

  const { data: newest, error: messagesError } = await supabase
    .from('studio_chat_messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', id)
    .order('seq', { ascending: false })
    .limit(READ_WINDOW + 1);
  if (messagesError) return NextResponse.json({ error: 'AI service error. Please try again.' }, { status: 500 });
  const rows = newest ?? [];
  const truncated = rows.length > READ_WINDOW;
  const messages = rows.slice(0, READ_WINDOW).reverse();
  return NextResponse.json({ success: true, conversation: convos[0], messages, truncated });
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
