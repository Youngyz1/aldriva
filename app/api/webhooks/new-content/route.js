import { generateContentCaption } from '../../../../lib/generateCaption';
import { postToFacebook } from '../../../../lib/facebook';

export async function POST(request) {
  const secretHeader = request.headers.get('x-webhook-secret');
  if (secretHeader !== process.env.SITE_WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { title, excerpt, url } = body.record;

  try {
    const caption = await generateContentCaption({ title, excerpt, url });
    const postId = await postToFacebook({ message: caption, link: url });
    return Response.json({ success: true, postId });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}