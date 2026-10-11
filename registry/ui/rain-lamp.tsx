"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type RainLampGlow = "amber" | "rose" | "violet" | "teal";

export type RainLampProps = {
  /** How many taut threads hang in the ring, 6 to 24. @default 14 */
  filaments?: number;
  /** How often a bead forms at the crown, per thread per second, 0.1 to 1.5. @default 0.5 */
  dripRate?: number;
  /** The colour the oil glows: a preset, or any CSS colour. @default "amber" */
  glow?: RainLampGlow | (string & {});
  /** How fast the ring of threads turns, 0 (still) to 1 (a turn every twenty seconds). @default 0.35 */
  turn?: number;
  /** How fast the beads slide, 0.5 to 2. @default 1 */
  speed?: number;
  /** How big the beads grow before they let go, 0.5 to 1.5. @default 1 */
  beadSize?: number;
  /** A faster bead that catches a slower one merges with it. @default true */
  merge?: boolean;
  /** Stand the fern sculpture in the middle of the ring. @default true */
  sculpture?: boolean;
  /** How hard a pass of the pointer plucks the threads it crosses, 0 to 1. @default 0.6 */
  pluck?: number;
  /** The pointer and touch pluck the threads. Keys still do. @default true */
  interactive?: boolean;
  /** Hold the oil and the ring still. @default false */
  paused?: boolean;
  /** Seeds the beads' sizes, timing and the film's unevenness. @default 7 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The lamp's accessible name. @default "Rain lamp" */
  label?: string;
  /** Play a plip as each bead you shook loose lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when a thread is plucked, by pointer, touch or key, with its index. */
  onPluck?: (thread: number) => void;
  /** Nothing reaches the threads and the lamp's button is disabled. @default false */
  disabled?: boolean;
  /** Sizes the lamp; it is drawn to fit the box. @default "h-[30rem] w-full" */
  className?: string;
};

const GLOWS: Record<RainLampGlow, string> = {
  amber: "oklch(from var(--warn) 0.76 0.15 calc(h - 8))",
  rose: "oklch(from var(--danger) 0.74 0.14 calc(h + 12))",
  violet: "oklch(from var(--accent-bright) 0.72 0.15 calc(h + 40))",
  teal: "oklch(from var(--signal) 0.78 0.11 calc(h + 12))",
};

const MAX_THREADS = 24;
const PER_THREAD = 6;
const MAX_RIPPLES = 28;
/** A plucked thread rings at about nine cycles a second and dies in half a second. */
const PLUCK_HZ = 9;
const PLUCK_TAU = 0.5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

