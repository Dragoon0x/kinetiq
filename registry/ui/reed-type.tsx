"use client";

import * as React from "react";

import {
  motion,
  motionValue,
  useTransform,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type ReedTypeElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type ReedTypeTrigger = "mount" | "inView" | "hover" | "manual";

export type ReedTypeProps = {
  /** The line, as a string. Wins over `text`. */
  children?: string;
  /** The line, when it is not given as children. */
  text?: string;
  /** The element that carries the line. @default "p" */
  as?: ReedTypeElement;
  /** Stalk length, em: tall reeds sway wider and slower. @default 0.9 */
  stalk?: number;
  /** Spring rate of the stalks, 0 (limp, the drift calibration) to 1 (springy, the snap calibration). @default 0.5 */
  stiffness?: number;
  /** How quickly a sway dies, 0 (whippy, many swings) to 1 (composed, one). @default 0.3 */
  damping?: number;
  /** How strongly a bent reed pulls its neighbours, 0 (alone) to 1 (a single mat). @default 0.5 */
  coupling?: number;
  /** How far the pointer's reach extends, em. @default 1.4 */
  radius?: number;
  /** How hard a passing pointer pushes, 0 to 1. @default 0.6 */
  strength?: number;
  /** The largest bend a stalk takes, degrees; bends ease into it. @default 38 */
  maxBend?: number;
  /** The stalks' colour, any CSS colour. Sage ink by default. */
  stalkColor?: string;
  /** Draw the waterline, the stalks' reflections and the ripples. @default true */
  water?: boolean;
  /** What raises the reeds out of the water. @default "inView" */
  trigger?: ReedTypeTrigger;
  /** Rise once, or sink and rise again each time the line re-enters view or is hovered. @default true */
  once?: boolean;
  /** With trigger "manual": true raises the reeds, false lowers them. @default false */
  play?: boolean;
  /** Wait before the first reed rises, ms. @default 0 */
  delay?: number;
  /** Gap between reeds rising, ms. @default 45 */
  stagger?: number;
  /** Time scale of the rise, ms (the glide spring's ratio is kept). @default 520 */
  duration?: number;
  /** The pointer, touch and the keys sway the reeds. @default true */
  interactive?: boolean;
  /** The reeds started swaying (true), or every reed has come to rest (false). */
  onSwayChange?: (swaying: boolean) => void;
  /** The rise has settled. */
  onComplete?: () => void;
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const STEP = 1 / 240;
const STALK_COLOUR = "color-mix(in oklab, var(--ink-3) 62%, var(--success))";

/** Spring-step responses on the house calibrations, for the rise. */
const GLIDE_W = Math.sqrt(springs.glide.stiffness / springs.glide.mass);
const GLIDE_Z =
  springs.glide.damping /
  (2 * Math.sqrt(springs.glide.stiffness * springs.glide.mass));
const riseAt = (t: number) => {
  if (t <= 0) return 0;
  const wd = GLIDE_W * Math.sqrt(1 - GLIDE_Z * GLIDE_Z);
  const e = Math.exp(-GLIDE_Z * GLIDE_W * t);
  return (
    1 - e * (Math.cos(wd * t) + ((GLIDE_Z * GLIDE_W) / wd) * Math.sin(wd * t))
  );
};

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** A small seeded generator: the same reed bed for the same line. */
function lcg(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Shape = {
  d: string;
  base: string;
  mirror: string;
  tx: number;
  ty: number;
};

/**
 * A stalk of length S·λ (hundredths of an em) bent through θ with uniform
 * curvature: its tip, and the quadratic whose control point is where the
 * vertical base tangent meets the tip's. Also the thicker lower half (a de
 * Casteljau split) and a short mirrored reflection under the water.
 */
function shapeOf(theta: number, S: number, lambda: number): Shape {
  const L = S * lambda;
  const small = Math.abs(theta) < 1e-4;
  const tx = small ? (L * theta) / 2 : (L * (1 - Math.cos(theta))) / theta;
  const ty = small ? L : (L * Math.sin(theta)) / theta;
  const lean = small ? 0 : tx / Math.tan(theta);
  const cy = small || ty - lean <= 0 ? ty / 2 : ty - lean;
  const p = (v: number) => Math.round(v * 100) / 100;
  const s = 0.55;
  const k = 0.26;
  return {
    d: `M0 0 Q0 ${p(-cy)} ${p(tx)} ${p(-ty)}`,
    base: `M0 0 Q0 ${p(-cy * s)} ${p(s * s * tx)} ${p(-(2 * (1 - s) * s * cy + s * s * ty))}`,
    mirror: `M0 1 Q0 ${p(cy * k + 1)} ${p(k * k * tx)} ${p(2 * (1 - k) * k * cy + k * k * ty + 1)}`,
    tx,
    ty,
  };
}

function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    return Array.from(
      new Seg(undefined, { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

type Cell = {
  x: MotionValue<number>;
  y: MotionValue<number>;
  rotate: MotionValue<number>;
  show: MotionValue<number>;
  d: MotionValue<string>;
  base: MotionValue<string>;
  mirror: MotionValue<string>;
  ripple: MotionValue<number>;
  glow: MotionValue<number>;
};

type Model = {
  words: number[][];
  letters: string[];
  cells: Cell[];
  /** Each reed's own resting lean, radians: a reed bed is never ruled. */
  rest: Float64Array;
};

function modelOf(text: string, stalk: number): Model {
  const words: number[][] = [];
  const letters: string[] = [];
  let word: number[] = [];
  for (const ch of graphemes(text.trim())) {
    if (/\s/.test(ch)) {
      if (word.length) words.push(word);
      word = [];
      continue;
    }
    word.push(letters.length);
    letters.push(ch);
  }
  if (word.length) words.push(word);
  const S = Math.round(stalk * 100);
  const rand = lcg(hash(text));
  const rest = new Float64Array(letters.length);
  for (let i = 0; i < rest.length; i += 1) {
    rest[i] = Math.round((rand() - 0.5) * 0.07 * 1000) / 1000;
  }
  return {
    words,
    letters,
    rest,
    cells: letters.map((_, i) => {
      const shape = shapeOf(rest[i] ?? 0, S, 1);
      return {
        x: motionValue(0),
        y: motionValue(0),
        rotate: motionValue(r2(((rest[i] ?? 0) * 180) / Math.PI)),
        show: motionValue(1),
        d: motionValue(shape.d),
        base: motionValue(shape.base),
        mirror: motionValue(shape.mirror),
        ripple: motionValue(0),
        glow: motionValue(0),
      };
    }),
  };
}

type Body = {
  theta: Float64Array;
  omega: Float64Array;
  /** Rest centres of the letters, px from the root. */
  cx: Float64Array;
  cy: Float64Array;
  /** When each reed starts rising, ms: NaN = standing, +Infinity = under water. */
  riseAt: Float64Array;
  riseOn: boolean;
  /** When the reeds began sinking, ms; NaN when they are not. */
  sinkAt: number;
  force: Float64Array;
  /** Colour-wave strength per reed (reduced motion). */
  glow: Float64Array;
  rippleAt: Float64Array;
  em: number;
  pitch: number;
  measured: boolean;
  pointer: { x: number; y: number; vx: number; t: number } | null;
  gust: { at: number; dir: number; speed: number; amp: number } | null;
  swaying: boolean;
  completeAt: number;
};

const bodyOf = (n: number): Body => ({
  theta: new Float64Array(n),
  omega: new Float64Array(n),
  cx: new Float64Array(n),
  cy: new Float64Array(n),
  riseAt: new Float64Array(n).fill(Number.NaN),
  riseOn: false,
  sinkAt: Number.NaN,
  force: new Float64Array(n),
  glow: new Float64Array(n),
  rippleAt: new Float64Array(n).fill(-Infinity),
  em: 16,
  pitch: 10,
  measured: false,
  pointer: null,
  gust: null,
  swaying: false,
  completeAt: Number.NaN,
});

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

function Reed({
  char,
  cell,
  stalk,
  color,
  water,
  bind,
}: {
  char: string;
  cell: Cell;
  stalk: number;
  color: string;
  water: boolean;
  bind: (node: HTMLSpanElement | null) => void;
}) {
  const S = Math.round(stalk * 100);
  const rippleRx = useTransform(cell.ripple, (p) => r2(5 + 30 * p));
  const rippleRy = useTransform(cell.ripple, (p) => r2(1.4 + 5 * p));
  const rippleOpacity = useTransform(cell.ripple, (p) =>
    p <= 0 || p >= 1 ? 0 : r3((1 - p) * 0.5),
  );
  return (
    <span
      ref={bind}
      className="relative inline-flex flex-col items-center align-bottom"
      style={{ paddingBottom: `${r3(stalk)}em` }}
    >
      <motion.span
        className="relative block leading-[0.8]"
        style={{
          x: cell.x,
          y: cell.y,
          rotate: cell.rotate,
          opacity: cell.show,
          originX: 0.5,
          originY: 1,
        }}
      >
        {char}
      </motion.span>
      <svg
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-1/2 -ml-[0.5em] overflow-visible"
        style={{ width: "1em", height: `${r3(stalk)}em` }}
        viewBox={`-50 ${-S} 100 ${S}`}
      >
        {water ? (
          <>
            <motion.path
              d={cell.mirror}
              fill="none"
              stroke={color}
              strokeWidth={3.4}
              strokeLinecap="round"
              style={{ opacity: 0.12 }}
            />
            <motion.ellipse
              cx={0}
              cy={1.5}
              rx={rippleRx}
              ry={rippleRy}
              fill="none"
              stroke={color}
              strokeWidth={1.4}
              style={{ opacity: rippleOpacity }}
            />
          </>
        ) : null}
        <motion.g style={{ opacity: cell.show }}>
          <motion.path
            d={cell.d}
            fill="none"
            stroke={color}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          <motion.path
            d={cell.base}
            fill="none"
            stroke={color}
            strokeWidth={5.6}
            strokeLinecap="round"
          />
        </motion.g>
        <motion.path
          d={cell.d}
          fill="none"
          stroke="var(--accent-bright)"
          strokeWidth={4.2}
          strokeLinecap="round"
          style={{ opacity: cell.glow }}
        />
      </svg>
    </span>
  );
}

type Api = {
  wake: () => void;
  halt: () => void;
  rise: (on: boolean) => void;
  gust: (dir: number, amp: number, speed?: number) => void;
  measure: () => void;
  pose: () => void;
};

/**
 * A line of letters on reeds. Each letter stands on a slim stalk rising out of
 * a waterline, the stalk drawn as one smooth arc (a quadratic whose control
 * point is where its base and tip tangents meet) and the letter riding the tip,
 * turned with it about its own foot.
 *
 * Every reed is a damped angular oscillator, and each is joined to its
 * neighbours by a coupling spring, so a bent reed pulls the next a beat later
 * and motion travels down the line. The pointer is a soft obstacle: reeds
 * within `radius` bend away from it and are kicked along its velocity, so a
 * slow pass parts them and a quick one makes them whip; let go of a fast drag
 * and a gust runs the whole line. On arrival the reeds grow up out of the water
 * one after another on the glide spring, and a gentle gust settles them.
 *
 * A transparent button over the line takes focus: focusing it by keyboard
 * sends a gentle ripple across, Enter or Space a strong one, Left and Right a
 * gust from either end. One loop integrates every reed and stops when they
 * are all still. The words are read once from an sr-only copy. Under reduced
 * motion nothing sways: the reeds stand straight and a colour wave answers the
 * pointer and the keys.
 */
export function ReedType({
  children,
  text,
  as = "p",
  stalk = 0.9,
  stiffness = 0.5,
  damping = 0.3,
  coupling = 0.5,
  radius = 1.4,
  strength = 0.6,
  maxBend = 38,
  stalkColor = STALK_COLOUR,
  water = true,
  trigger = "inView",
  once = true,
  play = false,
  delay = 0,
  stagger = 45,
  duration = 520,
  interactive = true,
  onSwayChange,
  onComplete,
  className,
}: ReedTypeProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const line = (typeof children === "string" ? children : text) ?? "";
  const length = clamp(stalk, 0.2, 2.4);
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const [entrance, setEntrance] = React.useState({ n: 0, on: false });
  const started = entrance.on && (trigger !== "manual" || play);

  const model = React.useMemo(() => modelOf(line, length), [line, length]);
  const n = model.letters.length;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const columns = React.useRef(new Map<number, HTMLSpanElement>());
  const body = React.useRef<Body>(bodyOf(0));
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    length,
    stiffness,
    damping,
    coupling,
    radius,
    strength,
    maxBend,
    stagger,
    duration,
    delay,
    motionSafe,
    onSwayChange,
    onComplete,
  });
  const breezeTimer = React.useRef<number | null>(null);
  const played = React.useRef(false);
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  /** Rest centres of the letters, from their columns (which never move). */
  const measure = () => {
    const root = rootRef.current;
    const b = body.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    b.em = parseFloat(getComputedStyle(root).fontSize) || 16;
    let span = 0;
    let first = Number.NaN;
    let lastX = Number.NaN;
    for (let i = 0; i < b.theta.length; i += 1) {
      const node = columns.current.get(i);
      if (!node) continue;
      const r = node.getBoundingClientRect();
      b.cx[i] = r.left - rect.left + r.width / 2;
      b.cy[i] = r.top - rect.top + (r.height - cfg.current.length * b.em) / 2;
      if (Number.isNaN(first)) first = b.cx[i] ?? 0;
      lastX = b.cx[i] ?? 0;
      span += 1;
    }
    b.pitch = span > 1 ? Math.max(6, (lastX - first) / (span - 1)) : b.em;
    b.measured = true;
  };

  /** Writes every reed's drawing from its angle and rise. */
  const pose = () => {
    const b = body.current;
    const c = cfg.current;
    const S = Math.round(c.length * 100);
    const limit = (clamp(c.maxBend, 5, 80) * Math.PI) / 180;
    const now = performance.now();
    for (let i = 0; i < model.cells.length; i += 1) {
      const cell = model.cells[i];
      if (!cell) continue;
      const start = b.riseAt[i] ?? Number.NaN;
      let lambda = 1;
      if (start === Number.POSITIVE_INFINITY) lambda = 0;
      else if (!Number.isNaN(start)) {
        lambda = c.motionSafe
          ? clamp01(riseAt(((now - start) / 1000) * (450 / c.duration)))
          : clamp01((now - start) / 240);
      }
      if (!Number.isNaN(b.sinkAt)) {
        // Sinking is an exit: it eases away, it never springs.
        const u = clamp01((now - b.sinkAt) / 260);
        lambda = Math.min(lambda, 1 - u * u);
      }
      const raw = b.theta[i] ?? 0;
      const theta = limit * Math.tanh(raw / limit);
      const shape = shapeOf(theta, S, lambda);
      const { tx, ty } = shape;
      cell.d.set(shape.d);
      cell.base.set(shape.base);
      cell.mirror.set(shape.mirror);
      const em100 = b.em / 100;
      cell.x.set(r2(tx * em100));
      cell.y.set(r2((S - ty) * em100));
      cell.rotate.set(r2((theta * 180) / Math.PI));
      cell.show.set(r3(clamp01(lambda * 2.2)));
      const age = now - (b.rippleAt[i] ?? -Infinity);
      cell.ripple.set(age < 700 ? r3(age / 700) : 0);
      cell.glow.set(r3(b.glow[i] ?? 0));
    }
  };

  /** Advances every reed by dt seconds; returns whether anything moves. */
  const step = (dt: number, now: number): boolean => {
    const b = body.current;
    const c = cfg.current;
    const count = b.theta.length;
    if (!b.measured) measure();
    let busy = false;
    // Rising reeds.
    if (b.riseOn) {
      let rising = false;
      for (let i = 0; i < count; i += 1) {
        const start = b.riseAt[i] ?? Number.NaN;
        if (Number.isNaN(start) || start === Number.POSITIVE_INFINITY) continue;
        const t = ((now - start) / 1000) * (450 / c.duration);
        const done = c.motionSafe ? t > 0.9 : now - start > 240;
        if (done) b.riseAt[i] = Number.NaN;
        else rising = true;
      }
      if (!rising) b.riseOn = false;
      busy = busy || rising;
    }
    if (!Number.isNaN(b.sinkAt)) {
      if (now - b.sinkAt > 260) {
        b.sinkAt = Number.NaN;
        b.riseAt.fill(Number.POSITIVE_INFINITY);
      } else busy = true;
    }
    if (!Number.isNaN(b.completeAt) && now >= b.completeAt) {
      b.completeAt = Number.NaN;
      c.onComplete?.();
    }
    if (!Number.isNaN(b.completeAt)) busy = true;

    if (!c.motionSafe) {
      // The designed still state: a colour wave instead of motion.
      for (let i = 0; i < count; i += 1) {
        let g = (b.glow[i] ?? 0) * Math.exp(-dt / 0.35);
        if (g < 0.01) g = 0;
        else busy = true;
        b.glow[i] = g;
        b.theta[i] = model.rest[i] ?? 0;
        b.omega[i] = 0;
      }
      if (b.gust) {
        const gust = b.gust;
        gust.at += gust.dir * gust.speed * dt;
        for (let i = 0; i < count; i += 1) {
          const w = Math.exp(-(((i - gust.at) / 1.4) ** 2));
          b.glow[i] = Math.max(b.glow[i] ?? 0, gust.amp * w);
        }
        if (gust.dir > 0 ? gust.at > count + 3 : gust.at < -4) b.gust = null;
        busy = true;
      }
      return busy;
    }

    const s = clamp01(c.stiffness);
    const k = lerp(
      springs.drift.stiffness / springs.drift.mass,
      springs.snap.stiffness / springs.snap.mass,
      s,
    );
    const zeta = lerp(0.06, 0.9, clamp01(c.damping));
    const damp = 2 * zeta * Math.sqrt(k);
    const kappa = clamp01(c.coupling) * k * 0.9;
    const limit = (clamp(c.maxBend, 5, 80) * Math.PI) / 180;
    const reach = Math.max(0.3, c.radius) * b.em;
    const push = clamp01(c.strength);
    const p = b.pointer;
    let gustAt = Number.NaN;
    if (b.gust) {
      const gust = b.gust;
      gust.at += gust.dir * gust.speed * dt;
      gustAt = gust.at;
      if (gust.dir > 0 ? gust.at > count + 4 : gust.at < -5) b.gust = null;
      busy = true;
    }
    // Forces this frame, held across the substeps.
    const force = b.force;
    for (let i = 0; i < count; i += 1) {
      let f = 0;
      if (p) {
        // The pointer is an obstacle the whole reed can meet, from its
        // letter down to the water, not only at the letter's centre.
        const dx = (b.cx[i] ?? 0) - p.x;
        const top = (b.cy[i] ?? 0) - 0.5 * b.em;
        const foot = (b.cy[i] ?? 0) + (0.4 + c.length) * b.em;
        const dy = Math.max(0, top - p.y, p.y - foot) * 1.2;
        const d = Math.hypot(dx, dy);
        if (d < reach) {
          const w = (1 - d / reach) ** 2;
          const side = Math.sign(dx || p.vx || 1);
          // Pushed aside toward a lean that grows the nearer it is: a stiff
          // contact spring that only ever pushes, never pulls back.
          const want = side * limit * push * Math.sqrt(w);
          const off = (b.theta[i] ?? 0) - (model.rest[i] ?? 0);
          if (side * off < side * want) f += 3 * k * w * (want - off);
          // …and kicked along the pointer's motion as it brushes past.
          f += push * w * (p.vx / b.em) * 22;
        }
      }
      if (!Number.isNaN(gustAt) && b.gust) {
        const w = Math.exp(-(((i - gustAt) / 1.5) ** 2));
        f += b.gust.amp * b.gust.dir * w * k * limit;
      }
      force[i] = f;
    }
    let left = dt;
    while (left > 1e-7) {
      const h = Math.min(STEP, left);
      left -= h;
      for (let i = 0; i < count; i += 1) {
        // Springs act on each reed's bend away from its own resting lean,
        // so a still reed bed is an equilibrium and the loop can stop.
        const t = (b.theta[i] ?? 0) - (model.rest[i] ?? 0);
        const before =
          i > 0 ? (b.theta[i - 1] ?? 0) - (model.rest[i - 1] ?? 0) : t;
        const after =
          i < count - 1 ? (b.theta[i + 1] ?? 0) - (model.rest[i + 1] ?? 0) : t;
        const a =
          -k * t -
          damp * (b.omega[i] ?? 0) +
          kappa * (before + after - 2 * t) +
          (force[i] ?? 0);
        b.omega[i] = (b.omega[i] ?? 0) + a * h;
      }
      for (let i = 0; i < count; i += 1) {
        b.theta[i] = (b.theta[i] ?? 0) + (b.omega[i] ?? 0) * h;
      }
    }
    for (let i = 0; i < count; i += 1) {
      const t = (b.theta[i] ?? 0) - (model.rest[i] ?? 0);
      const w = b.omega[i] ?? 0;
      if (Math.abs(t) > 0.002 || Math.abs(w) > 0.01 || (force[i] ?? 0) !== 0)
        busy = true;
      // A hard whip stirs the water at the reed's foot.
      if (Math.abs(w) > 5 && now - (b.rippleAt[i] ?? -Infinity) > 900) {
        b.rippleAt[i] = now;
      }
      if (now - (b.rippleAt[i] ?? -Infinity) < 700) busy = true;
    }
    if (!busy) {
      b.theta.set(model.rest);
      b.omega.fill(0);
    }
    return busy;
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const b = body.current;
    // The pointer's speed fades if it stops moving.
    if (b.pointer && now - b.pointer.t > 60) b.pointer.vx *= 0.6;
    const busy = step(dt, now);
    pose();
    if (busy !== b.swaying) {
      b.swaying = busy;
      cfg.current.onSwayChange?.(busy);
    }
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((t) => frameRef.current(t));
    }
  };

  /**
   * The trigger. Standing reeds take a breath of wind down the line; reeds
   * under the water (after a leave with `once` off) grow back up first, one
   * after another on the glide spring. Off, they sink.
   */
  const rise = (on: boolean) => {
    const b = body.current;
    const c = cfg.current;
    const now = performance.now();
    if (!on) {
      b.sinkAt = now;
      b.gust = null;
      b.completeAt = Number.NaN;
      wake();
      return;
    }
    const start = now + Math.max(0, c.delay);
    const under =
      !Number.isNaN(b.sinkAt) ||
      Array.from(b.riseAt).some((v) => v === Number.POSITIVE_INFINITY);
    b.sinkAt = Number.NaN;
    let tail = 0;
    if (under) {
      for (let i = 0; i < b.riseAt.length; i += 1) {
        b.riseAt[i] = start + (c.motionSafe ? i * c.stagger : 0);
      }
      b.riseOn = true;
      tail = c.motionSafe ? (b.riseAt.length - 1) * c.stagger : 0;
    }
    const breeze = under ? tail * 0.55 + c.duration * 0.6 : 0;
    b.completeAt =
      start +
      (under ? tail + c.duration * 1.4 : 0) +
      (c.motionSafe ? 900 : 300);
    if (breezeTimer.current !== null) window.clearTimeout(breezeTimer.current);
    breezeTimer.current = window.setTimeout(
      () => {
        breezeTimer.current = null;
        api.current?.gust(1, c.motionSafe ? 0.42 : 0.6, 20);
      },
      Math.round(start - now + breeze),
    );
    wake();
  };

  /** A gust from one end: a travelling push down the line. */
  const gust = (dir: number, amp: number, speed?: number) => {
    const b = body.current;
    const count = b.theta.length;
    if (!count) return;
    b.gust = { at: dir > 0 ? -2 : count + 1, dir, speed: speed ?? 18, amp };
    wake();
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      length,
      stiffness,
      damping,
      coupling,
      radius,
      strength,
      maxBend,
      stagger,
      duration,
      delay,
      motionSafe,
      onSwayChange,
      onComplete,
    };
    frameRef.current = frame;
    live.current = running;
    api.current = { wake, halt, rise, gust, measure, pose };
  });

  // The reeds stand from the first frame, so the line reads before its
  // entrance; only a reed that has sunk (a leave with `once` off) rises.
  React.useLayoutEffect(() => {
    body.current = bodyOf(model.cells.length);
    body.current.theta.set(model.rest);
    api.current?.measure();
    api.current?.pose();
  }, [model]);

  React.useEffect(() => {
    if (started) {
      played.current = true;
      api.current?.rise(true);
    } else if (played.current) api.current?.rise(false);
  }, [started, entrance.n, model]);

  React.useEffect(
    () => () => {
      if (breezeTimer.current !== null)
        window.clearTimeout(breezeTimer.current);
      breezeTimer.current = null;
    },
    [],
  );

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  React.useEffect(() => {
    api.current?.pose();
    api.current?.wake();
  }, [maxBend, motionSafe]);

  const timer = React.useRef<number | null>(null);
  const begin = React.useCallback((restart: boolean, wait: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on && !restart ? e : { n: e.n + 1, on: true }));
    }, wait);
  }, []);
  const reset = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setEntrance((e) => (e.on ? { n: e.n, on: false } : e));
    }, 0);
  }, []);

  React.useEffect(() => {
    if (trigger === "mount") begin(false, 0);
    if (trigger === "manual") {
      if (play) begin(true, 0);
      else reset();
    }
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [trigger, play, begin, reset]);

  const seen = React.useRef({ trigger, once, played: false });
  React.useLayoutEffect(() => {
    seen.current = { ...seen.current, trigger, once };
    if (started) seen.current.played = true;
  });

  const bindRoot = React.useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (!node) return;
      const remeasure = () => api.current?.measure();
      const sizer = new ResizeObserver(() => {
        remeasure();
        api.current?.pose();
      });
      sizer.observe(node);
      document.fonts?.addEventListener?.("loadingdone", remeasure);
      const watcher = new IntersectionObserver((entries) => {
        const entry = entries[entries.length - 1];
        const visible = Boolean(entry?.isIntersecting);
        setOnScreen(visible);
        const t = seen.current;
        if (t.trigger !== "inView") return;
        if (visible) begin(false, 0);
        else if (!t.once && t.played) reset();
      });
      watcher.observe(node);
      return () => {
        sizer.disconnect();
        watcher.disconnect();
        document.fonts?.removeEventListener?.("loadingdone", remeasure);
      };
    },
    [begin, reset],
  );

  const bindColumn = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) columns.current.set(i, node);
    else columns.current.delete(i);
  };

  const pointAt = (clientX: number, clientY: number, timeStamp: number) => {
    const root = rootRef.current;
    const b = body.current;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const prev = b.pointer;
    let vx = 0;
    if (prev) {
      const dt = Math.max(8, timeStamp - prev.t);
      vx = lerp(prev.vx, ((x - prev.x) / dt) * 1000, 0.5);
    }
    b.pointer = { x, y, vx: clamp(vx, -4000, 4000), t: timeStamp };
    if (!cfg.current.motionSafe) {
      // Still reeds: the stalks near the pointer warm instead.
      const reach = Math.max(0.3, cfg.current.radius) * b.em;
      for (let i = 0; i < b.theta.length; i += 1) {
        const d = Math.hypot((b.cx[i] ?? 0) - x, ((b.cy[i] ?? 0) - y) * 1.4);
        if (d < reach) {
          b.glow[i] = Math.max(b.glow[i] ?? 0, 0.55 * (1 - d / reach));
        }
      }
    }
    wake();
  };

  const letGo = () => {
    body.current.pointer = null;
    wake();
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: !interactive,
    onMove: ({ point, event }) => {
      if (event.pointerType === "touch") {
        pointAt(point.x, point.y, event.timeStamp);
      }
    },
    onEnd: ({ velocity, event }) => {
      // A fast throw across the line sends a gust down all of it.
      const b = body.current;
      const speed = Math.abs(velocity.x);
      if (speed > 800) {
        gust(
          Math.sign(velocity.x),
          clamp(speed / 2600, 0.35, 1),
          clamp(speed / Math.max(6, b.pitch), 10, 40),
        );
      }
      if (event.pointerType === "touch") letGo();
    },
    onCancel: letGo,
    onTap: (event) => {
      if (event.pointerType === "touch") letGo();
    },
  });

  const Tag = as;

  return (
    <div className={cn("relative", className)}>
      <div
        ref={bindRoot}
        className={cn(
          "relative overflow-clip px-[0.6em] pt-[0.15em] pb-[0.1em] [contain:paint]",
          interactive && "touch-pan-y",
        )}
        onPointerEnter={() => {
          if (trigger === "hover") begin(!once, 0);
        }}
        onPointerDown={(event) => {
          drag.onPointerDown(event);
          if (!interactive) return;
          pointAt(event.clientX, event.clientY, event.timeStamp);
        }}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (!interactive || event.pointerType === "touch") return;
          pointAt(event.clientX, event.clientY, event.timeStamp);
        }}
        onPointerUp={(event) => {
          drag.onPointerUp(event);
          if (event.pointerType === "touch") letGo();
        }}
        onPointerCancel={(event) => {
          drag.onPointerCancel(event);
          letGo();
        }}
        onLostPointerCapture={drag.onLostPointerCapture}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          if (trigger === "hover" && !once) reset();
          letGo();
        }}
      >
        <Tag className="m-0 block">
          <span className="sr-only">{line}</span>
          <span aria-hidden className="block select-none [word-spacing:0.12em]">
            {model.words.map((word, w) => (
              <React.Fragment key={w}>
                {w > 0 ? " " : null}
                <span className="relative mb-[0.3em] inline-block whitespace-nowrap">
                  {word.map((i) => (
                    <Reed
                      key={i}
                      char={model.letters[i] ?? ""}
                      cell={model.cells[i] as Cell}
                      stalk={length}
                      color={stalkColor}
                      water={water}
                      bind={bindColumn(i)}
                    />
                  ))}
                  {water ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-x-[0.14em] bottom-0 h-[max(1px,0.035em)]"
                      style={{
                        background:
                          "linear-gradient(90deg, transparent, color-mix(in oklab, var(--accent-bright) 30%, var(--ink-3)) 14%, color-mix(in oklab, var(--accent-bright) 30%, var(--ink-3)) 86%, transparent)",
                      }}
                    />
                  ) : null}
                </span>
              </React.Fragment>
            ))}
          </span>
        </Tag>
      </div>
      {interactive && n > 0 ? (
        <>
          <button
            type="button"
            aria-label="Ripple the reeds"
            aria-describedby={hintId}
            onFocus={(event) => {
              if (trigger === "hover") begin(!once, 0);
              // Keyboard focus sends a gentle ripple across; a click's focus
              // is the pointer's business.
              if (event.currentTarget.matches(":focus-visible")) gust(1, 0.32);
            }}
            onClick={(event) => {
              if (event.detail === 0) gust(1, 0.85, 22);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                gust(1, 0.7, 20);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                gust(-1, 0.7, 20);
              }
            }}
            className="pointer-events-none absolute inset-0 rounded-2 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Left and Right send a gust from either end; Enter ripples the whole
            line.
          </span>
        </>
      ) : null}
    </div>
  );
}
