"use client";

import { useState } from "react";

/**
 * Per-asset download button for the buyer library. Goes through the
 * server-side download route (paid-order check + short-lived signed URL) —
 * the browser never sees the private storage path.
 */
export default function LibraryAssetButton({
  productId,
  assetId,
  fileName,
}: {
  productId: string;
  assetId: string;
  fileName: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");

  async function handleDownload() {
    if (state === "working") return;
    setState("working");
    try {
      const res = await fetch(
        `/api/products/${productId}/download?asset=${assetId}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.downloadUrl) {
        throw new Error(data.error || "Download is not available.");
      }
      window.location.href = data.downloadUrl as string;
      setState("idle");
    } catch (err) {
      console.error(`Download failed for ${fileName}:`, err);
      setState("error");
      window.setTimeout(() => setState("idle"), 4000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={state === "working"}
      className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-black text-white hover:bg-orange-700 disabled:opacity-60 transition"
    >
      {state === "working" ? "Preparing…" : state === "error" ? "Retry download" : "Download"}
    </button>
  );
}
