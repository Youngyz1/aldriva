"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * Shared, module-level auth status for lightweight "is the visitor logged in?"
 * checks (e.g. the save/heart toggle on every event card). Reads the session
 * once and subscribes to auth changes once, fanning the result out to every
 * consumer — so N cards don't trigger N session reads or N listeners.
 *
 * Returns `null` while the initial check is in flight, then a boolean.
 */
let cached: boolean | null = null;
let initialized = false;
const subscribers = new Set<(value: boolean) => void>();

function broadcast(value: boolean) {
  cached = value;
  subscribers.forEach((notify) => notify(value));
}

function initOnce() {
  if (initialized) return;
  initialized = true;
  supabase.auth
    .getSession()
    .then(({ data }) => broadcast(Boolean(data.session?.user)))
    .catch(() => broadcast(false));
  supabase.auth.onAuthStateChange((_event, session) =>
    broadcast(Boolean(session?.user))
  );
}

export function useAuthStatus(): boolean | null {
  const [status, setStatus] = useState<boolean | null>(cached);

  useEffect(() => {
    initOnce();
    if (cached !== null) setStatus(cached);
    const notify = (value: boolean) => setStatus(value);
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
    };
  }, []);

  return status;
}
