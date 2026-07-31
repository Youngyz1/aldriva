export async function postToFacebook({ message, link }) {
  const GRAPH_API_VERSION = 'v25.0';
  const PAGE_ID = process.env.FB_PAGE_ID;
  const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

  const params = new URLSearchParams({ message, access_token: PAGE_ACCESS_TOKEN });
  if (link) params.append('link', link);

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${PAGE_ID}/feed`,
    { method: 'POST', body: params }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data.error));
  return data.id;
}

// NEW: posts an image + caption together (accepts imageBase64 or imageUrl)
export async function postPhotoToFacebook({ imageBase64, imageUrl, caption }) {
  const GRAPH_API_VERSION = 'v25.0';
  const PAGE_ID = process.env.FB_PAGE_ID;
  const PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN;

  let blob;
  if (imageUrl) {
    // Fetch the image from the URL in our server environment, allowing us to support
    // any URL (even localhost/internal buckets) and convert it to a blob.
    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) {
      throw new Error(`Failed to fetch image from URL: ${imageUrl}. Status: ${imageRes.status}`);
    }
    const arrayBuffer = await imageRes.arrayBuffer();
    blob = new Blob([arrayBuffer]);
  } else if (imageBase64) {
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    blob = new Blob([imageBuffer], { type: 'image/png' });
  } else {
    throw new Error('Either imageBase64 or imageUrl must be provided');
  }

  const formData = new FormData();
  formData.append('source', blob, 'post-image.png');
  formData.append('caption', caption);
  formData.append('access_token', PAGE_ACCESS_TOKEN);

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${PAGE_ID}/photos`,
    { method: 'POST', body: formData }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data.error));
  return data.id; // photo id; Facebook auto-creates a feed post from it
}