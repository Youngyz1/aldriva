"use client";

/**
 * components/invitation/ShareLinkPanel.tsx
 *
 * Host controls for the general share link (Round 3 COMMIT 3): enable,
 * disable, copy, regenerate (with inline confirmation — rotation kills the
 * old token immediately). Rendered on the invitation home only; hidden on
 * public events. States plainly that anyone with the link can read the page.
 */

import { useState } from "react";
import {
  getShareLinkState,
  setShareEnabled,
  regenerateShareToken,
} from "@/lib/actions/invitation-sharing";

export function ShareLinkPanel({
  eventId,
  initialEnabled,
  initialUrl,
  published,
  isInvitationKind,
}: {
  eventId: string;
  initialEnabled: boolean;
  initialUrl: string | null;
  published: boolean;
  isInvitationKind: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  if (!isInvitationKind) return null;

  async function refresh() {
    const state = await getShareLinkState(eventId);
    if (state.ok) {
      setEnabled(state.enabled ?? false);
      setUrl(state.url ?? null);
    }
  }

  async function handleToggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await setShareEnabled(eventId, next);
      if (!result.ok) {
        setError(result.error ?? "Could not update sharing.");
        return;
      }
      await refresh();
    } catch {
      setError("Could not update sharing.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCopy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Copy failed — select the link manually.");
    }
  }

  async function handleRegenerate() {
    if (!confirmRegen) {
      setConfirmRegen(true);
      return;
    }
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await regenerateShareToken(eventId);
      if (!result.ok) {
        setError(result.error ?? "Could not regenerate the link.");
        return;
      }
      setConfirmRegen(false);
      await refresh();
    } catch {
      setError("Could not regenerate the link.");
    } finally {
      setBusy(false);
    }
  }

  if (!published) {
    return (
      <p className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-500">
        Publish the invitation before sharing it with a general link.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-violet-700">General share link</p>
      {enabled && url ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={url}
              aria-label="General share link"
              className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-700"
            />
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="copy-link"
                onClick={handleCopy}
                className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => handleToggle(false)}
                disabled={busy}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                Disable
              </button>
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={busy}
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-black text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {confirmRegen ? "Click again to confirm" : "Regenerate"}
              </button>
            </div>
          </div>
          <p className="text-[11px] font-semibold text-zinc-500">
            Anyone with this link can read the invitation — no login, no RSVP. Regenerating
            invalidates the old link immediately.
          </p>
        </>
      ) : (
        <>
          <p data-testid="share-prompt" className="text-sm font-semibold text-zinc-600">
            Sharing is off. Enable the general link so anyone with it can read the invitation —
            no login, no RSVP.
          </p>
          <button
            type="button"
            onClick={() => handleToggle(true)}
            disabled={busy}
            className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700 disabled:opacity-50"
          >
            Enable share link
          </button>
        </>
      )}
      {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
