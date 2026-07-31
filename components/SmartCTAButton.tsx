"use client";

/**
 * components/SmartCTAButton.tsx
 * "Get Started" CTA that adapts its destination based on auth state:
 *  - Not logged in              → /signup
 *  - Logged in, no organizer   → /create-organizer
 *  - Logged in, has organizer  → /create-event
 *
 * Uses the browser Supabase client (no server fetch needed).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/lib/supabase";

type State = "loading" | "guest" | "no-org" | "has-org";

const DEST: Record<Exclude<State, "loading">, string> = {
  guest:   "/signup",
  "no-org": "/create-organizer",
  "has-org": "/create-event",
};

const LABEL: Record<Exclude<State, "loading">, string> = {
  guest:    "Get Started",
  "no-org": "Create Organization Profile",
  "has-org": "Create an Event",
};

interface SmartCTAButtonProps {
  className?: string;
}

export default function SmartCTAButton({ className }: SmartCTAButtonProps) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session) {
        setState("guest");
        return;
      }

      // Check whether this user owns an organizer profile
      const { data } = await supabase
        .from("organizers")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (!cancelled) setState(data ? "has-org" : "no-org");
    }

    check();
    return () => { cancelled = true; };
  }, []);

  if (state === "loading") {
    return (
      <span
        className={`inline-flex items-center gap-2 rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white opacity-70 ${className ?? ""}`}
      >
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        Loading…
      </span>
    );
  }

  return (
    <Link
      href={DEST[state]}
      className={`inline-flex items-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-700 px-6 py-3 text-sm font-black text-white transition-colors ${className ?? ""}`}
    >
      {LABEL[state]} <ArrowRight className="w-4 h-4" />
    </Link>
  );
}
