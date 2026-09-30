"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import {
  panFrom,
  useTactileSound,
  type LoopHandle,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type KilnGlowGlaze = "iron" | "copper" | "ash";

export type KilnGlowProps = {
  /** The status phrases. Without `progress` each fires in turn, cycled in order. */
  phrases: string[];
  /** Firing. False lets the kiln go out: `doneText` cools to its glaze and everything stops. @default true */
  active?: boolean;
  /** What stays, fired, once inactive. @default the last phrase */
  doneText?: string;
  /**
   * Determinate, 0 to 1: the phrase's heat follows it, phrase i owns the band
   * [i/n, (i+1)/n), and at 1 the kiln goes out and the letters cool.
   */
  progress?: number;
  /** How fast the letters take and lose heat, and the haze's pace, 0.5 to 2. @default 1 */
  speed?: number;
  /** How hot the kiln gets at full progress, 0 (a dull red) to 1 (white heat, a wide glow, strong haze). @default 0.8 */
  heat?: number;
  /** The colour the letters cool to once fired. @default "copper" */
  glaze?: KilnGlowGlaze;
  /** Play the quench under the visitor's sweep. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep firing, but the letters cannot be cooled by hand. */
  disabled?: boolean;
  /** A phrase began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  className?: string;
};

/** A phrase firing by itself, s at speed 1. */
const FIRE = 2.8;
/** A fired phrase at its peak, s at speed 1. */
const HOLD = 1;
/** The phrase fading before the next, s at speed 1. */
const CLEAR = 0.3;
/** The kiln at full heat before it goes out, s at speed 1. */
const SOAK = 0.5;
/** Cooling to the glaze, s at speed 1. */
const COOL = 1.6;
/** A sweep faster than this cools what it passes, px/s. */
const QUENCH = 500;
/** How long a quenched letter takes to warm back, s at speed 1. */
const RECOVER = 0.9;
/** The haze band's height, px. */
const HAZE = 24;
const STRANDS = 14;

type Lch = readonly [number, number, number];

/** Dark iron, then a blackbody's climb through red, orange and yellow to white. */
const RAMP: readonly (readonly [number, Lch])[] = [
  [0, [0.46, 0.012, 55]],
  [0.18, [0.48, 0.1, 32]],
  [0.34, [0.56, 0.19, 30]],
  [0.52, [0.66, 0.2, 40]],
  [0.68, [0.77, 0.17, 58]],
  [0.84, [0.88, 0.12, 86]],
  [1, [0.97, 0.03, 95]],
];

/** Each glaze's fired colour: pigment, the same on any page. */
const GLAZES: Record<KilnGlowGlaze, Lch> = {
  iron: [0.68, 0.035, 250],
  copper: [0.71, 0.12, 50],
  ash: [0.85, 0.012, 85],
};

// The chamber is fixed art, dark in both themes like the inside of a kiln:
// soot over firebrick courses.
const CHAMBER =
  "repeating-linear-gradient(0deg, oklch(1 0 0 / 0.028) 0 1px, transparent 1px 15px), linear-gradient(oklch(0.21 0.018 40), oklch(0.15 0.014 35))";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Number(v.toFixed(3));

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const mixLch = (a: Lch, b: Lch, t: number): Lch => {
  // Hue the short way round; near-grey ends barely show it either way.
  let dh = b[2] - a[2];
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    (a[2] + dh * t + 360) % 360,
  ];
};

/** A temperature as a colour: the cold end is iron, or the glaze once fired. */
function lchOf(t: number, fired: number, glaze: Lch): Lch {
  const x = clamp01(t);
  let i = 1;
  while (i < RAMP.length - 1 && (RAMP[i]?.[0] ?? 1) < x) i += 1;
  const [t0, c0] = RAMP[i - 1] as readonly [number, Lch];
  const [t1, c1] = RAMP[i] as readonly [number, Lch];
  const lo = i === 1 ? mixLch(c0, glaze, clamp01(fired)) : c0;
  return mixLch(lo, c1, t1 > t0 ? (x - t0) / (t1 - t0) : 0);
}

