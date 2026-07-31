"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Play, X } from "lucide-react";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800";

interface CompanyVideoPlayerProps {
  videoUrl?: string;
  thumbnailUrl?: string;
}

export default function CompanyVideoPlayer({
  videoUrl = process.env.NEXT_PUBLIC_COMPANY_VIDEO_URL,
  thumbnailUrl = process.env.NEXT_PUBLIC_COMPANY_VIDEO_THUMBNAIL || PLACEHOLDER_IMAGE,
}: CompanyVideoPlayerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 shadow-2xl">
        {videoUrl ? (
          <video
            src={videoUrl}
            controls
            poster={thumbnailUrl}
            className="h-full w-full object-cover"
          />
        ) : (
          <>
            <img
              src={PLACEHOLDER_IMAGE}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-black/50" />
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
              aria-label="Open company overview video"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-zinc-950 shadow-xl transition-transform hover:scale-105">
                <Play className="ml-1 h-9 w-9 fill-current" />
              </span>
              <span className="mt-5 text-lg font-black text-white">
                Company Overview Video
              </span>
              <span className="mt-1 text-sm font-semibold text-zinc-300">
                Coming soon
              </span>
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-zinc-950/80 to-transparent p-6">
              <Link
                href="/events"
                className="pointer-events-auto flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-black text-zinc-950 transition-colors hover:bg-orange-50"
              >
                Browse Events <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-700 transition hover:bg-zinc-200"
              aria-label="Close video modal"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="mx-auto mt-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <Play className="ml-0.5 h-6 w-6 fill-current" />
            </div>
            <p className="mt-5 text-lg font-black text-zinc-950">
              Video coming soon. Check back later.
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="mt-6 rounded-xl bg-zinc-950 px-5 py-2.5 text-sm font-black text-white transition hover:bg-black"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
