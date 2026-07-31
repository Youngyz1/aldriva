/**
 * Shared parsing + validation for the admin donor & comment import (Step 3).
 *
 * Used by BOTH the client-side preview and the server-side commit route so they
 * agree exactly. Row-level errors are collected (not thrown) so valid rows still
 * import while bad ones are flagged.
 *
 * Two input shapes per box, AUTO-DETECTED (pipe wins if most lines contain "|"):
 *
 *   Pipe (manual entry):
 *     Donors:   Name | Date | Amount
 *     Comments: Name | Date | Comment | Likes           (Likes optional -> 0)
 *
 *   Raw (pasted from GoFundMe-style pages):
 *     Donors — 2 lines per entry, with filler blocks between entries skipped:
 *       Name
 *       $Amount RelativeTime            (e.g. "$50 15 hrs")
 *     Comments — multi-line per entry:
 *       Name                            (may repeat once, plain + link -> use once)
 *       RelativeTime
 *       Comment text (may span lines)
 *       LikeCount                       (bare number on its own line; optional)
 *
 * RelativeTime is converted to an actual date relative to today, supporting both
 * numeric-relative ("15 hrs", "2 d", "1 mo") and word-relative ("last week",
 * "month", "yesterday"). Names are used exactly as pasted.
 */

export type DonorImportRow = {
  /** 1-based source line number (of the name), for error reporting + preview. */
  line: number;
  name: string;
  /** Normalized ISO date (YYYY-MM-DD). */
  date: string;
  /** Positive amount, rounded to 2 decimals. */
  amount: number;
};

export type CommentImportRow = {
  line: number;
  name: string;
  date: string;
  body: string;
  likes: number;
};

export type RowError = { line: number; raw: string; reason: string };

export type ParseResult<T> = {
  rows: T[];
  errors: RowError[];
};

// ── Time helpers ────────────────────────────────────────────────────────────

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY; // approximate — we only need a date
const YEAR = 365 * DAY;

const UNIT_MS: Record<string, number> = {
  s: SEC,
  min: MIN,
  h: HOUR,
  d: DAY,
  w: WEEK,
  mo: MONTH,
  y: YEAR,
};

function canonicalUnit(u: string): string | null {
  switch (u) {
    case "s": case "sec": case "secs": case "second": case "seconds": return "s";
    case "min": case "mins": case "minute": case "minutes": return "min";
    case "h": case "hr": case "hrs": case "hour": case "hours": return "h";
    case "d": case "day": case "days": return "d";
    case "w": case "wk": case "wks": case "week": case "weeks": return "w";
    case "mo": case "mos": case "month": case "months": return "mo";
    case "y": case "yr": case "yrs": case "year": case "years": return "y";
    default: return null;
  }
}

/** Lowercase, drop a trailing "ago", collapse spaces. */
function cleanRel(s: string): string {
  return s.trim().toLowerCase().replace(/\s+ago\b/, "").replace(/\s+/g, " ").trim();
}

const WORD_OFFSETS: Record<string, number> = {
  "just now": 0, now: 0, today: 0,
  yesterday: DAY,
  "a minute": MIN, "an hour": HOUR, "a day": DAY, "a week": WEEK, "a month": MONTH, "a year": YEAR,
  "last week": WEEK, "last month": MONTH, "last year": YEAR, "last day": DAY,
  minute: MIN, hour: HOUR, day: DAY, week: WEEK, month: MONTH, year: YEAR,
};

/** Milliseconds-ago for a relative-time phrase, or null if not recognized. */
function relativeTimeToMillisAgo(input: string): number | null {
  const s = cleanRel(input);
  if (!s) return null;
  if (s in WORD_OFFSETS) return WORD_OFFSETS[s];
  const m = s.match(/^(\d+)\s*([a-z]+)$/);
  if (m) {
    const n = Number.parseInt(m[1], 10);
    const unit = canonicalUnit(m[2]);
    if (unit && Number.isFinite(n)) return n * UNIT_MS[unit];
  }
  return null;
}

