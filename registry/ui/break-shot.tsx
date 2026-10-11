"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cascade, durations, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type BreakShotElement =
  "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

export type BreakShotCloth = "green" | "blue" | "claret";

export type BreakShotProps = {
  /** The headline, as a string. Wins over `text`. */
  children?: string;
  /** The headline, when it is not given as children. */
  text?: string;
  /** The element that carries the headline. @default "p" */
  as?: BreakShotElement;
  /** How hard the cue ball hits, as a multiple of a firm shot. @default 1 */
  force?: number;
  /** How much the cloth slows the balls, 0 (slick, they run and bank) to 1 (heavy nap). @default 0.45 */
  friction?: number;
  /** How long the spread lies once the last ball stops, before the re-rack, ms. @default 1600 */
  returnDelay?: number;
  /** How lively the cushions are, 0 to 1. @default 0.72 */
  bounce?: number;
  /** Ball colours, cycled along the headline; any CSS colours. @default a restrained lacquer set */
  palette?: string[];
  /** The cloth. @default "green" */
  cloth?: BreakShotCloth;
  /** Ball diameter, em. @default 1.3 */
  size?: number;
  /** A faint cue ball rides the pointer over the cloth. @default true */
  cue?: boolean;
  /** The pointer, a touch and the keys play shots. @default true */
  interactive?: boolean;
  /** Clacks for the shots the visitor plays. Off unless asked for. @default false */
  sound?: boolean;
  /** Racked and still: nothing plays. @default false */
  disabled?: boolean;
  /** A shot scattered the rack. */
  onBreak?: () => void;
  /** Every ball is back in the rack. */
  onRack?: () => void;
  className?: string;
};

/** Lacquered balls: fixed pigments, the same table in either theme. */
const PALETTE = [
  "oklch(0.8 0.13 85)",
  "oklch(0.5 0.15 25)",
  "oklch(0.45 0.12 258)",
  "oklch(0.52 0.1 310)",
  "oklch(0.7 0.13 55)",
  "oklch(0.33 0.02 260)",
  "oklch(0.56 0.09 195)",
];

const CLOTHS: Record<BreakShotCloth, { felt: string; cushion: string }> = {
  green: { felt: "oklch(0.5 0.105 155)", cushion: "oklch(0.4 0.09 155)" },
  blue: { felt: "oklch(0.49 0.095 238)", cushion: "oklch(0.39 0.085 240)" },
  claret: { felt: "oklch(0.43 0.12 15)", cushion: "oklch(0.34 0.1 15)" },
};

const IVORY = "oklch(0.965 0.018 90)";
const INK = "oklch(0.22 0.02 260)";
const RAIL =
  "linear-gradient(to bottom, oklch(0.44 0.07 48), oklch(0.33 0.06 42) 55%, oklch(0.27 0.05 40))";

/** Cloth nap as an SVG noise tile: fixed art. */
const NAP = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='1.1' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -1.2 0.46'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>",
)}")`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

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

/**
 * Hover is not a user activation: a sound asked for before the page has had
 * a click, tap or key would only make a context the browser will not start.
 */
const activated = (fallback: boolean) =>
  typeof navigator !== "undefined" &&
  ((navigator as { userActivation?: { hasBeenActive: boolean } }).userActivation
    ?.hasBeenActive ??
    fallback);

/* The page's visibility, read without a render-time `document`. */
const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
};
const pageHidden = () => document.hidden;
const serverHidden = () => false;

const RACK = 0;
const FREE = 1;
const HOME = 2;

type Table = {
  n: number;
  /** Slot centres (the rack), cloth px. */
  sx: Float64Array;
  sy: Float64Array;
  /** Offsets from the slot, px, and velocities, px/s. Index n is the shot cue ball. */
  ox: Float64Array;
  oy: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  /** Orientation quaternions (w, x, y, z), so the spots roll. */
  q: Float64Array;
  /** The quaternion each returning ball started from. */
  q0: Float64Array;
  /** Where each returning ball started from, and its progress home. */
  fx: Float64Array;
  fy: Float64Array;
  s: Float64Array;
  sv: Float64Array;
  due: Float64Array;
  mode: Uint8Array;
  /** Shown offsets and fades under reduced motion. */
  dx: Float64Array;
  dy: Float64Array;
  fade: Float64Array;
  /** The shot cue ball is on the table. */
  cueOn: boolean;
  cueFade: number;
  r: number;
  w: number;
  h: number;
  em: number;
  measured: boolean;
  /** The pointer as a kinematic cue ball. */
  px: number;
  py: number;
  pvx: number;
  pvy: number;
  pAt: number;
  pIn: boolean;
  ghost: number;
  /** When the spread's wait ends and the re-rack begins, ms; 0 when none. */
  waitUntil: number;
  /** Contacts so far, to vary each one's skew. */
  contacts: number;
  broken: boolean;
  visitor: boolean;
  pressed: boolean;
  /** Reduced motion: a pending cross-fade to the shown positions. */
  swapTo: "spread" | "rack" | null;
};

const tableOf = (n: number): Table => {
  const m = n + 1;
  const q = new Float64Array(m * 4);
  for (let i = 0; i < m; i += 1) q[i * 4] = 1;
  return {
    n,
    sx: new Float64Array(m),
    sy: new Float64Array(m),
    ox: new Float64Array(m),
    oy: new Float64Array(m),
    vx: new Float64Array(m),
    vy: new Float64Array(m),
    q,
    q0: Float64Array.from(q),
    fx: new Float64Array(m),
    fy: new Float64Array(m),
    s: new Float64Array(m),
    sv: new Float64Array(m),
    due: new Float64Array(m),
    mode: new Uint8Array(m),
    dx: new Float64Array(m),
    dy: new Float64Array(m),
    fade: new Float64Array(m).fill(1),
    cueOn: false,
    cueFade: 0,
    r: 10,
    w: 100,
    h: 50,
    em: 16,
    measured: false,
    px: 0,
    py: 0,
    pvx: 0,
    pvy: 0,
    pAt: -Infinity,
    pIn: false,
    ghost: 0,
    waitUntil: 0,
    contacts: 0,
    broken: false,
    visitor: false,
    pressed: false,
    swapTo: null,
  };
};

