import { generateDailyPost } from '../../../../lib/generateCaption';
import { postToFacebook, postPhotoToFacebook } from '../../../../lib/facebook';

export async function POST(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // generateDailyPost() handles everything internally: it tries to ground
  // the post in a real fundraiser/event first, falls back to a branded
  // template image + theme caption if none is available, and falls back
  // again to a static text-only template if Gemini itself fails.
  const { caption, imageUrl, source } = await generateDailyPost();

  console.log(`[DailyPost Cron] Post source: ${source}`);

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