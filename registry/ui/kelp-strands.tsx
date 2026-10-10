"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { cn } from "@/registry/lib/utils";

export type KelpStrandsProps = {
  /** Content laid over the bed, such as a headline. It stays fully interactive; the strands never take a click. */
  children?: React.ReactNode;
  /** How many strands grow across the box. @default 28 */
  count?: number;
  /** The strength of the slow current that sways the bed, 0 (still water) to 1 (a strong swell). @default 0.5 */
  current?: number;
  /** How upright and springy the strands are, 0 (limp, trailing long behind a wake) to 1 (stalks that snap back). @default 0.5 */
  stiffness?: number;
  /** Depth rows, 1 to 3: rows further back are shorter, fainter and slower. @default 3 */
  rows?: number;
  /** How far up the box the tallest strands reach, 0 to 1. @default 0.8 */
  height?: number;
  /** The root width of a front-row strand, in CSS pixels. @default 5 */
  width?: number;
  /** How hard the pointer pushes the water, 0 (not at all) to 1. @default 0.6 */
  wake?: number;
  /** How far the pointer's push reaches, in CSS pixels. @default 70 */
  radius?: number;
  /** The base and tip colours, any CSS colours resolved on the element. @default pigments of --success and --signal */
  colors?: [string, string];
  /** A small gas float at the tip of each strand. @default true */
  floats?: boolean;
  /** Faint specks drifting with the current. @default 12 */
  motes?: number;
  /** Keyboard focus inside parts the strands around the focused element. @default true */
  followFocus?: boolean;
  /** The pointer (and a sideways swipe) pushes through the strands. @default true */
  interactive?: boolean;
  /** Holds the bed still and stops the loop. @default false */
  paused?: boolean;
  /** Seed for where every strand grows, how tall it is and how it sways. @default 4 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Classes for the box. Give it a height; children are laid out inside it. */
  className?: string;
};

type Rgb = [number, number, number];

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

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const TAU = Math.PI * 2;