/** Rotates quaternion i by `angle` about the unit axis (ax, ay, 0), in world space. */
function roll(
  q: Float64Array,
  i: number,
  ax: number,
  ay: number,
  angle: number,
) {
  const h = angle / 2;
  const s = Math.sin(h);
  const bw = Math.cos(h);
  const bx = ax * s;
  const by = ay * s;
  const k = i * 4;
  const w = q[k] ?? 1;
  const x = q[k + 1] ?? 0;
  const y = q[k + 2] ?? 0;
  const z = q[k + 3] ?? 0;
  // b ⊗ q, with b's z part zero.
  let nw = bw * w - bx * x - by * y;
  let nx = bw * x + bx * w - by * z;
  let ny = bw * y + by * w + bx * z;
  let nz = bw * z + bx * y - by * x;
  const len = Math.hypot(nw, nx, ny, nz) || 1;
  nw /= len;
  nx /= len;
  ny /= len;
  nz /= len;
  q[k] = nw;
  q[k + 1] = nx;
  q[k + 2] = ny;
  q[k + 3] = nz;
}

/** A vector turned by quaternion i. */
function turn(q: Float64Array, i: number, vx: number, vy: number, vz: number) {
  const k = i * 4;
  const w = q[k] ?? 1;
  const x = q[k + 1] ?? 0;
  const y = q[k + 2] ?? 0;
  const z = q[k + 3] ?? 0;
  // v + 2w(u × v) + 2u × (u × v), u = (x, y, z)
  const cx = y * vz - z * vy;
  const cy = z * vx - x * vz;
  const cz = x * vy - y * vx;
  return {
    x: vx + 2 * (w * cx + (y * cz - z * cy)),
    y: vy + 2 * (w * cy + (z * cx - x * cz)),
    z: vz + 2 * (w * cz + (x * cy - y * cx)),
  };
}

/** Spherical blend from quaternion a (in q0) toward the identity. */
function homeward(t: Table, i: number, u: number) {
  const k = i * 4;
  let w = t.q0[k] ?? 1;
  let x = t.q0[k + 1] ?? 0;
  let y = t.q0[k + 2] ?? 0;
  let z = t.q0[k + 3] ?? 0;
  if (w < 0) {
    w = -w;
    x = -x;
    y = -y;
    z = -z;
  }
  const theta = Math.acos(clamp(w, -1, 1));
  let a = 1 - u;
  let b = u;
  if (theta > 1e-4) {
    a = Math.sin((1 - u) * theta) / Math.sin(theta);
    b = Math.sin(u * theta) / Math.sin(theta);
  }
  const nw = a * w + b;
  const nx = a * x;
  const ny = a * y;
  const nz = a * z;
  const len = Math.hypot(nw, nx, ny, nz) || 1;
  t.q[k] = nw / len;
  t.q[k + 1] = nx / len;
  t.q[k + 2] = ny / len;
  t.q[k + 3] = nz / len;
}

type Hit = { x: number; speed: number; pitch: number; kind: "ball" | "rail" };

type Api = {
  wake: () => void;
  halt: () => void;
  measure: () => void;
  shoot: (fromX: number, fromY: number, toward: number) => void;
  rerack: (now?: boolean) => void;
};

/**
 * A headline racked as billiard balls on a small carom table — a lacquered
 * ball for every letter, each with an ivory spot carrying the letter, words in
 * tight rows on the cloth. The rack is laid out by CSS, so the server's first
 * frame is the finished rack; every ball moves as an offset from its slot.
 *
 * The pointer is a cue ball. Over the cloth a faint ghost of it rides the
 * pointer, and whatever it meets it hits as an equal mass would, with the
 * pointer's speed and `force`: a slow pass nudges, a sweep breaks the rack.
 * The balls then run on real physics — elastic collisions between them,
 * cushions that give back `bounce` of the speed, rolling resistance from
 * `friction` — and every ball rolls: its spot turns over the top as it
 * travels, foreshortens and comes back round.
 *
 * `returnDelay` after the last ball stops, they are lifted and glide back to
 * their slots along straight lines in reading order, a cascade apart, on the
 * glide calibration, each rolling upright as it goes so the letters land
 * facing you; each sets down with a soft clack. A tap shoots a cue ball from
 * the tap at the nearest ball. A transparent button over the table gives the
 * keyboard Enter or Space to break from the left and Escape to re-rack. One
 * loop moves everything and stops at rest. Under reduced motion nothing
 * travels: a shot is played out at once and the balls cross-fade to where they
 * would have stopped, then cross-fade back into the rack.
 */
