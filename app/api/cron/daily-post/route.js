import { generateDailyPost } from '../../../../lib/generateCaption';
import {
  getContentMode,
  generatePlatformContent,
} from '../../../../lib/generatePlatformContent';
import { postToFacebook, postPhotoToFacebook } from '../../../../lib/facebook';
import { isAuthorizedCronRequest } from '../../../../lib/cron-auth';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

async function recordAuditItem({ contentType, sourceId, caption, source, contentMode, contentPath }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from('ai_content_items').insert({
      content_type: contentType,
      source_id: sourceId || '00000000-0000-0000-0000-000000000000',
      snapshot: { source, content_mode: contentMode, content_path: contentPath },
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

  // CONTENT_MODE gate — deliberate manual switch, NOT auto-detected.
  // 'platform_only' (current default): About-Aldriva content only. The grounded
  // fundraiser/event path is skipped entirely — never called, not merely
  // fallen through — because current DB inventory is test/seed data, not real
  // campaigns. Switch to 'grounded' or 'auto' manually once genuine,
  // non-test inventory exists. See docs/technical/aldriva-ai.md.
  const contentMode = getContentMode();
  let caption;
  let imageUrl;
  let source;
  let sourceId;
  let contentType;
  let contentPath;

  if (contentMode === 'platform_only') {
    ({ caption, imageUrl, source, sourceId } = await generatePlatformContent());
    contentType = 'platform';
    contentPath = 'platform';
  } else if (contentMode === 'auto') {
    // Grounded first; platform content only when no grounded record exists.
    // generateDailyPost() reports source === 'grounded' only when it actually
    // grounded in a real fundraiser/event row — 'template'/'fallback' mean
    // nothing was available, so use the platform generator instead.
    const grounded = await generateDailyPost();
    if (grounded.source === 'grounded') {
      ({ caption, imageUrl, source, sourceId } = grounded);
      contentType = 'fundraiser';
      contentPath = 'grounded';
    } else {
      ({ caption, imageUrl, source, sourceId } = await generatePlatformContent());
      contentType = 'platform';
      contentPath = 'platform_fallback';
    }
  } else {
    // 'grounded': historical behavior — real fundraiser/event first, branded
    // template image + theme caption if none available, static text fallback
    // if generation itself fails.
    ({ caption, imageUrl, source, sourceId } = await generateDailyPost());
    contentType = 'fundraiser';
    contentPath = 'grounded';
  }

  console.log(`[DailyPost Cron] content_mode=${contentMode} content_path=${contentPath} source=${source}`);

  // Audit: record the generated item (fire-and-forget, never blocks publishing)
  await recordAuditItem({ contentType, sourceId, caption, source, contentMode, contentPath });

  const meta = { contentMode, contentPath, source };

  if (imageUrl) {
    try {
      const postId = await postPhotoToFacebook({ imageUrl, caption });
      return Response.json({ success: true, postId, withImage: true, ...meta });
    } catch (err) {
      console.error('[DailyPost Cron] Photo post failed, falling back to text-only:', err.message);
      try {
        const postId = await postToFacebook({ message: caption });
        return Response.json({
          success: true,
          postId,
          withImage: false,
          ...meta,
          warning: 'Photo post failed; posted text-only fallback.',
        });
      } catch (fallbackErr) {
        console.error('[DailyPost Cron] Fallback text post also failed:', fallbackErr.message);
        return Response.json({ error: fallbackErr.message, ...meta }, { status: 500 });
      }
    }
  }

  // No image at all (fully-failed source) — text-only post
  try {
    const postId = await postToFacebook({ message: caption });
    return Response.json({ success: true, postId, withImage: false, ...meta });
  } catch (err) {
    console.error('[DailyPost Cron] Text post failed:', err.message);
    return Response.json({ error: err.message, ...meta }, { status: 500 });
  }
}
