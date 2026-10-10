"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type TideLinesColor = "cobalt" | "signal" | "ink" | "coral";

export type TideLinesProps = {
  /** The content on top of the water: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many lines of water are stacked from the horizon to the shore, 12 to 64. @default 36 */
  lines?: number;
  /** How high the swell runs, 0 (glassy) to 1 (big surf). @default 0.5 */
  height?: number;
  /** The lines' colour: a named token or any CSS colour. @default "cobalt" */
  color?: TideLinesColor | (string & {});
  /** How fast the swell rolls in, 0 (still) to 2. @default 1 */
  speed?: number;
  /** The swell's wavelength along the shore, px at the front line. @default 260 */
  period?: number;
  /** Foam at the crests and spray where waves break, 0 (none) to 1. @default 0.6 */
  foam?: number;
  /** Where the farthest line sits, as a share of the height from the top, 0 to 0.6. @default 0.18 */
  horizon?: number;
  /** The front line's width, px; far lines are finer. @default 1.6 */
  weight?: number;
  /** The water's ground, behind and between the lines. @default "var(--background)" */
  ground?: string;
  /** The pointer raises the swell and a press sends in a set; keyboard focus inside sends one too. @default true */
  interactive?: boolean;
  /** How much the hand raises the swell and how big a set it sends, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the hand's wind reaches, px. @default 180 */
  radius?: number;
  /** Hold the water still; the hand and sets still move it. @default false */
  paused?: boolean;
  /** Seeds the swell, so two seas never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) raising the swell. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press or keyboard focus sends in a set. */
  onSet?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Line colours from tokens, so the lines keep their contrast on a light page and a dark one. */
const COLORS: Record<TideLinesColor, string> = {
  cobalt: "var(--accent-bright)",
  signal: "var(--signal)",
  ink: "var(--foreground)",
  coral: "oklch(from var(--danger) l calc(c * 0.75) calc(h + 14))",
};

/** A crest of foam is the line's colour pulled toward the ink: pale on dark, inked on light. */
const foamOf = (line: string) =>
  `color-mix(in oklab, ${line} 30%, var(--foreground))`;

const STEP = 1 / 120;
/** The hand's place follows on glide and its wind arrives on drift. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/** Depths of the farthest and nearest lines, in the sea's own units. */
const Z_FAR = 8;
const Z_NEAR = 1;
/** The swell's wavelength toward the shore, in depth units. */
const SWELL_Z = 1.6;
/** A set runs toward the shore at this many depth units a second. */
const SET_SPEED = 3.4;
const SETS = 3;
const SPRAY = 72;
/** Reduced motion: how long a set's still frame holds, ms. */
const SET_HOLD = 1400;
/** CSS px between samples along a line. */
const SAMPLE = 6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Rgb = readonly [number, number, number];

function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

const mixRgb = (a: Rgb, b: Rgb, t: number) =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(a[1] + (b[1] - a[1]) * t)}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;

