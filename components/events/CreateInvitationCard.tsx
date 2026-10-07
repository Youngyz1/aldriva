"use client";

/**
 * components/events/CreateInvitationCard.tsx
 *
 * Third option on the /dashboard/events/new choice grid: an invitation
 * draft (private, builder-first, no tickets) instead of a ticketed event.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createInvitationDraft } from "@/lib/actions/invitation-events";
import { getInvitationDraftKey, clearInvitationDraftKey } from "./invitation-draft-key";

export function CreateInvitationCard() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleClick() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await createInvitationDraft(getInvitationDraftKey());
      if (!result.ok || !result.eventId) {
        setError(result.error ?? "Could not create the invitation.");
        return;
      }
      clearInvitationDraftKey();
      router.push(`/dashboard/events/${result.eventId}/invitation-page/builder`);
    } catch {
      setError("Could not create the invitation.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-sm font-black uppercase tracking-wide text-violet-600">Invitation</p>
      <h2 className="mt-2 text-2xl font-black text-zinc-950">Create invitation</h2>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        Start a private invitation event — no tickets, no public listing. Title, date and venue are
        collected in the builder.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-50"
      >
        {pending ? "Creating…" : "Start Invitation"}
      </button>
      {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}
