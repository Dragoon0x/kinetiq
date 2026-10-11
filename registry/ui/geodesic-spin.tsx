"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type GeodesicSpinProps = {
  /** Geodesic frequency at rest, 1 to 4: a 2V frame has 80 faces, a 4V frame 320. @default 2 */
  frequency?: number;
  /** The finest frame a fast spin reaches, 2 to 8; levels double from `frequency`. @default 8 */
  maxFrequency?: number;
  /** Spin speed, rad/s, that splits the first level; each further level needs 1.8 times more. @default 3.2 */
  splitAt?: number;
  /** How long a flick coasts, 0 (it stops almost at once) to 1 (it coasts for seconds). @default 0.6 */
  inertia?: number;
  /** Strut weight in px, 0.5 to 2.5. @default 1.2 */
  strut?: number;
  /** The turntable spin it returns to when left alone, rad/s; 0 lets it come to rest. @default 0.2 */
  idleSpin?: number;
  /** How far the rest pose leans toward you, degrees. @default 16 */
  tilt?: number;
  /** Strength of the specular glints on the near hubs, 0 to 1. @default 0.7 */
  glint?: number;
  /** How much nearer struts are drawn larger, 0 (orthographic) to 1. @default 0.35 */
  perspective?: number;
  /** Strut colour, any CSS colour. @default "var(--ink-2)" */
  color?: string;
  /** The colour lit struts and glints turn toward. @default "var(--accent-bright)" */
  lightColor?: string;
  /** Show the frequency and face count in the corner. @default true */
  readout?: boolean;
  /** Fires when a split or merge completes (and once at mount), with the frequency and face count. */
  onFrequencyChange?: (frequency: number, faces: number) => void;
  /** Hold the frame still; a drag still turns it. @default false */
  paused?: boolean;
  /** No drag and no keys. @default false */
  disabled?: boolean;
  /** Accessible name. @default "Geodesic frame" */
  label?: string;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the box; the sphere fits its shorter side. @default "h-52 w-full" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------- geometry -------------------------------- */

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_VERTS: readonly (readonly [number, number, number])[] = [
  [-1, PHI, 0],
  [1, PHI, 0],
  [-1, -PHI, 0],
  [1, -PHI, 0],
  [0, -1, PHI],
  [0, 1, PHI],
  [0, -1, -PHI],
  [0, 1, -PHI],
  [PHI, 0, -1],
  [PHI, 0, 1],
  [-PHI, 0, -1],
  [-PHI, 0, 1],
];
const ICO_FACES: readonly (readonly [number, number, number])[] = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

type Mesh = {
  /** Geodesic frequency. */
  n: number;
  count: number;
  /** Unit-sphere positions, xyz. */
  pos: Float64Array;
  /**
   * For a hub that is new at this level: the two hubs of the strut it
   * splits (both exist one level down). -1 for hubs that already existed.
   */
  parentA: Int32Array;
  parentB: Int32Array;
  /** Strut endpoints, in pairs. */
  edges: Uint16Array;
  /** 1 for struts that are new at this level (both ends are new hubs). */
  fresh: Uint8Array;
  faces: number;
};

const meshCache = new Map<string, Mesh>();

/**
 * Class I geodesic subdivision: every icosahedron face is cut into an n × n
 * triangular grid and the grid's points pushed out to the sphere. When n is
 * twice the level below, the grid's even points are exactly the coarser
 * frame's hubs, so each odd point is the middle of one coarser strut — which
 * is what lets a split grow out of the frame instead of replacing it.
 */
