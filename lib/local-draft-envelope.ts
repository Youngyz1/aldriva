/**
 * Entity-agnostic envelope for anonymous, browser-local drafts.
 *
 * Pure — no IndexedDB, no browser globals, no framework imports. The
 * invitation builder is the only implemented consumer (Phase 5), but
 * nothing here names "invitation" or "builder" anywhere: a future flow
 * (business, product, ...) can reuse this exact envelope shape with its
 * own `kind` and `payload` type.
 *
 * Deliberately excludes any ownership/organizer/event id field from the
 * type itself — not as a runtime filter that could be bypassed, but
 * because the shape has no such field to fill in. Ownership is only ever
 * established server-side, after authentication, at conversion time.
 */

export const LOCAL_DRAFT_SCHEMA_VERSION = 1;
export const DEFAULT_LOCAL_DRAFT_TTL_DAYS = 30;

export interface DraftEnvelope<TPayload = unknown> {
  /** Which flow this draft belongs to, e.g. "invitation". */
  kind: string;
  schemaVersion: number;
  /** Client-generated UUID — becomes the server-side idempotency key at conversion (Phase 6). */
  draftId: string;
  payload: TPayload;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

/**
 * Top-level payload keys that must never appear on a local draft. Not an
 * exhaustive security boundary by itself (the TypeScript payload types
 * simply never declare these fields) — this is a defense-in-depth runtime
 * check for whatever gets handed to `createDraftEnvelope`/`touchDraftEnvelope`,
 * e.g. if a caller accidentally spreads a server-shaped object in.
 */
export const FORBIDDEN_PAYLOAD_KEYS = [
  "userId", "user_id", "organizerId", "organizer_id",
  "eventId", "event_id", "ownerId", "owner_id",
] as const;

export function hasForbiddenPayloadKeys(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return [];
  const keys = Object.keys(payload as Record<string, unknown>);
  return keys.filter((key) => (FORBIDDEN_PAYLOAD_KEYS as readonly string[]).includes(key));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function createDraftEnvelope<TPayload>(params: {
  kind: string;
  draftId: string;
  payload: TPayload;
  now?: Date;
  ttlDays?: number;
}): DraftEnvelope<TPayload> {
  const forbidden = hasForbiddenPayloadKeys(params.payload);
  if (forbidden.length > 0) {
    throw new Error(`Local draft payload must not contain: ${forbidden.join(", ")}`);
  }
  const now = params.now ?? new Date();
  const nowIso = now.toISOString();
  return {
    kind: params.kind,
    schemaVersion: LOCAL_DRAFT_SCHEMA_VERSION,
    draftId: params.draftId,
    payload: params.payload,
    createdAt: nowIso,
    updatedAt: nowIso,
    expiresAt: addDays(now, params.ttlDays ?? DEFAULT_LOCAL_DRAFT_TTL_DAYS).toISOString(),
  };
}

/** Returns a new envelope with an updated payload, createdAt/draftId/kind preserved. */
export function touchDraftEnvelope<TPayload>(
  envelope: DraftEnvelope<TPayload>,
  payload: TPayload,
  options: { now?: Date; ttlDays?: number } = {}
): DraftEnvelope<TPayload> {
  const forbidden = hasForbiddenPayloadKeys(payload);
  if (forbidden.length > 0) {
    throw new Error(`Local draft payload must not contain: ${forbidden.join(", ")}`);
  }
  const now = options.now ?? new Date();
  return {
    ...envelope,
    payload,
    updatedAt: now.toISOString(),
    expiresAt: addDays(now, options.ttlDays ?? DEFAULT_LOCAL_DRAFT_TTL_DAYS).toISOString(),
  };
}

export function isDraftEnvelopeExpired(envelope: Pick<DraftEnvelope, "expiresAt">, now: Date = new Date()): boolean {
  const expiry = Date.parse(envelope.expiresAt);
  if (Number.isNaN(expiry)) return true;
  return expiry <= now.getTime();
}

function isIsoDateString(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

/**
 * Structural shape check only (kind/schemaVersion/draftId/timestamps) — does
 * NOT validate the payload's own shape, since that's kind-specific. Callers
 * narrow further with their own payload validator after this passes.
 */
export function isDraftEnvelopeShape(value: unknown): value is DraftEnvelope<unknown> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.kind === "string" && candidate.kind.length > 0
    && typeof candidate.schemaVersion === "number"
    && typeof candidate.draftId === "string" && candidate.draftId.length > 0
    && "payload" in candidate
    && isIsoDateString(candidate.createdAt)
    && isIsoDateString(candidate.updatedAt)
    && isIsoDateString(candidate.expiresAt)
  );
}

/**
 * Generic adapter contract a kind-specific module implements. `migrate`
 * returns null for an unreadable/unknown schema version — callers must
 * discard, never guess-upgrade untrusted stored data.
 */
export interface DraftAdapter<TPayload> {
  kind: string;
  isPayloadShape(value: unknown): value is TPayload;
  migrate(stored: DraftEnvelope<unknown>): DraftEnvelope<TPayload> | null;
}

/** Runs structural + kind + payload-shape validation, then the adapter's migration. */
export function readDraftEnvelope<TPayload>(
  raw: unknown,
  adapter: DraftAdapter<TPayload>
): DraftEnvelope<TPayload> | null {
  if (!isDraftEnvelopeShape(raw)) return null;
  if (raw.kind !== adapter.kind) return null;
  if (raw.schemaVersion !== LOCAL_DRAFT_SCHEMA_VERSION) return adapter.migrate(raw);
  if (!adapter.isPayloadShape(raw.payload)) return null;
  return raw as DraftEnvelope<TPayload>;
}
