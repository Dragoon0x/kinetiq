"use client";

import * as React from "react";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, exitFor, springs } from "@/registry/lib/motion";
import { project, rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GesturePlayerProps = {
  /**
   * The picture, drawn from the playback time. It is handed a motion value
   * in seconds, so the scene follows a scrub at frame rate without a render.
   */
  children: (time: MotionValue<number>) => React.ReactNode;
  /** The clip's title: the player's accessible name. */
  label: string;
  /** Length of the clip, in seconds. */
  duration: number;
  /** Controlled position, in seconds: a new value from the host seeks there. */
  value?: number;
  /** Starting position when uncontrolled. @default 0 */
  defaultValue?: number;
  /** Fires with every seek and skip, and with each whole second as it plays. */
  onValueChange?: (seconds: number) => void;
  playing?: boolean;
  /** @default false */
  defaultPlaying?: boolean;
  /** Fires from the tap, key or button that played or paused, and at the end. */
  onPlayingChange?: (playing: boolean) => void;
  /** Controlled volume, 0 to 1. */
  volume?: number;
  /** @default 0.7 */
  defaultVolume?: number;
  onVolumeChange?: (volume: number) => void;
  /** Controlled brightness, 0 to 1; 0.6 shows the picture as drawn. */
  brightness?: number;
  /** @default 0.6 */
  defaultBrightness?: number;
  onBrightnessChange?: (brightness: number) => void;
  /** How far a swipe goes: seconds per pixel of a seek and level per pixel of a vertical swipe, 0.5 to 2. @default 1 */
  sensitivity?: number;
  /** A brightness half on the left and a volume half on the right; off, a vertical swipe anywhere sets volume. @default true */
  zones?: boolean;
  /** Seconds a double tap or an arrow key skips. @default 10 */
  skip?: number;
  /** Faint glyphs over the paused picture showing what it answers to. @default true */
  hints?: boolean;
  /** A tick per second scrubbed and per step of a level, and a click per skip. Off unless asked for. @default false */
  sound?: boolean;
  disabled?: boolean;
  className?: string;
};

type Level = "volume" | "brightness";
type Mode = "seek" | Level;
type Said = { text: string; kind: "time" | Level | "play"; v: number };

/** A second tap on the same side within this long is a double tap, ms. */
const DOUBLE_MS = 280;
/** After a skip, further taps on that side keep skipping for this long, ms. */
const STREAK_MS = 700;
/** Overlays linger this long after the gesture, ms. */
const LINGER_MS = 700;
/** Seek ticks are at least this far apart, ms: a ratchet, not a buzz. */
const TICK_GAP = 35;
/** Seconds of seek per frame width at sensitivity 1. */
const SEEK_SPAN = 90;
/** Half the time bubble's width, px: it is held that far inside the bar. */
const BUBBLE_HALF = 34;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const fmt = (s: number) => {
  const t = Math.max(0, Math.floor(s + 1e-6));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const spoken = (s: number) => {
  const t = Math.max(0, Math.floor(s + 1e-6));
  const m = Math.floor(t / 60);
  const sec = t % 60;
  const secs = `${sec} ${sec === 1 ? "second" : "seconds"}`;
  return m > 0 ? `${m} ${m === 1 ? "minute" : "minutes"} ${secs}` : secs;
};

// The picture's visibility and hover state are the page's, read through a
// subscription so the server and the first client render agree.
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.visibilityState === "hidden";

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn("fill-none stroke-current", className)}
      strokeWidth={1.4}
      strokeLinecap="round"
    >
      <circle cx={8} cy={8} r={2.8} />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </svg>
  );
}

function SpeakerIcon({
  level,
  className,
}: {
  level: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn("fill-none stroke-current", className)}
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 6h2.2L8 3.2v9.6L4.7 10H2.5Z" className="fill-current" />
      {level <= 0.001 ? (
        <path d="M11 6.2l3 3.6M14 6.2l-3 3.6" />
      ) : (
        <>
          <path d="M10.4 6.1a2.6 2.6 0 0 1 0 3.8" />
          {level > 0.5 ? <path d="M12.2 4.4a5 5 0 0 1 0 7.2" /> : null}
        </>
      )}
    </svg>
  );
}

function UpDown({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 8 12"
      className={cn("fill-none stroke-current", className)}
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 1.5v9M1.8 3.6 4 1.5l2.2 2.1M1.8 8.4 4 10.5l2.2-2.1" />
    </svg>
  );
}

