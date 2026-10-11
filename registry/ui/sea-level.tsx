"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SeaLevelProps = {
  /** The content plate that floats on the near water and rides the swell: a headline, a card. */
  children?: React.ReactNode;
  /** How high the swell runs, 0 (glass) to 1 (a heavy sea that hides the horizon). @default 0.5 */
  waveHeight?: number;
  /** The size of a near point, px; far points are finer. 0.6 to 3. @default 1.4 */
  pointSize?: number;
  /** The standing breeze, 0 (still air) to 1: how much chop rides the swell and how briskly it all moves. @default 0.35 */
  wind?: number;
  /** The water's points. @default "var(--accent-bright)" */
  color?: string;
  /** The crests' points, where the swell breaks into foam. @default the foreground mixed with a little of `color` */
  foamColor?: string;
  /** Where the horizon sits, as a share of the height from the top, 0.15 to 0.6. @default 0.36 */
  horizon?: number;
  /** How closely the points are set, 0.5 (open) to 1.5 (dense). @default 1 */
  density?: number;
  /** How fast the sea moves, 0 (held) to 2. @default 1 */
  speed?: number;
  /** How much the camera rides the water — bobbing, rolling and pitching — 0 (fixed) to 1. @default 0.6 */
  rock?: number;
  /** Where the plate floats, as shares of the box: the point on the water under the plate's bottom edge. @default [0.5, 0.82] */
  floatAt?: readonly [number, number];
  /** Controlled wind direction in degrees, -80 (from the left) to 80 (from the right); 0 blows straight in. */
  heading?: number;
  /** Initial wind direction when uncontrolled. @default 0 */
  defaultHeading?: number;
  /** Fires when the pointer (on leaving) or the keys set a new wind direction, in whole degrees. */
  onHeadingChange?: (degrees: number) => void;
  /** The pointer and keys turn the wind and build chop. @default true */
  interactive?: boolean;
  /** How much chop the hand builds from its side, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** Hold the sea still; the wind can still build chop. @default false */
  paused?: boolean;
  /** Seeds the swell, so two seas never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The accessible name of the wind control. @default "Wind direction" */
  label?: string;
  /** Fires when the pointer or the keyboard starts (true) or stops (false) building chop. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box; it fills its parent by default. */
  className?: string;
};

const STEP = 1 / 120;
/** The camera's eye above the mean water, and the nearest row, in world units. */
const EYE = 0.4;
const Z_NEAR = 1.6;
const Z_FAR = 34;
/** Spacing of the nearest rows and columns; it doubles in each band of depth. */
const BASE_GAP = 0.14;
const BAND_FROM = 2.4;
/** Occlusion bins, px. */
const BIN = 2;
const BUCKETS = 4;
/** Alpha of each fade bucket, near to far, on a dark page and a light one. */
const FADES_DARK = [0.95, 0.68, 0.42, 0.2] as const;
const FADES_LIGHT = [1, 0.85, 0.6, 0.34] as const;
const MAX_POINTS = 6000;
const HEADING_MAX = 80;
const HEADING_MIN = -80;
const KEY_STEP = 10;
const KEY_PAGE = 30;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x51ed27) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A CSS colour resolved on its carrier, as rgb() a canvas always understands. */
let probe: CanvasRenderingContext2D | null = null;
function toRgb(el: Element | undefined): string {
  if (!el) return "rgb(0, 0, 0)";
  if (!probe) {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    probe = c.getContext("2d", { willReadFrequently: true });
  }
  if (!probe) return getComputedStyle(el).color;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = "rgb(0, 0, 0)";
  probe.fillStyle = getComputedStyle(el).color;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return `rgb(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0})`;
}

type Config = {
  waveHeight: number;
  pointSize: number;
  wind: number;
  horizon: number;
  density: number;
  speed: number;
  rock: number;
  floatX: number;
  floatY: number;
  heading: number;
  interactive: boolean;
  strength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  colourKey: string;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, source: "pointer" | "keyboard") => void;
  headTo: (degrees: number, source: "pointer" | "keyboard") => void;
  handAway: (source: "pointer" | "keyboard") => number | null;
  dispose: () => void;
};

