/**
 * lib/draft-save-queue.ts
 *
 * Sequenced autosave queue for the one-page invitation builder.
 *
 * Contract (per approved amendments):
 * - Out-of-order responses are impossible by construction: at most one
 *   save is ever in flight (single-flight pump), so a slow response can
 *   never overwrite a newer one.
 * - While a save is in flight, new requests only replace the single queued
 *   "latest" payload — intermediate states are coalesced, never sent.
 * - When the in-flight save settles, the queued latest (if any) runs next.
 * - `flush()` resolves once the queue is fully drained (route leave /
 *   beforeunload best-effort path). `retry()` re-queues the last payload.
 *
 * DOM-free and unit-tested; the builder wires it to saveInvitationPageDraft.
 */

export type DraftSaveResult = { ok: boolean; error?: string; code?: string };

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

export interface SaveQueueState {
  status: SaveStatus;
  error: string | null;
  code?: string | null;
  /** True while a save is in flight or queued (dirty). */
  pending: boolean;
  /** True after an opt-in stale-draft response until the caller reloads. */
  paused?: boolean;
}

export function createDraftSaveQueue<T>(
  save: (payload: T) => Promise<DraftSaveResult>,
  options: { pauseOnStaleDraft?: boolean } = {}
) {
  let seq = 0;
  let active: Promise<void> | null = null;
  let queued: { seq: number; payload: T } | null = null;
  let lastPayload: T | null = null;
  let paused = false;
  let state: SaveQueueState = { status: "idle", error: null, pending: false };
  const listeners = new Set<() => void>();

  function emit() {
    state = { ...state, pending: active !== null || queued !== null };
    if (paused) state.paused = true;
    else delete state.paused;
    for (const fn of listeners) fn();
  }

  function setStatus(status: SaveStatus, error: string | null = null, code?: string | null) {
    state.status = status;
    state.error = error;
    if (code) state.code = code;
    else delete state.code;
    emit();
  }

  async function run(payload: T): Promise<void> {
    setStatus("saving");
    let result: DraftSaveResult;
    try {
      result = await save(payload);
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : "Save failed." };
    }
    if (result.ok) {
      setStatus("saved", null, null);
    } else {
      if (options.pauseOnStaleDraft && result.code === "STALE_DRAFT") paused = true;
      setStatus("failed", result.error ?? "Save failed. Please try again.", result.code ?? null);
    }
  }

  async function pump(): Promise<void> {
    if (active || paused) return;
    const next = queued;
    queued = null;
    if (!next) {
      emit();
      return;
    }
    active = run(next.payload).finally(() => {
      active = null;
    });
    emit();
    await active;
    // Drain: a newer request may have queued while we were saving.
    if (!paused) await pump();
  }

  return {
    /** Queue a save; coalesces rapid edits to the latest payload. */
    request(payload: T): void {
      seq += 1;
      lastPayload = payload;
      queued = { seq, payload };
      void pump();
    },
    /** Re-queue the last payload (Retry button). No-op if never requested. */
    retry(): void {
      if (lastPayload !== null && !paused) {
        seq += 1;
        queued = { seq, payload: lastPayload };
        void pump();
      }
    },
    /** Resolve once idle (nothing in flight or queued). */
    async flush(): Promise<void> {
      while (active || queued) {
        if (paused && !active) break;
        const current = active ?? pump();
        await current;
      }
    },
    /** Drop the conflicted payload after the caller reloads server state. */
    resetAfterReload(): void {
      queued = null;
      lastPayload = null;
      paused = false;
      setStatus("idle", null, null);
    },
    getState(): SaveQueueState {
      return { ...state };
    },
    subscribe(fn: () => void): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

export type DraftSaveQueue<T> = ReturnType<typeof createDraftSaveQueue<T>>;
