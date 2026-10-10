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
import { springs } from "@/registry/lib/motion";
import {
  panFrom,
  semitones,
  useTactileSound,
} from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type CipherWheelOrder = "ltr" | "random" | "center";
export type CipherWheelCharset = "alpha" | "digits" | "hex" | "symbols";
export type CipherWheelTrigger = "mount" | "inView" | "hover" | "manual";
export type CipherWheelElement =
  "h1" | "h2" | "h3" | "h4" | "p" | "span" | "div";

export type CipherWheelProps = {
  /** The headline. Read once by assistive technology, and copied as written. */
  text: string;
  /** The element the headline renders as. @default "span" */
  as?: CipherWheelElement;
  /** Which dial locks first: left to right, a seeded shuffle, or from the middle outward. @default "ltr" */
  order?: CipherWheelOrder;
  /** Time scale of the whole run, 0.25 to 3: slow is chunky and every click legible, fast is brisk. @default 1 */
  speed?: number;
  /** The ring each dial turns through. A glyph outside it is added to its own ring. @default "alpha" */
  charset?: CipherWheelCharset;
  /** A custom ring of characters, in the order they roll past; overrides `charset`. */
  characters?: string;
  /** How long the first dial turns before it locks, ms at speed 1. @default 900 */
  duration?: number;
  /** The gap between one lock and the next, ms at speed 1; a long headline's cascade is compressed to 1200ms. @default 70 */
  stagger?: number;
  /** Wait before the dials start, ms. @default 0 */
  delay?: number;
  /** What starts the dials. `hover` rests decrypted and turns again on hover or focus. @default "inView" */
  trigger?: CipherWheelTrigger;
  /** With `inView`, decrypt only the first time it is seen. @default true */
  once?: boolean;
  /** With `manual`: true decrypts, false returns to the scrambled rest. */
  active?: boolean;
  /** A press, Enter or Space turns the dials again, and the pointer thumbs a resting dial. @default true */
  interactive?: boolean;
  /** Draw each dial's housing while it turns. @default true */
  housing?: boolean;
  /** The hairline that flashes under a dial as it locks. @default "var(--accent-bright)" */
  flashColor?: string;
  /** Seeds the scrambled start and the random order. @default 0 */
  seed?: number;
  /** Tick as each dial locks, for runs started by a press, Enter or Space. Off unless asked for. @default false */
  sound?: boolean;
  /** A dial locked, or the dials were reset: how many are locked, of how many. */
  onLock?: (locked: number, total: number) => void;
  /** Every dial has locked and its housing has gone. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const mod = (v: number, n: number) => ((v % n) + n) % n;

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

/** User-perceived characters, so an emoji or an accent never splits across two dials. */
function graphemes(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

type SpringSpec = { stiffness: number; damping: number; mass: number };

/**
 * Where a spring at rest stands `t` seconds after its target steps by one,
 * solved in closed form. A dial is a pawl on a spring following a stepped
 * target, and a spring is linear, so its position is just the sum of one of
 * these per notch — exact physics from the house springs with no animation
 * object per dial and nothing to integrate per frame.
 */
function stepResponse({ stiffness, damping, mass }: SpringSpec) {
  const w0 = Math.sqrt(stiffness / mass);
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  if (zeta >= 1) {
    return (t: number) => (t <= 0 ? 0 : 1 - Math.exp(-w0 * t) * (1 + w0 * t));
  }
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const k = (zeta * w0) / wd;
  return (t: number) =>
    t <= 0
      ? 0
      : 1 -
        Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + k * Math.sin(wd * t));
}

/** Each notch is a flick: crisp, no overshoot, so a fast run reads smooth. */
const NOTCH = stepResponse(springs.flick);
/** The lock is a snap: one clean overshoot onto the reading line. */
const LOCK = stepResponse(springs.snap);
/** After these many seconds a notch, or the lock, has settled to within a hair. */
const NOTCH_SETTLED = 0.3;
const LOCK_SETTLED = 0.9;

const RINGS: Record<CipherWheelCharset, string> = {
  alpha: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  hex: "0123456789ABCDEF",
  symbols: "#$%&*+-/<=>?@^~",
};

/** Notches a dial turns per second of spin, at speed 1. */
const RATE = 20;
/** How hard a dial brakes into its lock: the run eases out with this power. */
const BRAKE = 1.7;
/** The longest the lock cascade may take, s at speed 1. */
const CASCADE = 1.2;
/** The lock hairline's decay, s. */
const FLASH = 0.16;
/** A housing holds this long after its lock, then fades over FADE, s. */
const HOLD = 0.12;
const FADE = 0.32;
/** The drum's angle per notch, rad: three glyphs show in the window. */
const ARC = 0.62;
/** The narrowest a passing glyph is squeezed to fit its window. */
const SQUEEZE = 0.45;
/** How much smaller a glyph is set inside its housing. */
const INSET = 0.16;
/** The housing's opening; passing glyphs are clipped to it, a resting one is not. */
const WINDOW = "inset(0.06em 0.03em 0.06em 0.03em round 0.14em)";

const DRUM =
  "linear-gradient(to bottom, color-mix(in oklab, currentColor 16%, transparent), color-mix(in oklab, currentColor 4%, transparent) 30%, color-mix(in oklab, currentColor 4%, transparent) 70%, color-mix(in oklab, currentColor 16%, transparent))";

type Dial = {
  ring: string[];
  /** Ring index on the reading line at position 0. */
  start: number;
  /** When each notch lands, s; the last is the lock. */
  steps: number[];
  lock: number;
  /** Place in the lock order. */
  rank: number;
  target: string;
};

type Plan = {
  chars: string[];
  /** The dial for each character; null for spaces. */
  dials: (Dial | null)[];
  /** Lock times in order, for the ticks and the count. */
  locks: number[];
  count: number;
  /** Everything settled, s. */
  end: number;
};

function ringFor(
  charset: CipherWheelCharset,
  characters: string | undefined,
  target: string,
): string[] {
  let ring = graphemes(
    characters && characters.length > 0
      ? characters
      : (RINGS[charset] ?? RINGS.alpha),
  );
  // A lowercase letter turns on a lowercase ring, so the dial reads in case.
  if (
    !characters &&
    target.toLowerCase() === target &&
    target.toUpperCase() !== target
  ) {
    ring = ring.map((c) => c.toLowerCase());
  }
  return ring.includes(target) ? ring : [...ring, target];
}

type PlanInput = {
  chars: string[];
  charset: CipherWheelCharset;
  characters: string | undefined;
  order: CipherWheelOrder;
  speed: number;
  duration: number;
  stagger: number;
  delay: number;
  seed: number;
  /** Start every dial on its true letter and turn whole laps back to it. */
  fromTrue: boolean;
};

function planOf(input: PlanInput): Plan {
  const { chars } = input;
  const rand = lcg(
    hash(chars.join("")) ^ Math.imul(input.seed + 1, 0x9e3779b1),
  );
  const at: number[] = [];
  chars.forEach((c, i) => {
    if (c.trim() !== "") at.push(i);
  });
  const n = at.length;
  const keys = at.map((_, k) => k);
  if (input.order === "random") {
    const shuffle = keys.map(() => rand());
    keys.sort((a, b) => (shuffle[a] ?? 0) - (shuffle[b] ?? 0));
  } else if (input.order === "center") {
    const mid = (n - 1) / 2;
    keys.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
  }
  const rank: number[] = new Array<number>(n).fill(0);
  keys.forEach((k, r) => {
    rank[k] = r;
  });

  const scale = 1 / clamp(input.speed, 0.25, 3);
  const gap = n > 1 ? Math.min(input.stagger / 1000, CASCADE / (n - 1)) : 0;
  const first = Math.max(0.2, input.duration / 1000);
  const delay = Math.max(0, input.delay / 1000);

  const dials: (Dial | null)[] = chars.map(() => null);
  const locks: number[] = [];
  at.forEach((i, k) => {
    const target = chars[i] ?? "";
    const ring = ringFor(input.charset, input.characters, target);
    const size = ring.length;
    const home = ring.indexOf(target);
    const spin = first + (rank[k] ?? 0) * gap;
    const want = Math.max(6, Math.round(spin * RATE + (rand() - 0.5) * 4));
    const notches = input.fromTrue
      ? size * Math.max(1, Math.round(want / size))
      : want;
    // Notches arrive fast and thin out as the dial brakes into its lock.
    const steps: number[] = [];
    for (let s = 1; s <= notches; s += 1) {
      const u = 1 - Math.pow(1 - s / notches, 1 / BRAKE);
      steps.push(delay + spin * u * scale);
    }
    const lock = delay + spin * scale;
    locks.push(lock);
    dials[i] = {
      ring,
      start: mod(home - notches, size),
      steps,
      lock,
      rank: rank[k] ?? 0,
      target,
    };
  });
  locks.sort((a, b) => a - b);
  const last = locks.length ? (locks[locks.length - 1] ?? delay) : delay;
  return { chars, dials, locks, count: n, end: r3(last + HOLD + FADE + 0.05) };
}

/** A dial's position in notches at time t: settled notches plus the live ones. */
function positionOf(dial: Dial, t: number): number {
  const steps = dial.steps;
  let lo = 0;
  let hi = steps.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((steps[mid] ?? 0) <= t) lo = mid + 1;
    else hi = mid;
  }
  let i = lo - 1;
  let live = 0;
  for (; i >= 0; i -= 1) {
    const age = t - (steps[i] ?? 0);
    const lock = i === steps.length - 1;
    if (age > (lock ? LOCK_SETTLED : NOTCH_SETTLED)) break;
    live += lock ? LOCK(age) : NOTCH(age);
  }
  const p = i + 1 + live;
  // Within a hair of a detent is on it: the reading line holds one glyph.
  const held = Math.round(p);
  return Math.abs(p - held) < 1e-3 ? held : p;
}