function buildMesh(n: number, split: boolean): Mesh {
  const key = `${n}:${split ? 1 : 0}`;
  const cached = meshCache.get(key);
  if (cached) return cached;
  const index = new Map<string, number>();
  const pos: number[] = [];
  const pa: number[] = [];
  const pb: number[] = [];
  const seen = new Set<number>();
  const edges: number[] = [];
  const fresh: number[] = [];
  const odd = (i: number, j: number) => i % 2 === 1 || j % 2 === 1;
  for (const [ia, ib, ic] of ICO_FACES) {
    const A = ICO_VERTS[ia] ?? [0, 0, 1];
    const B = ICO_VERTS[ib] ?? [0, 0, 1];
    const C = ICO_VERTS[ic] ?? [0, 0, 1];
    const grid: number[][] = [];
    for (let i = 0; i <= n; i += 1) {
      const row: number[] = [];
      for (let j = 0; j <= n - i; j += 1) {
        const k = n - i - j;
        const x = (i * A[0] + j * B[0] + k * C[0]) / n;
        const y = (i * A[1] + j * B[1] + k * C[1]) / n;
        const z = (i * A[2] + j * B[2] + k * C[2]) / n;
        const len = Math.sqrt(x * x + y * y + z * z) || 1;
        const ux = x / len;
        const uy = y / len;
        const uz = z / len;
        const id = `${Math.round(ux * 1e5)},${Math.round(uy * 1e5)},${Math.round(uz * 1e5)}`;
        let at = index.get(id);
        if (at === undefined) {
          at = pos.length / 3;
          pos.push(ux, uy, uz);
          pa.push(-1);
          pb.push(-1);
          index.set(id, at);
        }
        row.push(at);
      }
      grid.push(row);
    }
    const g = (i: number, j: number) => grid[i]?.[j] ?? 0;
    for (let i = 0; i <= n; i += 1) {
      for (let j = 0; j <= n - i; j += 1) {
        const a = g(i, j);
        if (split && odd(i, j) && pa[a] === -1) {
          const iOdd = i % 2 === 1;
          const jOdd = j % 2 === 1;
          const [p, q] =
            iOdd && !jOdd
              ? [g(i - 1, j), g(i + 1, j)]
              : !iOdd && jOdd
                ? [g(i, j - 1), g(i, j + 1)]
                : [g(i - 1, j + 1), g(i + 1, j - 1)];
          pa[a] = p;
          pb[a] = q;
        }
        const link = (i2: number, j2: number) => {
          const b = g(i2, j2);
          const k2 = Math.min(a, b) * 65536 + Math.max(a, b);
          if (seen.has(k2)) return;
          seen.add(k2);
          edges.push(a, b);
          fresh.push(split && odd(i, j) && odd(i2, j2) ? 1 : 0);
        };
        if (i + 1 + j <= n) link(i + 1, j);
        if (i + j + 1 <= n) link(i, j + 1);
        if (j >= 1) link(i + 1, j - 1);
      }
    }
  }
  const mesh: Mesh = {
    n,
    count: pos.length / 3,
    pos: Float64Array.from(pos),
    parentA: Int32Array.from(pa),
    parentB: Int32Array.from(pb),
    edges: Uint16Array.from(edges),
    fresh: Uint8Array.from(fresh),
    faces: 20 * n * n,
  };
  meshCache.set(key, mesh);
  return mesh;
}

/** The frequencies a spin can reach: the base, doubled while it stays within the cap. */
function levelsOf(frequency: number, maxFrequency: number): number[] {
  const base = clamp(Math.round(frequency), 1, 4);
  const cap = clamp(Math.round(maxFrequency), base, 8);
  const out = [base];
  while ((out[out.length - 1] ?? base) * 2 <= cap)
    out.push((out[out.length - 1] ?? base) * 2);
  return out;
}

/** The rest pose: a slight yaw so no symmetry axis faces you, then the tilt. */
function restPose(tiltDeg: number, out: Float64Array) {
  const yaw = 0.42;
  const pitch = (clamp(tiltDeg, -60, 60) * Math.PI) / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // Rx(pitch) · Ry(yaw)
  out[0] = cy;
  out[1] = 0;
  out[2] = sy;
  out[3] = sp * sy;
  out[4] = cp;
  out[5] = -sp * cy;
  out[6] = -cp * sy;
  out[7] = sp;
  out[8] = cp * cy;
}

/** Camera distance in radii for a perspective setting. */
const cameraOf = (perspective: number) => lerp(9, 2.4, clamp01(perspective));

/** A light high on the left and toward you, and its half-vector with the eye. */
const LIGHT = (() => {
  const l = [-0.42, -0.62, 0.66];
  const len = Math.hypot(l[0] ?? 0, l[1] ?? 0, l[2] ?? 0);
  const L = l.map((v) => v / len);
  const h = [L[0] ?? 0, L[1] ?? 0, (L[2] ?? 0) + 1];
  const hl = Math.hypot(h[0] ?? 0, h[1] ?? 0, h[2] ?? 0);
  return {
    x: L[0] ?? 0,
    y: L[1] ?? 0,
    z: L[2] ?? 0,
    hx: (h[0] ?? 0) / hl,
    hy: (h[1] ?? 0) / hl,
    hz: (h[2] ?? 0) / hl,
  };
})();

/** The server's still: the base frame at rest, back and front struts as two paths in a 100 × 100 box. */
function stillPaths(n: number, tiltDeg: number, perspective: number) {
  const mesh = buildMesh(n, false);
  const R = new Float64Array(9);
  restPose(tiltDeg, R);
  const D = cameraOf(perspective);
  const px: number[] = [];
  const py: number[] = [];
  const pz: number[] = [];
  for (let v = 0; v < mesh.count; v += 1) {
    const x = mesh.pos[v * 3] ?? 0;
    const y = mesh.pos[v * 3 + 1] ?? 0;
    const z = mesh.pos[v * 3 + 2] ?? 0;
    const qx = (R[0] ?? 0) * x + (R[1] ?? 0) * y + (R[2] ?? 0) * z;
    const qy = (R[3] ?? 0) * x + (R[4] ?? 0) * y + (R[5] ?? 0) * z;
    const qz = (R[6] ?? 0) * x + (R[7] ?? 0) * y + (R[8] ?? 0) * z;
    const s = (D / (D - qz)) * 40;
    px.push(r2(50 + qx * s));
    py.push(r2(50 + qy * s));
    pz.push(qz);
  }
  let back = "";
  let front = "";
  for (let e = 0; e < mesh.edges.length; e += 2) {
    const a = mesh.edges[e] ?? 0;
    const b = mesh.edges[e + 1] ?? 0;
    const seg = `M${px[a] ?? 0} ${py[a] ?? 0}L${px[b] ?? 0} ${py[b] ?? 0}`;
    if ((pz[a] ?? 0) + (pz[b] ?? 0) < 0) back += seg;
    else front += seg;
  }
  return { back, front };
}

