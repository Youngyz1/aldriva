"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { copyTextToClipboard } from "@/lib/clipboard";

export function V2WebsiteLiveLink({
  isPublished,
  url,
}: {
  isPublished: boolean;
  url: string;
}) {
  const tStorefront = useTranslations("Storefront");
  const [copyMessage, setCopyMessage] = useState("");

  if (!isPublished || !url) return null;

  async function copyLink() {
    const copied = await copyTextToClipboard(url);
    setCopyMessage(copied ? tStorefront("linkCopied") : tStorefront("copyLinkFailed"));
  }

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
      <span className="max-w-[18rem] truncate font-mono" title={url}>{url}</span>
      <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-md bg-white px-2.5 py-1.5 font-semibold shadow-xs dark:bg-zinc-900">
        {tStorefront("openSite")}
      </a>
      <button type="button" onClick={() => void copyLink()} className="rounded-md border border-emerald-300 px-2.5 py-1.5 font-semibold dark:border-emerald-800">
        {tStorefront("copyLink")}
      </button>
      <span className="sr-only" aria-live="polite">{copyMessage}</span>
    </div>
  );
}
