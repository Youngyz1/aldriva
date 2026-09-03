/**
 * lib/ai/tools/fetch_rss_feed.ts
 *
 * Tier A Research Tool: Fetches RSS 2.0 and Atom XML feeds safely via SSRF guard,
 * parses individual feed entries, and runs per-item prompt injection screening
 * using input-guard so that a poisoned feed item does not discard valid items.
 */

import { AIToolDefinition } from '../types';
import { safeFetchHtml, SsrfBlockedError } from '@/lib/ssrf-guard';
import { screenUntrustedInput, wrapInUntrustedContainer } from '../input-guard';

export const fetchRssFeedDefinition: AIToolDefinition = {
  name: 'fetch_rss_feed',
  description:
    'Fetches and parses an RSS or Atom XML feed from a public URL, validates destinations via SSRF guard, ' +
    'and runs per-item prompt injection screening before returning clean items.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The public URL of the RSS 2.0 or Atom XML feed.',
      },
      maxItems: {
        type: 'number',
        description: 'Maximum number of feed items to return (default: 10, max: 25).',
      },
    },
    required: ['url'],
  },
};

export interface RssItem {
  title: string;
  link: string;
  publishedDate?: string;
  summary: string;
  verdict: 'pass' | 'flagged' | 'rejected';
  flagReason?: string;
}

export interface FetchRssFeedArgs {
  url?: string;
  maxItems?: number;
}

export interface FetchRssFeedResult {
  success: boolean;
  feedUrl: string;
  feedTitle?: string;
  itemCount?: number;
  flaggedCount?: number;
  items?: RssItem[];
  quarantinedContent?: string;
  error?: string;
}

/**
 * Extracts inner text or CDATA from an XML tag.
 */
function extractTagContent(xml: string, tagName: string): string {
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const normalRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const normalMatch = xml.match(normalRegex);
  if (normalMatch) return normalMatch[1].trim();

  return '';
}

/**
 * Parses raw XML body into individual item objects for RSS and Atom formats.
 */
