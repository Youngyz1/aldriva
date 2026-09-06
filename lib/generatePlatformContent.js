/**
 * lib/generatePlatformContent.js
 *
 * About-Aldriva platform content generator for Growth Studio.
 *
 * WHY THIS EXISTS: the events/fundraisers currently in the database are
 * TEST/SEED DATA, not real campaigns. Until the platform has genuine,
 * non-test inventory, Growth Studio must NOT generate or publish content
 * grounded in real events/fundraisers data. This module generates captions
 * ABOUT ALDRIVA ITSELF (mission/vision/use-case framing) from the permanent
 * knowledge base in ai_knowledge_docs — never from events/fundraisers rows.
 *
 * CONTENT_MODE gate (deliberate manual switch — NOT auto-detected):
 *   'platform_only' — ALWAYS generate About-Aldriva content. Grounded paths
 *                     are never called. This is the current target default.
 *   'grounded'      — existing behavior (pull real fundraisers/events).
 *   'auto'          — grounded first, platform fallback when nothing's available.
 *
 * Switch CONTENT_MODE to 'grounded' or 'auto' manually once the platform has
 * real, non-test event/fundraiser inventory. See docs/technical/aldriva-ai.md.
 *
 * Safety layers (defense in depth — prompt instruction alone is not enough):
 *   1. Prompt explicitly lists the hard brand-accuracy rules.
 *   2. checkBrandAccuracy() structurally scans the model output in application
 *      code and THROWS on violation — treated as seriously as the PII/injection
 *      checks in input-guard.ts / output-guard.ts. Violations are audit-logged
 *      to ai_guard_rejections via logRejection().
 *   3. guardBeforeDisplay() output guard runs on every caption, no exceptions.
 *   4. On any failure, a static known-good fallback caption is used.
 */

import { createClient } from '@supabase/supabase-js';
import { getAIProvider } from './ai/provider-factory';
import { guardBeforeDisplay, logRejection } from './ai/output-guard';
import { getSiteUrl } from './site-url';

// Sentinel source_id for platform content (no originating event/fundraiser row).
export const PLATFORM_SOURCE_ID = '00000000-0000-0000-0000-000000000000';

// ── Content mode ─────────────────────────────────────────────────────────────

/**
 * Reads CONTENT_MODE. Fail-closed: unknown/missing values resolve to
 * 'platform_only' so test/seed data can never leak into public posts by
 * misconfiguration.
 */
export function getContentMode() {
  const raw = (process.env.CONTENT_MODE || 'platform_only').toLowerCase().trim();
  if (raw === 'grounded' || raw === 'auto' || raw === 'platform_only') return raw;
  console.warn(`[PlatformContent] Unknown CONTENT_MODE="${raw}" — failing closed to platform_only.`);
  return 'platform_only';
}

// ── Knowledge retrieval ──────────────────────────────────────────────────────

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Hardcoded mirror of migration_95 seed content. Used ONLY when
// ai_knowledge_docs is unreachable (fresh env, migration not yet applied).
// Kept deliberately short — the DB rows are the source of truth.
const FALLBACK_KNOWLEDGE = {
  mission:
    'Aldriva exists to give people and organizations a place to create, discover, connect, support one another, and grow — one identity across events, fundraisers, businesses, articles, and products, not five disconnected accounts.',
  vision:
    'Aldriva is becoming a connected digital ecosystem where people can discover opportunities, create experiences, support causes, grow businesses, share ideas, and participate in their communities — all within one platform, one identity.',
  feature_status:
    'Events: LIVE. Fundraising: LIVE. Articles: BETA (usable, incomplete). Businesses: BETA (usable, incomplete). Digital Products: BETA (usable, incomplete). Event Seating & Invitations: IN DEVELOPMENT — do not mention. Growth Verticals (manifestation, astrology): CONCEPT — never reference. Growth Studio / Aldriva AI: internal tool, never user-facing.',
  content_levels:
    'Level 1 Brand (connected ecosystem), Level 2 Verticals, Level 3 Use cases ("Planning an event?", "Raising money for something that matters?") — Level 3 makes the strongest social copy.',
  content_rules:
    'Never present BETA/IN-DEVELOPMENT/CONCEPT as fully live. General framing for Articles/Businesses/Digital Products. Never mention seating, table assignments, or digital invitations. Never describe Growth Studio/AI as user-facing. Never reference specific fundraiser/event names while inventory is test data.',
};

/**
 * Fetches active permanent-knowledge docs. Returns DB content when available,
 * FALLBACK_KNOWLEDGE otherwise. NEVER queries events/fundraisers tables.
 */