/**
 * The sea and its camera, outside React: a world grid of points carrying
 * three swells and two trains of chop, seen from just above the water and
 * drawn near to far against a silhouette buffer, so a near crest hides the
 * water behind it the way a real swell hides the horizon.
 */
function createSea(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  float: HTMLDivElement,
  visible: { current: boolean },
  onActive: (active: boolean) => void,
): Engine {
  let cfg: Config | null = null;
  let frame = 0;
  let last = 0;
  let carry = 0;
  let disposed = false;
  let active = false;
  let live = false;
  const size = { w: 0, h: 0, dpr: 1, f: 1, y0: 0, cx: 0 };
  let water = "rgb(0, 0, 0)";
  /** A light page takes darker, fuller points; a dark one, finer light. */
  let dark = true;
  let foam = "rgb(255, 255, 255)";
  let haze: CanvasGradient | null = null;
  let hazeKey = "";
  /** Rows near to far: depth, column gap. */
  let rowZ = new Float32Array(0);
  let rowGap = new Float32Array(0);
  let rows = 0;
  /** One row's samples: screen x, screen y, height. */
  const rx = new Float32Array(1200);
  const ry = new Float32Array(1200);
  const rh = new Float32Array(1200);
  let occ = new Float32Array(0);
  let occFrom = 0;
  /** Visible points per bucket (fade × water/foam): x, y, size. */
  const bucket = Array.from(
    { length: BUCKETS * 2 },
    () => new Float32Array(MAX_POINTS * 3),
  );
  const filled = new Int32Array(BUCKETS * 2);
  const swell = {
    kx: new Float32Array(3),
    kz: new Float32Array(3),
    w: new Float32Array(3),
    a: new Float32Array(3),
    phase: new Float32Array(3),
    base: new Float32Array(3),
    k: new Float32Array(3),
  };
  const chop = {
    k: new Float32Array(2),
    w: new Float32Array(2),
    phase: new Float32Array(2),
  };
  const sim = {
    t: 0,
    /** The hand's presence and the wind's direction, each on drift. */
    amount: 0,
    amountV: 0,
    head: 0,
    headV: 0,
    headTo: 0,
    on: false,
    source: null as "pointer" | "keyboard" | null,
    /** Where the pointer last set the wind, until it leaves. */
    pointerHead: null as number | null,
  };
  const cam = { bob: 0, roll: 0, pitch: 0 };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    onActive(next);
  };

  const placeSea = (c: Config) => {
    const rand = lcg(c.seed * 31 + 7);
    const lengths = [9, 5.4, 3.1];
    const shares = [0.6, 0.28, 0.14];
    for (let k = 0; k < 3; k += 1) {
      const K = (Math.PI * 2) / (lengths[k] ?? 5);
      swell.k[k] = K;
      swell.a[k] = shares[k] ?? 0.1;
      swell.base[k] = (rand() - 0.5) * (k === 0 ? 0.3 : 0.9);
      swell.phase[k] = rand() * Math.PI * 2;
      // Deep water: longer waves run faster, by the root of their length.
      swell.w[k] = Math.sqrt(9.8 * K) * 0.5;
    }
    const chopLengths = [1.3, 0.85];
    for (let c2 = 0; c2 < 2; c2 += 1) {
      const K = (Math.PI * 2) / (chopLengths[c2] ?? 1);
      chop.k[c2] = K;
      chop.w[c2] = Math.sqrt(9.8 * K) * 0.5;
      chop.phase[c2] = rand() * Math.PI * 2;
    }
    sim.t = 20 + rand() * 40;
  };

  /** Each swell's travel, leaning toward where the wind blows. */
  const aim = () => {
    const lean = (-sim.head * Math.PI) / 180;
    for (let k = 0; k < 3; k += 1) {
      const h = (swell.base[k] ?? 0) + lean * 0.3;
      const K = swell.k[k] ?? 1;
      swell.kx[k] = K * Math.sin(h);
      swell.kz[k] = -K * Math.cos(h);
    }
  };

  /** The water's height at world (x, z): peaked crests, long troughs, chop on the windward side. */
  const height = (
    x: number,
    z: number,
    amp: number,
    chopAmp: number,
    span: number,
  ) => {
    const t = sim.t;
    let e = 0;
    for (let k = 0; k < 3; k += 1) {
      const th =
        (swell.kx[k] ?? 0) * x +
        (swell.kz[k] ?? 0) * z -
        (swell.w[k] ?? 0) * t +
        (swell.phase[k] ?? 0);
      const s = 0.5 + 0.5 * Math.sin(th);
      e += (swell.a[k] ?? 0) * (2 * Math.pow(s, 1.5) - 1);
    }
    e *= amp;
    if (chopAmp > 0.0005) {
      const lean = (-sim.head * Math.PI) / 180;
      const sx = Math.sin(lean);
      const sz = -Math.cos(lean);
      // Heavier on the side the wind comes from, easing out across.
      const u = clamp(x / Math.max(0.001, span), -1, 1);
      const side = Math.abs(sim.head) / HEADING_MAX;
      const weight =
        0.75 + (0.35 + 0.65 * smooth(-1, 1, u * Math.sign(lean)) - 0.75) * side;
      for (let c2 = 0; c2 < 2; c2 += 1) {
        const K = chop.k[c2] ?? 1;
        const th =
          K * (sx * x + sz * z) - (chop.w[c2] ?? 0) * t + (chop.phase[c2] ?? 0);
        e += chopAmp * weight * (c2 === 0 ? 1 : 0.55) * Math.sin(th);
      }
    }
    return e;
  };

  const layOut = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    const y0 = clamp(c.horizon, 0.15, 0.6) * size.h;
    size.y0 = y0;
    size.cx = size.w / 2;
    // The focal length that puts the nearest row at the bottom edge.
    size.f = ((size.h - y0) * Z_NEAR) / EYE;
    const wide = Math.max(1, size.w / size.f / 2.2);
    const gap0 = (BASE_GAP / clamp(c.density, 0.5, 1.5)) * wide;
    const zs: number[] = [];
    const gaps: number[] = [];
    // Rows from a little under the bottom edge (the camera rolls) to the
    // horizon, spacing doubling in each band of depth.
    let z = Z_NEAR * 0.78;
    while (z < Z_FAR) {
      const band = Math.pow(
        2,
        Math.floor(Math.log2(Math.max(1, z / BAND_FROM))),
      );
      const gap = gap0 * band;
      zs.push(z);
      gaps.push(gap);
      z += gap;
    }
    rows = zs.length;
    rowZ = Float32Array.from(zs);
    rowGap = Float32Array.from(gaps);
    const margin = size.w * 0.12;
    occFrom = -margin;
    occ = new Float32Array(Math.ceil((size.w + margin * 2) / BIN) + 2);
  };

  const paintColours = () => {
    const kids = carriers.children;
    water = toRgb(kids[0]);
    foam = toRgb(kids[1]);
    const ground = toRgb(kids[2]).match(/\d+/g) ?? ["0", "0", "0"];
    dark =
      (0.2126 * Number(ground[0]) +
        0.7152 * Number(ground[1]) +
        0.0722 * Number(ground[2])) /
        255 <
      0.5;
    hazeKey = "";
  };

  const hazeFor = (ctx: CanvasRenderingContext2D) => {
    const key = `${size.y0}|${size.h}|${water}`;
    if (haze && hazeKey === key) return haze;
    const g = ctx.createLinearGradient(
      0,
      size.y0 - size.h * 0.22,
      0,
      size.y0 + size.h * 0.1,
    );
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(0.68, water);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    haze = g;
    hazeKey = key;
    return g;
  };

  const draw = () => {
    const c = cfg;
    const ctx = canvas.getContext("2d");
    if (!c || !ctx || !visible.current || size.w < 1 || rows < 1) return;
    const { w, h, dpr, f, y0, cx } = size;
    const still = !c.motionSafe;
    const amp = still ? 0.03 : clamp01(c.waveHeight) * 0.5;
    const chopAmp =
      (0.02 + 0.07 * clamp01(c.wind) + 0.12 * sim.amount * c.strength) *
      (still ? 0.6 : 1) *
      (0.4 + 0.6 * clamp01(c.waveHeight + 0.3));
    aim();

    // The camera rides the water under it: bob, roll and pitch.
    const rock = still ? 0 : clamp01(c.rock);
    // A floating eye is carried by the water along its hull, not one point
    // of it: it keeps its height over the mean of the water just ahead, and
    // pitches with that water's slope, so the near rows stay in view whether
    // it sits in a trough or on a crest. How much it rolls and pitches is
    // the rock.
    const eA = height(0, 0, amp, 0, 1);
    const eB = height(0, Z_NEAR * 0.75, amp, 0, 1);
    const eC = height(0, Z_NEAR * 1.5, amp, 0, 1);
    const ex = height(0.35, 0, amp, 0, 1) - height(-0.35, 0, amp, 0, 1);
    cam.bob = still ? 0 : (eA + eB + eC) / 3;
    cam.roll = clamp(Math.atan(ex / 0.7) * rock * 0.45, -0.08, 0.08);
    cam.pitch = clamp(
      Math.atan((eC - eA) / (Z_NEAR * 1.5)) * (0.35 + 0.55 * rock),
      -0.2,
      0.2,
    );
    const eye = EYE + cam.bob;
    // The horizon may ride up and down, but never out of the frame.
    const hy = clamp(
      y0 + f * Math.tan(cam.pitch),
      y0 * 0.55,
      y0 + (h - y0) * 0.25,
    );

    filled.fill(0);
    occ.fill(h * 3);
    const size0 = clamp(c.pointSize, 0.6, 3);
    const foamLine = amp * 0.66 + chopAmp * 0.7;
    for (let j = 0; j < rows; j += 1) {
      const z = rowZ[j] ?? 1;
      // Columns closer than rows: across the view the points read as a
      // surface; in depth, as rows running to the horizon.
      const gap = (rowGap[j] ?? 0.2) * 0.42;
      const span = ((w * 0.5 + w * 0.12) / f) * z;
      const i0 = Math.floor(-span / gap);
      const count = Math.min(1200, Math.ceil((2 * span) / gap) + 2);
      const fog = clamp01((z - Z_NEAR) / (Z_FAR - Z_NEAR));
      const fade = Math.min(
        BUCKETS - 1,
        Math.floor(Math.pow(fog, 0.55) * BUCKETS),
      );
      const dot = size0 * clamp(3.2 / z, 0.55, 1.5) * (dark ? 1 : 1.15);
      for (let i = 0; i < count; i += 1) {
        const x = (i0 + i) * gap;
        const e = height(x, z, amp, chopAmp, span);
        rx[i] = cx + (f * x) / z;
        ry[i] = hy + (f * (eye - e)) / z;
        rh[i] = e;
      }
      for (let i = 0; i < count; i += 1) {
        const sx = rx[i] ?? 0;
        const sy = ry[i] ?? 0;
        const bin = Math.floor((sx - occFrom) / BIN);
        if (bin < 0 || bin >= occ.length) continue;
        // Behind a nearer crest: hidden, as the swell hides the horizon.
        if (sy > (occ[bin] ?? 0) - 0.5) continue;
        if (sy < -40 || sy > h + 40) continue;
        const b = ((rh[i] ?? 0) > foamLine ? BUCKETS : 0) + fade;
        const n = filled[b] ?? 0;
        if (n >= MAX_POINTS) continue;
        const buf = bucket[b];
        if (!buf) continue;
        buf[n * 3] = sx;
        buf[n * 3 + 1] = sy;
        buf[n * 3 + 2] = dot;
        filled[b] = n + 1;
      }
      // This row's surface, as a line between its samples, now hides
      // everything farther that sits below it.
      for (let i = 0; i < count - 1; i += 1) {
        const ax = rx[i] ?? 0;
        const ay = ry[i] ?? 0;
        const bx = rx[i + 1] ?? 0;
        const by = ry[i + 1] ?? 0;
        const from = Math.max(0, Math.floor((ax - occFrom) / BIN));
        const to = Math.min(occ.length - 1, Math.ceil((bx - occFrom) / BIN));
        for (let q = from; q <= to; q += 1) {
          const px = occFrom + q * BIN;
          const t = bx > ax ? clamp01((px - ax) / (bx - ax)) : 0;
          const y = ay + (by - ay) * t;
          if (y < (occ[q] ?? 0)) occ[q] = y;
        }
      }
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // The whole view rolls about the middle of the box.
    ctx.translate(w / 2, h / 2);
    ctx.rotate(cam.roll);
    ctx.translate(-w / 2, -h / 2 + (hy - y0));
    ctx.globalAlpha = dark ? 0.09 : 0.045;
    ctx.fillStyle = hazeFor(ctx);
    ctx.fillRect(-w * 0.2, y0 - h * 0.25, w * 1.4, h * 0.36);
    ctx.translate(0, -(hy - y0));
    for (let b = 0; b < BUCKETS * 2; b += 1) {
      const n = filled[b] ?? 0;
      if (!n) continue;
      const buf = bucket[b];
      if (!buf) continue;
      ctx.beginPath();
      for (let p = 0; p < n; p += 1) {
        const s = buf[p * 3 + 2] ?? 1;
        ctx.rect(
          (buf[p * 3] ?? 0) - s / 2,
          (buf[p * 3 + 1] ?? 0) - s / 2,
          s,
          s,
        );
      }
      ctx.fillStyle = b >= BUCKETS ? foam : water;
      ctx.globalAlpha = (dark ? FADES_DARK : FADES_LIGHT)[b % BUCKETS] ?? 0.5;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ride(amp, chopAmp, eye, hy);
    if (!live) {
      live = true;
      root.setAttribute("data-live", "");
    }
  };

  /** The plate rides the water under it, and the camera's roll with it. */
  const ride = (amp: number, chopAmp: number, eye: number, hy: number) => {
    const c = cfg;
    if (!c) return;
    const { w, h, f, y0, cx } = size;
    const ax = c.floatX * w;
    const ay = Math.max(y0 + 4, c.floatY * h);
    const z = (f * EYE) / (ay - y0);
    const x = ((ax - cx) * z) / f;
    const span = ((w * 0.62) / f) * z;
    // A plate is broader than the chop: it rides the swell alone, at a
    // little over half the water's lift, and leans with the swell's slope
    // across its own width.
    const e = height(x, z, amp, chopAmp * 0.15, span);
    const slope =
      (height(x + 0.45, z, amp, 0, span) - height(x - 0.45, z, amp, 0, span)) /
      0.9;
    const lift = clamp(
      (hy + (f * (eye - e)) / z - ay) * 0.55,
      -h * 0.08,
      h * 0.08,
    );
    const tilt = clamp(Math.atan(-slope) * 0.35, -0.08, 0.08) + cam.roll;
    // Where the anchor lands once the camera's roll turns it about the middle.
    const dx = ax - w / 2;
    const dy = ay + lift - h / 2;
    const cos = Math.cos(cam.roll);
    const sin = Math.sin(cam.roll);
    const tx = w / 2 + dx * cos - dy * sin - ax;
    const ty = h / 2 + dx * sin + dy * cos - ay;
    float.style.transform = `translate(${r2(tx)}px, ${r2(ty)}px) rotate(${r2((tilt * 180) / Math.PI)}deg)`;
  };

  /** Advances the sea, the hand and the wind; says whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (c.motionSafe && !c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2) * (0.75 + 0.5 * clamp01(c.wind));
      moving = true;
    }
    const want = sim.on && c.interactive ? 1 : 0;
    const headTarget =
      sim.on && sim.source === "pointer" && sim.pointerHead !== null
        ? sim.pointerHead
        : sim.headTo;
    if (!c.motionSafe) {
      sim.amount = want;
      sim.amountV = 0;
      sim.head = headTarget;
      sim.headV = 0;
      return false;
    }
    const D = springs.drift;
    carry += dt;
    let steps = 0;
    while (carry >= STEP && steps < 8) {
      carry -= STEP;
      steps += 1;
      sim.amountV +=
        ((-D.stiffness * (sim.amount - want) - D.damping * sim.amountV) /
          D.mass) *
        STEP;
      sim.amount += sim.amountV * STEP;
      sim.headV +=
        ((-D.stiffness * (sim.head - headTarget) - D.damping * sim.headV) /
          D.mass) *
        STEP;
      sim.head += sim.headV * STEP;
    }
    if (steps === 8) carry = 0;
    const building =
      Math.abs(sim.amount - want) > 0.002 || Math.abs(sim.amountV) > 0.01;
    if (!building) {
      sim.amount = want;
      sim.amountV = 0;
    }
    const turning =
      Math.abs(sim.head - headTarget) > 0.05 || Math.abs(sim.headV) > 0.1;
    if (!turning) {
      sim.head = headTarget;
      sim.headV = 0;
    }
    return moving || building || turning;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !cfg) {
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
    if (disposed || frame || !visible.current || document.hidden) return;
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
    layOut();
    draw();
    kick();
  };

  /** Reduced motion: the wind lands where it is put, at once. */
  const settle = () => {
    const c = cfg;
    if (!c || c.motionSafe) return;
    step(0);
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was || was.seed !== next.seed) placeSea(next);
      if (!was) {
        sim.headTo = next.heading;
        sim.head = next.heading;
        paintColours();
        resize();
        draw();
        kick();
        return;
      }
      if (was.colourKey !== next.colourKey) paintColours();
      if (was.dpr !== next.dpr) {
        size.w = 0;
        resize();
      }
      if (was.horizon !== next.horizon || was.density !== next.density)
        layOut();
      if (was.heading !== next.heading) sim.headTo = next.heading;
      if (!next.interactive && sim.on) {
        sim.on = false;
        sim.source = null;
        sim.pointerHead = null;
        setActive(false);
      }
      settle();
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
    handTo(x, source) {
      const c = cfg;
      if (!c || size.w < 1) return;
      if (source === "pointer") {
        sim.pointerHead = clamp((x / size.w - 0.5) * 2, -1, 1) * HEADING_MAX;
      }
      sim.on = true;
      sim.source = source;
      setActive(true);
      settle();
      draw();
      kick();
    },
    headTo(degrees, source) {
      sim.headTo = clamp(degrees, -HEADING_MAX, HEADING_MAX);
      if (source === "keyboard") {
        sim.on = true;
        sim.source = "keyboard";
        setActive(true);
      }
      settle();
      draw();
      kick();
    },
    handAway(source) {
      if (sim.source !== source) return null;
      const left = source === "pointer" ? sim.pointerHead : null;
      sim.on = false;
      sim.source = null;
      sim.pointerHead = null;
      setActive(false);
      settle();
      draw();
      kick();
      return left;
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

/**
 * An ocean drawn in points, seen from a camera floating just above the
 * surface, with a content plate riding the near water. Three seeded swells
 * with peaked crests and two trains of chop move a world grid of points;
 * because the eye sits so low, a passing swell rises past the horizon and
 * hides the water behind it, and the camera bobs, rolls and pitches with the
 * water under it, so the whole view rocks. The plate rides the same sea.
 *
 * The pointer is the wind: its side turns the wind's direction on
 * springs.drift and, while it is over the sea, chop builds from that side on
 * springs.drift too, heavier on the windward edge, while the swells lean
 * after it. One focus stop under the plate is a slider for the wind's
 * direction: arrows turn it, and focus builds the chop as the hand does.
 * Under reduced motion the sea settles to glass — still points in perfect
 * perspective, the plate level — and the wind still answers with a still
 * ruffle on its side.
 */
export function SeaLevel({
  children,
  waveHeight = 0.5,
  pointSize = 1.4,
  wind = 0.35,
  color = "var(--accent-bright)",
  foamColor,
  horizon = 0.36,
  density = 1,
  speed = 1,
  rock = 0.6,
  floatAt = [0.5, 0.82],
  heading,
  defaultHeading = 0,
  onHeadingChange,
  interactive = true,
  pointerStrength = 0.7,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Wind direction",
  onActiveChange,
  className,
}: SeaLevelProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [own, setOwn] = React.useState(() =>
    Math.round(clamp(defaultHeading, -HEADING_MAX, HEADING_MAX)),
  );
  const head = Math.round(clamp(heading ?? own, -HEADING_MAX, HEADING_MAX));
  const crest =
    foamColor ?? `color-mix(in oklab, var(--foreground) 60%, ${color})`;
  const paints = React.useMemo(
    () => [color, crest, "var(--background)"] as const,
    [color, crest],
  );
  const colourKey = paints.join("|");
  const floatX = clamp01(floatAt[0] ?? 0.5);
  const floatY = clamp01(floatAt[1] ?? 0.82);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const floatRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const report = React.useRef({ onActiveChange, onHeadingChange });

  const config: Config = {
    waveHeight,
    pointSize,
    wind,
    horizon,
    density,
    speed,
    rock,
    floatX,
    floatY,
    heading: head,
    interactive,
    strength: clamp01(pointerStrength),
    paused,
    seed,
    dpr,
    motionSafe,
    colourKey,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onHeadingChange };
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    const float = floatRef.current;
    if (!root || !canvas || !carriers || !float) return;
    const e = createSea(root, canvas, carriers, float, visible, (a) =>
      report.current.onActiveChange?.(a),
    );
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

  /** A new wind direction from the hand or a key: held if uncontrolled, and reported. */
  const commit = (degrees: number) => {
    const next = Math.round(clamp(degrees, -HEADING_MAX, HEADING_MAX));
    if (next === head) return;
    if (heading === undefined) setOwn(next);
    report.current.onHeadingChange?.(next);
  };

  const local = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return 0;
    return clientX - root.getBoundingClientRect().left - root.clientLeft;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    engine.current?.handTo(local(event.clientX), "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    engine.current?.handTo(local(event.clientX), "pointer");
  };

  const away = () => {
    const left = engine.current?.handAway("pointer");
    if (left !== null && left !== undefined) commit(left);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") away();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") away();
  };

  const onSurfaceFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (!event.currentTarget.matches(":focus-visible")) return;
    engine.current?.headTo(head, "keyboard");
  };

  const onSurfaceBlur = () => {
    engine.current?.handAway("keyboard");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = head + KEY_STEP;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = head - KEY_STEP;
        break;
      case "PageUp":
        next = head + KEY_PAGE;
        break;
      case "PageDown":
        next = head - KEY_PAGE;
        break;
      case "Home":
        next = -HEADING_MAX;
        break;
      case "End":
        next = HEADING_MAX;
        break;
      default:
        return;
    }
    event.preventDefault();
    // The engine turns once the new direction is held (or the host takes it).
    commit(next);
  };

  const valueText =
    Math.abs(head) < 5
      ? "Wind blowing straight in"
      : `Wind from the ${head < 0 ? "left" : "right"}, ${Math.abs(head)} degrees`;

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      className={cn(
        // A sideways finger turns the wind; an upright swipe scrolls the page.
        "group/sea-level relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/sea-level:invisible group-data-live/sea-level:opacity-0"
        style={standIn(color, horizon)}
      />
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
      <div
        role="slider"
        tabIndex={interactive ? 0 : -1}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={HEADING_MIN}
        aria-valuemax={HEADING_MAX}
        aria-valuenow={head}
        aria-valuetext={valueText}
        aria-disabled={!interactive || undefined}
        onKeyDown={onKeyDown}
        onFocus={onSurfaceFocus}
        onBlur={onSurfaceBlur}
        className="absolute inset-0 rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
      <p id={hintId} className="sr-only">
        Left and right arrows turn the wind; while this has focus the wind
        builds chop on the water.
      </p>
      <div
        ref={floatRef}
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          transformOrigin: `${r2(floatX * 100)}% ${r2(floatY * 100)}%`,
        }}
      >
        <div
          className="pointer-events-auto absolute w-max max-w-[calc(100%-1.5rem)]"
          style={{
            left: `${r2(floatX * 100)}%`,
            top: `${r2(floatY * 100)}%`,
            transform: "translate(-50%, -100%)",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * The designed still frame for the server render and the first paint: rows of
 * points from the horizon down, finer and fainter toward the horizon.
 */
function standIn(color: string, horizon: number): React.CSSProperties {
  const top = Math.round(clamp(horizon, 0.15, 0.6) * 1000) / 10;
  const dot = (r: number, gx: number, gy: number, k: number) =>
    `radial-gradient(circle, color-mix(in oklab, ${color} ${k}%, transparent) ${r}px, transparent ${r + 0.6}px) 0 ${top}% / ${gx}px ${gy}px`;
  return {
    background: [dot(0.6, 7, 4, 40), dot(1, 16, 10, 70)].join(", "),
    maskImage: `linear-gradient(to bottom, transparent ${top}%, black ${Math.min(100, top + 30)}%)`,
    WebkitMaskImage: `linear-gradient(to bottom, transparent ${top}%, black ${Math.min(100, top + 30)}%)`,
  };
}
