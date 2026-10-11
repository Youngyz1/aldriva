"use client";

/**
 * components/invitation/FloatingMusicControl.tsx
 *
 * The single music control on guest invitations (bottom pill):
 * tap = play, tap again = stop. Music stays off by default; no autoplay.
 *
 * - Uploaded audio → legacy direct toggle of the <audio> element
 *   (play/pause state persisted in sessionStorage, paused on tab hide).
 *   When uploaded audio exists it wins, so every existing invitation
 *   behaves exactly as before.
 * - Spotify / SoundCloud links (and no uploaded audio) → a hidden
 *   provider embed (visually hidden but rendered, never display:none or
 *   0-size) is driven from the pill tap via the provider's own player
 *   API: Spotify iFrame API, SoundCloud Widget API. Playback starts only
 *   from the user's tap, satisfying browser autoplay rules.
 * - Legacy unsupported provider entries are filtered before reaching this
 *   pill; supported provider failures use a validated external-link fallback.
 * - Neither → renders nothing (HIDE-IF-EMPTY).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import {
  MUSIC_EMBED_ALLOW,
  MUSIC_PROVIDER_NAMES,
  spotifyUriFromEmbed,
  validateMusicLink,
} from "@/lib/invitation-music-links";
import type { InvitationMusicLink } from "@/types/invitation-template";

interface Props {
  audioUrl?: string | null;
  title?: string | null;
  links?: InvitationMusicLink[] | null;
  /** Pill label when idle, e.g. dict.music. */
  musicLabel: string;
  /** Pill label while playing, e.g. dict.playing. */
  playingLabel: string;
}

const MUSIC_STORAGE_KEY = "aldriva_invitation_music";
const SPOTIFY_IFRAME_API = "https://open.spotify.com/embed/iframe-api/v1";
const SOUNDCLOUD_WIDGET_API = "https://w.soundcloud.com/player/api.js";
const SOUNDCLOUD_PLAY_START_TIMEOUT_MS = 8000;

/** Visually hidden but rendered (never display:none or 0-size). */
const HIDDEN_EMBED_STYLE: React.CSSProperties = {
  position: "fixed",
  left: 0,
  top: 0,
  width: 152,
  height: 152,
  opacity: 0.001,
  pointerEvents: "none",
};

interface SpotifyEmbedController {
  play(): void;
  pause(): void;
  destroy(): void;
  addListener(event: "ready", cb: () => void): void;
  addListener(event: "playback_started", cb: () => void): void;
  addListener(event: "playback_update", cb: (e: { data?: { isPaused?: boolean } }) => void): void;
}

interface SpotifyIFrameApi {
  createController(
    el: HTMLElement,
    opts: { uri: string; width?: string; height?: string },
    cb: (controller: SpotifyEmbedController) => void
  ): void;
}

interface SoundCloudWidget {
  bind(event: string, cb: (...args: unknown[]) => void): void;
  unbind(event: string, cb?: (...args: unknown[]) => void): void;
  play(): void;
  pause(): void;
}

interface SoundCloudWidgetEvents {
  READY: string;
  PLAY: string;
  PAUSE: string;
  ERROR: string;
}

interface SoundCloudApi {
  Widget: ((el: HTMLIFrameElement) => SoundCloudWidget) & { Events: SoundCloudWidgetEvents };
}

type WindowWithPlayers = Window & {
  SpotifyIframeApi?: SpotifyIFrameApi;
  onSpotifyIframeApiReady?: (api: SpotifyIFrameApi) => void;
  SC?: SoundCloudApi;
};

let spotifyApiPromise: Promise<SpotifyIFrameApi> | null = null;
let soundcloudApiPromise: Promise<SoundCloudApi> | null = null;

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`player-sdk-load:${src}`));
    document.head.appendChild(el);
    setTimeout(() => reject(new Error(`player-sdk-timeout:${src}`)), 15000);
  });
}

