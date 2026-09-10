import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAIProvider } from "@/lib/ai/provider-factory";
import { screenUntrustedInput } from "@/lib/ai/input-guard";
import { screenModelOutput } from "@/lib/ai/output-guard";
import { validateSeatingPlanConfig } from "@/lib/seating";

// --- AI Proposal DTO ----------------------------------------------------------
// Dedicated transfer type, narrower than SeatingSectionConfig.
// No ticketTypeId, no defaultPrice, no spatial coordinates.
// Canonical engine / ManualBuilder own those concerns.

export interface AiSectionProposal {
  name: string;
  mode: "rows" | "tables";
  rowCount?: number;
  seatsPerRow?: number;
  tableCount?: number;
  seatsPerTable?: number;
  tableShape?: "round" | "rect";
  isVip?: boolean;
  isAccessible?: boolean;
}

export interface AiSeatingProposal {
  sections: AiSectionProposal[];
  assumptions: string[];
  questions: string[];
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const MAX_HISTORY_TURNS = 4;
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_CHARS = 8000;

// Allow the full provider window to elapse before the platform kills the
// request. The provider default (15s) is shorter than AI_TIMEOUT_MS and
// would otherwise abort thinking-model responses before first token.
export const maxDuration = 60;

// Thinking models (e.g. gemini-3.6-flash) need well over 15s per response —
// measured ~24s for even a one-word reply. The provider default timeout
// would abort every seating request, so this route explicitly opts into a
// longer window. Failures still surface as the friendly generic 500 below.
const AI_TIMEOUT_MS = 60_000;

// --- Schema validation --------------------------------------------------------

function isValidMode(v: unknown): v is "rows" | "tables" {
  return v === "rows" || v === "tables";
}

function isPositiveInt(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && Math.floor(v) === v;
}

function validateAiSection(raw: unknown, idx: number): AiSectionProposal {
  if (!raw || typeof raw !== "object") throw new Error(`Section [${idx}] is not an object`);
  const s = raw as Record<string, unknown>;

  if (typeof s.name !== "string" || s.name.trim().length === 0) {
    throw new Error(`Section [${idx}]: name must be a non-empty string`);
  }
  if (!isValidMode(s.mode)) {
    throw new Error(`Section [${idx}]: mode must be "rows" or "tables"`);
  }

  const proposal: AiSectionProposal = {
    name: String(s.name).trim().slice(0, 80),
    mode: s.mode,
    isVip: Boolean(s.isVip ?? false),
    isAccessible: Boolean(s.isAccessible ?? false),
  };

  if (s.mode === "rows") {
    if (!isPositiveInt(s.rowCount))
      throw new Error(`Section [${idx}]: rowCount must be a positive integer`);
    if (!isPositiveInt(s.seatsPerRow))
      throw new Error(`Section [${idx}]: seatsPerRow must be a positive integer`);
    proposal.rowCount = Number(s.rowCount);
    proposal.seatsPerRow = Number(s.seatsPerRow);
  } else {
    if (!isPositiveInt(s.tableCount))
      throw new Error(`Section [${idx}]: tableCount must be a positive integer`);
    if (!isPositiveInt(s.seatsPerTable))
      throw new Error(`Section [${idx}]: seatsPerTable must be a positive integer`);
    proposal.tableCount = Number(s.tableCount);
    proposal.seatsPerTable = Number(s.seatsPerTable);
    proposal.tableShape = s.tableShape === "rect" ? "rect" : "round";
  }

  return proposal;
}

function validateProposalJson(raw: unknown): AiSeatingProposal {
  if (!raw || typeof raw !== "object") throw new Error("Model output is not an object");
  const obj = raw as Record<string, unknown>;

  const sections = Array.isArray(obj.sections) ? obj.sections : [];
  const assumptions = Array.isArray(obj.assumptions)
    ? obj.assumptions.filter((a) => typeof a === "string").slice(0, 10)
    : [];
  const questions = Array.isArray(obj.questions)
    ? obj.questions.filter((q) => typeof q === "string").slice(0, 5)
    : [];

  if (sections.length === 0 && questions.length === 0) {
    throw new Error("Model returned neither sections nor questions");
  }

  const validatedSections = sections.map((s, i) => validateAiSection(s, i));

  if (validatedSections.length > 0) {
    const configSections = validatedSections.map((s) => ({
      name: s.name,
      mode: s.mode,
      rowCount: s.rowCount,
      seatsPerRow: s.seatsPerRow,
      tableCount: s.tableCount,
      seatsPerTable: s.seatsPerTable,
      isVip: s.isVip,
      isAccessible: s.isAccessible,
    }));
    const validation = validateSeatingPlanConfig({ sections: configSections });
    if (!validation.valid) {
      throw new Error(`Configuration validation failed: ${validation.errors.join("; ")}`);
    }
  }

  return { sections: validatedSections, assumptions, questions };
}

// --- System prompt ------------------------------------------------------------

function buildSystemPrompt(existingSummary?: Record<string, number>): string {
  const contextBlock = existingSummary
    ? `\nEXISTING LAYOUT CONTEXT (aggregate counts only):\n${JSON.stringify(existingSummary, null, 2)}\n`
    : "";

  return `You are an AI Seating Assistant for Aldriva, an event management platform.
Your ONLY job is to interpret natural language seating descriptions and return structured JSON.

STRICT RULES:
- NEVER generate database UUIDs, seat IDs, ticket IDs, or any persistent identifiers.
- NEVER assign attendees, guests, invitations, or tickets.
- NEVER reference payment information or pricing.
- NEVER include personally identifiable information.
- ONLY produce seating topology: section names, row counts, seat counts, table counts, VIP/accessibility flags.
- If the request is ambiguous or missing critical capacity information, ask ONE clear clarifying question.
- If you make reasonable assumptions, list them in "assumptions".
${contextBlock}
RETURN FORMAT (no markdown fences, no commentary):
{
  "sections": [{
    "name": "string (max 80 chars)",
    "mode": "rows" or "tables",
    "rowCount": positive integer (required if mode=rows),
    "seatsPerRow": positive integer (required if mode=rows),
    "tableCount": positive integer (required if mode=tables),
    "seatsPerTable": positive integer (required if mode=tables),
    "tableShape": "round" or "rect" (optional, default round),
    "isVip": boolean,
    "isAccessible": boolean
  }],
  "assumptions": ["string"],
  "questions": ["string"]
}

If clarification is needed first:
{ "sections": [], "assumptions": [], "questions": ["Your question here"] }

EXAMPLES:
- "5 rows of 10" => [{name:"Main Floor",mode:"rows",rowCount:5,seatsPerRow:10,isVip:false,isAccessible:false}]
- "20 VIP + 80 regular" => two sections, first isVip:true
- "seating for my gala" => questions: ["How many guests, and do you prefer rows, tables, or a mix?"]`;
}

// --- Route handler ------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Event authorization (same helper as sibling seating route)
    const { id: eventId } = await params;
    if (!eventId || typeof eventId !== "string") {
      return NextResponse.json({ error: "Invalid event ID" }, { status: 400 });
    }
    const canManage = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
    if (!canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 3. Rate limit (15 req / 60s per user)
    const rateLimitResponse = await enforceRateLimit("seatingAi", req, user.id);
    if (rateLimitResponse) return rateLimitResponse;

    // 4. Parse body
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const { message, history: rawHistory, existingSummary: rawSummary } = body;

    // 5. Validate message
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json(
        { error: `message must not exceed ${MAX_MESSAGE_CHARS} characters` },
        { status: 400 }
      );
    }