function Chevrons({ dir, className }: { dir: 1 | -1; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 10"
      className={cn("fill-none stroke-current", className)}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {dir > 0 ? (
        <path d="M2 1.5 5.5 5 2 8.5M8 1.5 11.5 5 8 8.5" />
      ) : (
        <path d="M14 1.5 10.5 5 14 8.5M8 1.5 4.5 5 8 8.5" />
      )}
    </svg>
  );
}

function PlayGlyph({
  playing,
  className,
}: {
  playing: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className={cn("fill-current", className)}
    >
      {playing ? (
        <>
          <rect x={4} y={3} width={2.6} height={10} rx={1} />
          <rect x={9.4} y={3} width={2.6} height={10} rx={1} />
        </>
      ) : (
        <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" />
      )}
    </svg>
  );
}

/**
 * A player whose picture is the control. Swipe sideways to seek: the time
 * follows the finger 1:1 at `sensitivity × 90` seconds per frame width, a
 * bubble on the bar shows where you are and how far you have jumped, the
 * scene scrubs with you, and a release is projected and glides on
 * `springs.glide` with the release velocity. Swipe up or down on the right
 * half for volume and on the left for brightness (anywhere for volume with
 * `zones` off): a meter on that side fills and stretches a little past
 * either end. Tap the middle to play or pause; double-tap a side to skip
 * `skip` seconds back or forward, and keep tapping to keep skipping, with a
 * ripple swelling from that edge.
 *
 * The host draws the picture from a motion value of the time, so nothing
 * renders per frame, and playback is an animation of that value started only
 * while playing and visible — nothing reads a clock during render. The
 * picture is a focusable group whose keys walk the same paths with the same
 * overlays and sounds: Space plays, the arrows skip and set volume, Shift
 * with them seeks by a second and sets brightness. Under reduced motion the
 * overlays appear without travelling and released seeks land at once.
 */
