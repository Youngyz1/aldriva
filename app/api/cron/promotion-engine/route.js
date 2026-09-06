import { getNextPromotion } from '../../../../lib/promotionEngine.js';
import { generatePromotionCaption } from '../../../../lib/generateCaption.js';
import {
  getContentMode,
  generatePlatformContent,
} from '../../../../lib/generatePlatformContent.js';
import { postToFacebook, postPhotoToFacebook } from '../../../../lib/facebook.js';
import { isAuthorizedCronRequest } from '../../../../lib/cron-auth';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * Inserts an audit row into ai_content_items. Fire-and-forget — never throws,
 * never blocks the publish path.
 */
async function recordAuditItem({ contentType, sourceId, snapshot, caption, provider }) {
  try {
    const supabase = getSupabase();
    if (!supabase) return;
    const { error } = await supabase.from('ai_content_items').insert({
      content_type: contentType,
      source_id: sourceId,
      snapshot: snapshot || {},
      ai_provider: provider || process.env.AI_PROVIDER_DEFAULT || 'gemini',
      generated_text: caption,
      guard_result: 'pass',
      published: false,
    });
    if (error) console.error('[PromotionEngine] ai_content_items insert error:', error.message);
    else console.log('[PromotionEngine] ai_content_items row recorded.');
  } catch (err) {
    console.error('[PromotionEngine] ai_content_items insert threw:', err.message);
  }
}

/**
 * Publishes platform (About-Aldriva) content: branded template image + caption,
 * no campaign link. Shared by the platform_only path and the auto-mode fallback.
 */