const css = ([l, c, h]: Lch, alpha?: number) =>
  alpha === undefined
    ? `oklch(${r3(l)} ${r3(c)} ${r2(h)})`
    : `oklch(${r3(l)} ${r3(c)} ${r2(h)} / ${r2(alpha)})`;

type Ember = {
  temp: MotionValue<number>;
  chill: MotionValue<number>;
  fired: MotionValue<number>;
  /** Thermal mass, 0.8 to 1.4: heavy letters take and lose heat later. */
  mass: number;
};

type Plan = {
  chars: string[];
  words: { key: number; at: number[] }[];
  embers: Ember[];
};

type Slot = {
  n: number;
  index: number;
  text: string;
  final: boolean;
  /** The heat its letters arrive at, and how fired they already are. */
  from: number;
  fired: number;
};

function planOf(slot: Slot): Plan {
  const chars = Array.from(slot.text);
  const rand = lcg(hash(slot.text) ^ 0x6b43a9b5);
  const words: { key: number; at: number[] }[] = [];
  let current: number[] = [];
  chars.forEach((ch, i) => {
    if (ch.trim() === "") {
      if (current.length) words.push({ key: i, at: current });
      current = [];
      return;
    }
    current.push(i);
  });
  if (current.length) words.push({ key: chars.length, at: current });
  return {
    chars,
    words,
    embers: chars.map(() => ({
      temp: motionValue(slot.from),
      chill: motionValue(0),
      fired: motionValue(slot.fired),
      mass: r2(0.8 + rand() * 0.6),
    })),
  };
}

type Box = { x: number; y: number; w: number; h: number };
type Wisp = { id: number; x: number; y: number };

type Phase = "fire" | "hold" | "clear" | "meter" | "soak" | "cool" | "done";
type Engine = {
  phase: Phase;
  timer: number | null;
  until: number | null;
  /** What was left of that wait when the kiln was paused, ms. */
  left: number | null;
  started: boolean;
};