const hash = (i: number, seed: number) => {
  let h = (Math.imul(i, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Points per strand, root included. */
const PTS = 11;
const SEG = PTS - 1;
/** Eddies the hand leaves in the water, recycled. */
const EDDIES = 12;
const EDDY_LIFE = 0.9;
/** The water's flow at full current, px/s. */
const FLOW = 130;
/** How fast a strand is dragged toward the water's velocity, per second. */
const COUPLING = 2.6;
/** Upward pull toward the tip, px/s². */
const BUOYANCY = 200;
/** Depth rows, back to front: height, width, opacity, response. */
const ROWS = [
  { height: 0.62, width: 0.55, alpha: 0.42, response: 0.55 },
  { height: 0.8, width: 0.75, alpha: 0.7, response: 0.8 },
  { height: 1, width: 1, alpha: 1, response: 1 },
] as const;

/**
 * A bed of kelp anchored along the bottom of its box. Every strand is a
 * Verlet chain of eleven points with a fixed root, buoyant toward the tip,
 * held upright by a bending constraint whose strength is `stiffness`, and
 * dragged toward the velocity of the water around it — so it sways as a
 * slow swell rolls across the bed, and when the pointer passes through, the
 * water it pushes carries the strands aside: they part around the hand, the
 * eddies it leaves behind keep curling them for a second, and they spring
 * back. Strands stand in up to three depth rows (further back is shorter,
 * fainter and slower), each a tapered ribbon shaded from base to tip with a
 * small float at its end. Keyboard focus inside parts the strands around
 * the focused element. Under reduced motion the bed is a still frame,
 * leaning gently with the mean current.
 */
export function KelpStrands({
  children,
  count = 28,
  current = 0.5,
  stiffness = 0.5,
  rows = 3,
  height = 0.8,
  width = 5,
  wake = 0.6,
  radius = 70,
  colors,
  floats = true,
  motes = 12,
  followFocus = true,
  interactive = true,
  paused = false,
  seed = 4,
  dpr = 2,
  className,
}: KelpStrandsProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);

  const baseColor = colors?.[0] ?? "oklch(from var(--success) 0.52 0.1 h)";
  const tipColor = colors?.[1] ?? "oklch(from var(--signal) 0.8 0.11 h)";
  const strands = Math.round(clamp(count, 1, 120));
  const depthRows = Math.round(clamp(rows, 1, 3));
  const specks = Math.round(clamp(motes, 0, 60));

  const params = React.useRef({
    current,
    stiffness,
    height,
    width,
    wake,
    radius,
    baseColor,
    tipColor,
    floats,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
  });
  React.useEffect(() => {
    params.current = {
      current,
      stiffness,
      height,
      width,
      wake,
      radius,
      baseColor,
      tipColor,
      floats,
      interactive,
      paused,
      seed,
      dpr,
      motionSafe,
    };
  });

  const api = React.useRef<{
    point: (x: number, y: number, t: number) => void;
    leave: () => void;
    focus: (node: HTMLElement | null) => void;
    rebuild: () => void;
    restyle: () => void;
    wake: () => void;
  } | null>(null);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const g = ctx;
    const read = rgbReader();

    let w = 0;
    let h = 0;
    let ratio = 1;
    let raf = 0;
    let last = 0;
    let inView = false;
    let clock = 0;
    let calm = 0;

    const N = strands;
    // Strand geometry and state, flat: rebuilt on resize, never per frame.
    const rootX = new Float32Array(N);
    const length = new Float32Array(N);
    const rowOf = new Uint8Array(N);
    const phase = new Float32Array(N);
    const px = new Float32Array(N * PTS);
    const py = new Float32Array(N * PTS);
    const ox = new Float32Array(N * PTS);
    const oy = new Float32Array(N * PTS);
    const order = new Uint16Array(N);
    const fills: (CanvasGradient | string)[] = new Array(N).fill("transparent");
    // Ribbon edges, reused every frame.
    const lx = new Float32Array(PTS);
    const ly = new Float32Array(PTS);
    const rx = new Float32Array(PTS);
    const ry = new Float32Array(PTS);
    // The hand and what it leaves behind.
    const hand = { x: 0, y: 0, vx: 0, vy: 0, t: 0, on: false };
    const ex = new Float32Array(EDDIES);
    const ey = new Float32Array(EDDIES);
    const evx = new Float32Array(EDDIES);
    const evy = new Float32Array(EDDIES);
    const eAge = new Float32Array(EDDIES).fill(EDDY_LIFE);
    let eNext = 0;
    let lastDrop = 0;
    const part = { x: 0, y: 0, hw: 0, hh: 0, on: false };
    let partNode: HTMLElement | null = null;
    // Motes.
    const M = specks;
    const mx = new Float32Array(M);
    const my = new Float32Array(M);
    const mr = new Float32Array(M);

    let tipFill = "rgb(160, 220, 200)";
    let baseRgb: Rgb = [40, 120, 90];
    let tipRgb: Rgb = [160, 220, 200];

    const placeFocus = (node: HTMLElement) => {
      const a = root.getBoundingClientRect();
      const b = node.getBoundingClientRect();
      part.x = b.left + b.width / 2 - a.left;
      part.y = b.top + b.height / 2 - a.top;
      part.hw = b.width / 2 + 18;
      part.hh = b.height / 2 + 18;
    };

    const gradients = () => {
      const rgba = (c: Rgb, a: number) =>
        `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.round(a * 1000) / 1000})`;
      tipFill = rgba(tipRgb, 1);
      for (let s = 0; s < N; s += 1) {
        const row = ROWS[3 - depthRows + rowOf[s]!] ?? ROWS[2];
        const grad = g.createLinearGradient(0, h, 0, h - length[s]!);
        grad.addColorStop(0, rgba(baseRgb, row.alpha));
        grad.addColorStop(
          0.55,
          rgba(
            [
              Math.round(lerp(baseRgb[0], tipRgb[0], 0.45)),
              Math.round(lerp(baseRgb[1], tipRgb[1], 0.45)),
              Math.round(lerp(baseRgb[2], tipRgb[2], 0.45)),
            ],
            row.alpha,
          ),
        );
        grad.addColorStop(1, rgba(tipRgb, row.alpha));
        fills[s] = grad;
      }
    };

    const restyle = () => {
      const probe = probeRef.current;
      if (!probe) return;
      const p = params.current;
      probe.style.color = p.baseColor;
      baseRgb = read(getComputedStyle(probe).color);
      probe.style.color = p.tipColor;
      tipRgb = read(getComputedStyle(probe).color);
      gradients();
    };

    const rebuild = () => {
      const p = params.current;
      const reach = clamp(p.height, 0.1, 1) * h;
      for (let s = 0; s < N; s += 1) {
        const r = (n: number) => hash(s * 13 + n, p.seed);
        // Even spacing with a seeded nudge, so the bed is full but not ruled.
        rootX[s] = ((s + 0.5 + (r(1) - 0.5) * 0.8) / N) * w;
        rowOf[s] = Math.floor(r(2) * depthRows);
        const row = ROWS[3 - depthRows + rowOf[s]!] ?? ROWS[2];
        length[s] = reach * row.height * (0.62 + 0.38 * r(3));
        phase[s] = r(4) * TAU;
        const seg = length[s]! / SEG;
        for (let i = 0; i < PTS; i += 1) {
          const k = s * PTS + i;
          px[k] = rootX[s]!;
          py[k] = h - i * seg;
          ox[k] = px[k]!;
          oy[k] = py[k]!;
        }
      }
      // Back rows first.
      const idx = Array.from({ length: N }, (_, s) => s);
      idx.sort((a, b) => rowOf[a]! - rowOf[b]! || a - b);
      for (let s = 0; s < N; s += 1) order[s] = idx[s]!;
      for (let m = 0; m < M; m += 1) {
        mx[m] = hash(m * 7 + 900, p.seed) * w;
        my[m] = (0.15 + 0.8 * hash(m * 7 + 901, p.seed)) * h;
        mr[m] = 0.8 + 0.9 * hash(m * 7 + 902, p.seed);
      }
      gradients();
    };

    const layout = () => {
      w = root.clientWidth;
      h = root.clientHeight;
      if (w < 1 || h < 1) return false;
      ratio = Math.min(
        2,
        Math.max(1, params.current.dpr),
        window.devicePixelRatio || 1,
      );
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      if (partNode?.isConnected) placeFocus(partNode);
      rebuild();
      return true;
    };

    /** The water's velocity at a point: current, swell, the hand and its eddies. */
    const flow = (
      x: number,
      y: number,
      depth: number,
      out: { x: number; y: number },
      swell: boolean,
    ) => {
      const p = params.current;
      const c = clamp(p.current, 0, 1) * FLOW;
      const k = TAU / Math.max(200, w * 0.9);
      let ux: number;
      let uy = 0;
      if (swell) {
        ux =
          c * (0.55 + 0.45 * Math.sin(k * x - clock * 0.9)) +
          c * 0.3 * Math.sin(0.41 * k * x + clock * 1.7 + p.seed);
        uy = c * 0.12 * Math.sin(k * x * 1.3 - clock * 1.1);
      } else {
        ux = c * 0.55;
      }
      ux *= depth;
      const gain = clamp(p.wake, 0, 1) * (0.4 + 0.6 * depth);
      if (gain > 0) {
        const R = Math.max(10, p.radius);
        if (hand.on) {
          const dx = x - hand.x;
          const dy = y - hand.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < R * R * 4) {
            const f = Math.exp(-d2 / (R * R));
            const d = Math.sqrt(d2) + 1;
            // The hand drags the water with it and pushes it aside.
            ux += (hand.vx * 0.45 + (dx / d) * 170) * f * gain;
            uy += (hand.vy * 0.3 + (dy / d) * 70) * f * gain;
          }
        }
        for (let e = 0; e < EDDIES; e += 1) {
          const age = eAge[e]!;
          if (age >= EDDY_LIFE) continue;
          const dx = x - ex[e]!;
          const dy = y - ey[e]!;
          const d2 = dx * dx + dy * dy;
          const Re = R * (0.8 + age * 0.6);
          if (d2 > Re * Re * 4) continue;
          const f = Math.exp(-d2 / (Re * Re)) * (1 - age / EDDY_LIFE) ** 2;
          const sp = Math.hypot(evx[e]!, evy[e]!) + 1;
          // Water dragged along behind the hand, curling either side of its
          // path in opposite senses.
          const side = Math.sign(dx * evy[e]! - dy * evx[e]!);
          ux +=
            (evx[e]! * 0.18 + (-dy / (Math.sqrt(d2) + 1)) * side * sp * 0.1) *
            f *
            gain;
          // Mostly sideways: a wake should sway the bed, not fold it down.
          uy +=
            (evy[e]! * 0.15 + (dx / (Math.sqrt(d2) + 1)) * side * sp * 0.05) *
            f *
            gain;
        }
      }
      if (part.on) {
        const dx = x - part.x;
        const dy = y - part.y;
        const fx = Math.max(0, 1 - Math.abs(dx) / (part.hw * 1.8));
        const fy = Math.max(0, 1 - Math.abs(dy) / (part.hh * 1.8));
        ux += Math.sign(dx || 1) * 140 * fx * fy * depth;
      }
      // However hard the hand moves, the water never outruns 420 px/s.
      const sp = Math.hypot(ux, uy);
      const cap = sp > 420 ? 420 / sp : 1;
      out.x = ux * cap;
      out.y = uy * cap;
    };
    const u = { x: 0, y: 0 };

    let energy = 0;
    const step = (dt: number, swell: boolean) => {
      const p = params.current;
      const stiff = clamp(p.stiffness, 0, 1);
      const bend = lerp(0.0015, 0.05, stiff * stiff);
      const lift = BUOYANCY * lerp(0.75, 1.35, stiff);
      energy = 0;
      for (let s = 0; s < N; s += 1) {
        const row = ROWS[3 - depthRows + rowOf[s]!] ?? ROWS[2];
        const depth = row.response;
        const seg = length[s]! / SEG;
        const base = s * PTS;
        for (let i = 1; i < PTS; i += 1) {
          const k = base + i;
          const t = i / SEG;
          let vx = (px[k]! - ox[k]!) / dt;
          let vy = (py[k]! - oy[k]!) / dt;
          flow(px[k]!, py[k]!, depth, u, swell);
          const pull = Math.min(1, COUPLING * depth * dt * (0.5 + t));
          vx += (u.x * Math.pow(t, 0.6) - vx) * pull;
          vy += (u.y * t - vy) * pull;
          vy -= lift * t * dt;
          ox[k] = px[k]!;
          oy[k] = py[k]!;
          px[k] = px[k]! + vx * dt;
          py[k] = py[k]! + vy * dt;
          energy = Math.max(energy, Math.abs(vx) + Math.abs(vy));
        }
        // Constraints: lengths, then the bend toward a straight line.
        for (let it = 0; it < 4; it += 1) {
          px[base] = rootX[s]!;
          py[base] = h;
          for (let i = 0; i < SEG; i += 1) {
            const a = base + i;
            const b = a + 1;
            const dx = px[b]! - px[a]!;
            const dy = py[b]! - py[a]!;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const diff = (d - seg) / d;
            if (i === 0) {
              px[b] = px[b]! - dx * diff;
              py[b] = py[b]! - dy * diff;
            } else {
              px[a] = px[a]! + dx * diff * 0.5;
              py[a] = py[a]! + dy * diff * 0.5;
              px[b] = px[b]! - dx * diff * 0.5;
              py[b] = py[b]! - dy * diff * 0.5;
            }
          }
          for (let i = 0; i < SEG; i += 1) {
            const a = base + i;
            const b = a + 1;
            let dirX = 0;
            let dirY = -1;
            if (i > 0) {
              const dx = px[a]! - px[a - 1]!;
              const dy = py[a]! - py[a - 1]!;
              const d = Math.sqrt(dx * dx + dy * dy) || 1;
              dirX = dx / d;
              dirY = dy / d;
            }
            const tx = px[a]! + dirX * seg;
            const ty = py[a]! + dirY * seg;
            // The holdfast keeps the root segment the most upright.
            const k = i === 0 ? Math.min(1, bend * 3) : bend;
            px[b] = px[b]! + (tx - px[b]!) * k;
            py[b] = py[b]! + (ty - py[b]!) * k;
          }
        }
        // Nothing grows out of the box.
        for (let i = 1; i < PTS; i += 1) {
          const k = base + i;
          px[k] = clamp(px[k]!, -20, w + 20);
          py[k] = clamp(py[k]!, 2, h);
        }
      }
      if (swell) {
        for (let m = 0; m < M; m += 1) {
          flow(mx[m]!, my[m]!, 0.6, u, true);
          mx[m] = mx[m]! + u.x * 0.6 * dt;
          my[m] = my[m]! + (u.y * 0.6 - 4) * dt;
          if (mx[m]! > w + 4) mx[m] = -4;
          else if (mx[m]! < -4) mx[m] = w + 4;
          if (my[m]! < h * 0.1) my[m] = h * 0.95;
        }
      }
      for (let e = 0; e < EDDIES; e += 1) {
        if (eAge[e]! >= EDDY_LIFE) continue;
        eAge[e] = eAge[e]! + dt;
        ex[e] = ex[e]! + evx[e]! * 0.25 * dt;
        ey[e] = ey[e]! + evy[e]! * 0.25 * dt;
      }
    };

    const draw = () => {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (w < 1 || h < 1) return;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      const p = params.current;
      const rootW = Math.max(1, p.width);
      for (let o = 0; o < N; o += 1) {
        const s = order[o]!;
        const row = ROWS[3 - depthRows + rowOf[s]!] ?? ROWS[2];
        const bw = rootW * row.width;
        const base = s * PTS;
        for (let i = 0; i < PTS; i += 1) {
          const k = base + i;
          const a = i === 0 ? k : k - 1;
          const b = i === SEG ? k : k + 1;
          let tx = px[b]! - px[a]!;
          let ty = py[b]! - py[a]!;
          const d = Math.sqrt(tx * tx + ty * ty) || 1;
          tx /= d;
          ty /= d;
          const t = i / SEG;
          // A blade: a thin stipe at the root, widest past the middle,
          // narrowing to the float at the tip.
          const half =
            (bw *
              (0.38 +
                0.95 *
                  Math.pow(Math.max(0, Math.sin(Math.PI * t * 1.05)), 0.7) *
                  (1 - 0.35 * t))) /
            2;
          lx[i] = px[k]! - ty * half;
          ly[i] = py[k]! + tx * half;
          rx[i] = px[k]! + ty * half;
          ry[i] = py[k]! - tx * half;
        }
        g.fillStyle = fills[s] ?? "transparent";
        g.beginPath();
        g.moveTo(lx[0]!, ly[0]!);
        for (let i = 1; i < SEG; i += 1) {
          g.quadraticCurveTo(
            lx[i]!,
            ly[i]!,
            (lx[i]! + lx[i + 1]!) / 2,
            (ly[i]! + ly[i + 1]!) / 2,
          );
        }
        g.lineTo(lx[SEG]!, ly[SEG]!);
        g.lineTo(rx[SEG]!, ry[SEG]!);
        for (let i = SEG - 1; i >= 1; i -= 1) {
          g.quadraticCurveTo(
            rx[i]!,
            ry[i]!,
            (rx[i]! + rx[i - 1]!) / 2,
            (ry[i]! + ry[i - 1]!) / 2,
          );
        }
        g.lineTo(rx[0]!, ry[0]!);
        g.closePath();
        g.fill();
        if (p.floats) {
          const tip = base + SEG;
          g.globalAlpha = row.alpha;
          g.fillStyle = tipFill;
          g.beginPath();
          g.arc(px[tip]!, py[tip]!, Math.max(1, bw * 0.42), 0, TAU);
          g.fill();
          g.globalAlpha = 1;
        }
      }
      if (M > 0) {
        g.fillStyle = tipFill;
        for (let m = 0; m < M; m += 1) {
          g.globalAlpha = 0.18 + 0.2 * ((m % 3) / 2);
          g.beginPath();
          g.arc(mx[m]!, my[m]!, mr[m]!, 0, TAU);
          g.fill();
        }
        g.globalAlpha = 1;
      }
    };

    /** Reduced motion and first paint: the bed settled under the mean current. */
    const settle = () => {
      for (let n = 0; n < 160; n += 1) step(1 / 60, false);
      for (let k = 0; k < N * PTS; k += 1) {
        ox[k] = px[k]!;
        oy[k] = py[k]!;
      }
    };

    const frame = (now: number) => {
      raf = 0;
      const p = params.current;
      if (!inView || document.hidden || p.paused || !p.motionSafe) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      let t = dt;
      while (t > 1e-6) {
        const d = Math.min(t, 1 / 60);
        clock += d;
        step(d, true);
        t -= d;
      }
      draw();
      // Still water with no hand in it: once the bed is quiet, stop.
      let eddying = false;
      for (let e = 0; e < EDDIES; e += 1)
        if (eAge[e]! < EDDY_LIFE) eddying = true;
      const still = p.current <= 0 && !hand.on && !eddying && energy < 0.5;
      calm = still ? calm + 1 : 0;
      if (calm > 30) {
        last = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      const p = params.current;
      if (!p.motionSafe || p.paused) {
        draw();
        return;
      }
      if (raf || !inView || document.hidden) return;
      last = 0;
      calm = 0;
      raf = requestAnimationFrame(frame);
    };

    api.current = {
      point: (x, y, t) => {
        if (hand.on && t > hand.t) {
          const dt = Math.max(0.008, (t - hand.t) / 1000);
          // Smoothed hand velocity, so one jittery event cannot fling the bed.
          hand.vx = lerp(hand.vx, clamp((x - hand.x) / dt, -2400, 2400), 0.5);
          hand.vy = lerp(hand.vy, clamp((y - hand.y) / dt, -2400, 2400), 0.5);
        } else {
          hand.vx = 0;
          hand.vy = 0;
        }
        hand.x = x;
        hand.y = y;
        hand.t = t;
        hand.on = true;
        if (t - lastDrop > 30 && Math.hypot(hand.vx, hand.vy) > 40) {
          lastDrop = t;
          ex[eNext] = x;
          ey[eNext] = y;
          evx[eNext] = hand.vx;
          evy[eNext] = hand.vy;
          eAge[eNext] = 0;
          eNext = (eNext + 1) % EDDIES;
        }
        wake();
      },
      leave: () => {
        hand.on = false;
        hand.vx = 0;
        hand.vy = 0;
        wake();
      },
      focus: (node) => {
        partNode = node;
        if (node) placeFocus(node);
        part.on = node !== null;
        if (!params.current.motionSafe) {
          settle();
          draw();
          return;
        }
        wake();
      },
      rebuild: () => {
        if (w < 1 || h < 1) return;
        rebuild();
        settle();
        draw();
        wake();
      },
      restyle: () => {
        restyle();
        draw();
      },
      wake,
    };

    restyle();
    const sizer = new ResizeObserver(() => {
      if (!layout()) return;
      settle();
      draw();
      wake();
    });
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      api.current = null;
    };
  }, [strands, depthRows, specks]);

  React.useEffect(() => {
    api.current?.rebuild();
  }, [height, seed, dpr]);
  React.useEffect(() => {
    api.current?.restyle();
  }, [baseColor, tipColor]);
  React.useEffect(() => {
    api.current?.wake();
  }, [current, stiffness, width, wake, radius, floats, paused, motionSafe]);

  const local = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect
      ? { x: clientX - rect.left, y: clientY - rect.top }
      : { x: 0, y: 0 };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || !motionSafe) return;
    const at = local(event.clientX, event.clientY);
    api.current?.point(at.x, at.y, event.timeStamp);
  };
  const onPointerLeave = () => api.current?.leave();
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!followFocus) return;
    const target = event.target as HTMLElement;
    if (!target.matches(":focus-visible")) return;
    api.current?.focus(target);
  };
  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    api.current?.focus(null);
  };

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn("relative isolate touch-pan-y overflow-clip", className)}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 size-full"
      />
      {children}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.restyle()}
        className="pointer-events-none absolute size-0 overflow-hidden text-foreground transition-colors duration-1"
      />
    </div>
  );
}