function isoDateLocal(d: Date): string {
  const p = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${p(d.getFullYear(), 4)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** True if a line is (only) a relative-time phrase — used to delimit entries. */
function isRelativeTimeLine(s: string): boolean {
  return relativeTimeToMillisAgo(s) !== null;
}

/** Relative phrase -> ISO date (YYYY-MM-DD) relative to `now`. */
export function relativeTimeToDate(input: string, now: Date = new Date()): string | null {
  const ms = relativeTimeToMillisAgo(input);
  if (ms === null) return null;
  return isoDateLocal(new Date(now.getTime() - ms));
}

function toIsoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) {
    return null;
  }
  const p = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${p(year, 4)}-${p(month)}-${p(day)}`;
}

/** Explicit date (YYYY-MM-DD, M/D/YYYY, free-form) -> ISO date, or null. */
export function parseImportDate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return toIsoDate(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return toIsoDate(+m[3], +m[1], +m[2]);

  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const dt = new Date(t);
    return toIsoDate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  return null;
}

/** A raw time token may be relative ("15 hrs") or an explicit date. */
function resolveTimeToDate(input: string): string | null {
  return relativeTimeToDate(input) ?? parseImportDate(input);
}

// ── Amount helpers ──────────────────────────────────────────────────────────

/** Strips $ and thousands separators; requires a finite amount > 0. */
export function parseImportAmount(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Parse a raw donor amount line like "$50 15 hrs" -> { amount, rel }. */
function parseAmountLine(line: string): { amount: number; rel: string } | null {
  const m = line.trim().match(/^\$\s*([\d,]+(?:\.\d+)?)\b\s*(.*)$/);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount: Math.round(amount * 100) / 100, rel: m[2].trim() };
}

function parseLikes(input: string | undefined): number {
  const s = (input ?? "").replace(/[,\s]/g, "");
  if (!s) return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function isBareInteger(s: string): boolean {
  return /^\d{1,9}$/.test(s.trim());
}

/** Standalone UI/action words that appear between raw entries. */
const NOISE_WORDS = new Set([
  "donate", "share", "comment", "follow", "reply", "like", "report",
  "see all", "see top", "see top donations", "see more",
]);

// GoFundMe paste noise that sits between/around real entries: avatar initials (a
// lone letter), "Profile photo of X" alt text, the recurring promo sentence, and
// action buttons. Stripped before parsing so entries line up cleanly.
function isNoiseLine(s: string): boolean {
  const t = s.trim();
  if (/^[a-zA-Z]$/.test(t)) return true;
  if (/^profile photo of\b/i.test(t)) return true;
  if (/^each gift brings hope\b/i.test(t)) return true;
  return NOISE_WORDS.has(t.toLowerCase());
}

// ── Line prep ───────────────────────────────────────────────────────────────

type SrcLine = { text: string; n: number };

/** Non-empty, trimmed lines with their ORIGINAL 1-based line numbers. */
function nonEmptyLines(text: string): SrcLine[] {
  return text
    .split(/\r?\n/)
    .map((t, i) => ({ text: t.trim(), n: i + 1 }))
    .filter((l) => l.text.length > 0);
}

function splitCells(line: string): string[] {
  return line.split("|").map((p) => p.trim());
}

function looksLikeHeader(cells: string[], labels: string[]): boolean {
  return labels.every((label, i) => (cells[i] ?? "").toLowerCase() === label);
}

/** Pipe if MORE non-blank lines contain "|" than don't. */
function isPipeFormat(text: string): boolean {
  const lines = nonEmptyLines(text);
  if (lines.length === 0) return false;
  const withPipe = lines.filter((l) => l.text.includes("|")).length;
  return withPipe > lines.length / 2;
}

// ── Donors — pipe path ──────────────────────────────────────────────────────

function parseDonorsPipe(text: string): ParseResult<DonorImportRow> {
  const rows: DonorImportRow[] = [];
  const errors: RowError[] = [];
  let headerChecked = false;

  for (const { text: raw, n } of nonEmptyLines(text)) {
    const cells = splitCells(raw);
    if (!headerChecked) {
      headerChecked = true;
      if (looksLikeHeader(cells, ["name", "date", "amount"])) continue;
    }
    const name = cells[0] ?? "";
    if (!name) {
      errors.push({ line: n, raw, reason: "Missing donor name" });
      continue;
    }
    const date = parseImportDate(cells[1] ?? "");
    if (!date) {
      errors.push({ line: n, raw, reason: `Unparseable date: "${cells[1] ?? ""}"` });
      continue;
    }
    const amount = parseImportAmount(cells[2] ?? "");
    if (amount === null) {
      errors.push({ line: n, raw, reason: `Invalid amount: "${cells[2] ?? ""}"` });
      continue;
    }
    rows.push({ line: n, name, date, amount });
  }
  return { rows, errors };
}

// ── Donors — raw path ───────────────────────────────────────────────────────

function parseDonorsRaw(text: string): ParseResult<DonorImportRow> {
  const rows: DonorImportRow[] = [];
  const errors: RowError[] = [];
  // Strip avatar/promo/button noise so each entry is [Name, $Amount, Time].
  const lines = nonEmptyLines(text).filter((l) => !isNoiseLine(l.text));

  // Anchor on the amount line. The time is either inline ("$50 15 hrs") or on
  // the following line ("$50" then "15 hrs"); the name is the preceding line.
  for (let i = 0; i < lines.length; i++) {
    const amt = parseAmountLine(lines[i].text);
    if (!amt) continue;

    const nameLine = i > 0 ? lines[i - 1] : null;
    if (!nameLine || parseAmountLine(nameLine.text)) {
      errors.push({ line: lines[i].n, raw: lines[i].text, reason: "Amount without a preceding donor name" });
      continue;
    }

    let timeStr = amt.rel;
    let timeLine = lines[i];
    if (!timeStr && i + 1 < lines.length) {
      timeStr = lines[i + 1].text;
      timeLine = lines[i + 1];
    }
    const date = resolveTimeToDate(timeStr);
    if (!date) {
      errors.push({ line: timeLine.n, raw: timeStr || lines[i].text, reason: `Unparseable time: "${timeStr}"` });
      continue;
    }
    rows.push({ line: nameLine.n, name: nameLine.text, date, amount: amt.amount });
  }
  return { rows, errors };
}

// ── Comments — pipe path ────────────────────────────────────────────────────

function parseCommentsPipe(text: string): ParseResult<CommentImportRow> {
  const rows: CommentImportRow[] = [];
  const errors: RowError[] = [];
  let headerChecked = false;

  for (const { text: raw, n } of nonEmptyLines(text)) {
    const cells = splitCells(raw);
    if (!headerChecked) {
      headerChecked = true;
      if (looksLikeHeader(cells, ["name", "date", "comment"])) continue;
    }
    const name = cells[0] ?? "";
    if (!name) {
      errors.push({ line: n, raw, reason: "Missing name" });
      continue;
    }
    const date = parseImportDate(cells[1] ?? "");
    if (!date) {
      errors.push({ line: n, raw, reason: `Unparseable date: "${cells[1] ?? ""}"` });
      continue;
    }
    // Body is everything after the date; a trailing all-numeric cell is Likes,
    // so comment text may itself contain "|".
    const rest = cells.slice(2);
    let likes = 0;
    let bodyCells = rest;
    if (rest.length >= 2 && /^\d[\d,]*$/.test(rest[rest.length - 1])) {
      likes = parseLikes(rest[rest.length - 1]);
      bodyCells = rest.slice(0, -1);
    }
    const body = bodyCells.join(" | ").trim();
    if (!body) {
      errors.push({ line: n, raw, reason: "Missing comment text" });
      continue;
    }
    rows.push({ line: n, name, date, body, likes });
  }
  return { rows, errors };
}

// ── Comments — raw path ─────────────────────────────────────────────────────

function parseCommentsRaw(text: string): ParseResult<CommentImportRow> {
  const rows: CommentImportRow[] = [];
  const errors: RowError[] = [];
  // Strip avatar/button noise so each entry is [Name, Time, body…, LikeCount?].
  const lines = nonEmptyLines(text).filter((l) => !isNoiseLine(l.text));

  // An entry is: Name [Name-again] RelativeTime <body...> [LikeCount].
  // The RelativeTime line right after the name(s) starts an entry; the body runs
  // until a bare-integer LikeCount OR the start of the next entry (name+time).
  const looksLikeEntryStart = (j: number): boolean => {
    if (j >= lines.length) return false;
    if (isRelativeTimeLine(lines[j].text) || isBareInteger(lines[j].text)) return false;
    let k = j + 1;
    if (k < lines.length && lines[k].text.toLowerCase() === lines[j].text.toLowerCase()) k++;
    return k < lines.length && isRelativeTimeLine(lines[k].text);
  };

  let i = 0;
  while (i < lines.length) {
    const nameLine = lines[i];
    if (isRelativeTimeLine(nameLine.text) || isBareInteger(nameLine.text)) {
      i++;
      continue; // stray line, not a name
    }
    let j = i + 1;
    // Collapse a duplicated name (plain line + link line).
    if (j < lines.length && lines[j].text.toLowerCase() === nameLine.text.toLowerCase()) j++;

    if (j >= lines.length || !isRelativeTimeLine(lines[j].text)) {
      errors.push({ line: nameLine.n, raw: nameLine.text, reason: "Expected a relative time after the name" });
      i++;
      continue;
    }
    const relLine = lines[j];
    j++;

    const body: string[] = [];
    while (j < lines.length && !isBareInteger(lines[j].text) && !looksLikeEntryStart(j)) {
      body.push(lines[j].text);
      j++;
    }
    let likes = 0;
    if (j < lines.length && isBareInteger(lines[j].text)) {
      likes = parseLikes(lines[j].text);
      j++;
    }

    const bodyText = body.join("\n").trim();
    const date = resolveTimeToDate(relLine.text);
    if (!bodyText) {
      errors.push({ line: nameLine.n, raw: nameLine.text, reason: "Comment has no text" });
    } else if (!date) {
      errors.push({ line: relLine.n, raw: relLine.text, reason: `Unparseable time: "${relLine.text}"` });
    } else {
      rows.push({ line: nameLine.n, name: nameLine.text, date, body: bodyText, likes });
    }
    i = j;
  }
  return { rows, errors };
}

// ── Public API (auto-detecting) ─────────────────────────────────────────────

export function parseDonorsPaste(text: string): ParseResult<DonorImportRow> {
  return isPipeFormat(text) ? parseDonorsPipe(text) : parseDonorsRaw(text);
}

export function parseCommentsPaste(text: string): ParseResult<CommentImportRow> {
  return isPipeFormat(text) ? parseCommentsPipe(text) : parseCommentsRaw(text);
}

/** Summary shown in the preview before committing. */
export function summarizeDonors(rows: DonorImportRow[]): { count: number; total: number } {
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return { count: rows.length, total: Math.round(total * 100) / 100 };
}