async function publishPlatformContent({ request, contentMode, contentPath }) {
  const { caption, imageUrl, source, sourceId } = await generatePlatformContent();

  console.log(
    `[PromotionEngine Cron] content_mode=${contentMode} content_path=${contentPath} source=${source}`
  );

  await recordAuditItem({
    contentType: 'platform',
    sourceId,
    snapshot: { source, content_mode: contentMode, content_path: contentPath },
    caption,
  });

  const requestUrl = new URL(request.url);
  const preview = requestUrl.searchParams.get('preview') === 'true';
  if (preview) {
    console.log('[PromotionEngine Cron] Preview mode: skipping Facebook posting.');
    return Response.json({
      success: true,
      preview: true,
      contentMode,
      contentPath,
      caption,
      imageUrl,
    });
  }

  if (imageUrl) {
    try {
      const postId = await postPhotoToFacebook({ imageUrl, caption });
      return Response.json({ success: true, postId, withImage: true, contentMode, contentPath });
    } catch (err) {
      console.error('[PromotionEngine Cron] Platform photo post failed, falling back to text-only:', err.message);
      try {
        const postId = await postToFacebook({ message: caption });
        return Response.json({
          success: true,
          postId,
          withImage: false,
          contentMode,
          contentPath,
          warning: 'Photo post failed; posted text-only fallback.',
        });
      } catch (fallbackErr) {
        console.error('[PromotionEngine Cron] Platform fallback text post failed:', fallbackErr.message);
        return Response.json(
          { success: false, error: `Failed posting fallback: ${fallbackErr.message}`, contentMode, contentPath },
          { status: 500 }
        );
      }
    }
  }

  try {
    const postId = await postToFacebook({ message: caption });
    return Response.json({ success: true, postId, withImage: false, contentMode, contentPath });
  } catch (err) {
    console.error('[PromotionEngine Cron] Platform text post failed:', err.message);
    return Response.json(
      { success: false, error: `Failed posting text: ${err.message}`, contentMode, contentPath },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cron/promotion-engine
 *
 * Triggered periodically (e.g. via Vercel Cron) to select content and publish
 * it to the Facebook Page.
 *
 * CONTENT_MODE gate — deliberate manual switch, NOT auto-detected.
 * 'platform_only' (current default): About-Aldriva content only. getNextPromotion()
 * is skipped entirely — never called, not merely fallen through — because current
 * DB inventory is test/seed data, not real campaigns. Switch to 'grounded' or
 * 'auto' manually once genuine, non-test inventory exists.
 * See docs/technical/aldriva-ai.md.
 */
export async function POST(request) {
  console.log('[PromotionEngine Cron] Cron started.');

  // 1. Authenticate
  if (!isAuthorizedCronRequest(request)) {
    console.error('[PromotionEngine Cron] Unauthorized attempt (invalid or missing secret).');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentMode = getContentMode();

  // 2a. Platform-only path: never touch events/fundraisers data.
  if (contentMode === 'platform_only') {
    return publishPlatformContent({ request, contentMode, contentPath: 'platform' });
  }

  // 2b. Grounded/auto path: query next eligible content
  let promotion;
  try {
    promotion = await getNextPromotion();
  } catch (err) {
    console.error('[PromotionEngine Cron] Failed to query promotion content:', err.message);
    return Response.json(
      { success: false, error: `Failed to query promotion: ${err.message}`, contentMode, contentPath: 'grounded' },
      { status: 500 }
    );
  }

  // 3. Handle no promotion available
  if (!promotion) {
    if (contentMode === 'auto') {
      // Fallback behavior: grounded first, platform content only when nothing's
      // available — instead of exiting with "no promotion".
      console.warn('[PromotionEngine Cron] No grounded promotion available; using platform fallback.');
      return publishPlatformContent({ request, contentMode, contentPath: 'platform_fallback' });
    }
    console.warn('[PromotionEngine Cron] No promotion available.');
    return Response.json({
      success: true,
      message: 'No eligible promotion found.',
      contentMode,
      contentPath: 'grounded',
    });
  }

  console.log(
    `[PromotionEngine Cron] content_mode=${contentMode} content_path=grounded Promotion selected: type=${promotion.type} id=${promotion.id} title="${promotion.title}"`
  );

  // 4. Generate promotional caption
  let caption;
  try {
    caption = await generatePromotionCaption(promotion);
    console.log('[PromotionEngine Cron] Caption generated.');
  } catch (err) {
    // generatePromotionCaption has a built-in fallback, but handle unexpected errors
    console.error('[PromotionEngine Cron] Caption generation failed:', err.message);
    return Response.json(
      { success: false, error: `Caption generation failed: ${err.message}`, contentMode, contentPath: 'grounded' },
      { status: 500 }
    );
  }

  // 4a. Audit: record generated item in ai_content_items (fire-and-forget)
  await recordAuditItem({
    contentType: promotion.type,
    sourceId: promotion.id,
    snapshot: {
      title: promotion.title,
      description: promotion.description,
      url: promotion.url,
      image: promotion.image || null,
      content_mode: contentMode,
      content_path: 'grounded',
    },
    caption,
  });

  // 4b. Check for Preview Mode
  const requestUrl = new URL(request.url);
  const preview = requestUrl.searchParams.get('preview') === 'true';
  if (preview) {
    console.log('[PromotionEngine Cron] Preview mode: skipping Facebook posting.');
    return Response.json({
      success: true,
      preview: true,
      contentMode,
      contentPath: 'grounded',
      promotion,
      caption,
    });
  }

  // 5. Publish to Facebook
  console.log('[PromotionEngine Cron] Publishing started.');
  const meta = { contentMode, contentPath: 'grounded' };

  if (promotion.image) {
    try {
      console.log(`[PromotionEngine Cron] Attempting to post photo: url=${promotion.image}`);
      const postId = await postPhotoToFacebook({
        imageUrl: promotion.image,
        caption: caption,
      });
      console.log(`[PromotionEngine Cron] Publishing succeeded. Photo Post ID: ${postId}`);
      return Response.json({ success: true, postId, withImage: true, ...meta });
    } catch (err) {
      console.error(
        `[PromotionEngine Cron] Publishing photo failed (${err.message}). Falling back to text-only...`
      );

      try {
        const postId = await postToFacebook({
          message: caption,
          link: promotion.url,
        });
        console.log(`[PromotionEngine Cron] Fallback publishing succeeded. Post ID: ${postId}`);
        return Response.json({
          success: true,
          postId,
          withImage: false,
          ...meta,
          warning: 'Photo upload failed; posted text-only fallback.',
        });
      } catch (fallbackErr) {
        console.error('[PromotionEngine Cron] Fallback publishing failed:', fallbackErr.message);
        return Response.json(
          { success: false, error: `Failed posting fallback: ${fallbackErr.message}`, ...meta },
          { status: 500 }
        );
      }
    }
  } else {
    // Text-only post
    try {
      console.log('[PromotionEngine Cron] Attempting text-only post (no image supplied).');
      const postId = await postToFacebook({
        message: caption,
        link: promotion.url,
      });
      console.log(`[PromotionEngine Cron] Publishing succeeded. Post ID: ${postId}`);
      return Response.json({ success: true, postId, withImage: false, ...meta });
    } catch (err) {
      console.error('[PromotionEngine Cron] Publishing failed:', err.message);
      return Response.json(
        { success: false, error: `Failed posting text: ${err.message}`, ...meta },
        { status: 500 }
      );
    }
  }
}
