"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { ArticleAudioTimingData } from "@/lib/audio/types";

interface ArticleAudioPlayerProps {
  articleId: string;
  onParagraphChange?: (paragraphIndex: number | null) => void;
  className?: string;
}

const SPEED_OPTIONS = [1, 1.25, 1.5, 2] as const;
type PlaybackSpeed = (typeof SPEED_OPTIONS)[number];

export default function ArticleAudioPlayer({
  articleId,
  onParagraphChange,
  className = "",
}: ArticleAudioPlayerProps) {
  const [playerState, setPlayerState] = useState<
    "unloaded" | "loading" | "ready" | "playing" | "paused" | "failed"
  >("unloaded");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [timingData, setTimingData] = useState<ArticleAudioTimingData | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<PlaybackSpeed>(1);
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sessionPosKey = `aldriva_audio_pos_${articleId}`;

  // Check initial audio status on mount
  useEffect(() => {
    let isMounted = true;
    async function checkStatus() {
      try {
        const res = await fetch(`/api/articles/${articleId}/audio`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.status === "ready" && data.audio_url) {
          setAudioUrl(data.audio_url);
          setDuration(data.duration_seconds || 0);
          setTimingData(data.timing_data || null);
        }
      } catch {
        // Ignore check errors silently
      }
    }
    checkStatus();
    return () => {
      isMounted = false;
    };
  }, [articleId]);

  // Determine active paragraph index from audio timestamp using binary search.
  // Complexity: O(log n) — safe for articles with hundreds of paragraphs on every animation frame.
  const calculateActiveParagraph = useCallback(
    (timeSec: number, data: ArticleAudioTimingData | null): number | null => {
      if (!data || !data.paragraphs || data.paragraphs.length === 0) return null;
      const timeMs = timeSec * 1000;
      const paras = data.paragraphs;

      // Before first paragraph starts
      if (timeMs < paras[0].startTimeMs) return paras[0].index;

      // After last paragraph ends
      if (timeMs >= paras[paras.length - 1].endTimeMs) return null;

      // Binary search for the paragraph whose range contains timeMs
      // Invariant: paras are ordered by startTimeMs ascending
      let lo = 0;
      let hi = paras.length - 1;

      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const p = paras[mid];

        if (timeMs >= p.startTimeMs && timeMs < p.endTimeMs) {
          return p.index;
        }
        if (timeMs < p.startTimeMs) {
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      }

      // Between paragraphs (gap) — return the last paragraph whose start ≤ timeMs
      // lo is now the first paragraph starting after timeMs, so lo-1 is the candidate
      const candidate = lo > 0 ? lo - 1 : 0;
      return paras[candidate].index;
    },
    []
  );

  // Sync active paragraph change to parent via useEffect to avoid setState during child render (Error 4)
  useEffect(() => {
    if (onParagraphChange) {
      onParagraphChange(activeParagraphIndex);
    }
  }, [activeParagraphIndex, onParagraphChange]);

  const updateParagraphState = useCallback((pIdx: number | null) => {
    setActiveParagraphIndex(pIdx);
  }, []);

  // Initialize or fetch TTS audio generation
  const handleStartListening = async () => {
    if (audioUrl && timingData) {
      setPlayerState("ready");
      startPlayback();
      return;
    }

    setPlayerState("loading");
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/articles/${articleId}/audio`, {
        method: "POST",
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.details || errJson.error || "Failed to load article audio.");
      }

      const data = await res.json();
      if (data.status === "ready" && data.audio_url) {
        setAudioUrl(data.audio_url);
        setDuration(data.duration_seconds || 0);
        setTimingData(data.timing_data || null);
        setPlayerState("ready");

        // Start playback once audio source is set
        setTimeout(() => {
          startPlayback();
        }, 50);
      } else if (data.status === "generating") {
        setErrorMessage("Preparing audio narration... Please try again in a few seconds.");
        setPlayerState("unloaded");
      } else {
        throw new Error(data.error || "Audio generation unavailable.");
      }
    } catch (err: any) {
      console.error("[ArticleAudioPlayer] Generation error:", err);
      setErrorMessage(err.message || "Audio player unavailable.");
      setPlayerState("failed");
    }
  };

  const startPlayback = () => {
    if (audioRef.current) {
      // Restore session position if available
      const savedPos = sessionStorage.getItem(sessionPosKey);
      if (savedPos && !currentTime) {
        const parsedPos = parseFloat(savedPos);
        if (!isNaN(parsedPos) && parsedPos < (duration || 9999)) {
          audioRef.current.currentTime = parsedPos;
          setCurrentTime(parsedPos);
        }
      }

      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current
        .play()
        .then(() => {
          setPlayerState("playing");
        })
        .catch((err) => {
          console.warn("Audio autoplay blocked:", err);
          setPlayerState("paused");
        });
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;

    if (playerState === "playing") {
      audioRef.current.pause();
      setPlayerState("paused");
    } else {
      audioRef.current
        .play()
        .then(() => {
          setPlayerState("playing");
        })
        .catch(console.error);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
    sessionStorage.setItem(sessionPosKey, String(newTime));

    // Immediately update active paragraph on seeking (Correction 8)
    const pIdx = calculateActiveParagraph(newTime, timingData);
    updateParagraphState(pIdx);
  };

  const handleSpeedChange = (speed: PlaybackSpeed) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const time = audioRef.current.currentTime;
    setCurrentTime(time);
    sessionStorage.setItem(sessionPosKey, String(time));

    const pIdx = calculateActiveParagraph(time, timingData);
    updateParagraphState(pIdx);
  };

  const handleEnded = () => {
    setPlayerState("paused");
    setCurrentTime(0);
    sessionStorage.removeItem(sessionPosKey);
    updateParagraphState(null);
  };

  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Reset player state to stop listening
  const handleStopListening = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setPlayerState("unloaded");
    setCurrentTime(0);
    updateParagraphState(null);
    sessionStorage.removeItem(sessionPosKey);
  };

  return (
    <>
      {/* 1. Static Top Compact Player Bar (Positioned above Title) */}
      <div
        className={`mb-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 shadow-xs transition-all ${className}`}
        aria-label="Article Audio Reader"
      >
        <audio
          ref={audioRef}
          src={audioUrl || undefined}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onLoadedMetadata={() => {
            if (audioRef.current && audioRef.current.duration) {
              setDuration(audioRef.current.duration);
            }
          }}
          preload="metadata"
        />

        {/* Unloaded State: Initial "Listen to this article" CTA */}
        {playerState === "unloaded" && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600 flex-shrink-0">
                <Volume2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-zinc-900 truncate">
                  Listen to this article
                </h4>
                <p className="text-[11px] font-semibold text-zinc-500 hidden sm:block truncate">
                  Narrated with NVIDIA AI speech synthesis
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStartListening}
              className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-black text-white hover:bg-orange-700 transition focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 flex-shrink-0"
            >
              <Play className="h-3.5 w-3.5 fill-white" />
              Listen
            </button>
          </div>
        )}

        {/* Loading / Preparing State */}
        {playerState === "loading" && (
          <div className="flex items-center justify-center gap-2.5 py-1">
            <Loader2 className="h-4 w-4 animate-spin text-orange-600" />
            <span className="text-xs font-bold text-zinc-700">
              Preparing audio narration...
            </span>
          </div>
        )}

        {/* Error / Failure State */}
        {playerState === "failed" && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-red-600 text-xs font-semibold">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{errorMessage || "Audio unavailable."}</span>
            </div>
            <button
              type="button"
              onClick={handleStartListening}
              className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-200 transition"
            >
              Retry
            </button>
          </div>
        )}

        {/* Active Audio Top Bar Controls */}
        {(playerState === "ready" ||
          playerState === "playing" ||
          playerState === "paused") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={togglePlayPause}
                  aria-label={playerState === "playing" ? "Pause narration" : "Play narration"}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition focus:outline-none focus:ring-2 focus:ring-orange-500 flex-shrink-0"
                >
                  {playerState === "playing" ? (
                    <Pause className="h-4 w-4 fill-white" />
                  ) : (
                    <Play className="h-4 w-4 fill-white ml-0.5" />
                  )}
                </button>

                <div className="text-xs font-bold text-zinc-700 flex items-center gap-1">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-zinc-400">/</span>
                  <span className="text-zinc-500">{formatTime(duration)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <div className="flex items-center rounded-lg bg-zinc-100 p-0.5">
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      type="button"
                      onClick={() => handleSpeedChange(speed)}
                      className={`rounded-md px-1.5 py-0.5 text-[11px] font-black transition ${
                        playbackSpeed === speed
                          ? "bg-white text-orange-700 shadow-xs"
                          : "text-zinc-500 hover:text-zinc-900"
                      }`}
                    >
                      {speed}×
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleStopListening}
                  title="Stop listener"
                  aria-label="Stop audio reader"
                  className="p-1 text-zinc-400 hover:text-zinc-700 transition rounded-lg"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Seek Bar */}
            <div className="relative flex items-center">
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                aria-label="Audio seeker"
                className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-200 accent-orange-600 focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. Floating Bottom Audio Controller (Active when playing or paused so readers can control audio without scrolling up) */}
      {(playerState === "playing" || playerState === "paused") && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md bg-zinc-950/95 backdrop-blur-md text-white border border-zinc-800 shadow-2xl rounded-2xl p-3 transition-all animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={playerState === "playing" ? "Pause narration" : "Play narration"}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-white hover:bg-orange-700 transition focus:outline-none focus:ring-2 focus:ring-orange-500 flex-shrink-0 shadow-md"
              >
                {playerState === "playing" ? (
                  <Pause className="h-4 w-4 fill-white" />
                ) : (
                  <Play className="h-4 w-4 fill-white ml-0.5" />
                )}
              </button>

              <div className="min-w-0">
                <div className="text-[11px] font-black text-orange-400 uppercase tracking-wider">
                  {playerState === "playing" ? "Playing Narration" : "Paused"}
                </div>
                <div className="text-xs font-bold text-zinc-300 flex items-center gap-1">
                  <span>{formatTime(currentTime)}</span>
                  <span className="text-zinc-600">/</span>
                  <span className="text-zinc-400">{formatTime(duration)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-shrink-0">
              <div className="flex items-center rounded-lg bg-zinc-800 p-0.5">
                {SPEED_OPTIONS.map((speed) => (
                  <button
                    key={speed}
                    type="button"
                    onClick={() => handleSpeedChange(speed)}
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-black transition ${
                      playbackSpeed === speed
                        ? "bg-orange-600 text-white shadow-xs"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {speed}×
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleStopListening}
                title="Stop narration"
                aria-label="Stop audio reader"
                className="p-1.5 text-zinc-400 hover:text-white transition rounded-lg hover:bg-zinc-800"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Floating Seek Slider */}
          <div className="relative flex items-center px-0.5">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Audio seeker floating"
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-zinc-800 accent-orange-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </>
  );
}