export async function getPlatformKnowledge() {
  const supabase = getSupabaseClient();
  if (!supabase) return { ...FALLBACK_KNOWLEDGE, _source: 'fallback' };

  try {
    const { data, error } = await supabase
      .from('ai_knowledge_docs')
      .select('category, content')
      .eq('active', true)
      .in('category', ['mission', 'vision', 'feature_status', 'content_levels', 'content_rules']);

    if (error || !data || data.length === 0) {
      console.warn('[PlatformContent] ai_knowledge_docs unreachable/empty — using fallback knowledge.');
      return { ...FALLBACK_KNOWLEDGE, _source: 'fallback' };
    }

    const byCategory = Object.fromEntries(data.map((d) => [d.category, d.content]));
    return {
      mission: byCategory.mission || FALLBACK_KNOWLEDGE.mission,
      vision: byCategory.vision || FALLBACK_KNOWLEDGE.vision,
      feature_status: byCategory.feature_status || FALLBACK_KNOWLEDGE.feature_status,
      content_levels: byCategory.content_levels || FALLBACK_KNOWLEDGE.content_levels,
      content_rules: byCategory.content_rules || FALLBACK_KNOWLEDGE.content_rules,
      _source: 'ai_knowledge_docs',
    };
  } catch (err) {
    console.warn('[PlatformContent] knowledge fetch threw — using fallback:', err.message);
    return { ...FALLBACK_KNOWLEDGE, _source: 'fallback' };
  }
}

// ── Structural brand-accuracy enforcement ────────────────────────────────────
// Runs in application code AFTER the model responds. A violation THROWS (like
// output-guard rejections) so the caller falls back to static safe copy.
// This is intentionally separate from prompt instruction: prompts are
// suggestions to the model, this is a gate on what can be published.

const BRAND_VIOLATION_PATTERNS = [
  // Seating & invitations — IN DEVELOPMENT, must never appear publicly.
  { pattern: /seat(?:ing| map|s)?\b/i, reason: 'references seating (not built yet)' },
  { pattern: /table assignment/i, reason: 'references table assignments (not built yet)' },
  { pattern: /digital invitation/i, reason: 'references digital invitations (not built yet)' },
  // Growth Studio / AI as a user-facing feature — internal tool only.
  { pattern: /growth studio/i, reason: 'describes Growth Studio as user-facing (internal tool only)' },
  { pattern: /our AI\b/i, reason: 'describes "our AI" as something users interact with' },
  { pattern: /AI-powered platform/i, reason: 'presents AI as a user-facing platform feature' },
  // CONCEPT verticals — internal ideas only.
  { pattern: /manifestation/i, reason: 'references manifestation content (concept only)' },
  { pattern: /astrolog/i, reason: 'references astrology content (concept only)' },
  // BETA overclaim adjectives applied to the platform as a whole.
  { pattern: /fully[-\s]?featured/i, reason: 'overclaims beta verticals as fully-featured' },
  { pattern: /advanced analytics/i, reason: 'claims unverified advanced functionality' },
  { pattern: /advertis(?:ing|e)/i, reason: 'claims unverified advertising functionality' },
];

/**
 * @throws {Error} when the caption violates a brand-accuracy rule.
 */
