"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type StarGeodeTrigger = "press" | "scroll" | "both";

export type StarGeodeProps = {
  /** How finely the shell is cut: 1 (20 facets) to 4 (320). @default 2 */
  detail?: number;
  /** How far the pieces drift apart when it opens, 0 to 1. The sphere sizes itself so the open pieces stay in the box. @default 0.45 */
  explode?: number;
  /** How much the stars twinkle, 0 (steady) to 1. @default 0.5 */
  twinkle?: number;
  /** How many faint stars are scattered across the facets, 0 to 600, besides the one at every vertex. @default 160 */
  starCount?: number;
  /** Controlled: whether the geode is held open. */
  open?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultOpen?: boolean;
  /** Fires from the press, key or timer that opened or closed it, with the new state. */
  onOpenChange?: (open: boolean) => void;
  /** Close by itself this long after opening, ms; 0 keeps it open until pressed again. @default 2600 */
  autoClose?: number;
  /** What cracks it open: a press, the page scrolling past it, or both. @default "both" */
  trigger?: StarGeodeTrigger;
  /** The shell's slow turn, degrees per second, 0 to 60. @default 8 */
  spin?: number;
  /** The stars and the seams. @default "var(--foreground)" */
  color?: string;
  /** The crystal on the inner faces. @default "var(--accent-bright)" */
  crystal?: string;
  /** Hold the turn and the twinkle; opening, closing and dragging still move. @default false */
  paused?: boolean;
  /** Seeds the scattered stars and how the pieces part, so two geodes never break alike. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** No opening or turning by hand or key. @default false */
  disabled?: boolean;
  /** The accessible name of the geode's switch. @default "Open the geode" */
  label?: string;
  /** Sizes the box; it fills its parent by default. */
  className?: string;
};

const STEP = 1 / 120;
/** Camera distance, in sphere radii: enough perspective to read as 3D. */
const CAMERA = 7;
/** How far a piece turns about its own axis when fully open, rad. */
const TURN = 0.9;
/** Keyboard spin per Shift+arrow, rad. */
const KEY_SPIN = (20 * Math.PI) / 180;
/** Light on the inner faces: from the upper left, toward the viewer. */
const LIGHT = normalize3(-0.45, 0.55, 0.7);
const HALF = normalize3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
/** A flick's spin decays by this time constant, s, back to the slow turn. */
const COAST = 0.9;
/** Reduced motion / a new explode distance: how long the preview holds open, ms. */
const PREVIEW = 900;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

function normalize3(x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l] as const;
}

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x6a09e667) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Shell = {
  faces: number;
  /** Per face: three corners (9), centroid (3), outward normal (3). */
  geo: Float32Array;
  /** Per face: drift share, turn axis (3), turn share, delay. */
  part: Float32Array;
  /** Scattered stars: face, barycentric a and b, brightness, twinkle phase, rate. */
  stars: Float32Array;
  starCount: number;
};

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
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
] as const;
const ICO_F = [
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
] as const;

/** One of the icosahedron's twelve corners, on the unit sphere. */
function corner(i: number) {
  const v = ICO_V[i] ?? ICO_V[0];
  return normalize3(v[0], v[1], v[2]);
}

