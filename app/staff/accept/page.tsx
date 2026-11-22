"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  INVITE_STORAGE_KEY,
  buildInviteLoginPath,
  isInviteToken,
  parseInviteFragment,
} from "@/lib/staff/invitation-link";

type ScreenState = "checking" | "ready" | "accepting" | "invalid" | "failed" | "network" | "accepted";

// The token is read from the URL fragment, kept in sessionStorage across the
// login round trip, and never logged or shown. Any failure shows ONE message:
// the database gives the same answer for expired, used and wrong-account cases.
export default function StaffAcceptPage() {
  const router = useRouter();
  const [state, setState] = useState<ScreenState>("checking");
  const tokenRef = useRef<string | null>(null);
  const started = useRef(false);

  function clearStoredToken() {
    try {
      window.sessionStorage.removeItem(INVITE_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    let token = parseInviteFragment(window.location.hash);
    if (token) {
      try {
        window.sessionStorage.setItem(INVITE_STORAGE_KEY, token);
      } catch {
        /* storage unavailable: the token stays in memory for this load only */
      }
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      try {
        const stored = window.sessionStorage.getItem(INVITE_STORAGE_KEY);
        token = isInviteToken(stored) ? stored.trim() : null;
      } catch {
        token = null;
      }
    }

    if (!token) {
      setState("invalid");
      return;
    }
    tokenRef.current = token;

    supabase.auth
      .getUser()
      .then(({ data: { user } }) => {
        if (!user) {
          router.replace(buildInviteLoginPath());
          return;
        }
        setState("ready");
      })
      .catch(() => setState("network"));
  }, [router]);

  async function handleAccept() {
    const token = tokenRef.current;
    if (!token || state === "accepting") return;
    setState("accepting");
    try {
      const { data, error } = await supabase.rpc("accept_staff_invitation", { p_token: token });
      clearStoredToken();
      tokenRef.current = null;
      if (error || typeof data !== "string") {
        setState("failed");
        return;
      }
      const { data: staff } = await supabase
        .from("staff_members")
        .select("business_id")
        .eq("id", data)
        .maybeSingle();
      if (staff?.business_id) {
        router.replace(`/dashboard/businesses/${staff.business_id}/staff`);
        return;
      }
      setState("accepted");
    } catch {
      setState("network");
    }
  }

  return (
    <div className="w-full min-h-screen bg-background flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md py-8 text-center space-y-4">
        <h1 className="text-2xl font-black">Staff invitation</h1>

        {state === "checking" && <p className="text-sm text-zinc-500">Checking your invitation...</p>}

        {(state === "ready" || state === "accepting") && (
          <>
            <p className="text-sm text-zinc-600">
              You have been invited to join a team. Accept to link this account to your staff profile.
            </p>
            <button
              type="button"
              onClick={handleAccept}
              disabled={state === "accepting"}
              className="rounded-full bg-orange-600 px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {state === "accepting" ? "Accepting..." : "Accept invitation"}
            </button>
          </>
        )}

        {state === "invalid" && (
          <p className="text-sm text-zinc-600">
            This invitation link is missing or not valid. Open the link from your invitation again.
          </p>
        )}

        {state === "failed" && (
          <p className="text-sm text-red-600">
            This invitation isn't valid for this account, or it has expired. Sign in with the account the
            invitation was sent to, or ask for a new invitation.
          </p>
        )}

        {state === "network" && (
          <p className="text-sm text-red-600">Something went wrong. Check your connection and try again.</p>
        )}

        {state === "accepted" && (
          <>
            <p className="text-sm text-zinc-600">Invitation accepted. Your account is now linked.</p>
            <Link href="/" className="text-sm font-bold text-orange-600 underline">
              Continue
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
