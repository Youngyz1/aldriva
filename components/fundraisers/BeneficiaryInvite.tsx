"use client";

import { useState } from "react";

/**
 * Organizer-side control for inviting a beneficiary to claim their profile.
 *
 * Only rendered once the fundraiser has a saved beneficiary record — there is
 * nothing to attach an account to before that. Authorisation is enforced
 * server-side in /api/beneficiary/invite (the caller must own a fundraiser
 * naming this beneficiary); this component is only the affordance.
 */
export default function BeneficiaryInvite({
  beneficiaryId,
  beneficiaryName,
  alreadyClaimed,
  initialInviteEmail,
}: {
  beneficiaryId: string;
  beneficiaryName: string;
  alreadyClaimed: boolean;
  initialInviteEmail?: string | null;
}) {
  const [email, setEmail] = useState(initialInviteEmail ?? "");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [manualLink, setManualLink] = useState("");

  if (alreadyClaimed) {
    return (
      <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800">
        {beneficiaryName} has claimed this profile and manages it themselves.
      </p>
    );
  }

  async function sendInvite() {
    setSending(true);
    setError("");
    setMessage("");
    setManualLink("");
    try {
      const res = await fetch("/api/beneficiary/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ beneficiaryId, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send the invite.");

      if (data.emailed) {
        setMessage(`Invite sent to ${email}.`);
      } else {
        // Mail isn't configured — surface the link so the organizer can pass
        // it on rather than the action appearing to fail.
        setManualLink(data.claimUrl ?? "");
        setMessage(data.message ?? "Invite created.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the invite.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-sm font-black text-zinc-950">Invite {beneficiaryName}</p>
      <p className="mt-1 text-xs font-medium text-zinc-500">
        Optional. Sends a link letting them add their own photo, bio and contact
        details. They will not get access to this campaign or its funds.
      </p>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p className="mt-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800">
          {message}
        </p>
      )}
      {manualLink && (
        <p className="mt-2 break-all rounded-lg bg-zinc-50 px-3 py-2 text-[11px] font-medium text-zinc-600">
          {manualLink}
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="beneficiary@example.com"
          className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-semibold outline-none focus:border-brand-600"
        />
        <button
          type="button"
          onClick={sendInvite}
          disabled={sending || !email.trim()}
          className="min-h-[44px] shrink-0 rounded-xl bg-brand-700 px-5 text-sm font-black text-white transition hover:bg-brand-800 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send invite"}
        </button>
      </div>
    </div>
  );
}
