"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RadioTuneBand = "fm" | "am" | "sw";
export type RadioTuneDial = "cream" | "walnut" | "black";

export type RadioTuneProps = {
  /** Visible text beside the glyph, and the loader's accessible name. */
  label?: string;
  /** Keep the label for assistive technology only. @default false */
  hideLabel?: boolean;
  /** The glyph's box in px, 16 to 64. Detail is chosen by size. @default 32 */
  size?: number;
  /** How fast it sweeps, dwells and flickers, 0.5 to 2. @default 1 */
  speed?: number;
  /** The waveband: its scale, its stations and its static. @default "fm" */
  band?: RadioTuneBand;
  /** The cabinet. @default "walnut" */
  dial?: RadioTuneDial;
  /** Determinate share done, 0 to 1: the needle travels to the home station and locks on at 1. */
  progress?: number;
  /** Play the whistle and the clicks when the visitor tunes it. Off unless asked for. @default false */
  sound?: boolean;
  /** Keeps searching, but cannot be tuned by hand. @default false */
  disabled?: boolean;
  className?: string;
};

const BOX = 32;
/** The dial's travel inside its window. */
const DIAL_LEFT = 5.5;
const DIAL_SPAN = 21;
const KNOB = { cx: 24.6, cy: 21.6, r: 3.5 };
/** The knob turns this far across the whole band. */
const KNOB_TURN = 540;
/** Sweep rate at speed 1, as a share of the band per second. */
const SWEEP = 0.16;
/** Untouched this long after a hand has tuned it, it goes back to work. */
const RESUME_MS = 1400;

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

type Station = { pos: number; strength: number };

type BandSpec = {
  unit: string;
  spoken: string;
  lo: number;
  hi: number;
  digits: number;
  /** One arrow key's turn, in the band's own unit. */
  fine: number;
  log: boolean;
  majors: { f: number; text: string }[];
  minors: number[];
  stations: Station[];
  home: number;
  /** How wide a station's signal is, as a share of the dial. */
  width: number;
  /** The static's character. */
  noise: (t: number) => number;
  name: string;
};