function loadSpotifyIframeApi(): Promise<SpotifyIFrameApi> {
  const w = window as unknown as WindowWithPlayers;
  if (w.SpotifyIframeApi) return Promise.resolve(w.SpotifyIframeApi);
  if (!spotifyApiPromise) {
    spotifyApiPromise = new Promise<SpotifyIFrameApi>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("player-sdk-timeout:spotify")), 15000);
      w.onSpotifyIframeApiReady = (api: SpotifyIFrameApi) => {
        clearTimeout(timer);
        w.SpotifyIframeApi = api;
        resolve(api);
      };
      loadScriptOnce(SPOTIFY_IFRAME_API).catch((err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error("player-sdk-load:spotify"));
      });
    });
  }
  return spotifyApiPromise;
}

function loadSoundCloudWidgetApi(): Promise<SoundCloudApi> {
  const w = window as unknown as WindowWithPlayers;
  if (w.SC) return Promise.resolve(w.SC);
  if (!soundcloudApiPromise) {
    soundcloudApiPromise = loadScriptOnce(SOUNDCLOUD_WIDGET_API).then(() => {
      const api = (window as unknown as WindowWithPlayers).SC;
      if (!api) throw new Error("player-sdk-missing:soundcloud");
      return api;
    });
  }
  return soundcloudApiPromise;
}

type LinkTarget =
  | { kind: "spotify"; uri: string; displayUrl: string }
  | { kind: "soundcloud"; widgetUrl: string; displayUrl: string };

function resolveLinkTarget(item: InvitationMusicLink): LinkTarget | null {
  if (item.provider === "spotify") {
    const uri = spotifyUriFromEmbed(item.embedUrl);
    if (uri) return { kind: "spotify", uri, displayUrl: item.url };
  }
  if (item.provider === "soundcloud") {
    return { kind: "soundcloud", widgetUrl: item.embedUrl, displayUrl: item.url };
  }
  return null;
}

