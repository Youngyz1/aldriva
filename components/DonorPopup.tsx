"use client";

import { useEffect, useRef } from "react";
import LocalBrandedPlaceholder from "@/components/ui/LocalBrandedPlaceholder";

type DonorPopupProps = {
  name: string;
  fundraiserTitle: string;
  onClose: () => void;
  /**
   * Sentence describing this person's relationship to the campaign. Defaults to
   * the donor wording; the beneficiary card passes its own so the same popup
   * can be reused instead of duplicated.
   */
  relationLabel?: string;
  /** Screen-reader label for the dialog. Defaults to the donor wording. */
  dialogLabel?: string;
};

function initial(name: string) {
  return (name.trim() || "A").charAt(0).toUpperCase();
}

export default function DonorPopup({
  name,
  fundraiserTitle,
  onClose,
  relationLabel,
  dialogLabel,
}: DonorPopupProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      aria-modal="true"
      role="dialog"
      aria-label={dialogLabel ?? `Donor profile for ${name}`}
      // Backdrop click
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Card */}
      <div
        ref={cardRef}
        className="relative z-10 flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white px-8 py-8 shadow-xl"
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Avatar */}
        <LocalBrandedPlaceholder
          variant="avatar"
          title={name}
          initials={initial(name)}
          seed={name}
          className="h-20 w-20 rounded-full text-3xl"
        />

        {/* Name */}
        <h2 className="text-2xl font-black text-zinc-950">{name}</h2>

        {/* Not set up message */}
        <p className="text-center text-sm text-zinc-500">
          This profile has not yet been set up.
        </p>

        {/* Donated to */}
        <div className="w-full rounded-xl bg-zinc-50 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-zinc-700">
            {relationLabel ?? `${name} donated to this fundraiser`}
          </p>
          <p className="mt-0.5 text-xs text-zinc-400">{fundraiserTitle}</p>
        </div>
      </div>
    </div>
  );
}