/** The geodesic shell: each icosahedron face cut n×n and pushed onto the sphere, with each piece's way of parting. */
function buildShell(detail: number, starCount: number, seed: number): Shell {
  const n = clamp(Math.round(detail), 1, 4);
  const faces = 20 * n * n;
  const geo = new Float32Array(faces * 15);
  const part = new Float32Array(faces * 6);
  const rand = lcg(seed * 41 + n);
  // The crack starts on a seeded side and runs across the shell from there.
  const crack = normalize3(
    rand() - 0.5,
    rand() * 0.6 + 0.2,
    rand() * 0.5 + 0.5,
  );
  let f = 0;
  const point = (
    a: readonly number[],
    b: readonly number[],
    c: readonly number[],
    i: number,
    j: number,
  ) => {
    const k = n - i - j;
    return normalize3(
      ((a[0] ?? 0) * k + (b[0] ?? 0) * i + (c[0] ?? 0) * j) / n,
      ((a[1] ?? 0) * k + (b[1] ?? 0) * i + (c[1] ?? 0) * j) / n,
      ((a[2] ?? 0) * k + (b[2] ?? 0) * i + (c[2] ?? 0) * j) / n,
    );
  };
  const push = (
    p: readonly number[],
    q: readonly number[],
    r: readonly number[],
  ) => {
    const cx = ((p[0] ?? 0) + (q[0] ?? 0) + (r[0] ?? 0)) / 3;
    const cy = ((p[1] ?? 0) + (q[1] ?? 0) + (r[1] ?? 0)) / 3;
    const cz = ((p[2] ?? 0) + (q[2] ?? 0) + (r[2] ?? 0)) / 3;
    const ux = (q[0] ?? 0) - (p[0] ?? 0);
    const uy = (q[1] ?? 0) - (p[1] ?? 0);
    const uz = (q[2] ?? 0) - (p[2] ?? 0);
    const vx = (r[0] ?? 0) - (p[0] ?? 0);
    const vy = (r[1] ?? 0) - (p[1] ?? 0);
    const vz = (r[2] ?? 0) - (p[2] ?? 0);
    let [nx, ny, nz] = normalize3(
      uy * vz - uz * vy,
      uz * vx - ux * vz,
      ux * vy - uy * vx,
    );
    let second = q;
    let third = r;
    // Outward winding, whatever order the cut produced.
    if (nx * cx + ny * cy + nz * cz < 0) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
      second = r;
      third = q;
    }
    const o = f * 15;
    geo.set([p[0] ?? 0, p[1] ?? 0, p[2] ?? 0], o);
    geo.set([second[0] ?? 0, second[1] ?? 0, second[2] ?? 0], o + 3);
    geo.set([third[0] ?? 0, third[1] ?? 0, third[2] ?? 0], o + 6);
    geo.set([cx, cy, cz, nx, ny, nz], o + 9);
    const axis = normalize3(rand() - 0.5, rand() - 0.5, rand() - 0.5);
    const near =
      (cx * crack[0] + cy * crack[1] + cz * crack[2]) / Math.hypot(cx, cy, cz);
    part.set(
      [
        0.75 + rand() * 0.5,
        axis[0],
        axis[1],
        axis[2],
        (0.55 + rand() * 0.45) * (rand() < 0.5 ? -1 : 1),
        clamp01((1 - near) / 2 + (rand() - 0.5) * 0.15),
      ],
      f * 6,
    );
    f += 1;
  };
  for (const tri of ICO_F) {
    const a = corner(tri[0]);
    const b = corner(tri[1]);
    const c = corner(tri[2]);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n - i; j += 1) {
        push(
          point(a, b, c, i, j),
          point(a, b, c, i + 1, j),
          point(a, b, c, i, j + 1),
        );
        if (i + j < n - 1) {
          push(
            point(a, b, c, i + 1, j),
            point(a, b, c, i + 1, j + 1),
            point(a, b, c, i, j + 1),
          );
        }
      }
    }
  }
  const count = clamp(Math.round(starCount), 0, 600);
  const stars = new Float32Array(count * 6);
  for (let s = 0; s < count; s += 1) {
    let a = rand();
    let b = rand();
    if (a + b > 1) {
      a = 1 - a;
      b = 1 - b;
    }
    stars.set(
      [
        Math.floor(rand() * faces),
        a,
        b,
        0.35 + rand() * 0.65,
        rand() * Math.PI * 2,
        1.2 + rand() * 2.8,
      ],
      s * 6,
    );
  }
  return { faces, geo, part, stars, starCount: count };
}

type Rgb = readonly [number, number, number];

