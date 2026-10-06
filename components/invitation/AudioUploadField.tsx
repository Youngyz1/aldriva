"use client";

import React, { useState, useRef } from "react";
import { Music, Trash2, RefreshCw, AlertCircle, Play, Pause, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AudioUploadFieldProps {
  eventId: string;
  value?: string | null;
  title?: string | null;
  locale?: "en" | "fr";
  disabled?: boolean;
  onChange: (url: string | null, title?: string | null) => void;
  className?: string;
}

const MAX_AUDIO_BYTES = 5 * 1024 * 1024; // 5 MB

export default function AudioUploadField({
  eventId,
  value,
  title,
  locale = "en",
  disabled = false,
  onChange,
  className,
}: AudioUploadFieldProps) {
  const isFr = locale === "fr";
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackTitle, setTrackTitle] = useState(title || "");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so re-uploading same file triggers change
    e.target.value = "";

    // 1. Client-side size check
    if (file.size > MAX_AUDIO_BYTES) {
      setErrorMessage(
        isFr
          ? `Le fichier audio dépasse la limite de 5 Mo (${(file.size / (1024 * 1024)).toFixed(1)} Mo).`
          : `Audio file exceeds 5MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`
      );
      return;
    }

    // 2. Client-side type check
    const validTypes = ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac"];
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!validTypes.includes(file.type) && ext !== "mp3" && ext !== "m4a") {
      setErrorMessage(
        isFr
          ? "Format non supporté. Veuillez choisir un fichier MP3 (.mp3) ou M4A (.m4a)."
          : "Unsupported format. Please select an MP3 (.mp3) or M4A (.m4a) file."
      );
      return;
    }

    setErrorMessage(null);
    setIsUploading(true);
    setUploadProgress(10);

    try {
      const buffer = await file.arrayBuffer();
      setUploadProgress(50);

      const res = await fetch(`/api/invitation-media/upload?eventId=${encodeURIComponent(eventId)}`, {
        method: "POST",
        headers: {
          "Content-Type": file.type || (ext === "m4a" ? "audio/mp4" : "audio/mpeg"),
        },
        body: buffer,
      });

      setUploadProgress(90);
      const data = await res.json();

      if (!res.ok || !data.url) {
        throw new Error(data.error || (isFr ? "Échec du téléversement audio." : "Audio upload failed."));
      }

      setUploadProgress(100);
      // Derive default title from file name if none exists
      const derivedTitle = trackTitle || file.name.replace(/\.[^/.]+$/, "");
      setTrackTitle(derivedTitle);
      onChange(data.url, derivedTitle);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : isFr ? "Une erreur est survenue." : "An error occurred.";
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadProgress(null), 500);
    }
  };

  const handleRemove = () => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setErrorMessage(null);
    setTrackTitle("");
    onChange(null, null);
  };

  const handleTitleChange = (newTitle: string) => {
    setTrackTitle(newTitle);
    if (value) {
      onChange(value, newTitle);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.m4a,audio/mpeg,audio/mp4"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {value ? (
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 transition-all">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={togglePlay}
                disabled={disabled}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-xs transition hover:bg-orange-700 disabled:opacity-50"
                aria-label={isPlaying ? (isFr ? "Pause" : "Pause") : isFr ? "Écouter" : "Play preview"}
              >
                {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Music size={14} className="text-orange-600 shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    {isFr ? "Musique de fond" : "Background Music"}
                  </span>
                </div>
                <input
                  type="text"
                  value={trackTitle}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder={isFr ? "Titre de la chanson (ex: Notre chanson)" : "Song title (e.g. Our Song)"}
                  disabled={disabled}
                  className="mt-0.5 w-full truncate bg-transparent text-sm font-bold text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-0 border-b border-transparent hover:border-zinc-300 focus:border-orange-500 transition"
                />
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isUploading}
                className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-bold text-zinc-700 shadow-xs hover:bg-zinc-50 transition disabled:opacity-50"
                title={isFr ? "Remplacer l'audio" : "Replace audio"}
              >
                <RefreshCw size={13} className={cn(isUploading && "animate-spin")} />
                <span className="hidden sm:inline">{isFr ? "Remplacer" : "Replace"}</span>
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={disabled || isUploading}
                className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/60 px-2.5 py-1.5 text-xs font-bold text-red-600 shadow-xs hover:bg-red-100 transition disabled:opacity-50"
                title={isFr ? "Supprimer l'audio" : "Delete audio"}
              >
                <Trash2 size={13} />
                <span className="hidden sm:inline">{isFr ? "Supprimer" : "Delete"}</span>
              </button>
            </div>
          </div>

          <audio
            ref={audioRef}
            src={value}
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            className="hidden"
          />
        </div>
      ) : (
        <div
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
          className={cn(
            "group relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center transition-all cursor-pointer hover:border-orange-300 hover:bg-orange-50/20",
            disabled && "cursor-not-allowed opacity-60",
            isUploading && "cursor-wait opacity-80"
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100/60 text-orange-600 shadow-xs group-hover:scale-105 transition-transform">
            {isUploading ? <Loader2 size={22} className="animate-spin" /> : <Music size={22} />}
          </div>

          <p className="mt-3 text-sm font-bold text-zinc-900">
            {isUploading
              ? isFr
                ? "Téléversement en cours..."
                : "Uploading audio..."
              : isFr
              ? "Ajouter une musique de fond (Optionnel)"
              : "Add Background Music (Optional)"}
          </p>

          <p className="mt-1 text-xs text-zinc-500 font-medium">
            {isFr
              ? "MP3 ou M4A jusqu'à 5 Mo. Jouée en boucle lorsque l'invité active le son."
              : "MP3 or M4A up to 5MB. Loops gently when the guest unmutes."}
          </p>

          {uploadProgress !== null && (
            <div className="mt-3 w-full max-w-xs overflow-hidden rounded-full bg-zinc-200 h-1.5">
              <div
                className="h-full bg-orange-600 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-xs font-semibold text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