type Api = {
  resume: () => void;
  pause: () => void;
  step: () => void;
  turn: (on: boolean) => void;
  measure: () => void;
  meter: () => void;
  hush: () => void;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Letter({
  char,
  ember,
  glaze,
  glow,
  bind,
}: {
  char: string;
  ember: Ember;
  glaze: Lch;
  glow: number;
  bind: (node: HTMLSpanElement | null) => void;
}) {
  const felt = useTransform(
    [ember.temp, ember.chill] as MotionValue<number>[],
    ([t = 0, c = 0]: number[]) => clamp01(t * (1 - c)),
  );
  const color = useTransform(
    [felt, ember.fired] as MotionValue<number>[],
    ([t = 0, f = 0]: number[]) => css(lchOf(t, f, glaze)),
  );
  // Above red the letter lights its own air: two soft layers of its colour.
  const textShadow = useTransform(
    [felt, ember.fired] as MotionValue<number>[],
    ([t = 0, f = 0]: number[]) => {
      const k = clamp01((t - 0.16) / 0.6);
      if (k <= 0.01) return "none";
      const c = lchOf(t, f, glaze);
      return `0 0 ${r2(2 + 5 * k * glow)}px ${css(c, 0.8 * k)}, 0 0 ${r2(8 + 18 * k * glow)}px ${css(c, 0.45 * k * glow)}`;
    },
  );
  return (
    <motion.span
      ref={bind}
      className="inline-block"
      style={{ color, textShadow }}
    >
      {char}
    </motion.span>
  );
}

function Strand({
  clock,
  index,
  seed,
}: {
  clock: MotionValue<number>;
  index: number;
  seed: number;
}) {
  // Seeded, so no two strands rise alike: where, how high, how bright.
  const rand = lcg(seed + index * 7919);
  const x0 = r2(4 + (92 * index) / (STRANDS - 1) + (rand() - 0.5) * 5);
  const phase = rand() * Math.PI * 2;
  const rate = 0.8 + rand() * 0.6;
  const reach = 0.5 + rand() * 0.5;
  const weight = r2(0.7 + rand() * 0.6);
  const strength = r2(0.35 + rand() * 0.65);
  const d = useTransform(clock, (t) => {
    const pts: string[] = [];
    for (let k = 0; k <= 8; k += 1) {
      const rise = k / 8;
      // A wave travelling up the strand, wider the higher the air has risen.
      const x = x0 + 1.4 * rise * Math.sin(phase + 1.1 * k - t * rate * 2.4);
      pts.push(`${r2(x)} ${r2(HAZE - rise * reach * HAZE)}`);
    }
    return `M ${pts.join(" L ")}`;
  });
  return <motion.path d={d} strokeWidth={weight} opacity={strength} />;
}

/**
 * A determinate text loader fired like a glaze. The phrase stands in a kiln's
 * spy window and its heat is the progress: the letters climb from dark iron
 * through dull red, cherry, orange and yellow to white, each on the drift
 * spring with its own thermal mass, so heat arrives unevenly the way it does
 * in a real firing. Above red they light the air around them, the chamber's
 * back wall glows, and a band of heat haze wavers over the line. At done the
 * kiln goes out and the letters cool back down through the same colours to
 * the glaze's fired colour, and everything stops.
 *
 * A quick sweep of the pointer across the window cools the letters it
 * passes — the faster the sweep, the deeper the chill — with a wisp of steam
 * from the hot ones, and they warm back to the kiln's heat. The window is a
 * button: Space or Enter sweeps across every letter. Without `progress` each
 * phrase fires by itself in turn. The phrase is in a polite live region,
 * announced once; with `progress` a hidden progressbar carries the value.
 * Under reduced motion there is no haze or steam, and the colours still
 * follow the heat, because the heat is the progress.
 */
export function KilnGlow({
  phrases,
  active = true,
  doneText,
  progress,
  speed = 1,
  heat = 0.8,
  glaze = "copper",
  sound = false,
  disabled = false,
  onPhraseChange,
  className,
}: KilnGlowProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const gradId = `kiln-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rate = clamp(speed, 0.5, 2);
  const glow = clamp01(heat);
  const peak = r2(lerp(0.36, 1, glow));
  const fired = GLAZES[glaze] ?? GLAZES.copper;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;

  const list = phrases.length > 0 ? phrases : [doneText ?? ""];
  const done = doneText ?? list[list.length - 1] ?? "";
  const determinate = progress !== undefined;
  const p = clamp01(progress ?? 0);
  const band = Math.min(list.length - 1, Math.floor(p * list.length));

  const [slot, setSlot] = React.useState<Slot>(() => {
    if (!active) {
      return { n: 0, index: -1, text: done, final: true, from: 0, fired: 1 };
    }
    const index = determinate ? band : 0;
    return {
      n: 0,
      index,
      text: list[index] ?? "",
      final: false,
      from: determinate ? r2(p * peak) : 0,
      fired: 0,
    };
  });
  const plan = React.useMemo(() => planOf(slot), [slot]);
  const [height, setHeight] = React.useState<number | null>(null);
  const [hot, setHot] = React.useState(slot.from > 0.2);
  const [wisps, setWisps] = React.useState<Wisp[]>([]);
  // The haze rises from the words: the first line's measured extent.
  const [span, setSpan] = React.useState<{ x: number; w: number } | null>(null);

  const kiln = useMotionValue(slot.from);
  const sheet = useMotionValue(1);
  const clock = useMotionValue(0);
  const sweepX = useMotionValue(0);

  const chamberRef = React.useRef<HTMLButtonElement | null>(null);
  const letters = React.useRef(new Map<string, HTMLSpanElement>());
  const boxes = React.useRef<(Box | null)[]>([]);
  const engine = React.useRef<Engine>({
    phase: slot.final ? "done" : determinate ? "meter" : "fire",
    timer: null,
    until: null,
    left: null,
    started: false,
  });
  const runs = React.useRef(new Map<string, AnimationPlaybackControls>());
  const hazeRun = React.useRef<AnimationPlaybackControls | null>(null);
  const last = React.useRef<{ x: number; y: number; t: number } | null>(null);
  const chilled = React.useRef(new Map<number, number>());
  const loop = React.useRef<LoopHandle | null>(null);
  const hushTimer = React.useRef<number | null>(null);
  const counter = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onPhraseChange);
  const wasActive = React.useRef(active);

  const run = (key: string, controls: AnimationPlaybackControls) => {
    runs.current.get(key)?.stop();
    runs.current.set(key, controls);
  };

  const clearTimer = () => {
    const e = engine.current;
    if (e.timer !== null) window.clearTimeout(e.timer);
    e.timer = null;
  };

  const beat = (seconds: number, then: () => void) => {
    const e = engine.current;
    clearTimer();
    if (!running) return;
    const now = performance.now();
    if (e.until === null) {
      e.until = now + (e.left ?? (seconds / rate) * 1000);
      e.left = null;
    }
    e.timer = window.setTimeout(
      () => {
        e.timer = null;
        e.until = null;
        e.left = null;
        then();
      },
      Math.max(0, Math.round(e.until - now)),
    );
  };

  /** The drift spring, with a letter's own mass: heavy letters lag, none overshoots. */
  const thermal = (mass: number) => ({
    type: "spring" as const,
    stiffness: springs.drift.stiffness * rate * rate,
    damping: springs.drift.damping * Math.sqrt(mass) * rate,
    mass: springs.drift.mass * mass,
  });

  /** Every letter heads for a temperature, each at its own pace. */
  const heatTo = (target: number, how: "spring" | "fire" | "cool") => {
    const t = clamp01(target);
    plan.embers.forEach((ember, i) => {
      // Under reduced motion only the spring goes: a colour change is not
      // movement, and a firing that took its time still shows its progress.
      if (how === "spring" && !motionSafe) {
        run(
          `t${i}`,
          animate(ember.temp, t, {
            duration: durations.base,
            ease: easings.enter,
          }),
        );
        return;
      }
      if (how === "spring") {
        run(
          `t${i}`,
          animate(ember.temp, t, {
            ...thermal(ember.mass),
            velocity: ember.temp.getVelocity(),
          }),
        );
        return;
      }
      const base = how === "fire" ? FIRE : COOL;
      run(
        `t${i}`,
        animate(ember.temp, t, {
          duration: r2((base * (0.78 + 0.28 * ember.mass)) / rate),
          ease: how === "fire" ? easings.move : easings.enter,
        }),
      );
    });
    const k = clamp01(target);
    run(
      "kiln",
      animate(kiln, k, {
        duration:
          how === "spring"
            ? durations.slow
            : r2((how === "fire" ? FIRE : COOL) / rate),
        ease: how === "fire" ? easings.move : easings.enter,
      }),
    );
  };

  const fireGlaze = () => {
    plan.embers.forEach((ember, i) => {
      run(
        `f${i}`,
        animate(ember.fired, 1, {
          duration: durations.slow,
          ease: easings.enter,
        }),
      );
    });
  };

  /** The kiln's next move, from where it stands. */
  const schedule = () => {
    clearTimer();
    const e = engine.current;
    if (!running) return;
    switch (e.phase) {
      case "done":
      case "meter":
        return;
      case "fire":
        if (!e.started) {
          e.started = true;
          heatTo(peak, "fire");
        }
        beat(FIRE, () => api.current?.step());
        return;
      case "hold":
        beat(HOLD, () => api.current?.step());
        return;
      case "clear":
        beat(CLEAR, () => api.current?.step());
        return;
      case "soak":
        beat(SOAK, () => api.current?.step());
        return;
      case "cool":
        if (!e.started) {
          e.started = true;
          fireGlaze();
          heatTo(0, "cool");
        }
        beat(COOL, () => api.current?.step());
        return;
    }
  };

  const setPhase = (phase: Phase) => {
    const e = engine.current;
    e.phase = phase;
    e.until = null;
    e.left = null;
    e.started = false;
    schedule();
  };

  /** A phrase arrives, at a given heat. */
  const arrive = (next: Omit<Slot, "n">) => {
    for (const c of runs.current.values()) c.stop();
    runs.current.clear();
    chilled.current.clear();
    const s: Slot = { ...next, n: slot.n + 1 };
    setSlot(s);
    run(
      "sheet",
      animate(sheet, 1, { duration: durations.base, ease: easings.enter }),
    );
    report.current?.(s.index);
    return s;
  };

  const leave = () => {
    run(
      "sheet",
      animate(sheet, 0, {
        duration: (CLEAR * 0.9) / rate,
        ease: easings.exit,
      }),
    );
    // The chamber dims with the words: the next phrase is fired from cold.
    run(
      "kiln",
      animate(kiln, 0, { duration: CLEAR / rate, ease: easings.exit }),
    );
  };

  /** How far the phrase is fired already: a finished one arrives glazed. */
  const nowFired = () => {
    let max = 0;
    for (const ember of plan.embers) max = Math.max(max, ember.fired.get());
    return r2(max);
  };

  /** How hot the phrase is now: what a new phrase should arrive at. */
  const nowHeat = () => {
    let max = 0;
    for (const ember of plan.embers) max = Math.max(max, ember.temp.get());
    return r2(Math.max(max, kiln.get()));
  };

  const step = () => {
    const e = engine.current;
    switch (e.phase) {
      case "fire":
        setPhase("hold");
        return;
      case "hold":
        leave();
        setPhase("clear");
        return;
      case "clear": {
        kiln.set(0);
        const index = slot.final ? 0 : (slot.index + 1) % list.length;
        arrive({
          index,
          text: list[index] ?? "",
          final: false,
          from: 0,
          fired: 0,
        });
        engine.current = { ...e, phase: "fire", started: false };
        return;
      }
      case "soak":
        setPhase("cool");
        return;
      case "cool":
        setPhase("done");
        return;
    }
  };

  /** Determinate: the heat is the progress, the phrase its band. */
  const meter = () => {
    const e = engine.current;
    if (!active || slot.final) return;
    if (!determinate) {
      // The host stopped reporting progress: the kiln fires by itself.
      if (e.phase === "meter" || e.phase === "soak" || e.phase === "cool") {
        setPhase("fire");
      }
      return;
    }
    if (e.phase === "fire" || e.phase === "hold" || e.phase === "clear") {
      // Progress arrived mid-cycle: the heat follows it from here.
      clearTimer();
      e.phase = "meter";
      e.until = null;
      e.left = null;
      run(
        "sheet",
        animate(sheet, 1, { duration: durations.base, ease: easings.enter }),
      );
    }
    if (e.phase !== "meter") {
      // A finished firing that the host starts again from lower progress.
      const over =
        e.phase === "soak" || e.phase === "cool" || e.phase === "done";
      if (!over || p >= 1) return;
      clearTimer();
      kiln.set(r2(p * peak));
      arrive({
        index: band,
        text: list[band] ?? "",
        final: false,
        from: r2(p * peak),
        fired: 0,
      });
      engine.current = {
        ...e,
        phase: "meter",
        until: null,
        left: null,
        started: false,
      };
      return;
    }
    if (!slot.final && slot.index !== band) {
      arrive({
        index: band,
        text: list[band] ?? "",
        final: false,
        from: nowHeat(),
        fired: 0,
      });
      return;
    }
    heatTo(p * peak, "spring");
    if (p >= 1) setPhase("soak");
  };

  const turn = (on: boolean) => {
    const e = engine.current;
    if (on) {
      if (!slot.final) return;
      const index = determinate ? band : 0;
      kiln.set(determinate ? p * peak : 0);
      arrive({
        index,
        text: list[index] ?? "",
        final: false,
        from: determinate ? r2(p * peak) : 0,
        fired: 0,
      });
      engine.current = {
        ...e,
        phase: determinate ? "meter" : "fire",
        until: null,
        left: null,
        started: false,
      };
      return;
    }
    if (slot.final) return;
    // The kiln goes out: the finished words arrive as hot as the last ones
    // were, and cool from there.
    clearTimer();
    arrive({
      index: -1,
      text: done,
      final: true,
      from: nowHeat(),
      fired: nowFired(),
    });
    engine.current = {
      ...e,
      phase: "cool",
      until: null,
      left: null,
      started: false,
    };
  };

  const measure = () => {
    const box = chamberRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    boxes.current = plan.chars.map((_, i) => {
      const node = letters.current.get(`${slot.n}:${i}`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return {
        x: r2(r.left - rect.left - box.clientLeft),
        y: r2(r.top - rect.top - box.clientTop),
        w: r2(r.width),
        h: r2(r.height),
      };
    });
    const placed = boxes.current.filter((b): b is Box => b !== null);
    if (!placed.length) return;
    const top = Math.min(...placed.map((b) => Math.round(b.y)));
    const first = placed.filter((b) => Math.round(b.y) === top);
    const x = Math.round(Math.min(...first.map((b) => b.x)));
    const w = Math.round(Math.max(...first.map((b) => b.x + b.w)) - x);
    setSpan((was) => (was && was.x === x && was.w === w ? was : { x, w }));
  };

  const hush = () => {
    hushTimer.current = null;
    loop.current?.stop();
    loop.current = null;
  };

  /** One letter meets a draught: it loses heat, then warms back. */
  const quench = (i: number, strength: number) => {
    const ember = plan.embers[i];
    const box = boxes.current[i];
    if (!ember || !box || (plan.chars[i] ?? " ").trim() === "") return;
    const now = performance.now();
    if (now - (chilled.current.get(i) ?? -Infinity) < 140) return;
    chilled.current.set(i, now);
    const felt = ember.temp.get() * (1 - ember.chill.get());
    const peakChill = r2(Math.min(0.9, ember.chill.get() + 0.8 * strength));
    const back = RECOVER / rate;
    run(
      `c${i}`,
      // In fast, a moment held, then warmed back from inside: a quench
      // should be seen, not just flicker past.
      animate(
        ember.chill,
        [ember.chill.get(), peakChill, r2(peakChill * 0.8), 0],
        {
          duration: r2(0.07 + back),
          times: [0, r3(0.07 / (0.07 + back)), 0.45, 1],
          ease: [easings.enter, "linear", easings.move],
        },
      ),
    );
    const chamber = chamberRef.current;
    const pan = chamber
      ? panFrom(
          chamber.getBoundingClientRect().left + box.x + box.w / 2,
          chamber,
        )
      : 0;
    if (felt > 0.3) {
      if (!loop.current) {
        loop.current = audio.start("sizzle", {
          pitch: r2(0.85 + 0.4 * felt),
          gain: r2(0.25 + 0.5 * felt),
          pan,
        });
      } else {
        loop.current.set({
          pitch: r2(0.85 + 0.4 * felt),
          gain: r2(0.25 + 0.5 * felt),
          pan,
        });
      }
      if (hushTimer.current !== null) window.clearTimeout(hushTimer.current);
      hushTimer.current = window.setTimeout(() => api.current?.hush(), 120);
    }
    // Thermal shock: glaze pings as it is cooled from a high heat.
    if (felt > 0.7) {
      audio.play("snap", {
        pitch: r2(1.05 + 0.5 * (hash(`${slot.text}${i}`) % 100) * 0.01),
        gain: 0.35,
        pan,
      });
    }
    if (motionSafe && felt > 0.45) {
      counter.current += 1;
      const wisp = {
        id: counter.current,
        x: r2(box.x + box.w / 2 - 6),
        y: r2(box.y - 10),
      };
      setWisps((all) => [...all.slice(-14), wisp]);
    }
  };

  /** A stroke from one point to another, in the chamber's coordinates. */
  const stroke = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    strength: number,
  ) => {
    const lo = Math.min(a.x, b.x);
    const hi = Math.max(a.x, b.x);
    boxes.current.forEach((box, i) => {
      if (!box) return;
      if (box.x + box.w < lo || box.x > hi) return;
      const cx = box.x + box.w / 2;
      const t = hi > lo ? (cx - a.x) / (b.x - a.x) : 0;
      const y = a.y + (b.y - a.y) * clamp01(t);
      if (y < box.y - 16 || y > box.y + box.h + 16) return;
      quench(i, strength);
    });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const box = chamberRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    const at = {
      x: event.clientX - rect.left - box.clientLeft,
      y: event.clientY - rect.top - box.clientTop,
      t: event.timeStamp,
    };
    const prev = last.current;
    last.current = at;
    if (!prev) return;
    const dt = at.t - prev.t;
    if (dt <= 0 || dt > 120) return;
    const speedPx = (Math.hypot(at.x - prev.x, at.y - prev.y) / dt) * 1000;
    if (speedPx < QUENCH) return;
    stroke(prev, at, clamp((speedPx - QUENCH) / 1400 + 0.3, 0.3, 1));
  };

  /** The keyboard's quench: the same draught, across every letter. */
  const sweep = () => {
    if (disabled) return;
    const all = boxes.current.filter((b): b is Box => b !== null);
    if (!all.length) return;
    if (!motionSafe) {
      plan.chars.forEach((_, i) => quench(i, 0.8));
      return;
    }
    const left = Math.min(...all.map((b) => b.x)) - 4;
    const right = Math.max(...all.map((b) => b.x + b.w)) + 4;
    const lines = [...new Set(all.map((b) => Math.round(b.y)))];
    let prev = left;
    sweepX.set(left);
    run(
      "sweep",
      animate(sweepX, right, {
        duration: r2(Math.max(0.25, (right - left) / 1200)),
        ease: "linear",
        onUpdate: (x) => {
          for (const y of lines) {
            stroke({ x: prev, y: y + 12 }, { x, y: y + 12 }, 0.8);
          }
          prev = x;
        },
      }),
    );
  };

  React.useLayoutEffect(() => {
    api.current = {
      resume: schedule,
      pause: () => {
        clearTimer();
        const e = engine.current;
        if (e.until !== null) {
          e.left = Math.max(0, e.until - performance.now());
          e.until = null;
        }
      },
      step,
      turn,
      measure,
      meter,
      hush,
    };
    report.current = onPhraseChange;
  });

  // The first phrase is state too: the host hears it from the first commit.
  React.useEffect(() => {
    report.current?.(slot.index);
    // Reported once, as the component arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (wasActive.current === active) return;
    wasActive.current = active;
    api.current?.turn(active);
  }, [active]);

  React.useEffect(() => {
    api.current?.resume();
    return () => api.current?.pause();
  }, [slot, running, rate]);

  // Progress moves the heat; a new band brings the next phrase.
  React.useEffect(() => {
    api.current?.meter();
  }, [p, band, slot, determinate, peak]);

  // The haze runs only while the kiln is warm, on screen and moving is welcome.
  React.useEffect(
    () =>
      kiln.on("change", (k) => {
        const warm = k > 0.2;
        setHot((was) => (was === warm ? was : warm));
      }),
    [kiln],
  );
  React.useEffect(() => {
    if (!hot || !running || !motionSafe) return;
    const spin = () => {
      hazeRun.current = animate(clock, clock.get() + 60, {
        duration: 60 / rate,
        ease: "linear",
        onComplete: spin,
      });
    };
    spin();
    return () => {
      hazeRun.current?.stop();
      hazeRun.current = null;
    };
  }, [hot, running, motionSafe, rate, clock]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [plan]);

  React.useEffect(() => {
    const all = runs.current;
    return () => {
      for (const c of all.values()) c.stop();
      all.clear();
      if (hushTimer.current !== null) window.clearTimeout(hushTimer.current);
      hushTimer.current = null;
      loop.current?.stop();
      loop.current = null;
      const e = engine.current;
      if (e.timer !== null) window.clearTimeout(e.timer);
      e.timer = null;
    };
  }, []);

  const bindChamber = React.useCallback((node: HTMLButtonElement | null) => {
    chamberRef.current = node;
    if (!node) return;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, []);

  const bindLine = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setHeight(Math.round(node.offsetHeight));
      api.current?.measure();
    });
    sizer.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => sizer.disconnect();
  }, []);

  const bindLetter = (key: string) => (node: HTMLSpanElement | null) => {
    if (node) letters.current.set(key, node);
    else letters.current.delete(key);
  };

  const wall = useTransform(kiln, (k) => {
    const c = lchOf(k, 0, fired);
    return `radial-gradient(75% 95% at 50% 72%, ${css(c, r2(clamp01(k) * (0.18 + 0.3 * glow)))}, transparent 72%)`;
  });
  const hazeOpacity = useTransform(kiln, (k) =>
    r2(clamp01((k - 0.25) / 0.5) * (0.3 + 0.6 * glow)),
  );
  const hazeColor = useTransform(kiln, (k) => css(lchOf(k, 0, fired)));
  const seed = hash(slot.text);
  const pct = Math.round(p * 100);

  return (
    <>
      <div
        className={cn("relative w-full", className)}
        aria-busy={active || undefined}
      >
        {determinate ? (
          <div
            role="progressbar"
            aria-label={slot.text}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct}%`}
            className="sr-only"
          />
        ) : null}
        <button
          ref={bindChamber}
          type="button"
          aria-label="Cool the letters"
          aria-describedby={hintId}
          disabled={disabled}
          onPointerMove={onPointerMove}
          onPointerLeave={() => {
            last.current = null;
          }}
          onClick={(event) => {
            // Space, Enter or assistive technology: one draught across all.
            if (event.detail === 0) sweep();
          }}
          className={cn(
            "relative block w-full touch-pan-y overflow-clip rounded-3 border border-hairline-strong px-5 pt-7 pb-5 text-left outline-none select-none [-webkit-touch-callout:none]",
            "shadow-[inset_0_2px_10px_oklch(0_0_0/0.55),inset_0_-1px_0_oklch(1_0_0/0.05)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-default" : "cursor-crosshair",
          )}
          style={{ background: CHAMBER }}
        >
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: wall }}
          />
          {motionSafe ? (
            <div
              aria-hidden
              className="pointer-events-none absolute top-2 h-6"
              style={{
                left: span?.x ?? 20,
                width: span?.w ?? "calc(100% - 2.5rem)",
              }}
            >
              <motion.svg
                viewBox={`0 0 100 ${HAZE}`}
                preserveAspectRatio="none"
                className="block size-full overflow-visible"
                style={{ opacity: hazeOpacity }}
              >
                <defs>
                  <linearGradient
                    id={gradId}
                    x1={0}
                    y1={HAZE}
                    x2={0}
                    y2={0}
                    gradientUnits="userSpaceOnUse"
                  >
                    <motion.stop
                      offset={0}
                      style={{ stopColor: hazeColor, stopOpacity: 0.7 }}
                    />
                    <motion.stop
                      offset={1}
                      style={{ stopColor: hazeColor, stopOpacity: 0 }}
                    />
                  </linearGradient>
                </defs>
                <g
                  fill="none"
                  stroke={`url(#${gradId})`}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                >
                  {Array.from({ length: STRANDS }, (_, i) => (
                    <Strand key={i} clock={clock} index={i} seed={seed} />
                  ))}
                </g>
              </motion.svg>
            </div>
          ) : null}
          <motion.div
            aria-hidden
            className="relative"
            initial={false}
            animate={{ height: height ?? "auto" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <motion.div
              key={slot.n}
              ref={bindLine}
              className="text-[22px] leading-[1.3] font-semibold tracking-[0.01em]"
              style={{ opacity: sheet }}
            >
              {plan.words.map((word, w) => (
                <React.Fragment key={word.key}>
                  {w > 0 ? " " : null}
                  <span className="inline-block whitespace-nowrap">
                    {word.at.map((i) => (
                      <Letter
                        key={i}
                        char={plan.chars[i] ?? ""}
                        ember={plan.embers[i] as Ember}
                        glaze={fired}
                        glow={glow}
                        bind={bindLetter(`${slot.n}:${i}`)}
                      />
                    ))}
                  </span>
                </React.Fragment>
              ))}
            </motion.div>
          </motion.div>
          {wisps.map((wisp) => (
            <motion.svg
              key={wisp.id}
              aria-hidden
              width={12}
              height={16}
              viewBox="0 0 12 16"
              className="pointer-events-none absolute top-0 left-0 overflow-visible"
              style={{ x: wisp.x, top: wisp.y }}
              initial={{ y: 4, opacity: 0.55 }}
              animate={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.7, ease: easings.enter }}
              onAnimationComplete={() =>
                setWisps((all) => all.filter((w) => w.id !== wisp.id))
              }
            >
              <path
                d="M6 16 C 3 12, 9 9, 6 5 C 4 2.5, 7 1.5, 6 0"
                fill="none"
                stroke="oklch(0.96 0.01 80 / 0.7)"
                strokeWidth={1.2}
                strokeLinecap="round"
              />
            </motion.svg>
          ))}
        </button>
        <span id={hintId} className="sr-only">
          Sweep the pointer quickly across the letters to cool them for a
          moment, or press Enter to sweep across all of them.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {slot.text}
      </p>
    </>
  );
}