/* -------------------------------- engine --------------------------------- */

type Config = {
  frequency: number;
  maxFrequency: number;
  splitAt: number;
  inertia: number;
  strut: number;
  idleSpin: number;
  tilt: number;
  glint: number;
  perspective: number;
  paused: boolean;
  motionSafe: boolean;
  dpr: number;
  colorKey: string;
};

type Engine = {
  configure: (cfg: Config) => void;
  grab: () => void;
  letGo: () => void;
  dragBy: (dx: number, dy: number, at: number) => void;
  dragEnd: (vx: number, vy: number) => void;
  impulse: (ax: number, ay: number) => void;
  brake: () => boolean;
  hover: (on: boolean) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

type Rgb = [number, number, number, number];

/** Light bins: 0 is the far side, 1–5 the near side from shaded to lit. */
const BINS = 6;
/** How far the light colour is mixed into each near bin. */
const BIN_LIGHT = [0, 0, 0.14, 0.32, 0.56, 0.82];
const BIN_ALPHA = [0.2, 0.5, 0.6, 0.72, 0.86, 1];
const BIN_WIDTH = [0.62, 0.86, 0.94, 1, 1.08, 1.16];
/** Fixed-step physics so a slow frame never changes the spring. */
const STEP = 1 / 240;
/** Each further split needs this much more speed; a merge waits for 0.65 of it. */
const SPLIT_RATIO = 1.8;
const MERGE_AT = 0.65;
/** The reduced-motion cross-fade between frames, s. */
const FADE = 0.15;

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  onTier: (n: number, faces: number, kind: "split" | "merge" | "reset") => void,
): Engine {
  const ctx = canvas.getContext("2d");
  let cfg: Config | null = null;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  const size = { w: 0, h: 0, dpr: 1 };

  const R = new Float64Array(9);
  /** Angular velocity, rad/s, about the screen's x and y axes. */
  let wx = 0;
  let wy = 0;
  let held = false;
  let dragging = false;
  let lastMove = 0;
  let braking = false;
  let sinceOrtho = 0;

  let levels: number[] = [2];
  let meshes: Mesh[] = [];
  let tier = 0;
  let target = 0;
  /** +1 splitting to tier + 1, -1 merging to tier - 1, 0 at rest. */
  let morph = 0;
  /** Morph progress: 1 is the finer frame fully formed. A spring, so it can overshoot. */
  let mt = 0;
  let mv = 0;
  let flare = 0;
  let hoverAt = 0;
  let hoverTo = 0;

  // Scratch, sized for the finest frame (8V: 642 hubs, 1920 struts).
  const sx = new Float32Array(700);
  const sy = new Float32Array(700);
  const qx = new Float32Array(700);
  const qy = new Float32Array(700);
  const qz = new Float32Array(700);
  const bins = new Uint8Array(2000);

  const colours = {
    base: [128, 128, 140, 1] as Rgb,
    light: [90, 120, 240, 1] as Rgb,
    lightTheme: false,
  };
  const binStyle: string[] = [];
  const bloomStyle = { value: "rgba(90, 120, 240, 0.1)" };
  const glintStyle = {
    core: "rgb(255, 255, 255)",
    halo: "rgba(255,255,255,0.3)",
  };
  let shadow: CanvasGradient | null = null;

  const reader = document.createElement("canvas");
  reader.width = 1;
  reader.height = 1;
  const readerCtx = reader.getContext("2d", { willReadFrequently: true });
  const resolve = (colour: string, fallback: Rgb): Rgb => {
    if (!readerCtx) return fallback;
    readerCtx.clearRect(0, 0, 1, 1);
    readerCtx.fillStyle = "rgb(0, 0, 0)";
    readerCtx.fillStyle = colour;
    readerCtx.fillRect(0, 0, 1, 1);
    const d = readerCtx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, r2((d[3] ?? 255) / 255)];
  };
  const mix = (a: Rgb, b: Rgb, t: number, alpha: number) =>
    `rgba(${Math.round(lerp(a[0], b[0], t))}, ${Math.round(lerp(a[1], b[1], t))}, ${Math.round(lerp(a[2], b[2], t))}, ${r2(alpha)})`;

  const paintStyles = () => {
    const { base, light, lightTheme } = colours;
    for (let b = 0; b < BINS; b += 1) {
      binStyle[b] = mix(
        base,
        light,
        BIN_LIGHT[b] ?? 0,
        (BIN_ALPHA[b] ?? 1) * base[3],
      );
    }
    bloomStyle.value = mix(light, light, 0, lightTheme ? 0.09 : 0.14);
    // On a light page a white glint vanishes: it takes the light colour, deepened.
    const white: Rgb = [255, 255, 255, 1];
    const ink: Rgb = [0, 0, 0, 1];
    glintStyle.core = lightTheme
      ? mix(light, ink, 0.12, 1)
      : mix(light, white, 0.78, 1);
    glintStyle.halo = lightTheme
      ? mix(light, white, 0.2, 0.32)
      : mix(light, white, 0.4, 0.38);
  };

  const readColours = () => {
    const kids = carriers.children;
    const read = (i: number, fallback: Rgb) => {
      const el = kids[i];
      return el ? resolve(getComputedStyle(el).color, fallback) : fallback;
    };
    colours.base = read(0, colours.base);
    colours.light = read(1, colours.light);
    const bg = read(2, [0, 0, 0, 1]);
    colours.lightTheme =
      (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255 > 0.5;
    paintStyles();
    paintShadow();
  };

  const paintShadow = () => {
    if (!ctx || size.w < 1) return;
    const r = Math.min(size.w, size.h) * 0.4;
    const cx = size.w / 2;
    const cy = size.h / 2 + r * 1.04;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.82);
    const { base, lightTheme } = colours;
    g.addColorStop(0, mix(base, base, 0, lightTheme ? 0.16 : 0.22));
    g.addColorStop(1, mix(base, base, 0, 0));
    shadow = g;
  };

  const setLevels = () => {
    const c = cfg;
    if (!c) return;
    levels = levelsOf(c.frequency, c.maxFrequency);
    meshes = levels.map((n, k) => buildMesh(n, k > 0));
    tier = 0;
    target = 0;
    morph = 0;
    mt = 0;
    mv = 0;
    flare = 0;
  };

  /** R ← rotation(axis, angle) · R, Rodrigues, no allocation. */
  const rotate = (ax: number, ay: number, az: number, angle: number) => {
    const len = Math.hypot(ax, ay, az);
    if (len < 1e-9 || Math.abs(angle) < 1e-9) return;
    const x = ax / len;
    const y = ay / len;
    const z = az / len;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    const m0 = t * x * x + c;
    const m1 = t * x * y - s * z;
    const m2 = t * x * z + s * y;
    const m3 = t * x * y + s * z;
    const m4 = t * y * y + c;
    const m5 = t * y * z - s * x;
    const m6 = t * x * z - s * y;
    const m7 = t * y * z + s * x;
    const m8 = t * z * z + c;
    for (let col = 0; col < 3; col += 1) {
      const r0 = R[col] ?? 0;
      const r1 = R[3 + col] ?? 0;
      const r3 = R[6 + col] ?? 0;
      R[col] = m0 * r0 + m1 * r1 + m2 * r3;
      R[3 + col] = m3 * r0 + m4 * r1 + m5 * r3;
      R[6 + col] = m6 * r0 + m7 * r1 + m8 * r3;
    }
    sinceOrtho += 1;
    if (sinceOrtho > 120) orthonormalise();
  };

  /** Rounding creeps into a matrix turned thousands of times; Gram–Schmidt puts it back. */
  const orthonormalise = () => {
    sinceOrtho = 0;
    let ax = R[0] ?? 1;
    let ay = R[1] ?? 0;
    let az = R[2] ?? 0;
    let l = Math.hypot(ax, ay, az) || 1;
    ax /= l;
    ay /= l;
    az /= l;
    let bx = R[3] ?? 0;
    let by = R[4] ?? 1;
    let bz = R[5] ?? 0;
    const d = ax * bx + ay * by + az * bz;
    bx -= d * ax;
    by -= d * ay;
    bz -= d * az;
    l = Math.hypot(bx, by, bz) || 1;
    bx /= l;
    by /= l;
    bz /= l;
    R[0] = ax;
    R[1] = ay;
    R[2] = az;
    R[3] = bx;
    R[4] = by;
    R[5] = bz;
    R[6] = ay * bz - az * by;
    R[7] = az * bx - ax * bz;
    R[8] = ax * by - ay * bx;
  };

  const radius = () => Math.min(size.w, size.h) * 0.4;

  /** Rotates and projects a mesh's hubs, with new hubs `t` of the way from their strut's chord to the sphere. */
  const project = (mesh: Mesh, t: number) => {
    const c = cfg;
    if (!c) return;
    const r = radius();
    const cx = size.w / 2;
    const cy = size.h / 2;
    const D = cameraOf(c.perspective);
    const { pos, parentA, parentB } = mesh;
    for (let v = 0; v < mesh.count; v += 1) {
      let x = pos[v * 3] ?? 0;
      let y = pos[v * 3 + 1] ?? 0;
      let z = pos[v * 3 + 2] ?? 0;
      const a = parentA[v] ?? -1;
      if (a >= 0 && t !== 1) {
        const b = parentB[v] ?? 0;
        const mx = ((pos[a * 3] ?? 0) + (pos[b * 3] ?? 0)) / 2;
        const my = ((pos[a * 3 + 1] ?? 0) + (pos[b * 3 + 1] ?? 0)) / 2;
        const mz = ((pos[a * 3 + 2] ?? 0) + (pos[b * 3 + 2] ?? 0)) / 2;
        x = mx + (x - mx) * t;
        y = my + (y - my) * t;
        z = mz + (z - mz) * t;
      }
      const rx = (R[0] ?? 0) * x + (R[1] ?? 0) * y + (R[2] ?? 0) * z;
      const ry = (R[3] ?? 0) * x + (R[4] ?? 0) * y + (R[5] ?? 0) * z;
      const rz = (R[6] ?? 0) * x + (R[7] ?? 0) * y + (R[8] ?? 0) * z;
      const s = (D / (D - rz)) * r;
      qx[v] = rx;
      qy[v] = ry;
      qz[v] = rz;
      sx[v] = cx + rx * s;
      sy[v] = cy + ry * s;
    }
  };

  const drawMesh = (mesh: Mesh, t: number, alpha: number) => {
    const c = cfg;
    if (!c || !ctx || alpha <= 0.002) return;
    project(mesh, t);
    const { edges, fresh } = mesh;
    const grow = clamp01(t);
    for (let e = 0, k = 0; e < edges.length; e += 2, k += 1) {
      const a = edges[e] ?? 0;
      const b = edges[e + 1] ?? 0;
      const mz = ((qz[a] ?? 0) + (qz[b] ?? 0)) / 2;
      if (mz < -0.04) {
        bins[k] = 0;
        continue;
      }
      const mx = ((qx[a] ?? 0) + (qx[b] ?? 0)) / 2;
      const my = ((qy[a] ?? 0) + (qy[b] ?? 0)) / 2;
      const len = Math.hypot(mx, my, mz) || 1;
      const lit = Math.max(
        0,
        (mx * LIGHT.x + my * LIGHT.y + mz * LIGHT.z) / len,
      );
      const b01 = clamp01(0.62 * lit + 0.38 * Math.max(0, mz));
      bins[k] = 1 + Math.min(4, Math.floor(b01 * 5));
    }
    const lw = clamp(c.strut, 0.25, 4);
    const hovered = 1 + 0.12 * hoverAt;
    for (let bin = 0; bin < BINS; bin += 1) {
      ctx.beginPath();
      let any = false;
      for (let e = 0, k = 0; e < edges.length; e += 2, k += 1) {
        if (bins[k] !== bin) continue;
        const a = edges[e] ?? 0;
        const b = edges[e + 1] ?? 0;
        let x0 = sx[a] ?? 0;
        let y0 = sy[a] ?? 0;
        let x1 = sx[b] ?? 0;
        let y1 = sy[b] ?? 0;
        if ((fresh[k] ?? 0) === 1 && grow < 1) {
          // A new strut draws outward from its middle as the split forms.
          if (grow <= 0.01) continue;
          const mx = (x0 + x1) / 2;
          const my = (y0 + y1) / 2;
          x0 = mx + (x0 - mx) * grow;
          y0 = my + (y0 - my) * grow;
          x1 = mx + (x1 - mx) * grow;
          y1 = my + (y1 - my) * grow;
        }
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        any = true;
      }
      if (!any) continue;
      if (bin >= 4) {
        // The lit struts' bloom: the same path, wide and faint, underneath.
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = bloomStyle.value;
        ctx.lineWidth = lw * 3.6;
        ctx.stroke();
      }
      ctx.globalAlpha = clamp01(alpha * hovered);
      ctx.strokeStyle = binStyle[bin] ?? "rgba(128,128,128,0.5)";
      ctx.lineWidth = lw * (BIN_WIDTH[bin] ?? 1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const drawGlints = (mesh: Mesh, alpha: number) => {
    const c = cfg;
    if (!c || !ctx || alpha <= 0.01) return;
    const strength = clamp01(c.glint);
    if (strength <= 0) return;
    let best = -1;
    let bestG = 0;
    ctx.fillStyle = glintStyle.core;
    for (let v = 0; v < mesh.count; v += 1) {
      const z = qz[v] ?? 0;
      if (z < 0.12) continue;
      const nd =
        (qx[v] ?? 0) * LIGHT.hx + (qy[v] ?? 0) * LIGHT.hy + z * LIGHT.hz;
      let g = nd >= 0.86 ? Math.pow(nd, 30) * strength : 0;
      // Hubs born in the last split flare as they arrive, wherever they are.
      if (flare > 0.01 && (mesh.parentA[v] ?? -1) >= 0)
        g += flare * 0.45 * z * strength;
      if (g < 0.06) continue;
      if (g > bestG) {
        bestG = g;
        best = v;
      }
      ctx.globalAlpha = clamp01(g * 1.4) * alpha;
      ctx.beginPath();
      ctx.arc(sx[v] ?? 0, sy[v] ?? 0, 0.7 + 1.5 * clamp01(g), 0, Math.PI * 2);
      ctx.fill();
    }
    if (best >= 0 && bestG > 0.3) {
      const x = sx[best] ?? 0;
      const y = sy[best] ?? 0;
      const L = 3 + 7 * clamp01(bestG);
      ctx.globalAlpha = clamp01(bestG) * alpha;
      ctx.strokeStyle = glintStyle.halo;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - L, y);
      ctx.lineTo(x + L, y);
      ctx.moveTo(x, y - L);
      ctx.lineTo(x, y + L);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const draw = () => {
    const c = cfg;
    if (!c || !ctx || size.w < 1) return;
    ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);
    if (shadow) {
      const r = radius();
      ctx.save();
      ctx.translate(size.w / 2, size.h / 2 + r * 1.04);
      ctx.scale(1, 0.16);
      ctx.translate(-size.w / 2, -(size.h / 2 + r * 1.04));
      ctx.fillStyle = shadow;
      ctx.fillRect(0, 0, size.w, size.h * 2);
      ctx.restore();
    }
    const now = meshes[tier];
    if (!now) return;
    if (morph === 0) {
      drawMesh(now, 1, 1);
      drawGlints(now, 1);
    } else if (!c.motionSafe) {
      // Reduced motion: the two frames cross-fade; nothing travels.
      const other = meshes[tier + morph];
      const fine = morph > 0 ? other : now;
      const coarse = morph > 0 ? now : other;
      if (fine && coarse) {
        drawMesh(coarse, 1, 1 - clamp01(mt));
        drawMesh(fine, 1, clamp01(mt));
        drawGlints(fine, clamp01(mt));
      }
    } else {
      const fine = morph > 0 ? meshes[tier + 1] : now;
      if (fine) {
        drawMesh(fine, mt, 1);
        drawGlints(fine, 1);
      }
    }
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const speedNow = () => Math.hypot(wx, wy);

  /** Hysteresis: a level splits at its threshold and merges only well below it. */
  const retarget = () => {
    const c = cfg;
    if (!c) return;
    const s = speedNow();
    const top = levels.length - 1;
    const at = (k: number) => c.splitAt * Math.pow(SPLIT_RATIO, k);
    while (target < top && s > at(target)) target += 1;
    while (target > 0 && s < at(target - 1) * MERGE_AT) target -= 1;
  };

  const finishMorph = (completed: boolean) => {
    const dir = morph;
    morph = 0;
    mt = 0;
    mv = 0;
    if (!completed) return;
    tier += dir;
    const mesh = meshes[tier];
    if (dir > 0 && cfg?.motionSafe) flare = 1;
    if (mesh) onTier(mesh.n, mesh.faces, dir > 0 ? "split" : "merge");
  };

  const stepMorph = (dt: number) => {
    const c = cfg;
    if (!c) return;
    if (morph === 0) {
      if (target > tier) {
        morph = 1;
        mt = 0;
        mv = 0;
      } else if (target < tier) {
        morph = -1;
        mt = 1;
        mv = 0;
      } else return;
    }
    // Splitting aims at the finer frame (1), merging at the coarser (0);
    // a reversal mid-way simply aims back.
    const goal = morph > 0 ? (target > tier ? 1 : 0) : target < tier ? 0 : 1;
    if (!c.motionSafe) {
      const d = dt / FADE;
      mt = goal > mt ? Math.min(goal, mt + d) : Math.max(goal, mt - d);
      if (mt === goal) {
        const done = morph > 0 ? goal === 1 : goal === 0;
        // In a fade, `mt` is the share of the target frame either way.
        finishMorph(done);
      }
      return;
    }
    // A split is an event: snap's one overshoot pushes the new hubs past the
    // surface and back. A merge is a settling: glide, no overshoot.
    const sp = goal === 1 ? springs.snap : springs.glide;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      const a = (sp.stiffness * (goal - mt) - sp.damping * mv) / sp.mass;
      mv += a * h;
      mt += mv * h;
    }
    if (Math.abs(goal - mt) < 0.003 && Math.abs(mv) < 0.04) {
      mt = goal;
      const done = morph > 0 ? goal === 1 : goal === 0;
      finishMorph(done);
    }
  };

  const step = (dt: number, now: number) => {
    const c = cfg;
    if (!c) return;
    const spin = c.motionSafe && !c.paused;
    if (held && !dragging) {
      // Caught: a hand on a spinning frame stops it.
      wx = 0;
      wy = 0;
    } else if (dragging) {
      // The drag turns the frame itself; its speed estimate fades when the finger rests.
      if (now - lastMove > 40) {
        const k = Math.exp(-dt / 0.06);
        wx *= k;
        wy *= k;
      }
    } else {
      const tau = braking ? 0.16 : lerp(0.35, 4.5, clamp01(c.inertia));
      const idle = spin ? clamp(c.idleSpin, -3, 3) : 0;
      const k = Math.exp(-dt / tau);
      wx *= k;
      wy = idle + (wy - idle) * k;
      if (braking && Math.hypot(wx, wy - idle) < 0.05) braking = false;
      if (spin) {
        const s = Math.hypot(wx, wy);
        if (s > 1e-5) rotate(wx, wy, 0, s * dt);
      }
    }
    retarget();
    stepMorph(dt);
    if (flare > 0) flare = flare < 0.01 ? 0 : flare * Math.exp(-dt / 0.35);
    hoverAt += (hoverTo - hoverAt) * (1 - Math.exp(-dt / 0.12));
    if (Math.abs(hoverTo - hoverAt) < 0.005) hoverAt = hoverTo;
  };

  const moving = () => {
    const c = cfg;
    if (!c) return false;
    if (held || dragging || braking || morph !== 0 || target !== tier)
      return true;
    if (flare > 0 || hoverAt !== hoverTo) return true;
    const idle = c.motionSafe && !c.paused ? c.idleSpin : 0;
    if (Math.abs(idle) > 1e-4) return true;
    return Math.hypot(wx, wy) > 0.01;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt, now);
    draw();
    if (moving()) frame = window.requestAnimationFrame(tick);
    else {
      wx = 0;
      wy = 0;
      last = 0;
    }
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (w < 1 || h < 1) return;
    const dpr = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    size.w = w;
    size.h = h;
    size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    paintShadow();
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        restPose(next.tilt, R);
        setLevels();
        readColours();
        resize();
        return;
      }
      if (
        was.frequency !== next.frequency ||
        was.maxFrequency !== next.maxFrequency
      ) {
        // A new base: the frame starts again there. A new base frequency is
        // reported by the component itself; a new cap only if it moved the frame.
        const moved = tier !== 0 || morph !== 0;
        setLevels();
        const mesh = meshes[0];
        if (moved && was.frequency === next.frequency && mesh)
          onTier(mesh.n, mesh.faces, "reset");
      }
      if (was.tilt !== next.tilt) restPose(next.tilt, R);
      if (was.colorKey !== next.colorKey) readColours();
      if (was.dpr !== next.dpr) resize();
      if (was.motionSafe !== next.motionSafe && morph !== 0) {
        // Switching mode mid-morph: finish where it was heading.
        finishMorph(morph > 0 ? target > tier : target < tier);
      }
      draw();
      kick();
    },
    grab() {
      held = true;
      braking = false;
      kick();
    },
    letGo() {
      held = false;
      dragging = false;
      kick();
    },
    dragBy(dx, dy, at) {
      const r = Math.max(20, radius());
      dragging = true;
      held = true;
      const len = Math.hypot(dx, dy);
      if (len > 0) rotate(-dy, dx, 0, len / r);
      const dtMove = Math.max(0.004, Math.min(0.1, (at - lastMove) / 1000));
      if (lastMove > 0) {
        // The speed under the finger, smoothed over a couple of events.
        wx = wx * 0.5 + (-dy / r / dtMove) * 0.5;
        wy = wy * 0.5 + (dx / r / dtMove) * 0.5;
      }
      lastMove = at;
      draw();
      kick();
    },
    dragEnd(vx, vy) {
      const r = Math.max(20, radius());
      dragging = false;
      held = false;
      lastMove = 0;
      // The release velocity is the coast's start, capped so a wild throw stays legible.
      const ox = clamp(-vy / r, -30, 30);
      const oy = clamp(vx / r, -30, 30);
      wx = ox;
      wy = oy;
      kick();
    },
    impulse(ax, ay) {
      const c = cfg;
      braking = false;
      if (c && !c.motionSafe) {
        // Reduced motion: a key turns the frame a fixed step; its speed still counts.
        rotate(ay, ax, 0, Math.PI / 12);
      }
      wx = clamp(wx + ay, -30, 30);
      wy = clamp(wy + ax, -30, 30);
      draw();
      kick();
    },
    brake() {
      const c = cfg;
      const idle = c && c.motionSafe && !c.paused ? c.idleSpin : 0;
      if (Math.hypot(wx, wy - idle) < 0.1) return false;
      braking = true;
      kick();
      return true;
    },
    hover(on) {
      hoverTo = on ? 1 : 0;
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    setVisible(on) {
      visible = on;
      if (on) {
        draw();
        kick();
      }
    },
    wake() {
      draw();
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

/* ------------------------------- component ------------------------------- */

/**
 * A wireframe geodesic sphere you spin by hand, whose frame gets finer the
 * faster it turns. Drag it and it turns 1:1 under the finger; let go and it
 * coasts on the release velocity for as long as `inertia` allows, then eases
 * back to a slow turntable spin. Past `splitAt` rad/s every strut splits at
 * its middle: the new hubs are pushed out from the old struts' chords to the
 * sphere on the snap spring — one overshoot, a visible pop — while the new
 * struts draw out from their centres; faster still, it splits again. As it
 * coasts down it merges back on glide, the struts retracting into their
 * midpoints. Near struts are lit from a light high on the left, the lit ones
 * blooming faintly, and the front hubs catch a glint that slides from hub to
 * hub as it turns.
 *
 * Arrow keys spin it (Shift for more), so repeated presses split it as a
 * flick does; Home brakes it. Under reduced motion it turns only while held
 * or stepped by a key, and the frames cross-fade instead of splitting.
 */
export function GeodesicSpin({
  frequency = 2,
  maxFrequency = 8,
  splitAt = 3.2,
  inertia = 0.6,
  strut = 1.2,
  idleSpin = 0.2,
  tilt = 16,
  glint = 0.7,
  perspective = 0.35,
  color = "var(--ink-2)",
  lightColor = "var(--accent-bright)",
  readout = true,
  onFrequencyChange,
  paused = false,
  disabled = false,
  label = "Geodesic frame",
  dpr = 2,
  className,
}: GeodesicSpinProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  // A url(#…) reference must not carry the punctuation useId may produce.
  const shadowId = `geodesic-shadow-${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);

  const base = levelsOf(frequency, maxFrequency)[0] ?? 2;
  const [shown, setShown] = React.useState(base);
  const [seenBase, setSeenBase] = React.useState(base);
  if (seenBase !== base) {
    // A new base frequency resets the frame there, here in render.
    setSeenBase(base);
    setShown(base);
  }
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const report = React.useRef(onFrequencyChange);
  React.useEffect(() => {
    report.current = onFrequencyChange;
  });

  // The frequency is state: the host hears it from the first commit too.
  React.useEffect(() => {
    report.current?.(base, 20 * base * base);
  }, [base]);

  const config: Config = {
    frequency,
    maxFrequency,
    splitAt: clamp(splitAt, 0.2, 20),
    inertia,
    strut,
    idleSpin,
    tilt,
    glint,
    perspective,
    paused,
    motionSafe,
    dpr,
    colorKey: `${color}|${lightColor}`,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, (n, faces, kind) => {
      setShown(n);
      if (kind !== "reset") {
        setSaid((s) => ({
          n: s.n + 1,
          text: `${kind === "split" ? "Split" : "Merged"} to ${n}V, ${faces} faces.`,
        }));
      }
      report.current?.(n, faces);
    });
    engine.current = e;
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visibleRef.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visibleRef.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visibleRef.current = false;
    };
  }, []);

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: () => engine.current?.grab(),
    onMove: ({ delta, event }) =>
      engine.current?.dragBy(delta.x, delta.y, event.timeStamp),
    onEnd: ({ velocity }) => engine.current?.dragEnd(velocity.x, velocity.y),
    onCancel: () => engine.current?.letGo(),
    onTap: () => engine.current?.letGo(),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.target !== event.currentTarget) return;
    const e = engine.current;
    if (!e) return;
    const kick = event.shiftKey ? 4 : 1.6;
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        e.impulse(-kick, 0);
        break;
      case "ArrowRight":
        event.preventDefault();
        e.impulse(kick, 0);
        break;
      case "ArrowUp":
        event.preventDefault();
        e.impulse(0, kick);
        break;
      case "ArrowDown":
        event.preventDefault();
        e.impulse(0, -kick);
        break;
      case "Home":
        event.preventDefault();
        e.brake();
        break;
      case "Escape":
        // Only an Escape that actually stopped something is ours.
        if (e.brake()) event.preventDefault();
        break;
      default:
        break;
    }
  };

  const still = React.useMemo(
    () => stillPaths(base, tilt, perspective),
    [base, tilt, perspective],
  );
  const faces = 20 * shown * shown;

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="geodesic sphere"
      aria-label={label}
      aria-describedby={hintId}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
      {...drag}
      onPointerDown={(event) => {
        drag.onPointerDown(event);
        if (disabled) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        engine.current?.grab();
      }}
      onPointerEnter={() => engine.current?.hover(true)}
      onPointerLeave={(event) => {
        engine.current?.hover(false);
        // A press that never became a drag and left the box is no longer holding it.
        if (event.buttons === 0) engine.current?.letGo();
      }}
      className={cn(
        "group/geodesic-spin relative isolate h-52 w-full touch-none overflow-clip rounded-3 select-none",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <span id={hintId} className="sr-only">
        Drag or use the arrow keys to spin it. Faster spins subdivide the frame.
        Home stops it.
      </span>
      {/* The still: the server's frame and the first paint. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-300 group-data-live/geodesic-spin:opacity-0"
      >
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 size-full"
        >
          <defs>
            <radialGradient id={shadowId}>
              <stop offset="0" style={{ stopColor: color, stopOpacity: 0.2 }} />
              <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
            </radialGradient>
          </defs>
          <ellipse
            cx={50}
            cy={91.6}
            rx={32.8}
            ry={5.25}
            fill={`url(#${shadowId})`}
          />
          <path
            d={still.back}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            style={{ stroke: color, strokeWidth: strut * 0.62, opacity: 0.2 }}
          />
          <path
            d={still.front}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            style={{
              stroke: `color-mix(in oklab, ${color} 70%, ${lightColor})`,
              strokeWidth: strut,
              opacity: 0.8,
            }}
          />
        </svg>
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/geodesic-spin:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[color, lightColor, "var(--background)"].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      {readout ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-2.5 left-3 font-mono text-[10px] leading-none tracking-[0.08em] text-ink-3 uppercase tabular-nums"
        >
          <span className="text-foreground">{shown}V</span> · {faces} faces
        </span>
      ) : null}
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
