"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  related_type: string | null;
  related_id: string | null;
  read_at: string | null;
  created_at: string;
};

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const loadedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      loadedForUserRef.current = null;
      return;
    }

    let active = true;
    loadedForUserRef.current = userId;

    async function load() {
      setLoading(true);
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!active) return;
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications ?? []);
        setUnreadCount(data.unreadCount ?? 0);
      }
      setLoading(false);
    }

    load();

    // Guard against a stale channel from a previous mount that hasn't
    // finished tearing down yet (React's dev-mode double-effect-invoke, or a
    // fast remount from Fast Refresh/HMR): supabase.channel(name) returns the
    // *same* channel object for a topic that's already registered, and
    // calling .on() on an already-subscribed channel throws
    // "cannot add postgres_changes callbacks ... after subscribe()". Removing
    // any existing channel with this topic first guarantees .channel() below
    // always starts from a fresh, not-yet-subscribed instance.
    const topic = `realtime:notifications:${userId}`;
    const stale = supabase.getChannels().find((c) => c.topic === topic);
    if (stale) supabase.removeChannel(stale);

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as NotificationRow;
          setNotifications((current) => [row, ...current]);
          setUnreadCount((count) => count + 1);
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markRead = useCallback(async (id: string) => {
    let wasUnread = false;
    setNotifications((current) =>
      current.map((n) => {
        if (n.id !== id || n.read_at) return n;
        wasUnread = true;
        return { ...n, read_at: new Date().toISOString() };
      })
    );
    if (wasUnread) setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    } catch {
      // Best-effort — a failed mark-as-read isn't worth reverting optimistic UI over.
    }
  }, []);

  return { notifications, unreadCount, loading, markRead };
}