export function checkBrandAccuracy(caption, context = 'generatePlatformCaption') {
  if (!caption || typeof caption !== 'string') return caption;
  for (const { pattern, reason } of BRAND_VIOLATION_PATTERNS) {
    if (pattern.test(caption)) {
      const message = `[brand-accuracy] Content rejected before display in "${context}": ${reason} (matched ${pattern.source})`;
      try {
        logRejection(context, 'suspicious_pattern', message, caption, {
          contentType: 'platform',
          sourceId: PLATFORM_SOURCE_ID,
          verdict: 'rejected',
        });
      } catch {
        // Logging must never break the gate itself.
      }
      throw new Error(message);
    }
  }
  return caption;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

function buildPlatformPrompt(knowledge) {
  return `Write a short, warm Facebook post (under 70 words) ABOUT the platform Aldriva itself — not about any specific fundraiser, event, or campaign.

Permanent knowledge (use for framing, do not quote verbatim):
Mission: ${knowledge.mission}
Vision: ${knowledge.vision}
Feature status: ${knowledge.feature_status}
Content framing: ${knowledge.content_levels}
Rules: ${knowledge.content_rules}

Prefer Level 3 use-case framing ("Planning an event?", "Raising money for something that matters?", "Looking for a local business?", "Have something worth sharing?") — Aldriva as the answer.

HARD RULES — violating any of these is a failure, not a style choice:
- Only reference Events and Fundraising vertical CAPABILITIES in general terms ("create and manage real events", "run fundraising campaigns"). NEVER name, describe, or invent any specific fundraiser, event, person, amount, or date.
- NEVER claim Articles, Businesses, or Digital Products are fully-featured — they are usable betas. If you mention them, keep it general ("share your story", "businesses can have a presence", "sell what you create").
- NEVER mention seating, seat maps, table assignments, or digital invitations in any form.
- NEVER mention Growth Studio, "our AI", manifestation, or astrology.
- Plain text only. No Markdown, no asterisks, no hashtags, no formatting symbols.
- Include exactly one relevant emoji at the start.
- Write the complete, finished post only — no word counts, reasoning, notes, or explanations.`;
}

// Same markdown-strip symptom patch as lib/generateCaption.js: Facebook renders
// **bold** / [text](url) literally, so strip before guarding so the guard checks
// the exact string that will be published.
function stripMarkdownFormatting(text) {
  return text
    .replace(/\*{1,3}([\s\S]*?)\*{1,3}/g, '$1')
    .replace(/_{1,3}([\s\S]*?)_{1,3}/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#\w+/g, '')
    .trim();
}

// ── Static safe fallback (known-good, hand-reviewed) ─────────────────────────

const platformFallbacks = [
  '🤝 One place to show up for your community — create events, support causes, and discover what is happening around you on Aldriva.',
  '🌱 Planning an event? Raising money for something that matters? Aldriva brings creating, supporting, and discovering together in one place.',
  '✨ Communities grow stronger when we show up for each other. Create, support, and discover — all with one Aldriva identity.',
  '📅 Got something worth gathering people around? Aldriva is built for creating opportunities and supporting causes, together.',
  '❤️ Every cause starts with someone who cared enough to try. Aldriva gives you a place to create, support, and grow.',
];

function getStaticFallback() {
  return platformFallbacks[Math.floor(Math.random() * platformFallbacks.length)];
}

const brandedTemplateImages = [
  '/daily-post-templates/template-1.png',
  '/daily-post-templates/template-2.png',
  '/daily-post-templates/template-3.png',
  '/daily-post-templates/template-4.png',
  '/daily-post-templates/template-5.png',
];

// Resolved to an ABSOLUTE URL via the canonical getSiteUrl() helper —
// postPhotoToFacebook() fetches this URL server-side and Facebook's Graph API
// needs a real publicly-reachable origin, so a relative path must never leak
// through here (it fails fetch and silently degrades the post to text-only).
function getRandomTemplateImage() {
  const path = brandedTemplateImages[Math.floor(Math.random() * brandedTemplateImages.length)];
  return `${getSiteUrl()}${path}`;
}

// ── Main entry points ────────────────────────────────────────────────────────

/**
 * Generates an About-Aldriva caption: knowledge → model → markdown strip →
 * guardBeforeDisplay → checkBrandAccuracy. Throws on guard/accuracy failure
 * so callers fall through to the static fallback.
 */
export async function generatePlatformCaption() {
  const knowledge = await getPlatformKnowledge();
  const provider = getAIProvider();
  const result = await provider.generateText(buildPlatformPrompt(knowledge), {
    temperature: 0.7,
    maxTokens: 1024,
    timeoutMs: 300000,
  });

  const rawText = result.text?.trim();
  if (!rawText) throw new Error('Empty response from AI provider');

  const cleanText = stripMarkdownFormatting(rawText);
  const guarded = guardBeforeDisplay(cleanText, 'generatePlatformCaption');
  return checkBrandAccuracy(guarded, 'generatePlatformCaption');
}

/**
 * Full platform-content unit for cron routes: caption + branded image +
 * audit write (content_type 'platform'). Never touches events/fundraisers.
 */
export async function generatePlatformContent() {
  try {
    const caption = await generatePlatformCaption();
    const record = {
      caption,
      imageUrl: getRandomTemplateImage(),
      source: 'platform',
      sourceId: PLATFORM_SOURCE_ID,
    };
    await recordPlatformAuditItem(record);
    return record;
  } catch (err) {
    console.error('[PlatformContent] generation failed or guarded out, using static fallback:', err.message);
    const record = {
      caption: getStaticFallback(),
      imageUrl: getRandomTemplateImage(),
      source: 'platform_static',
      sourceId: PLATFORM_SOURCE_ID,
    };
    await recordPlatformAuditItem(record);
    return record;
  }
}

async function recordPlatformAuditItem({ caption, source, sourceId }) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.from('ai_content_items').insert({
      content_type: 'platform',
      source_id: sourceId || PLATFORM_SOURCE_ID,
      snapshot: { source, mode: getContentMode() },
      ai_provider: process.env.AI_PROVIDER_DEFAULT || 'gemini',
      generated_text: caption,
      guard_result: 'pass',
      published: false,
    });
    if (error) console.error('[PlatformContent] ai_content_items insert error:', error.message);
  } catch (err) {
    console.error('[PlatformContent] ai_content_items insert threw:', err.message);
  }
}
