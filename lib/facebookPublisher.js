import axios from 'axios';

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
    console.warn('[facebookPublisher] Could not resolve page access token from /me/accounts:', err);
  }

  cachedPageToken = token;
  cachedTokenExpiry = Date.now() + 300 * 1000;
  return token;
}

/**
 * Publishes a post to the Aldriva Facebook Page using Meta Graph API (v26.0).
 *
 * @param {string} message - The caption/message content for the Facebook post.
 * @param {string} [shareUrl] - Optional URL link to attach to the post.
 * @returns {Promise<{ success: boolean, postId?: string, error?: string, data?: any }>} Result object.
 */
export async function publishToFacebook(message, shareUrl) {
  const pageId = process.env.FB_PAGE_ID;
  const rawToken = process.env.FB_PAGE_ACCESS_TOKEN;
  const apiVersion = process.env.FB_GRAPH_API_VERSION || 'v26.0';

  if (!pageId || !rawToken) {
    const missingErr = 'FB_PAGE_ID or FB_PAGE_ACCESS_TOKEN environment variable is not defined.';
    console.error(`[FacebookPublisher Error]: ${missingErr}`);
    return {
      success: false,
      error: missingErr,
    };
  }

  const pageAccessToken = await getPageAccessToken();

  const url = `https://graph.facebook.com/${apiVersion}/${pageId}/feed`;

  const params = new URLSearchParams();
  params.append('message', message || '');
  params.append('access_token', pageAccessToken);
  if (shareUrl) {
    params.append('link', shareUrl);
  }

  try {
    const response = await axios.post(url, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 15000,
    });

    console.log(`[FacebookPublisher Success]: Post published successfully to Page (${pageId}). Post ID: ${response.data?.id}`);
    return {
      success: true,
      postId: response.data?.id,
      data: response.data,
    };
  } catch (error) {
    let errorMessage = 'An unknown network error occurred while publishing to Facebook.';

    if (axios.isAxiosError(error)) {
      const graphError = error.response?.data?.error;
      if (graphError) {
        // Meta Graph API error format (OAuthException, perms errors, expired token)
        errorMessage = `Meta Graph API v26.0 Error [${graphError.type || 'OAuthException'}]: ${graphError.message} (Code: ${graphError.code}${graphError.error_subcode ? `, Subcode: ${graphError.error_subcode}` : ''})`;
      } else if (error.response) {
        errorMessage = `HTTP Error ${error.response.status}: ${error.response.statusText}`;
      } else if (error.request) {
        errorMessage = 'Network Error: No response received from Facebook Graph API servers.';
      } else {
        errorMessage = error.message;
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    console.error(`[FacebookPublisher Exception]: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
