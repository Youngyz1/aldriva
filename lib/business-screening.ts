// lib/business-screening.ts
// Pure screening engine for business listings — no I/O, deterministic, side-effect free.
// Caller supplies context (owner age, prior listings etc) so this file stays unit-testable.

export const APPROVE_THRESHOLD = 30;
export const REJECT_THRESHOLD = 70;
// queue is (APPROVE_THRESHOLD+1) .. (REJECT_THRESHOLD-1) → 31..69

export const DISPOSABLE_EMAIL_DOMAINS = [
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "mailinator.com",
  "yopmail.com",
  "throwawaymail.com",
  "getnada.com",
  "dispostable.com",
] as const;

export const SENSITIVE_CATEGORIES = [
  "health",
  "medical",
  "clinic",
  "hospital",
  "finance",
  "lending",
  "investment",
  "loan",
  "alcohol",
  "tobacco",
  "vaping",
  "vape",
  "cannabis",
  "marijuana",
  "firearms",
  "guns",
  "weapons",
  "adult",
  "escort",
  "gambling",
  "casino",
  "betting",
  "legal",
  "immigration",
  "lawyer",
  "attorney",
] as const;

const HARD_BLOCK_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /crypto.*doubling/i, reason: "Hard-block: crypto doubling scam" },
  { pattern: /guaranteed returns/i, reason: "Hard-block: guaranteed returns" },
  { pattern: /\b(escort|adult escort|porn)\b/i, reason: "Hard-block: adult/escort" },
  { pattern: /counterfeit|replica.*(?:rolex|gucci|prada|lv\b)/i, reason: "Hard-block: counterfeit/replica brand" },
  { pattern: /verify your account.*click here/i, reason: "Hard-block: phishing" },
];

const SOFT_PATTERNS: { pattern: RegExp; reason: string; score: number }[] = [
  { pattern: /guaranteed/i, reason: "Soft: guaranteed claim", score: 15 },
  { pattern: /make money fast/i, reason: "Soft: make money fast", score: 20 },
  { pattern: /crypto/i, reason: "Soft: crypto mention", score: 10 },
  { pattern: /replica/i, reason: "Soft: replica mention", score: 15 },
  { pattern: /adult/i, reason: "Soft: adult mention", score: 10 },
];

export interface ScreenInput {
  name: string;
  description: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  industry?: string | null;
  category?: string | null;
  business_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

export interface ScreenContext {
  ownerAccountAgeDays: number;
  ownerEmailVerified: boolean;
  ownerPriorActiveListings: number;
  ownerPriorRejectedListings: number;
  listingsCreatedLast24h: number;
  duplicateMatches: { byName: number; byWebsite: number; byPhone: number };
}

export interface ScreenResult {
  decision: "approve" | "queue" | "reject";
  riskScore: number;
  reasons: string[];
}

function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}
function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}
function normalizePhone(p: string): string {
  return p.replace(/\D/g, "");
}
function isValidWebsiteShape(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  // Accept http/https or bare domain with a dot, no spaces, at least one dot
  if (/^(https?:\/\/)/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return !!u.hostname.includes(".");
    } catch {
      return false;
    }
  }
  // Bare domain like example.com
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(trimmed) && !trimmed.includes(" ");
}
function isFakePhone(phone: string): { fake: boolean; reason?: string } {
  const digits = normalizePhone(phone);
  if (digits.length < 7) return { fake: true, reason: "Fake phone: too short" };
  if (/^(\d)\1+$/.test(digits)) return { fake: true, reason: "Fake phone: all same digit" };
  if (/^1234567/.test(digits) || /^0000000/.test(digits)) return { fake: true, reason: "Fake phone: sequential/zeros" };
  return { fake: false };
}

function isSensitiveCategory(input: ScreenInput): boolean {
  const text = `${input.industry || ""} ${input.category || ""} ${input.business_type || ""}`.toLowerCase();
  return SENSITIVE_CATEGORIES.some((kw) => text.includes(kw));
}

// Optional AI extension point — default off, no dependency. If BUSINESS_AI_MODERATION=on,
// caller could invoke an LLM here. This file itself never calls AI; it just exposes a hook.
export const AI_MODERATION_ENABLED = process.env.BUSINESS_AI_MODERATION === "on";

