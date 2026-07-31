"use client";

import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

export type ProfileActivity =
  | { type: "donation"; amount: number | string }
  | { type: "comment"; body: string; amount?: number | string | null };

interface ProfileNotSetUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  name: string;
  activity: ProfileActivity;
}

function money(value: number | string) {
  return `$${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function ProfileNotSetUpModal({
  isOpen,
  onClose,
  name,
  activity,
}: ProfileNotSetUpModalProps) {
  if (!isOpen) return null;

  const initial = (name.trim() || "A").charAt(0).toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Avatar + name */}
        <div className="flex flex-col items-center text-center">
          <LocalBrandedPlaceholder
            variant="avatar"
            title={name}
            initials={initial}
            className="h-16 w-16 rounded-full from-emerald-50 to-emerald-50 text-2xl text-emerald-700"
          />
          <h2 className="mt-3 text-xl font-black text-zinc-950">{name}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            This profile has not yet been set up.
          </p>
        </div>

        {/* Activity card */}
        <div className="mt-5 rounded-xl border border-zinc-100 bg-zinc-50 p-4 text-left">
          {activity.type === "donation" ? (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-zinc-400">
                Donated to this fundraiser
              </p>
              <p className="mt-1 text-lg font-black text-emerald-700">
                {money(activity.amount)}
              </p>
            </div>
          ) : (
            <div>
              {activity.amount != null && Number(activity.amount) > 0 && (
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">
                  Donated {money(activity.amount)} · left a comment
                </p>
              )}
              <p className="italic leading-relaxed text-zinc-700">
                &ldquo;{activity.body}&rdquo;
              </p>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-full bg-zinc-950 py-2.5 text-sm font-bold text-white transition hover:bg-zinc-800"
        >
          Close
        </button>
      </div>
    </div>
  );
}
