"use client";

import * as React from "react";

import { motion } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { distances, durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type RackAisleItem = {
  /** Stable id; the value is a rack's id. */
  id: string;
  /** Shown in the tooltip. @default the id */
  name?: string;
  /** The rack's load, 0 to 1. Without one, a seeded spread around the `load` prop. */
  load?: number;
  /** A load spike in the data: the rack flickers amber. */
  spike?: boolean;
};

export type RackAisleProps = {
  /** The racks, two per row: even indices on the left, odd on the right, nearest row first. @default generated R01… */
  items?: readonly RackAisleItem[];
  /** How many racks stand on each side of the aisle, 3 to 10. @default 6 */
  racks?: number;
  /** The aisle's load, 0 (idle winks) to 1 (busy chatter), for racks whose data gives none. @default 0.5 */
  load?: number;
  /** How bright the light sweeping down the aisle is, 0 (off) to 1. @default 0.5 */
  sweep?: number;
  /** ms for one pass of the sweep down the aisle. @default 7000 */
  sweepPeriod?: number;
  /** A load at or above this counts as a spike, 0 to 1. @default 0.92 */
  spikeAt?: number;
  /** Servers per rack, 6 to 16. @default 11 */
  units?: number;
  /** Controlled: the pinned rack's id, or null. */
  value?: string | null;
  /** The rack pinned at first, when uncontrolled. @default null */
  defaultValue?: string | null;
  /** Fires from the click or key that pinned or unpinned a rack. */
  onValueChange?: (id: string | null) => void;
  /** How far the pointer sways the view down the aisle, 0 to 1. @default 0.5 */
  parallax?: number;
  /** Activity lights, any CSS colour. @default a green pigment from the signal token */
  ledColor?: string;
  /** A spiking rack's lights, any CSS colour. @default an amber pigment from the warn token */
  spikeColor?: string;
  /** The room, any CSS colour; racks and floor are shaded from it. @default a dim tint of the accent token, by theme */
  roomColor?: string;
  /** Printed before a rack's name in its tooltip. @default "Basinworks east, row 4" */
  site?: string;
  /** Hold every light where it is. @default false */
  paused?: boolean;
  /** Seeds the loads of racks without data and every light's rhythm. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The aisle's accessible name. @default "Server aisle" */
  label?: string;
  /** No hover, pin or keys. @default false */
  disabled?: boolean;
  /** Sizes the aisle; it fills its parent by default. */
  className?: string;
};

/* The aisle in metres-ish: the eye at y 0, faces at x ±A. */
const A = 1;
const FLOOR = -1.12;
const TOP = 0.95;
const CEIL = 1.4;
const DEPTH = 0.62;
const GAP = 0.035;
const LEDS = 3;

const DEFAULT_ROOM =
  "light-dark(oklch(from var(--accent) 0.36 0.028 h), oklch(from var(--accent) 0.17 0.022 h))";
const DEFAULT_LED = "oklch(from var(--signal) 0.82 0.17 h)";
const DEFAULT_SPIKE = "oklch(from var(--warn) 0.8 0.16 h)";

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const pad = (n: number) => String(n).padStart(2, "0");

function hash(a: number, b: number, c = 0): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^
    Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Any CSS colour as an rgba() string the canvas can use, by painting one pixel. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): string => {
    if (!ctx) return "rgba(128, 128, 128, 1)";
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return `rgba(${d[0] ?? 0}, ${d[1] ?? 0}, ${d[2] ?? 0}, ${Math.round(((d[3] ?? 255) / 255) * 100) / 100})`;
  };
}

type Rack = {
  id: string;
  name: string;
  load: number;
  spike: boolean;
};

/** The racks the aisle shows: the data's, padded with generated ones, two per row. */
function racksFor(
  items: readonly RackAisleItem[] | undefined,
  count: number,
  load: number,
  spikeAt: number,
  seed: number,
): Rack[] {
  const n = clamp(Math.round(count), 3, 10) * 2;
  const out: Rack[] = [];
  const s = Math.round(seed);
  for (let i = 0; i < n; i += 1) {
    const item = items?.[i];
    const id = item?.id ?? `R${pad(i + 1)}`;
    const spread = clamp(load + (hash(s, i, 3) - 0.5) * 0.5, 0.03, 0.97);
    const l = clamp(item?.load ?? spread, 0, 1);
    out.push({
      id,
      name: item?.name ?? id,
      load: Math.round(l * 100) / 100,
      spike: Boolean(item?.spike) || l >= spikeAt,
    });
  }
  return out;
}

type Geometry = {
  w: number;
  h: number;
  f: number;
  cx: number;
  cy: number;
  z0: number;
  zEnd: number;
  rows: number;
};

function geometryFor(w: number, h: number, rows: number): Geometry {
  const f = Math.min(w * 0.44, h * 1.2);
  const cx = w / 2;
  // The first rack starts just beyond the frame's edge, so the aisle fills it.
  const z0 = (f * A) / Math.max(1, cx) / 0.97;
  return {
    w,
    h,
    f,
    cx,
    cy: h * 0.47,
    z0,
    zEnd: z0 + rows * (DEPTH + GAP) + 0.55,
    rows,
  };
}