export function BreakShot({
  children,
  text,
  as = "p",
  force = 1,
  friction = 0.45,
  returnDelay = 1600,
  bounce = 0.72,
  palette = PALETTE,
  cloth = "green",
  size = 1.3,
  cue = true,
  interactive = true,
  sound = false,
  disabled = false,
  onBreak,
  onRack,
  className,
}: BreakShotProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const line = ((typeof children === "string" ? children : text) ?? "").trim();
  const felt = CLOTHS[cloth] ?? CLOTHS.green;
  const colours = palette.length > 0 ? palette : PALETTE;
  const hidden = React.useSyncExternalStore(
    subscribeVisibility,
    pageHidden,
    serverHidden,
  );
  const [onScreen, setOnScreen] = React.useState(true);
  const running = onScreen && !hidden;
  const active = interactive && !disabled;

  const model = React.useMemo(() => {
    const words: number[][] = [];
    const letters: string[] = [];
    let word: number[] = [];
    for (const ch of graphemes(line)) {
      if (/\s/.test(ch)) {
        if (word.length) words.push(word);
        word = [];
        continue;
      }
      word.push(letters.length);
      letters.push(ch);
    }
    if (word.length) words.push(word);
    return { words, letters };
  }, [line]);
  const n = model.letters.length;

  const clothRef = React.useRef<HTMLDivElement | null>(null);
  const slotNodes = React.useRef(new Map<number, HTMLSpanElement>());
  const ballNodes = React.useRef(
    new Map<
      number,
      {
        node: HTMLElement;
        shadow: HTMLElement | null;
        spot: HTMLElement | null;
      }
    >(),
  );
  const cueRef = React.useRef<HTMLSpanElement | null>(null);
  const ghostRef = React.useRef<HTMLSpanElement | null>(null);
  const table = React.useRef<Table>(tableOf(0));
  const raf = React.useRef(0);
  const last = React.useRef(0);
  const live = React.useRef(running);
  const api = React.useRef<Api | null>(null);
  const cfg = React.useRef({
    force,
    friction,
    returnDelay,
    bounce,
    motionSafe,
    audio,
    line,
    cue,
    onBreak,
    onRack,
  });
  const frameRef = React.useRef((now: number) => {
    void now;
  });

  const wake = () => {
    if (raf.current || !live.current) return;
    last.current = performance.now();
    raf.current = window.requestAnimationFrame((ts) => frameRef.current(ts));
  };
  const halt = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current);
    raf.current = 0;
  };

  /** Slot centres and the cloth's walls. A resize mid-spread re-racks. */
  const measure = () => {
    const box = clothRef.current;
    const t = table.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    t.w = box.clientWidth;
    t.h = box.clientHeight;
    t.em = parseFloat(getComputedStyle(box).fontSize) || 16;
    let r = t.r;
    for (let i = 0; i < t.n; i += 1) {
      const node = slotNodes.current.get(i);
      if (!node) continue;
      const s = node.getBoundingClientRect();
      t.sx[i] = s.left - rect.left - box.clientLeft + s.width / 2;
      t.sy[i] = s.top - rect.top - box.clientTop + s.height / 2;
      r = s.width / 2;
    }
    const moved = t.measured && Math.abs(r - t.r) > 0.5;
    t.r = r;
    t.measured = true;
    if (moved) rerack(true);
  };

  /** Plays the table forward by h seconds; collects the impacts it heard. */
  const integrate = (h: number, hits: Hit[] | null) => {
    const t = table.current;
    const c = cfg.current;
    const r = t.r;
    const d = 2 * r;
    const m = t.n + 1;
    const diam = d;
    const decel = (2.5 + 13.5 * clamp01(c.friction)) * diam;
    const rest = 0.12 * diam;
    const e = 0.94;
    const cushion = clamp(c.bounce, 0, 1);
    for (let i = 0; i < m; i += 1) {
      const mode = t.mode[i];
      if (i === t.n && !t.cueOn) continue;
      if (mode !== FREE && i !== t.n) continue;
      let vx = t.vx[i] ?? 0;
      let vy = t.vy[i] ?? 0;
      const speed = Math.hypot(vx, vy);
      if (speed < 1e-6) continue;
      // Rolling resistance and a little air: a ball always comes to rest.
      const slow = Math.max(0, speed - decel * h) * Math.exp(-0.3 * h);
      if (slow < rest) {
        vx = 0;
        vy = 0;
      } else {
        vx *= slow / speed;
        vy *= slow / speed;
      }
      let x = (t.sx[i] ?? 0) + (t.ox[i] ?? 0) + vx * h;
      let y = (t.sy[i] ?? 0) + (t.oy[i] ?? 0) + vy * h;
      // Cushions give back part of the speed.
      if (x < r) {
        if (hits && Math.abs(vx) > 0.6 * diam)
          hits.push({ x, speed: Math.abs(vx), pitch: 0.62, kind: "rail" });
        x = r;
        vx = Math.abs(vx) * cushion;
      } else if (x > t.w - r) {
        if (hits && Math.abs(vx) > 0.6 * diam)
          hits.push({ x, speed: Math.abs(vx), pitch: 0.62, kind: "rail" });
        x = t.w - r;
        vx = -Math.abs(vx) * cushion;
      }
      if (y < r) {
        if (hits && Math.abs(vy) > 0.6 * diam)
          hits.push({ x, speed: Math.abs(vy), pitch: 0.62, kind: "rail" });
        y = r;
        vy = Math.abs(vy) * cushion;
      } else if (y > t.h - r) {
        if (hits && Math.abs(vy) > 0.6 * diam)
          hits.push({ x, speed: Math.abs(vy), pitch: 0.62, kind: "rail" });
        y = t.h - r;
        vy = -Math.abs(vy) * cushion;
      }
      t.ox[i] = x - (t.sx[i] ?? 0);
      t.oy[i] = y - (t.sy[i] ?? 0);
      t.vx[i] = vx;
      t.vy[i] = vy;
      // Rolling without slipping: the travel turns the ball about the axis
      // across its path.
      const v = Math.hypot(vx, vy);
      if (v > 1e-6 && c.motionSafe) roll(t.q, i, -vy / v, vx / v, (v * h) / r);
    }
    // Ball on ball: equal masses, nearly elastic, overlap shared.
    for (let i = 0; i < m; i += 1) {
      if (i === t.n ? !t.cueOn : t.mode[i] === HOME) continue;
      for (let j = i + 1; j < m; j += 1) {
        if (j === t.n ? !t.cueOn : t.mode[j] === HOME) continue;
        const xi = (t.sx[i] ?? 0) + (t.ox[i] ?? 0);
        const yi = (t.sy[i] ?? 0) + (t.oy[i] ?? 0);
        const xj = (t.sx[j] ?? 0) + (t.ox[j] ?? 0);
        const yj = (t.sy[j] ?? 0) + (t.oy[j] ?? 0);
        const dx = xj - xi;
        const dy = yj - yi;
        const dist = Math.hypot(dx, dy);
        if (dist >= d - 0.01 || dist < 1e-6) continue;
        // Real balls never meet dead centre: each contact is turned a little,
        // the same way every time, so a straight row scatters as a rack does
        // instead of passing the whole shot down the line.
        const skew =
          ((((Math.imul(i + 1, 73856093) ^
            Math.imul(j + 1, 19349663) ^
            Math.imul(t.contacts + 1, 83492791)) >>>
            0) %
            1000) /
            1000 -
            0.5) *
          0.4;
        t.contacts += 1;
        const cs = Math.cos(skew);
        const sn = Math.sin(skew);
        const ux = dx / dist;
        const uy = dy / dist;
        const push = (d - dist) / 2;
        t.ox[i] = (t.ox[i] ?? 0) - ux * push;
        t.oy[i] = (t.oy[i] ?? 0) - uy * push;
        t.ox[j] = (t.ox[j] ?? 0) + ux * push;
        t.oy[j] = (t.oy[j] ?? 0) + uy * push;
        const nx = ux * cs - uy * sn;
        const ny = ux * sn + uy * cs;
        const rel =
          ((t.vx[i] ?? 0) - (t.vx[j] ?? 0)) * nx +
          ((t.vy[i] ?? 0) - (t.vy[j] ?? 0)) * ny;
        if (rel <= 0) continue;
        const jn = ((1 + e) / 2) * rel;
        t.vx[i] = (t.vx[i] ?? 0) - jn * nx;
        t.vy[i] = (t.vy[i] ?? 0) - jn * ny;
        t.vx[j] = (t.vx[j] ?? 0) + jn * nx;
        t.vy[j] = (t.vy[j] ?? 0) + jn * ny;
        for (const k of [i, j]) {
          if (k < t.n && t.mode[k] === RACK) {
            t.mode[k] = FREE;
            if (!t.broken) {
              t.broken = true;
              c.onBreak?.();
            }
          }
        }
        if (hits && rel > 0.6 * diam) {
          hits.push({
            x: (xi + xj) / 2,
            speed: rel,
            pitch:
              0.92 +
              ((((Math.imul(i + 7, 2654435761) ^ Math.imul(j + 3, 40503)) >>>
                0) %
                100) /
                100) *
                0.3,
            kind: "ball",
          });
        }
      }
    }
  };

  /** The pointer, as a cue ball that cannot be pushed back, meets the balls. */
  const cueStrike = () => {
    const t = table.current;
    const c = cfg.current;
    if (!t.pIn) return false;
    // Still: one shot at a time, from the rack.
    if (!c.motionSafe && (t.swapTo !== null || t.broken)) return false;
    const r = t.r;
    const speed = Math.hypot(t.pvx, t.pvy);
    let struck = false;
    for (let i = 0; i < t.n; i += 1) {
      if (t.mode[i] === HOME) continue;
      const x = (t.sx[i] ?? 0) + (t.ox[i] ?? 0);
      const y = (t.sy[i] ?? 0) + (t.oy[i] ?? 0);
      const dx = x - t.px;
      const dy = y - t.py;
      const dist = Math.hypot(dx, dy);
      if (dist >= 2 * r || dist < 1e-6) continue;
      const nx = dx / dist;
      const ny = dy / dist;
      const rel = (t.pvx - (t.vx[i] ?? 0)) * nx + (t.pvy - (t.vy[i] ?? 0)) * ny;
      if (!c.motionSafe) {
        // Still: a real strike plays the whole shot out at once.
        if (speed > 4 * r && rel > 0) {
          playOut(i, nx * rel * c.force, ny * rel * c.force);
          return true;
        }
        continue;
      }
      // Out of the cue's way, and if it was coming at the ball, the hit.
      t.ox[i] = (t.ox[i] ?? 0) + nx * (2 * r - dist);
      t.oy[i] = (t.oy[i] ?? 0) + ny * (2 * r - dist);
      if (t.mode[i] === RACK) {
        t.mode[i] = FREE;
        if (!t.broken) {
          t.broken = true;
          c.onBreak?.();
        }
      }
      if (rel > 0) {
        const jn = ((1 + 0.94) / 2) * rel * clamp(c.force, 0.2, 3);
        t.vx[i] = (t.vx[i] ?? 0) + jn * nx;
        t.vy[i] = (t.vy[i] ?? 0) + jn * ny;
        struck = true;
        if (t.visitor && activated(t.pressed) && rel > 1.2 * r) {
          c.audio.play("clack", {
            pitch: 1.05,
            gain: r2(clamp(rel / (24 * r), 0.1, 0.55)),
            pan: panAt(x),
          });
        }
      }
    }
    return struck;
  };

  const panAt = (x: number) => {
    const box = clothRef.current;
    return box ? panFrom(box.getBoundingClientRect().left + x, box) : 0;
  };

  /**
   * Reduced motion: the shot is played to its end off screen, and the balls
   * cross-fade from the rack to where they came to rest.
   */
  const playOut = (i: number, vx: number, vy: number) => {
    const t = table.current;
    if (i >= 0) {
      t.vx[i] = (t.vx[i] ?? 0) + vx;
      t.vy[i] = (t.vy[i] ?? 0) + vy;
      if (i < t.n) t.mode[i] = FREE;
    }
    for (let k = 0; k < t.n + 1; k += 1) {
      t.dx[k] = t.ox[k] ?? 0;
      t.dy[k] = t.oy[k] ?? 0;
    }
    for (let step = 0; step < 240 * 8; step += 1) {
      integrate(1 / 240, null);
      let moving = false;
      for (let k = 0; k < t.n + 1; k += 1) {
        if (Math.abs(t.vx[k] ?? 0) + Math.abs(t.vy[k] ?? 0) > 0) moving = true;
      }
      if (!moving) break;
    }
    if (!t.broken) {
      t.broken = true;
      cfg.current.onBreak?.();
    }
    t.swapTo = "spread";
    if (t.visitor && activated(t.pressed)) {
      cfg.current.audio.play("clack", { pitch: 1, gain: 0.4 });
    }
    wake();
  };

  /** A cue ball shot from a point at ball `toward`. */
  const shoot = (fromX: number, fromY: number, toward: number) => {
    const t = table.current;
    const c = cfg.current;
    if (t.n === 0 || !t.measured) return;
    const target = clamp(toward, 0, t.n - 1);
    const tx = (t.sx[target] ?? 0) + (t.ox[target] ?? 0);
    const ty = (t.sy[target] ?? 0) + (t.oy[target] ?? 0);
    const rand = lcg(
      hash(`${c.line}:${Math.round(fromX)}:${Math.round(fromY)}`),
    );
    const aim = Math.atan2(ty - fromY, tx - fromX) + (rand() - 0.5) * 0.08;
    const speed = clamp(c.force, 0.2, 3) * 36 * t.r;
    const k = t.n;
    t.sx[k] = clamp(fromX, t.r, t.w - t.r);
    t.sy[k] = clamp(fromY, t.r, t.h - t.r);
    t.ox[k] = 0;
    t.oy[k] = 0;
    t.vx[k] = Math.cos(aim) * speed;
    t.vy[k] = Math.sin(aim) * speed;
    const qk = k * 4;
    t.q[qk] = 1;
    t.q[qk + 1] = 0;
    t.q[qk + 2] = 0;
    t.q[qk + 3] = 0;
    t.cueOn = true;
    t.cueFade = 1;
    t.waitUntil = 0;
    if (t.visitor && activated(t.pressed)) {
      c.audio.play("clack", { pitch: 0.8, gain: 0.3, pan: panAt(fromX) });
    }
    if (!c.motionSafe) {
      playOut(-1, 0, 0);
      return;
    }
    wake();
  };

  /** Every ball back to its slot: lifted, in reading order, a cascade apart. */
  const rerack = (now = false) => {
    const t = table.current;
    const c = cfg.current;
    const at = performance.now();
    t.waitUntil = 0;
    const gap = cascade(t.n) * 1000;
    let rank = 0;
    for (let i = 0; i < t.n; i += 1) {
      const off = Math.hypot(t.ox[i] ?? 0, t.oy[i] ?? 0);
      if (t.mode[i] === RACK && off < 0.5) continue;
      if (now || !c.motionSafe) {
        t.mode[i] = RACK;
        t.ox[i] = 0;
        t.oy[i] = 0;
        t.vx[i] = 0;
        t.vy[i] = 0;
        const k = i * 4;
        t.q[k] = 1;
        t.q[k + 1] = 0;
        t.q[k + 2] = 0;
        t.q[k + 3] = 0;
        continue;
      }
      t.mode[i] = HOME;
      t.fx[i] = t.ox[i] ?? 0;
      t.fy[i] = t.oy[i] ?? 0;
      t.vx[i] = 0;
      t.vy[i] = 0;
      t.s[i] = 0;
      t.sv[i] = 0;
      t.due[i] = at + rank * gap;
      for (let k = 0; k < 4; k += 1) t.q0[i * 4 + k] = t.q[i * 4 + k] ?? 0;
      rank += 1;
    }
    if (!c.motionSafe && !now) t.swapTo = "rack";
    if (now) {
      const wasBroken = t.broken;
      t.cueOn = false;
      t.cueFade = 0;
      t.broken = false;
      for (let k = 0; k < t.n + 1; k += 1) {
        t.dx[k] = 0;
        t.dy[k] = 0;
        t.fade[k] = 1;
      }
      t.swapTo = null;
      if (wasBroken) c.onRack?.();
    }
    wake();
  };

  const cueParts = () => {
    const node = cueRef.current;
    if (!node) return undefined;
    return {
      node: node as HTMLElement,
      shadow: node.firstElementChild as HTMLElement | null,
      spot: node.querySelector<HTMLElement>("[data-spot]"),
    };
  };

  /** Writes every ball's place, roll, lift and shadow. */
  const render = () => {
    const t = table.current;
    const c = cfg.current;
    const r = t.r;
    for (let i = 0; i < t.n + 1; i += 1) {
      const cueBall = i === t.n;
      const parts = cueBall ? cueParts() : ballNodes.current.get(i);
      if (!parts) continue;
      const { node, shadow, spot } = parts;
      const still = !c.motionSafe;
      // A ball is drawn as an offset from its slot; the shot cue ball has no
      // slot, so it is drawn at its place on the cloth.
      const x =
        (still ? (t.dx[i] ?? 0) : (t.ox[i] ?? 0)) +
        (cueBall ? (t.sx[i] ?? 0) : 0);
      const y =
        (still ? (t.dy[i] ?? 0) : (t.oy[i] ?? 0)) +
        (cueBall ? (t.sy[i] ?? 0) : 0);
      const s = t.mode[i] === HOME && !still ? (t.s[i] ?? 0) : 0;
      const lift = Math.sin(Math.PI * clamp01(s));
      node.style.transform = `translate(${r2(x)}px, ${r2(y)}px) scale(${r4(1 + 0.05 * lift)})`;
      node.style.opacity = cueBall
        ? String(r4(t.cueFade))
        : String(r4(t.fade[i] ?? 1));
      if (shadow) {
        shadow.style.transform = `translate(${r2(0.12 * r + lift * 0.5 * r)}px, ${r2(0.2 * r + lift * 0.6 * r)}px) scale(${r4(1 + 0.25 * lift)})`;
        shadow.style.opacity = String(r4(0.9 - 0.4 * lift));
      }
      if (spot) {
        const d = turn(t.q, i, 0, 0, 1);
        const right = turn(t.q, i, 1, 0, 0);
        const down = turn(t.q, i, 0, 1, 0);
        // The spot is a flat disc tangent to the ball where it faces: drawn
        // by the exact orthographic projection of its own right and down.
        spot.style.transform = `matrix(${r4(right.x)}, ${r4(right.y)}, ${r4(down.x)}, ${r4(down.y)}, ${r2(d.x * r * 0.92)}, ${r2(d.y * r * 0.92)})`;
        spot.style.opacity = String(r4(clamp01(d.z / 0.22)));
      }
    }
    const ghost = ghostRef.current;
    if (ghost) {
      ghost.style.transform = `translate(${r2(t.px - r)}px, ${r2(t.py - r)}px)`;
      ghost.style.opacity = String(r4(t.ghost));
    }
  };

  const stepAll = (dt: number, now: number): boolean => {
    const t = table.current;
    const c = cfg.current;
    if (!t.measured) measure();
    const still = !c.motionSafe;
    // The pointer's own velocity eases off once it stops sending moves.
    if (now - t.pAt > 50) {
      t.pvx *= Math.exp(-dt / 0.04);
      t.pvy *= Math.exp(-dt / 0.04);
    }
    const hits: Hit[] = [];
    let left = still ? 0 : dt;
    while (left > 1e-7) {
      const h = Math.min(1 / 240, left);
      left -= h;
      if (active) cueStrike();
      integrate(h, hits);
    }
    if (still && active && t.pIn) cueStrike();
    // The heaviest few impacts this frame are heard.
    if (t.visitor && activated(t.pressed) && hits.length) {
      hits.sort((a, b) => b.speed - a.speed);
      for (const hit of hits.slice(0, 3)) {
        c.audio.play("clack", {
          pitch: hit.pitch,
          gain: r2(
            clamp(
              hit.speed / (24 * t.r),
              0.06,
              hit.kind === "rail" ? 0.3 : 0.6,
            ),
          ),
          pan: panAt(hit.x),
        });
      }
    }
    let rolling = false;
    let away = false;
    let homing = false;
    for (let i = 0; i < t.n; i += 1) {
      const mode = t.mode[i];
      if (mode === FREE) {
        away = true;
        if (Math.abs(t.vx[i] ?? 0) + Math.abs(t.vy[i] ?? 0) > 0) rolling = true;
      } else if (mode === HOME) {
        homing = true;
        if (still) continue;
        if (now < (t.due[i] ?? 0)) continue;
        // Home along a straight line on the glide spring, rolling upright.
        const k = springs.glide.stiffness / springs.glide.mass;
        const damp = springs.glide.damping / springs.glide.mass;
        let s = t.s[i] ?? 0;
        let sv = t.sv[i] ?? 0;
        let rem = dt;
        while (rem > 1e-7) {
          const h = Math.min(1 / 240, rem);
          rem -= h;
          sv += (-k * (s - 1) - damp * sv) * h;
          s += sv * h;
        }
        t.s[i] = s;
        t.sv[i] = sv;
        const u = clamp01(s);
        t.ox[i] = (t.fx[i] ?? 0) * (1 - s);
        t.oy[i] = (t.fy[i] ?? 0) * (1 - s);
        homeward(t, i, u);
        if (Math.abs(1 - s) < 0.002 && Math.abs(sv) < 0.02) {
          t.mode[i] = RACK;
          t.ox[i] = 0;
          t.oy[i] = 0;
          homeward(t, i, 1);
          if (t.visitor && activated(t.pressed)) {
            c.audio.play("clack", {
              pitch: 1.3,
              gain: 0.1,
              pan: panAt(t.sx[i] ?? 0),
            });
          }
        }
      }
    }
    if (t.cueOn && Math.abs(t.vx[t.n] ?? 0) + Math.abs(t.vy[t.n] ?? 0) > 0) {
      rolling = true;
    }
    // The spread lies still for the delay, then the re-rack begins.
    if (rolling) t.waitUntil = 0;
    else if (away && !homing && t.waitUntil === 0 && t.swapTo === null) {
      t.waitUntil = now + Math.max(0, c.returnDelay);
    }
    if (t.waitUntil && now >= t.waitUntil && !rolling) rerack();
    // The shot cue ball leaves the table as the rack re-forms.
    if (t.cueOn && (homing || (!away && !rolling))) {
      t.cueFade = Math.max(0, t.cueFade - dt / durations.base);
      if (t.cueFade <= 0) t.cueOn = false;
    }
    if (still) {
      // Cross-fade between the rack and the spread.
      if (t.swapTo) {
        let done = true;
        for (let k = 0; k < t.n + 1; k += 1) {
          const goalX = t.swapTo === "rack" ? 0 : (t.ox[k] ?? 0);
          const goalY = t.swapTo === "rack" ? 0 : (t.oy[k] ?? 0);
          const same =
            Math.abs((t.dx[k] ?? 0) - goalX) < 0.5 &&
            Math.abs((t.dy[k] ?? 0) - goalY) < 0.5;
          let f = t.fade[k] ?? 1;
          if (!same) {
            f -= dt / durations.fast;
            if (f <= 0) {
              f = 0;
              t.dx[k] = goalX;
              t.dy[k] = goalY;
            }
            done = false;
          } else if (f < 1) {
            f = Math.min(1, f + dt / durations.base);
            done = false;
          }
          t.fade[k] = f;
        }
        if (done) {
          if (t.swapTo === "rack") {
            for (let i = 0; i < t.n; i += 1) t.mode[i] = RACK;
            t.cueOn = false;
          }
          t.swapTo = null;
        }
      }
      if (t.swapTo === null && away && t.waitUntil === 0) {
        t.waitUntil = now + Math.max(0, c.returnDelay);
      }
    }
    const allHome = !away && !homing && !rolling && t.swapTo === null;
    if (allHome && t.broken) {
      t.broken = false;
      t.cueOn = false;
      t.cueFade = 0;
      c.onRack?.();
    }
    // The ghost cue shows while the pointer moves over the cloth.
    const showGhost = c.cue && active && t.pIn && now - t.pAt < 700;
    t.ghost += ((showGhost ? 0.42 : 0) - t.ghost) * Math.min(1, dt / 0.08);
    if (Math.abs(t.ghost) < 0.004) t.ghost = 0;
    render();
    return (
      rolling ||
      homing ||
      away ||
      t.swapTo !== null ||
      t.ghost > 0 ||
      showGhost ||
      (t.cueOn && t.cueFade > 0) ||
      Math.hypot(t.pvx, t.pvy) > 1
    );
  };

  const frame = (now: number) => {
    raf.current = 0;
    const dt = Math.min(0.05, Math.max(0, (now - last.current) / 1000));
    last.current = now;
    const busy = stepAll(dt, now);
    if (busy && live.current) {
      raf.current = window.requestAnimationFrame((ts) => frameRef.current(ts));
    }
  };

  React.useLayoutEffect(() => {
    cfg.current = {
      force,
      friction,
      returnDelay,
      bounce,
      motionSafe,
      audio,
      line,
      cue,
      onBreak,
      onRack,
    };
    frameRef.current = frame;
    live.current = running;
    api.current = { wake, halt, measure, shoot, rerack };
  });

  React.useLayoutEffect(() => {
    table.current = tableOf(n);
    api.current?.measure();
  }, [n, line]);

  React.useEffect(() => {
    if (running) api.current?.wake();
    else api.current?.halt();
    return () => api.current?.halt();
  }, [running]);

  // A change of reduced motion, size or the cloth while scattered puts the
  // rack back at once.
  React.useEffect(() => {
    api.current?.measure();
    if (table.current.broken) api.current?.rerack(true);
  }, [motionSafe, size]);

  React.useEffect(() => {
    if (disabled) api.current?.rerack(true);
  }, [disabled]);

  const bindCloth = React.useCallback((node: HTMLDivElement | null) => {
    clothRef.current = node;
    if (!node) return;
    const remeasure = () => api.current?.measure();
    const sizer = new ResizeObserver(remeasure);
    sizer.observe(node);
    document.fonts?.addEventListener?.("loadingdone", remeasure);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      setOnScreen(Boolean(entry?.isIntersecting));
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", remeasure);
    };
  }, []);

  const bindSlot = (i: number) => (node: HTMLSpanElement | null) => {
    if (node) slotNodes.current.set(i, node);
    else slotNodes.current.delete(i);
  };
  const bindBall = (i: number) => (node: HTMLSpanElement | null) => {
    if (!node) {
      ballNodes.current.delete(i);
      return;
    }
    ballNodes.current.set(i, {
      node,
      shadow: node.firstElementChild as HTMLElement | null,
      spot: node.querySelector<HTMLElement>("[data-spot]"),
    });
  };

  const pointAt = (clientX: number, clientY: number, timeStamp: number) => {
    const box = clothRef.current;
    const t = table.current;
    if (!box || !active) return;
    const rect = box.getBoundingClientRect();
    const x = clientX - rect.left - box.clientLeft;
    const y = clientY - rect.top - box.clientTop;
    if (t.pIn && timeStamp - t.pAt < 100) {
      const dt = Math.max(1 / 240, (timeStamp - t.pAt) / 1000);
      t.pvx = t.pvx * 0.4 + ((x - t.px) / dt) * 0.6;
      t.pvy = t.pvy * 0.4 + ((y - t.py) / dt) * 0.6;
    } else {
      t.pvx = 0;
      t.pvy = 0;
    }
    t.px = x;
    t.py = y;
    t.pAt = timeStamp;
    t.pIn = true;
    t.visitor = true;
    wake();
  };

  const letGo = () => {
    const t = table.current;
    t.pIn = false;
    t.pvx = 0;
    t.pvy = 0;
    wake();
  };

  const drag = useDrag({
    threshold: 6,
    disabled: !active,
    onMove: ({ point, event }) => {
      if (event.pointerType === "touch")
        pointAt(point.x, point.y, event.timeStamp);
    },
    onEnd: ({ event }) => {
      if (event.pointerType === "touch") letGo();
    },
    onCancel: letGo,
    onTap: (event) => {
      const box = clothRef.current;
      const t = table.current;
      if (!box) return;
      t.pressed = true;
      t.visitor = true;
      const rect = box.getBoundingClientRect();
      const x = event.clientX - rect.left - box.clientLeft;
      const y = event.clientY - rect.top - box.clientTop;
      // Shoot from the tap at the nearest ball still on the cloth.
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < t.n; i += 1) {
        if (t.mode[i] === HOME) continue;
        const d = Math.hypot(
          (t.sx[i] ?? 0) + (t.ox[i] ?? 0) - x,
          (t.sy[i] ?? 0) + (t.oy[i] ?? 0) - y,
        );
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0 || bestD < t.r * 1.2) return;
      // A cue ball sits a ball's width back from the tap along the aim.
      const tx = (t.sx[best] ?? 0) + (t.ox[best] ?? 0);
      const ty = (t.sy[best] ?? 0) + (t.oy[best] ?? 0);
      const a = Math.atan2(ty - y, tx - x);
      shoot(x - Math.cos(a) * t.r, y - Math.sin(a) * t.r, best);
      if (event.pointerType === "touch") letGo();
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLSpanElement>) => {
    const t = table.current;
    t.pressed = true;
    t.visitor = true;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (t.n === 0) return;
      // Break from the left: a cue ball off the bottom-left of the cloth at
      // the first ball, cutting into the rack.
      shoot(t.r * 1.3, Math.max(t.r * 1.3, t.h - t.r * 1.3), 0);
    } else if (event.key === "Escape") {
      if (!t.broken) return;
      event.preventDefault();
      rerack();
    }
  };

  const Tag = as;
  const D = `${size}em`;
  const ball = (colour: string) =>
    `radial-gradient(circle at 34% 30%, color-mix(in oklab, ${colour}, white 42%) 0%, ${colour} 40%, color-mix(in oklab, ${colour}, black 48%) 100%)`;

  return (
    <div className={cn("relative", className)}>
      <div
        className="relative rounded-[0.42em] p-[0.34em] shadow-[0_0.1em_0.25em_oklch(0_0_0/0.25),0_0.6em_1.2em_-0.6em_oklch(0_0_0/0.45)]"
        style={{ background: RAIL }}
      >
        {/* Sights on the rails: mother-of-pearl, every eighth of the long rails and quarter of the short. */}
        {[12.5, 25, 37.5, 50, 62.5, 75, 87.5].map((at) => (
          <React.Fragment key={at}>
            <span
              aria-hidden
              className="absolute top-[0.13em] block size-[0.08em] -translate-x-1/2 rounded-full bg-[oklch(0.92_0.02_90)] opacity-80"
              style={{ left: `${at}%` }}
            />
            <span
              aria-hidden
              className="absolute bottom-[0.13em] block size-[0.08em] -translate-x-1/2 rounded-full bg-[oklch(0.92_0.02_90)] opacity-80"
              style={{ left: `${at}%` }}
            />
          </React.Fragment>
        ))}
        <div
          ref={bindCloth}
          className={cn(
            "relative overflow-clip rounded-[0.16em] [contain:paint]",
            active && "touch-pan-y",
            active && cue && "cursor-crosshair",
          )}
          style={{
            backgroundColor: felt.felt,
            backgroundImage: `radial-gradient(ellipse 70% 90% at 50% 42%, oklch(1 0 0 / 0.12), transparent 72%), radial-gradient(ellipse at center, transparent 55%, oklch(0 0 0 / 0.22)), ${NAP}`,
            backgroundSize: "auto, auto, 140px 140px",
            boxShadow: `inset 0 0 0 0.1em ${felt.cushion}, inset 0 0.16em 0.22em -0.06em oklch(0 0 0 / 0.35)`,
          }}
          onPointerDown={(event) => {
            drag.onPointerDown(event);
            table.current.pressed = true;
          }}
          onPointerMove={(event) => {
            drag.onPointerMove(event);
            if (event.pointerType === "touch") return;
            pointAt(event.clientX, event.clientY, event.timeStamp);
          }}
          onPointerUp={drag.onPointerUp}
          onPointerCancel={(event) => {
            drag.onPointerCancel(event);
            letGo();
          }}
          onLostPointerCapture={drag.onLostPointerCapture}
          onPointerLeave={(event) => {
            if (event.pointerType !== "touch") letGo();
          }}
        >
          <Tag className="m-0 block">
            <span className="sr-only">{line}</span>
            <span
              aria-hidden
              className="flex flex-wrap items-center justify-center gap-x-[0.5em] gap-y-[0.14em] px-[1em] py-[1.05em] select-none"
            >
              {model.words.map((word, w) => (
                <span key={w} className="flex gap-[0.03em]">
                  {word.map((i) => {
                    const colour = colours[i % colours.length] ?? IVORY;
                    return (
                      <span
                        key={i}
                        ref={bindSlot(i)}
                        className="relative block shrink-0"
                        style={{ width: D, height: D }}
                      >
                        <span
                          ref={bindBall(i)}
                          className="absolute inset-0 block will-change-transform"
                        >
                          <span className="absolute -inset-[4%] block rounded-full bg-[radial-gradient(closest-side,oklch(0.1_0.03_150/0.55),oklch(0.1_0.03_150/0.25)_60%,transparent)]" />
                          <span
                            className="absolute inset-0 block overflow-hidden rounded-full"
                            style={{ background: ball(colour) }}
                          >
                            <span
                              data-spot
                              className="absolute top-[22%] left-[22%] flex size-[56%] items-center justify-center rounded-full font-bold"
                              style={{
                                background: IVORY,
                                color: INK,
                                fontSize: `${r2(size * 0.42)}em`,
                                lineHeight: 1,
                              }}
                            >
                              {model.letters[i]}
                            </span>
                            <span className="absolute inset-0 block rounded-full bg-[radial-gradient(circle_at_32%_26%,oklch(1_0_0/0.7)_0%,oklch(1_0_0/0)_22%)]" />
                          </span>
                        </span>
                      </span>
                    );
                  })}
                </span>
              ))}
            </span>
          </Tag>
          {/* The shot cue ball, for taps and the keyboard's break. */}
          <span
            ref={cueRef}
            aria-hidden
            className="pointer-events-none absolute block will-change-transform"
            style={{
              width: D,
              height: D,
              left: 0,
              top: 0,
              opacity: 0,
              translate: `calc(${D} / -2) calc(${D} / -2)`,
            }}
          >
            <span className="absolute -inset-[4%] block rounded-full bg-[radial-gradient(closest-side,oklch(0.1_0.03_150/0.55),oklch(0.1_0.03_150/0.25)_60%,transparent)]" />
            <span
              className="absolute inset-0 block rounded-full"
              style={{ background: ball(IVORY) }}
            >
              <span
                data-spot
                className="absolute top-[40%] left-[40%] block size-[20%] rounded-full bg-[oklch(0.55_0.17_25)]"
              />
            </span>
          </span>
          {/* The pointer's ghost cue ball. */}
          <span
            ref={ghostRef}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 block rounded-full border border-[oklch(1_0_0/0.6)]"
            style={{
              width: D,
              height: D,
              opacity: 0,
              background: `radial-gradient(circle at 34% 30%, oklch(1 0 0 / 0.85), oklch(0.95 0.02 90 / 0.5) 60%, oklch(0.8 0.02 90 / 0.3))`,
            }}
          />
        </div>
      </div>
      {interactive ? (
        <>
          <span
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label="Break the rack"
            aria-describedby={hintId}
            aria-disabled={disabled || undefined}
            onKeyDown={disabled ? undefined : onKeyDown}
            className="pointer-events-none absolute inset-0 rounded-[0.42em] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          />
          <span id={hintId} className="sr-only">
            Press Enter to break from the left and Escape to re-rack; sweeping
            the pointer through the balls strikes them like a cue ball.
          </span>
        </>
      ) : null}
    </div>
  );
}