export function GesturePlayer({
  children,
  label,
  duration,
  value,
  defaultValue = 0,
  onValueChange,
  playing,
  defaultPlaying = false,
  onPlayingChange,
  volume,
  defaultVolume = 0.7,
  onVolumeChange,
  brightness,
  defaultBrightness = 0.6,
  onBrightnessChange,
  sensitivity = 1,
  zones = true,
  skip = 10,
  hints = true,
  sound = false,
  disabled = false,
  className,
}: GesturePlayerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const total = Math.max(1, duration);
  const sens = clamp(sensitivity, 0.25, 4);
  const jump = Math.max(1, Math.round(skip));
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    () => false,
  );

  const [ownPlaying, setOwnPlaying] = React.useState(defaultPlaying);
  const isPlaying = playing ?? ownPlaying;
  const [ownVolume, setOwnVolume] = React.useState(defaultVolume);
  const vol = clamp01(volume ?? ownVolume);
  const [ownBrightness, setOwnBrightness] = React.useState(defaultBrightness);
  const bri = clamp01(brightness ?? ownBrightness);

  const [active, setActive] = React.useState(false);
  const [meter, setMeter] = React.useState<Level | null>(null);
  const [ripple, setRipple] = React.useState<{
    side: 1 | -1;
    total: number;
    key: number;
  } | null>(null);
  const [pulse, setPulse] = React.useState<{
    key: number;
    playing: boolean;
  } | null>(null);
  const [said, setSaid] = React.useState<Said | null>(null);

  const time = useMotionValue(clamp(value ?? defaultValue, 0, total));
  const seekFrom = useMotionValue(0);
  const bubbleOpacity = useMotionValue(0);
  const bubbleShift = useMotionValue(0);
  const volMV = useMotionValue(vol);
  const briMV = useMotionValue(bri);
  const meterOpacity = useMotionValue(0);
  const meterStretch = useMotionValue(1);
  const meterOrigin = useMotionValue(1);

  const surface = React.useRef<HTMLDivElement | null>(null);
  const timeRun = React.useRef<AnimationPlaybackControls | null>(null);
  /** Where a running glide is headed: a skip adds to it, not to the midpoint. */
  const timeGoal = React.useRef<number | null>(null);
  const playRun = React.useRef<AnimationPlaybackControls | null>(null);
  const gate = React.useRef({
    playing: isPlaying,
    disabled,
    hidden: false,
    holding: false,
  });
  const levelRuns = React.useRef<
    Record<Level, AnimationPlaybackControls | null>
  >({ volume: null, brightness: null });
  const levelGoal = React.useRef<Record<Level, number>>({
    volume: vol,
    brightness: bri,
  });
  const timers = React.useRef({ meter: 0, bubble: 0, ripple: 0, pulse: 0 });
  const pending = React.useRef<{ side: 1 | -1; t: number; id: number } | null>(
    null,
  );
  const streak = React.useRef<{ side: 1 | -1; t: number } | null>(null);
  const expected = React.useRef<number | null>(null);
  const lastWhole = React.useRef(Math.floor(time.get()));
  const tick = React.useRef({ sec: Math.floor(time.get()), at: 0, step: 0 });
  const gesture = React.useRef<{
    mode: Mode | null;
    from: number;
    per: number;
    size: number;
  }>({ mode: null, from: 0, per: 0, size: 1 });
  const ended = () => {
    playRun.current = null;
    expected.current = total;
    onValueChange?.(total);
    if (playing === undefined) setOwnPlaying(false);
    onPlayingChange?.(false);
    setSaid({ text: "Ended.", kind: "play", v: 0 });
  };
  const latest = React.useRef({ onValueChange, ended, total });
  React.useEffect(() => {
    latest.current = { onValueChange, ended, total };
  });

  /**
   * Playback is one linear animation of the time to the end, running only
   * while playing, enabled, visible and not held by a scrub or a glide. It
   * reports each whole second it passes, as a media element would.
   */
  const syncPlayback = React.useCallback(() => {
    const g = gate.current;
    const go = g.playing && !g.disabled && !g.hidden && !g.holding;
    if (go && !playRun.current) {
      const from = time.get();
      const end = latest.current.total;
      if (from >= end - 0.01) return;
      playRun.current = animate(time, end, {
        duration: end - from,
        ease: "linear",
        onUpdate: (t) => {
          const whole = Math.floor(t);
          if (whole === lastWhole.current) return;
          lastWhole.current = whole;
          expected.current = whole;
          latest.current.onValueChange?.(whole);
        },
        onComplete: () => latest.current.ended(),
      });
    } else if (!go && playRun.current) {
      playRun.current.stop();
      playRun.current = null;
    }
  }, [time]);

  /** The time was moved: playback, if it runs, carries on from there. */
  const restartPlayback = () => {
    playRun.current?.stop();
    playRun.current = null;
    syncPlayback();
  };

  const hold = (on: boolean) => {
    gate.current.holding = on;
    if (on) {
      playRun.current?.stop();
      playRun.current = null;
    }
    syncPlayback();
  };

  const frac = useTransform(time, (t) => r3(clamp01(t / total)));
  const readout = useTransform(time, (t) => `${fmt(t)} / ${fmt(total)}`);
  const headLeft = useTransform(frac, (f) => `${r3(f * 100)}%`);
  const bubbleLeft = useTransform(
    frac,
    (f) =>
      `clamp(${BUBBLE_HALF}px, ${r3(f * 100)}%, calc(100% - ${BUBBLE_HALF}px))`,
  );
  const bubbleTime = useTransform(time, fmt);
  const bubbleDelta = useTransform(
    [time, seekFrom] as MotionValue<number>[],
    ([t, s]) => {
      const d = Math.round((t as number) - (s as number));
      return `${d < 0 ? "−" : "+"}${fmt(Math.abs(d))}`;
    },
  );
  const picture = useTransform(briMV, (b) => `brightness(${r3(0.4 + b)})`);
  const meterFill = useTransform(
    [volMV, briMV] as MotionValue<number>[],
    ([v, b]) => r3(clamp01((meter === "brightness" ? b : v) as number)),
  );
  const meterText = useTransform(
    [volMV, briMV] as MotionValue<number>[],
    ([v, b]) =>
      String(
        Math.round(clamp01((meter === "brightness" ? b : v) as number) * 100),
      ),
  );

  const report = (seconds: number) => {
    const s = r2(clamp(seconds, 0, total));
    expected.current = s;
    lastWhole.current = Math.floor(s);
    onValueChange?.(s);
  };

  const tickSecond = (t: number) => {
    const sec = Math.floor(t);
    const k = tick.current;
    if (sec === k.sec) return;
    k.sec = sec;
    const now = performance.now();
    if (now - k.at < TICK_GAP) return;
    k.at = now;
    const f = clamp01(t / total);
    audio.play("tick", {
      pitch: r2(0.8 + f * 0.8),
      gain: 0.32,
      pan: r2((f * 2 - 1) * 0.6),
    });
  };

  const tickLevel = (kind: Level, v: number) => {
    const step = Math.floor(clamp01(v) * 10 + 1e-6);
    if (step === tick.current.step) return;
    tick.current.step = step;
    audio.play("tick", {
      pitch: r2(0.7 + v * 0.8),
      gain: r2(kind === "volume" ? 0.15 + v * 0.45 : 0.3),
      pan: kind === "volume" ? 0.45 : -0.45,
    });
  };

  const clearTimer = (name: keyof typeof timers.current) => {
    window.clearTimeout(timers.current[name]);
    timers.current[name] = 0;
  };

  const showBubble = () => {
    clearTimer("bubble");
    animate(bubbleOpacity, 1, {
      duration: durations.fast,
      ease: easings.enter,
    });
  };
  const hideBubbleSoon = (ms = LINGER_MS) => {
    clearTimer("bubble");
    timers.current.bubble = window.setTimeout(() => {
      animate(bubbleOpacity, 0, exitFor(durations.base));
      bubbleShift.set(0);
    }, ms);
  };

  const showMeter = (kind: Level) => {
    clearTimer("meter");
    setMeter(kind);
    animate(meterOpacity, 1, { duration: durations.fast, ease: easings.enter });
  };
  const hideMeterSoon = () => {
    clearTimer("meter");
    timers.current.meter = window.setTimeout(() => {
      animate(meterOpacity, 0, {
        ...exitFor(durations.base),
        onComplete: () => setMeter(null),
      });
    }, LINGER_MS);
  };

  /** Moves the time to a seek's landing, gliding unless motion is reduced. */
  const glideTo = (target: number, velocity = 0) => {
    timeRun.current?.stop();
    const to = clamp(target, 0, total);
    timeGoal.current = to;
    hold(true);
    const done = () => {
      timeRun.current = null;
      timeGoal.current = null;
      lastWhole.current = Math.floor(time.get());
      hold(false);
    };
    if (!motionSafe) {
      time.jump(to);
      tickSecond(to);
      done();
      return;
    }
    timeRun.current = animate(time, to, {
      ...springs.glide,
      velocity,
      restDelta: 0.01,
      onUpdate: tickSecond,
      onComplete: done,
    });
  };

  const setLevel = (kind: Level, v: number) => {
    const next = r2(clamp01(v));
    if (kind === "volume") {
      if (volume === undefined) setOwnVolume(next);
      onVolumeChange?.(next);
    } else {
      if (brightness === undefined) setOwnBrightness(next);
      onBrightnessChange?.(next);
    }
    setSaid({
      text: `${kind === "volume" ? "Volume" : "Brightness"} ${Math.round(next * 100)}%.`,
      kind,
      v: Math.round(next * 100),
    });
    return next;
  };

  /** Settles a level on a value: sprung, or set at once under reduced motion. */
  const settleLevel = (kind: Level, target: number, velocity = 0) => {
    const mv = kind === "volume" ? volMV : briMV;
    levelRuns.current[kind]?.stop();
    levelGoal.current[kind] = target;
    if (!motionSafe) {
      mv.set(target);
      meterStretch.set(1);
      return;
    }
    levelRuns.current[kind] = animate(mv, target, {
      ...springs.snap,
      velocity,
      restDelta: 0.001,
    });
    animate(meterStretch, 1, springs.snap);
  };

  // A level the host (or the release) settled on: the meter goes there,
  // unless a finger is on it.
  React.useEffect(() => {
    if (gesture.current.mode === "volume") return;
    if (Math.abs(levelGoal.current.volume - vol) < 0.001) return;
    settleLevel("volume", vol);
    // settleLevel writes motion values only; the level is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vol]);
  React.useEffect(() => {
    if (gesture.current.mode === "brightness") return;
    if (Math.abs(levelGoal.current.brightness - bri) < 0.001) return;
    settleLevel("brightness", bri);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bri]);

  // A host that moves the value seeks there; the value we reported is ours.
  React.useEffect(() => {
    if (value === undefined) return;
    if (
      expected.current !== null &&
      Math.abs(value - expected.current) < 0.01
    ) {
      return;
    }
    if (gesture.current.mode === "seek") return;
    if (Math.abs(value - time.get()) < 0.5) return;
    timeRun.current?.stop();
    timeRun.current = null;
    timeGoal.current = null;
    time.jump(clamp(value, 0, total));
    lastWhole.current = Math.floor(value);
    restartPlayback();
    // restartPlayback reads refs only; the value is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, time, total]);

  React.useEffect(() => {
    const g = gate.current;
    g.playing = isPlaying;
    g.disabled = disabled;
    g.hidden = hidden;
    syncPlayback();
  }, [isPlaying, disabled, hidden, syncPlayback]);

  // A new length: the running animation is aimed at the old end.
  React.useEffect(() => {
    playRun.current?.stop();
    playRun.current = null;
    syncPlayback();
  }, [total, syncPlayback]);

  React.useEffect(() => {
    const t = timers.current;
    const levels = levelRuns.current;
    return () => {
      window.clearTimeout(t.meter);
      window.clearTimeout(t.bubble);
      window.clearTimeout(t.ripple);
      window.clearTimeout(t.pulse);
      window.clearTimeout(pending.current?.id ?? 0);
      pending.current = null;
      timeRun.current?.stop();
      playRun.current?.stop();
      playRun.current = null;
      levels.volume?.stop();
      levels.brightness?.stop();
    };
  }, []);

  const togglePlay = () => {
    if (disabled) return;
    const next = !isPlaying;
    if (next && time.get() >= total - 0.05) {
      // Played to the end: play starts it again.
      timeRun.current?.stop();
      timeRun.current = null;
      timeGoal.current = null;
      time.jump(0);
      report(0);
    }
    if (playing === undefined) setOwnPlaying(next);
    onPlayingChange?.(next);
    setSaid({
      text: next ? "Playing." : "Paused.",
      kind: "play",
      v: next ? 1 : 0,
    });
    clearTimer("pulse");
    setPulse({ key: (pulse?.key ?? 0) + 1, playing: next });
    timers.current.pulse = window.setTimeout(() => setPulse(null), 500);
  };

  const skipBy = (dir: 1 | -1, pan = dir * 0.5) => {
    if (disabled) return;
    const from = timeGoal.current ?? time.get();
    const to = clamp(from + dir * jump, 0, total);
    const now = performance.now();
    const s = streak.current;
    const running = s !== null && s.side === dir && now - s.t < STREAK_MS;
    streak.current = { side: dir, t: now };
    const sum =
      running && ripple && ripple.side === dir ? ripple.total + jump : jump;
    clearTimer("ripple");
    setRipple({ side: dir, total: sum, key: (ripple?.key ?? 0) + 1 });
    timers.current.ripple = window.setTimeout(() => setRipple(null), 650);
    audio.play("click", { pitch: dir > 0 ? 1.12 : 0.94, gain: 0.5, pan });
    tick.current.sec = Math.floor(to);
    glideTo(to);
    report(to);
    setSaid({
      text: `${dir > 0 ? "Forward" : "Back"} ${sum} seconds, ${spoken(to)}.`,
      kind: "time",
      v: 0,
    });
  };

  /** A key's seek: the swipe's bubble and ticks, to a set time. */
  const seekTo = (target: number) => {
    if (disabled) return;
    const to = clamp(target, 0, total);
    if (timeGoal.current === null) seekFrom.set(time.get());
    bubbleShift.set(0);
    showBubble();
    glideTo(to);
    hideBubbleSoon();
    report(to);
    setSaid({ text: `Seeked to ${spoken(to)}.`, kind: "time", v: 0 });
  };

  const nudgeLevel = (kind: Level, by: number) => {
    if (disabled) return;
    const from = levelGoal.current[kind];
    const next = clamp01(Math.round((from + by) * 10) / 10);
    showMeter(kind);
    tick.current.step = -1;
    tickLevel(kind, next);
    settleLevel(kind, setLevel(kind, next));
    hideMeterSoon();
  };

  const drag = useDrag({
    threshold: 6,
    disabled,
    onStart: ({ offset, point }) => {
      const el = surface.current;
      if (!el) return;
      window.clearTimeout(pending.current?.id ?? 0);
      pending.current = null;
      const rect = el.getBoundingClientRect();
      const g = gesture.current;
      setActive(true);
      if (Math.abs(offset.x) >= Math.abs(offset.y)) {
        timeRun.current?.stop();
        timeRun.current = null;
        timeGoal.current = null;
        hold(true);
        g.mode = "seek";
        g.from = time.get();
        g.per = (sens * SEEK_SPAN) / Math.max(1, rect.width);
        g.size = rect.width;
        seekFrom.set(g.from);
        bubbleShift.set(0);
        tick.current.sec = Math.floor(g.from);
        showBubble();
      } else {
        const startX =
          (point.x - offset.x - rect.left) / Math.max(1, rect.width);
        const kind: Level = zones && startX < 0.5 ? "brightness" : "volume";
        const mv = kind === "volume" ? volMV : briMV;
        levelRuns.current[kind]?.stop();
        g.mode = kind;
        g.from = mv.get();
        g.size = rect.height;
        g.per = sens / Math.max(1, rect.height * 0.8);
        tick.current.step = Math.floor(clamp01(g.from) * 10 + 1e-6);
        showMeter(kind);
      }
    },
    onMove: ({ offset }) => {
      const g = gesture.current;
      if (g.mode === "seek") {
        const raw = g.from + offset.x * g.per;
        const t = clamp(raw, 0, total);
        time.set(r3(t));
        if (motionSafe) {
          bubbleShift.set(r2(rubberband((raw - t) / g.per, 40)));
        }
        tickSecond(t);
      } else if (g.mode) {
        const kind = g.mode;
        const mv = kind === "volume" ? volMV : briMV;
        const raw = g.from - offset.y * g.per;
        const v = clamp01(raw);
        mv.set(r3(v));
        if (motionSafe) {
          const over = (raw - v) / g.per;
          meterOrigin.set(over > 0 ? 1 : 0);
          meterStretch.set(r3(1 + Math.abs(rubberband(over, g.size)) / g.size));
        }
        tickLevel(kind, v);
        const pct = Math.round(v * 100);
        if (pct !== Math.round(levelGoal.current[kind] * 100)) {
          levelGoal.current[kind] = v;
          if (kind === "volume") onVolumeChange?.(r2(v));
          else onBrightnessChange?.(r2(v));
        }
      }
    },
    onEnd: ({ velocity }) => {
      const g = gesture.current;
      const mode = g.mode;
      g.mode = null;
      setActive(false);
      if (mode === "seek") {
        const speed = velocity.x * g.per;
        const landing = clamp(project(time.get(), speed, 0.985), 0, total);
        animate(bubbleShift, 0, springs.snap);
        glideTo(landing, speed);
        hideBubbleSoon(motionSafe ? LINGER_MS + 300 : LINGER_MS);
        report(landing);
        setSaid({ text: `Seeked to ${spoken(landing)}.`, kind: "time", v: 0 });
      } else if (mode) {
        const mv = mode === "volume" ? volMV : briMV;
        const speed = -velocity.y * g.per;
        const landing = clamp01(project(mv.get(), speed, 0.99));
        const next = setLevel(mode, landing);
        // Controlled: the meter settles on what the host holds, and moves on
        // once it answers.
        const held = mode === "volume" ? volume : brightness;
        settleLevel(mode, held === undefined ? next : clamp01(held), speed);
        hideMeterSoon();
      }
    },
    onCancel: () => {
      const g = gesture.current;
      const mode = g.mode;
      g.mode = null;
      setActive(false);
      if (mode === "seek") {
        animate(bubbleShift, 0, springs.snap);
        lastWhole.current = Math.floor(time.get());
        hold(false);
        report(time.get());
        hideBubbleSoon();
      } else if (mode) {
        settleLevel(mode, mode === "volume" ? vol : bri);
        hideMeterSoon();
      }
    },
    onTap: (event) => {
      const el = surface.current;
      if (!el || disabled) return;
      const rect = el.getBoundingClientRect();
      const fx = (event.clientX - rect.left) / Math.max(1, rect.width);
      const side = fx < 1 / 3 ? -1 : fx > 2 / 3 ? 1 : 0;
      const at = event.timeStamp;
      const pan = panFrom(event.clientX, el);
      if (side === 0) {
        window.clearTimeout(pending.current?.id ?? 0);
        pending.current = null;
        togglePlay();
        return;
      }
      const s = streak.current;
      const inStreak =
        s !== null && s.side === side && performance.now() - s.t < STREAK_MS;
      const p = pending.current;
      if (inStreak || (p && p.side === side && at - p.t < DOUBLE_MS)) {
        window.clearTimeout(p?.id ?? 0);
        pending.current = null;
        skipBy(side, pan);
        return;
      }
      window.clearTimeout(p?.id ?? 0);
      // A lone tap on a side plays or pauses once no second tap has come.
      pending.current = {
        side,
        t: at,
        id: window.setTimeout(() => {
          pending.current = null;
          togglePlayRef.current();
        }, DOUBLE_MS),
      };
    },
  });

  const togglePlayRef = React.useRef(togglePlay);
  React.useEffect(() => {
    togglePlayRef.current = togglePlay;
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const k = event.key;
    const self = event.target === event.currentTarget;
    if ((k === " " && self) || k === "k" || k === "K") {
      event.preventDefault();
      if (!event.repeat) togglePlay();
      return;
    }
    if (k === "ArrowLeft" || k === "ArrowRight") {
      event.preventDefault();
      const dir = k === "ArrowRight" ? 1 : -1;
      if (event.shiftKey) seekTo((timeGoal.current ?? time.get()) + dir);
      else skipBy(dir);
      return;
    }
    if (k === "j" || k === "J" || k === "l" || k === "L") {
      event.preventDefault();
      skipBy(k === "l" || k === "L" ? 1 : -1);
      return;
    }
    if (k === "Home" || k === "End") {
      event.preventDefault();
      seekTo(k === "Home" ? 0 : total);
      return;
    }
    if (k === "ArrowUp" || k === "ArrowDown") {
      event.preventDefault();
      const by = k === "ArrowUp" ? 0.1 : -0.1;
      if (event.shiftKey) {
        if (zones) nudgeLevel("brightness", by);
      } else {
        nudgeLevel("volume", by);
      }
    }
  };

  const heard =
    said === null
      ? ""
      : said.kind === "volume"
        ? Math.round(vol * 100) === said.v
          ? said.text
          : ""
        : said.kind === "brightness"
          ? Math.round(bri * 100) === said.v
            ? said.text
            : ""
          : said.kind === "play"
            ? said.text === "Ended." || isPlaying === (said.v === 1)
              ? said.text
              : ""
            : said.text;

  const idle = !isPlaying && !active && ripple === null && meter === null;

  return (
    <div
      ref={surface}
      role="group"
      aria-roledescription="video player"
      aria-label={label}
      aria-describedby={hintId}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("[data-player-control]")
        ) {
          return;
        }
        drag.onPointerDown(event);
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        // Both axes are the picture's: sideways seeks, up and down set levels.
        "relative aspect-video w-full touch-none overflow-clip rounded-3 border border-hairline bg-black [contain:paint] select-none [-webkit-touch-callout:none]",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled ? "opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{ filter: picture }}
      >
        {children(time)}
      </motion.div>

      {/* The zone a vertical swipe is setting, washed while it is set. */}
      {zones && meter ? (
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-y-0 w-1/2 bg-white/8",
            meter === "brightness" ? "left-0" : "right-0",
          )}
          style={{ opacity: meterOpacity }}
        />
      ) : null}

      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        initial={false}
        animate={{ opacity: hints && idle ? 1 : 0 }}
        transition={{ duration: durations.base, ease: easings.enter }}
      >
        {zones ? (
          <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/85">
            <SunIcon className="size-3" />
            <UpDown className="h-3 w-2" />
          </span>
        ) : null}
        <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 text-[10px] text-white/85">
          <UpDown className="h-3 w-2" />
          <SpeakerIcon level={1} className="size-3" />
        </span>
        <span className="absolute top-1/2 left-[9%] inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] text-white/85 tabular-nums">
          <Chevrons dir={-1} className="h-2.5 w-4" />
          {jump}
        </span>
        <span className="absolute top-1/2 right-[9%] inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 font-mono text-[10px] text-white/85 tabular-nums">
          {jump}
          <Chevrons dir={1} className="h-2.5 w-4" />
        </span>
      </motion.div>

      <AnimatePresence>
        {ripple ? (
          <motion.div
            key={ripple.key}
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 flex w-[38%] items-center justify-center",
              ripple.side > 0 ? "right-0" : "left-0",
            )}
            initial={motionSafe ? { opacity: 0, scale: 0.92 } : { opacity: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.base) }}
            transition={
              motionSafe
                ? { opacity: { duration: durations.fast }, scale: springs.snap }
                : { duration: durations.fast }
            }
            style={{ originX: ripple.side > 0 ? 1 : 0 }}
          >
            <span
              className={cn(
                "absolute inset-y-[-20%] w-[140%] bg-white/15",
                ripple.side > 0
                  ? "left-0 rounded-l-[50%]"
                  : "right-0 rounded-r-[50%]",
              )}
            />
            <span className="relative flex flex-col items-center gap-0.5 text-white">
              <Chevrons dir={ripple.side} className="h-3 w-5" />
              <span className="font-mono text-[11px] tabular-nums">
                {ripple.side > 0 ? "+" : "−"}
                {ripple.total}s
              </span>
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Paused: a play glyph in the middle, which is also where a tap plays. */}
      <AnimatePresence>
        {!isPlaying && !active ? (
          <motion.span
            key="paused"
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 flex size-11 -translate-1/2 items-center justify-center rounded-full bg-black/45 text-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: exitFor(durations.fast) }}
            transition={{ duration: durations.fast }}
          >
            <PlayGlyph playing={false} className="size-5" />
          </motion.span>
        ) : pulse && pulse.playing ? (
          <motion.span
            key={`pulse-${pulse.key}`}
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 flex size-11 -translate-1/2 items-center justify-center rounded-full bg-black/45 text-white"
            initial={motionSafe ? { opacity: 1, scale: 1 } : { opacity: 1 }}
            animate={motionSafe ? { opacity: 0, scale: 1.25 } : { opacity: 0 }}
            transition={{ duration: durations.slow, ease: easings.exit }}
          >
            <PlayGlyph playing className="size-5" />
          </motion.span>
        ) : null}
      </AnimatePresence>

      {meter ? (
        <motion.div
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-[14%] flex h-[52%] w-8 flex-col items-center gap-1.5 rounded-full bg-black/55 py-2 text-white",
            zones && meter === "brightness" ? "left-3" : "right-3",
          )}
          style={{
            opacity: meterOpacity,
            scaleY: meterStretch,
            originY: meterOrigin,
          }}
        >
          {meter === "brightness" ? (
            <SunIcon className="size-4 shrink-0" />
          ) : (
            <SpeakerIcon level={vol} className="size-4 shrink-0" />
          )}
          <span className="relative w-1.5 flex-1 overflow-clip rounded-full bg-white/30">
            <motion.span
              className="absolute inset-0 origin-bottom bg-white"
              style={{ scaleY: meterFill }}
            />
          </span>
          <motion.span className="font-mono text-[9px] leading-none tabular-nums">
            {meterText}
          </motion.span>
        </motion.div>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-linear-to-t from-black/65 to-transparent px-2 pt-7 pb-1.5">
        <button
          type="button"
          data-player-control=""
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={disabled}
          onClick={togglePlay}
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-white outline-none hover:bg-white/15 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid disabled:cursor-not-allowed"
        >
          <PlayGlyph playing={isPlaying} className="size-4" />
        </button>
        <motion.span className="shrink-0 font-mono text-[10px] text-white/85 tabular-nums">
          {readout}
        </motion.span>
        <span aria-hidden className="relative h-6 flex-1">
          <span className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-clip rounded-full bg-white/30">
            <motion.span
              className="absolute inset-0 origin-left bg-white"
              style={{ scaleX: frac }}
            />
          </span>
          <motion.span
            className="absolute top-1/2 size-2.5 -translate-1/2 rounded-full bg-white shadow"
            style={{ left: headLeft }}
          />
          <motion.span
            className="pointer-events-none absolute bottom-full mb-1 flex w-[68px] -translate-x-1/2 flex-col items-center rounded-2 bg-black/75 py-1 text-white"
            style={{
              left: bubbleLeft,
              x: bubbleShift,
              opacity: bubbleOpacity,
            }}
          >
            <motion.span className="font-mono text-xs leading-none tabular-nums">
              {bubbleTime}
            </motion.span>
            <motion.span className="mt-0.5 font-mono text-[9px] leading-none text-white/70 tabular-nums">
              {bubbleDelta}
            </motion.span>
          </motion.span>
        </span>
      </div>

      <p id={hintId} className="sr-only">
        Swipe sideways to seek; swipe up or down on the right for volume
        {zones ? " and on the left for brightness" : ""}. Tap to play or pause,
        double-tap a side to skip {jump} seconds. Keys: Space plays and pauses,
        Left and Right skip {jump} seconds, Shift with Left or Right seeks one
        second, Home and End jump to the start and end, Up and Down set the
        volume
        {zones ? ", and Shift with Up or Down sets the brightness" : ""}.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {heard}
      </p>
    </div>
  );
}