function parseFeedItems(xml: string, limit: number = 10): { feedTitle: string; rawItems: Array<{ title: string; link: string; date: string; content: string }> } {
  let feedTitle = extractTagContent(xml, 'title');
  // Strip potential CDATA or HTML in feedTitle
  feedTitle = feedTitle.replace(/<[^>]+>/g, '').trim();

  const rawItems: Array<{ title: string; link: string; date: string; content: string }> = [];

  // Check for RSS <item> tags
  const rssItemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  if (rssItemMatches.length > 0) {
    for (const itemXml of rssItemMatches.slice(0, limit)) {
      const title = extractTagContent(itemXml, 'title').replace(/<[^>]+>/g, '').trim();
      let link = extractTagContent(itemXml, 'link').trim();
      if (!link) {
        const guid = extractTagContent(itemXml, 'guid');
        if (/^https?:\/\//i.test(guid)) link = guid;
      }
      const date = extractTagContent(itemXml, 'pubDate') || extractTagContent(itemXml, 'dc:date') || '';
      const content =
        extractTagContent(itemXml, 'content:encoded') ||
        extractTagContent(itemXml, 'description') ||
        '';

      rawItems.push({ title, link, date, content });
    }
    return { feedTitle, rawItems };
  }

  // Check for Atom <entry> tags
  const atomEntryMatches = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  if (atomEntryMatches.length > 0) {
    for (const entryXml of atomEntryMatches.slice(0, limit)) {
      const title = extractTagContent(entryXml, 'title').replace(/<[^>]+>/g, '').trim();

      // Atom link can be <link href="..."/> or <link>...</link>
      let link = '';
      const hrefMatch = entryXml.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (hrefMatch) {
        link = hrefMatch[1].trim();
      } else {
        link = extractTagContent(entryXml, 'link').trim();
      }

      const date =
        extractTagContent(entryXml, 'published') ||
        extractTagContent(entryXml, 'updated') ||
        '';
      const content =
        extractTagContent(entryXml, 'content') ||
        extractTagContent(entryXml, 'summary') ||
        '';

      rawItems.push({ title, link, date, content });
    }
    return { feedTitle, rawItems };
  }

  return { feedTitle, rawItems };
}

export async function fetchRssFeed(
  args: FetchRssFeedArgs
): Promise<FetchRssFeedResult> {
  const rawUrl = args.url?.trim();
  const maxItems = Math.min(Math.max(Number(args.maxItems) || 10, 1), 25);

  if (!rawUrl) {
    return {
      success: false,
      feedUrl: '',
      error: 'A valid RSS or Atom feed URL is required.',
    };
  }

  try {
    // 1. Fetch via SSRF Guard (validates public DNS, blocks private/cloud subnets, caps payload)
    const fetchResult = await safeFetchHtml(rawUrl);

    // 2. Parse RSS or Atom structure
    const { feedTitle, rawItems } = parseFeedItems(fetchResult.body, maxItems);

    if (rawItems.length === 0) {
      return {
        success: false,
        feedUrl: fetchResult.finalUrl,
        feedTitle: feedTitle || undefined,
        error: 'No valid RSS <item> or Atom <entry> elements could be parsed from the feed.',
      };
    }

    // 3. Per-item prompt injection screening & sanitization
    const screenedItems: RssItem[] = [];
    let flaggedCount = 0;

    for (const item of rawItems) {
      // Screen title and content separately
      const titleGuard = screenUntrustedInput(
        item.title,
        item.link || fetchResult.finalUrl,
        'input-guard.fetch_rss_feed'
      );
      const contentGuard = screenUntrustedInput(
        item.content,
        item.link || fetchResult.finalUrl,
        'input-guard.fetch_rss_feed'
      );

      const isFlagged = titleGuard.verdict === 'flagged' || contentGuard.verdict === 'flagged';
      if (isFlagged) {
        flaggedCount++;
      }

      screenedItems.push({
        title: titleGuard.sanitizedText || item.title,
        link: item.link,
        publishedDate: item.date || undefined,
        summary: contentGuard.sanitizedText || item.content.replace(/<[^>]+>/g, ' ').slice(0, 300).trim(),
        verdict: isFlagged ? 'flagged' : 'pass',
        flagReason: titleGuard.reason || contentGuard.reason || undefined,
      });
    }

    // 4. Format clean items for model consumption inside untrusted container
    const formattedList = screenedItems
      .map((item, index) => {
        const flagNote = item.verdict === 'flagged' ? ' [FLAGGED & SANITIZED]' : '';
        const lines = [
          `Item ${index + 1}: ${item.title}${flagNote}`,
          item.publishedDate ? `Published: ${item.publishedDate}` : '',
          item.link ? `Link: ${item.link}` : '',
          `Summary: ${item.summary}`,
        ].filter(Boolean);
        return lines.join('\n');
      })
      .join('\n\n---\n\n');

    const quarantinedContent = wrapInUntrustedContainer(
      formattedList,
      fetchResult.finalUrl
    );

    return {
      success: true,
      feedUrl: fetchResult.finalUrl,
      feedTitle: feedTitle || 'Untitled Feed',
      itemCount: screenedItems.length,
      flaggedCount,
      items: screenedItems,
      quarantinedContent,
    };
  } catch (err: unknown) {
    if (err instanceof SsrfBlockedError) {
      console.warn(`[fetch_rss_feed] SSRF Blocked for feed "${rawUrl}":`, err.message);
      return {
        success: false,
        feedUrl: rawUrl,
        error: `Security Block: ${err.message}`,
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(`[fetch_rss_feed] Error fetching feed "${rawUrl}":`, message);
    return {
      success: false,
      feedUrl: rawUrl,
      error: `Failed to fetch feed: ${message}`,
    };
  }
}