/** A rack's face as four screen points: near-bottom, near-top, far-top, far-bottom. */
function faceOf(g: Geometry, index: number, camX: number) {
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  const za = g.z0 + row * (DEPTH + GAP);
  const zb = za + DEPTH;
  const x = side * A - camX;
  const p = (y: number, z: number) => [
    g.cx + (g.f * x) / z,
    g.cy - (g.f * y) / z,
  ];
  return {
    side,
    row,
    za,
    zb,
    pts: [p(FLOOR, za), p(TOP, za), p(TOP, zb), p(FLOOR, zb)],
  };
}

/** The keyboard button over a rack: its face's bounding box, clipped to the frame. */
function boxOf(g: Geometry, index: number) {
  const { pts } = faceOf(g, index, 0);
  const xs = pts.map((p) => p[0] ?? 0);
  const ys = pts.map((p) => p[1] ?? 0);
  const left = clamp(Math.min(...xs), 0, g.w);
  const right = clamp(Math.max(...xs), 0, g.w);
  const top = clamp(Math.min(...ys), 0, g.h);
  const bottom = clamp(Math.max(...ys), 0, g.h);
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.max(1, Math.round(right - left)),
    height: Math.max(1, Math.round(bottom - top)),
  };
}

type Config = {
  racks: Rack[];
  units: number;
  sweep: number;
  sweepPeriod: number;
  parallax: number;
  seed: number;
  dpr: number;
  paused: boolean;
  motionSafe: boolean;
  colorKey: string;
  inspect: number;
};

type Engine = {
  configure: (cfg: Config) => void;
  /** The rack under a client point, or −1. */
  hit: (clientX: number, clientY: number) => number;
  sway: (share: number | null) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  dispose: () => void;
};

