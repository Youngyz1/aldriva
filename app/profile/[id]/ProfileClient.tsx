"use client";

import { useState } from "react";
import FollowButton from "@/components/profile/FollowButton";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

interface ProfileClientProps {
  profile: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  };
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isOwnProfile: boolean;
  isLoggedIn: boolean;
}

export default function ProfileClient({
  profile,
  followerCount: initialFollowerCount,
  followingCount,
  isFollowing: initialIsFollowing,
  isOwnProfile,
  isLoggedIn,
}: ProfileClientProps) {
  const [followerCount, setFollowerCount] = useState(initialFollowerCount);

  const name = profile.display_name || "Aldriva Member";
  const avatarInitial = name.trim().charAt(0).toUpperCase() || "M";

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12 text-zinc-950">
      <section className="mx-auto max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        {/* Avatar + name */}
        <div className="flex items-center gap-5">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <LocalBrandedPlaceholder
              variant="avatar"
              title={name}
              initials={avatarInitial}
              className="h-20 w-20 shrink-0 rounded-full from-emerald-50 to-emerald-50 text-3xl text-emerald-700"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-wide text-emerald-700">
              Public profile
            </p>
            <h1 className="mt-1 truncate text-3xl font-black">{name}</h1>
          </div>
        </div>

        {/* Follower / Following counts */}
        <div className="mt-6 flex gap-6 border-t border-zinc-100 pt-6">
          <div className="text-center">
            <p className="text-2xl font-black text-zinc-950">
              {followerCount.toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-zinc-400">
              Followers
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-zinc-950">
              {followingCount.toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-zinc-400">
              Following
            </p>
          </div>
        </div>

        {/* Follow / Unfollow button — hidden on own profile */}
        {!isOwnProfile && (
          <div className="mt-6">
            <FollowButton
              targetType="user"
              targetId={profile.id}
              initialIsFollowing={initialIsFollowing}
              initialFollowerCount={initialFollowerCount}
              isLoggedIn={isLoggedIn}
              onChange={({ followerCount }) => setFollowerCount(followerCount)}
              className={({ isFollowing }) =>
                `w-full rounded-full py-2.5 text-sm font-bold transition disabled:opacity-60 ${
                  isFollowing
                    ? "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`
              }
            >
              {({ isFollowing, pending }) => (pending ? "…" : isFollowing ? "Following" : "Follow")}
            </FollowButton>
          </div>
        )}
      </section>
    </main>
  );
}
