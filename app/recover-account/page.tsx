"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, CheckCircle, Loader2, RotateCcw } from "lucide-react";

export default function RecoverAccountPage() {
  const router = useRouter();
  const [recovering, setRecovering] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [error, setError] = useState("");

  async function handleRecover() {
    setError("");
    setRecovering(true);
    try {
      const res = await fetch("/api/account/recover", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Recovery failed.");
      setRecovered(true);
      // Redirect to dashboard after 2 seconds
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setRecovering(false);
    }
  }

  if (recovered) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-black text-zinc-900">Account Recovered!</h1>
          <p className="mt-2 text-sm font-medium text-zinc-500">
            Your account has been fully restored. Redirecting you to your dashboard…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">
            Your account is scheduled for deletion
          </h1>
          <p className="mt-2 text-sm font-medium text-zinc-500">
            You initiated an account deletion request. Your data has been hidden from public view
            but has <strong className="text-zinc-700">not</strong> been permanently deleted yet.
          </p>
        </div>

        {/* Info card */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 mb-6">
          <h2 className="text-sm font-black uppercase tracking-wide text-amber-800 mb-3">
            What happens if you do nothing?
          </h2>
          <ul className="space-y-2 text-sm font-medium text-amber-900">
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0">•</span>
              Your profile, organizer pages, events, and fundraisers will be permanently and
              irreversibly deleted when the grace period expires.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0">•</span>
              All personal information will be anonymised and purged from our systems.
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 shrink-0">•</span>
              This action cannot be undone after the grace period.
            </li>
          </ul>
        </div>

        {/* Recovery card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-black text-zinc-900 mb-1">Changed your mind?</h2>
          <p className="text-sm font-medium text-zinc-500 mb-5">
            Click below to cancel the deletion and restore your account immediately. All your
            events, fundraisers, and organizer profiles will be made public again.
          </p>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={handleRecover}
              disabled={recovering}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white transition hover:bg-orange-700 disabled:opacity-60"
            >
              {recovering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Recovering…
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  Recover My Account
                </>
              )}
            </button>

            <Link
              href="/api/auth/signout"
              className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 px-5 py-3 text-sm font-black text-zinc-700 transition hover:bg-zinc-50"
            >
              Sign Out Instead
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