export function screenBusiness(input: ScreenInput, context: ScreenContext): ScreenResult {
  let riskScore = 0;
  const reasons: string[] = [];
  let hardBlock = false;

  // Rate limit
  if (context.listingsCreatedLast24h > 20) {
    return { decision: "reject", riskScore: 100, reasons: ["Rate limit: more than 20 listings in 24h"] };
  }
  if (context.listingsCreatedLast24h > 5) {
    riskScore += 25;
    reasons.push("Rate limit: more than 5 listings in 24h");
  }

  // Disposable email, invalid website, fake phone
  if (input.email) {
    const domain = input.email.split("@")[1]?.toLowerCase();
    if (domain && (DISPOSABLE_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
      riskScore += 20;
      reasons.push(`Disposable email domain: ${domain}`);
    }
  }
  if (input.website && !isValidWebsiteShape(input.website)) {
    riskScore += 15;
    reasons.push("Invalid website URL shape");
  }
  if (input.phone) {
    const fake = isFakePhone(input.phone);
    if (fake.fake) {
      riskScore += 20;
      reasons.push(fake.reason!);
    }
  }

  // Blocklist hard/soft
  const desc = `${input.name} ${input.description}`;
  for (const hb of HARD_BLOCK_PATTERNS) {
    if (hb.pattern.test(desc)) {
      hardBlock = true;
      reasons.push(hb.reason);
    }
  }
  for (const sp of SOFT_PATTERNS) {
    if (sp.pattern.test(desc)) {
      riskScore += sp.score;
      reasons.push(sp.reason);
    }
  }
  // Excessive links or emails in description
  const linkCount = (input.description.match(/https?:\/\//gi) || []).length + (input.description.match(/www\./gi) || []).length;
  const emailCount = (input.description.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).length;
  if (linkCount >= 3 || emailCount >= 2) {
    riskScore += 20;
    reasons.push("Description contains excessive links/emails");
  }
  if (linkCount >= 5) {
    // mostly URLs
    const urlChars = (input.description.match(/https?:\/\/\S+/g) || []).join("").length;
    if (urlChars > input.description.length * 0.5) {
      riskScore += 15;
      reasons.push("Description is mostly URLs");
    }
  }

  // Duplicate detection
  const totalDupes = context.duplicateMatches.byName + context.duplicateMatches.byWebsite + context.duplicateMatches.byPhone;
  if (totalDupes >= 3) {
    hardBlock = true;
    reasons.push(`Duplicate: ${totalDupes} matches with existing active listings`);
  } else if (totalDupes > 0) {
    riskScore += 25;
    reasons.push(`Duplicate: ${totalDupes} match(es) with existing active listings`);
  } else {
    // Also check individual counts for finer reason
    if (context.duplicateMatches.byName > 0) {
      riskScore += 10;
      reasons.push("Duplicate name with active listing");
    }
    if (context.duplicateMatches.byWebsite > 0) {
      riskScore += 10;
      reasons.push("Duplicate website with active listing");
    }
    if (context.duplicateMatches.byPhone > 0) {
      riskScore += 10;
      reasons.push("Duplicate phone with active listing");
    }
  }

  // ALL-CAPS / repeated-char spam
  if (input.name === input.name.toUpperCase() && /[A-Z]/.test(input.name) && input.name.length > 5) {
    riskScore += 15;
    reasons.push("Spam: ALL-CAPS name");
  }
  if (/(.)\1{4,}/.test(input.description)) {
    riskScore += 10;
    reasons.push("Spam: repeated characters");
  }
  // Name stuffed with keywords/locations (heuristic: name contains >4 comma-separated parts or >3 locations)
  if (input.name.split(",").length > 4 || input.name.split(" ").length > 8 && / (NY|LA|London|Paris|Berlin)/i.test(input.name)) {
    riskScore += 15;
    reasons.push("Name stuffed with keywords/locations");
  }

  // Sensitive categories ALWAYS queue regardless of score
  const sensitive = isSensitiveCategory(input);
  if (sensitive) {
    reasons.push(`Sensitive category: ${input.category || input.industry} requires manual review`);
  }

  // Trust signals: reduce risk
  if (context.ownerEmailVerified) {
    riskScore -= 5;
    reasons.push("Trust: verified email (-5)");
  }
  if (context.ownerAccountAgeDays > 7) {
    riskScore -= 10;
    reasons.push("Trust: account age >7 days (-10)");
  }
  if (context.ownerPriorActiveListings >= 1) {
    riskScore -= 10;
    reasons.push("Trust: prior active listings (-10)");
  }
  // Prior rejections raise
  if (context.ownerPriorRejectedListings > 0) {
    riskScore += 15 * context.ownerPriorRejectedListings;
    reasons.push(`Prior rejections: ${context.ownerPriorRejectedListings} (+${15 * context.ownerPriorRejectedListings})`);
  }

  // Clamp
  riskScore = Math.max(0, Math.min(100, riskScore));

  // Thresholds
  let decision: ScreenResult["decision"];
  if (hardBlock || context.listingsCreatedLast24h > 20) {
    decision = "reject";
    riskScore = Math.max(riskScore, REJECT_THRESHOLD);
  } else if (sensitive) {
    decision = "queue";
  } else if (riskScore <= APPROVE_THRESHOLD) {
    decision = "approve";
  } else if (riskScore >= REJECT_THRESHOLD) {
    decision = "reject";
  } else {
    decision = "queue";
  }

  // Duplicate 1-2 should queue even if score is low (trust would otherwise approve)
  if (totalDupes > 0 && totalDupes < 3 && decision === "approve") {
    decision = "queue";
    riskScore = Math.max(riskScore, APPROVE_THRESHOLD + 1);
  }

  // Ensure riskScore reflects decision threshold extremes for hard blocks
  if (decision === "reject" && riskScore < REJECT_THRESHOLD) riskScore = REJECT_THRESHOLD;
  if (decision === "approve" && riskScore > APPROVE_THRESHOLD) riskScore = Math.min(riskScore, APPROVE_THRESHOLD);

  // Optional AI hook (default off, no dependency) — leave as no-op
  // if (AI_MODERATION_ENABLED) { /* call LLM and merge result */ }

  return { decision, riskScore, reasons: reasons.filter(Boolean) };
}