type Look = {
  /** Position in notches. */
  p: number;
  housing: number;
  flash: number;
  flashScale: number;
  /** Glyph ink: passing glyphs are dimmer than a locked one. */
  ink: number;
  /** The neighbours' share: they show while the drum is in view. */
  side: number;
  /** Reduced motion's cross-fade at the lock. */
  swap: number;
  /** The window's clip: the housing's shape while the drum shows, none at rest. */
  clip: string;
};

function lookOf(
  dial: Dial,
  t: number,
  nudge: number,
  motionSafe: boolean,
): Look {
  const since = t - dial.lock;
  const fade = since < HOLD ? 1 : 1 - clamp01((since - HOLD) / FADE);
  const notches = dial.steps.length;
  const p = motionSafe ? positionOf(dial, t) + nudge : since >= 0 ? notches : 0;
  const away = Math.min(1, Math.abs(p - notches) * 3);
  const side = Math.max(fade, away);
  return {
    p,
    housing: Math.min(1, fade + Math.abs(nudge) * 1.6),
    // The hairline decays and is gone by the time its housing is, so a
    // resting headline carries no trace of it.
    flash:
      since < 0
        ? 0
        : Math.exp(-since / FLASH) * clamp01(1 - since / (HOLD + FADE)),
    flashScale: since < 0 ? 0.25 : 0.25 + 0.75 * (1 - Math.exp(-since / 0.05)),
    ink: 0.7 + 0.3 * clamp01(since / 0.08),
    side,
    swap: motionSafe ? 1 : 0.2 + 0.8 * clamp01(Math.abs(since) / 0.09),
    clip: side > 0.001 ? WINDOW : "none",
  };
}