/** A smooth, seeded value noise: the same static on the server and the client. */
function hash(n: number): number {
  let h = Math.imul(n | 0, 0x27d4eb2d) ^ 0x165667b1;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
function smoothNoise(t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * u;
}

function band(
  spec: Omit<BandSpec, "stations" | "home"> & {
    stations: [number, number][];
    home: number;
  },
): BandSpec {
  const pos = (f: number) =>
    spec.log
      ? (Math.log(f) - Math.log(spec.lo)) /
        (Math.log(spec.hi) - Math.log(spec.lo))
      : (f - spec.lo) / (spec.hi - spec.lo);
  return {
    ...spec,
    stations: spec.stations.map(([f, strength]) => ({
      pos: pos(f),
      strength,
    })),
    home: pos(spec.home),
    majors: spec.majors.map((m) => ({ ...m, f: pos(m.f) })),
    minors: spec.minors.map(pos),
  };
}

const range = (from: number, to: number, step: number) => {
  const out: number[] = [];
  for (let v = from; v <= to + 1e-9; v += step) out.push(Number(v.toFixed(3)));
  return out;
};

// Invented stations on real-looking dials. FM spreads them evenly and hisses;
// AM's scale is compressed toward the top, crowds them low and crackles; the
// short waves bunch them into broadcast bands and fade in a slow warble.
const BANDS: Record<RadioTuneBand, BandSpec> = {
  fm: band({
    unit: "MHz",
    spoken: "megahertz",
    lo: 88,
    hi: 108,
    digits: 1,
    fine: 0.1,
    log: false,
    majors: [88, 92, 96, 100, 104, 108].map((f) => ({ f, text: `${f}` })),
    minors: range(88, 108, 1),
    stations: [
      [89.3, 0.8],
      [91.7, 0.95],
      [94.1, 0.7],
      [97.5, 1],
      [100.3, 0.9],
      [103.9, 0.75],
      [106.1, 0.92],
    ],
    home: 97.5,
    width: 0.018,
    noise: (t) => 0.6 * smoothNoise(t * 9) + 0.4 * smoothNoise(t * 23 + 7),
    name: "FM",
  }),
  am: band({
    unit: "kHz",
    spoken: "kilohertz",
    lo: 530,
    hi: 1700,
    digits: 0,
    fine: 10,
    log: true,
    majors: [550, 700, 900, 1100, 1400, 1700].map((f) => ({
      f,
      text: `${f / 10}`,
    })),
    minors: range(550, 1700, 50),
    stations: [
      [580, 0.9],
      [660, 1],
      [720, 0.72],
      [880, 1],
      [1010, 0.8],
      [1190, 0.9],
      [1430, 0.7],
    ],
    home: 880,
    width: 0.014,
    noise: (t) => Math.min(1, Math.pow(smoothNoise(t * 6), 3) * 1.8),
    name: "AM",
  }),
  sw: band({
    unit: "MHz",
    spoken: "megahertz",
    lo: 5.9,
    hi: 18,
    digits: 2,
    fine: 0.05,
    log: false,
    majors: [6, 9, 12, 15, 18].map((f) => ({ f, text: `${f}` })),
    minors: range(6, 18, 1),
    stations: [
      [6.07, 0.8],
      [6.16, 0.95],
      [9.58, 1],
      [9.73, 0.75],
      [11.82, 0.95],
      [15.34, 0.85],
      [17.72, 0.7],
    ],
    home: 11.82,
    width: 0.009,
    noise: (t) =>
      0.5 + 0.5 * Math.sin(t * 3.1 + smoothNoise(t * 1.3) * 4) * 0.8,
    name: "SW",
  }),
};

/** The band's own value at a dial position. */
function freqAt(b: BandSpec, pos: number): number {
  const p = clamp01(pos);
  const f = b.log
    ? Math.exp(Math.log(b.lo) + (Math.log(b.hi) - Math.log(b.lo)) * p)
    : b.lo + (b.hi - b.lo) * p;
  return Number(f.toFixed(b.digits));
}
function posAt(b: BandSpec, f: number): number {
  return b.log
    ? (Math.log(f) - Math.log(b.lo)) / (Math.log(b.hi) - Math.log(b.lo))
    : (f - b.lo) / (b.hi - b.lo);
}

/** How strong the signal is at a dial position: each station is a bell. */
function signalAt(b: BandSpec, pos: number): number {
  let s = 0;
  for (const st of b.stations) {
    const d = (pos - st.pos) / b.width;
    s += st.strength * Math.exp(-d * d);
  }
  return Math.min(1, s);
}

function nearest(b: BandSpec, pos: number): Station {
  let best = b.stations[0] ?? { pos: 0.5, strength: 1 };
  for (const st of b.stations) {
    if (Math.abs(st.pos - pos) < Math.abs(best.pos - pos)) best = st;
  }
  return best;
}

type DialSpec = {
  body: string;
  edge: string;
  knob: string;
  knobEdge: string;
  ink: string;
  grain: string | null;
};

// Cabinets are fixed pigments (bakelite and wood look the same in either
// theme); shading mixes toward black or white in oklab so the hue holds.
const WALNUT = "oklch(from var(--warn) 0.45 0.07 calc(h - 28))";
const CREAM = "oklch(from var(--warn) 0.9 0.035 h)";
const BLACK = "oklch(from var(--ink-3) 0.27 0.012 h)";
const DIALS: Record<RadioTuneDial, DialSpec> = {
  cream: {
    body: CREAM,
    edge: `color-mix(in oklab, ${CREAM} 58%, black)`,
    knob: "oklch(from var(--warn) 0.52 0.07 calc(h - 20))",
    knobEdge: `color-mix(in oklab, oklch(from var(--warn) 0.52 0.07 calc(h - 20)) 60%, black)`,
    ink: `color-mix(in oklab, ${CREAM} 45%, black)`,
    grain: null,
  },
  walnut: {
    body: WALNUT,
    edge: `color-mix(in oklab, ${WALNUT} 55%, black)`,
    knob: CREAM,
    knobEdge: `color-mix(in oklab, ${CREAM} 55%, black)`,
    ink: CREAM,
    grain: `color-mix(in oklab, ${WALNUT} 78%, black)`,
  },
  black: {
    body: BLACK,
    edge: `color-mix(in oklab, ${BLACK} 70%, white)`,
    knob: "oklch(from var(--ink-3) 0.8 0.01 h)",
    knobEdge: "oklch(from var(--ink-3) 0.5 0.01 h)",
    ink: "oklch(from var(--ink-3) 0.8 0.01 h)",
    grain: null,
  },
};

const BACKLIGHT = "oklch(from var(--warn) 0.93 0.05 h)";
const GLOW = "oklch(from var(--warn) 0.96 0.11 h)";
const SCALE_INK = `color-mix(in oklab, ${BACKLIGHT} 42%, black)`;
const NEEDLE = "oklch(from var(--danger) 0.57 0.2 h)";
const LIT = "oklch(from var(--success) 0.74 0.17 h)";

const dialX = (pos: number) => DIAL_LEFT + DIAL_SPAN * pos;

type Mode = "search" | "dwell" | "hand" | "lock";

type Api = {
  step: () => void;
  pause: () => void;
  after: (next: "dwell" | "leave" | "wrap") => void;
  endHum: () => void;
};

function Bar({
  meter,
  index,
  count,
  x,
  width,
  height,
  unlit,
}: {
  meter: MotionValue<number>;
  index: number;
  count: number;
  x: number;
  width: number;
  height: number;
  unlit: string;
}) {
  // The lit bar is laid over the dark one and shown by opacity alone, so
  // the colours stay in style, where their custom properties resolve.
  const on = useTransform(meter, (m) => (m >= (index + 0.55) / count ? 1 : 0));
  const box = {
    x: r3(x),
    y: r3(25.2 - height),
    width: r3(width),
    height: r3(height),
    rx: 0.3,
  };
  return (
    <>
      <rect {...box} style={{ fill: unlit }} />
      <motion.rect {...box} style={{ fill: LIT, opacity: on }} />
    </>
  );
}

/**
 * An inline loader drawn as a small tabletop radio. The needle scans the
 * dial like a seek radio: it sweeps up the band, and where a station's signal
 * rises it slows, catches the station with a small hunting settle, dwells
 * while the signal bars stand up, then sweeps on; at the top it glides back
 * to the bottom. Between stations the meter wavers with the band's own
 * static. The meter is honest: it is the signal at the needle, and it only
 * rises where there is a station.
 *
 * With `progress` the needle travels toward the home station as the work
 * goes on and, at 1, locks on — a hair past the mark and back on the snap
 * spring — while the meter fills and the dial's backlight warms.
 *
 * It is a real `role="slider"`: drag sideways and the needle follows the
 * hand across the dial while the knob turns with it; let go and it coasts,
 * and a station within reach pulls it on. Arrow keys turn it finely, Page
 * Up and Page Down seek, Home and End go to the ends; while it has focus it
 * stops searching, because the hand is on the knob. Tuning by hand is heard
 * as a whistle that falls to nothing on a station and clicks on the scale;
 * the search itself is silent. Under reduced motion the needle steps from
 * mark to mark instead of sweeping, and the static holds still.
 */
export function RadioTune({
  label,
  hideLabel = false,
  size = 32,
  speed = 1,
  band: bandKey = "fm",
  dial = "walnut",
  progress,
  sound = false,
  disabled = false,
  className,
}: RadioTuneProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clipId = `radio-${uid}`;
  const hintId = `radio-hint-${uid}`;

  const px = Math.min(64, Math.max(16, Math.round(size)));
  const unit = BOX / px;
  const pace = Math.min(2, Math.max(0.5, speed));
  const b = BANDS[bandKey] ?? BANDS.fm;
  const look = DIALS[dial] ?? DIALS.walnut;
  const determinate = progress !== undefined;
  const share = clamp01(progress ?? 0);
  const locked = determinate && share >= 1;
  const name = label ?? "Loading";

  const start = determinate ? 0.03 + (b.home - 0.03) * share : 0.3;
  const needle = useMotionValue(start);
  const clock = useMotionValue(0);
  const lock = useMotionValue(locked ? 1 : 0);

  const [onScreen, setOnScreen] = React.useState(true);
  const [pageShown, setPageShown] = React.useState(true);
  const [held, setHeld] = React.useState(false);
  const [reading, setReading] = React.useState(start);
  const live = onScreen && pageShown && !held;

  const anims = React.useRef(new Map<string, AnimationPlaybackControls>());
  const timer = React.useRef<number | null>(null);
  const resume = React.useRef<number | null>(null);
  const mode = React.useRef<Mode>("search");
  const target = React.useRef<Station | null>(null);
  const grip = React.useRef(0);
  const lastTick = React.useRef(-1);
  const hum = React.useRef<LoopHandle | null>(null);
  const clickAt = React.useRef<number | null>(null);
  const rootRef = React.useRef<HTMLSpanElement | null>(null);
  const api = React.useRef<Api | null>(null);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    anims.current.get(key)?.stop();
    anims.current.set(key, controls);
  };
  const halt = (key: string) => {
    anims.current.get(key)?.stop();
    anims.current.delete(key);
  };
  const clearTimers = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const pan = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? panFrom(rect.left + (dialX(needle.get()) / BOX) * px, null)
      : 0;
  };

  /** The static flickers while it searches; locked or still, it rests. */
  const flicker = (on: boolean) => {
    if (!on || !motionSafe) {
      halt("clock");
      return;
    }
    if (anims.current.has("clock")) return;
    run(
      "clock",
      animate(clock, clock.get() + 600 * pace, {
        duration: 600,
        ease: "linear",
      }),
    );
  };

  const glow = (to: number) => {
    run(
      "lock",
      animate(lock, to, {
        duration: to > 0 ? durations.slow : durations.fast,
        ease: "easeOut",
      }),
    );
  };

  /** Where the scan goes next: the next strong station up the dial, or the top. */
  const nextStop = (from: number): Station | null => {
    for (const st of b.stations) {
      if (st.pos > from + b.width * 2 && st.strength >= 0.85) return st;
    }
    return null;
  };

  const sweepTo = (to: number, then: "dwell" | "wrap") => {
    const from = needle.get();
    const seconds = Math.abs(to - from) / (SWEEP * pace);
    if (!motionSafe) {
      needle.set(to);
      timer.current = window.setTimeout(
        () => {
          timer.current = null;
          api.current?.after(then);
        },
        Math.round((0.9 / pace) * 1000),
      );
      return;
    }
    run(
      "needle",
      animate(needle, to, {
        duration: Math.max(0.05, seconds),
        ease: "linear",
        onComplete: () => api.current?.after(then),
      }),
    );
  };

  /** One beat of the scan. */
  const scan = () => {
    mode.current = "search";
    flicker(true);
    const from = needle.get();
    const stop = nextStop(from);
    target.current = stop;
    if (!stop) {
      sweepTo(1, "wrap");
      return;
    }
    if (!motionSafe) {
      // Reduced motion: a still stop in the static, then the station.
      const between = r3(from + (stop.pos - from) * 0.5);
      needle.set(between);
      timer.current = window.setTimeout(
        () => {
          timer.current = null;
          needle.set(stop.pos);
          api.current?.after("dwell");
        },
        Math.round((0.9 / pace) * 1000),
      );
      return;
    }
    // Sweep up to the edge of the station's signal, then catch it: the
    // sweep's own speed carries the needle a little past, and it hunts back.
    const approach = stop.pos - b.width * 1.5;
    if (from >= approach) {
      api.current?.after("dwell");
      return;
    }
    sweepTo(approach, "dwell");
  };

  const after = (next: "dwell" | "leave" | "wrap") => {
    if (!live || mode.current === "hand" || determinate) return;
    clearTimers();
    if (next === "dwell") {
      const stop = target.current;
      if (!stop) {
        scan();
        return;
      }
      mode.current = "dwell";
      if (motionSafe) {
        run(
          "needle",
          animate(needle, stop.pos, {
            ...springs.snap,
            velocity: SWEEP * pace * 1.6,
          }),
        );
      }
      setReading(stop.pos);
      timer.current = window.setTimeout(
        () => {
          timer.current = null;
          api.current?.after("leave");
        },
        Math.round(((motionSafe ? 0.85 : 1.1) / pace) * 1000),
      );
      return;
    }
    if (next === "wrap") {
      // The top of the band: back to the bottom and round again.
      mode.current = "search";
      if (!motionSafe) {
        needle.set(0.02);
        scan();
        return;
      }
      run(
        "needle",
        animate(needle, 0.02, {
          ...springs.glide,
          onComplete: () => api.current?.step(),
        }),
      );
      return;
    }
    scan();
  };

  /** Where progress puts the needle, and the lock at the end of the work. */
  const follow = () => {
    const to = 0.03 + (b.home - 0.03) * share;
    if (locked) {
      mode.current = "lock";
      flicker(false);
      glow(1);
      setReading(b.home);
      if (!motionSafe) {
        needle.set(b.home);
        return;
      }
      // Carried a hair past the mark, it settles back onto it.
      run(
        "needle",
        animate(needle, b.home, {
          ...springs.snap,
          velocity: Math.max(0.25, needle.getVelocity()),
        }),
      );
      return;
    }
    mode.current = "search";
    glow(0);
    flicker(true);
    if (!motionSafe) {
      needle.set(to);
      return;
    }
    run("needle", animate(needle, to, springs.glide));
  };

  const step = () => {
    if (!live || mode.current === "hand") return;
    clearTimers();
    if (determinate) {
      follow();
      return;
    }
    glow(0);
    const stop = target.current;
    if (mode.current === "dwell" && stop && b.stations.includes(stop)) {
      after("dwell");
      return;
    }
    scan();
  };

  const pause = () => {
    clearTimers();
    // A needle the hand just let go of finishes its settle; only the
    // search's own motion stops.
    if (mode.current !== "hand") halt("needle");
    halt("clock");
  };

  const endHum = () => {
    hum.current?.stop();
    hum.current = null;
  };

  /** The whistle: it falls toward zero-beat as a station comes in. */
  const whistle = (pos: number) => {
    const st = nearest(b, pos);
    const d = Math.abs(pos - st.pos);
    hum.current?.set({
      pitch: r3(0.45 + 2 * clamp01(d / (b.width * 5))),
      gain: r3(0.6 * Math.max(0.25, Math.exp(-d / (b.width * 6)))),
      pan: pan(),
    });
  };

  /** A click for each scale mark the needle passes under the hand. */
  const ticks = (pos: number) => {
    const prev = lastTick.current;
    lastTick.current = pos;
    if (prev < 0) return;
    const lo = Math.min(prev, pos);
    const hi = Math.max(prev, pos);
    if (b.minors.some((m) => m > lo && m <= hi)) {
      audio.play("click", { pitch: 1.7, gain: 0.16, pan: pan() });
    }
  };

  /** Hands off: after a moment untouched it goes back to work. */
  const scheduleResume = () => {
    if (resume.current !== null) window.clearTimeout(resume.current);
    resume.current = window.setTimeout(() => {
      resume.current = null;
      mode.current = "search";
      api.current?.step();
    }, RESUME_MS);
  };

  /** Moves the needle by hand to `to`, pulled onto a station when it is close. */
  const tuneTo = (to: number, velocity = 0, capture = 2.2) => {
    clearTimers();
    mode.current = "hand";
    glow(0);
    flicker(true);
    const st = nearest(b, to);
    const onStation = Math.abs(st.pos - to) <= b.width * capture;
    const land = onStation ? st.pos : clamp01(to);
    setReading(land);
    if (onStation) clickAt.current = land;
    if (!motionSafe) {
      needle.set(land);
      if (onStation) {
        clickAt.current = null;
        audio.play("click", { pitch: 2.3, gain: 0.45, pan: pan() });
      }
    } else {
      run(
        "needle",
        animate(
          needle,
          land,
          onStation
            ? { ...springs.snap, velocity }
            : { ...springs.glide, velocity },
        ),
      );
    }
    scheduleResume();
  };

  const seek = (direction: 1 | -1) => {
    const from = needle.get();
    const list = direction > 0 ? b.stations : [...b.stations].reverse();
    const st =
      list.find((s) =>
        direction > 0
          ? s.pos > from + b.width * 0.5
          : s.pos < from - b.width * 0.5,
      ) ?? list[0];
    if (st) tuneTo(st.pos, direction * 0.6, 0.5);
  };

  React.useEffect(() => {
    api.current = { step, pause, after, endHum };
  });

  React.useEffect(() => {
    if (!live) return;
    api.current?.step();
    return () => api.current?.pause();
  }, [live, determinate, share, pace, motionSafe, bandKey]);

  // The lock click lands when the needle does, not when its spring is done.
  React.useEffect(
    () =>
      needle.on("change", (v) => {
        const at = clickAt.current;
        if (at === null || Math.abs(v - at) > 0.004) return;
        clickAt.current = null;
        audio.play("click", { pitch: 2.3, gain: 0.45, pan: 0 });
      }),
    [needle, audio],
  );

  React.useEffect(() => {
    const onVisibility = () => setPageShown(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!sound || disabled) api.current?.endHum();
  }, [sound, disabled]);

  React.useEffect(() => {
    const running = anims.current;
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      if (resume.current !== null) window.clearTimeout(resume.current);
      resume.current = null;
      hum.current?.stop();
      hum.current = null;
      for (const c of running.values()) c.stop();
      running.clear();
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLSpanElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  /** The needle moves 1:1 under the pointer: this many px per full dial. */
  const dialPx = (DIAL_SPAN * px) / BOX;

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled,
    onStart: () => {
      pause();
      if (resume.current !== null) window.clearTimeout(resume.current);
      resume.current = null;
      mode.current = "hand";
      clickAt.current = null;
      glow(0);
      grip.current = needle.get();
      lastTick.current = grip.current;
      hum.current?.stop();
      hum.current = audio.start("hum", { pitch: 1, gain: 0, pan: pan() });
      whistle(grip.current);
    },
    onMove: ({ offset }) => {
      const raw = grip.current + offset.x / dialPx;
      const pos = r3(rubberClamp(raw, 0, 1, 0.08));
      needle.set(pos);
      whistle(pos);
      ticks(pos);
    },
    onEnd: ({ velocity }) => {
      endHum();
      const v = velocity.x / dialPx;
      const rest = Math.min(1, Math.max(0, project(needle.get(), v, 0.99)));
      tuneTo(rest, v);
    },
    onCancel: () => {
      endHum();
      tuneTo(needle.get());
    },
    onTap: () => {
      if (!disabled) seek(1);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return;
    const fine = posAt(b, b.lo + b.fine) - posAt(b, b.lo);
    const nudge = (d: number) => {
      const to = clamp01(needle.get() + d);
      audio.play("click", { pitch: 1.7, gain: 0.25, pan: pan() });
      tuneTo(to, 0, 0.2);
    };
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        nudge(b.log ? fine * 0.6 : fine);
        return;
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        nudge(-(b.log ? fine * 0.6 : fine));
        return;
      case "PageUp":
        event.preventDefault();
        seek(1);
        return;
      case "PageDown":
        event.preventDefault();
        seek(-1);
        return;
      case "Home":
        event.preventDefault();
        tuneTo(0, 0, 0);
        return;
      case "End":
        event.preventDefault();
        tuneTo(1, 0, 0);
        return;
    }
  };

  const meter = useTransform(
    [needle, clock, lock] as MotionValue<number>[],
    ([pos = 0, t = 0, l = 0]: number[]) => {
      const signal = signalAt(b, pos);
      const noise = motionSafe ? b.noise(t) : 0.35;
      const m = signal * (0.92 + 0.08 * noise) + (1 - signal) * 0.5 * noise;
      return r3(clamp01(m + (1 - m) * l));
    },
  );
  const needleX = useTransform(needle, (pos) => r3(dialX(pos)));
  const knobTurn = useTransform(needle, (pos) => r3(pos * KNOB_TURN));

  const detailed = px >= 24;
  const polished = px >= 40;
  const bars = detailed ? 5 : 3;
  const barWidth = detailed ? 1.25 : 2;
  const barGap = detailed ? 0.55 : 0.9;
  const unlit = `color-mix(in oklab, ${look.body} 62%, black)`;
  const hairline = r3(Math.max(0.5, unit * 0.9));

  const freq = freqAt(b, reading);
  // Spoken by where the needle sits, not by how loud the station is.
  const off = Math.abs(reading - nearest(b, reading).pos) / b.width;
  const where =
    off < 0.2 ? "on a station" : off < 1.4 ? "near a station" : "static";
  const valueText = `${freq.toFixed(b.digits)} ${b.unit}, ${where}`;

  const role = determinate
    ? {
        role: "progressbar" as const,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        "aria-valuenow": Math.round(share * 100),
      }
    : { role: "status" as const };

  return (
    <span
      ref={bindRoot}
      className={cn(
        "group/radio-tune inline-flex items-center align-middle",
        className,
      )}
      style={{ gap: Math.round(Math.max(6, px * 0.28)) }}
    >
      <span
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label="Tuning"
        aria-describedby={hintId}
        aria-valuemin={b.lo}
        aria-valuemax={b.hi}
        aria-valuenow={freq}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          // A hand on the knob — keyboard focus — stops the search. A
          // pointer that grabbed it lets go when it lets go.
          if (event.currentTarget.matches(":focus-visible")) setHeld(true);
        }}
        onBlur={() => {
          setHeld(false);
          endHum();
        }}
        {...drag}
        className={cn(
          "relative inline-flex shrink-0 touch-pan-y items-center justify-center rounded-2 outline-none select-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled ? "cursor-default" : "cursor-ew-resize",
        )}
        style={{ width: px, height: px }}
      >
        <svg
          aria-hidden
          width={px}
          height={px}
          viewBox={`0 0 ${BOX} ${BOX}`}
          className="block overflow-hidden"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={4} y={7.4} width={24} height={8.6} rx={1.4} />
            </clipPath>
          </defs>
          {polished ? (
            <g style={{ fill: look.edge }}>
              <rect x={5} y={27} width={3.4} height={1.6} rx={0.6} />
              <rect x={23.6} y={27} width={3.4} height={1.6} rx={0.6} />
            </g>
          ) : null}
          <rect
            x={1.5}
            y={4.4}
            width={29}
            height={23.2}
            rx={detailed ? 3.4 : 2.6}
            strokeWidth={hairline}
            style={{ fill: look.body, stroke: look.edge }}
          />
          {polished && look.grain ? (
            <g
              fill="none"
              strokeWidth={0.35}
              strokeLinecap="round"
              style={{ stroke: look.grain }}
            >
              <path d="M 3 19 C 9 17.6 14 21 20 19.4" />
              <path d="M 3 23.6 C 8 22.2 12 25 17.5 23.4" />
              <path d="M 12 26.2 C 16 25.2 19 26.6 21 25.8" />
            </g>
          ) : null}
          <g clipPath={`url(#${clipId})`}>
            <rect
              x={4}
              y={7.4}
              width={24}
              height={8.6}
              style={{ fill: BACKLIGHT }}
            />
            <motion.rect
              x={4}
              y={7.4}
              width={24}
              height={8.6}
              style={{ fill: GLOW, opacity: lock }}
            />
            {detailed ? (
              <g strokeWidth={r3(Math.max(0.3, unit * 0.55))}>
                {b.minors.map((m) => (
                  <line
                    key={m}
                    x1={r3(dialX(m))}
                    x2={r3(dialX(m))}
                    y1={14.6}
                    y2={15.4}
                    style={{ stroke: SCALE_INK }}
                  />
                ))}
                {b.majors.map((m) => (
                  <line
                    key={m.text}
                    x1={r3(dialX(m.f))}
                    x2={r3(dialX(m.f))}
                    y1={13.6}
                    y2={15.4}
                    style={{ stroke: SCALE_INK }}
                  />
                ))}
              </g>
            ) : (
              <line
                x1={DIAL_LEFT}
                x2={DIAL_LEFT + DIAL_SPAN}
                y1={14.4}
                y2={14.4}
                strokeWidth={r3(unit * 0.8)}
                style={{ stroke: SCALE_INK }}
              />
            )}
            {polished
              ? b.majors.slice(1, -1).map((m) => (
                  <text
                    key={m.text}
                    x={r3(dialX(m.f))}
                    y={12.8}
                    fontSize={2}
                    textAnchor="middle"
                    className="font-mono"
                    style={{ fill: SCALE_INK }}
                  >
                    {m.text}
                  </text>
                ))
              : null}
            {detailed
              ? b.stations.map((st) => (
                  <circle
                    key={st.pos}
                    cx={r3(dialX(st.pos))}
                    cy={polished ? 9.2 : 10.2}
                    r={r3(0.3 + 0.35 * st.strength)}
                    style={{ fill: SCALE_INK }}
                  />
                ))
              : null}
            <motion.line
              x1={needleX}
              x2={needleX}
              y1={7.9}
              y2={15.6}
              strokeWidth={r3(Math.max(0.7, unit * 0.95))}
              strokeLinecap="round"
              style={{ stroke: NEEDLE }}
            />
          </g>
          <rect
            x={4}
            y={7.4}
            width={24}
            height={8.6}
            rx={1.4}
            fill="none"
            strokeWidth={hairline}
            style={{ stroke: look.edge }}
          />
          <g>
            {Array.from({ length: bars }, (_, i) => (
              <Bar
                key={i}
                meter={meter}
                index={i}
                count={bars}
                x={4.4 + i * (barWidth + barGap)}
                width={barWidth}
                height={detailed ? 1.5 + i * 1.05 : 2 + i * 2}
                unlit={unlit}
              />
            ))}
          </g>
          {polished ? (
            <text
              x={15.8}
              y={24.9}
              fontSize={2.6}
              textAnchor="middle"
              className="font-mono"
              style={{ fill: look.ink }}
            >
              {b.name}
            </text>
          ) : null}
          <motion.g style={{ rotate: knobTurn, originX: 0.5, originY: 0.5 }}>
            <circle
              cx={KNOB.cx}
              cy={KNOB.cy}
              r={KNOB.r}
              strokeWidth={hairline}
              style={{ fill: look.knob, stroke: look.knobEdge }}
            />
            {detailed
              ? Array.from({ length: 12 }, (_, i) => {
                  const a = (i * Math.PI) / 6;
                  const c = Math.cos(a);
                  const s = Math.sin(a);
                  return (
                    <line
                      key={i}
                      x1={r3(KNOB.cx + c * (KNOB.r - 0.9))}
                      y1={r3(KNOB.cy + s * (KNOB.r - 0.9))}
                      x2={r3(KNOB.cx + c * KNOB.r)}
                      y2={r3(KNOB.cy + s * KNOB.r)}
                      strokeWidth={0.35}
                      style={{ stroke: look.knobEdge }}
                    />
                  );
                })
              : null}
            <line
              x1={KNOB.cx}
              y1={KNOB.cy}
              x2={KNOB.cx}
              y2={r3(KNOB.cy - KNOB.r + 0.7)}
              strokeWidth={r3(Math.max(0.6, unit * 0.9))}
              strokeLinecap="round"
              style={{ stroke: look.knobEdge }}
            />
          </motion.g>
        </svg>
      </span>
      <span
        {...role}
        aria-label={name}
        className={cn(
          "min-w-0",
          hideLabel || label === undefined ? "sr-only" : "truncate",
        )}
        title={hideLabel ? undefined : label}
      >
        {label}
      </span>
      <span id={hintId} className="sr-only">
        Drag sideways or use the arrow keys to tune; Page Up and Page Down seek.
      </span>
    </span>
  );
}