const COLOUR_COUNT = 11;

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  tip: { current: HTMLDivElement | null },
  visible: { current: boolean },
): Engine {
  const ctx = canvas.getContext("2d");
  const still = document.createElement("canvas");
  const sctx = still.getContext("2d");
  // A soft round light, drawn once and stamped for halos and floor pools.
  const glow = document.createElement("canvas");
  glow.width = 64;
  glow.height = 64;
  const gctx = glow.getContext("2d");
  const paintGlow = () => {
    if (!gctx) return;
    gctx.clearRect(0, 0, 64, 64);
    const grad = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255, 255, 255, 1)");
    grad.addColorStop(0.35, "rgba(255, 255, 255, 0.45)");
    grad.addColorStop(1, "rgba(255, 255, 255, 0)");
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, 64, 64);
  };
  paintGlow();
  const tinted = new Map<string, HTMLCanvasElement>();
  const tint = (colour: string) => {
    const hit = tinted.get(colour);
    if (hit) return hit;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const t = c.getContext("2d");
    if (t) {
      t.drawImage(glow, 0, 0);
      t.globalCompositeOperation = "source-in";
      t.fillStyle = colour;
      t.fillRect(0, 0, 64, 64);
    }
    tinted.set(colour, c);
    return c;
  };

  let cfg: Config | null = null;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let ratio = 1;
  let g: Geometry = geometryFor(1, 1, 6);
  let time = 0;
  const read = colourReader();
  // room, floor, rack, bezel, edge, led, power, spike, end light, sweep, outline
  const colours: string[] = Array.from(
    { length: COLOUR_COUNT },
    () => "rgba(128,128,128,1)",
  );
  // The camera's sway, on the drift spring; lift per rack on the snap spring.
  let camX = 0;
  let camV = 0;
  let camAim = 0;
  let stillCam = Number.NaN;
  const lift = new Float32Array(20);
  const liftV = new Float32Array(20);
  const shownLoad = new Float32Array(20);
  const spikeGlow = new Float32Array(20);
  // LED screen positions, rebuilt with the still layer.
  const MAX_LEDS = 20 * 16 * LEDS;
  const lx = new Float32Array(MAX_LEDS);
  const ly = new Float32Array(MAX_LEDS);
  const lr = new Float32Array(MAX_LEDS);
  const lrack = new Uint8Array(MAX_LEDS);
  const lkind = new Uint8Array(MAX_LEDS);
  const lphase = new Float32Array(MAX_LEDS);
  let leds = 0;

  const project = (x: number, y: number, z: number): [number, number] => [
    g.cx + (g.f * (x - camX)) / z,
    g.cy - (g.f * y) / z,
  ];

  const quad = (c: CanvasRenderingContext2D, pts: [number, number][]) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i === 0 ? c.moveTo(x, y) : c.lineTo(x, y)));
    c.closePath();
  };

  /** The room, floor, ceiling and every rack's face and bezels, into the still layer. */
  const paintStill = () => {
    const c = cfg;
    if (!c || !sctx || still.width < 2) return;
    stillCam = camX;
    const [room, floor, rack, bezel, edge, , , , endLight] = colours;
    sctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    sctx.clearRect(0, 0, g.w, g.h);
    sctx.fillStyle = room ?? "gray";
    sctx.fillRect(0, 0, g.w, g.h);
    // Floor and ceiling, ruled.
    const zNear = g.z0 * 0.5;
    sctx.fillStyle = floor ?? "gray";
    quad(sctx, [
      project(-A, FLOOR, zNear),
      project(A, FLOOR, zNear),
      project(A, FLOOR, g.zEnd),
      project(-A, FLOOR, g.zEnd),
    ]);
    sctx.fill();
    sctx.strokeStyle = edge ?? "gray";
    sctx.lineWidth = 1;
    for (let k = -4; k <= 4; k += 1) {
      const x = (k / 4) * A;
      const [ax, ay] = project(x, FLOOR, zNear);
      const [bx, by] = project(x, FLOOR, g.zEnd);
      sctx.globalAlpha = 0.35;
      sctx.beginPath();
      sctx.moveTo(ax, ay);
      sctx.lineTo(bx, by);
      sctx.stroke();
    }
    for (let z = g.z0; z < g.zEnd; z += 0.6) {
      const [ax, ay] = project(-A, FLOOR, z);
      const [bx] = project(A, FLOOR, z);
      sctx.globalAlpha = 0.35 * clamp(1.6 / z, 0.15, 1);
      sctx.beginPath();
      sctx.moveTo(ax, ay);
      sctx.lineTo(bx, ay);
      sctx.stroke();
    }
    // The cable tray along the ceiling.
    for (const x of [-0.5, 0.5]) {
      const [ax, ay] = project(x, CEIL - 0.12, zNear);
      const [bx, by] = project(x, CEIL - 0.12, g.zEnd);
      sctx.globalAlpha = 0.55;
      sctx.lineWidth = 1.5;
      sctx.beginPath();
      sctx.moveTo(ax, ay);
      sctx.lineTo(bx, by);
      sctx.stroke();
    }
    sctx.lineWidth = 1;
    for (let z = g.z0; z < g.zEnd; z += 0.45) {
      const [ax, ay] = project(-0.5, CEIL - 0.12, z);
      const [bx, by] = project(0.5, CEIL - 0.12, z);
      sctx.globalAlpha = 0.3 * clamp(1.6 / z, 0.2, 1);
      sctx.beginPath();
      sctx.moveTo(ax, ay);
      sctx.lineTo(bx, by);
      sctx.stroke();
    }
    sctx.globalAlpha = 1;
    // The end wall and its lit doorway.
    sctx.fillStyle = rack ?? "gray";
    quad(sctx, [
      project(-A, FLOOR, g.zEnd),
      project(-A, CEIL, g.zEnd),
      project(A, CEIL, g.zEnd),
      project(A, FLOOR, g.zEnd),
    ]);
    sctx.fill();
    const [dx0, dy0] = project(-0.32, 0.72, g.zEnd);
    const [dx1, dy1] = project(0.32, FLOOR, g.zEnd);
    const light = tint(endLight ?? "white");
    sctx.globalCompositeOperation = "lighter";
    sctx.globalAlpha = 0.5;
    const spread = (dx1 - dx0) * 3;
    sctx.drawImage(
      light,
      (dx0 + dx1) / 2 - spread,
      dy0 - spread * 0.4,
      spread * 2,
      dy1 - dy0 + spread * 0.9,
    );
    sctx.globalCompositeOperation = "source-over";
    sctx.globalAlpha = 1;
    sctx.fillStyle = endLight ?? "white";
    sctx.fillRect(dx0, dy0, dx1 - dx0, dy1 - dy0);
    // The doorway's light runs toward us along the floor.
    sctx.globalCompositeOperation = "lighter";
    sctx.globalAlpha = 0.16;
    const [fx0, fy0] = project(-0.5, FLOOR, g.zEnd);
    const [, fy1] = project(0, FLOOR, g.z0 * 1.4);
    sctx.drawImage(
      light,
      fx0 - 10,
      fy0 - 6,
      (g.cx - fx0) * 2 + 20,
      fy1 - fy0 + 12,
    );
    sctx.globalCompositeOperation = "source-over";
    sctx.globalAlpha = 1;

    // The racks, far rows first.
    leds = 0;
    const units = clamp(Math.round(c.units), 6, 16);
    const span = TOP - FLOOR - 0.2;
    const uh = span / units;
    for (let index = c.racks.length - 1; index >= 0; index -= 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const za = g.z0 + row * (DEPTH + GAP);
      const zb = za + DEPTH;
      const x = side * A;
      const corners: [number, number][] = [
        project(x, FLOOR, za),
        project(x, TOP, za),
        project(x, TOP, zb),
        project(x, FLOOR, zb),
      ];
      sctx.fillStyle = rack ?? "gray";
      quad(sctx, corners);
      sctx.fill();
      sctx.strokeStyle = edge ?? "gray";
      sctx.globalAlpha = 0.8;
      sctx.stroke();
      sctx.globalAlpha = 1;
      const scale = g.f / za;
      for (let u = 0; u < units; u += 1) {
        const y0 = FLOOR + 0.12 + u * uh;
        const y1 = y0 + uh * 0.84;
        const pts: [number, number][] = [
          project(x, y0, za + 0.025),
          project(x, y1, za + 0.025),
          project(x, y1, zb - 0.025),
          project(x, y0, zb - 0.025),
        ];
        sctx.fillStyle = bezel ?? "gray";
        quad(sctx, pts);
        sctx.fill();
        // A hairline of light along each server's top edge.
        if (scale * uh > 5) {
          sctx.strokeStyle = edge ?? "gray";
          sctx.globalAlpha = 0.6;
          sctx.beginPath();
          sctx.moveTo(pts[1]?.[0] ?? 0, pts[1]?.[1] ?? 0);
          sctx.lineTo(pts[2]?.[0] ?? 0, pts[2]?.[1] ?? 0);
          sctx.stroke();
          // Drive bays: short vertical ticks along the far half.
          sctx.globalAlpha = 0.28;
          sctx.beginPath();
          for (let z = za + DEPTH * 0.45; z < zb - 0.05; z += 0.045) {
            const [tx, ty0] = project(x, y0 + uh * 0.18, z);
            const [, ty1] = project(x, y1 - uh * 0.18, z);
            sctx.moveTo(tx, ty0);
            sctx.lineTo(tx, ty1);
          }
          sctx.stroke();
          sctx.globalAlpha = 1;
        }
        // The lights: power, then two activity lights, near the near edge.
        const ym = (y0 + y1) / 2;
        for (let k = 0; k < LEDS && leds < MAX_LEDS; k += 1) {
          const z = za + 0.06 + k * 0.034;
          const [px, py] = project(x, ym, z);
          lx[leds] = px;
          ly[leds] = py;
          lr[leds] = Math.max(0.55, (0.011 * g.f) / z);
          lrack[leds] = index;
          lkind[leds] = k;
          lphase[leds] = hash(Math.round(c.seed), index * 64 + u, k);
          leds += 1;
        }
      }
      // The rack's plate, when there is room to read it.
      const size = (0.075 * g.f) / ((za + zb) / 2);
      const rk = c.racks[index];
      if (size >= 7 && rk) {
        const [tx, ty] = project(x, TOP - 0.06, (za + zb) / 2);
        sctx.font = `600 ${Math.round(size)}px ui-monospace, monospace`;
        sctx.textAlign = "center";
        sctx.textBaseline = "middle";
        sctx.fillStyle = edge ?? "gray";
        sctx.fillText(rk.name.slice(0, 6), tx, ty);
      }
    }
    // A vignette closes the frame.
    const v = sctx.createRadialGradient(
      g.cx,
      g.cy,
      g.h * 0.2,
      g.cx,
      g.cy,
      Math.max(g.w, g.h) * 0.75,
    );
    v.addColorStop(0, "rgba(0, 0, 0, 0)");
    v.addColorStop(1, "rgba(0, 0, 0, 0.35)");
    sctx.fillStyle = v;
    sctx.fillRect(0, 0, g.w, g.h);
  };

  const draw = () => {
    const c = cfg;
    if (!ctx || !sctx || !c || canvas.width < 2) return;
    if (stillCam !== camX) paintStill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(still, 0, 0);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const [, , , , , led, power, spike, , sweepCol, outline] = colours;
    const moving = c.motionSafe && !c.paused;
    // The sweep: a band of light passing from us to the end wall.
    const strength = clamp(c.sweep, 0, 1);
    if (strength > 0) {
      const period = Math.max(1500, c.sweepPeriod) / 1000;
      const share = moving ? (time % period) / period : 0.45;
      const zs = g.z0 * 0.8 + share * (g.zEnd - g.z0 * 0.8 + 1.5);
      const sweepSprite = tint(sweepCol ?? "white");
      ctx.globalCompositeOperation = "lighter";
      const fade = clamp((g.zEnd + 1 - zs) / 1.2, 0, 1);
      // On the floor: a soft pool spanning the aisle.
      const [ax, ay] = project(-A * 1.2, FLOOR, zs - 0.35);
      const [bx, by] = project(A * 1.2, FLOOR, zs + 0.35);
      ctx.globalAlpha = 0.38 * strength * fade;
      ctx.drawImage(
        sweepSprite,
        ax,
        by - (ay - by) * 0.3,
        bx - ax,
        (ay - by) * 1.6,
      );
      // On the racks: a sheen down each side.
      for (const side of [-1, 1]) {
        for (let s = -2; s <= 2; s += 1) {
          const z0 = zs + s * 0.12;
          const z1 = z0 + 0.12;
          if (z0 < g.z0 || z1 > g.z0 + g.rows * (DEPTH + GAP)) continue;
          ctx.globalAlpha = 0.07 * strength * (1 - Math.abs(s) / 3) * fade;
          ctx.fillStyle = sweepCol ?? "white";
          quad(ctx, [
            project(side * A, FLOOR, z0),
            project(side * A, TOP, z0),
            project(side * A, TOP, z1),
            project(side * A, FLOOR, z1),
          ]);
          ctx.fill();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    // Spiking racks pool amber on the floor in front of them.
    const amber = tint(spike ?? "orange");
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < c.racks.length; i += 1) {
      const level = spikeGlow[i] ?? 0;
      if (level < 0.01) continue;
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const zm = g.z0 + row * (DEPTH + GAP) + DEPTH / 2;
      const [ax, ay] = project(side * A * 0.98, FLOOR, zm - 0.45);
      const [bx, by] = project(side * A * 0.2, FLOOR, zm + 0.45);
      const flick = moving ? 0.75 + 0.25 * hash(Math.floor(time * 16), i) : 1;
      ctx.globalAlpha = 0.55 * level * flick;
      ctx.drawImage(
        amber,
        Math.min(ax, bx),
        by,
        Math.abs(bx - ax),
        (ay - by) * 1.2,
      );
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    // The lights.
    const ledSprite = tint(led ?? "lime");
    const powerSprite = tint(power ?? "blue");
    for (let i = 0; i < leds; i += 1) {
      const index = lrack[i] ?? 0;
      const rk = c.racks[index];
      if (!rk) continue;
      const kind = lkind[i] ?? 0;
      const phase = lphase[i] ?? 0;
      const l = shownLoad[index] ?? rk.load;
      const spiking = (spikeGlow[index] ?? 0) > 0.5;
      let on: boolean;
      if (kind === 0) on = true;
      else if (!moving) on = phase < 0.25 + 0.6 * l;
      else if (spiking) on = hash(Math.floor(time * 18 + phase * 7), i) > 0.3;
      else {
        // Activity: a coin toss per tick, ticks faster and lands more often with load.
        const rate = (0.4 + 8.6 * Math.pow(l, 1.3)) * (kind === 2 ? 0.7 : 1);
        on = hash(Math.floor(time * rate + phase * 13), i) < 0.22 + 0.62 * l;
      }
      const r = lr[i] ?? 1;
      const up = lift[index] ?? 0;
      const x = lx[i] ?? 0;
      const y = ly[i] ?? 0;
      if (!on) {
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = kind === 0 ? (power ?? "blue") : (led ?? "lime");
        ctx.fillRect(x - r * 0.5, y - r * 0.5, r, r);
        continue;
      }
      const colour = spiking ? spike : kind === 0 ? power : led;
      ctx.globalAlpha = kind === 0 ? 0.7 : 1;
      ctx.fillStyle = colour ?? "lime";
      ctx.fillRect(x - r * 0.6, y - r * 0.6, r * 1.2, r * 1.2);
      if (r > 0.9) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (kind === 0 ? 0.25 : 0.45) * (1 + 0.6 * up);
        const halo = r * 5;
        ctx.drawImage(
          spiking ? amber : kind === 0 ? powerSprite : ledSprite,
          x - halo,
          y - halo,
          halo * 2,
          halo * 2,
        );
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.globalAlpha = 1;
    // The rack under the hand or the focus: lifted and traced.
    for (let i = 0; i < c.racks.length; i += 1) {
      const up = lift[i] ?? 0;
      if (up < 0.01) continue;
      const face = faceOf(g, i, camX);
      const pts = face.pts as [number, number][];
      ctx.fillStyle = sweepCol ?? "white";
      ctx.globalAlpha = 0.06 * up;
      quad(ctx, pts);
      ctx.fill();
      ctx.strokeStyle = outline ?? "white";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.9 * up;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    placeTip();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /**
   * The tooltip rides its rack: above the face's middle, or out in the aisle
   * beside it when there is no room above, so it never covers the lights.
   */
  const placeTip = () => {
    const c = cfg;
    const el = tip.current;
    if (!c || !el || c.inspect < 0) return;
    const face = faceOf(g, c.inspect, camX);
    const zm = (face.za + face.zb) / 2;
    const [ax, ay] = project(face.side * A, 0.35, zm);
    const tw = el.offsetWidth;
    const th = el.offsetHeight;
    let x = ax - tw / 2;
    let y = ay - th - 10;
    if (y < 6) {
      const xs = face.pts.map((p) => p[0] ?? 0);
      x = face.side < 0 ? Math.max(...xs) + 10 : Math.min(...xs) - tw - 10;
      y = ay - th / 2;
    }
    x = clamp(x, 6, Math.max(6, g.w - tw - 6));
    y = clamp(y, 6, Math.max(6, g.h - th - 6));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };

  const springStep = (dt: number) => {
    const c = cfg;
    if (!c) return false;
    let busy = false;
    // Sway on the drift constants; lift on snap's; loads glide to their data.
    const kd = springs.drift.stiffness / springs.drift.mass;
    const cd = springs.drift.damping / springs.drift.mass;
    const ks = springs.snap.stiffness / springs.snap.mass;
    const cs = springs.snap.damping / springs.snap.mass;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      camV += (-kd * (camX - camAim) - cd * camV) * h;
      camX += camV * h;
      for (let i = 0; i < c.racks.length; i += 1) {
        const aim = i === c.inspect ? 1 : 0;
        const v =
          (liftV[i] ?? 0) +
          (-ks * ((lift[i] ?? 0) - aim) - cs * (liftV[i] ?? 0)) * h;
        liftV[i] = v;
        lift[i] = (lift[i] ?? 0) + v * h;
      }
    }
    if (Math.abs(camX - camAim) < 0.0005 && Math.abs(camV) < 0.0005) {
      camX = camAim;
      camV = 0;
    } else busy = true;
    const glide = 1 - Math.exp(-dt * 5);
    for (let i = 0; i < c.racks.length; i += 1) {
      const aim = i === c.inspect ? 1 : 0;
      if (
        Math.abs((lift[i] ?? 0) - aim) < 0.002 &&
        Math.abs(liftV[i] ?? 0) < 0.002
      ) {
        lift[i] = aim;
        liftV[i] = 0;
      } else busy = true;
      const rk = c.racks[i];
      if (!rk) continue;
      const lv = shownLoad[i] ?? rk.load;
      shownLoad[i] =
        Math.abs(lv - rk.load) < 0.002 ? rk.load : lv + (rk.load - lv) * glide;
      const sg = spikeGlow[i] ?? 0;
      const target = rk.spike ? 1 : 0;
      spikeGlow[i] =
        Math.abs(sg - target) < 0.01
          ? target
          : sg + (target - sg) * (1 - Math.exp(-dt * 4));
      if (shownLoad[i] !== rk.load || spikeGlow[i] !== target) busy = true;
    }
    return busy;
  };

  const settleAll = () => {
    const c = cfg;
    if (!c) return;
    camX = camAim;
    camV = 0;
    for (let i = 0; i < c.racks.length; i += 1) {
      lift[i] = i === c.inspect ? 1 : 0;
      liftV[i] = 0;
      const rk = c.racks[i];
      shownLoad[i] = rk?.load ?? 0;
      spikeGlow[i] = rk?.spike ? 1 : 0;
    }
  };

  const running = () => Boolean(cfg && cfg.motionSafe && !cfg.paused);

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const busy = springStep(dt);
    time += dt;
    // Lights alone are fine at thirty frames; a sway or a lift gets every frame.
    if (busy || now - drawnAt > 31) {
      drawnAt = now;
      draw();
    }
    if (running()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!running()) {
      settleAll();
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < COLOUR_COUNT; i += 1) {
      const el = kids[i];
      if (el) colours[i] = read(getComputedStyle(el).color);
    }
    tinted.clear();
    stillCam = Number.NaN;
  };

  const resize = () => {
    const c = cfg;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (!c || w < 1 || h < 1) return;
    ratio = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    g = geometryFor(w, h, c.racks.length / 2);
    const cw = Math.max(1, Math.round(w * ratio));
    const ch = Math.max(1, Math.round(h * ratio));
    for (const el of [canvas, still]) {
      if (el.width !== cw || el.height !== ch) {
        el.width = cw;
        el.height = ch;
      }
    }
    stillCam = Number.NaN;
    draw();
    kick();
  };

  // A browser short of memory may drop a 2D canvas's pixels; when it hands
  // them back, every cached layer and sprite is painted again.
  const restored = () => {
    paintGlow();
    tinted.clear();
    stillCam = Number.NaN;
    draw();
  };
  for (const el of [canvas, still, glow]) {
    el.addEventListener("contextrestored", restored);
  }

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!ctx || !sctx) {
        root.setAttribute("data-fallback", "");
        return;
      }
      if (!was) {
        readColours();
        for (let i = 0; i < next.racks.length; i += 1) {
          shownLoad[i] = next.racks[i]?.load ?? 0;
          spikeGlow[i] = next.racks[i]?.spike ? 1 : 0;
        }
        time = hash(Math.round(next.seed), 9) * 40;
        resize();
        return;
      }
      if (was.colorKey !== next.colorKey) readColours();
      const layoutChanged =
        was.racks.length !== next.racks.length ||
        was.units !== next.units ||
        was.racks.some((r, i) => r.name !== next.racks[i]?.name);
      if (layoutChanged || was.dpr !== next.dpr) {
        resize();
        return;
      }
      if (!next.motionSafe || next.paused) settleAll();
      draw();
      kick();
    },
    hit(clientX, clientY) {
      const c = cfg;
      if (!c) return -1;
      const r = root.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      for (let i = 0; i < c.racks.length; i += 1) {
        const pts = faceOf(g, i, camX).pts;
        let inside = true;
        for (let k = 0; k < 4; k += 1) {
          const a = pts[k];
          const b = pts[(k + 1) % 4];
          if (!a || !b) continue;
          const cross =
            ((b[0] ?? 0) - (a[0] ?? 0)) * (y - (a[1] ?? 0)) -
            ((b[1] ?? 0) - (a[1] ?? 0)) * (x - (a[0] ?? 0));
          // The left wall's corners run clockwise on screen, the right's the other way.
          if ((i % 2 === 0 ? -cross : cross) > 0) {
            inside = false;
            break;
          }
        }
        if (inside) return i;
      }
      return -1;
    },
    sway(share) {
      const c = cfg;
      if (!c) return;
      camAim =
        share === null ? 0 : (share - 0.5) * 0.5 * clamp(c.parallax, 0, 1);
      if (!running()) {
        camX = camAim;
        camV = 0;
        draw();
        return;
      }
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
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      tinted.clear();
      for (const el of [canvas, still, glow]) {
        el.removeEventListener("contextrestored", restored);
      }
      root.removeAttribute("data-live");
    },
  };
}

