import { generateDailyPost } from '../../../../lib/generateCaption';
import { postToFacebook, postPhotoToFacebook } from '../../../../lib/facebook';
import { isAuthorizedCronRequest } from '../../../../lib/cron-auth';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function recordAuditItem({ sourceId, caption, source }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from('ai_content_items').insert({
      content_type: 'fundraiser',
      source_id: sourceId || '00000000-0000-0000-0000-000000000000',
      snapshot: { source },
      ai_provider: process.env.AI_PROVIDER_DEFAULT || 'gemini',
      generated_text: caption,
      guard_result: 'pass',
      published: false,
    });
    if (error) console.error('[DailyPost] ai_content_items insert error:', error.message);
    else console.log('[DailyPost] ai_content_items row recorded.');
  } catch (err) {
    console.error('[DailyPost] ai_content_items insert threw:', err.message);
  }
}

export async function POST(request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // generateDailyPost() handles everything internally: it tries to ground
  // the post in a real fundraiser/event first, falls back to a branded
  // template image + theme caption if none is available, and falls back
  // again to a static text-only template if Gemini itself fails.
  const { caption, imageUrl, source, sourceId } = await generateDailyPost();

  console.log(`[DailyPost Cron] Post source: ${source}`);

  // Audit: record the generated item (fire-and-forget, never blocks publishing)
  await recordAuditItem({ sourceId, caption, source });

  if (imageUrl) {
    try {
      const postId = await postPhotoToFacebook({ imageUrl, caption });
      return Response.json({ success: true, postId, withImage: true, source });
    } catch (err) {
      console.error('[DailyPost Cron] Photo post failed, falling back to text-only:', err.message);
      try {
        const postId = await postToFacebook({ message: caption });
        return Response.json({
          success: true,
          postId,
          withImage: false,
          source,
          warning: 'Photo post failed; posted text-only fallback.',
        });
      } catch (fallbackErr) {
        console.error('[DailyPost Cron] Fallback text post also failed:', fallbackErr.message);
        return Response.json({ error: fallbackErr.message }, { status: 500 });
      }
    }
  }

  // No image at all (fully-failed source) — text-only post
  try {
    const postId = await postToFacebook({ message: caption });
    return Response.json({ success: true, postId, withImage: false, source });
  } catch (err) {
    console.error('[DailyPost Cron] Text post failed:', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}