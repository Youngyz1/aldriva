"use client";

/**
 * components/ui/call-to-action.tsx
 * Community CTA banner used on the organizers directory page.
 * Adapted from 21st.dev design — rebranded for Aldriva.
 */

import Link from "next/link";

interface CallToActionProps {
  headline?:     string;
  subtext?:      string;
  ctaLabel?:     string;
  ctaHref?:      string;
  memberCount?:  string;
  avatars?:      string[];
}

const DEFAULT_AVATARS = [
  "https://images.unsplash.com/photo-1633332755192-727a05c4013d?q=80&w=50",
  "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=50",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=50&h=50&auto=format&fit=crop",
];

export function CallToAction({
  headline    = "Join thousands of event organizers on Aldriva.",
  subtext     = "Create events, launch fundraisers, and grow your community — all in one place.",
  ctaLabel    = "Create an Organization",
  ctaHref     = "/create-organizer",
  memberCount = "1,200+ organizers",
  avatars     = DEFAULT_AVATARS,
}: CallToActionProps) {
  return (
    <div className="max-w-5xl w-full mx-4 md:mx-auto flex flex-col items-center justify-center text-center bg-gradient-to-b from-orange-600 to-orange-800 rounded-3xl p-10 md:p-14 text-white shadow-2xl">
      {/* Social proof pill */}
      <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur border border-white/20 text-sm mb-6">
        <div className="flex items-center">
          {avatars.map((src, i) => (
            <img
              key={i}
              src={src}
              alt={`Organization ${i + 1}`}
              className={`w-7 h-7 rounded-full border-2 border-white object-cover ${i > 0 ? "-ml-2" : ""}`}
            />
          ))}
        </div>
        <p className="font-semibold text-white/90">Join community of {memberCount}</p>
      </div>

      {/* Headline */}
      <h2 className="text-3xl md:text-5xl font-black max-w-xl leading-tight bg-gradient-to-r from-white to-orange-100 text-transparent bg-clip-text">
        {headline}
      </h2>

      {/* Subtext */}
      <p className="mt-4 text-white/75 text-base max-w-lg leading-relaxed">{subtext}</p>

      {/* CTA Button */}
      <Link
        href={ctaHref}
        className="mt-8 inline-block px-8 py-4 bg-white text-orange-700 font-black rounded-full text-sm uppercase tracking-wide hover:bg-orange-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}