/** The server's still: the aisle's racks as flat token shapes in a 1000 × 300 box. */
function stillFaces(rows: number) {
  const g = geometryFor(1000, 300, rows);
  const faces: string[] = [];
  for (let i = rows * 2 - 1; i >= 0; i -= 1) {
    const { pts } = faceOf(g, i, 0);
    faces.push(
      `M ${pts.map((p) => `${Math.round((p[0] ?? 0) * 10) / 10} ${Math.round((p[1] ?? 0) * 10) / 10}`).join(" L ")} Z`,
    );
  }
  const end = [
    [-A, FLOOR],
    [-A, CEIL],
    [A, CEIL],
    [A, FLOOR],
  ].map(([x, y]) => [
    Math.round((g.cx + (g.f * (x ?? 0)) / g.zEnd) * 10) / 10,
    Math.round((g.cy - (g.f * (y ?? 0)) / g.zEnd) * 10) / 10,
  ]);
  return {
    faces,
    end: `M ${end.map((p) => `${p[0]} ${p[1]}`).join(" L ")} Z`,
  };
}

/**
 * A dark aisle of server racks seen down its length in one-point perspective:
 * cabinets on both sides, their faces lined with servers and tiny status
 * lights, a ruled raised floor running to a lit doorway, a cable tray
 * overhead. Every activity light blinks at a rate that follows its rack's load
 * from data, a slow band of light sweeps down the aisle, and a rack whose data
 * spikes flickers amber and pools amber light on the floor in front of it.
 *
 * Hovering a rack lifts it on springs.snap — its face brightens, an outline
 * traces it — and a tooltip rises with its name and load; a click pins it. The
 * pointer also sways the view on springs.drift. The racks are a roving set of
 * buttons: Up and Down walk the aisle, Left and Right cross it, Home and End
 * jump to its ends, Enter pins and Escape unpins. A 2D canvas with a cached
 * still layer; it runs only on screen, and holds steady lights under reduced
 * motion.
 */
