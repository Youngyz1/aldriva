"use client";

import { FormEvent, useEffect, useState } from "react";

type ScreenState = "checking" | "phone" | "invalid" | "unavailable" | "accepted";

export default function KitchenAcceptPage() {
  const [state, setState] = useState<ScreenState>("checking");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const token = window.location.hash.slice(1);
    // The invite secret is in the fragment, never the request URL or referrer.
    // Remove it before the page becomes interactive or any client analytics can run.
    window.history.replaceState(null, "", window.location.pathname);
    const hasToken = /^[0-9a-f]{64}$/i.test(token);
    let cancelled = false;

    async function checkSessionAndInvitation() {
      let sessionResponse: Response | null = null;
      try {
        sessionResponse = await fetch("/api/kitchen/session", { cache: "no-store" });
      } catch {
        // A valid invitation can still be checked below; without one, a failed
        // session check is not evidence that the link is invalid.
      }
      if (cancelled) return;

      if (sessionResponse?.ok) {
        let session: unknown;
        try {
          session = await sessionResponse.json();
        } catch {
          setError("Kitchen access could not be checked. Refresh this page and try again.");
          setState("unavailable");
          return;
        }
        if (session && typeof session === "object" && "role" in session && session.role === "cook") {
          window.location.replace("/kitchen");
          return;
        }
        setError("This browser has an active session for a different worker role.");
        setState("unavailable");
        return;
      }

      if (sessionResponse && sessionResponse.status !== 401 && !hasToken) {
        setError("Kitchen access could not be checked. Refresh this page and try again.");
        setState("unavailable");
        return;
      }

      if (!hasToken) {
        setError("This invitation link is invalid or expired. Ask the business owner for a new link.");
        setState("invalid");
        return;
      }

      try {
        const response = await fetch("/api/kitchen/accept/bootstrap", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (cancelled) return;
        if (response.ok) {
          setState("phone");
          return;
        }
        if (response.status === 400) {
          setError("This invitation link is invalid or expired. Ask the business owner for a new link.");
          setState("invalid");
          return;
        }
        setError("Kitchen access could not be checked. Refresh this page and try again.");
        setState("unavailable");
      } catch {
        if (cancelled) return;
        setError("Kitchen access could not be checked. Refresh this page and try again.");
        setState("unavailable");
      }
    }

    void checkSessionAndInvitation();
    return () => { cancelled = true; };
  }, []);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[0-9]{4}$/.test(phoneLast4)) {
      setError("Enter exactly four digits.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/kitchen/accept", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneLast4 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to accept this invitation.");
      setState("accepted");
      window.location.replace("/kitchen");
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to accept this invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center px-4 py-10">
      <section className="w-full rounded-xl border border-zinc-200 bg-white p-6 shadow-xs sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kitchen access</p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-950">Accept your cook invitation</h1>
        {state === "checking" && <p className="mt-4 text-sm text-zinc-600">Checking this invitation…</p>}
        {state === "phone" && (
          <form className="mt-5 space-y-4" onSubmit={accept}>
            <label className="block text-sm font-medium text-zinc-800" htmlFor="phone-last4">
              Last four digits of the phone number on your invitation
            </label>
            <input
              id="phone-last4"
              inputMode="numeric"
              autoComplete="off"
              pattern="[0-9]{4}"
              maxLength={4}
              value={phoneLast4}
              onChange={(event) => setPhoneLast4(event.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              className="min-h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-base text-zinc-950 outline-none focus:border-orange-700 focus:ring-2 focus:ring-orange-200"
              required
            />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={busy || phoneLast4.length !== 4}
              className="min-h-11 w-full rounded-xl bg-[var(--primary)] px-4 py-2.5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Checking…" : "Accept invitation"}
            </button>
          </form>
        )}
        {state === "invalid" && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error || "This invitation link is invalid or expired. Ask the business owner for a new link."}
          </p>
        )}
        {state === "unavailable" && (
          <p role="alert" className="mt-4 text-sm text-amber-800">
            {error || "Kitchen access could not be checked. Refresh this page and try again."}
          </p>
        )}
        {state === "accepted" && (
          <p role="status" className="mt-4 text-sm text-zinc-700">
            Your cook access is ready. Keep this browser private; your kitchen dashboard will open here.
          </p>
        )}
      </section>
    </main>
  );
}