function hash(seed: number, i: number, k: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(i + 1, 668265263);
  h = Math.imul(h ^ Math.imul(k + 7, 2246822519), 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [0, 1), seeded per channel. */
function noise(x: number, channel: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = hash(channel, i, 3);
  const b = hash(channel, i + 1, 3);
  return a + (b - a) * s;
}

const glowOf = (glow: string) =>
  (GLOWS as Record<string, string>)[glow] ?? glow;

/** Every colour the lamp is painted with, from the glow and the brass. */
const palette = (glow: string) => {
  const g = glowOf(glow);
  return [
    `oklch(from ${g} 0.15 0.025 h)`,
    `oklch(from ${g} 0.34 0.075 h)`,
    `oklch(from ${g} 0.8 0.15 h)`,
    `oklch(from ${g} 0.97 0.045 h)`,
    "oklch(from var(--warn) 0.82 0.085 calc(h - 6))",
    "oklch(from var(--warn) 0.56 0.09 calc(h - 12))",
    "oklch(from var(--warn) 0.27 0.045 calc(h - 16))",
    `oklch(from ${g} 0.28 0.07 h)`,
    `oklch(from ${g} 0.86 0.07 h)`,
    "oklch(from var(--ink-3) 0.25 0.012 h)",
  ];
};
const ROOM = 0;
const ROOM_GLOW = 1;
const GLOW = 2;
const CORE = 3;
const BRASS_LIGHT = 4;
const BRASS = 5;
const BRASS_DARK = 6;
const OIL = 7;
const THREAD = 8;
const STONE = 9;

/** The lamp's layout in a box, px. */
function layout(w: number, h: number) {
  const lampW = Math.min(w * 0.8, h * 0.52);
  const R = lampW * 0.34;
  return {
    cx: w / 2,
    lampW,
    R,
    e: 0.2,
    crownY: h * 0.12,
    capH: lampW * 0.075,
    basinY: h * 0.83,
    basinH: lampW * 0.085,
    scale: lampW / 260,
  };
}
type Layout = ReturnType<typeof layout>;

// ── the fern: leaves as quadratic lozenges along three curving stems ──

type Leaf = {
  px: number;
  py: number;
  ax: number;
  ay: number;
  tx: number;
  ty: number;
  bx: number;
  by: number;
};

/** The fern in unit space: base at (0, 0), up is −y, the tallest frond 1 high. */
function fernLeaves(): { leaves: Leaf[]; stems: number[][] } {
  const fronds = [
    { lean: 0.05, height: 1, curl: 0.16 },
    { lean: -0.5, height: 0.7, curl: -0.22 },
    { lean: 0.55, height: 0.62, curl: 0.24 },
  ];
  const leaves: Leaf[] = [];
  const stems: number[][] = [];
  fronds.forEach((f) => {
    const tipX = f.lean * f.height;
    const tipY = -f.height;
    const cx = f.lean * 0.15 + f.curl;
    const cy = -f.height * 0.55;
    const at = (t: number) => {
      const u = 1 - t;
      return {
        x: 2 * u * t * cx + t * t * tipX,
        y: 2 * u * t * cy + t * t * tipY,
        dx: 2 * u * cx + 2 * t * (tipX - cx),
        dy: 2 * u * cy + 2 * t * (tipY - cy),
      };
    };
    const stem: number[] = [];
    for (let i = 0; i <= 12; i += 1) {
      const p = at(i / 12);
      stem.push(p.x, p.y);
    }
    stems.push(stem);
    const pairs = 13;
    for (let i = 0; i < pairs * 2; i += 1) {
      const t = 0.1 + (0.86 * Math.floor(i / 2)) / pairs + (i % 2) * 0.02;
      const p = at(t);
      const len = Math.hypot(p.dx, p.dy) || 1;
      const ux = p.dx / len;
      const uy = p.dy / len;
      const side = i % 2 === 0 ? 1 : -1;
      // Pinnae angle up and out, flattening toward the tip.
      const spread = ((68 - 30 * t) * Math.PI) / 180;
      const c = Math.cos(spread);
      const s = Math.sin(spread) * side;
      const dx = ux * c - uy * s;
      const dy = ux * s + uy * c;
      const l =
        f.height * 0.3 * Math.sin(Math.PI * Math.pow(t, 0.75)) * (1 - 0.25 * t);
      const wdt = l * 0.2;
      const nx = -dy;
      const ny = dx;
      leaves.push({
        px: p.x,
        py: p.y,
        ax: p.x + dx * l * 0.45 + nx * wdt,
        ay: p.y + dy * l * 0.45 + ny * wdt,
        tx: p.x + dx * l,
        ty: p.y + dy * l,
        bx: p.x + dx * l * 0.45 - nx * wdt,
        by: p.y + dy * l * 0.45 - ny * wdt,
      });
    }
  });
  return { leaves, stems };
}
const FERN = fernLeaves();

/** Where the fern stands and how tall it is, px. */
const fernPlace = (L: Layout) => ({
  x: L.cx,
  y: L.basinY - L.R * 0.05,
  size: (L.basinY - L.crownY) * 0.5,
});

// ── the engine ──

type Config = {
  filaments: number;
  dripRate: number;
  turn: number;
  speed: number;
  beadSize: number;
  merge: boolean;
  sculpture: boolean;
  pluck: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  sweep: (x: number, y: number, speed: number, first: boolean) => void;
  tap: (x: number) => void;
  finger: (x: number | null) => void;
  pluckFinger: () => void;
  dispose: () => void;
};

type Events = {
  pluck: (thread: number) => void;
  land: (x: number, size: number) => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  events: { current: Events },
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let clock = 0;
  let spin = 0;
  let disposed = false;
  let lay: Layout = layout(1, 1);
  const size = { w: 0, h: 0, ratio: 1 };
  const colours: string[] = new Array(10).fill("rgb(0, 0, 0)");
  const reader = document.createElement("canvas");
  reader.width = 1;
  reader.height = 1;
  const readCtx = reader.getContext("2d", { willReadFrequently: true });

  // Pre-rendered layers, rebuilt only on a resize or a colour change.
  const bg = document.createElement("canvas");
  const fg = document.createElement("canvas");
  const fern = document.createElement("canvas");
  const halo = document.createElement("canvas");
  const core = document.createElement("canvas");

  // Threads: projected x and depth this frame, pluck state, spawn clock.
  const tx = new Float32Array(MAX_THREADS);
  const tz = new Float32Array(MAX_THREADS);
  const ring = new Float32Array(MAX_THREADS);
  const ringAt = new Float32Array(MAX_THREADS);
  const cool = new Float32Array(MAX_THREADS);
  const spawnAt = new Float32Array(MAX_THREADS);
  const lit = new Float32Array(MAX_THREADS);
  // Beads, PER_THREAD slots a thread: position along it, speed, volume,
  // forming time left, merge wobble, and whether a visitor shook it.
  const bs = new Float32Array(MAX_THREADS * PER_THREAD);
  const bv = new Float32Array(MAX_THREADS * PER_THREAD);
  const bvol = new Float32Array(MAX_THREADS * PER_THREAD);
  const bform = new Float32Array(MAX_THREADS * PER_THREAD);
  const bwob = new Float32Array(MAX_THREADS * PER_THREAD);
  const bmark = new Uint8Array(MAX_THREADS * PER_THREAD);
  const balive = new Uint8Array(MAX_THREADS * PER_THREAD);
  // Ripples on the oil: x, y, age, size.
  const rip = new Float32Array(MAX_RIPPLES * 4);
  let ripSlot = 0;
  let rng = 1;
  let fingerX: number | null = null;
  let lastSweepX: number | null = null;

  const rand = () => {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  };

  const count = () => Math.round(clamp(cfg?.filaments ?? 14, 6, MAX_THREADS));
  const length = () => lay.basinY - lay.crownY - lay.capH;
  const radiusOf = (vol: number) => 2.9 * Math.cbrt(vol) * lay.scale;

  const reset = () => {
    const c = cfg;
    rng = ((Math.round(c?.seed ?? 7) * 2654435761) ^ 0x5bd1e995) >>> 0 || 1;
    balive.fill(0);
    bmark.fill(0);
    ring.fill(0);
    rip.fill(0);
    const n = count();
    const L = length();
    for (let i = 0; i < n; i += 1) {
      spawnAt[i] = clock + rand() * 2;
      // Start mid-rain: two beads already on each thread.
      for (let k = 0; k < 2; k += 1) {
        const o = i * PER_THREAD + k;
        balive[o] = 1;
        bs[o] = L * (0.15 + 0.7 * hash(c?.seed ?? 7, i, k + 1));
        bvol[o] =
          (c?.beadSize ?? 1) * (0.6 + 0.8 * hash(c?.seed ?? 7, i, k + 9));
        bv[o] = 30 * lay.scale;
        bform[o] = 0;
        bwob[o] = 0;
      }
    }
  };

  const read = (colour: string) => {
    if (!readCtx) return "rgb(0, 0, 0)";
    readCtx.clearRect(0, 0, 1, 1);
    readCtx.fillStyle = "rgb(0, 0, 0)";
    readCtx.fillStyle = colour;
    readCtx.fillRect(0, 0, 1, 1);
    const d = readCtx.getImageData(0, 0, 1, 1).data;
    return `rgb(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0})`;
  };

  const sized = (c: HTMLCanvasElement, w: number, h: number) => {
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const x = c.getContext("2d");
    if (x) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, w, h);
    }
    return x;
  };

  const paintSprites = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    const ratio = size.ratio;
    const W = Math.round(size.w * ratio);
    const H = Math.round(size.h * ratio);
    const L = lay;
    const col = colours;

    // The room, its pool of lamp light, the table and the basin.
    const b = sized(bg, W, H);
    if (b) {
      b.setTransform(ratio, 0, 0, ratio, 0, 0);
      b.fillStyle = col[ROOM] ?? "black";
      b.fillRect(0, 0, size.w, size.h);
      const midY = (L.crownY + L.basinY) / 2;
      const g = b.createRadialGradient(
        L.cx,
        midY,
        0,
        L.cx,
        midY,
        L.lampW * 1.25,
      );
      g.addColorStop(0, col[ROOM_GLOW] ?? "black");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      b.fillStyle = g;
      b.fillRect(0, 0, size.w, size.h);
      // The table: a lighter top under the lamp, its shadow beneath the basin.
      const tableY = L.basinY + L.basinH * 1.6;
      const t = b.createLinearGradient(0, tableY, 0, size.h);
      t.addColorStop(0, "rgba(255, 255, 255, 0.05)");
      t.addColorStop(1, "rgba(255, 255, 255, 0)");
      b.fillStyle = t;
      b.fillRect(0, tableY, size.w, size.h - tableY);
      b.fillStyle = "rgba(0, 0, 0, 0.35)";
      b.beginPath();
      b.ellipse(
        L.cx,
        tableY + 2,
        L.R * 1.7,
        L.R * 1.7 * L.e * 0.8,
        0,
        0,
        Math.PI * 2,
      );
      b.fill();
      // The basin: a shallow brass dish, its foot, its rolled rim and the oil.
      const rx = L.R * 1.4;
      const ry = rx * L.e;
      const metal = b.createLinearGradient(L.cx - rx, 0, L.cx + rx, 0);
      metal.addColorStop(0, col[BRASS_DARK] ?? "black");
      metal.addColorStop(0.32, col[BRASS] ?? "black");
      metal.addColorStop(0.45, col[BRASS_LIGHT] ?? "white");
      metal.addColorStop(0.62, col[BRASS] ?? "black");
      metal.addColorStop(1, col[BRASS_DARK] ?? "black");
      b.fillStyle = metal;
      b.beginPath();
      b.ellipse(
        L.cx,
        L.basinY + L.basinH * 1.3,
        rx * 0.55,
        ry * 0.55,
        0,
        0,
        Math.PI,
      );
      b.lineTo(L.cx - rx * 0.55, L.basinY + L.basinH * 0.8);
      b.ellipse(
        L.cx,
        L.basinY + L.basinH * 0.8,
        rx * 0.55,
        ry * 0.55,
        0,
        Math.PI,
        0,
        true,
      );
      b.fill();
      b.beginPath();
      b.ellipse(L.cx, L.basinY + L.basinH, rx * 0.9, ry * 0.9, 0, 0, Math.PI);
      b.lineTo(L.cx - rx, L.basinY);
      b.ellipse(L.cx, L.basinY, rx, ry, 0, Math.PI, 0, true);
      b.closePath();
      b.fill();
      b.fillStyle = col[BRASS_LIGHT] ?? "white";
      b.beginPath();
      b.ellipse(L.cx, L.basinY, rx, ry, 0, 0, Math.PI * 2);
      b.fill();
      const oil = b.createRadialGradient(L.cx, L.basinY, 0, L.cx, L.basinY, rx);
      oil.addColorStop(0, col[ROOM_GLOW] ?? "black");
      oil.addColorStop(1, col[OIL] ?? "black");
      b.fillStyle = oil;
      b.beginPath();
      b.ellipse(L.cx, L.basinY, rx * 0.92, ry * 0.86, 0, 0, Math.PI * 2);
      b.fill();
    }

    // The crown: a brass cap, the bulb's glow beneath it and a finial.
    const f = sized(fg, W, H);
    if (f) {
      f.setTransform(ratio, 0, 0, ratio, 0, 0);
      const rx = L.R * 1.22;
      const ry = rx * L.e;
      const top = L.crownY;
      const bottom = L.crownY + L.capH;
      const under = f.createRadialGradient(
        L.cx,
        bottom + L.R * 0.12,
        0,
        L.cx,
        bottom + L.R * 0.12,
        L.R * 1.3,
      );
      under.addColorStop(0, col[CORE] ?? "white");
      under.addColorStop(0.25, col[GLOW] ?? "white");
      under.addColorStop(1, "rgba(0, 0, 0, 0)");
      f.globalCompositeOperation = "lighter";
      f.globalAlpha = 0.55;
      f.fillStyle = under;
      f.beginPath();
      f.ellipse(
        L.cx,
        bottom + L.R * 0.12,
        L.R * 1.3,
        L.R * 0.5,
        0,
        0,
        Math.PI * 2,
      );
      f.fill();
      f.globalAlpha = 1;
      f.globalCompositeOperation = "source-over";
      const metal = f.createLinearGradient(L.cx - rx, 0, L.cx + rx, 0);
      metal.addColorStop(0, col[BRASS_DARK] ?? "black");
      metal.addColorStop(0.3, col[BRASS] ?? "black");
      metal.addColorStop(0.44, col[BRASS_LIGHT] ?? "white");
      metal.addColorStop(0.6, col[BRASS] ?? "black");
      metal.addColorStop(1, col[BRASS_DARK] ?? "black");
      f.fillStyle = metal;
      f.beginPath();
      f.ellipse(L.cx, bottom, rx, ry, 0, 0, Math.PI);
      f.lineTo(L.cx - rx, top);
      f.ellipse(L.cx, top, rx, ry, 0, Math.PI, 0, true);
      f.closePath();
      f.fill();
      // The cap's top, a shallow dome lit from the room.
      const dome = f.createLinearGradient(0, top - ry, 0, top + ry);
      dome.addColorStop(0, col[BRASS_LIGHT] ?? "white");
      dome.addColorStop(1, col[BRASS] ?? "black");
      f.fillStyle = dome;
      f.beginPath();
      f.ellipse(L.cx, top, rx, ry, 0, 0, Math.PI * 2);
      f.fill();
      // The rim where the threads hang, a warm line under the cap.
      f.strokeStyle = col[GLOW] ?? "white";
      f.globalAlpha = 0.5;
      f.lineWidth = 1;
      f.beginPath();
      f.ellipse(L.cx, bottom, rx, ry, 0, 0, Math.PI);
      f.stroke();
      f.globalAlpha = 1;
      f.fillStyle = metal;
      f.beginPath();
      f.ellipse(
        L.cx,
        top - ry * 0.5,
        L.R * 0.12,
        L.R * 0.12 * 1.4,
        0,
        0,
        Math.PI * 2,
      );
      f.fill();
    }

    // The fern on its stone, lit gold from the crown above.
    const fe = sized(fern, W, H);
    if (fe) {
      fe.setTransform(ratio, 0, 0, ratio, 0, 0);
      const p = fernPlace(L);
      const s = p.size;
      const sheen = fe.createLinearGradient(0, p.y - s, 0, p.y);
      sheen.addColorStop(0, col[BRASS_LIGHT] ?? "white");
      sheen.addColorStop(0.55, col[BRASS] ?? "black");
      sheen.addColorStop(1, col[BRASS_DARK] ?? "black");
      fe.fillStyle = sheen;
      fe.strokeStyle = sheen;
      fe.lineCap = "round";
      fe.lineWidth = Math.max(1, s * 0.016);
      for (const stem of FERN.stems) {
        fe.beginPath();
        for (let i = 0; i < stem.length; i += 2) {
          const x = p.x + (stem[i] ?? 0) * s;
          const y = p.y + (stem[i + 1] ?? 0) * s;
          if (i === 0) fe.moveTo(x, y);
          else fe.lineTo(x, y);
        }
        fe.stroke();
      }
      fe.beginPath();
      for (const l of FERN.leaves) {
        fe.moveTo(p.x + l.px * s, p.y + l.py * s);
        fe.quadraticCurveTo(
          p.x + l.ax * s,
          p.y + l.ay * s,
          p.x + l.tx * s,
          p.y + l.ty * s,
        );
        fe.quadraticCurveTo(
          p.x + l.bx * s,
          p.y + l.by * s,
          p.x + l.px * s,
          p.y + l.py * s,
        );
      }
      fe.fill();
      fe.fillStyle = col[STONE] ?? "black";
      fe.beginPath();
      fe.ellipse(p.x, p.y + s * 0.02, s * 0.2, s * 0.085, 0, 0, Math.PI * 2);
      fe.fill();
      fe.fillStyle = "rgba(255, 255, 255, 0.08)";
      fe.beginPath();
      fe.ellipse(
        p.x - s * 0.04,
        p.y - s * 0.02,
        s * 0.12,
        s * 0.035,
        0,
        0,
        Math.PI * 2,
      );
      fe.fill();
    }

    // A bead: its halo and its glassy core, drawn once and stamped.
    const hs = 64;
    const hc = sized(halo, hs, hs);
    if (hc) {
      const g = hc.createRadialGradient(
        hs / 2,
        hs / 2,
        0,
        hs / 2,
        hs / 2,
        hs / 2,
      );
      g.addColorStop(0, col[GLOW] ?? "white");
      g.addColorStop(0.25, col[GLOW] ?? "white");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      hc.globalAlpha = 0.5;
      hc.fillStyle = g;
      hc.fillRect(0, 0, hs, hs);
    }
    const cs = 32;
    const cc = sized(core, cs, cs);
    if (cc) {
      const g = cc.createRadialGradient(
        cs * 0.42,
        cs * 0.4,
        0,
        cs / 2,
        cs / 2,
        cs / 2,
      );
      g.addColorStop(0, col[CORE] ?? "white");
      g.addColorStop(0.55, col[GLOW] ?? "white");
      g.addColorStop(0.9, col[GLOW] ?? "white");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      cc.fillStyle = g;
      cc.beginPath();
      cc.arc(cs / 2, cs / 2, cs / 2, 0, Math.PI * 2);
      cc.fill();
    }
  };

  /** Where thread i is this frame, and how it is ringing at height s. */
  const place = (n: number) => {
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + spin;
      tx[i] = lay.cx + lay.R * Math.sin(a);
      tz[i] = Math.cos(a);
    }
  };
  const shake = (i: number, s: number, L: number) => {
    const amp = ring[i] ?? 0;
    if (amp < 0.05) return 0;
    const age = clock - (ringAt[i] ?? 0);
    return (
      amp *
      Math.exp(-age / PLUCK_TAU) *
      Math.sin(age * PLUCK_HZ * Math.PI * 2) *
      Math.sin((Math.PI * s) / L)
    );
  };
  const ringing = (i: number) =>
    (ring[i] ?? 0) * Math.exp(-(clock - (ringAt[i] ?? 0)) / PLUCK_TAU);

  const strike = (i: number, strength: number) => {
    const c = cfg;
    if (!c) return;
    ring[i] = Math.max(ringing(i), strength * 6 * lay.scale);
    ringAt[i] = clock;
    cool[i] = clock + 0.35;
    lit[i] = clock + 0.6;
    // Every bead on it is now the visitor's: it will plip when it lands.
    for (let k = 0; k < PER_THREAD; k += 1) {
      const o = i * PER_THREAD + k;
      if (balive[o]) bmark[o] = 1;
    }
    events.current.pluck(i);
  };

  const ripple = (x: number, y: number, s: number) => {
    const o = ripSlot * 4;
    ripSlot = (ripSlot + 1) % MAX_RIPPLES;
    rip[o] = x;
    rip[o + 1] = y;
    rip[o + 2] = 0;
    rip[o + 3] = s;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const n = count();
    const L = length();
    spin += dt * clamp(c.turn, 0, 1) * ((Math.PI * 2) / 20);
    place(n);
    const rate = clamp(c.dripRate, 0.05, 1.5);
    const sp = clamp(c.speed, 0.5, 2);
    for (let i = 0; i < n; i += 1) {
      // A new pearl forms at the crown at seeded, Poisson-ish intervals.
      if (clock >= (spawnAt[i] ?? 0)) {
        spawnAt[i] = clock + (-Math.log(1 - rand() * 0.95) / rate) * 0.9 + 0.15;
        let free = -1;
        for (let k = 0; k < PER_THREAD; k += 1) {
          if (!balive[i * PER_THREAD + k]) {
            free = k;
            break;
          }
        }
        if (free >= 0) {
          const o = i * PER_THREAD + free;
          balive[o] = 1;
          bs[o] = 0;
          bv[o] = 0;
          bvol[o] = clamp(c.beadSize, 0.5, 1.5) * (0.55 + 0.8 * rand());
          bform[o] = 0.33;
          bwob[o] = 0;
          bmark[o] = 0;
        }
      }
      const held = ringing(i) > 0.4;
      for (let k = 0; k < PER_THREAD; k += 1) {
        const o = i * PER_THREAD + k;
        if (!balive[o]) continue;
        if ((bform[o] ?? 0) > 0) {
          bform[o] = Math.max(0, (bform[o] ?? 0) - dt);
          continue;
        }
        const vol = bvol[o] ?? 1;
        // Bigger beads run faster; the film's unevenness adds a stick-slip.
        const film =
          0.65 +
          0.7 *
            noise(
              (bs[o] ?? 0) / (34 * lay.scale) + i * 7.3,
              Math.round(c.seed) + i,
            );
        const terminal = sp * (26 + 34 * Math.cbrt(vol)) * lay.scale * film;
        const target = held ? 0 : terminal;
        const rateK = held ? 12 : 2.4;
        bv[o] =
          (bv[o] ?? 0) + (target - (bv[o] ?? 0)) * (1 - Math.exp(-dt * rateK));
        bs[o] = (bs[o] ?? 0) + (bv[o] ?? 0) * dt;
        bwob[o] = (bwob[o] ?? 0) * Math.exp(-dt * 5);
        if ((bs[o] ?? 0) >= L) {
          balive[o] = 0;
          const x = tx[i] ?? 0;
          const y = lay.basinY + lay.R * lay.e * (tz[i] ?? 0) * 0.92;
          ripple(x, y, radiusOf(vol));
          if (bmark[o]) events.current.land(x, vol);
        }
      }
      // Beads that meet on a thread become one: volumes add, momentum is kept.
      if (c.merge) {
        for (let a = 0; a < PER_THREAD; a += 1) {
          const oa = i * PER_THREAD + a;
          if (!balive[oa] || (bform[oa] ?? 0) > 0) continue;
          for (let b = 0; b < PER_THREAD; b += 1) {
            const ob = i * PER_THREAD + b;
            if (a === b || !balive[ob] || (bform[ob] ?? 0) > 0) continue;
            const sa = bs[oa] ?? 0;
            const sb = bs[ob] ?? 0;
            if (sa > sb) continue;
            const gap = sb - sa;
            const va = bvol[oa] ?? 1;
            const vb = bvol[ob] ?? 1;
            if (gap < radiusOf(va) + radiusOf(vb)) {
              const sum = Math.min(4, va + vb);
              bv[ob] = ((bv[oa] ?? 0) * va + (bv[ob] ?? 0) * vb) / (va + vb);
              bvol[ob] = sum;
              bwob[ob] = 1;
              bmark[ob] = bmark[oa] || bmark[ob] ? 1 : 0;
              balive[oa] = 0;
              break;
            }
          }
        }
      }
    }
    for (let r = 0; r < MAX_RIPPLES; r += 1) {
      const o = r * 4;
      if ((rip[o + 3] ?? 0) <= 0) continue;
      rip[o + 2] = (rip[o + 2] ?? 0) + dt;
      if ((rip[o + 2] ?? 0) > 1.3) rip[o + 3] = 0;
    }
  };

  const drawThreads = (
    front: boolean,
    n: number,
    L: number,
    still: boolean,
  ) => {
    if (!ctx) return;
    const top = lay.crownY + lay.capH;
    const base = lay.basinY;
    for (let i = 0; i < n; i += 1) {
      const z = tz[i] ?? 0;
      if (front !== z >= 0) continue;
      const x = tx[i] ?? 0;
      const dy = lay.R * lay.e * z;
      const near = 0.5 + 0.5 * z;
      const glowing = clock < (lit[i] ?? 0);
      ctx.globalAlpha = (0.16 + 0.26 * near) * (glowing ? 1.8 : 1);
      ctx.strokeStyle = colours[THREAD] ?? "white";
      ctx.lineWidth = 0.6 + 0.35 * near;
      ctx.beginPath();
      if (!still && ringing(i) > 0.05) {
        for (let k = 0; k <= 10; k += 1) {
          const s = (k / 10) * L;
          const px = x + shake(i, s, L);
          if (k === 0) ctx.moveTo(px, top + dy + s);
          else ctx.lineTo(px, top + dy + s);
        }
      } else {
        ctx.moveTo(x, top + dy);
        ctx.lineTo(x, base + dy * 0.92);
      }
      ctx.stroke();
      // The beads on it, a halo then a core, squashed by their speed.
      for (let k = 0; k < PER_THREAD; k += 1) {
        const o = i * PER_THREAD + k;
        if (!balive[o]) continue;
        const s = bs[o] ?? 0;
        const formed = 1 - (bform[o] ?? 0) / 0.33;
        const r =
          radiusOf((bvol[o] ?? 1) * clamp(formed, 0.15, 1)) *
          (0.86 + 0.14 * near);
        const bx = x + (still ? 0 : shake(i, s, L));
        const by = top + dy + s;
        const stretch = 1 + Math.min(0.45, (bv[o] ?? 0) / (240 * lay.scale));
        const wob = (bwob[o] ?? 0) * Math.sin(clock * 34) * 0.25;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (0.4 + 0.6 * near) * (glowing ? 1 : 0.85);
        const hr = r * 5.5;
        ctx.drawImage(halo, bx - hr, by - hr, hr * 2, hr * 2);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 0.55 + 0.45 * near;
        const w = r * (1 - wob);
        const h = r * (stretch + wob);
        ctx.drawImage(core, bx - w, by - h * 1.1, w * 2, h * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || size.w < 1) return;
    const n = count();
    const L = length();
    const still = !c.motionSafe;
    if (still) place(n);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    // Rings on the oil.
    ctx.strokeStyle = colours[GLOW] ?? "white";
    ctx.lineWidth = 0.8;
    for (let r = 0; r < MAX_RIPPLES; r += 1) {
      const o = r * 4;
      const s = rip[o + 3] ?? 0;
      if (s <= 0) continue;
      const age = rip[o + 2] ?? 0;
      const rx = s * 1.4 + age * 26 * lay.scale;
      ctx.globalAlpha = Math.max(0, 0.42 * (1 - age / 1.3));
      ctx.beginPath();
      ctx.ellipse(
        rip[o] ?? 0,
        rip[o + 1] ?? 0,
        rx,
        rx * lay.e,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    if (still) {
      ctx.globalAlpha = 0.28;
      for (let r = 0; r < 2; r += 1) {
        const i = Math.floor(hash(Math.round(c.seed), r, 21) * n);
        const rx = (10 + r * 9) * lay.scale;
        ctx.beginPath();
        ctx.ellipse(
          tx[i] ?? lay.cx,
          lay.basinY + lay.R * lay.e * (tz[i] ?? 0) * 0.92,
          rx,
          rx * lay.e,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    drawThreads(false, n, L, still);
    if (c.sculpture) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(fern, 0, 0);
      ctx.setTransform(size.ratio, 0, 0, size.ratio, 0, 0);
    }
    drawThreads(true, n, L, still);
    // The keyboard's finger: a faint line where Enter will pluck.
    if (fingerX !== null) {
      const x = lay.cx + fingerX * lay.R * 1.08;
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = colours[CORE] ?? "white";
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, lay.crownY + lay.capH + 4);
      ctx.lineTo(x, lay.basinY - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fg, 0, 0);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const moving = () => {
    const c = cfg;
    return Boolean(c && c.motionSafe && !c.paused);
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    clock += dt;
    step(dt);
    draw();
    if (moving()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!moving()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < colours.length; i += 1) {
      const el = kids[i];
      if (el) colours[i] = read(getComputedStyle(el).color);
    }
    paintSprites();
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    const changed = w !== size.w || h !== size.h || ratio !== size.ratio;
    size.w = w;
    size.h = h;
    size.ratio = ratio;
    const bw = Math.max(1, Math.round(w * ratio));
    const bh = Math.max(1, Math.round(h * ratio));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    lay = layout(w, h);
    if (changed) {
      paintSprites();
      reset();
    }
    draw();
    kick();
  };

  /** The thread nearest a point across the ring, front threads first. */
  const nearest = (x: number) => {
    const n = count();
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < n; i += 1) {
      const d = Math.abs((tx[i] ?? 0) - x) - (tz[i] ?? 0) * 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        readColours();
        resize();
        return;
      }
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey) readColours();
      if (was.filaments !== next.filaments || was.seed !== next.seed) reset();
      if (was.beadSize !== next.beadSize) {
        for (let i = 0; i < bvol.length; i += 1)
          bvol[i] =
            ((bvol[i] ?? 1) * next.beadSize) / Math.max(0.1, was.beadSize);
      }
      if (!next.motionSafe && was.motionSafe) {
        spin = 0;
        reset();
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      draw();
      kick();
    },
    sweep(x, y, speed, first) {
      const c = cfg;
      if (!c || !c.interactive) {
        lastSweepX = null;
        return;
      }
      const top = lay.crownY + lay.capH;
      if (y < top || y > lay.basinY || first) {
        lastSweepX = y < top || y > lay.basinY ? null : x;
        return;
      }
      const from = lastSweepX ?? x;
      lastSweepX = x;
      const n = count();
      const lo = Math.min(from, x);
      const hi = Math.max(from, x);
      const strength = clamp(c.pluck, 0, 1) * clamp(0.3 + speed / 1100, 0.3, 1);
      for (let i = 0; i < n; i += 1) {
        const ti = tx[i] ?? 0;
        // Crossed this move, or resting right on it once it has stopped ringing.
        const crossed = ti >= lo && ti <= hi && hi - lo > 0.5;
        const touching = Math.abs(ti - x) < 3 && clock > (cool[i] ?? 0);
        if (!crossed && !touching) continue;
        if (!crossed && clock < (cool[i] ?? 0)) continue;
        strike(
          i,
          (crossed ? strength : strength * 0.45) * (0.75 + 0.25 * (tz[i] ?? 0)),
        );
      }
      if (!c.motionSafe) draw();
      kick();
    },
    tap(x) {
      const i = nearest(x);
      if (i < 0 || !cfg?.interactive) return;
      strike(i, clamp(cfg.pluck, 0, 1) * 0.9);
      if (!cfg.motionSafe) {
        draw();
        window.setTimeout(() => {
          if (!disposed) draw();
        }, 620);
      }
      kick();
    },
    finger(x) {
      fingerX = x;
      if (!moving()) draw();
    },
    pluckFinger() {
      const c = cfg;
      if (!c || fingerX === null) return;
      const i = nearest(lay.cx + fingerX * lay.R * 1.08);
      if (i < 0) return;
      strike(i, Math.max(0.5, clamp(c.pluck, 0, 1)));
      if (!c.motionSafe) {
        draw();
        window.setTimeout(() => {
          if (!disposed) draw();
        }, 620);
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      root.removeAttribute("data-live");
    },
  };
}

// ── the still: the server's frame and the first paint ──

const STILL_W = 320;
const STILL_H = 540;

function stillLamp(seed: number, filaments: number) {
  const L = layout(STILL_W, STILL_H);
  const n = Math.round(clamp(filaments, 6, MAX_THREADS));
  const top = L.crownY + L.capH;
  const len = L.basinY - top;
  const threads = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = L.cx + L.R * Math.sin(a);
    const z = Math.cos(a);
    const dy = L.R * L.e * z;
    return {
      i,
      x: r2(x),
      y1: r2(top + dy),
      y2: r2(L.basinY + dy * 0.92),
      z: r2(z),
      beads: [0, 1].map((k) => ({
        k,
        y: r2(top + dy + len * (0.15 + 0.7 * hash(seed, i, k + 1))),
        r: r2(2.9 * Math.cbrt(0.6 + 0.8 * hash(seed, i, k + 9)) * L.scale),
      })),
    };
  });
  const p = fernPlace(L);
  const f = (v: number) => r2(v);
  const fern = FERN.leaves
    .map(
      (l) =>
        `M ${f(p.x + l.px * p.size)} ${f(p.y + l.py * p.size)} Q ${f(p.x + l.ax * p.size)} ${f(p.y + l.ay * p.size)} ${f(p.x + l.tx * p.size)} ${f(p.y + l.ty * p.size)} Q ${f(p.x + l.bx * p.size)} ${f(p.y + l.by * p.size)} ${f(p.x + l.px * p.size)} ${f(p.y + l.py * p.size)} Z`,
    )
    .join(" ");
  const stems = FERN.stems.map((s) => {
    const pts: string[] = [];
    for (let i = 0; i < s.length; i += 2)
      pts.push(
        `${f(p.x + (s[i] ?? 0) * p.size)} ${f(p.y + (s[i + 1] ?? 0) * p.size)}`,
      );
    return `M ${pts.join(" L ")}`;
  });
  return { L, threads, fern, stems, fernPlace: p };
}

/**
 * A retro rain lamp in a dim room: beads of glowing oil form at a brass
 * crown and slide down a ring of taut threads around a small fern sculpture,
 * accelerating toward a speed that grows with their size, merging where a
 * faster bead catches a slower one, and landing in a shallow basin of oil
 * with a ring on its surface. The ring turns slowly, so threads pass behind
 * the fern, round the side and across the front.
 *
 * Sweep the pointer across the threads and every one it crosses is plucked:
 * it rings as a decaying standing wave and its beads shiver and stall, then
 * run on together; beads you shook loose plip as they land. The lamp is a
 * button: Left and Right move a finger along the threads, Enter or Space
 * plucks. Canvas 2D with the room, crown, basin and fern painted once per
 * size; the loop stops off screen and when paused. Under reduced motion a
 * still lit frame, and a pluck lights its thread instead of shaking it.
 */
export function RainLamp({
  filaments = 14,
  dripRate = 0.5,
  glow = "amber",
  turn = 0.35,
  speed = 1,
  beadSize = 1,
  merge = true,
  sculpture = true,
  pluck = 0.6,
  interactive = true,
  paused = false,
  seed = 7,
  dpr = 2,
  label = "Rain lamp",
  sound = false,
  onPluck,
  disabled = false,
  className,
}: RainLampProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const fingerRef = React.useRef(0);
  const lastMove = React.useRef({ x: 0, t: 0 });
  const live = !disabled;
  const colours = palette(glow);

  const config: Config = {
    filaments,
    dripRate,
    turn,
    speed,
    beadSize,
    merge,
    sculpture,
    pluck,
    interactive: interactive && live,
    paused,
    seed,
    dpr,
    motionSafe,
    colorKey: colours.join("|"),
  };
  const latest = React.useRef(config);
  const events = React.useRef<Events>({ pluck: () => {}, land: () => {} });

  React.useLayoutEffect(() => {
    latest.current = config;
    events.current = {
      pluck: (thread) => onPluck?.(thread),
      land: (x, vol) => {
        if (!sound) return;
        // A plip answers the visitor: only beads they shook, only after a press.
        const activated =
          (
            navigator as Navigator & {
              userActivation?: { hasBeenActive: boolean };
            }
          ).userActivation?.hasBeenActive === true;
        if (!activated) return;
        const r = rootRef.current?.getBoundingClientRect();
        audio.play("plip", {
          pitch: clamp(1.45 - Math.cbrt(vol) * 0.4, 0.75, 1.5),
          gain: 0.32,
          pan: r ? panFrom(r.left + x, rootRef.current) : 0,
        });
      },
    };
  });

  React.useEffect(() => {
    engine.current?.configure(latest.current);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, events);
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
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!live || !interactive) return;
    const at = local(event.clientX, event.clientY);
    if (!at) return;
    const prev = lastMove.current;
    const dt = Math.max(8, event.timeStamp - prev.t);
    const first = !prev.t || event.timeStamp - prev.t > 250;
    const speed = first ? 0 : (Math.abs(at.x - prev.x) / dt) * 1000;
    lastMove.current = { x: at.x, t: event.timeStamp };
    engine.current?.sweep(at.x, at.y, Math.min(speed, 3000), first);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const stepSize = event.shiftKey ? 0.3 : 0.12;
    let next = fingerRef.current;
    if (event.key === "ArrowLeft") next -= stepSize;
    else if (event.key === "ArrowRight") next += stepSize;
    else if (event.key === "Home") next = -1;
    else if (event.key === "End") next = 1;
    else return;
    event.preventDefault();
    fingerRef.current = clamp(next, -1, 1);
    engine.current?.finger(fingerRef.current);
  };

  const still = stillLamp(Math.round(seed), filaments);
  const room = `radial-gradient(70% 55% at 50% 48%, ${colours[ROOM_GLOW]}, ${colours[ROOM]})`;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/rain-lamp relative isolate h-[30rem] w-full overflow-clip",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/rain-lamp:opacity-0"
        style={{ backgroundImage: room }}
      >
        <svg
          viewBox={`0 0 ${STILL_W} ${STILL_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="size-full"
        >
          <defs>
            <radialGradient id={`${uid}-bead`}>
              <stop offset="0" style={{ stopColor: colours[CORE] }} />
              <stop offset="0.5" style={{ stopColor: colours[GLOW] }} />
              <stop
                offset="1"
                style={{ stopColor: colours[GLOW] }}
                stopOpacity={0}
              />
            </radialGradient>
            <linearGradient id={`${uid}-brass`} x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" style={{ stopColor: colours[BRASS_DARK] }} />
              <stop offset="0.44" style={{ stopColor: colours[BRASS_LIGHT] }} />
              <stop offset="1" style={{ stopColor: colours[BRASS_DARK] }} />
            </linearGradient>
          </defs>
          <ellipse
            cx={r2(still.L.cx)}
            cy={r2(still.L.basinY)}
            rx={r2(still.L.R * 1.4)}
            ry={r2(still.L.R * 1.4 * still.L.e)}
            fill={`url(#${uid}-brass)`}
          />
          <ellipse
            cx={r2(still.L.cx)}
            cy={r2(still.L.basinY)}
            rx={r2(still.L.R * 1.29)}
            ry={r2(still.L.R * 1.2 * still.L.e)}
            style={{ fill: colours[OIL] }}
          />
          {still.threads.map((t) => (
            <g key={t.i} opacity={r2(0.45 + 0.55 * (0.5 + 0.5 * t.z))}>
              <line
                x1={t.x}
                x2={t.x}
                y1={t.y1}
                y2={t.y2}
                strokeWidth={0.7}
                strokeOpacity={0.4}
                style={{ stroke: colours[THREAD] }}
              />
              {t.beads.map((b) => (
                <circle
                  key={b.k}
                  cx={t.x}
                  cy={b.y}
                  r={r2(b.r * 2.6)}
                  fill={`url(#${uid}-bead)`}
                />
              ))}
            </g>
          ))}
          {sculpture ? (
            <g>
              {still.stems.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  strokeWidth={r2(still.fernPlace.size * 0.016)}
                  style={{ stroke: colours[BRASS] }}
                />
              ))}
              <path d={still.fern} style={{ fill: colours[BRASS] }} />
            </g>
          ) : null}
          <rect
            x={r2(still.L.cx - still.L.R * 1.22)}
            y={r2(still.L.crownY)}
            width={r2(still.L.R * 2.44)}
            height={r2(still.L.capH)}
            fill={`url(#${uid}-brass)`}
          />
          <ellipse
            cx={r2(still.L.cx)}
            cy={r2(still.L.crownY)}
            rx={r2(still.L.R * 1.22)}
            ry={r2(still.L.R * 1.22 * still.L.e)}
            style={{ fill: colours[BRASS_LIGHT] }}
          />
        </svg>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {colours.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <button
        type="button"
        aria-label={label}
        aria-describedby={live ? hintId : undefined}
        disabled={!live}
        onPointerMove={onPointerMove}
        onPointerLeave={() => {
          lastMove.current = { x: 0, t: 0 };
        }}
        onClick={(event) => {
          if (!live) return;
          if (event.detail === 0) {
            // Enter, Space or assistive technology plucks under the finger.
            engine.current?.finger(fingerRef.current);
            engine.current?.pluckFinger();
            return;
          }
          const at = local(event.clientX, event.clientY);
          if (at) engine.current?.tap(at.x);
        }}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible"))
            engine.current?.finger(fingerRef.current);
        }}
        onBlur={() => engine.current?.finger(null)}
        className={cn(
          "absolute inset-0 size-full cursor-pointer touch-pan-y rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-default",
        )}
      />
      {live ? (
        <p id={hintId} className="sr-only">
          Sweep across the threads to pluck them. Left and Right move a finger
          along the threads; Enter or Space plucks the thread under it.
        </p>
      ) : null}
    </div>
  );
}
