"use client";

import * as React from "react";

import {
  animate,
  motion,
  motionValue,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionStyle,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type NeonStrikeColour = "rose" | "sky" | "amber" | "lime";

export type NeonStrikeProps = {
  /** The status phrases, lit one after another and cycled in order. */
  phrases: string[];
  /** Warming. False powers the sign down, lights `doneText` and stops. @default true */
  active?: boolean;
  /** What stays lit once inactive. @default the last phrase */
  doneText?: string;
  /**
   * Determinate, 0 to 1: phrase i owns the band [i/n, (i+1)/n) and the share
   * of its letters lit is the progress through that band.
   */
  progress?: number;
  /** How fast tubes strike, hold and stutter, 0.5 to 2. @default 1 */
  speed?: number;
  /** How far the glow spills, 0 (bare tubes) to 1. @default 0.6 */
  glow?: number;
  /** The gas in the tubes. @default "rose" */
  colour?: NeonStrikeColour;
  /** One tube keeps a stutter. @default true */
  faulty?: boolean;
  /** Play the flickers and knocks the visitor causes. Off unless asked for. @default false */
  sound?: boolean;
  /** Keep lighting, but the sign cannot be knocked. */
  disabled?: boolean;
  /** A phrase began: its index in `phrases`, or -1 for `doneText`. */
  onPhraseChange?: (index: number) => void;
  className?: string;
};

/** The mean gap between strikes, s at speed 1. */
const GAP = 0.14;
/** The gap between strikes when progress catches up, s at speed 1. */
const CATCH_UP = 0.07;
/** A lit phrase's rest, s at speed 1. */
const HOLD = 2.2;
/** Dark between phrases, s at speed 1. */
const OFF = 0.35;
/** A pointer this close to a tube's centre makes it flicker, px. */
const NEAR = 22;
/** A tube flickered by the pointer rests this long before it can again, ms. */
const COOLDOWN = 450;
/** How fast a knock travels through the glass, px/s. */
const WAVE = 700;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct = (v: number) => Math.round(clamp01(v) * 100);

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

type Gas = { tube: string; core: string; wall: string; glass: string };

/** A gas as fixed pigments: a lit sign looks the same on any page. */
const gasOf = (l: number, c: number, h: number): Gas => ({
  tube: `oklch(${l} ${c} ${h})`,
  core: `oklch(0.97 ${r2(c * 0.28)} ${h})`,
  wall: `oklch(0.52 ${r2(c * 0.28)} ${h} / 0.85)`,
  glass: `oklch(0.42 ${r2(c * 0.2)} ${h} / 0.2)`,
});

const GASES: Record<NeonStrikeColour, Gas> = {
  rose: gasOf(0.7, 0.21, 5),
  sky: gasOf(0.78, 0.14, 230),
  amber: gasOf(0.82, 0.16, 70),
  lime: gasOf(0.88, 0.2, 130),
};

const BOARD =
  "linear-gradient(oklch(0.205 0.012 262), oklch(0.16 0.012 262) 70%)";
const SCREW =
  "radial-gradient(circle at 35% 35%, oklch(0.62 0.01 262), oklch(0.3 0.01 262) 70%)";

/** A CSS custom property carried by a motion value (motion sets it with setProperty). */
const cssVar = (name: `--${string}`, value: MotionValue<string>) =>
  ({ [name]: value }) as MotionStyle;

type Pattern = { values: number[]; times: number[]; duration: number };

/**
 * How one tube strikes: a dim try or two as the gas catches, a flash, a
 * flicker, then the steady glow. Seeded, so it strikes the same way each time.
 */
function strikeOf(rand: () => number): Pattern {
  const values = [0];
  const times = [0];
  let t = 0;
  const push = (dt: number, v: number) => {
    t += dt;
    values.push(r2(v));
    times.push(t);
  };
  const tries = rand() < 0.55 ? 1 + Math.floor(rand() * 2) : 0;
  for (let k = 0; k < tries; k += 1) {
    push(0.05 + rand() * 0.06, 0.2 + rand() * 0.25);
    push(0.03 + rand() * 0.04, 0);
  }
  push(0.03 + rand() * 0.05, 1.55);
  push(0.03 + rand() * 0.03, 0.25 + rand() * 0.3);
  push(0.03 + rand() * 0.04, 1.25);
  if (rand() < 0.5) {
    push(0.03, 0.6);
    push(0.04, 1.1);
  }
  push(0.12 + rand() * 0.1, 1);
  return {
    values,
    times: times.map((x) => r2(x / t)),
    duration: r2(t),
  };
}

type Plan = {
  chars: string[];
  /** Letter indices in the order they strike. */
  order: number[];
  /** Where each letter falls in that order; -1 for spaces. */
  rank: number[];
  /** Each strike's gap before it, times GAP. */
  gaps: number[];
  strikes: Pattern[];
  /** The tube that stutters. */
  fault: number;
  cells: { lum: MotionValue<number> }[];
};

function planOf(text: string, determinate: boolean, lit: boolean): Plan {
  const chars = Array.from(text);
  const rand = lcg(hash(text));
  const letters: { i: number; key: number }[] = [];
  const strikes: Pattern[] = [];
  chars.forEach((ch, i) => {
    const jitter = rand();
    strikes.push(strikeOf(lcg(hash(`${text}:${i}`))));
    if (ch.trim() === "") return;
    // Warming, tubes catch in any order; as a meter, mostly left to right so
    // the lit part reads as the start of the phrase.
    letters.push({ i, key: i + jitter * (determinate ? 1.5 : 7) });
  });
  const order = [...letters].sort((a, b) => a.key - b.key).map((l) => l.i);
  const rank = chars.map(() => -1);
  order.forEach((i, k) => {
    rank[i] = k;
  });
  return {
    chars,
    order,
    rank,
    gaps: order.map(() => r2(0.4 + rand() * 1.4)),
    strikes,
    fault: order[Math.floor(rand() * order.length)] ?? -1,
    cells: chars.map(() => ({ lum: motionValue(lit ? 1 : 0) })),
  };
}

type Slot = {
  n: number;
  index: number;
  text: string;
  final: boolean;
  /** Arrives lit (a sign that starts finished). */
  lit: boolean;
  /** Lit as a meter of progress, not warmed up whole. */
  meter: boolean;
};

type Sign = {
  phase: "warm" | "hold" | "off" | "done";
  /** How many letters, in strike order, are lit. */
  lit: number;
  timer: number | null;
  /**
   * When the pending beat is due (performance.now ms). Kept across a pause
   * or a re-run, so progress arriving every 100ms never starves a beat by
   * restarting its wait.
   */
  until: number | null;
  fault: number | null;
};

type Api = {
  resume: () => void;
  pause: () => void;
  tick: () => void;
  powerDown: () => void;
  advance: () => void;
  turn: (on: boolean) => void;
  faults: () => void;
  measure: () => void;
};

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Tube({
  char,
  lum,
  gas,
  glow,
  bind,
}: {
  char: string;
  lum: MotionValue<number>;
  gas: Gas;
  glow: number;
  bind: (node: HTMLSpanElement | null) => void;
}) {
  // Unlit, a tube is hollow glass: a faint fill inside a tinted wall. Lit,
  // the core runs white-hot, the wall takes the gas's colour, and the glow
  // spills in layers; past 1 it flashes toward white.
  const fill = useTransform(lum, (l) =>
    l <= 1
      ? `color-mix(in oklab, ${gas.core} ${pct(l)}%, ${gas.glass})`
      : `color-mix(in oklab, white ${pct(((l - 1) / 0.6) * 0.75)}%, ${gas.core})`,
  );
  const wall = useTransform(
    lum,
    (l) => `0.6px color-mix(in oklab, ${gas.tube} ${pct(l)}%, ${gas.wall})`,
  );
  const halo = useTransform(lum, (l) => {
    if (l < 0.02) return "none";
    const a = Math.min(1.5, l);
    const k = Math.min(1, a);
    const layers = [
      `0 0 ${r2(1 + a)}px ${gas.tube}`,
      `0 0 ${r2((3 + 6 * glow) * a)}px color-mix(in oklab, ${gas.tube} ${pct(0.9 * k)}%, transparent)`,
      `0 0 ${r2((10 + 22 * glow) * a)}px color-mix(in oklab, ${gas.tube} ${pct((0.3 + 0.35 * glow) * k)}%, transparent)`,
    ];
    if (glow > 0.02) {
      layers.push(
        `0 0 ${r2((24 + 34 * glow) * a)}px color-mix(in oklab, ${gas.tube} ${pct(0.3 * glow * k)}%, transparent)`,
      );
    }
    return layers.join(", ");
  });
  return (
    <motion.span
      ref={bind}
      className="relative inline-block [-webkit-text-stroke:var(--neon-wall)]"
      style={{ color: fill, textShadow: halo, ...cssVar("--neon-wall", wall) }}
    >
      {char}
    </motion.span>
  );
}

/**
 * A status line in bent neon tube on a dark sign board. Each phrase warms up
 * tube by tube in an uneven, seeded order: a tube tries once or twice, strikes
 * with a white flash, flickers and settles to a steady glow, and the board
 * takes on the colour as more of the sign lights. Lit, the phrase holds — one
 * tube may keep a stutter — then the sign powers down and the next phrase's
 * glass warms up. Given `progress`, the sign is a meter across its phrases,
 * lighting the share of each phrase's letters that its band of progress has
 * reached.
 *
 * The sign is a real button. The pointer near a tube makes it flicker (an
 * unlit one blips); a press knocks the glass and a flicker runs out from the
 * point; Left and Right walk a probe along the letters and flicker each, and
 * Space or Enter knocks from the probe. Each tube's luminance is one motion
 * value; the rhythm is a timer that runs only on screen in a visible page.
 * The phrase is in a polite live region, announced once. Under reduced
 * motion there is no flash, flicker or stutter: tubes light with a fade in the
 * same order, and a knock is a gentle swell.
 */
export function NeonStrike({
  phrases,
  active = true,
  doneText,
  progress,
  speed = 1,
  glow = 0.6,
  colour = "rose",
  faulty = true,
  sound = false,
  disabled = false,
  onPhraseChange,
  className,
}: NeonStrikeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rate = clamp(speed, 0.5, 2);
  const g = clamp01(glow);
  const gas = GASES[colour] ?? GASES.rose;
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
  // Which phrase the progress is on, and how far through it.
  const band = Math.min(list.length - 1, Math.floor(p * list.length));
  const share = p >= 1 ? 1 : clamp01(p * list.length - band);

  const [slot, setSlot] = React.useState<Slot>(() =>
    active
      ? {
          n: 0,
          index: determinate ? band : 0,
          text: list[determinate ? band : 0] ?? "",
          final: false,
          lit: false,
          meter: determinate,
        }
      : { n: 0, index: -1, text: done, final: true, lit: true, meter: false },
  );
  const [height, setHeight] = React.useState<number | null>(null);

  // The plan belongs to the phrase: a switch between meter and warm-up
  // powers the sign down and starts a new one, rather than re-lighting this.
  const plan = React.useMemo(
    () => planOf(slot.text, slot.meter, slot.lit),
    [slot],
  );
  const m = plan.order.length;
  const target = slot.meter ? Math.round(share * m) : m;

  const litShare = useMotionValue(slot.lit ? 1 : 0);
  const probeX = useMotionValue(0);
  const probeY = useMotionValue(0);
  const probeOn = useMotionValue(0);

  const signRef = React.useRef<HTMLButtonElement | null>(null);
  const letters = React.useRef(new Map<string, HTMLSpanElement>());
  const spots = React.useRef<({ x: number; y: number; b: number } | null)[]>(
    [],
  );
  const sign = React.useRef<Sign>({
    phase: slot.lit ? "done" : "warm",
    lit: slot.lit ? m : 0,
    timer: null,
    until: null,
    fault: null,
  });
  const tubes = React.useRef(new Map<number, AnimationPlaybackControls>());
  const wash = React.useRef<AnimationPlaybackControls | null>(null);
  const cooled = React.useRef(new Map<number, number>());
  const probe = React.useRef(-1);
  const pointer = React.useRef("mouse");
  const faultRand = React.useRef(lcg(hash(slot.text) ^ 0x9e3779b9));
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onPhraseChange);
  const wasActive = React.useRef(active);

  const runTube = (i: number, controls: AnimationPlaybackControls) => {
    tubes.current.get(i)?.stop();
    tubes.current.set(i, controls);
  };

  const stopTubes = () => {
    for (const c of tubes.current.values()) c.stop();
    tubes.current.clear();
  };

  const setWash = (lit: number) => {
    wash.current?.stop();
    wash.current = animate(litShare, m ? r2(lit / m) : 0, {
      duration: durations.slow,
      ease: easings.enter,
    });
  };

  const isLit = (i: number) => {
    const k = plan.rank[i] ?? -1;
    return k >= 0 && k < sign.current.lit && sign.current.phase !== "off";
  };

  /** The next tube in the order strikes on. */
  const strikeNext = () => {
    const s = sign.current;
    const i = plan.order[s.lit];
    if (i === undefined) return;
    s.lit += 1;
    const cell = plan.cells[i];
    const pattern = plan.strikes[i];
    if (!cell || !pattern) return;
    if (!motionSafe) {
      runTube(
        i,
        animate(cell.lum, 1, { duration: durations.base, ease: easings.enter }),
      );
    } else {
      runTube(
        i,
        animate(cell.lum, [cell.lum.get(), ...pattern.values.slice(1)], {
          duration: pattern.duration / rate,
          times: pattern.times,
          ease: "linear",
        }),
      );
    }
    setWash(s.lit);
  };

  /** Letters past what progress allows go dark again. */
  const dimTo = (goal: number) => {
    const s = sign.current;
    for (let k = goal; k < s.lit; k += 1) {
      const i = plan.order[k];
      const cell = i === undefined ? undefined : plan.cells[i];
      if (i === undefined || !cell) continue;
      runTube(
        i,
        animate(cell.lum, 0, { duration: durations.fast, ease: easings.exit }),
      );
    }
    s.lit = goal;
    setWash(goal);
  };

  const clearTimer = () => {
    const s = sign.current;
    if (s.timer !== null) window.clearTimeout(s.timer);
    s.timer = null;
  };

  const meter = slot.meter && determinate && active;

  /** The sign's next move, from where it stands. */
  const schedule = () => {
    clearTimer();
    if (!running) return;
    const s = sign.current;
    if (s.phase === "done") return;
    const beat = (seconds: number, then: () => void) => {
      const now = performance.now();
      s.until ??= now + (seconds / rate) * 1000;
      s.timer = window.setTimeout(
        () => {
          s.timer = null;
          s.until = null;
          then();
        },
        Math.max(0, Math.round(s.until - now)),
      );
    };
    if (s.phase === "off") {
      beat(OFF, () => api.current?.advance());
      return;
    }
    // Progress has moved on to another phrase, or the sign has switched
    // between meter and warm-up: this phrase goes dark first.
    if (
      !slot.final &&
      (slot.meter !== determinate || (meter && slot.index !== band))
    ) {
      powerDown();
      return;
    }
    if (s.phase === "hold") {
      beat(HOLD, () => api.current?.powerDown());
      return;
    }
    if (s.lit > target) dimTo(target);
    if (s.lit < target) {
      beat(meter ? CATCH_UP : GAP * (plan.gaps[s.lit] ?? 1), () =>
        api.current?.tick(),
      );
      return;
    }
    s.until = null;
    // As a meter it waits here for more progress.
    if (meter) return;
    s.phase = slot.final && !active ? "done" : "hold";
    if (s.phase === "hold") schedule();
  };

  /** Every tube to glass, then the next phrase. */
  const powerDown = () => {
    const s = sign.current;
    clearTimer();
    s.phase = "off";
    s.until = null;
    stopTubes();
    plan.cells.forEach((cell, i) => {
      if (cell.lum.get() <= 0.001) return;
      runTube(
        i,
        animate(cell.lum, 0, {
          duration: motionSafe ? 0.22 : durations.base,
          ease: easings.exit,
        }),
      );
    });
    s.lit = 0;
    setWash(0);
    schedule();
  };

  const advance = () => {
    clearTimer();
    stopTubes();
    let next: Slot;
    if (!active) {
      next = {
        n: slot.n + 1,
        index: -1,
        text: done,
        final: true,
        lit: false,
        meter: false,
      };
    } else {
      const index = determinate
        ? band
        : slot.final
          ? 0
          : (slot.index + 1) % list.length;
      next = {
        n: slot.n + 1,
        index,
        text: list[index] ?? "",
        final: false,
        lit: false,
        meter: determinate,
      };
    }
    sign.current = {
      phase: "warm",
      lit: 0,
      timer: null,
      until: null,
      fault: sign.current.fault,
    };
    probe.current = -1;
    probeOn.set(0);
    cooled.current.clear();
    faultRand.current = lcg(hash(next.text) ^ 0x9e3779b9);
    setSlot(next);
    report.current?.(next.index);
  };

  const turn = (on: boolean) => {
    const s = sign.current;
    if (s.phase === "off") return;
    if (on ? slot.final : !slot.final) powerDown();
  };

  const clearFault = () => {
    const s = sign.current;
    if (s.fault !== null) window.clearTimeout(s.fault);
    s.fault = null;
  };

  /** The faulty tube's stutter, at seeded intervals while the sign runs. */
  const faults = () => {
    clearFault();
    const s = sign.current;
    if (!faulty || !motionSafe || !running || !active || slot.final) return;
    const rand = faultRand.current;
    const wait = (1.2 + rand() * 2.4) / rate;
    s.fault = window.setTimeout(
      () => {
        s.fault = null;
        const i = plan.fault;
        const cell = plan.cells[i];
        // Only a lit, settled tube stutters.
        if (cell && isLit(i) && !cell.lum.isAnimating()) {
          const long = rand() < 0.3;
          runTube(
            i,
            animate(
              cell.lum,
              long ? [1, 0.3, 0, 0, 0.7, 0.1, 1] : [1, 0.12, 0.9, 0.05, 1],
              {
                duration: (long ? 0.7 : 0.2) / rate,
                times: long
                  ? [0, 0.08, 0.2, 0.6, 0.72, 0.82, 1]
                  : [0, 0.25, 0.5, 0.75, 1],
                ease: "linear",
              },
            ),
          );
        }
        api.current?.faults();
      },
      Math.round(wait * 1000),
    );
  };

  const measure = () => {
    const box = signRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    spots.current = plan.chars.map((_, i) => {
      const node = letters.current.get(`${slot.n}:${i}`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      const top = r.top - rect.top - box.clientTop;
      return {
        x: r2(r.left - rect.left - box.clientLeft + r.width / 2),
        y: r2(top + r.height / 2),
        b: r2(top + r.height),
      };
    });
  };

  const panAt = (x: number) => {
    const box = signRef.current;
    return box ? panFrom(box.getBoundingClientRect().left + x, box) : 0;
  };

  /** One tube disturbed: a lit one stutters, an unlit one blips. */
  const flicker = (i: number, strength: number, delay = 0) => {
    const cell = plan.cells[i];
    if (!cell) return;
    const a = clamp(strength, 0.2, 1);
    const lit = isLit(i);
    if (!motionSafe) {
      // A swell, not a flash.
      if (!lit) return;
      runTube(
        i,
        animate(cell.lum, [cell.lum.get(), r2(1 + 0.18 * a), 1], {
          duration: 0.45,
          delay,
          ease: easings.move,
        }),
      );
      return;
    }
    const values = lit
      ? [cell.lum.get(), r2(1 - 0.85 * a), r2(1 + 0.35 * a), r2(1 - 0.5 * a), 1]
      : [cell.lum.get(), r2(0.35 * a), 0.02, r2(0.2 * a), 0];
    runTube(
      i,
      animate(cell.lum, values, {
        duration: lit ? 0.26 : 0.22,
        delay,
        times: [0, 0.2, 0.45, 0.7, 1],
        ease: "linear",
      }),
    );
  };

  const buzzFor = (i: number, gain: number) => {
    const spot = spots.current[i];
    audio.play("buzz", {
      pitch: r2(0.85 + ((hash(`${slot.text}${i}`) % 100) / 100) * 0.3),
      gain,
      pan: spot ? panAt(spot.x) : 0,
    });
  };

  /** The pointer passing near the tubes. */
  const near = (clientX: number, clientY: number) => {
    const box = signRef.current;
    if (!box || disabled) return;
    const rect = box.getBoundingClientRect();
    const x = clientX - rect.left - box.clientLeft;
    const y = clientY - rect.top - box.clientTop;
    let best = -1;
    let bestD = NEAR;
    spots.current.forEach((spot, i) => {
      if (!spot || (plan.rank[i] ?? -1) < 0) return;
      const d = Math.hypot(spot.x - x, spot.y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best < 0) return;
    const now = performance.now();
    if (now - (cooled.current.get(best) ?? -Infinity) < COOLDOWN) return;
    cooled.current.set(best, now);
    if (!motionSafe) return;
    flicker(best, 1 - (bestD / NEAR) * 0.5);
    buzzFor(best, isLit(best) ? 0.28 : 0.14);
  };

  /** A knock on the glass: a flicker runs out from where it landed. */
  const knock = (x: number, y: number) => {
    if (disabled) return;
    audio.play("click", { pitch: 0.9, gain: 0.4, pan: panAt(x) });
    audio.play("buzz", { pitch: 0.8, gain: 0.15, pan: panAt(x) });
    spots.current.forEach((spot, i) => {
      if (!spot || (plan.rank[i] ?? -1) < 0) return;
      const d = Math.hypot(spot.x - x, spot.y - y);
      flicker(i, 1 - d / 300, motionSafe ? r2(d / WAVE) : 0);
    });
  };

  const moveProbe = (to: number) => {
    probe.current = to;
    const spot = spots.current[to];
    if (spot) {
      probeX.set(r2(spot.x - 6));
      probeY.set(r2(spot.b - 3));
    }
    probeOn.set(1);
    flicker(to, 1);
    buzzFor(to, isLit(to) ? 0.28 : 0.14);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const letters = plan.chars
      .map((ch, i) => (ch.trim() === "" ? -1 : i))
      .filter((i) => i >= 0);
    if (!letters.length) return;
    const at = letters.indexOf(probe.current);
    let to: number | undefined;
    switch (event.key) {
      case "ArrowRight":
        to = letters[at < 0 ? 0 : Math.min(letters.length - 1, at + 1)];
        break;
      case "ArrowLeft":
        to = letters[at < 0 ? letters.length - 1 : Math.max(0, at - 1)];
        break;
      case "Home":
        to = letters[0];
        break;
      case "End":
        to = letters[letters.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    if (to !== undefined) moveProbe(to);
  };

  // Before any other layout effect, so a measure on arrival finds it.
  React.useLayoutEffect(() => {
    api.current = {
      resume: schedule,
      pause: clearTimer,
      tick: () => {
        strikeNext();
        schedule();
      },
      powerDown,
      advance,
      turn,
      faults,
      measure,
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

  // A new phrase, the sign coming on screen, a speed, new progress: the
  // rhythm picks up from wherever it stands.
  React.useEffect(() => {
    api.current?.resume();
    return () => api.current?.pause();
  }, [slot, running, rate, target, band, meter, determinate]);

  React.useEffect(() => {
    api.current?.faults();
    const s = sign;
    return () => {
      if (s.current.fault !== null) window.clearTimeout(s.current.fault);
      s.current.fault = null;
    };
  }, [slot, running, faulty, active, motionSafe, rate]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [plan]);

  React.useEffect(() => {
    const running = tubes.current;
    const washing = wash;
    return () => {
      for (const c of running.values()) c.stop();
      running.clear();
      washing.current?.stop();
    };
  }, []);

  const bindSign = React.useCallback((node: HTMLButtonElement | null) => {
    signRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => api.current?.measure());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    void document.fonts?.ready.then(() => api.current?.measure());
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const bindLine = React.useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      setHeight(Math.round(node.offsetHeight));
    });
    sizer.observe(node);
    return () => sizer.disconnect();
  }, []);

  const bindLetter = (key: string) => (node: HTMLSpanElement | null) => {
    if (node) letters.current.set(key, node);
    else letters.current.delete(key);
  };

  const washOpacity = useTransform(litShare, (s) => r2(s * (0.2 + 0.5 * g)));

  // Words stay whole: a phrase too long for the board wraps between them.
  const words: { at: number[]; key: number }[] = [];
  let current: number[] = [];
  plan.chars.forEach((char, at) => {
    if (char.trim() === "") {
      if (current.length) words.push({ at: current, key: at });
      current = [];
      return;
    }
    current.push(at);
  });
  if (current.length) words.push({ at: current, key: plan.chars.length });

  return (
    <>
      <div
        className={cn("relative w-full", className)}
        aria-busy={active || undefined}
      >
        <button
          ref={bindSign}
          type="button"
          aria-label="Knock the sign"
          aria-describedby={hintId}
          disabled={disabled}
          onPointerDown={(event) => {
            pointer.current = event.pointerType;
            if (event.pointerType !== "mouse" || event.button !== 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            knock(event.clientX - rect.left, event.clientY - rect.top);
          }}
          onPointerMove={(event) => near(event.clientX, event.clientY)}
          onClick={(event) => {
            if (event.detail === 0) {
              // Space, Enter or assistive technology: knock from the probe,
              // or from the middle of the sign.
              const box = event.currentTarget;
              const spot = spots.current[probe.current];
              knock(
                spot ? spot.x : box.clientWidth / 2,
                spot ? spot.y : box.clientHeight / 2,
              );
              return;
            }
            if (pointer.current === "mouse") return;
            const rect = event.currentTarget.getBoundingClientRect();
            knock(event.clientX - rect.left, event.clientY - rect.top);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            "group/neon-strike @container relative block w-full touch-pan-y overflow-clip rounded-3 border border-hairline-strong text-left outline-none select-none [-webkit-touch-callout:none]",
            "shadow-[inset_0_1px_0_oklch(1_0_0/0.06),inset_0_-1px_0_oklch(0_0_0/0.4)]",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            disabled ? "cursor-default" : "cursor-pointer",
          )}
          style={{ background: BOARD }}
        >
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: washOpacity,
              background: `radial-gradient(60% 95% at 50% 55%, color-mix(in oklab, ${gas.tube} 45%, transparent), transparent 72%)`,
            }}
          />
          {(
            [
              "top-1.5 left-1.5",
              "top-1.5 right-1.5",
              "bottom-1.5 left-1.5",
              "right-1.5 bottom-1.5",
            ] as const
          ).map((at) => (
            <span
              key={at}
              aria-hidden
              className={cn(
                "pointer-events-none absolute size-1 rounded-full",
                at,
              )}
              style={{ background: SCREW }}
            />
          ))}
          <motion.div
            initial={false}
            animate={{ height: height ?? "auto" }}
            transition={motionSafe ? springs.glide : { duration: 0 }}
          >
            <motion.div
              key={slot.n}
              ref={bindLine}
              aria-hidden
              initial={slot.n === 0 ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: durations.base, ease: easings.enter }}
              className="px-6 py-5 text-[26px] leading-[1.2] tracking-[0.04em] [font-stretch:88%] @md:text-[34px]"
            >
              {words.map((word, w) => (
                <React.Fragment key={word.key}>
                  {w > 0 ? " " : null}
                  <span className="inline-block whitespace-nowrap">
                    {word.at.map((at) => (
                      <Tube
                        key={at}
                        char={plan.chars[at] ?? ""}
                        lum={
                          (plan.cells[at] as { lum: MotionValue<number> }).lum
                        }
                        gas={gas}
                        glow={g}
                        bind={bindLetter(`${slot.n}:${at}`)}
                      />
                    ))}
                  </span>
                </React.Fragment>
              ))}
            </motion.div>
          </motion.div>
          {/* The keyboard's probe: a tick under the tube it last touched. */}
          <motion.span
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 h-[2px] w-3 rounded-full opacity-0 group-focus-visible/neon-strike:opacity-100"
            style={{
              x: probeX,
              y: probeY,
              scaleX: probeOn,
              background: gas.tube,
            }}
          />
        </button>
        <span id={hintId} className="sr-only">
          Move the pointer across the letters, or use Left and Right, to flicker
          them; press to knock the glass.
        </span>
      </div>
      {/* Outside the busy root: a busy ancestor may hold announcements back. */}
      <p role="status" className="sr-only">
        {slot.text}
      </p>
    </>
  );
}