let probe: CanvasRenderingContext2D | null = null;
function readRgb(el: Element | undefined): Rgb {
  if (!el) return [0, 0, 0];
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return [0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "rgb(0, 0, 0)";
  probe.fillStyle = getComputedStyle(el).color;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
}

type Config = {
  detail: number;
  explode: number;
  twinkle: number;
  starCount: number;
  spin: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  scroll: boolean;
  colourKey: string;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (on: boolean) => void;
  setOpen: (open: boolean) => void;
  preview: () => void;
  scrollBy: (px: number) => void;
  grab: () => void;
  turnBy: (dx: number, dy: number) => void;
  letGo: (vx: number, vy: number) => void;
  spinBy: (yaw: number, pitch: number) => void;
  radius: () => number;
  dispose: () => void;
};

/** The shell, its turn and its opening, outside React. */
function createGeode(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
): Engine {
  let cfg: Config | null = null;
  let shell: Shell | null = null;
  let frame = 0;
  let last = 0;
  let carry = 0;
  let disposed = false;
  let visible = false;
  let live = false;
  let previewUntil = 0;
  const size = { w: 0, h: 0, dpr: 1 };
  const paint = {
    star: "rgb(0, 0, 0)",
    seam: "rgb(0, 0, 0)",
    crystal: "rgb(0, 0, 0)",
    lite: "rgb(255, 255, 255)",
  };
  const sim = {
    t: 0,
    yaw: 0.4,
    pitch: -0.32,
    /** The flick's leftover spin, rad/s, and the keys' pending turn. */
    wy: 0,
    wx: 0,
    keyYaw: 0,
    keyPitch: 0,
    dragging: false,
    /** How open: the spring, its velocity, and the held state. */
    o: 0,
    v: 0,
    held: false,
    /** Scrolling's push, 0 to 1, decaying. */
    kick: 0,
  };
  /** Per face, this frame: screen corners (6), depth, facing, light. */
  let screen = new Float32Array(0);
  let order = new Uint16Array(0);
  let depth = new Float32Array(0);
  /** Made once: sorting with a fresh arrow each frame would allocate one. */
  const byDepth = (a: number, b: number) => (depth[a] ?? 0) - (depth[b] ?? 0);

  const rebuild = (c: Config) => {
    shell = buildShell(c.detail, c.starCount, c.seed);
    screen = new Float32Array(shell.faces * 9);
    order = new Uint16Array(shell.faces);
    depth = new Float32Array(shell.faces);
  };

  const paintColours = () => {
    const kids = carriers.children;
    const s = readRgb(kids[0]);
    const k = readRgb(kids[1]);
    paint.star = `rgb(${s[0]}, ${s[1]}, ${s[2]})`;
    paint.seam = paint.star;
    paint.crystal = `rgb(${k[0]}, ${k[1]}, ${k[2]})`;
    paint.lite = `rgb(${Math.round(k[0] + (255 - k[0]) * 0.6)}, ${Math.round(k[1] + (255 - k[1]) * 0.6)}, ${Math.round(k[2] + (255 - k[2]) * 0.6)})`;
  };

  /** The sphere's radius on screen: it shrinks as the pieces drift further, so open pieces stay in the box. */
  const radius = () => {
    const c = cfg;
    const e = clamp01(c?.explode ?? 0.45);
    return (Math.min(size.w, size.h) * 0.44) / ((1.05 + 0.95 * e) * 1.12);
  };

  const draw = () => {
    const c = cfg;
    const sh = shell;
    const ctx = canvas.getContext("2d");
    if (!c || !sh || !ctx || !visible || size.w < 1) return;
    const { w, h, dpr } = size;
    const R = radius();
    const cx = w / 2;
    const cy = h / 2;
    const cyaw = Math.cos(sim.yaw + sim.keyYaw);
    const syaw = Math.sin(sim.yaw + sim.keyYaw);
    const cp = Math.cos(sim.pitch + sim.keyPitch);
    const sp = Math.sin(sim.pitch + sim.keyPitch);
    const reach = clamp01(c.explode) * 0.85;
    const geo = sh.geo;
    const part = sh.part;
    const o = sim.o;
    const t = sim.t;

    for (let f = 0; f < sh.faces; f += 1) {
      const g = f * 15;
      const q = f * 6;
      const delay = part[q + 5] ?? 0;
      // Pieces near the crack leave first; past closed (the snap's
      // overshoot) they all draw in together.
      const of = o <= 0 ? o : smoothstep(clamp01((o - 0.35 * delay) / 0.65));
      const drift = reach * (part[q] ?? 1) * of;
      const angle = TURN * (part[q + 4] ?? 1) * of;
      const ax = part[q + 1] ?? 0;
      const ay = part[q + 2] ?? 0;
      const az = part[q + 3] ?? 1;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const ccx = geo[g + 9] ?? 0;
      const ccy = geo[g + 10] ?? 0;
      const ccz = geo[g + 11] ?? 0;
      let zsum = 0;
      for (let v = 0; v < 4; v += 1) {
        // Corners 0–2, then the normal (as v = 3) through the same turn.
        const isNormal = v === 3;
        const px = isNormal ? (geo[g + 12] ?? 0) : (geo[g + v * 3] ?? 0) - ccx;
        const py = isNormal
          ? (geo[g + 13] ?? 0)
          : (geo[g + v * 3 + 1] ?? 0) - ccy;
        const pz = isNormal
          ? (geo[g + 14] ?? 0)
          : (geo[g + v * 3 + 2] ?? 0) - ccz;
        // Rodrigues: the piece turns about its own axis.
        const dot = ax * px + ay * py + az * pz;
        let rx = px * ca + (ay * pz - az * py) * sa + ax * dot * (1 - ca);
        let ry = py * ca + (az * px - ax * pz) * sa + ay * dot * (1 - ca);
        let rz = pz * ca + (ax * py - ay * px) * sa + az * dot * (1 - ca);
        if (!isNormal) {
          rx += ccx * (1 + drift);
          ry += ccy * (1 + drift);
          rz += ccz * (1 + drift);
        }
        // The shell's own turn: yaw about the vertical, then pitch.
        const x1 = rx * cyaw + rz * syaw;
        const z1 = -rx * syaw + rz * cyaw;
        const y2 = ry * cp - z1 * sp;
        const z2 = ry * sp + z1 * cp;
        const s = f * 9;
        if (isNormal) {
          screen[s + 6] = z2;
          // Light on whichever side faces us: the inner face when the
          // outer one turns away.
          const side = z2 >= 0 ? 1 : -1;
          const lit = side * (x1 * LIGHT[0] + y2 * LIGHT[1] + z2 * LIGHT[2]);
          const sheen = side * (x1 * HALF[0] + y2 * HALF[1] + z2 * HALF[2]);
          screen[s + 7] = Math.max(0, lit);
          screen[s + 8] = Math.pow(Math.max(0, sheen), 18);
        } else {
          const persp = CAMERA / (CAMERA - z2);
          screen[s + v * 2] = cx + x1 * R * persp;
          screen[s + v * 2 + 1] = cy - y2 * R * persp;
          zsum += z2;
        }
      }
      depth[f] = zsum / 3;
      order[f] = f;
    }
    // Far to near: the painter's order.
    order.sort(byDepth);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineJoin = "round";
    const inner = 0.07 + 0.83 * Math.pow(clamp01(o), 0.7);
    const twk = c.motionSafe && !c.paused ? clamp01(c.twinkle) : 0;
    const stars = sh.stars;
    for (let k = 0; k < sh.faces; k += 1) {
      const f = order[k] ?? 0;
      const s = f * 9;
      const facing = screen[s + 6] ?? 0;
      const near = clamp01(((depth[f] ?? 0) + 1) / 2);
      ctx.beginPath();
      ctx.moveTo(screen[s] ?? 0, screen[s + 1] ?? 0);
      ctx.lineTo(screen[s + 2] ?? 0, screen[s + 3] ?? 0);
      ctx.lineTo(screen[s + 4] ?? 0, screen[s + 5] ?? 0);
      ctx.closePath();
      if (facing < 0) {
        // The inner face: crystal, lit, with a sheen as it turns.
        ctx.fillStyle = paint.crystal;
        ctx.globalAlpha = inner * (0.28 + 0.72 * (screen[s + 7] ?? 0));
        ctx.fill();
        const sheen = screen[s + 8] ?? 0;
        if (sheen > 0.02) {
          ctx.fillStyle = paint.lite;
          ctx.globalAlpha = Math.min(0.85, sheen * inner);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = paint.star;
        ctx.globalAlpha = 0.035;
        ctx.fill();
      }
      ctx.strokeStyle = paint.seam;
      ctx.lineWidth = 0.6;
      ctx.globalAlpha = (facing >= 0 ? 0.3 : 0.12) * (0.45 + 0.55 * near);
      ctx.stroke();
      // The piece's corners are stars too: every vertex carries one.
      ctx.fillStyle = paint.star;
      ctx.globalAlpha = 0.5 + 0.45 * near;
      const dot = 1.2 + 0.9 * near;
      for (let v = 0; v < 3; v += 1) {
        ctx.fillRect(
          (screen[s + v * 2] ?? 0) - dot / 2,
          (screen[s + v * 2 + 1] ?? 0) - dot / 2,
          dot,
          dot,
        );
      }
    }
    // Scattered stars ride their pieces; drawn last, faint, by depth.
    for (let p = 0; p < sh.starCount; p += 1) {
      const f = stars[p * 6] ?? 0;
      const a = stars[p * 6 + 1] ?? 0;
      const b = stars[p * 6 + 2] ?? 0;
      const s = f * 9;
      const x =
        (screen[s] ?? 0) * (1 - a - b) +
        (screen[s + 2] ?? 0) * a +
        (screen[s + 4] ?? 0) * b;
      const y =
        (screen[s + 1] ?? 0) * (1 - a - b) +
        (screen[s + 3] ?? 0) * a +
        (screen[s + 5] ?? 0) * b;
      const near = clamp01(((depth[f] ?? 0) + 1) / 2);
      const glint =
        1 -
        twk *
          0.75 *
          (0.5 +
            0.5 *
              Math.sin(t * (stars[p * 6 + 5] ?? 2) + (stars[p * 6 + 4] ?? 0)));
      ctx.globalAlpha = (stars[p * 6 + 3] ?? 0.5) * glint * (0.25 + 0.6 * near);
      const dot = 0.8 + 0.7 * near;
      ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
    }
    ctx.globalAlpha = 1;
    if (!live) {
      live = true;
      root.setAttribute("data-live", "");
    }
  };

  /** Advances the turn, the coast, the opening spring and the scroll's push; says whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const turning = c.motionSafe && !c.paused && c.spin > 0;
    if (turning || (c.motionSafe && !c.paused && c.twinkle > 0)) {
      sim.t += dt;
      moving = true;
    }
    if (turning && !sim.dragging) sim.yaw += ((c.spin * Math.PI) / 180) * dt;
    if (!sim.dragging && c.motionSafe) {
      const k = Math.exp(-dt / COAST);
      if (Math.abs(sim.wy) + Math.abs(sim.wx) > 0.002) {
        sim.yaw += sim.wy * dt;
        sim.pitch = clamp(sim.pitch + sim.wx * dt, -1.2, 1.2);
        sim.wy *= k;
        sim.wx *= k;
        moving = true;
      } else {
        sim.wy = 0;
        sim.wx = 0;
      }
    }
    // The keys' turns glide in and are folded into the shell's turn.
    if (Math.abs(sim.keyYaw) + Math.abs(sim.keyPitch) > 0.0005) {
      const ease = c.motionSafe ? 1 - Math.exp(-dt * 9) : 1;
      const dy = sim.keyYaw * ease;
      const dp = sim.keyPitch * ease;
      sim.yaw += dy;
      sim.pitch = clamp(sim.pitch + dp, -1.2, 1.2);
      sim.keyYaw -= dy;
      sim.keyPitch -= dp;
      moving = true;
    } else {
      sim.keyYaw = 0;
      sim.keyPitch = 0;
    }
    if (sim.kick > 0) {
      sim.kick = Math.max(0, sim.kick * Math.exp(-dt * 2.4) - dt * 0.05);
      moving = true;
    }
    const now = performance.now();
    const target = Math.max(
      sim.held || now < previewUntil ? 1 : 0,
      c.scroll ? Math.min(0.85, sim.kick) : 0,
    );
    if (now < previewUntil) moving = true;
    if (!c.motionSafe) {
      sim.o = target;
      sim.v = 0;
      return moving;
    }
    // Opening drifts; closing snaps, so the pieces click home with one
    // crisp overshoot.
    const S = target > sim.o ? springs.drift : springs.snap;
    carry += dt;
    let steps = 0;
    while (carry >= STEP && steps < 8) {
      carry -= STEP;
      steps += 1;
      const a = (-S.stiffness * (sim.o - target) - S.damping * sim.v) / S.mass;
      sim.v += a * STEP;
      sim.o += sim.v * STEP;
    }
    if (steps === 8) carry = 0;
    if (Math.abs(sim.o - target) < 0.0008 && Math.abs(sim.v) < 0.004) {
      sim.o = target;
      sim.v = 0;
    } else moving = true;
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
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
    draw();
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (
        !was ||
        was.detail !== next.detail ||
        was.starCount !== next.starCount ||
        was.seed !== next.seed
      )
        rebuild(next);
      if (!was) {
        paintColours();
        resize();
        return;
      }
      if (was.colourKey !== next.colourKey) paintColours();
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (!next.motionSafe) {
        sim.wx = 0;
        sim.wy = 0;
        step(0);
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      paintColours();
      draw();
    },
    setVisible(on) {
      visible = on;
      if (on) {
        draw();
        kick();
      }
    },
    setOpen(open) {
      sim.held = open;
      if (cfg && !cfg.motionSafe) step(0);
      draw();
      kick();
    },
    preview() {
      previewUntil = performance.now() + PREVIEW;
      if (cfg && !cfg.motionSafe) step(0);
      draw();
      kick();
    },
    scrollBy(px) {
      const c = cfg;
      if (!c || !c.motionSafe || !c.scroll || !visible) return;
      sim.kick = Math.min(1.2, sim.kick + Math.abs(px) * 0.006);
      kick();
    },
    grab() {
      sim.dragging = true;
      sim.wx = 0;
      sim.wy = 0;
    },
    turnBy(dx, dy) {
      const R = radius() || 1;
      sim.yaw += dx / R;
      sim.pitch = clamp(sim.pitch + dy / R, -1.2, 1.2);
      draw();
      kick();
    },
    letGo(vx, vy) {
      sim.dragging = false;
      const R = radius() || 1;
      if (cfg?.motionSafe) {
        sim.wy = clamp(vx / R, -12, 12);
        sim.wx = clamp(vy / R, -12, 12);
      }
      kick();
    },
    spinBy(yaw, pitch) {
      sim.keyYaw += yaw;
      sim.keyPitch += pitch;
      if (cfg && !cfg.motionSafe) step(0);
      draw();
      kick();
    },
    radius,
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * A shell of stars on a slowly turning sphere, linked into fine triangles: an
 * icosahedron cut into 20 to 320 facets and pushed onto the sphere, a star at
 * every vertex and fainter ones scattered across the faces. The outer faces
 * are almost clear and the inner ones are crystal, so closed, the far half
 * glows faintly through the near half.
 *
 * Opened by a press, a key, or the page scrolling past, it breaks along its
 * seams: every triangle drifts outward with its stars attached, starting
 * from a seeded crack, and turns about its own axis so its inner face swings
 * round and catches the light — opening on springs.drift, closing on
 * springs.snap so the pieces click back into one sphere with a single crisp
 * overshoot. A drag spins it 1:1 and a flick coasts back to the slow turn.
 * It is a switch: Space or Enter toggles it, Right/Up open and Left/Down
 * close, Shift+arrows turn it. Under reduced motion it holds still, opens and
 * closes as instant swaps, and turns only under the hand.
 */
export function StarGeode({
  detail = 2,
  explode = 0.45,
  twinkle = 0.5,
  starCount = 160,
  open,
  defaultOpen = false,
  onOpenChange,
  autoClose = 2600,
  trigger = "both",
  spin = 8,
  color = "var(--foreground)",
  crystal = "var(--accent-bright)",
  paused = false,
  seed = 1,
  dpr = 2,
  disabled = false,
  label = "Open the geode",
  className,
}: StarGeodeProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [own, setOwn] = React.useState(defaultOpen);
  const isOpen = open ?? own;
  const paints = React.useMemo(
    () => [color, crystal] as const,
    [color, crystal],
  );
  const colourKey = paints.join("|");
  const pressMode = trigger !== "scroll";

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const report = React.useRef(onOpenChange);
  const closeTimer = React.useRef(0);
  const shownOpen = React.useRef(isOpen);

  const config: Config = {
    detail,
    explode,
    twinkle,
    starCount,
    spin: clamp(spin, 0, 60),
    paused,
    seed,
    dpr,
    motionSafe,
    scroll: trigger !== "press",
    colourKey,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onOpenChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createGeode(root, canvas, carriers);
    engine.current = e;
    e.configure(latest.current);
    e.setOpen(shownOpen.current);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      e.setVisible(Boolean(entry?.isIntersecting) && !document.hidden);
    });
    watcher.observe(root);
    const onVisibility = () => {
      const r = root.getBoundingClientRect();
      e.setVisible(
        !document.hidden && r.bottom > 0 && r.top < window.innerHeight,
      );
    };
    document.addEventListener("visibilitychange", onVisibility);
    // Scrolling past cracks it open: read how far the box moved, from any
    // scroller, without ever taking the scroll.
    let lastTop = root.getBoundingClientRect().top;
    const onScroll = () => {
      const top = root.getBoundingClientRect().top;
      e.scrollBy(top - lastTop);
      lastTop = top;
    };
    window.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll, { capture: true });
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  // The held state, from a press, a key, a timer or the host.
  React.useEffect(() => {
    shownOpen.current = isOpen;
    engine.current?.setOpen(isOpen);
  }, [isOpen]);

  /** Opens or closes from a press, a key or the timer: held if uncontrolled, and reported. */
  const commit = React.useCallback(
    (next: boolean) => {
      window.clearTimeout(closeTimer.current);
      if (next === (open ?? own)) return;
      if (open === undefined) setOwn(next);
      report.current?.(next);
    },
    [open, own],
  );

  // Open, it closes itself after `autoClose`: the timer is what closes it,
  // so it reports from the timer.
  React.useEffect(() => {
    if (!isOpen || autoClose <= 0) return;
    const id = window.setTimeout(() => commit(false), autoClose);
    closeTimer.current = id;
    return () => window.clearTimeout(id);
  }, [isOpen, autoClose, commit]);

  // A new drift distance on a closed geode shows itself: it opens a moment.
  const shownExplode = React.useRef(explode);
  React.useEffect(() => {
    if (shownExplode.current === explode) return;
    shownExplode.current = explode;
    if (!shownOpen.current) engine.current?.preview();
  }, [explode]);

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: () => engine.current?.grab(),
    onMove: ({ delta }) => engine.current?.turnBy(delta.x, delta.y),
    onEnd: ({ velocity }) => engine.current?.letGo(velocity.x, velocity.y),
    onCancel: () => engine.current?.letGo(0, 0),
    onTap: () => {
      if (pressMode) commit(!isOpen);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const e = engine.current;
    if (event.shiftKey) {
      const turns: Record<string, [number, number]> = {
        ArrowLeft: [-KEY_SPIN, 0],
        ArrowRight: [KEY_SPIN, 0],
        ArrowUp: [0, -KEY_SPIN],
        ArrowDown: [0, KEY_SPIN],
      };
      const turn = turns[event.key];
      if (!turn) return;
      event.preventDefault();
      e?.spinBy(turn[0], turn[1]);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      commit(true);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      commit(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "group/star-geode relative isolate h-full w-full overflow-clip",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center transition-[opacity,visibility] duration-300 group-data-live/star-geode:invisible group-data-live/star-geode:opacity-0"
      >
        <StandIn color={color} crystal={crystal} />
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={isOpen}
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={(event) => {
          // Pointer presses arrive through the drag's tap; a click with no
          // pointer behind it (Space, Enter, assistive tech) toggles here.
          if (event.detail === 0) commit(!isOpen);
        }}
        onKeyDown={onKeyDown}
        {...drag}
        className={cn(
          // A 2D drag turns the shell, so the finger owns both axes here.
          "absolute inset-0 touch-none rounded-[inherit] outline-none select-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          disabled
            ? "cursor-not-allowed"
            : "cursor-grab active:cursor-grabbing",
        )}
      />
      <p id={hintId} className="sr-only">
        Space or Enter opens and closes it; Right and Left arrows open and close
        it; Shift with the arrows turns it; drag to spin it.
      </p>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: the
 * shell as a ring of seams round a faint crystal glow, in SVG.
 */
function StandIn({ color, crystal }: { color: string; crystal: string }) {
  const spokes = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    spokes.push(
      <line
        key={i}
        x1={50}
        y1={50}
        x2={Number((50 + 30 * Math.cos(a)).toFixed(3))}
        y2={Number((50 + 30 * Math.sin(a)).toFixed(3))}
      />,
    );
  }
  return (
    <svg viewBox="0 0 100 100" className="h-full max-h-full">
      <circle cx={50} cy={50} r={30} fill={crystal} opacity={0.08} />
      <g stroke={color} strokeWidth={0.3} opacity={0.35} fill="none">
        <circle cx={50} cy={50} r={30} />
        <ellipse cx={50} cy={50} rx={30} ry={11} />
        <ellipse cx={50} cy={50} rx={11} ry={30} />
        {spokes}
      </g>
    </svg>
  );
}
