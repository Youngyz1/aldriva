"use client";

import { cn } from "@/lib/utils";
import { useLocalFollow } from "@/hooks/use-local-article-actions";

export default function FollowButton({ authorId }: { authorId: string }) {
  const { following, toggleFollow } = useLocalFollow(authorId);

  return (
    <button
      type="button"
      onClick={toggleFollow}
      aria-pressed={following}
      className={cn(
        "btn-ripple shrink-0 rounded-full px-4 py-2 text-xs font-black transition",
        following
          ? "border border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          : "bg-orange-600 text-white hover:bg-orange-700"
      )}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