export function FloatingMusicControl({ audioUrl, title, links, musicLabel, playingLabel }: Props) {
  const hasAudio = !!audioUrl;
  const primary: InvitationMusicLink | null = links && links.length > 0 ? links[0] : null;
  // Uploaded audio wins when present: every existing invitation behaves
  // exactly as before. Link control applies to link-only invitations.
  const target: LinkTarget | null = useMemo(
    () => (!hasAudio && primary ? resolveLinkTarget(primary) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasAudio, primary?.embedUrl, primary?.provider, primary?.url]
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [startingTargetKey, setStartingTargetKey] = useState<string | null>(null);
  const [readyTargetKey, setReadyTargetKey] = useState<string | null>(null);
  const [failedTargetKey, setFailedTargetKey] = useState<string | null>(null);
  const [cookiePromptOffset, setCookiePromptOffset] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const spotifyHostRef = useRef<HTMLDivElement | null>(null);
  const soundcloudFrameRef = useRef<HTMLIFrameElement | null>(null);
  const spotifyController = useRef<SpotifyEmbedController | null>(null);
  const soundcloudWidget = useRef<SoundCloudWidget | null>(null);
  const soundcloudPlayStartTimer = useRef<number | null>(null);
  const providerTargetKey =
    target?.kind === "spotify"
      ? `spotify:${target.uri}`
      : target?.kind === "soundcloud"
        ? `soundcloud:${target.widgetUrl}`
        : null;
  const providerReady = providerTargetKey !== null && readyTargetKey === providerTargetKey;
  const providerFailed = providerTargetKey !== null && failedTargetKey === providerTargetKey;
  const providerStarting = providerTargetKey !== null && startingTargetKey === providerTargetKey;
  const providerLoading = providerTargetKey !== null && !providerReady && !providerFailed;

  useEffect(() => {
    function handleVisibility() {
      if (document.hidden && audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // On narrow invitation screens the global consent prompt can cover this
  // fixed pill. Lift link controls above it while it is present; this does
  // not affect the invitation section's layout or uploaded-audio control.
  useEffect(() => {
    const updateCookiePromptOffset = () => {
      const prompt = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-label="Cookie preferences"]'
      );
      if (!prompt) {
        setCookiePromptOffset((current) => (current === 0 ? current : 0));
        return;
      }
      const rect = prompt.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const bottom = Number.parseFloat(window.getComputedStyle(prompt).bottom) || 0;
      const nextOffset = Math.ceil(rect.height + bottom + 16);
      setCookiePromptOffset((current) => (current === nextOffset ? current : nextOffset));
    };
    const observer = new MutationObserver(updateCookiePromptOffset);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", updateCookiePromptOffset);
    updateCookiePromptOffset();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateCookiePromptOffset);
    };
  }, []);

  // Spotify controller lifecycle (hidden embed, pill-driven).
  useEffect(() => {
    if (!target || target.kind !== "spotify") return;
    let cancelled = false;
    let timedOut = false;
    let controller: SpotifyEmbedController | null = null;
    const key = `spotify:${target.uri}`;
    const host = spotifyHostRef.current;
    if (!host) return;
    // The API replaces its target element. Keep that element outside React's
    // ownership so Strict Mode cleanup/restart cannot leave a detached ref.
    const mountPoint = document.createElement("div");
    host.replaceChildren(mountPoint);
    const readyTimer = window.setTimeout(() => {
      if (cancelled) return;
      timedOut = true;
      setFailedTargetKey(key);
      const timedOutController = controller;
      controller = null;
      try {
        timedOutController?.destroy();
      } catch {
        /* best effort */
      }
      if (spotifyController.current === timedOutController) spotifyController.current = null;
    }, 20000);
    loadSpotifyIframeApi()
      .then((api) => {
        if (cancelled || timedOut) return;
        api.createController(
          mountPoint,
          { uri: target.uri, width: "152", height: "152" },
          (created) => {
            if (cancelled || timedOut) {
              created.destroy();
              return;
            }
            controller = created;
            spotifyController.current = created;
            created.addListener("ready", () => {
              if (cancelled || timedOut) return;
              window.clearTimeout(readyTimer);
              setFailedTargetKey(null);
              setReadyTargetKey(key);
            });
            created.addListener("playback_started", () => {
              if (!cancelled) setIsPlaying(true);
            });
            created.addListener("playback_update", (e) => {
              if (!cancelled && e?.data?.isPaused === true) setIsPlaying(false);
            });
          }
        );
      })
      .catch(() => {
        window.clearTimeout(readyTimer);
        if (!cancelled) setFailedTargetKey(key);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      try {
        controller?.destroy();
      } catch {
        /* best effort */
      }
      if (spotifyController.current === controller) spotifyController.current = null;
      host.replaceChildren();
    };
  }, [target]);

  // SoundCloud widget lifecycle (hidden iframe, pill-driven).
  useEffect(() => {
    if (!target || target.kind !== "soundcloud") return;
    let cancelled = false;
    let widget: SoundCloudWidget | null = null;
    let events: SoundCloudWidgetEvents | null = null;
    const key = `soundcloud:${target.widgetUrl}`;
    const readyTimer = window.setTimeout(() => {
      if (!cancelled) setFailedTargetKey(key);
    }, 20000);
    const onReady = () => {
      if (cancelled) return;
      window.clearTimeout(readyTimer);
      setFailedTargetKey(null);
      setReadyTargetKey(key);
    };
    const onPlay = () => {
      if (!cancelled) {
        if (soundcloudPlayStartTimer.current !== null) {
          window.clearTimeout(soundcloudPlayStartTimer.current);
          soundcloudPlayStartTimer.current = null;
        }
        setStartingTargetKey(null);
        setFailedTargetKey(null);
        setIsPlaying(true);
      }
    };
    const onPause = () => {
      if (!cancelled) {
        if (soundcloudPlayStartTimer.current !== null) {
          window.clearTimeout(soundcloudPlayStartTimer.current);
          soundcloudPlayStartTimer.current = null;
        }
        setStartingTargetKey(null);
        setIsPlaying(false);
      }
    };
    const onError = () => {
      if (!cancelled) {
        window.clearTimeout(readyTimer);
        if (soundcloudPlayStartTimer.current !== null) {
          window.clearTimeout(soundcloudPlayStartTimer.current);
          soundcloudPlayStartTimer.current = null;
        }
        setStartingTargetKey(null);
        setIsPlaying(false);
        setFailedTargetKey(key);
      }
    };
    loadSoundCloudWidgetApi()
      .then((api) => {
        if (cancelled || !soundcloudFrameRef.current) return;
        widget = api.Widget(soundcloudFrameRef.current);
        soundcloudWidget.current = widget;
        events = api.Widget.Events;
        widget.bind(events.READY, onReady);
        widget.bind(events.PLAY, onPlay);
        widget.bind(events.PAUSE, onPause);
        widget.bind(events.ERROR, onError);
      })
      .catch(() => {
        window.clearTimeout(readyTimer);
        if (!cancelled) setFailedTargetKey(key);
      });
    return () => {
      cancelled = true;
      window.clearTimeout(readyTimer);
      if (soundcloudPlayStartTimer.current !== null) {
        window.clearTimeout(soundcloudPlayStartTimer.current);
        soundcloudPlayStartTimer.current = null;
      }
      try {
        if (events) {
          widget?.unbind(events.READY, onReady);
          widget?.unbind(events.PLAY, onPlay);
          widget?.unbind(events.PAUSE, onPause);
          widget?.unbind(events.ERROR, onError);
        }
      } catch {
        /* best effort */
      }
      try {
        widget?.pause();
      } catch {
        /* best effort */
      }
      if (soundcloudWidget.current === widget) soundcloudWidget.current = null;
    };
  }, [target]);

  if (!hasAudio && !primary) return null;

  function toggleAudio() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      try {
        sessionStorage.setItem(MUSIC_STORAGE_KEY, "paused");
      } catch {
        /* storage unavailable — playback state simply isn't remembered */
      }
    } else {
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          try {
            sessionStorage.setItem(MUSIC_STORAGE_KEY, "playing");
          } catch {
            /* ignore */
          }
        })
        .catch(() => {
          setIsPlaying(false);
        });
    }
  }

  function openProviderFallback(url: string, provider: LinkTarget["kind"]) {
    const validated = validateMusicLink(url);
    if (!validated.ok || validated.item.provider !== provider) return;
    window.open(validated.item.url, "_blank", "noopener,noreferrer");
  }

  function toggleLink() {
    if (!target) return;
    if (providerFailed) {
      openProviderFallback(target.displayUrl, target.kind);
      return;
    }
    if (target.kind === "spotify") {
      const controller = spotifyController.current;
      if (!controller || !providerReady) {
        setFailedTargetKey(`spotify:${target.uri}`);
        return;
      }
      try {
        if (isPlaying) controller.pause();
        else controller.play();
      } catch {
        setIsPlaying(false);
        setFailedTargetKey(`spotify:${target.uri}`);
      }
      return;
    }
    if (target.kind === "soundcloud") {
      const widget = soundcloudWidget.current;
      if (!widget || !providerReady) {
        setFailedTargetKey(`soundcloud:${target.widgetUrl}`);
        return;
      }
      try {
        if (isPlaying) {
          if (soundcloudPlayStartTimer.current !== null) {
            window.clearTimeout(soundcloudPlayStartTimer.current);
            soundcloudPlayStartTimer.current = null;
          }
          setStartingTargetKey(null);
          widget.pause();
        } else {
          const key = `soundcloud:${target.widgetUrl}`;
          setStartingTargetKey(key);
          soundcloudPlayStartTimer.current = window.setTimeout(() => {
            soundcloudPlayStartTimer.current = null;
            if (soundcloudWidget.current !== widget) return;
            setStartingTargetKey(null);
            setIsPlaying(false);
            setFailedTargetKey(key);
          }, SOUNDCLOUD_PLAY_START_TIMEOUT_MS);
          // Keep play() in the click handler's user-activation stack. The pill
          // only changes to playing after the Widget API emits its PLAY event.
          widget.play();
        }
      } catch {
        if (soundcloudPlayStartTimer.current !== null) {
          window.clearTimeout(soundcloudPlayStartTimer.current);
          soundcloudPlayStartTimer.current = null;
        }
        setStartingTargetKey(null);
        setIsPlaying(false);
        setFailedTargetKey(`soundcloud:${target.widgetUrl}`);
      }
    }
  }

  // Legacy path: uploaded audio — direct play/pause toggle, unchanged.
  if (hasAudio) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <audio ref={audioRef} src={audioUrl!} loop preload="none" />
        <button
          type="button"
          onClick={toggleAudio}
          className="flex items-center gap-2 rounded-full border bg-white/95 px-3 py-2 shadow-lg transition-all hover:bg-white"
          aria-label={isPlaying ? "Pause invitation music" : "Play invitation music"}
        >
          {isPlaying ? <Volume2 size={14} /> : <VolumeX size={14} />}
          <span className="hidden text-[11px] font-bold uppercase tracking-widest text-zinc-700 sm:inline">
            {isPlaying ? title || playingLabel : musicLabel}
          </span>
        </button>
      </div>
    );
  }

  if (!target) return null;

  // Link path: pill drives the ready hidden provider embed. SDK failures
  // open the same validated provider URL as a deliberate fallback.
  const providerName = MUSIC_PROVIDER_NAMES[target.kind];
  return (
    <div
      className="fixed bottom-4 right-4 z-40"
      style={cookiePromptOffset > 0 ? { bottom: cookiePromptOffset } : undefined}
    >
      {target?.kind === "spotify" && <div ref={spotifyHostRef} aria-hidden="true" style={HIDDEN_EMBED_STYLE} />}
      {target?.kind === "soundcloud" && (
        <iframe
          ref={soundcloudFrameRef}
          src={target.widgetUrl}
          width={166}
          height={166}
          title="Hidden music player"
          aria-hidden="true"
          tabIndex={-1}
          allow={MUSIC_EMBED_ALLOW.soundcloud}
          style={{ ...HIDDEN_EMBED_STYLE, width: 166, height: 166 }}
        />
      )}
      <button
        type="button"
        onClick={toggleLink}
        disabled={providerLoading || providerStarting}
        aria-busy={providerLoading || providerStarting}
        className="flex items-center gap-2 rounded-full border bg-white/95 px-3 py-2 shadow-lg transition-all hover:bg-white"
        aria-label={
          providerLoading
            ? "Music player loading"
            : providerStarting
              ? `Starting ${providerName} playback`
              : providerFailed
                ? `${providerName} playback unavailable. Open ${providerName} (new tab)`
                : isPlaying
                  ? "Pause invitation music"
                  : "Play invitation music"
        }
        title={
          providerFailed
            ? `${providerName} playback is unavailable. Click to open the link.`
            : undefined
        }
      >
        {isPlaying ? <Volume2 size={14} /> : <VolumeX size={14} />}
        <span
          className={
            providerLoading || providerStarting || providerFailed
              ? "text-[11px] font-bold uppercase tracking-widest text-zinc-700"
              : "hidden text-[11px] font-bold uppercase tracking-widest text-zinc-700 sm:inline"
          }
        >
          {providerLoading
            ? "Loading…"
            : providerStarting
              ? "Starting…"
              : providerFailed
                ? `Unavailable · Open ${providerName}`
                : isPlaying
                  ? playingLabel
                  : musicLabel}
        </span>
      </button>
    </div>
  );
}
