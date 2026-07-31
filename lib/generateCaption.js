import { supabase } from './supabase'; // ADJUST: path to your Supabase client

// ── Branded fallback templates (used when no real content is available) ──────
const brandedTemplateImages = [
  '/daily-post-templates/template-1.png',
  '/daily-post-templates/template-2.png',
  '/daily-post-templates/template-3.png',
  '/daily-post-templates/template-4.png',
  '/daily-post-templates/template-5.png',
  // ADJUST: populate with your actual template filenames once designed.
  // These should be full public URLs (e.g. your Supabase Storage bucket
  // or your own domain) since postPhotoToFacebook needs a reachable URL.
];

function getRandomTemplateImage() {
  return brandedTemplateImages[Math.floor(Math.random() * brandedTemplateImages.length)];
}

// Pure-text fallback used only if Gemini itself fails entirely
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

// ── Private Gemini text helper ────────────────────────────────────────────────
async function callGeminiText(prompt) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error('Empty response from Gemini');

  return text;
}

// ── Find a recent, real record to ground the daily post in ───────────────────
// ADJUST: table/column names to match your actual schema.
async function getGroundedDailyContent() {
  const { data: candidates, error } = await supabase
    .from('fundraisers') // ADJUST: or a view combining events + fundraisers
    .select('id, title, story, image_url, slug, created_at')
    .not('image_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error || !candidates || candidates.length === 0) return null;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// ── Caption for a grounded (real) daily post ──────────────────────────────────
async function generateGroundedDailyCaption(record) {
  const prompt = `Write a short, warm Facebook post (under 70 words) for a nonprofit called Aldriva, reflecting on this real fundraiser/event:

Title: ${record.title}
Details: ${record.story || ''}

This is a warm reflective/gratitude-style post, NOT a hard sales pitch. Reference the real details naturally.

Rules:
- Plain text only. No Markdown, no asterisks, no formatting symbols.
- Include exactly one relevant emoji at the start.
- Rely only on the details given. Do not invent facts, amounts, or dates.
- Write the complete, finished post only — no placeholders, no notes to yourself.`;

  return callGeminiText(prompt);
}

// ── Caption for a theme-based fallback daily post (no real content available) ─
async function generateThemeDailyCaption() {
  const theme = dailyThemes[Math.floor(Math.random() * dailyThemes.length)];

  const prompt = `Write a short, warm Facebook post (under 60 words) for a nonprofit called Aldriva. The post should be about: ${theme}.

Rules:
- Plain text only. No Markdown, no asterisks, no formatting symbols.
- Include exactly one relevant emoji at the start.
- Write the complete, finished post only — no placeholders, no brackets, no notes to yourself.`;

  return callGeminiText(prompt);
}

// ── Main entry point used by the daily-post cron ──────────────────────────────
// Returns { caption, imageUrl, source } — no more base64 Gemini image generation.
export async function generateDailyPost() {
  try {
    const record = await getGroundedDailyContent();

    if (record) {
      const caption = await generateGroundedDailyCaption(record);
      return { caption, imageUrl: record.image_url, source: 'grounded' };
    }

    const caption = await generateThemeDailyCaption();
    return { caption, imageUrl: getRandomTemplateImage(), source: 'template' };
  } catch (err) {
    console.error('Daily post generation failed, using static fallback:', err.message);
    return { caption: getFallbackTemplate(), imageUrl: null, source: 'fallback' };
  }
}

// ── Flow 1: new content webhook (unchanged) ───────────────────────────────────
export async function generateContentCaption({ title, excerpt, url }) {
  const prompt = `Write a short, warm Facebook post (under 80 words) announcing this new update from a nonprofit called Aldriva.

Title: ${title}
Details: ${excerpt}

Rules:
- Plain text only. Do not use Markdown, asterisks, or any formatting symbols.
- Do not include placeholder text, brackets, or instructions to yourself — write the complete, finished post only.
- Write as if this is the final text going live on Facebook right now.`;

  try {
    return await callGeminiText(prompt);
  } catch (err) {
    console.error('Gemini caption generation failed, using fallback:', err.message);
    return `📣 New update from Aldriva: ${title}! ${excerpt}`;
  }
}

// ── Flow 3: promotion engine (unchanged) ──────────────────────────────────────
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
    return await callGeminiText(prompt);
  } catch (err) {
    console.error('Gemini promotion caption generation failed, using fallback:', err.message);
    const ctaLabel = cta?.label || 'Learn More';
    const introEmoji = type === 'event' ? '📅' : type === 'fundraiser' ? '❤️' : '📣';
    return `${introEmoji} Support Aldriva: ${title || ''}\n\n${description || ''}\n\n👉 Click here to ${ctaLabel.toLowerCase()}: ${url || ''}`;
  }
}