export function RackAisle({
  items,
  racks = 6,
  load = 0.5,
  sweep = 0.5,
  sweepPeriod = 7000,
  spikeAt = 0.92,
  units = 11,
  value,
  defaultValue = null,
  onValueChange,
  parallax = 0.5,
  ledColor = DEFAULT_LED,
  spikeColor = DEFAULT_SPIKE,
  roomColor = DEFAULT_ROOM,
  site = "Basinworks east, row 4",
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Server aisle",
  disabled = false,
  className,
}: RackAisleProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;

  const list = racksFor(items, racks, load, spikeAt, seed);
  const rows = list.length / 2;

  const [own, setOwn] = React.useState<string | null>(defaultValue);
  const pinnedId = value === undefined ? own : value;
  const pinned = list.findIndex((r) => r.id === pinnedId);
  const [hover, setHover] = React.useState(-1);
  const [active, setActive] = React.useState(0);
  const [focused, setFocused] = React.useState(false);
  const [box, setBox] = React.useState<{ w: number; h: number } | null>(null);

  // Announce a spike once, at its onset, from the data that brought it.
  const spikeKey = list
    .filter((r) => r.spike)
    .map((r) => r.id)
    .join(",");
  const [seenSpikes, setSeenSpikes] = React.useState(spikeKey);
  const [spoken, setSpoken] = React.useState("");
  if (spikeKey !== seenSpikes) {
    const before = new Set(seenSpikes.split(",").filter(Boolean));
    const fresh = list.find((r) => r.spike && !before.has(r.id));
    setSeenSpikes(spikeKey);
    if (fresh) setSpoken(`Load spike on ${fresh.name}.`);
  }

  const activeIndex = clamp(active, 0, list.length - 1);
  const inspect =
    hover >= 0 ? hover : focused ? activeIndex : pinned >= 0 ? pinned : -1;
  const shown = inspect >= 0 ? list[inspect] : undefined;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const tipRef = React.useRef<HTMLDivElement | null>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const room = roomColor;
  const colours = [
    room,
    `oklch(from ${room} calc(l * 1.22) calc(c * 0.7) h)`,
    `oklch(from ${room} calc(l * 0.55) c h)`,
    `oklch(from ${room} calc(l * 0.8) calc(c * 0.9) h)`,
    `oklch(from ${room} calc(l * 1.7 + 0.08) calc(c * 0.6) h)`,
    ledColor,
    "oklch(from var(--accent-bright) 0.74 0.13 h)",
    spikeColor,
    "oklch(from var(--accent) 0.94 0.04 h)",
    "oklch(from var(--accent) 0.9 0.05 h)",
    "oklch(from var(--accent-bright) 0.78 0.14 h)",
  ];

  const config: Config = {
    racks: list,
    units,
    sweep,
    sweepPeriod,
    parallax,
    seed,
    dpr,
    paused,
    motionSafe,
    colorKey: colours.join("|"),
    inspect,
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
    const e = createEngine(root, canvas, carriers, tipRef, visible);
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
    const sizer = new ResizeObserver(() => {
      setBox({ w: node.clientWidth, h: node.clientHeight });
      engine.current?.resize();
    });
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

  /** Pins or unpins a rack, from the click or key that asked. */
  const pin = (index: number | null) => {
    if (disabled) return;
    const id = index === null ? null : (list[index]?.id ?? null);
    const next = id !== null && id === pinnedId ? null : id;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const focusRack = (index: number) => {
    const next = clamp(index, 0, list.length - 1);
    setActive(next);
    const id = list[next]?.id;
    if (id) buttons.current.get(id)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const i = activeIndex;
    const side = i % 2;
    const row = Math.floor(i / 2);
    let next: number | null = null;
    if (event.key === "ArrowUp") next = Math.min(rows - 1, row + 1) * 2 + side;
    else if (event.key === "ArrowDown") next = Math.max(0, row - 1) * 2 + side;
    else if (event.key === "ArrowLeft") next = row * 2;
    else if (event.key === "ArrowRight") next = row * 2 + 1;
    else if (event.key === "Home") next = side;
    else if (event.key === "End") next = (rows - 1) * 2 + side;
    else if (event.key === "Escape") {
      if (pinnedId === null) return;
      event.preventDefault();
      if (value === undefined) setOwn(null);
      onValueChange?.(null);
      return;
    }
    if (next === null) return;
    event.preventDefault();
    focusRack(next);
  };

  const still = stillFaces(rows);
  const g = box ? geometryFor(box.w, box.h, rows) : null;
  const pct = shown ? Math.round(shown.load * 100) : 0;

  return (
    <div
      ref={bindRoot}
      onPointerMove={(event) => {
        if (disabled) return;
        const e = engine.current;
        if (!e) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (event.pointerType !== "touch") {
          e.sway((event.clientX - r.left) / Math.max(1, r.width));
        }
        const at = e.hit(event.clientX, event.clientY);
        if (at !== hover) setHover(at);
      }}
      onPointerLeave={() => {
        engine.current?.sway(null);
        if (hover !== -1) setHover(-1);
      }}
      onClick={(event) => {
        if (disabled || event.detail === 0) return;
        const at = engine.current?.hit(event.clientX, event.clientY) ?? -1;
        if (at >= 0) {
          setActive(at);
          pin(at);
        }
      }}
      className={cn(
        "group/rack-aisle relative isolate h-full w-full touch-pan-y overflow-clip rounded-3 [contain:paint] select-none",
        disabled
          ? "cursor-not-allowed"
          : hover >= 0
            ? "cursor-pointer"
            : "cursor-default",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 1000 300"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 size-full group-data-live/rack-aisle:hidden"
      >
        <rect width="1000" height="300" fill={room} />
        <path d={still.end} fill={`oklch(from ${room} calc(l * 0.55) c h)`} />
        {still.faces.map((d, i) => (
          <path
            key={i}
            d={d}
            fill={`oklch(from ${room} calc(l * 0.55) c h)`}
            stroke={`oklch(from ${room} calc(l * 1.7 + 0.08) calc(c * 0.6) h)`}
            strokeWidth={1}
          />
        ))}
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/rack-aisle:opacity-100"
      />
      <div
        role="group"
        aria-label={label}
        aria-describedby={hintId}
        className="absolute inset-0"
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setFocused(false);
        }}
      >
        {g
          ? list.map((r, i) => {
              const b = boxOf(g, i);
              return (
                <button
                  key={r.id}
                  ref={(node) => {
                    if (node) buttons.current.set(r.id, node);
                    else buttons.current.delete(r.id);
                  }}
                  type="button"
                  tabIndex={i === activeIndex ? 0 : -1}
                  aria-label={`${r.name}, ${Math.round(r.load * 100)}% load${r.spike ? ", load spike" : ""}`}
                  aria-pressed={r.id === pinnedId}
                  aria-disabled={disabled || undefined}
                  onFocus={() => setActive(i)}
                  onClick={(event) => {
                    if (event.detail === 0) pin(i);
                  }}
                  className="pointer-events-none absolute rounded-2 outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                  style={{
                    left: b.left,
                    top: b.top,
                    width: b.width,
                    height: b.height,
                  }}
                />
              );
            })
          : null}
      </div>
      <div
        ref={tipRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 z-20 w-44"
        style={{ visibility: shown ? "visible" : "hidden" }}
      >
        {shown ? (
          <motion.div
            key={shown.id}
            initial={motionSafe ? { opacity: 0, y: distances.step } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={
              motionSafe ? springs.snap : { duration: durations.fast }
            }
            className="rounded-2 border border-hairline-strong bg-popover/95 px-2.5 py-2 shadow-md backdrop-blur-sm"
          >
            <p className="truncate font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase">
              {site}
            </p>
            <p className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-foreground">
              <span className="truncate font-medium">{shown.name}</span>
              <span className="font-mono tabular-nums">{pct}%</span>
            </p>
            <span className="mt-1.5 block h-1 w-full overflow-clip rounded-full bg-muted">
              <span
                className={cn(
                  "block h-full rounded-full",
                  shown.spike ? "bg-warn" : "bg-signal",
                )}
                style={{ width: `${pct}%` }}
              />
            </span>
            {shown.spike ? (
              <p className="mt-1 font-mono text-[9px] tracking-[0.08em] text-warn uppercase">
                Load spike
              </p>
            ) : null}
          </motion.div>
        ) : null}
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {colours.map((c, i) => (
          <span key={i} style={{ color: c }} />
        ))}
      </span>
      <span
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: room }}
      />
      <p id={hintId} className="sr-only">
        Up and Down walk the aisle, Left and Right cross it, Home and End jump
        to its ends. Enter pins a rack; Escape unpins it.
      </p>
      <p role="status" aria-live="polite" className="sr-only">
        {spoken}
      </p>
    </div>
  );
}
