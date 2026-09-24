"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Loader2, UserRound } from "lucide-react";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type FollowProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
};

interface FollowsListModalProps {
  type: "followers" | "following";
  profileId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function FollowsListModal({
  type,
  profileId,
  isOpen,
  onClose,
}: FollowsListModalProps) {
  const [users, setUsers] = useState<FollowProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    fetch(`/api/profile/${profileId}/${type}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || "Failed to load list.");
        }
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        setUsers(type === "followers" ? data.followers ?? [] : data.following ?? []);
      })
      .catch((err) => {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : "Failed to load list.");
      })
      .finally(() => {
        if (!isMounted) return;
        setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, profileId, type]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const title = type === "followers" ? "Followers" : "Following";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h2 className="text-base font-black text-zinc-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-orange-600" />
            </div>
          ) : error ? (
            <p className="py-6 text-center text-sm font-semibold text-red-600">{error}</p>
          ) : users.length === 0 ? (
            <div className="py-8 text-center text-sm font-medium text-zinc-500">
              No {title.toLowerCase()} yet.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {users.map((u) => {
                const name = u.display_name?.trim() || "Aldriva Member";
                const initials = name.slice(0, 2).toUpperCase();
                return (
                  <li key={u.id}>
                    <Link
                      href={`/profile/${u.id}`}
                      onClick={onClose}
                      className="flex items-center gap-3 py-2.5 px-1 rounded-xl transition hover:bg-zinc-50"
                    >
                      {u.avatar_url ? (
                        <img
                          src={u.avatar_url}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <LocalBrandedPlaceholder
                          variant="avatar"
                          title={name}
                          initials={initials}
                          className="h-9 w-9 rounded-full from-orange-600 to-orange-600 text-xs font-black text-white"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-zinc-900">{name}</p>
                      </div>
                      <UserRound className="h-4 w-4 text-zinc-400" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
