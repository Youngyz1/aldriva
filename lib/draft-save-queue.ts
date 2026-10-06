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

export type DraftSaveResult = { ok: boolean; error?: string };

export type SaveStatus = "idle" | "saving" | "saved" | "failed";

export interface SaveQueueState {
  status: SaveStatus;
  error: string | null;
  /** True while a save is in flight or queued (dirty). */
  pending: boolean;
}

export function createDraftSaveQueue<T>(save: (payload: T) => Promise<DraftSaveResult>) {
  let seq = 0;
  let active: Promise<void> | null = null;
  let queued: { seq: number; payload: T } | null = null;
  let lastPayload: T | null = null;
  let state: SaveQueueState = { status: "idle", error: null, pending: false };
  const listeners = new Set<() => void>();

  function emit() {
    state = { ...state, pending: active !== null || queued !== null };
    for (const fn of listeners) fn();
  }

  function setStatus(status: SaveStatus, error: string | null = null) {
    state.status = status;
    state.error = error;
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
      setStatus("saved");
    } else {
      setStatus("failed", result.error ?? "Save failed. Please try again.");
    }
  }

  async function pump(): Promise<void> {
    if (active) return;
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
    await pump();
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
      if (lastPayload !== null) {
        seq += 1;
        queued = { seq, payload: lastPayload };
        void pump();
      }
    },
    /** Resolve once idle (nothing in flight or queued). */
    async flush(): Promise<void> {
      while (active || queued) {
        const current = active ?? pump();
        await current;
      }
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