    // 6. Bound conversation history (max 4 turns × 2 roles, max 8000 chars total)
    const history: ConversationTurn[] = [];
    if (Array.isArray(rawHistory)) {
      let historyChars = 0;
      const bounded = rawHistory.slice(-MAX_HISTORY_TURNS * 2);
      for (const turn of bounded) {
        if (
          turn &&
          typeof turn === "object" &&
          (turn.role === "user" || turn.role === "assistant") &&
          typeof turn.content === "string" &&
          turn.content.length > 0
        ) {
          const safe = String(turn.content).slice(0, 1000);
          historyChars += safe.length;
          if (historyChars > MAX_HISTORY_CHARS) break;
          history.push({ role: turn.role as "user" | "assistant", content: safe });
        }
      }
    }

    // 7. Validate existingSummary — aggregate counts only, no PII, no UUIDs
    let existingSummary: Record<string, number> | undefined;
    if (rawSummary && typeof rawSummary === "object" && !Array.isArray(rawSummary)) {
      const s = rawSummary as Record<string, unknown>;
      const allowed = ["totalSeats", "sections", "vipSeats", "regularSeats", "accessibleSeats"];
      const isAggregate =
        Object.keys(s).length > 0 &&
        Object.keys(s).every((k) => allowed.includes(k) && typeof s[k] === "number");
      if (isAggregate) existingSummary = s as Record<string, number>;
    }

