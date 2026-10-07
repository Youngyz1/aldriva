"use client";

/**
 * components/events/CreateInvitationButton.tsx
 *
 * "Create invitation" entry point — sits next to every "Create event"
 * button in the dashboard. Creates an invitation draft (kind=invitation,
 * no prior event, no tickets) and redirects straight into the builder.
 *
 * Idempotency: one draft key per "new draft" intent, kept in
 * sessionStorage so double-clicks AND refreshes reuse the same key —
 * the server turns a duplicate slug into fetch-existing.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createInvitationDraft } from "@/lib/actions/invitation-events";
import { getInvitationDraftKey, clearInvitationDraftKey } from "./invitation-draft-key";

export function CreateInvitationButton({
  className,
  label = "Create invitation",
}: {
  className?: string;
  label?: string;
}) {
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
      // Key is single-use per intent: a fresh draft starts a fresh key.
      clearInvitationDraftKey();
      router.push(`/dashboard/events/${result.eventId}/invitation-page`);
    } catch {
      setError("Could not create the invitation.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={cn(
          "shrink-0 rounded-xl border border-orange-200 bg-white px-5 py-3 text-sm font-black text-orange-700 transition hover:bg-orange-50 disabled:opacity-50",
          className
        )}
      >
        {pending ? "Creating…" : label}
      </button>
      {error && <span className="text-xs font-semibold text-red-600">{error}</span>}
    </span>
  );
}
