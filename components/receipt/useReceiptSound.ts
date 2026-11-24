"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "aldriva:receipt-sound";

/** How long the synthesised printer run lasts (matches the ~4.5 s print). */
const PRINT_SECONDS = 4.6;

/**
 * Shared context so a tap on "View receipt" can unlock audio while the click
 * still counts as a user gesture. The generated sound starts a frame later
 * from PrintedReceipt's effect.
 */
let sharedContext: AudioContext | null = null;

function audioConstructor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext ??
    null
  );
}

/** Resume/create the shared AudioContext inside a click handler. */
export function primeReceiptAudio(): void {
  try {
    const Ctor = audioConstructor();
    if (!Ctor) return;
    if (!sharedContext || sharedContext.state === "closed") {
      sharedContext = new Ctor();
    }
    if (sharedContext.state === "suspended") void sharedContext.resume();
  } catch {
    // Audio is optional; never let it block the receipt.
  }
}

export type ReceiptSoundOptions = {
  /**
   * Default to on for tap-initiated opens. Existing auto-open receipts keep
   * off-by-default and only play when the visitor previously chose "on".
   */
  defaultEnabled?: boolean;
};

/**
 * Optional printer sound for the printed receipt.
 *
 * The preference is remembered in localStorage. The sound is synthesised with
 * WebAudio: band-passed noise around 2.5 kHz amplitude-modulated at ~35 Hz
 * (the stepper motor chopping the paper), plus a faint 180 Hz motor tone, with
 * a quick fade in and out. One continuous sound for the whole print, never
 * per-step taps.
 *
 * Browsers only allow audio after a user gesture. `primeReceiptAudio()` is
 * called from the reveal click; a receipt that prints on arrival (no gesture)
 * simply stays silent. Every audio call is wrapped so a blocked or
 * unsupported context fails silently.
 */
export function useReceiptSound({
  defaultEnabled = false,
}: ReceiptSoundOptions = {}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  const stopRef = useRef<(() => void) | null>(null);

  // Preference is read after mount so server and client markup match. An
  // absent value keeps `defaultEnabled` (on for the rental reveal, off for
  // the existing auto-open receipts).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "on") setEnabled(true);
      else if (stored === "off") setEnabled(false);
    } catch {
      // Storage blocked (private mode, disabled cookies) - keep the default.
    }
  }, []);

  const stop = useCallback(() => {
    const stopFn = stopRef.current;
    stopRef.current = null;
    try {
      stopFn?.();
    } catch {
      // Already stopped or context closed.
    }
  }, []);

  const start = useCallback(() => {
    if (!enabled) return;
    stop();

    try {
      const Ctor = audioConstructor();
      if (!Ctor) return;

      if (!sharedContext || sharedContext.state === "closed") {
        sharedContext = new Ctor();
      }
      const ctx = sharedContext;
      if (ctx.state === "suspended") void ctx.resume();

      const now = ctx.currentTime;

      // Noise bed: white noise steered into the thermal head's hiss band.
      const buffer = ctx.createBuffer(
        1,
        Math.floor(ctx.sampleRate * PRINT_SECONDS),
        ctx.sampleRate
      );
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 2500;
      band.Q.value = 0.8;

      // Stepper chop: 35 Hz amplitude modulation over the noise.
      const chop = ctx.createGain();
      chop.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 35;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.5;
      lfo.connect(lfoDepth).connect(chop.gain);

      // Faint motor underneath.
      const motor = ctx.createOscillator();
      motor.type = "sine";
      motor.frequency.value = 180;
      const motorGain = ctx.createGain();
      motorGain.gain.value = 0.035;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0, now);
      master.gain.linearRampToValueAtTime(0.11, now + 0.15);
      master.gain.setValueAtTime(0.11, now + PRINT_SECONDS - 0.4);
      master.gain.linearRampToValueAtTime(0, now + PRINT_SECONDS);

      noise.connect(band).connect(chop).connect(master);
      motor.connect(motorGain).connect(master);
      master.connect(ctx.destination);

      noise.start(now);
      lfo.start(now);
      motor.start(now);

      const release = () => {
        try {
          noise.stop();
        } catch {
          /* already stopped */
        }
        try {
          lfo.stop();
        } catch {
          /* already stopped */
        }
        try {
          motor.stop();
        } catch {
          /* already stopped */
        }
        try {
          master.disconnect();
        } catch {
          /* already disconnected */
        }
      };

      const timer = window.setTimeout(
        release,
        Math.ceil(PRINT_SECONDS * 1000) + 50
      );

      stopRef.current = () => {
        window.clearTimeout(timer);
        release();
      };
    } catch {
      // Silent failure: the print itself never depends on sound.
    }
  }, [enabled, stop]);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Preference just won't persist.
    }
    if (next) primeReceiptAudio();
    else stop();
  }, [enabled, stop]);

  // Stop the sound when the receipt unmounts mid-print.
  useEffect(() => stop, [stop]);

  return { enabled, toggle, start, stop };
}