    // 8. Screen message for prompt injection
    const inputCheck = screenUntrustedInput(message, "seating-ai-assistant");
    if (inputCheck.verdict === "rejected") {
      return NextResponse.json(
        { error: inputCheck.reason || "Input rejected by safety guard." },
        { status: 400 }
      );
    }
    const safeMessage = inputCheck.sanitizedText || message.trim();

    // 9. Build prompt with bounded conversation context
    const systemPrompt = buildSystemPrompt(existingSummary);
    const ai = getAIProvider();

    let contextBlock = "";
    if (history.length > 0) {
      contextBlock =
        "\n\nCONVERSATION HISTORY (most recent last):\n" +
        history.map((t) => `[${t.role.toUpperCase()}]: ${t.content}`).join("\n") +
        "\n";
    }

    const fullPrompt = `${contextBlock}\n[USER REQUEST]: ${safeMessage}`;

    // 10. Call AI provider
    const aiResult = await ai.generateText(fullPrompt, {
      temperature: 0.3,
      systemPrompt,
      maxTokens: 1200,
      timeoutMs: AI_TIMEOUT_MS,
    });

    // 11. Screen model output for PII / system-prompt echo
    const outputCheck = screenModelOutput(aiResult.text, "seating-ai-assistant");
    if (outputCheck.verdict === "rejected") {
      console.error("[seating-ai-assistant] Model output rejected:", outputCheck.reason);
      return NextResponse.json(
        { error: "AI assistant service error. Please try again." },
        { status: 500 }
      );
    }

    const rawText = outputCheck.sanitised ?? aiResult.text;

    // 12. Parse and validate — strict schema + canonical domain validation
    let proposal: AiSeatingProposal;
    try {
      const cleaned = rawText.replace(/^[\s\S]*?(\{[\s\S]*\})[\s\S]*$/, "$1");
      const parsed = JSON.parse(cleaned);
      proposal = validateProposalJson(parsed);
    } catch (parseErr: unknown) {
      console.error(
        "[seating-ai-assistant] Failed to parse/validate model output:",
        parseErr instanceof Error ? parseErr.message : String(parseErr)
      );
      return NextResponse.json(
        { error: "The AI returned an unexpected response. Please rephrase your request." },
        { status: 422 }
      );
    }

    // 13. Return proposal — NO DB mutations of any kind
    return NextResponse.json({ success: true, proposal });
  } catch (err: unknown) {
    console.error("[seating-ai-assistant] Unexpected error:", err);
    return NextResponse.json(
      {
        error:
          "The seating assistant is temporarily unavailable. You can still build your plan manually.",
      },
      { status: 500 }
    );
  }
}
