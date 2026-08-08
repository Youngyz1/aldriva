"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import ProfileNotSetUpModal, {
  type ProfileActivity,
} from "@/components/ProfileNotSetUpModal";

type AuthorProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
} | null;

type SupportMessage = {
  id: string;
  author_name: string | null;
  body: string;
  created_at: string;
  user_id?: string | null;
  likes?: number | null;
  liked?: boolean;
  donor_amount?: number | null;
  author_profile?: AuthorProfile;
};

const PAGE_SIZE = 5;

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HeartIcon({ className, filled = true }: { className?: string; filled?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
    >
      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
    </svg>
  );
}

type ModalState = {
  name: string;
  activity: ProfileActivity;
} | null;

/**
 * Clickable like/unlike heart. No login needed; the count shown includes the
 * admin-imported baseline plus real likes. Optimistic, reconciled with the
 * server's authoritative { liked, count } (which handles IP-blocks), reverting
 * on network error. Pre-filled from the visitor's cookie via `initialLiked`.
 */
function LikeButton({
  commentId,
  initialLiked,
  initialCount,
}: {
  commentId: string;
  initialLiked: boolean;
  initialCount: number;
}) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const wasLiked = liked;
    setLiked(!wasLiked);
    setCount((c) => Math.max(0, c + (wasLiked ? -1 : 1)));
    try {
      const res = await fetch(`/api/comments/${commentId}/like`, {
        method: wasLiked ? "DELETE" : "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setLiked(Boolean(data.liked));
      setCount(Number(data.count ?? 0));
    } catch {
      setLiked(wasLiked);
      setCount((c) => Math.max(0, c + (wasLiked ? 1 : -1)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={liked}
      aria-label={liked ? "Unlike this comment" : "Like this comment"}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-black transition disabled:opacity-60 ${
        liked
          ? "bg-rose-100 text-rose-600"
          : "bg-zinc-100 text-zinc-500 hover:bg-rose-50 hover:text-rose-600"
      }`}
    >
      <HeartIcon className="h-3 w-3" filled={liked} />
      {count > 0 && <span>{count}</span>}
    </button>
  );
}

export default function SupportMessages({
  fundraiserId,
}: {
  fundraiserId: string;
}) {
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;

    async function load() {
      setLoading(true);
      const params = new URLSearchParams({
        targetType: "fundraiser",
        targetId: fundraiserId,
        includeDonorAmounts: "true",
        limit: String(PAGE_SIZE),
        offset: "0",
      });
      const res = await fetch(`/api/comments?${params}`, { cache: "no-store" });
      const result = await res.json();
      if (!active || !mountedRef.current) return;
      const rows: SupportMessage[] = result.comments || [];
      setMessages(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setLoading(false);
    }

    load();
    return () => {
      active = false;
      mountedRef.current = false;
    };
  }, [fundraiserId]);

  async function loadMore() {
    setLoadingMore(true);
    const params = new URLSearchParams({
      targetType: "fundraiser",
      targetId: fundraiserId,
      includeDonorAmounts: "true",
      limit: String(PAGE_SIZE),
      offset: String(messages.length),
    });
    const res = await fetch(`/api/comments?${params}`, { cache: "no-store" });
    const result = await res.json();
    const rows: SupportMessage[] = result.comments || [];
    setMessages((current) => [...current, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  return (
    <section>
      <h2 className="text-lg font-black text-zinc-950">Comments</h2>
      <p className="mt-1 text-sm text-zinc-500">Please donate to comment.</p>

      <div className="mt-8 divide-y divide-zinc-100">
        {loading ? (
          <p className="py-5 text-zinc-500">Loading messages…</p>
        ) : messages.length === 0 ? (
          <p className="py-5 text-zinc-500">
            No comments yet. Be the first to start the conversation.
          </p>
        ) : (
          messages.map((msg) => {
            const name = msg.author_name || "Anonymous";
            const profile = msg.author_profile ?? null;
            // Navigate to profile only if they have a customised profile
            // (display_name or avatar_url set). A guest with no user_id, or a
            // registered user who never set one up, both get the modal.
            const hasCustomizedProfile = Boolean(
              profile && (profile.display_name || profile.avatar_url)
            );
            const displayName = profile?.display_name || name;

            return (
              <article key={msg.id} className="py-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 font-black text-zinc-600">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {hasCustomizedProfile ? (
                        <Link
                          href={`/profile/${profile!.id}`}
                          className="font-black text-zinc-950 transition hover:text-brand-700 hover:underline"
                        >
                          {displayName}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setModal({
                              name,
                              activity: {
                                type: "comment",
                                body: msg.body,
                                amount: msg.donor_amount,
                              },
                            })
                          }
                          className="text-left font-black text-zinc-950 hover:underline"
                        >
                          {name}
                        </button>
                      )}
                      {msg.donor_amount != null && msg.donor_amount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-black text-green-700">
                          <HeartIcon className="h-3 w-3" />$
                          {msg.donor_amount}
                        </span>
                      )}
                      <LikeButton
                        commentId={msg.id}
                        initialLiked={Boolean(msg.liked)}
                        initialCount={msg.likes ?? 0}
                      />
                      <p className="text-sm text-zinc-500">
                        {formatDate(msg.created_at)}
                      </p>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap leading-7 text-zinc-700">
                      {msg.body}
                    </p>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="mt-4 w-full rounded-full border border-zinc-300 py-2 text-sm font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {loadingMore ? "Loading..." : "Load more"}
        </button>
      )}

      <ProfileNotSetUpModal
        isOpen={modal !== null}
        onClose={() => setModal(null)}
        name={modal?.name ?? ""}
        activity={
          modal?.activity ?? { type: "comment", body: "", amount: null }
        }
      />
    </section>
  );
}