type Metrics = {
  /** Each cell's width, px, by character index. */
  cells: Map<number, number>;
  /** Each glyph's advance in the headline's font, px. */
  glyphs: Map<string, number>;
};

function Slot({
  k,
  look,
  dial,
  at,
  metrics,
}: {
  k: -1 | 0 | 1;
  look: MotionValue<Look>;
  dial: Dial;
  at: number;
  metrics: React.RefObject<Metrics>;
}) {
  const size = dial.ring.length;
  const glyphOf = (p: number) =>
    dial.ring[mod(dial.start + Math.floor(p) + k, size)] ?? "";
  const glyph = useTransform(look, ({ p }) => glyphOf(p));
  // The drum seen face-on: a glyph's offset from the reading line is an angle
  // on the drum, so it rises along a sine and foreshortens with its cosine.
  const angle = (p: number) => (k - (p - Math.floor(p))) * ARC;
  const y = useTransform(
    look,
    ({ p }) => `${r3((Math.sin(angle(p)) / ARC) * 100)}%`,
  );
  // In the housing a glyph is set a size smaller so its ascenders and
  // descenders clear the window; it grows to full size as the housing goes.
  const inset = (side: number) => 1 - INSET * side;
  const scaleY = useTransform(look, ({ p, side }) =>
    r3(Math.cos(angle(p)) * inset(side)),
  );
  const scaleX = useTransform(look, ({ p, side }) => {
    const g = glyphOf(p);
    const cell = metrics.current.cells.get(at);
    const width = metrics.current.glyphs.get(g);
    const squeeze =
      g === dial.target || !cell || !width
        ? 1
        : clamp(cell / width, SQUEEZE, 1);
    return r3(squeeze * inset(side));
  });
  // The glyph nearest the reading line is the dial's reading; the rest are
  // the drum's shoulders and show only while the drum does.
  const opacity = useTransform(look, ({ p, ink, side, swap }) => {
    const a = angle(p);
    const c = Math.cos(a);
    return r3(c * c * ink * (Math.abs(a) < ARC / 2 ? swap : side));
  });
  return (
    <motion.span
      className="absolute inset-0 flex justify-center whitespace-pre"
      style={{ y, scaleY, scaleX, opacity }}
    >
      {glyph}
    </motion.span>
  );
}

