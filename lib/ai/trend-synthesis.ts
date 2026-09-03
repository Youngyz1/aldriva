/**
 * lib/ai/trend-synthesis.ts
 *
 * Synthesizes structured trend insights from quarantined research data (RSS feeds, web searches, URL summaries)
 * and manages proposed content ideas in the ai_content_calendar table.
 *
 * Output is strictly grounded in retrieved source data and guarded via guardBeforeDisplay() before presentation.
 */

import { createClient } from '@supabase/supabase-js';
import { getAIProvider } from './provider-factory';
import { guardBeforeDisplay } from './output-guard';

export type SuggestedPlatform =
  | 'facebook'
  | 'instagram'
  | 'twitter'
  | 'linkedin'
  | 'email'
  | 'general';

export type SuggestedFormat =
  | 'story'
  | 'post'
  | 'reel'
  | 'newsletter'
  | 'carousel'
  | 'article';

export type ContentCalendarStatus =
  | 'proposed'
  | 'scheduled'
  | 'dismissed'
  | 'published';

export interface TrendInsight {
  id?: string;
  topic: string;
  whyItMatters: string;
  aldrivaAngle: string;
  suggestedPlatform: SuggestedPlatform;
  suggestedFormat: SuggestedFormat;
  originalPlatform?: string;
  originalFormat?: string;
  sourceTrend?: string;
  sourceUrl?: string;
}

export interface SynthesizeTrendsOptions {
  maxTrends?: number;
  focusArea?: string;
  providerId?: string;
}

export interface SynthesizeTrendsResult {
  success: boolean;
  trends: TrendInsight[];
  rawModelText: string;
  guardedText: string;
  error?: string;
}

export interface CalendarItemRow {
  id: string;
  topic: string;
  why_it_matters?: string;
  aldriva_angle?: string;
  suggested_platform: string;
  suggested_format: string;
  source_trend?: string;
  source_url?: string;
  status: ContentCalendarStatus;
  target_date?: string;
  admin_notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Synthesizes actionable trend insights from quarantined external research data.
 *
 * @param quarantinedContent - Data wrapped in structural untrusted delimiters from Phase 1/2 tools.
 * @param options - Optional synthesis configuration (focusArea, maxTrends, provider).
 */
export async function synthesizeTrends(
  quarantinedContent: string,
  options?: SynthesizeTrendsOptions
): Promise<SynthesizeTrendsResult> {
  if (!quarantinedContent || quarantinedContent.trim().length === 0) {
    return {
      success: false,
      trends: [],
      rawModelText: '',
      guardedText: '',
      error: 'Quarantined content is empty; cannot synthesize trends.',
    };
  }

  const maxTrends = Math.min(Math.max(options?.maxTrends || 2, 1), 3);
  const focusClause = options?.focusArea
    ? `Focus on: "${options.focusArea}".`
    : '';

  const systemPrompt =
    'You are Aldriva Growth Intelligence. Analyze external market research and extract grounded trend observations for community fundraisers.\n' +
    'RULES:\n' +
    '1. Stay strictly grounded in the provided source text. Never invent facts.\n' +
    '2. Return ONLY a JSON array inside ```json codeblock.';

  const userPrompt = [
    `Extract ${maxTrends} distinct trend observations from this research data. ${focusClause}`,
    '',
    quarantinedContent.slice(0, 2500),
    '',
    'Output JSON array format:',
    '```json',
    '[',
    '  {',
    '    "topic": "Concise Trend Headline",',
    '    "whyItMatters": "Why significant based on source data (1-2 sentences)",',
    '    "aldrivaAngle": "Actionable advice for Aldriva organizers (1-2 sentences)",',
    '    "suggestedPlatform": "facebook",',
    '    "suggestedFormat": "post",',
    '    "sourceUrl": "https://source.url"',
    '  }',
    ']',
    '```',
  ].join('\n');

  try {
    const provider = getAIProvider(options?.providerId);
    const generateRes = await provider.generateText(userPrompt, {
      systemPrompt,
      temperature: 0.2,
      maxTokens: 350,
      timeoutMs: 180000,
    });

    const rawModelText = generateRes.text || '';

    // Extract JSON block from model response
    let jsonString = rawModelText;
    const jsonMatch = rawModelText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1];
    } else {
      const arrayMatch = rawModelText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (arrayMatch) {
        jsonString = arrayMatch[0];
      }
    }

    let parsedTrends: Array<Record<string, unknown>> = [];
    try {
      parsedTrends = JSON.parse(jsonString);
      if (!Array.isArray(parsedTrends)) {
        parsedTrends = [parsedTrends];
      }
    } catch (parseErr) {
      console.warn('[trend-synthesis] Could not parse model response as JSON. Falling back to text summary.');
    }

    // Map and run each field through guardBeforeDisplay()
    const validPlatforms: SuggestedPlatform[] = [
      'facebook',
      'instagram',
      'twitter',
      'linkedin',
      'email',
      'general',
    ];
    const validFormats: SuggestedFormat[] = [
      'story',
      'post',
      'reel',
      'newsletter',
      'carousel',
      'article',
    ];

