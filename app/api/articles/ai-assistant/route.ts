import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAIProvider } from "@/lib/ai/provider-factory";
import { screenUntrustedInput } from "@/lib/ai/input-guard";
import { screenModelOutput } from "@/lib/ai/output-guard";

const ALLOWED_OPERATIONS = [
  "generate_draft",
  "improve_writing",
  "suggest_metadata",
  "generate_social",
] as const;

type Operation = (typeof ALLOWED_OPERATIONS)[number];

function getSafeModelOutput(text: string, context: string): string {
  const guarded = screenModelOutput(text, context);
  if (guarded.verdict === "rejected") {
    throw new Error(guarded.reason || "Output violated content safety rules.");
  }
  return guarded.sanitised || text;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate author
    const supabase = await createSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Enforce Rate Limit: 30 requests per 60 seconds per user
    const rateLimit = await enforceRateLimit("articleAi", req, user.id);
    if (rateLimit instanceof NextResponse) return rateLimit;

    // 3. Parse and validate body
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const {
      operation,
      topic,
      goal,
      tone,
      audience,
      keyPoints,
      text,
      action,
      title,
      bodyHtml,
      excerpt,
      platform,
    } = body;

    if (!operation || !ALLOWED_OPERATIONS.includes(operation as Operation)) {
      return NextResponse.json(
        { error: `Invalid operation. Allowed: ${ALLOWED_OPERATIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const ai = getAIProvider();

    // ── OPERATION 1: generate_draft ───────────────────────────────────────────
    if (operation === "generate_draft") {
      if (!topic || typeof topic !== "string" || topic.trim().length < 3) {
        return NextResponse.json(
          { error: "Topic must be at least 3 characters" },
          { status: 400 }
        );
      }

      const prompt = `You are an expert editorial writer for Aldriva, a platform for community stories, fundraising journeys, and social impact.
Write a compelling, well-structured article draft based on the following author inputs:
- Topic: ${topic.trim()}
- Goal: ${goal || "Inspire, inform, and engage readers"}
- Tone: ${tone || "Inspiring and authentic"}
- Target Audience: ${audience || "Community supporters and readers"}
- Key Points / Outline Notes: ${keyPoints || "None specified"}

STRICT FORMAT INSTRUCTIONS:
Return a valid JSON object with the following schema:
{
  "title": "A captivating, clear title (between 10 and 90 characters)",
  "excerpt": "A concise summary for search & card previews (max 280 characters)",
  "categories": ["PrimaryCategory", "SecondaryCategory"],
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "seoTitle": "SEO title under 60 characters",
  "seoDescription": "Meta description under 160 characters",
  "bodyHtml": "Rich semantic HTML using <h2>, <h3>, <p>, <ul>, <li>, and <blockquote> tags only. Do NOT use <html>, <body>, <h1>, <script>, or <style> tags."
}
Only output the JSON object with no markdown fences, greetings, or commentary.`;

      const inputCheck = screenUntrustedInput(prompt, "article-ai-draft");
      if (inputCheck.verdict === "rejected") {
        return NextResponse.json(
          { error: inputCheck.reason || "Input rejected by safety guard." },
          { status: 400 }
        );
      }

      const result = await ai.generateText(prompt, { temperature: 0.7 });
      const safeText = getSafeModelOutput(result.text, "article-ai-draft");

      let parsed: any;
      try {
        const cleaned = safeText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1");
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = {
          title: topic.trim(),
          excerpt: "An article about " + topic.trim(),
          categories: ["Community"],
          tags: ["story", "aldriva"],
          bodyHtml: `<h2>${topic.trim()}</h2><p>${safeText.replace(/\n+/g, "</p><p>")}</p>`,
        };
      }

      return NextResponse.json({ success: true, draft: parsed });
    }

    // ── OPERATION 2: improve_writing ──────────────────────────────────────────
    if (operation === "improve_writing") {
      if (!text || typeof text !== "string" || text.trim().length < 5) {
        return NextResponse.json(
          { error: "Text to improve must be at least 5 characters" },
          { status: 400 }
        );
      }

      const act = action || "improve_clarity";
      const userTone = tone || "engaging";

      let instruction = "";
      switch (act) {
        case "fix_grammar":
          instruction =
            "Fix all spelling, punctuation, and grammar mistakes while strictly preserving the original meaning.";
          break;
        case "improve_clarity":
          instruction =
            "Improve clarity, flow, readability, and sentence structure while preserving the core facts.";
          break;
        case "shorten":
          instruction =
            "Make the text concise and punchy without losing essential information.";
          break;
        case "expand":
          instruction =
            "Elaborate with vivid, helpful details and smoother transitions without inventing false facts.";
          break;
        case "change_tone":
          instruction = `Rewrite in a ${userTone} tone while keeping all facts intact.`;
          break;
        case "bullet_points":
          instruction =
            "Convert the key ideas into a clean, well-formatted HTML unordered list (<ul><li>...</li></ul>).";
          break;
        case "write_intro":
          instruction =
            "Write an engaging introductory paragraph leading into this content.";
          break;
        case "write_conclusion":
          instruction =
            "Write a strong, memorable concluding takeaway based on this content.";
          break;
        default:
          instruction = "Improve readability and polish this text.";
      }

      const prompt = `Instruction: ${instruction}
Original text:
"""${text.trim()}"""

Provide ONLY the revised text or HTML snippet. Do not include introductory phrases like "Here is your revised text".`;

      const inputCheck = screenUntrustedInput(prompt, "article-ai-improve");
      if (inputCheck.verdict === "rejected") {
        return NextResponse.json(
          { error: inputCheck.reason || "Input rejected by safety guard." },
          { status: 400 }
        );
      }

      const result = await ai.generateText(prompt, { temperature: 0.6 });
      const safeText = getSafeModelOutput(result.text, "article-ai-improve");

      return NextResponse.json({ success: true, result: safeText.trim() });
    }

    // ── OPERATION 3: suggest_metadata ─────────────────────────────────────────
    if (operation === "suggest_metadata") {
      const content = [title, excerpt, bodyHtml].filter(Boolean).join("\n\n");
      if (content.length < 20) {
        return NextResponse.json(
          { error: "Article content is too short for metadata suggestions" },
          { status: 400 }
        );
      }

      const prompt = `Analyze the following article content and suggest optimized metadata:
Article Content:
"""${content.slice(0, 4000)}"""

Return a valid JSON object with:
{
  "suggestedTitle": "Catchy, accurate title (10-90 chars)",
  "suggestedExcerpt": "Clear, informative summary (max 280 chars)",
  "suggestedCategories": ["Category1", "Category2"],
  "suggestedTags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "seoTitle": "SEO title under 60 characters",
  "seoDescription": "Meta description under 160 characters"
}
Only output the raw JSON object.`;

      const inputCheck = screenUntrustedInput(prompt, "article-ai-meta");
      if (inputCheck.verdict === "rejected") {
        return NextResponse.json(
          { error: inputCheck.reason || "Input rejected by safety guard." },
          { status: 400 }
        );
      }

      const result = await ai.generateText(prompt, { temperature: 0.5 });
      const safeText = getSafeModelOutput(result.text, "article-ai-meta");

      let parsed: any;
      try {
        const cleaned = safeText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1");
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = {
          suggestedTitle: title || "Article",
          suggestedExcerpt: excerpt || "",
          suggestedCategories: ["Community"],
          suggestedTags: ["story"],
          seoTitle: title || "Article",
          seoDescription: excerpt || "",
        };
      }

      return NextResponse.json({ success: true, metadata: parsed });
    }

    // ── OPERATION 4: generate_social ──────────────────────────────────────────
    if (operation === "generate_social") {
      const content = [title, excerpt].filter(Boolean).join(" — ");
      const selectedPlatform = platform || "general";

      const prompt = `Write an engaging social media post for ${selectedPlatform} promoting this article:
Article Title & Summary: "${content}"

Guidelines:
- Compelling hook in the first line.
- Highlights why readers should read it.
- Includes 2-4 relevant hashtags.
- Leaves a placeholder for the link: [Link to article].
- Keep within standard platform length limits (Twitter: < 280 chars; LinkedIn: 2-3 short punchy paragraphs).

Return only the social media post text.`;

      const inputCheck = screenUntrustedInput(prompt, "article-ai-social");
      if (inputCheck.verdict === "rejected") {
        return NextResponse.json(
          { error: inputCheck.reason || "Input rejected by safety guard." },
          { status: 400 }
        );
      }

      const result = await ai.generateText(prompt, { temperature: 0.7 });
      const safeText = getSafeModelOutput(result.text, "article-ai-social");

      return NextResponse.json({ success: true, socialText: safeText.trim() });
    }

    return NextResponse.json({ error: "Unknown operation" }, { status: 400 });
  } catch (err: unknown) {
    console.error("Article AI Assistant error:", err);
    return NextResponse.json(
      { error: "AI assistant service error" },
      { status: 500 }
    );
  }
}