/** A small integer hash, unsigned: the same flecks every visit. */
const hash = (a: number, b: number, c: number) => {
  let h =
    Math.imul(a, 374761393) ^
    Math.imul(b, 668265263) ^
    Math.imul(c, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

type Config = {
  lines: number;
  height: number;
  colorKey: string;
  speed: number;
  period: number;
  foam: number;
  horizon: number;
  weight: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onSet: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  sendSet: (x: number, y: number, strength: number) => void;
  dispose: () => void;
};

type Swell = {
  /** Per train: amplitude share, heading (rad), along-shore and toward-shore frequency, angular speed, phase. */
  a: Float32Array;
  heading: Float32Array;
  fz: Float32Array;
  w: Float32Array;
  phase: Float32Array;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let active = false;
  let holdTimer = 0;
  const read = rgbReader();
  const size = { w: 0, h: 0, dpr: 1 };
  let ground = "rgb(0, 0, 0)";
  /** Per line, back to front: its stroke colour and its foam colour. */
  let strokes: string[] = [];
  let foams: string[] = [];
  let sprayColour = "rgb(255, 255, 255)";
  let rows = 0;
  let cols = 0;
  /** Each line's resting screen y and depth, and its samples' y this frame. */
  let base = new Float32Array(0);
  let depth = new Float32Array(0);
  let ys = new Float32Array(0);
  let crest = new Float32Array(0);
  const swell: Swell = {
    a: new Float32Array(3),
    heading: new Float32Array(3),
    fz: new Float32Array(3),
    w: new Float32Array(3),
    phase: new Float32Array(3),
  };
  const sim = { t: 0, lean: 0, leanV: 0 };
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };
  /** Per set: x (px), depth now, strength, age after breaking (s, -1 before). */
  const sets = new Float32Array(SETS * 4);
  let setNext = 0;
  /** Per drop of spray: x, y, vx, vy, life (s left). */
  const spray = new Float32Array(SPRAY * 5);
  let sprayNext = 0;

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const ctx = () => canvas.getContext("2d");

  const placeAt = (c: Config) => {
    const rand = lcg(c.seed * 19 + 3);
    const main = (rand() - 0.5) * 0.5;
    const shares = [1, 0.5, 0.22];
    const offsets = [
      0,
      (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.2),
      (rand() - 0.5) * 1.6,
    ];
    const fzs = [1 / SWELL_Z, 1.37 / SWELL_Z, 2.9 / SWELL_Z];
    const periods = [2.6, 2.1, 1.1];
    for (let k = 0; k < 3; k += 1) {
      swell.a[k] = shares[k] ?? 0;
      swell.heading[k] = main + (offsets[k] ?? 0);
      swell.fz[k] = fzs[k] ?? 1;
      swell.w[k] = (Math.PI * 2) / (periods[k] ?? 2);
      swell.phase[k] = rand() * Math.PI * 2;
    }
    sim.t = 10 + rand() * 50;
  };

  /** Rows, samples and each row's colours, for this size and these props. */
  const layOut = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    rows = clamp(Math.round(c.lines), 12, 64);
    cols = Math.ceil(size.w / SAMPLE) + 2;
    base = new Float32Array(rows);
    depth = new Float32Array(rows);
    ys = new Float32Array(rows * cols);
    crest = new Float32Array(rows * cols);
    const y0 = clamp(c.horizon, 0, 0.6) * size.h;
    const y1 = size.h * 0.97;
    for (let j = 0; j < rows; j += 1) {
      const z = Z_FAR - ((Z_FAR - Z_NEAR) * j) / (rows - 1);
      depth[j] = z;
      const s = (1 / z - 1 / Z_FAR) / (1 / Z_NEAR - 1 / Z_FAR);
      base[j] = y0 + (y1 - y0) * s;
    }
  };

  const paintColours = () => {
    const kids = carriers.children;
    const g = read(getComputedStyle(kids[0] ?? root).color);
    const line = read(getComputedStyle(kids[1] ?? root).color);
    const foam = read(getComputedStyle(kids[2] ?? root).color);
    ground = `rgb(${g[0]}, ${g[1]}, ${g[2]})`;
    strokes = [];
    foams = [];
    for (let j = 0; j < rows; j += 1) {
      const s = rows > 1 ? j / (rows - 1) : 1;
      // Far water is mostly ground; near water carries the full colour.
      strokes.push(mixRgb(g, line, 0.22 + 0.78 * Math.pow(s, 1.15)));
      foams.push(mixRgb(g, foam, 0.3 + 0.7 * Math.pow(s, 0.9)));
    }
    sprayColour = mixRgb(g, foam, 0.9);
  };

  /** The water's height at sample (i, j), in the swell's own units: about -1 to 1, peaked crests. */
  const surface = () => {
    const c = cfg;
    if (!c) return;
    const t = sim.t;
    const per = clamp(c.period, 60, 2000);
    const cx = size.w / 2;
    const R = clamp(c.radius, 30, Math.max(30, Math.min(size.w, size.h) * 0.9));
    const strength = clamp(c.pointerStrength, 0, 1);
    const lift = hand.amount;
    const norm =
      1 / ((swell.a[0] ?? 1) + (swell.a[1] ?? 0) + (swell.a[2] ?? 0));
    for (let j = 0; j < rows; j += 1) {
      const z = depth[j] ?? 1;
      const by = base[j] ?? 0;
      const persp = Z_NEAR / z;
      for (let i = 0; i < cols; i += 1) {
        const x = (i - 1) * SAMPLE;
        const X = ((x - cx) / per) * (z / Z_NEAR);
        let e = 0;
        for (let k = 0; k < 3; k += 1) {
          const hd = (swell.heading[k] ?? 0) + sim.lean * (k === 0 ? 1 : 0.6);
          const fz = swell.fz[k] ?? 1;
          const arg =
            Math.PI * 2 * (X * Math.sin(hd) + z * fz * Math.cos(hd)) +
            (swell.w[k] ?? 1) * t +
            (swell.phase[k] ?? 0);
          // A cusped wave: long troughs, peaked crests.
          const s = Math.pow(0.5 + 0.5 * Math.sin(arg), 1.6) * 2 - 1;
          // Far off, a train whose ripples along the line would fall
          // between samples is let go rather than aliased into fuzz.
          const across = Math.abs(Math.sin(hd)) * (z / Z_NEAR) * SAMPLE * 7;
          const keep =
            1 - Math.min(1, Math.max(0, (across / per - 0.35) / 0.4));
          e += (swell.a[k] ?? 0) * s * keep;
        }
        e *= norm;
        // The hand is a wind: the swell rises in a broad mound around it.
        if (lift > 0.001) {
          const dx = x - hand.px;
          const dy = by - hand.py;
          e *=
            1 +
            1.3 * lift * strength * Math.exp(-(dx * dx + dy * dy) / (R * R));
        }
        // Sets: one long wave each, rolling toward the shore.
        for (let n = 0; n < SETS; n += 1) {
          const amt = sets[n * 4 + 2] ?? 0;
          if (amt <= 0) continue;
          const zs = sets[n * 4 + 1] ?? 0;
          const broke = sets[n * 4 + 3] ?? -1;
          const dz = (z - zs) / 0.42;
          if (dz > 3 || dz < -3) continue;
          const xs = sets[n * 4] ?? 0;
          const spread = per * (0.5 + 0.22 * (Z_FAR - zs));
          const dxs = (x - xs) / spread;
          const fall = broke < 0 ? 1 : Math.exp(-broke / 0.25);
          e += 2 * amt * fall * Math.exp(-dz * dz) * Math.exp(-dxs * dxs);
        }
        const k = j * cols + i;
        crest[k] = e;
        ys[k] = by - e * persp * amp();
      }
    }
  };

  /** The swell's height in px at the front line. */
  const amp = () => {
    const c = cfg;
    if (!c) return 0;
    return clamp(c.height, 0, 1) * size.h * 0.26;
  };

  const draw = () => {
    const c = cfg;
    const g = ctx();
    if (!c || !g || !visible.current || size.w < 1 || rows < 1) return;
    surface();
    const { w, h, dpr } = size;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = ground;
    g.fillRect(0, 0, w, h);
    const A = amp();
    const foamAmt = clamp(c.foam, 0, 1);
    const weight = clamp(c.weight, 0.25, 6);
    const spacing =
      rows > 1 ? ((base[rows - 1] ?? h) - (base[0] ?? 0)) / (rows - 1) : h;
    g.lineJoin = "round";
    g.lineCap = "round";
    for (let j = 0; j < rows; j += 1) {
      const z = depth[j] ?? 1;
      const persp = Z_NEAR / z;
      const s = rows > 1 ? j / (rows - 1) : 1;
      // Water fills down from each line to as low as this line can ever
      // reach, hiding the farther water behind it.
      const floor = (base[j] ?? 0) + A * persp * 1.6 + 2;
      g.beginPath();
      g.moveTo(-SAMPLE, floor);
      for (let i = 0; i < cols; i += 1) {
        g.lineTo((i - 1) * SAMPLE, ys[j * cols + i] ?? 0);
      }
      g.lineTo((cols - 1) * SAMPLE, floor);
      g.closePath();
      g.fillStyle = ground;
      g.fill();
      g.beginPath();
      for (let i = 0; i < cols; i += 1) {
        const y = ys[j * cols + i] ?? 0;
        if (i === 0) g.moveTo((i - 1) * SAMPLE, y);
        else g.lineTo((i - 1) * SAMPLE, y);
      }
      g.lineWidth = Math.min(
        weight * (0.3 + 0.7 * s),
        Math.max(0.5, spacing * persp * 0.9 + 0.4),
      );
      g.strokeStyle = strokes[j] ?? ground;
      g.stroke();
      // Foam flecks ride the crests: sparse at sea, thick where waves break.
      if (foamAmt > 0) {
        const thr = 0.62 - 0.22 * s;
        g.beginPath();
        let any = false;
        for (let i = 0; i < cols; i += 1) {
          const k = j * cols + i;
          const e = crest[k] ?? 0;
          if (e < thr) continue;
          const dense = (e - thr) * foamAmt * (1.4 + 2.2 * s);
          for (let f = 0; f < 3; f += 1) {
            const r = hash(i, j, f + 7);
            if (r > dense) continue;
            const fx =
              (i - 1) * SAMPLE + (hash(i, j, f + 31) - 0.5) * SAMPLE * 1.6;
            const fy =
              (ys[k] ?? 0) - (0.6 + hash(i, j, f + 53) * 3.2) * (0.4 + persp);
            const fr = (0.4 + 0.8 * persp) * (0.6 + r * 0.8);
            g.rect(fx - fr / 2, fy - fr / 2, fr, fr);
            any = true;
          }
        }
        if (any) {
          g.fillStyle = foams[j] ?? ground;
          g.fill();
        }
      }
    }
    // Spray hanging over a breaking set.
    let anySpray = false;
    g.beginPath();
    for (let n = 0; n < SPRAY; n += 1) {
      const life = spray[n * 5 + 4] ?? 0;
      if (life <= 0) continue;
      const r = 0.8 + life * 1.4;
      g.rect(
        (spray[n * 5] ?? 0) - r / 2,
        (spray[n * 5 + 1] ?? 0) - r / 2,
        r,
        r,
      );
      anySpray = true;
    }
    if (anySpray) {
      g.fillStyle = sprayColour;
      g.globalAlpha = 0.85;
      g.fill();
      g.globalAlpha = 1;
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** A set's crest whitens and throws spray when it breaks on the front rows. */
  const breakSet = (n: number) => {
    const c = cfg;
    if (!c) return;
    const foamAmt = clamp(c.foam, 0, 1);
    const count = Math.round(26 * foamAmt * (sets[n * 4 + 2] ?? 0));
    const xs = sets[n * 4] ?? 0;
    const per = clamp(c.period, 60, 2000);
    const front = base[rows - 1] ?? size.h;
    for (let k = 0; k < count; k += 1) {
      const i = sprayNext;
      sprayNext = (sprayNext + 1) % SPRAY;
      const r1 = hash(k, n, setNext + 101);
      const r2 = hash(k, n, setNext + 211);
      spray[i * 5] = xs + (r1 - 0.5) * per * 1.2;
      spray[i * 5 + 1] = front - amp() * 1.2;
      spray[i * 5 + 2] = (r2 - 0.5) * 60;
      spray[i * 5 + 3] = -(60 + r1 * 120);
      spray[i * 5 + 4] = 0.6 + r2 * 0.5;
    }
  };

  /** Advances the swell, the hand, the sets and the spray. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const want = hand.present && c.interactive ? 1 : 0;
    const lean =
      hand.present && c.interactive && size.w > 0
        ? (hand.x / size.w - 0.5) * 0.5 * clamp(c.pointerStrength, 0, 1)
        : 0;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (hand.x - hand.px) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (hand.y - hand.py) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.px += hand.vx * h;
      hand.py += hand.vy * h;
      hand.amountV +=
        ((DRIFT.stiffness * (want - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount += hand.amountV * h;
      sim.leanV +=
        ((DRIFT.stiffness * (lean - sim.lean) - DRIFT.damping * sim.leanV) /
          DRIFT.mass) *
        h;
      sim.lean += sim.leanV * h;
    }
    const handMoving =
      Math.abs(hand.x - hand.px) + Math.abs(hand.y - hand.py) > 0.1 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5;
    if (!handMoving) {
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
    }
    const arriving =
      Math.abs(want - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = want;
      hand.amountV = 0;
    }
    const leaning =
      Math.abs(lean - sim.lean) > 0.0005 || Math.abs(sim.leanV) > 0.001;
    if (!leaning) {
      sim.lean = lean;
      sim.leanV = 0;
    }
    if ((handMoving && hand.amount > 0.001) || arriving || leaning)
      moving = true;
    for (let n = 0; n < SETS; n += 1) {
      const amt = sets[n * 4 + 2] ?? 0;
      if (amt <= 0) continue;
      moving = true;
      const zs =
        (sets[n * 4 + 1] ?? 0) -
        SET_SPEED * dt * (0.55 + 0.45 * clamp(c.speed, 0, 2));
      sets[n * 4 + 1] = zs;
      const broke = sets[n * 4 + 3] ?? -1;
      if (broke < 0 && zs < Z_NEAR + 0.35) {
        sets[n * 4 + 3] = 0;
        breakSet(n);
      } else if (broke >= 0) {
        sets[n * 4 + 3] = broke + dt;
        if (broke > 1.2) sets[n * 4 + 2] = 0;
      }
    }
    for (let n = 0; n < SPRAY; n += 1) {
      const life = spray[n * 5 + 4] ?? 0;
      if (life <= 0) continue;
      moving = true;
      spray[n * 5 + 3] = (spray[n * 5 + 3] ?? 0) + 380 * dt;
      spray[n * 5] = (spray[n * 5] ?? 0) + (spray[n * 5 + 2] ?? 0) * dt;
      spray[n * 5 + 1] = (spray[n * 5 + 1] ?? 0) + (spray[n * 5 + 3] ?? 0) * dt;
      spray[n * 5 + 4] = life - dt;
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c) {
      last = 0;
      return;
    }
    // Rolling alone, the sea is slow enough for thirty frames a second; the
    // hand and a set get every frame.
    const calm =
      !hand.present &&
      hand.amount === 0 &&
      sets[2] === 0 &&
      sets[6] === 0 &&
      sets[10] === 0 &&
      sim.leanV === 0;
    if (calm && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : false;
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: the hand's mound lands where it is, at once. */
  const still = () => {
    const c = cfg;
    if (!c || c.motionSafe) return;
    hand.px = hand.x;
    hand.py = hand.y;
    hand.amount = hand.present && c.interactive ? 1 : 0;
    hand.amountV = 0;
    sim.lean =
      hand.present && c.interactive && size.w > 0
        ? (hand.x / size.w - 0.5) * 0.5 * clamp(c.pointerStrength, 0, 1)
        : 0;
    sim.leanV = 0;
    spray.fill(0);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    layOut();
    paintColours();
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was || was.seed !== next.seed) placeAt(next);
      if (!was) {
        resize();
        still();
        draw();
        kick();
        return;
      }
      if (was.dpr !== next.dpr) resize();
      if (was.lines !== next.lines || was.horizon !== next.horizon) {
        layOut();
        paintColours();
      } else if (was.colorKey !== next.colorKey) paintColours();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      still();
      draw();
      kick();
    },
    resize,
    readColours() {
      paintColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    handTo(x, y, source) {
      if (!hand.present || hand.amount < 0.01) {
        hand.px = x;
        hand.py = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      still();
      draw();
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      still();
      draw();
      kick();
    },
    sendSet(x, y, strength) {
      const c = cfg;
      if (!c || rows < 1) return;
      c.onSet();
      // The set is born at the depth under the press, never in the front rows.
      const y0 = base[0] ?? 0;
      const y1 = base[rows - 1] ?? size.h;
      const s = clamp((y - y0) / Math.max(1, y1 - y0), 0, 0.6);
      const zs = 1 / (1 / Z_FAR + s * (1 / Z_NEAR - 1 / Z_FAR));
      const n = setNext;
      setNext = (setNext + 1) % SETS;
      sets[n * 4] = x;
      sets[n * 4 + 2] =
        (0.45 + 0.55 * clamp(c.pointerStrength, 0, 1)) * strength;
      if (c.motionSafe) {
        sets[n * 4 + 1] = Math.max(zs, Z_NEAR + 1.5);
        sets[n * 4 + 3] = -1;
        kick();
        return;
      }
      // Reduced motion: the set at its break, held as one still frame.
      sets[n * 4 + 1] = Z_NEAR + 0.5;
      sets[n * 4 + 3] = -1;
      draw();
      window.clearTimeout(holdTimer);
      holdTimer = window.setTimeout(() => {
        sets.fill(0);
        draw();
      }, SET_HOLD);
    },
    dispose() {
      disposed = true;
      window.clearTimeout(holdTimer);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * A background of surf seen from a cliff: many parallel lines stacked in
 * depth from a horizon to the shore, with the content on top in its own
 * layer. Rows bunch toward the horizon by perspective; each line is the
 * water along one depth — three seeded swell trains, cusped so crests are
 * peaked and troughs long — and shoals as it comes in, so the front lines
 * run higher, brighter and thicker. Every line hides the water behind it,
 * and foam rides the crests, thickest where waves break.
 *
 * The hand is a wind: the swell rises in a broad mound under it, its place
 * following on glide and its strength arriving on drift, and the swell's
 * heading leans toward its side. A press sends in a set — one long wave born
 * at the depth under the press that rolls to the shore, lifting every line it
 * passes, and breaks in a burst of spray. Keyboard focus on a control inside
 * sends a set from behind it. Canvas 2D, thirty frames a second while it only
 * rolls; nothing runs off screen, in a hidden page, or when paused and still.
 * Under reduced motion one still frame is drawn, the mound lands where the
 * hand is, and a set shows as one still frame at its break.
 */
export function TideLines({
  children,
  lines = 36,
  height = 0.5,
  color = "cobalt",
  speed = 1,
  period = 260,
  foam = 0.6,
  horizon = 0.18,
  weight = 1.6,
  ground = "var(--background)",
  interactive = true,
  pointerStrength = 0.6,
  radius = 180,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onSet,
  className,
}: TideLinesProps) {
  const motionSafe = useMotionSafe();
  const line = COLORS[color as TideLinesColor] ?? color;
  const paints = React.useMemo(
    () => [ground, line, foamOf(line)],
    [ground, line],
  );
  const colorKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onSet });

  const config: Config = {
    lines,
    height,
    colorKey,
    speed,
    period,
    foam,
    horizon,
    weight,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onSet: () => report.current.onSet?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onSet };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Size and sighting, bound to the node when it arrives.
  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A press on a control is the control's; only open water sends a set.
    if (!hit || !rootRef.current?.contains(hit))
      engine.current?.sendSet(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside raises the swell there and sends a set.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.sendSet(at.x, at.y, 0.7);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        // A sideways finger is the wind on the water; an upright swipe
        // scrolls the page.
        "group/tide-lines relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{ backgroundColor: ground }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/tide-lines:opacity-0"
        style={standIn(paints[1] ?? line, horizon)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: calm
 * lines, fine and close under the horizon, opening out toward the shore.
 */
function standIn(line: string, horizon: number): React.CSSProperties {
  const top = Math.round(clamp(horizon, 0, 0.6) * 100);
  const mid = Math.round(top + (100 - top) * 0.35);
  const low = Math.round(top + (100 - top) * 0.7);
  // A band of evenly ruled lines from `from` % to `to` % of the height; a
  // percentage position is a share of the room left over, hence the sum.
  const band = (from: number, to: number, gap: number, k: number) => {
    const at = Math.round((from / Math.max(1, 100 - (to - from))) * 1000) / 10;
    return `repeating-linear-gradient(180deg, transparent 0 ${gap - 1}px, color-mix(in oklab, ${line} ${k}%, transparent) ${gap - 1}px ${gap}px) 0 ${at}% / 100% ${to - from}% no-repeat`;
  };
  return {
    background: [
      band(top, mid, 4, 30),
      band(mid, low, 8, 55),
      band(low, 100, 13, 85),
    ].join(", "),
  };
}
