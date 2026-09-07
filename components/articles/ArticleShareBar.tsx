"use client";

import React, { useState } from "react";
import { Share2, Link as LinkIcon, Check } from "lucide-react";
import { FaXTwitter, FaLinkedinIn, FaFacebookF, FaWhatsapp } from "react-icons/fa6";

interface ArticleShareBarProps {
  title: string;
  slug: string;
  excerpt?: string | null;
}

export default function ArticleShareBar({ title, slug, excerpt }: ArticleShareBarProps) {
  const [copied, setCopied] = useState(false);

  const getArticleUrl = () => {
    if (typeof window !== "undefined") {
      return `${window.location.origin}/articles/${slug}`;
    }
    return `https://aldriva.com/articles/${slug}`;
  };

  const shareOnTwitter = () => {
    const url = getArticleUrl();
    const text = encodeURIComponent(`${title} — read on @Aldriva`);
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, "_blank");
  };

  const shareOnLinkedIn = () => {
    const url = getArticleUrl();
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, "_blank");
  };

  const shareOnFacebook = () => {
    const url = getArticleUrl();
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, "_blank");
  };

  const shareOnWhatsApp = () => {
    const url = getArticleUrl();
    const text = encodeURIComponent(`${title} ${url}`);
    window.open(`https://api.whatsapp.com/send?text=${text}`, "_blank");
  };

  const handleCopyLink = () => {
    const url = getArticleUrl();
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    // Open share row: icon buttons keep their own boundaries, the strip needs no box.
    <div className="flex flex-wrap items-center justify-between gap-4 border-y border-zinc-200 py-4 my-8">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-zinc-500">
        <Share2 className="h-4 w-4 text-orange-600" />
        <span>Share this story</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={shareOnTwitter}
          title="Share on X / Twitter"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:text-black transition shadow-sm"
        >
          <FaXTwitter className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={shareOnLinkedIn}
          title="Share on LinkedIn"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:text-[#0077b5] transition shadow-sm"
        >
          <FaLinkedinIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={shareOnFacebook}
          title="Share on Facebook"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:text-[#1877f2] transition shadow-sm"
        >
          <FaFacebookF className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={shareOnWhatsApp}
          title="Share on WhatsApp"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400 hover:text-[#25D366] transition shadow-sm"
        >
          <FaWhatsapp className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleCopyLink}
          title="Copy link"
          className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 text-xs font-bold text-zinc-700 hover:border-zinc-400 hover:text-zinc-950 transition shadow-sm"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-emerald-600">Copied</span>
            </>
          ) : (
            <>
              <LinkIcon className="h-3.5 w-3.5 text-zinc-400" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
