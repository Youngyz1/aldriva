import { getNextPromotion } from '../../../../lib/promotionEngine.js';
import { generatePromotionCaption } from '../../../../lib/generateCaption.js';
import { postToFacebook, postPhotoToFacebook } from '../../../../lib/facebook.js';

/**
 * POST /api/cron/promotion-engine
 *
 * Triggered periodically (e.g. via Vercel Cron) to select an active campaign
 * (event or fundraiser) and publish it to the Facebook Page.
 */
export async function POST(request) {
  console.log('[PromotionEngine Cron] Cron started.');

  // 1. Authenticate
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('[PromotionEngine Cron] Unauthorized attempt (invalid or missing secret).');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Query next eligible content
  let promotion;
  try {
    promotion = await getNextPromotion();
  } catch (err) {
    console.error('[PromotionEngine Cron] Failed to query promotion content:', err.message);
    return Response.json(
      { success: false, error: `Failed to query promotion: ${err.message}` },
      { status: 500 }
    );
  }

  // 3. Handle no promotion available
  if (!promotion) {
    console.warn('[PromotionEngine Cron] No promotion available.');
    return Response.json({ success: true, message: 'No eligible promotion found.' });
  }

  console.log(
    `[PromotionEngine Cron] Promotion selected: type=${promotion.type} id=${promotion.id} title="${promotion.title}"`
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
      { success: false, error: `Caption generation failed: ${err.message}` },
      { status: 500 }
    );
  }

  // 4b. Check for Preview Mode
  const requestUrl = new URL(request.url);
  const preview = requestUrl.searchParams.get('preview') === 'true';
  if (preview) {
    console.log('[PromotionEngine Cron] Preview mode: skipping Facebook posting.');
    return Response.json({
      success: true,
      preview: true,
      promotion,
      caption,
    });
  }

  // 5. Publish to Facebook
  console.log('[PromotionEngine Cron] Publishing started.');

  if (promotion.image) {
    try {
      console.log(`[PromotionEngine Cron] Attempting to post photo: url=${promotion.image}`);
      const postId = await postPhotoToFacebook({
        imageUrl: promotion.image,
        caption: caption,
      });
      console.log(`[PromotionEngine Cron] Publishing succeeded. Photo Post ID: ${postId}`);
      return Response.json({ success: true, postId, withImage: true });
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
          warning: 'Photo upload failed; posted text-only fallback.',
        });
      } catch (fallbackErr) {
        console.error('[PromotionEngine Cron] Fallback publishing failed:', fallbackErr.message);
        return Response.json(
          { success: false, error: `Failed posting fallback: ${fallbackErr.message}` },
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
      return Response.json({ success: true, postId, withImage: false });
    } catch (err) {
      console.error('[PromotionEngine Cron] Publishing failed:', err.message);
      return Response.json(
        { success: false, error: `Failed posting text: ${err.message}` },
        { status: 500 }
      );
    }
  }
}
