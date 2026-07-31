"use client";

import { useFollow, type FollowTargetType } from "@/hooks/use-follow";

interface FollowButtonProps {
  targetType: FollowTargetType;
  targetId: string;
  initialIsFollowing: boolean;
  initialFollowerCount?: number;
  isLoggedIn: boolean;
  onChange?: (state: { isFollowing: boolean; followerCount: number }) => void;
  /** Full className for the button, computed from follow/pending state. */
  className: (state: { isFollowing: boolean; pending: boolean }) => string;
  /** Button contents (icon/label), computed from follow/pending state. */
  children: (state: { isFollowing: boolean; pending: boolean }) => React.ReactNode;
}

/**
 * Shared Follow/Unfollow button for every profile type (users, organizers,
 * future entity types) — wraps useFollow, which is the only client-side path
 * to POST /api/follow. Visual treatment is intentionally left to the caller
 * (via className/children render props) so each profile page can keep its
 * current look until the profile design system unifies it.
 */
export default function FollowButton({
  targetType,
  targetId,
  initialIsFollowing,
  initialFollowerCount = 0,
  isLoggedIn,
  onChange,
  className,
  children,
}: FollowButtonProps) {
  const { isFollowing, pending, toggleFollow } = useFollow({
    targetType,
    targetId,
    initialIsFollowing,
    initialFollowerCount,
    isLoggedIn,
    onChange,
  });

  return (
    <button
      type="button"
      onClick={toggleFollow}
      disabled={pending}
      className={className({ isFollowing, pending })}
    >
      {children({ isFollowing, pending })}
    </button>
  );
}