    const guardedTrends: TrendInsight[] = parsedTrends.map((raw) => {
      const rawTopic = String(raw.topic || 'Untitled Trend');
      const rawWhy = String(raw.whyItMatters || '');
      const rawAngle = String(raw.aldrivaAngle || '');
      const rawUrl = raw.sourceUrl ? String(raw.sourceUrl) : undefined;

      const topic = guardBeforeDisplay(rawTopic, 'trend-synthesis.topic');
      const whyItMatters = guardBeforeDisplay(rawWhy, 'trend-synthesis.whyItMatters');
      const aldrivaAngle = guardBeforeDisplay(rawAngle, 'trend-synthesis.aldrivaAngle');

      const rawPlatform = String(raw.suggestedPlatform || '').trim();
      const rawFormat = String(raw.suggestedFormat || '').trim();
      const platformLower = rawPlatform.toLowerCase() as SuggestedPlatform;
      const formatLower = rawFormat.toLowerCase() as SuggestedFormat;

      const isPlatformValid = validPlatforms.includes(platformLower);
      const isFormatValid = validFormats.includes(formatLower);

      const normalizedPlatform: SuggestedPlatform = isPlatformValid ? platformLower : 'general';
      const normalizedFormat: SuggestedFormat = isFormatValid ? formatLower : 'post';

      return {
        topic,
        whyItMatters,
        aldrivaAngle,
        suggestedPlatform: normalizedPlatform,
        suggestedFormat: normalizedFormat,
        originalPlatform: !isPlatformValid && rawPlatform ? rawPlatform : undefined,
        originalFormat: !isFormatValid && rawFormat ? rawFormat : undefined,
        sourceTrend: topic,
        sourceUrl: rawUrl,
      };
    });

    // Guard overall raw text representation
    const guardedText = guardBeforeDisplay(rawModelText, 'trend-synthesis.full_output');

    return {
      success: true,
      trends: guardedTrends,
      rawModelText,
      guardedText,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[trend-synthesis] Synthesis error:', message);
    return {
      success: false,
      trends: [],
      rawModelText: '',
      guardedText: '',
      error: `Trend synthesis failed: ${message}`,
    };
  }
}

/**
 * Saves a synthesized trend insight as a proposed item in the ai_content_calendar table.
 */
export async function saveTrendToCalendar(
  trend: TrendInsight,
  adminNotes?: string
): Promise<{ success: boolean; item?: CalendarItemRow; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return {
      success: false,
      error: 'Supabase credentials missing from environment.',
    };
  }

  try {
    const supabase = createClient(url, key);

    // If platform or format was normalized from a non-standard value, preserve the model's exact suggestion in admin_notes
    const coercionNotes: string[] = [];
    if (trend.originalPlatform) {
      coercionNotes.push(`Original suggested platform: "${trend.originalPlatform}"`);
    }
    if (trend.originalFormat) {
      coercionNotes.push(`Original suggested format: "${trend.originalFormat}"`);
    }

    let finalNotes = adminNotes || '';
    if (coercionNotes.length > 0) {
      const noteStr = `[Model Specifics: ${coercionNotes.join(', ')}]`;
      finalNotes = finalNotes ? `${noteStr} ${finalNotes}` : noteStr;
    }

    const payload = {
      topic: trend.topic,
      why_it_matters: trend.whyItMatters,
      aldriva_angle: trend.aldrivaAngle,
      suggested_platform: trend.suggestedPlatform,
      suggested_format: trend.suggestedFormat,
      source_trend: trend.sourceTrend || trend.topic,
      source_url: trend.sourceUrl || null,
      status: 'proposed',
      admin_notes: finalNotes || null,
    };

    const { data, error } = await supabase
      .from('ai_content_calendar')
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error('[trend-synthesis] Failed to insert into ai_content_calendar:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true, item: data as CalendarItemRow };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Retrieves content calendar items from the database.
 */
export async function getCalendarItems(filter?: {
  status?: ContentCalendarStatus;
  limit?: number;
}): Promise<{ success: boolean; items: CalendarItemRow[]; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return { success: false, items: [], error: 'Supabase credentials missing.' };
  }

  try {
    const supabase = createClient(url, key);
    let query = supabase
      .from('ai_content_calendar')
      .select('*')
      .order('created_at', { ascending: false });

    if (filter?.status) {
      query = query.eq('status', filter.status);
    }
    if (filter?.limit) {
      query = query.limit(filter.limit);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, items: [], error: error.message };
    }

    return { success: true, items: (data || []) as CalendarItemRow[] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, items: [], error: message };
  }
}

/**
 * Updates the status of an item in the ai_content_calendar table.
 */
export async function updateCalendarItemStatus(
  id: string,
  status: ContentCalendarStatus
): Promise<{ success: boolean; error?: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return { success: false, error: 'Supabase credentials missing.' };
  }

  try {
    const supabase = createClient(url, key);
    const { error } = await supabase
      .from('ai_content_calendar')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
