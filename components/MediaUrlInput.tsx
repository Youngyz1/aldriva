"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  hint?: string;
  value: string;
  name?: string;
  placeholder?: string;
  onClear?: () => void;
  onResolved: (result: {
    kind: "image" | "direct-video-file" | "video-embed";
    url: string;
    embedId?: string;
    provider?: "youtube" | "vimeo";
    thumbnail?: string;
  }) => void;
  inputClassName?: string;
};

type ImportResponse =
  | {
      ok: true;
      kind: "image" | "direct-video-file" | "video-embed";
      url: string;
      embedId?: string;
      provider?: "youtube" | "vimeo";
      thumbnail?: string;
    }
  | { ok: false; reason?: string };

export default function MediaUrlInput({
  hint,
  value,
  name,
  placeholder = "https://...",
  onClear,
  onResolved,
  inputClassName,
}: Props) {
  const [raw, setRaw] = useState(value);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const lastSubmitted = useRef("");

  useEffect(() => {
    setRaw(value);
    lastSubmitted.current = value;
  }, [value]);

  async function resolve(url: string) {
    const trimmed = url.trim();
    if (!trimmed || trimmed === lastSubmitted.current) return;

    lastSubmitted.current = trimmed;
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/media/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = (await res.json()) as ImportResponse;
      if (!data.ok) {
        setStatus("error");
        setErrorMsg(data.reason || "Couldn't load that link.");
        lastSubmitted.current = "";
        return;
      }

      setStatus("idle");
      onResolved(data);
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong reading that link.");
      lastSubmitted.current = "";
    }
  }

  return (
    <div>
      <input
        name={name}
        type="url"
        value={raw}
        placeholder={placeholder}
        className={inputClassName}
        onChange={(e) => {
          setRaw(e.target.value);
          if (!e.target.value.trim()) {
            lastSubmitted.current = "";
            setStatus("idle");
            setErrorMsg("");
            onClear?.();
          }
        }}
        onBlur={() => resolve(raw)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text").trim();
          if (pasted) void resolve(pasted);
        }}
      />
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
      {status === "loading" && <p className="mt-1 text-xs font-semibold text-zinc-500">Importing media...</p>}
      {status === "error" && <p className="mt-1 text-xs font-semibold text-red-600">{errorMsg}</p>}
    </div>
  );
}
