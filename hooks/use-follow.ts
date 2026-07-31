"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export type FollowTargetType = "user" | "organizer";

interface UseFollowOptions {
  targetType: FollowTargetType;
  targetId: string;
  initialIsFollowing: boolean;
  initialFollowerCount: number;
  isLoggedIn: boolean;
  /** Called after a successful toggle with the server's authoritative state. */
  onChange?: (state: { isFollowing: boolean; followerCount: number }) => void;
}

/**
 * The only place in the app that should call POST /api/follow — every
 * follow surface (user profiles, organizer profiles, future entity types)
 * shares this hook instead of writing to the follows / organizer_follows
 * tables directly from the client.
 */
export function useFollow({
  targetType,
  targetId,
  initialIsFollowing,
  initialFollowerCount,
  isLoggedIn,
  onChange,
}: UseFollowOptions) {
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);
  const [pending, setPending] = useState(false);

  const toggleFollow = useCallback(async () => {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    if (pending) return;

    setPending(true);
    try {
      const res = await fetch("/api/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId }),
      });
      const data = await res.json();
      if (data.ok) {
        setIsFollowing(data.following);
        setFollowerCount(data.followerCount);
        onChange?.({ isFollowing: data.following, followerCount: data.followerCount });
      }
    } finally {
      setPending(false);
    }
  }, [targetType, targetId, isLoggedIn, pending, router, onChange]);

  return { isFollowing, followerCount, pending, toggleFollow };
}
