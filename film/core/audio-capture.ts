"use client";

import { filmClock } from "./clock";

export const SAMPLE_RATE = 48_000;

let track: OfflineAudioContext | null = null;
/** A cue played between frames sets its own exact time here. */
let cueTime: number | null = null;

/**
 * Records every sound the components make into the film's own audio track.
 *
 * The sound kit (registry/lib/tactile-sound.ts) builds its voices on whatever
 * `window.AudioContext` gives it and schedules each one at `currentTime`. Here
 * that context is an OfflineAudioContext the length of the film, seen through
 * a proxy whose `currentTime` is the film time — so when a pressed switch
 * plays its droplet sound, the voice lands in the track on the exact frame
 * the switch moved. Nothing is re-created or faked: the film's UI sound is
 * the components' own synthesis, captured as they perform.
 */
export function installAudioCapture(seconds: number): OfflineAudioContext {
  if (track) return track;
  const real = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(seconds * SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
  });
  track = real;
  const proxy = new Proxy(real, {
    get(target, prop) {
      if (prop === "currentTime") return cueTime ?? filmClock.get();
      // Live, the kit wakes a suspended context; the track is always "on".
      if (prop === "state") return "running";
      if (prop === "resume") return () => Promise.resolve();
      const value: unknown = Reflect.get(target, prop, target);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
  function FilmAudioContext() {
    return proxy;
  }
  Object.defineProperty(window, "AudioContext", {
    configurable: true,
    writable: true,
    value: FilmAudioContext,
  });
  // Live, the kit releases a voice's nodes on a timer once it has played.
  // An offline graph is only rendered at the end, so a disconnect before
  // then would erase the sound it was tidying up after: keep every node.
  AudioNode.prototype.disconnect =
    function keep() {} as AudioNode["disconnect"];
  return real;
}

/** The track being recorded, once capture is installed. */
export const audioTrack = (): OfflineAudioContext | null => track;

/**
 * Runs `play` as if the film were at `seconds` exactly — for scripted cues
 * that fall between two captured frames. The kit's own throttle reads
 * `performance.now()`, so that is moved with it.
 */
export function atTime(seconds: number, play: () => void): void {
  const before = performance.now;
  const offset = (filmClock.get() - seconds) * 1000;
  const frozen = before.call(performance) - offset;
  performance.now = () => frozen;
  cueTime = seconds;
  try {
    play();
  } finally {
    cueTime = null;
    performance.now = before;
  }
}

/** Interleaved float samples of the rendered track, base64-encoded. */
export async function renderTrack(): Promise<{
  sampleRate: number;
  channels: number;
  data: string;
}> {
  if (!track) throw new Error("audio capture was never installed");
  const buffer = await track.startRendering();
  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  const interleaved = new Float32Array(left.length * 2);
  for (let i = 0; i < left.length; i++) {
    interleaved[i * 2] = left[i] ?? 0;
    interleaved[i * 2 + 1] = right[i] ?? 0;
  }
  const bytes = new Uint8Array(interleaved.buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return { sampleRate: buffer.sampleRate, channels: 2, data: btoa(binary) };
}