type DialCellProps = {
  char: string;
  at: number;
  dial: Dial;
  clock: MotionValue<number>;
  motionSafe: boolean;
  housing: boolean;
  flashColor: string;
  metrics: React.RefObject<Metrics>;
  bind: (node: HTMLSpanElement | null) => void;
  /** The pointer crossed this dial: how far to thumb it, or 0 to leave it. */
  thumbOf: (dial: Dial, event: React.PointerEvent) => number;
};

function DialCell({
  char,
  at,
  dial,
  clock,
  motionSafe,
  housing,
  flashColor,
  metrics,
  bind,
  thumbOf,
}: DialCellProps) {
  const nudge = useMotionValue(0);
  const thumbing = React.useRef<AnimationPlaybackControls | null>(null);
  const look = useTransform(
    [clock, nudge] as MotionValue<number>[],
    ([t = 0, n = 0]: number[]) => lookOf(dial, t, n, motionSafe),
  );
  const housingOpacity = useTransform(look, ({ housing: h }) => r3(h));
  const flash = useTransform(look, ({ flash: f }) => r3(f));
  const flashScale = useTransform(look, ({ flashScale: s }) => r3(s));
  const clipPath = useTransform(look, ({ clip }) => clip);

  React.useEffect(() => () => thumbing.current?.stop(), []);

  return (
    <span
      ref={bind}
      className="relative inline-block"
      onPointerEnter={(event) => {
        const by = thumbOf(dial, event);
        if (by === 0) return;
        thumbing.current?.stop();
        // Thumbed a fraction of a notch on a flick, then the detent pulls it
        // back onto its letter on a snap.
        thumbing.current = animate(nudge, by, {
          ...springs.flick,
          onComplete: () => {
            thumbing.current = animate(nudge, 0, springs.snap);
          },
        });
      }}
    >
      <span className="text-transparent">{char}</span>
      <span className="pointer-events-none absolute inset-0 select-none">
        {housing ? (
          <motion.span
            className="absolute inset-x-[0.03em] inset-y-[0.06em] rounded-[0.14em] border border-current/20"
            style={{ opacity: housingOpacity, backgroundImage: DRUM }}
          />
        ) : null}
        <motion.span className="absolute inset-0" style={{ clipPath }}>
          {([-1, 0, 1] as const).map((k) => (
            <Slot
              key={k}
              k={k}
              look={look}
              dial={dial}
              at={at}
              metrics={metrics}
            />
          ))}
        </motion.span>
        <motion.span
          className="absolute inset-x-[0.08em] bottom-[0.08em] h-[max(1px,0.05em)] rounded-full"
          style={{
            backgroundColor: flashColor,
            opacity: flash,
            scaleX: flashScale,
          }}
        />
      </span>
    </span>
  );
}

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

