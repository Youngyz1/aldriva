let cachedPageToken = null;
let cachedTokenExpiry = 0;

async function getPageAccessToken() {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FB_PAGE_ID;
  if (!token) return '';

  if (cachedPageToken && Date.now() < cachedTokenExpiry) {
    return cachedPageToken;
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/me/accounts?access_token=${token}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.data && Array.isArray(data.data)) {
        const match = pageId ? data.data.find(p => p.id === pageId) : data.data[0];
        if (match?.access_token) {
          cachedPageToken = match.access_token;
          cachedTokenExpiry = Date.now() + 3600 * 1000;
          return cachedPageToken;
        }
      }
    }
  } catch (err) {
    console.warn('[facebook] Could not resolve page access token from /me/accounts:', err);
  }

  cachedPageToken = token;
  cachedTokenExpiry = Date.now() + 300 * 1000;
  return token;
}

export async function postToFacebook({ message, link }) {
  const GRAPH_API_VERSION = 'v25.0';
  const PAGE_ID = process.env.FB_PAGE_ID;
  const PAGE_ACCESS_TOKEN = await getPageAccessToken();

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
  const PAGE_ACCESS_TOKEN = await getPageAccessToken();

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