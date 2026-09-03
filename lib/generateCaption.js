/**
 * lib/generateCaption.js
 *
 * Caption generation service for daily posts, content webhooks, and promotions.
 *
 * Refactored in Phase 4:
 *  - Uses getAIProvider() abstraction instead of direct fetch to Gemini REST endpoint.
 *  - Passes all generated output through guardBeforeDisplay() before returning.
 *  - Preserves exact existing function signatures for generateDailyPost, generateContentCaption,
 *    and generatePromotionCaption.
 */

import { createClient } from '@supabase/supabase-js';
import { getAIProvider } from './ai/provider-factory';
import { guardBeforeDisplay } from './ai/output-guard';

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ── Branded fallback templates ────────────────────────────────────────────────
const brandedTemplateImages = [
  '/daily-post-templates/template-1.png',
  '/daily-post-templates/template-2.png',
  '/daily-post-templates/template-3.png',
  '/daily-post-templates/template-4.png',
  '/daily-post-templates/template-5.png',
];

function getRandomTemplateImage() {
  return brandedTemplateImages[Math.floor(Math.random() * brandedTemplateImages.length)];
}

const dailyTemplates = [
  "💛 Every day is a chance to make a difference. Support Aldriva's mission today!",
  "🌍 Small actions, big impact. Here's how Aldriva is making change happen.",
  "🤝 Together we're stronger. Thank you for standing with Aldriva.",
  "✨ Change starts with people who care — thank you for being part of ours.",
  "📣 Your support fuels real change. See what's happening at Aldriva today.",
  "🌱 Communities grow stronger when we show up for each other. That's what Aldriva is all about.",
  "❤️ Behind every donation, every share, every message — there's a real story of impact.",
  "🙌 We couldn't do this without our incredible community. Thank you for standing with us.",
  "🔎 Curious what your support makes possible? Stop by and see what Aldriva has been up to.",
  "🌟 One act of kindness can ripple further than you think. Be part of that ripple today.",
  "🎉 Every fundraiser starts with someone who cared enough to try. Thank you for caring.",
  "🌈 Hope looks like a community showing up for each other. That's you. That's Aldriva.",
  "📅 Take a moment today to see what's happening around you — there's a cause that needs you.",
  "💬 Have a story about how Aldriva impacted you or your community? We'd love to hear it.",
  "🕊️ Giving isn't about how much — it's about showing up. Thank you for showing up.",
  "🔥 Passion meets purpose when a community comes together. That's the heart of Aldriva.",
  "🎈 Fundraisers aren't just about money — they're about people believing in something together.",
  "🧡 Thank you to everyone who's donated, shared, or simply cheered us on. It matters.",
  "🚀 Big goals start with small steps. Thanks for taking one with us today.",
  "🌻 Every cause has a first supporter. Be someone's first supporter today.",
];

const dailyThemes = [
  "the impact of small daily acts of kindness",
  "how communities grow stronger when people show up for each other",
  "gratitude toward supporters and donors",
  "encouraging someone to become a first-time supporter of a cause",
  "the story behind why people fundraise for causes they care about",
  "hope and encouragement for people facing hard times",
  "the ripple effect of generosity",
  "what it means to give, even in small ways",
  "showing up for your community",
  "believing in something bigger than yourself",
];

function getFallbackTemplate() {
  return dailyTemplates[Math.floor(Math.random() * dailyTemplates.length)];
}

// ── Markdown strip for the Facebook-posting path ────────────────────────────
// Removes constructs Facebook renders as literal characters (e.g. **bold**,
// [text](url)). This is a symptom patch on this output path only — it does NOT
// extend output-guard.ts, whose scope is security/leakage, not formatting.
// Format compliance (no markdown, word limits, emoji rules) is enforced by
// prompt instruction only; see ADR-0002 §6 for the documented asymmetry.
function stripMarkdownFormatting(text) {
  return text
    .replace(/\*{1,3}([\s\S]*?)\*{1,3}/g, '$1') // **bold**, *italic*, ***both***
    .replace(/_{1,3}([\s\S]*?)_{1,3}/g, '$1')    // __underline__, _italic_
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2')   // [label](url) → url only (keeps CTA URL)
    .replace(/`([^`]+)`/g, '$1')                 // `inline code`
    .replace(/#\w+/g, '')                        // #hashtags
    .trim();
}

// ── Provider-agnostic text helper with Output Guard screening ─────────────────
async function callAIGenerateText(prompt, context = 'generateCaption') {
  const provider = getAIProvider();
  const result = await provider.generateText(prompt, {
    temperature: 0.7,
    maxTokens: 1024,
    timeoutMs: 300000,
  });

  const rawText = result.text?.trim();
  if (!rawText) throw new Error('Empty response from AI provider');

  // Strip markdown formatting BEFORE the guard so the guard checks
  // the exact string that will be published, not an intermediate version.
  const cleanText = stripMarkdownFormatting(rawText);

  // Mandatory ADR-0002 Output Guard gate
  return guardBeforeDisplay(cleanText, context);
}

// ── Find a recent, real record to ground the daily post in ───────────────────
async function getGroundedDailyContent() {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data: candidates, error } = await supabase
    .from('fundraisers')
    .select('id, title, story, image_url, slug, created_at')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !candidates || candidates.length === 0) return null;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Caption for a grounded daily post ─────────────────────────────────────────
async function generateGroundedDailyCaption(record) {
  const prompt = `Write a short, warm Facebook post (under 70 words) for a nonprofit called Aldriva, reflecting on this real fundraiser/event:

Title: ${record.title}
Details: ${record.story || ''}

This is a warm reflective/gratitude-style post, NOT a hard sales pitch. Reference the real details naturally.

Rules:
- Plain text only. No Markdown, no asterisks, no formatting symbols.
- Include exactly one relevant emoji at the start.
- Rely only on the details given. Do not invent facts, amounts, or dates.
- Write the complete, finished post only — do not include word counts, reasoning, notes, or explanations.`;

  return callAIGenerateText(prompt, 'generateGroundedDailyCaption');
}

// ── Caption for a theme-based fallback daily post ──────────────────────────────
async function generateThemeDailyCaption() {
  const theme = dailyThemes[Math.floor(Math.random() * dailyThemes.length)];

  const prompt = `Write a short, warm Facebook post (under 60 words) for a nonprofit called Aldriva. The post should be about: ${theme}.

Rules:
- Plain text only. No Markdown, no asterisks, no formatting symbols.
- Include exactly one relevant emoji at the start.
- Write the complete, finished post only — do not include word counts, reasoning, notes, or explanations.`;

  return callAIGenerateText(prompt, 'generateThemeDailyCaption');
}

// ── Main entry point used by daily-post cron ──────────────────────────────────
export async function generateDailyPost() {
  try {
    const record = await getGroundedDailyContent();

    if (record) {
      const caption = await generateGroundedDailyCaption(record);
      return { caption, imageUrl: record.image_url, source: 'grounded', sourceId: record.id };
    }

    const caption = await generateThemeDailyCaption();
    return { caption, imageUrl: getRandomTemplateImage(), source: 'template' };
  } catch (err) {
    console.error('Daily post generation failed or guarded out, using static fallback:', err.message);
    return { caption: getFallbackTemplate(), imageUrl: null, source: 'fallback' };
  }
}

// ── Flow 1: new content webhook ───────────────────────────────────────────────
export async function generateContentCaption({ title, excerpt, url }) {
  const prompt = `Write a short, warm Facebook post (under 80 words) announcing this new update from a nonprofit called Aldriva.

Title: ${title}
Details: ${excerpt}

Rules:
- Plain text only. Do not use Markdown, asterisks, or any formatting symbols.
- Do not include placeholder text, brackets, or instructions to yourself — write the complete, finished post only.
- Write as if this is the final text going live on Facebook right now.`;

  try {
    return await callAIGenerateText(prompt, 'generateContentCaption');
  } catch (err) {
    console.error('AI caption generation failed, using fallback:', err.message);
    return `📣 New update from Aldriva: ${title}! ${excerpt}`;
  }
}

// ── Flow 3: promotion engine ──────────────────────────────────────────────────
export async function generatePromotionCaption(promotion) {
  const { type, title, description, url, cta, metadata } = promotion || {};

  const metadataString = metadata && Object.keys(metadata).length > 0
    ? Object.entries(metadata)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n')
    : '- None';

  const prompt = `Write an engaging, warm Facebook post for a nonprofit organization named Aldriva to promote a "${type || 'listing'}".

Here are the details of the item to promote:
- Title: ${title || ''}
- Description: ${description || ''}
- URL: ${url || ''}
- Call to Action Label: ${cta?.label || 'Learn More'}
- Additional details:
${metadataString}

Rules:
1. Write a natural and engaging Facebook post.
2. Keep it strictly under 120 words.
3. Plain text only. Do not use Markdown, asterisks, bolding, bullet points, or formatting symbols.
4. Include a strong call to action encouraging users to visit the link: ${url || ''}.
5. Use the Call to Action Label "${cta?.label || 'Learn More'}" naturally in the text if possible.
6. Rely ONLY on the provided information. Do not invent details, locations, dates, amounts, or statistics.
7. Use emojis sparingly (maximum 2-3 relevant emojis).
8. Do not use hashtags.
9. Write only the final post content. No notes, no placeholders, no brackets.`;

  try {
    return await callAIGenerateText(prompt, 'generatePromotionCaption');
  } catch (err) {
    console.error('AI promotion caption generation failed, using fallback:', err.message);
    const ctaLabel = cta?.label || 'Learn More';
    const introEmoji = type === 'event' ? '📅' : type === 'fundraiser' ? '❤️' : '📣';
    return `${introEmoji} Support Aldriva: ${title || ''}\n\n${description || ''}\n\n👉 Click here to ${ctaLabel.toLowerCase()}: ${url || ''}`;
  }
}