type Phase = "idle" | "run" | "rest";
type Run = { n: number; phase: Phase; fromTrue: boolean; visitor: boolean };

type Api = {
  start: () => void;
  tickTo: (t: number) => void;
  finish: () => void;
  replay: (visitor: boolean) => void;
  reset: () => void;
  measure: () => void;
};

/**
 * A headline that decrypts on a row of rotary dials. Every letter sits in a
 * small housing — a drum seen face-on, its neighbours foreshortened as they
 * roll over — whose ring is the character set in order, so the reader sees a
 * dial travel, not noise. On its trigger every dial turns at once with a
 * ratchet feel: each notch is the house flick spring, which reads as a smooth
 * run while notches come fast and as separate clicks as the dial brakes, and
 * the last notch is a snap — one clean overshoot onto the reading line. The
 * locks cascade in the chosen order, each flashing a hairline under its
 * window before its housing dissolves, and the headline rests as plain type.
 *
 * Every dial is a closed-form sum of spring step responses read from one clock
 * motion value: nothing re-renders per frame and nothing runs once settled,
 * off screen or in a hidden page. Pressing the headline (or Enter or Space
 * on it) turns the dials again, starting each on its own letter so nothing
 * jumps; the pointer crossing a resting letter thumbs its dial and the detent
 * pulls it back. The text is read once from an sr-only copy and selects and
 * copies as written. Under reduced motion nothing travels: each scrambled
 * glyph cross-fades to its letter at its lock, in the same order.
 */
