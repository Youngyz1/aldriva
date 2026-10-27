"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  invitationTokenFromFragment,
  invitationUrlWithoutFragment,
} from "@/lib/staff/redeem-link";

export default function RedeemClient() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const capturedTokenRef = useRef("");
  const initialCaptureCompleteRef = useRef(false);
  const [phoneLast4, setPhoneLast4] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    const captureInvitationToken = (event?: Event) => {
      const fragmentToken = invitationTokenFromFragment(window.location.hash);
      if (fragmentToken) {
        capturedTokenRef.current = fragmentToken;
      } else if (event || !initialCaptureCompleteRef.current) {
        // A real hash/popstate transition to a tokenless URL invalidates the
        // prior token. An effect replay with no event keeps the token captured
        // by the first Strict Mode setup, even though that setup scrubbed hash.
        capturedTokenRef.current = "";
      }
      if (!active) return;
      initialCaptureCompleteRef.current = true;
      const invitationToken = capturedTokenRef.current;
      setToken(invitationToken || "");
      setTokenReady(Boolean(invitationToken));
      setError(invitationToken ? "" : "This invitation link is missing or incomplete. Ask the organizer to send a new link.");
      // Save the token into client state before removing the bearer secret from
      // the visible URL. Reuse Next's state to preserve its navigation metadata.
      window.history.replaceState(
        window.history.state,
        "",
        invitationUrlWithoutFragment(window.location.pathname, window.location.search)
      );
    };

    // Handle both normal email navigation and a fragment arriving in a tab
    // where this same route is already mounted (hash changes don't remount it).
    captureInvitationToken();
    window.addEventListener("hashchange", captureInvitationToken);
    window.addEventListener("popstate", captureInvitationToken);
    return () => {
      active = false;
      window.removeEventListener("hashchange", captureInvitationToken);
      window.removeEventListener("popstate", captureInvitationToken);
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !tokenReady || !token || phoneLast4.length !== 4) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/events/team/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ token, phoneLast4 }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.workspaceUrl !== "string") {
        setError(data.error || "This invitation could not be redeemed. Check the details or request a new invitation.");
        return;
      }
      router.replace(data.workspaceUrl);
    } catch {
      setError("Invitation redemption is temporarily unavailable. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-5xl items-center px-4 py-12 sm:px-6">
      <section className="mx-auto w-full max-w-md">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-primary">Event team access</p>
        <h1 className="mt-2 text-2xl font-black text-foreground">Accept your staff invitation</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Enter the last four digits of the phone number the organizer used for this invitation. You do not need an Aldriva account.
        </p>

      <form onSubmit={submit} className="mt-6 space-y-4">
          <Label className="block text-sm font-bold text-foreground" htmlFor="phone-last-four">
            Phone number last four digits
            <Input
              id="phone-last-four"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{4}"
              maxLength={4}
              required
              value={phoneLast4}
              onChange={(event) => setPhoneLast4(event.target.value.replace(/\D/g, "").slice(0, 4))}
              className="mt-2 h-12 px-4 text-lg tracking-[0.35em]"
            />
          </Label>
          {error && <p role="alert" className="border-l-2 border-destructive pl-3 text-sm font-semibold text-destructive">{error}</p>}
          <Button
            type="submit"
            disabled={!tokenReady || !token || submitting || phoneLast4.length !== 4}
            size="lg"
            className="w-full"
          >
            {submitting ? "Verifying invitation…" : "Verify and open staff workspace"}
          </Button>
          {!token && <p className="text-sm text-muted-foreground">If this link does not work, ask the organizer to send a new invitation.</p>}
        </form>
      </section>
    </main>
  );
}