export function CipherWheel({
  text,
  as = "span",
  order = "ltr",
  speed = 1,
  charset = "alpha",
  characters,
  duration = 900,
  stagger = 70,
  delay = 0,
  trigger = "inView",
  once = true,
  active,
  interactive = true,
  housing = true,
  flashColor = "var(--accent-bright)",
  seed = 0,
  sound = false,
  onLock,
  onComplete,
  className,
}: CipherWheelProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = `${React.useId()}-hint`;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(false);
  const running = onScreen && !hidden;

  const [run, setRun] = React.useState<Run>(() => ({
    n: 0,
    phase: trigger === "hover" ? "rest" : "idle",
    fromTrue: false,
    visitor: false,
  }));

  const chars = React.useMemo(() => graphemes(text), [text]);
  const plan = React.useMemo(
    () =>
      planOf({
        chars,
        charset,
        characters,
        order,
        speed,
        duration,
        stagger,
        delay,
        seed: seed + run.n,
        fromTrue: run.fromTrue,
      }),
    [
      chars,
      charset,
      characters,
      order,
      speed,
      duration,
      stagger,
      delay,
      seed,
      run.n,
      run.fromTrue,
    ],
  );

  const [firstT] = React.useState(() => (run.phase === "rest" ? plan.end : 0));
  const clock = useMotionValue(firstT);

  const rootRef = React.useRef<HTMLElement | null>(null);
  const cellNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const metrics = React.useRef<Metrics>({
    cells: new Map(),
    glyphs: new Map(),
  });
  const fontKey = React.useRef("");
  const controls = React.useRef<AnimationPlaybackControls | null>(null);
  const lastT = React.useRef(0);
  const locked = React.useRef(-1);
  const pointerY = React.useRef(0);
  const live = React.useRef({ running, sound });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onLock, onComplete });

  const stop = () => {
    controls.current?.stop();
    controls.current = null;
  };

  const tell = (count: number) => {
    if (locked.current === count) return;
    locked.current = count;
    report.current.onLock?.(count, plan.count);
  };

  const start = () => {
    stop();
    clock.jump(0);
    lastT.current = 0;
    tell(0);
    controls.current = animate(clock, plan.end, {
      duration: plan.end,
      ease: "linear",
      onUpdate: (t) => api.current?.tickTo(t),
      onComplete: () => api.current?.finish(),
    });
    if (!live.current.running) controls.current.pause();
  };

  const tickTo = (t: number) => {
    const from = lastT.current;
    lastT.current = t;
    let count = 0;
    for (const lock of plan.locks) if (lock <= t) count += 1;
    if (count === locked.current) return;
    // Sound is not motion: the cascade's ticks play under reduced motion too.
    const audible = run.visitor && live.current.sound;
    if (audible) {
      const root = rootRef.current;
      plan.dials.forEach((dial, i) => {
        if (!dial || dial.lock <= from || dial.lock > t) return;
        const node = cellNodes.current.get(i);
        const rect = node?.getBoundingClientRect();
        const share = plan.count > 1 ? dial.rank / (plan.count - 1) : 0;
        audio.play("tick", {
          pitch: r3(0.92 * semitones(Math.round(share * 9))),
          gain: 0.42,
          pan: rect ? panFrom(rect.left + rect.width / 2, root) : 0,
        });
      });
    }
    tell(count);
  };

  const finish = () => {
    controls.current = null;
    tell(plan.count);
    setRun((r) => (r.phase === "run" ? { ...r, phase: "rest" } : r));
    report.current.onComplete?.();
  };

  /** Turn the dials: from the scrambled rest, or again from the letters. */
  const replay = (visitor: boolean) => {
    if (run.phase === "run") return;
    setRun((r) =>
      r.phase === "run"
        ? r
        : {
            n: r.phase === "rest" ? r.n + 1 : r.n,
            phase: "run",
            fromTrue: r.phase === "rest",
            visitor,
          },
    );
  };

  const reset = () => {
    setRun((r) => (r.phase === "idle" ? r : { ...r, phase: "idle" }));
  };

  /** Cell widths and glyph advances, so a wide glyph squeezes into a narrow window. */
  const measure = () => {
    const root = rootRef.current;
    if (!root) return;
    const m = metrics.current;
    for (const [i, node] of cellNodes.current) {
      m.cells.set(i, node.getBoundingClientRect().width);
    }
    const style = getComputedStyle(root);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    if (font !== fontKey.current) {
      fontKey.current = font;
      m.glyphs.clear();
    }
    const missing = new Set<string>();
    for (const dial of plan.dials) {
      if (!dial) continue;
      for (const g of dial.ring) if (!m.glyphs.has(g)) missing.add(g);
    }
    if (!missing.size) return;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return;
    ctx.font = font;
    for (const g of missing) m.glyphs.set(g, ctx.measureText(g).width);
  };

  React.useLayoutEffect(() => {
    api.current = { start, tickTo, finish, replay, reset, measure };
    report.current = { onLock, onComplete };
    live.current = { running, sound };
  });

  // The clock follows the phase: scrambled at 0, turning, or settled at the end.
  React.useEffect(() => {
    if (run.phase === "run") {
      api.current?.start();
    } else {
      stop();
      clock.jump(run.phase === "rest" ? plan.end : 0);
      api.current?.tickTo(run.phase === "rest" ? plan.end : 0);
    }
    return stop;
  }, [run, plan, clock]);

  // Off screen or in a hidden tab the clock holds where it is.
  React.useEffect(() => {
    const c = controls.current;
    if (!c) return;
    if (running) c.play();
    else c.pause();
  }, [running]);

  // Triggers that are not gestures.
  React.useEffect(() => {
    if (trigger === "mount" && run.phase === "idle") api.current?.replay(false);
    if (trigger === "inView") {
      if (onScreen && run.phase === "idle") api.current?.replay(false);
      if (!onScreen && !once && run.phase === "rest") api.current?.reset();
    }
    if (trigger === "manual" && active !== undefined) {
      if (active && run.phase === "idle") api.current?.replay(false);
      if (!active && run.phase !== "idle") api.current?.reset();
    }
  }, [trigger, onScreen, once, active, run.phase]);

  // A new headline, ring or rhythm while resting turns the dials to show it.
  const shape = `${text}|${charset}|${characters ?? ""}|${order}|${speed}|${duration}|${stagger}|${seed}`;
  const shown = React.useRef(shape);
  React.useEffect(() => {
    if (shown.current === shape) return;
    shown.current = shape;
    if (run.phase === "rest") api.current?.replay(false);
  }, [shape, run.phase]);

  React.useLayoutEffect(() => {
    api.current?.measure();
  }, [plan]);

  const bindRoot = React.useCallback((node: HTMLElement | null) => {
    rootRef.current = node;
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

  const bindCell = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) cellNodes.current.set(i, node);
    else cellNodes.current.delete(i);
  };

  // A thumbed dial is felt, not heard: a hover is not a press, so it stays
  // silent whatever the sound setting.
  const thumbOf = (_dial: Dial, event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return 0;
    if (!interactive || !motionSafe || run.phase === "run") return 0;
    // The dial rolls the way the hand was moving; a level pass rolls it up.
    return pointerY.current > 0.5 ? -0.36 : 0.36;
  };

  // Words stay whole: the headline wraps between them, never inside one.
  const words: { at: number[]; key: number }[] = [];
  let current: number[] = [];
  chars.forEach((char, at) => {
    if (char.trim() === "") {
      if (current.length) words.push({ at: current, key: at });
      current = [];
      return;
    }
    current.push(at);
  });
  if (current.length) words.push({ at: current, key: chars.length });

  const Tag = as;

  return (
    <>
      <Tag
        ref={bindRoot}
        tabIndex={interactive ? 0 : undefined}
        aria-describedby={interactive ? hintId : undefined}
        onClick={() => {
          if (!interactive) return;
          // A drag that selected some of the words is reading, not a press.
          const selection = window.getSelection();
          if (
            selection &&
            !selection.isCollapsed &&
            rootRef.current?.contains(selection.anchorNode)
          ) {
            return;
          }
          replay(true);
        }}
        onKeyDown={(event: React.KeyboardEvent) => {
          if (!interactive) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          replay(true);
        }}
        onPointerMove={(event: React.PointerEvent) => {
          pointerY.current = event.movementY;
        }}
        onPointerEnter={(event: React.PointerEvent) => {
          if (trigger !== "hover" || event.pointerType !== "mouse") return;
          if (run.phase === "rest") replay(false);
        }}
        onFocus={(event: React.FocusEvent) => {
          if (trigger !== "hover" || event.target !== event.currentTarget) {
            return;
          }
          if (run.phase === "rest") replay(false);
        }}
        className={cn(
          interactive &&
            "cursor-pointer rounded-1 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          className,
        )}
      >
        <span className="sr-only select-none">{text}</span>
        <span aria-hidden>
          {words.map((word, w) => (
            <React.Fragment key={word.key}>
              {w > 0 ? " " : null}
              <span className="inline-block whitespace-nowrap">
                {word.at.map((at) => {
                  const dial = plan.dials[at];
                  const char = chars[at] ?? "";
                  if (!dial) return <span key={at}>{char}</span>;
                  return (
                    <DialCell
                      key={at}
                      char={char}
                      at={at}
                      dial={dial}
                      clock={clock}
                      motionSafe={motionSafe}
                      housing={housing}
                      flashColor={flashColor}
                      metrics={metrics}
                      bind={bindCell(at)}
                      thumbOf={thumbOf}
                    />
                  );
                })}
              </span>
            </React.Fragment>
          ))}
        </span>
      </Tag>
      {interactive ? (
        <span id={hintId} className="sr-only select-none">
          Press Enter to turn the dials again.
        </span>
      ) : null}
    </>
  );
}
