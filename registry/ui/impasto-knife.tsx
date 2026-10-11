"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  GLSL_SRGB,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type ImpastoKnifePalette = "ochre" | "harbour" | "garden" | "ink";

export type ImpastoKnifeProps = {
  /** How much body the paint has, 0.2 to 1: a thin glaze to heavy slabs with tall ridges. @default 0.6 */
  thickness?: number;
  /** The pigments the knife loads, one fresh dollop per stroke in turn. @default "ochre" */
  palette?: ImpastoKnifePalette;
  /** Two to six CSS colours that replace `palette`. */
  colors?: string[];
  /** Where the raking light comes from, in degrees clockwise from the right edge: 225 is the top left. @default 225 */
  lightAngle?: number;
  /** How high the light stands, 0 (raking, long highlights) to 1 (overhead, flat). @default 0.3 */
  lightHeight?: number;
  /** How glossy the oil is, 0 (matte) to 1 (wet). @default 0.5 */
  gloss?: number;
  /** The blade's width, px. @default 30 */
  knifeWidth?: number;
  /** How much wet paint the knife scoops up and folds into its load, 0 to 1. @default 0.55 */
  blend?: number;
  /** The primed board's colour, any CSS colour. A fixed gesso in both themes by default. @default "oklch(from var(--warn) 0.93 0.018 h)" */
  ground?: string;
  /** Knife strokes already on the board when it first shows, 0 to 4. @default 3 */
  defaultStrokes?: number;
  /** The pointer paints. @default true */
  interactive?: boolean;
  /** Any change scrapes the board clean. */
  clearKey?: string | number;
  /** Seeds the first strokes and each stroke's blade marks. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The board's accessible name, for the keyboard's way in. @default "Paint board" */
  label?: string;
  /** Play the knife's scratch on the board. Off unless asked for. @default false */
  sound?: boolean;
  /** A stroke was laid: how many so far, and which pigment of the palette it loaded. */
  onStroke?: (count: number, pigment: number) => void;
  /** The board was scraped clean. */
  onClear?: () => void;
  /** Nothing paints and the keyboard's way in is off. @default false */
  disabled?: boolean;
  /** Sizes the board. @default "h-56 w-full" */
  className?: string;
};

/**
 * Pigments as pigment: a token's hue and chroma at a fixed lightness, so the
 * paint is the same paint on a light page and a dark one.
 */
const pig = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} ${turn ? `calc(h + ${turn})` : "h"})`;

const PALETTES: Record<ImpastoKnifePalette, string[]> = {
  ochre: [
    pig("--warn", 0.76, 0.12),
    pig("--danger", 0.62, 0.12, 6),
    pig("--warn", 0.5, 0.1, -36),
    pig("--warn", 0.96, 0.012),
  ],
  harbour: [
    pig("--accent", 0.5, 0.15),
    pig("--accent", 0.72, 0.09, -42),
    pig("--accent", 0.36, 0.04),
    pig("--warn", 0.95, 0.012),
  ],
  garden: [
    pig("--success", 0.58, 0.12),
    pig("--warn", 0.84, 0.14, 14),
    pig("--signal", 0.52, 0.08),
    pig("--danger", 0.7, 0.1, -12),
  ],
  ink: [
    pig("--ink", 0.26, 0.01),
    pig("--warn", 0.42, 0.05, -24),
    pig("--warn", 0.66, 0.02),
    pig("--warn", 0.95, 0.01),
  ],
};

/** One grid cell, CSS px: fine enough for crisp ridges, coarse enough to simulate live. */
const CELL = 2;
const MAX_H = 3.4;
const SCRAPE_TIME = 0.52;
const PULL_TIME = 0.36;
const PULL_LENGTH = 120;
const DOUBLE_TAP = 350;
/** What a scraped board keeps of each cell's paint: a ghost in the gesso. */
const stainOf = (h: number) => Math.min(0.075, h * 0.07);

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

/** Smooth 2D value noise in [0, 1): the dry knife's broken streaks. */
function grain(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(11, xi, yi);
  const b = hash(11, xi + 1, yi);
  const c = hash(11, xi, yi + 1);
  const d = hash(11, xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const toLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const toByte = (lin: number) => {
  const c = clamp(lin, 0, 1);
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
};

/** Any CSS colour as linear rgb, through a 1×1 canvas. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0.8, 0.78, 0.72];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(200, 196, 186)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [toLinear(d[0] ?? 0), toLinear(d[1] ?? 0), toLinear(d[2] ?? 0)];
  };
}

/** Log reflectance: mixing in it is a geometric mean, so yellow and blue make green, not grey. */
const logOf = (lin: [number, number, number]): [number, number, number] => [
  Math.log(Math.max(0.004, lin[0])),
  Math.log(Math.max(0.004, lin[1])),
  Math.log(Math.max(0.004, lin[2])),
];

type Stroke = {
  x: number;
  y: number;
  angle: number;
  length: number;
  bend: number;
  pigment: number;
};

/** The board's first strokes, as fractions of the box: seeded, so server and client agree. */
function firstStrokes(seed: number, count: number): Stroke[] {
  const out: Stroke[] = [];
  const n = clamp(Math.round(count), 0, 4);
  for (let k = 0; k < n; k += 1) {
    const j = (i: number) => hash(seed, 300 + k, i);
    out.push({
      x: 0.1 + (0.78 / Math.max(1, n)) * k + j(0) * 0.08,
      y: 0.24 + j(1) * 0.5,
      angle: (j(2) - 0.5) * 0.9,
      length: 0.2 + j(3) * 0.12,
      bend: (j(4) - 0.5) * 0.5,
      pigment: k,
    });
  }
  return out;
}

const FRAGMENT = /* glsl */ `
uniform sampler2D u_paint;
uniform vec2 u_grid;
uniform vec2 u_res;
uniform float u_cell;
uniform vec3 u_ground;
uniform vec3 u_light;
uniform float u_relief;
uniform float u_gloss;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}
${GLSL_SRGB}

float heightAt(vec2 g) { return max(texture(u_paint, g).a, 0.0); }

void main() {
  vec2 px = v_uv * u_res;
  vec2 g = px / (u_grid * u_cell);
  vec2 tx = 1.0 / u_grid;
  vec4 p = texture(u_paint, g);
  float h = max(p.a, 0.0);

  // Central differences one cell apart of a bilinear field are themselves
  // continuous, so the shading is smooth at any zoom instead of faceted.
  float hl = heightAt(g - vec2(tx.x, 0.0));
  float hr = heightAt(g + vec2(tx.x, 0.0));
  float hu = heightAt(g - vec2(0.0, tx.y));
  float hd = heightAt(g + vec2(0.0, tx.y));
  vec3 n = normalize(vec3((hl - hr) * u_relief, (hu - hd) * u_relief, 2.0 * u_cell));

  // The gesso's tooth: a fine bump that thick paint fills and hides.
  // Coverage from a slightly softened height, so a stroke's edge is drawn
  // smooth rather than stepped at the 2 px cells.
  float soft = (h * 2.0 + hl + hr + hu + hd) / 6.0;
  float cover = smoothstep(0.012, 0.2, soft);
  float tooth = kx_noise(px * 0.85) - 0.5;
  float tooth2 = kx_noise(px * 0.85 + vec2(17.3, 5.1)) - 0.5;
  n = normalize(n + vec3(tooth, tooth2, 0.0) * 0.16 * (1.0 - cover * 0.85));

  // Grooves sit in shadow: how far this point is below its neighbourhood.
  float around = (heightAt(g + vec2(tx.x * 2.5, 0.0)) + heightAt(g - vec2(tx.x * 2.5, 0.0))
    + heightAt(g + vec2(0.0, tx.y * 2.5)) + heightAt(g - vec2(0.0, tx.y * 2.5))) * 0.25;
  float cavity = clamp((around - h) * 0.2, 0.0, 0.26);

  vec3 L = u_light;
  float flatLit = L.z;
  float diff = max(dot(n, L), 0.0);
  float shade = 1.0 + 0.55 * clamp((diff - flatLit) * 2.2, -1.0, 1.0);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float nh = max(dot(n, H), 0.0);
  float spec = (pow(nh, 70.0) * 1.1 + pow(nh, 14.0) * 0.06) * u_gloss * cover;

  vec3 paint = exp(p.rgb);
  vec3 ground = u_ground * (1.0 + tooth * 0.05);
  vec3 base = mix(ground, paint, cover);
  vec3 lit = base * shade * (1.0 - cavity) + vec3(spec);
  o_color = vec4(kx_linearToSrgb(clamp(lit, 0.0, 1.0)), 1.0);
}
`;

type Config = {
  thickness: number;
  lightAngle: number;
  lightHeight: number;
  gloss: number;
  knifeWidth: number;
  blend: number;
  defaultStrokes: number;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Report = {
  onStroke?: (count: number, pigment: number) => void;
  onClear?: () => void;
  said: (text: string) => void;
  /** How hard the knife is working this move, 0 to 1, for the scratch. */
  scratch: (level: number, pitch: number) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  colours: (pigments: string[], ground: string) => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  strokeStart: (x: number, y: number) => void;
  strokeMove: (x: number, y: number) => number;
  strokeEnd: () => void;
  print: (x: number, y: number, angle: number) => void;
  pull: (x: number, y: number, angle: number, length: number) => void;
  scrape: () => void;
  busy: () => boolean;
  facing: () => number;
  dispose: () => void;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  texture: WebGLTexture;
  lost: boolean;
  w: number;
  h: number;
};

function createBoard(
  root: HTMLDivElement,
  glCanvas: HTMLCanvasElement,
  flatCanvas: HTMLCanvasElement,
  report: { current: Report },
): Engine {
  const read = colourReader();
  let cfg: Config | null = null;
  let cols = 0;
  let rows = 0;
  let data = new Float32Array(0);
  let width = 0;
  let height = 0;
  let pigments: [number, number, number][] = [];
  let groundLin: [number, number, number] = [0.84, 0.8, 0.72];
  let groundLog: [number, number, number] = logOf(groundLin);
  let gpu: Gpu | null = null;
  let flat: CanvasRenderingContext2D | null = null;
  let image: ImageData | null = null;
  let cellCanvas: HTMLCanvasElement | null = null;
  let frame = 0;
  let visible = false;
  let pending = false;
  let disposed = false;
  let seeded = false;
  let strokes = 0;
  const dirty = { x0: 1e9, y0: 1e9, x1: -1, y1: -1, all: true };
  // The cells this stroke has touched, for the settle when it lifts.
  const box = { x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
  const running: AnimationPlaybackControls[] = [];
  // Cells a tip spill lands in, gathered per step (preallocated: no garbage per move).
  const tips = new Int32Array(512);
  const tipW = new Float32Array(512);

  const knife = {
    active: false,
    x: 0,
    y: 0,
    fx: 1,
    fy: 0,
    load: 0,
    layer: 0.5,
    lr: 0,
    lg: 0,
    lb: 0,
    residue: false,
    rr: 0,
    rg: 0,
    rb: 0,
    pigment: 0,
    picked: 0,
    // The blade's own marks for this stroke: three waves and a nick.
    f1: 0.4,
    p1: 0,
    f2: 1.2,
    p2: 0,
    f3: 2.4,
    p3: 0,
    nick: 0,
    nickOn: false,
    salt: 0,
    /** How far this stroke has travelled, cells: the scumble's grain runs along it. */
    dist: 0,
  };

  const half = () => clamp((cfg?.knifeWidth ?? 30) / 2 / CELL, 3, 40);

  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    dirty.x0 = Math.min(dirty.x0, Math.max(0, Math.floor(x0)));
    dirty.y0 = Math.min(dirty.y0, Math.max(0, Math.floor(y0)));
    dirty.x1 = Math.max(dirty.x1, Math.min(cols - 1, Math.ceil(x1)));
    dirty.y1 = Math.max(dirty.y1, Math.min(rows - 1, Math.ceil(y1)));
  };

  const clearData = (stain: boolean) => {
    for (let i = 0; i < data.length; i += 4) {
      const h = stain ? stainOf(data[i + 3] ?? 0) : 0;
      if (h < 0.004) {
        data[i] = groundLog[0];
        data[i + 1] = groundLog[1];
        data[i + 2] = groundLog[2];
        data[i + 3] = 0;
      } else data[i + 3] = h;
    }
    dirty.all = true;
  };

  /** How the blade's edge sits across its width: three waves and an occasional nick. */
  const streak = (j: number) => {
    let s =
      1 +
      0.38 *
        (0.55 * Math.sin(knife.f1 * j + knife.p1) +
          0.3 * Math.sin(knife.f2 * j + knife.p2) +
          0.15 * Math.sin(knife.f3 * j + knife.p3));
    if (knife.nickOn) {
      const d = Math.abs(j - knife.nick);
      if (d < 0.8) s *= 0.35 + 0.65 * (d / 0.8);
    }
    return s;
  };

  const loadStroke = (pigment: number) => {
    const c = cfg;
    if (!c) return;
    const p = pigments.length
      ? (pigments[pigment % pigments.length] ?? pigments[0])
      : undefined;
    const fresh = p ?? [Math.log(0.6), Math.log(0.45), Math.log(0.2)];
    // The knife keeps what it carried last time and folds it into the new dollop.
    const keep = knife.residue ? 0.3 : 0;
    knife.lr = fresh[0] + (knife.rr - fresh[0]) * keep;
    knife.lg = fresh[1] + (knife.rg - fresh[1]) * keep;
    knife.lb = fresh[2] + (knife.rb - fresh[2]) * keep;
    knife.pigment = pigment;
    const th = clamp(c.thickness, 0.2, 1);
    knife.layer = 0.32 + 0.55 * th;
    knife.load = 2 * half() * knife.layer * (64 + 56 * th);
    knife.salt += 1;
    const s = c.seed * 131 + knife.salt * 17;
    knife.f1 = 0.32 + 0.3 * hash(s, 1, 0);
    knife.p1 = 6.28 * hash(s, 1, 1);
    knife.f2 = 1 + 0.6 * hash(s, 1, 2);
    knife.p2 = 6.28 * hash(s, 1, 3);
    knife.f3 = 2.2 + 0.6 * hash(s, 1, 4);
    knife.p3 = 6.28 * hash(s, 1, 5);
    knife.nickOn = hash(s, 1, 6) < 0.55;
    knife.nick = (hash(s, 1, 7) - 0.5) * 1.5 * half();
  };

  const mixCell = (o: number, w: number) => {
    data[o] = (data[o] ?? 0) + (knife.lr - (data[o] ?? 0)) * w;
    data[o + 1] = (data[o + 1] ?? 0) + (knife.lg - (data[o + 1] ?? 0)) * w;
    data[o + 2] = (data[o + 2] ?? 0) + (knife.lb - (data[o + 2] ?? 0)) * w;
  };

  const lay = (from: number, count: number, total: number) => {
    if (count === 0 || total <= 0) return;
    let sum = 0;
    for (let n = 0; n < count; n += 1) sum += tipW[from + n] ?? 0;
    if (sum <= 0) return;
    for (let n = 0; n < count; n += 1) {
      const o = tips[from + n] ?? 0;
      const h = data[o + 3] ?? 0;
      const nh = Math.min(MAX_H, h + (total * (tipW[from + n] ?? 0)) / sum);
      data[o + 3] = nh;
      mixCell(o, nh > 0 ? (nh - h) / nh : 1);
    }
  };

  /**
   * One step of the blade: cells under it are scraped down to the layer it
   * leaves (the excess joins its load) or filled up to it from the load;
   * what is scraped near the tips squeezes out sideways as ridges; half a
   * bead rides one cell ahead, and is picked up again next step.
   */
  const sweep = (px: number, py: number, step: number) => {
    const c = cfg;
    if (!c || cols === 0) return;
    const B = half();
    const fx = knife.fx;
    const fy = knife.fy;
    const tx = -fy;
    const ty = fx;
    const reachB = B + 2;
    const ex = Math.abs(tx) * reachB + Math.abs(fx) * (step + 2);
    const ey = Math.abs(ty) * reachB + Math.abs(fy) * (step + 2);
    const x0 = Math.max(0, Math.floor(px - ex));
    const x1 = Math.min(cols - 1, Math.ceil(px + ex));
    const y0 = Math.max(0, Math.floor(py - ey));
    const y1 = Math.min(rows - 1, Math.ceil(py + ey));
    if (x1 < x0 || y1 < y0) return;
    mark(x0, y0, x1, y1);
    box.x0 = Math.min(box.x0, x0);
    box.y0 = Math.min(box.y0, y0);
    box.x1 = Math.max(box.x1, x1);
    box.y1 = Math.max(box.y1, y1);
    const pick = 0.55 + 0.45 * clamp(c.blend, 0, 1);
    const full = 2 * B * knife.layer * 5;
    const dry = clamp(knife.load / Math.max(full, 0.001), 0, 1);
    // As the load runs low the layer it leaves thins, then breaks up.
    const thin = clamp(knife.load / Math.max(full * 2.8, 0.001), 0.4, 1);
    let spillA = 0;
    let spillB = 0;
    let tipA = 0;
    let tipB = 0;
    let picked = 0;
    const mid = -step / 2;
    for (let k = y0; k <= y1; k += 1) {
      for (let i = x0; i <= x1; i += 1) {
        const rx = i + 0.5 - px;
        const ry = k + 0.5 - py;
        const a = rx * fx + ry * fy;
        const j = rx * tx + ry * ty;
        const o = (k * cols + i) * 4;
        const aj = Math.abs(j);
        // Cells a tip spill lands in overlap from one step to the next and
        // fall off smoothly, so the ridge comes out continuous, not beaded.
        if (aj > B - 0.3 && aj <= B + 2.2 && a > -step - 1.5 && a <= 0.5) {
          const wa = 1 - Math.abs(a - mid) / (step / 2 + 1.5);
          const wj = 1 - Math.abs(aj - (B + 0.8)) / 1.6;
          const w = Math.max(0, wa) * Math.max(0, wj);
          if (w > 0.02) {
            if (j < 0 && tipA < 256) {
              tips[tipA] = o;
              tipW[tipA] = w;
              tipA += 1;
            } else if (j >= 0 && tipB < 256) {
              tips[256 + tipB] = o;
              tipW[256 + tipB] = w;
              tipB += 1;
            }
          }
        }
        if (a <= -step - 0.5 || a > 0 || aj > B + 0.5) continue;
        // The blade's ends are antialiased: a hard cut at a shallow angle to
        // the grid would comb the ridge into a zipper.
        const edge = Math.min(1, B + 0.5 - aj);
        const target = knife.layer * streak(j) * (0.45 + 0.55 * thin);
        const h = data[o + 3] ?? 0;
        if (h > target) {
          const take = (h - target) * pick * edge;
          const spill = take * (aj > B - 1.6 ? 0.55 : 0.1);
          const w = take / Math.max(knife.load + take, 0.001);
          knife.lr += ((data[o] ?? 0) - knife.lr) * w;
          knife.lg += ((data[o + 1] ?? 0) - knife.lg) * w;
          knife.lb += ((data[o + 2] ?? 0) - knife.lb) * w;
          knife.load += take - spill;
          if (j < 0) spillA += spill;
          else spillB += spill;
          data[o + 3] = h - take;
          // What stays is smeared toward what the knife carries.
          mixCell(o, 0.22 + 0.18 * Math.sin(j * 1.7 + knife.p2));
          picked += take;
        } else if (knife.load > 0.001) {
          // A drying knife only leaves paint in broken streaks: the scumble.
          if (
            dry < 1 &&
            grain(j * 0.7 + knife.salt * 13.1, knife.dist * 0.2) > dry * 1.15
          ) {
            continue;
          }
          const dep = Math.min(
            (target - h) * (0.7 + 0.3 * dry) * edge,
            knife.load,
          );
          if (dep <= 0) continue;
          const nh = h + dep;
          data[o + 3] = nh;
          knife.load -= dep;
          mixCell(
            o,
            (dep / nh) * (0.6 + 0.4 * Math.sin(j * 0.9 + knife.p1) ** 2),
          );
        }
      }
    }
    // The ridges: what squeezed past each end lands just outside it.
    lay(0, tipA, spillA);
    lay(256, tipB, spillB);
    // The bead: paint the blade pushes along in front of it, while it has
    // paint to push.
    const bead = Math.min(2.4, (knife.load / Math.max(2 * B, 1)) * 0.055);
    if (bead > 0.02 && dry >= 1) {
      for (let k = y0; k <= y1; k += 1) {
        for (let i = x0; i <= x1; i += 1) {
          const rx = i + 0.5 - px;
          const ry = k + 0.5 - py;
          const a = rx * fx + ry * fy;
          if (a <= 0 || a > 1.4) continue;
          const j = rx * tx + ry * ty;
          if (Math.abs(j) > B - 0.5) continue;
          const o = (k * cols + i) * 4;
          const h = data[o + 3] ?? 0;
          const want =
            knife.layer * streak(j) * (0.45 + 0.55 * thin) +
            bead * (1 - (j / B) ** 4);
          if (h >= want) continue;
          const add = Math.min((want - h) * 0.5, knife.load);
          if (add <= 0) continue;
          const nh = h + add;
          data[o + 3] = nh;
          knife.load -= add;
          mixCell(o, add / nh);
        }
      }
    }
    knife.picked += picked;
  };

  const travel = (cx: number, cy: number) => {
    const dx = cx - knife.x;
    const dy = cy - knife.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.02) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const steps = Math.max(1, Math.ceil(dist / 0.75));
    const step = dist / steps;
    for (let s = 0; s < steps; s += 1) {
      // The wrist: the blade turns toward the travel over a few cells, so a
      // curve sweeps a fan rather than snapping square.
      const a = 1 - Math.exp(-step / 5);
      let fx = knife.fx + (nx - knife.fx) * a;
      let fy = knife.fy + (ny - knife.fy) * a;
      const fl = Math.hypot(fx, fy) || 1;
      fx /= fl;
      fy /= fl;
      knife.fx = fx;
      knife.fy = fy;
      knife.x += nx * step;
      knife.y += ny * step;
      knife.dist += step;
      sweep(knife.x, knife.y, step);
    }
  };

  /**
   * Fresh paint levels a touch once the knife lifts: one soft pass over the
   * stroke's heights takes out the cell-sized stair steps a diagonal stroke
   * leaves along its ridges, and keeps the ridges.
   */
  const settle = () => {
    if (box.x1 < box.x0 || cols === 0) return;
    const x0 = Math.max(1, box.x0 - 3);
    const y0 = Math.max(1, box.y0 - 3);
    const x1 = Math.min(cols - 2, box.x1 + 3);
    const y1 = Math.min(rows - 2, box.y1 + 3);
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return;
    const out = new Float32Array(w * h);
    for (let k = y0; k <= y1; k += 1) {
      for (let i = x0; i <= x1; i += 1) {
        const H = (di: number, dk: number) =>
          data[((k + dk) * cols + (i + di)) * 4 + 3] ?? 0;
        const blur =
          (H(0, 0) * 4 +
            (H(-1, 0) + H(1, 0) + H(0, -1) + H(0, 1)) * 2 +
            H(-1, -1) +
            H(1, -1) +
            H(-1, 1) +
            H(1, 1)) /
          16;
        out[(k - y0) * w + (i - x0)] = H(0, 0) + (blur - H(0, 0)) * 0.55;
      }
    }
    for (let k = y0; k <= y1; k += 1) {
      for (let i = x0; i <= x1; i += 1) {
        const v = out[(k - y0) * w + (i - x0)] ?? 0;
        data[(k * cols + i) * 4 + 3] = v < 0.004 ? 0 : v;
      }
    }
    mark(x0, y0, x1, y1);
  };

  /** Lifting the knife leaves the bead as a lump and keeps the rest as residue. */
  const lift = () => {
    if (!knife.active) return;
    knife.active = false;
    const B = half();
    const lump = knife.load * 0.6;
    if (lump > 0.01 && cols > 0) {
      const tx = -knife.fy;
      const ty = knife.fx;
      let cells = 0;
      const x0 = Math.max(0, Math.floor(knife.x - B - 3));
      const x1 = Math.min(cols - 1, Math.ceil(knife.x + B + 3));
      const y0 = Math.max(0, Math.floor(knife.y - B - 3));
      const y1 = Math.min(rows - 1, Math.ceil(knife.y + B + 3));
      for (let pass = 0; pass < 2; pass += 1) {
        for (let k = y0; k <= y1; k += 1) {
          for (let i = x0; i <= x1; i += 1) {
            const rx = i + 0.5 - knife.x;
            const ry = k + 0.5 - knife.y;
            const a = rx * knife.fx + ry * knife.fy;
            const j = rx * tx + ry * ty;
            if (a <= 0 || a > 2.4 || Math.abs(j) > B) continue;
            if (pass === 0) {
              cells += 1;
              continue;
            }
            const o = (k * cols + i) * 4;
            const h = data[o + 3] ?? 0;
            const shape = 1 - (j / B) ** 2;
            const add = Math.min(
              MAX_H - h,
              ((lump / Math.max(cells, 1)) * 1.5 * shape) / (1 + a * 0.4),
            );
            if (add <= 0) continue;
            const nh = h + add;
            data[o + 3] = nh;
            mixCell(o, add / nh);
          }
        }
      }
      mark(x0, y0, x1, y1);
    }
    settle();
    knife.residue = true;
    knife.rr = knife.lr;
    knife.rg = knife.lg;
    knife.rb = knife.lb;
    knife.load = 0;
  };

  const begin = (cx: number, cy: number, pigment: number) => {
    loadStroke(pigment);
    knife.x = cx;
    knife.y = cy;
    knife.active = true;
    knife.picked = 0;
    knife.dist = 0;
    box.x0 = 1e9;
    box.y0 = 1e9;
    box.x1 = -1;
    box.y1 = -1;
  };

  const seedFirst = () => {
    if (!cfg || cols === 0) return;
    seeded = true;
    knife.residue = false;
    for (const s of firstStrokes(cfg.seed, cfg.defaultStrokes)) {
      const len = Math.max(36, s.length * width) / CELL;
      const sx = s.x * cols;
      const sy = s.y * rows;
      knife.fx = Math.cos(s.angle);
      knife.fy = Math.sin(s.angle);
      begin(sx, sy, s.pigment);
      const n = 16;
      for (let k = 1; k <= n; k += 1) {
        const u = k / n;
        const a = s.angle + s.bend * (u - 0.5);
        travel(
          sx + Math.cos(a) * len * u,
          sy + Math.sin(a) * len * u + Math.sin(u * Math.PI) * s.bend * 6,
        );
      }
      lift();
    }
    dirty.all = true;
  };

  // --- drawing -----------------------------------------------------------

  const lightVector = (): [number, number, number] => {
    const a = ((cfg?.lightAngle ?? 225) * Math.PI) / 180;
    const e = ((8 + 62 * clamp(cfg?.lightHeight ?? 0.3, 0, 1)) * Math.PI) / 180;
    return [Math.cos(a) * Math.cos(e), Math.sin(a) * Math.cos(e), Math.sin(e)];
  };
  const reliefPx = () => 2.2 + 3.8 * clamp(cfg?.thickness ?? 0.6, 0.2, 1);

  const upload = (g: Gpu) => {
    const { gl } = g;
    gl.bindTexture(gl.TEXTURE_2D, g.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (dirty.all || g.w !== cols || g.h !== rows) {
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA16F,
        cols,
        rows,
        0,
        gl.RGBA,
        gl.FLOAT,
        data,
      );
      g.w = cols;
      g.h = rows;
    } else if (dirty.x1 >= dirty.x0 && dirty.y1 >= dirty.y0) {
      // Only the stretch the knife touched goes up to the GPU.
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, cols);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, dirty.x0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, dirty.y0);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        dirty.x0,
        dirty.y0,
        dirty.x1 - dirty.x0 + 1,
        dirty.y1 - dirty.y0 + 1,
        gl.RGBA,
        gl.FLOAT,
        data,
      );
      gl.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
      gl.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    }
  };

  const drawGL = (g: Gpu) => {
    const { gl } = g;
    resizeGL(gl, glCanvas, { dprCap: clamp(cfg?.dpr ?? 2, 0.5, 2) });
    upload(g);
    g.program.use();
    g.program.texture("u_paint", g.texture, 0);
    g.program.set({
      u_grid: [cols, rows],
      u_res: [width, height],
      u_cell: CELL,
      u_ground: groundLin,
      u_light: lightVector(),
      u_relief: reliefPx(),
      u_gloss: clamp(cfg?.gloss ?? 0.5, 0, 1),
    });
    g.tri.draw();
  };

  /** The same light on the CPU, one pixel per cell, smoothed up: for no WebGL2 or a lost context. */
  const drawFlat = () => {
    if (!flat) flat = flatCanvas.getContext("2d");
    if (!flat || cols === 0) return;
    if (!image || image.width !== cols || image.height !== rows) {
      image = new ImageData(cols, rows);
    }
    const L = lightVector();
    const relief = reliefPx();
    const gloss = clamp(cfg?.gloss ?? 0.5, 0, 1);
    const hz = L[2] + 1;
    const hn = Math.hypot(L[0], L[1], hz);
    const px = image.data;
    const H = (i: number, k: number) =>
      data[(clamp(k, 0, rows - 1) * cols + clamp(i, 0, cols - 1)) * 4 + 3] ?? 0;
    for (let k = 0; k < rows; k += 1) {
      for (let i = 0; i < cols; i += 1) {
        const o = (k * cols + i) * 4;
        const h = data[o + 3] ?? 0;
        let nx = (H(i - 1, k) - H(i + 1, k)) * relief;
        let ny = (H(i, k - 1) - H(i, k + 1)) * relief;
        let nz = 2 * CELL;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl;
        ny /= nl;
        nz /= nl;
        const diff = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        const shade = 1 + 0.55 * clamp((diff - L[2]) * 2.2, -1, 1);
        const nh = Math.max(0, (nx * L[0] + ny * L[1] + nz * hz) / hn);
        const t = h <= 0.012 ? 0 : h >= 0.2 ? 1 : (h - 0.012) / 0.188;
        const cover = t * t * (3 - 2 * t);
        const spec =
          (Math.pow(nh, 70) * 1.1 + Math.pow(nh, 14) * 0.06) * gloss * cover;
        for (let ch = 0; ch < 3; ch += 1) {
          const paint = Math.exp(data[o + ch] ?? 0);
          const base =
            (groundLin[ch] ?? 0.8) + (paint - (groundLin[ch] ?? 0.8)) * cover;
          px[o + ch] = toByte(base * shade + spec);
        }
        px[o + 3] = 255;
      }
    }
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      clamp(cfg?.dpr ?? 2, 0.5, 2),
    );
    const bw = Math.round(width * dpr);
    const bh = Math.round(height * dpr);
    if (flatCanvas.width !== bw || flatCanvas.height !== bh) {
      flatCanvas.width = bw;
      flatCanvas.height = bh;
    }
    if (!cellCanvas) cellCanvas = document.createElement("canvas");
    const tmp = cellCanvas;
    if (tmp.width !== cols || tmp.height !== rows) {
      tmp.width = cols;
      tmp.height = rows;
    }
    tmp.getContext("2d")?.putImageData(image, 0, 0);
    flat.imageSmoothingEnabled = true;
    flat.imageSmoothingQuality = "high";
    flat.drawImage(tmp, 0, 0, cols * CELL * dpr, rows * CELL * dpr);
  };

  const draw = () => {
    frame = 0;
    if (disposed || cols === 0) return;
    if (!visible) {
      pending = true;
      return;
    }
    pending = false;
    const g = gpu;
    if (g && !g.lost && !g.gl.isContextLost()) {
      drawGL(g);
      root.removeAttribute("data-fallback");
    } else {
      drawFlat();
      root.setAttribute("data-fallback", "");
    }
    root.setAttribute("data-live", "");
    dirty.all = false;
    dirty.x0 = 1e9;
    dirty.y0 = 1e9;
    dirty.x1 = -1;
    dirty.y1 = -1;
  };

  const request = () => {
    if (frame || disposed) return;
    frame = requestAnimationFrame(draw);
  };

  const buildGpu = (): boolean => {
    const gl = createGL(glCanvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const texture = gl.createTexture();
    if (!texture) {
      program.dispose();
      return false;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const tri = createFullscreenTriangle(gl, program);
    gpu = { gl, program, tri, texture, lost: false, w: 0, h: 0 };
    dirty.all = true;
    return true;
  };
  buildGpu();
  const detachLoss = onContextLoss(
    glCanvas,
    () => {
      if (gpu) gpu.lost = true;
      request();
    },
    () => {
      gpu = null;
      buildGpu();
      request();
    },
  );

  const stopRunning = () => {
    for (const r of running.splice(0)) r.stop();
  };

  return {
    configure: (next) => {
      const prev = cfg;
      cfg = next;
      if (
        prev &&
        (prev.seed !== next.seed || prev.defaultStrokes !== next.defaultStrokes)
      ) {
        clearData(false);
        strokes = 0;
        seedFirst();
      }
      dirty.all = true;
      request();
    },
    colours: (list, ground) => {
      pigments = list.map((c) => logOf(read(c)));
      groundLin = read(ground);
      const next = logOf(groundLin);
      // Bare board takes the ground's colour, so blending at a stroke's edge
      // fades into gesso rather than into white.
      for (let i = 0; i < data.length; i += 4) {
        if ((data[i + 3] ?? 0) <= 0) {
          data[i] = next[0];
          data[i + 1] = next[1];
          data[i + 2] = next[2];
        }
      }
      groundLog = next;
      dirty.all = true;
      request();
    },
    resize: () => {
      const w = Math.max(1, root.clientWidth);
      const h = Math.max(1, root.clientHeight);
      width = w;
      height = h;
      const nc = Math.ceil(w / CELL);
      const nr = Math.ceil(h / CELL);
      if (nc !== cols || nr !== rows) {
        // Resample what is painted into the new grid, so a resize keeps the picture.
        const next = new Float32Array(nc * nr * 4);
        for (let k = 0; k < nr; k += 1) {
          for (let i = 0; i < nc; i += 1) {
            const o = (k * nc + i) * 4;
            const si = cols
              ? Math.min(cols - 1, Math.floor((i / nc) * cols))
              : -1;
            const sk = rows
              ? Math.min(rows - 1, Math.floor((k / nr) * rows))
              : -1;
            if (si < 0 || sk < 0) {
              next[o] = groundLog[0];
              next[o + 1] = groundLog[1];
              next[o + 2] = groundLog[2];
              next[o + 3] = 0;
              continue;
            }
            const so = (sk * cols + si) * 4;
            next[o] = data[so] ?? groundLog[0];
            next[o + 1] = data[so + 1] ?? groundLog[1];
            next[o + 2] = data[so + 2] ?? groundLog[2];
            next[o + 3] = data[so + 3] ?? 0;
          }
        }
        cols = nc;
        rows = nr;
        data = next;
        dirty.all = true;
        if (!seeded) seedFirst();
      }
      request();
    },
    setVisible: (on) => {
      visible = on;
      if (on && pending) request();
    },
    strokeStart: (x, y) => {
      stopRunning();
      begin(x / CELL, y / CELL, strokes);
      request();
    },
    strokeMove: (x, y) => {
      if (!knife.active) return 0;
      knife.picked = 0;
      travel(x / CELL, y / CELL);
      request();
      return knife.picked;
    },
    strokeEnd: () => {
      if (!knife.active) return;
      lift();
      strokes += 1;
      report.current.onStroke?.(strokes, knife.pigment);
      report.current.said(`Stroke ${strokes}.`);
      request();
    },
    print: (x, y, angle) => {
      stopRunning();
      const cx = x / CELL;
      const cy = y / CELL;
      knife.fx = Math.cos(angle);
      knife.fy = Math.sin(angle);
      begin(cx - knife.fx * 2.5, cy - knife.fy * 2.5, strokes);
      // Pressed flat: a short push that lays a slab with its ridge.
      travel(cx + knife.fx * 2.5, cy + knife.fy * 2.5);
      lift();
      strokes += 1;
      report.current.onStroke?.(strokes, knife.pigment);
      report.current.said(`Stroke ${strokes}.`);
      request();
    },
    pull: (x, y, angle, length) => {
      if (!cfg) return;
      stopRunning();
      const cx = x / CELL;
      const cy = y / CELL;
      const fx = Math.cos(angle);
      const fy = Math.sin(angle);
      knife.fx = fx;
      knife.fy = fy;
      begin(cx, cy, strokes);
      const finish = () => {
        lift();
        strokes += 1;
        report.current.onStroke?.(strokes, knife.pigment);
        report.current.said(`Stroke ${strokes}.`);
        report.current.scratch(0, 1);
        request();
      };
      const len = length / CELL;
      if (!cfg.motionSafe) {
        travel(cx + fx * len, cy + fy * len);
        finish();
        return;
      }
      let last = 0;
      running.push(
        animate(0, 1, {
          duration: PULL_TIME,
          ease: easings.move,
          onUpdate: (u) => {
            knife.picked = 0;
            travel(cx + fx * len * u, cy + fy * len * u);
            const speed = ((u - last) * length) / (1 / 60);
            last = u;
            report.current.scratch(
              clamp(speed / 1400, 0, 1) * (0.5 + Math.min(0.5, knife.picked)),
              0.9 + 0.3 * clamp(cfg?.thickness ?? 0.6, 0, 1),
            );
            request();
          },
          onComplete: finish,
        }),
      );
    },
    scrape: () => {
      if (!cfg || cols === 0) return;
      stopRunning();
      knife.active = false;
      const done = (stain: boolean) => {
        if (stain) clearData(true);
        knife.residue = false;
        report.current.scratch(0, 1);
        report.current.onClear?.();
        report.current.said("Board scraped clean.");
        request();
      };
      if (!cfg.motionSafe) {
        // No travelling blade: the paint fades off the board, then it is clean.
        running.push(
          animate(
            glCanvas,
            { opacity: [1, 0] },
            { duration: durations.base, ease: easings.exit },
          ),
          animate(
            flatCanvas,
            { opacity: [1, 0] },
            {
              duration: durations.base,
              ease: easings.exit,
              onComplete: () => {
                done(true);
                glCanvas.style.opacity = "1";
                flatCanvas.style.opacity = "1";
              },
            },
          ),
        );
        return;
      }
      const before = data.slice();
      const seen = new Uint8Array(cols * rows);
      // Each row heaps its own paint, so the ridge comes out banded with the
      // colours that row crossed, tall where the paint was thick.
      const rowLoad = new Float32Array(rows);
      const rowCol = new Float32Array(rows * 3);
      for (let k = 0; k < rows; k += 1) {
        rowCol[k * 3] = groundLog[0];
        rowCol[k * 3 + 1] = groundLog[1];
        rowCol[k * 3 + 2] = groundLog[2];
      }
      let total = 0;
      let edge = -3;
      const visit = (i: number) => {
        for (let k = 0; k < rows; k += 1) {
          const n = k * cols + i;
          if (seen[n]) continue;
          seen[n] = 1;
          const o = n * 4;
          const h = before[o + 3] ?? 0;
          const ghost = stainOf(h);
          if (h > 0.004) {
            const w = h / ((rowLoad[k] ?? 0) + h);
            for (let ch = 0; ch < 3; ch += 1) {
              const at = k * 3 + ch;
              rowCol[at] =
                (rowCol[at] ?? 0) +
                ((before[o + ch] ?? 0) - (rowCol[at] ?? 0)) * w;
            }
            rowLoad[k] = (rowLoad[k] ?? 0) + h;
            total += h;
          }
          if (ghost >= 0.004) {
            data[o] = before[o] ?? 0;
            data[o + 1] = before[o + 1] ?? 0;
            data[o + 2] = before[o + 2] ?? 0;
            data[o + 3] = ghost;
          } else {
            data[o] = groundLog[0];
            data[o + 1] = groundLog[1];
            data[o + 2] = groundLog[2];
            data[o + 3] = 0;
          }
        }
      };
      running.push(
        animate(-3, cols + 14, {
          duration: SCRAPE_TIME,
          ease: easings.move,
          onUpdate: (to) => {
            const from = Math.max(0, Math.floor(edge));
            const upto = Math.min(cols - 1, Math.floor(to));
            for (let i = from; i <= upto; i += 1) visit(i);
            // The ridge rides just ahead of the edge, wider as it fills.
            const span = 3 + Math.min(10, (total / Math.max(rows, 1)) * 0.25);
            const end = Math.min(cols - 1, Math.floor(to + span));
            for (let i = Math.max(0, upto + 1); i <= end; i += 1) {
              const a = clamp((i + 0.5 - to) / span, 0, 1);
              const profile = Math.pow(1 - a, 0.6);
              for (let k = 0; k < rows; k += 1) {
                const up = Math.max(0, k - 2);
                const dn = Math.min(rows - 1, k + 2);
                const sm =
                  ((rowLoad[up] ?? 0) +
                    (rowLoad[k - 1 < 0 ? 0 : k - 1] ?? 0) * 2 +
                    (rowLoad[k] ?? 0) * 3 +
                    (rowLoad[k + 1 >= rows ? rows - 1 : k + 1] ?? 0) * 2 +
                    (rowLoad[dn] ?? 0)) /
                  9;
                const hgt = Math.min(MAX_H, sm * 0.035) * profile;
                const o = (k * cols + i) * 4;
                if (hgt < 0.02 || (data[o + 3] ?? 0) >= hgt) continue;
                data[o] = rowCol[k * 3] ?? 0;
                data[o + 1] = rowCol[k * 3 + 1] ?? 0;
                data[o + 2] = rowCol[k * 3 + 2] ?? 0;
                data[o + 3] = hgt;
              }
            }
            mark(
              Math.max(0, from - 1),
              0,
              Math.min(cols - 1, end + 1),
              rows - 1,
            );
            report.current.scratch(
              Math.min(1, 0.3 + total / Math.max(rows * 30, 1)),
              0.8 + 0.5 * clamp(to / Math.max(cols, 1), 0, 1),
            );
            edge = to;
            request();
          },
          onComplete: () => {
            for (let i = 0; i < cols; i += 1) visit(i);
            dirty.all = true;
            done(false);
          },
        }),
      );
    },
    busy: () => running.length > 0,
    facing: () => Math.atan2(knife.fy, knife.fx),
    dispose: () => {
      disposed = true;
      stopRunning();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      detachLoss();
      const g = gpu;
      gpu = null;
      if (g && !g.lost && !g.gl.isContextLost()) {
        g.gl.deleteTexture(g.texture);
        g.tri.dispose();
        g.program.dispose();
      }
    },
  };
}

/** The server's frame: the gesso and the first strokes as soft swaths with their ridges lit. */
function standIn(seed: number, count: number, pigments: string[]) {
  return firstStrokes(seed, count).map((s, k) => {
    const x = s.x * 1000;
    const y = s.y * 300;
    const len = s.length * 1000;
    const deg = (s.angle * 180) / Math.PI;
    return {
      k,
      x: r2(x),
      y: r2(y),
      len: r2(len),
      deg: r2(deg),
      fill:
        pigments[s.pigment % Math.max(1, pigments.length)] ?? "currentColor",
    };
  });
}

/**
 * A primed board and a palette knife. Press and drag and the knife lays a
 * slab of thick oil paint: a flat, finely striated swath behind the blade, a
 * ridge squeezed out at each end of it, and a bead pushed along in front that
 * stays as a lump where you lift. The knife scoops up whatever wet paint it
 * crosses into its load — mixing in log reflectance, so yellow and blue make
 * green — and keeps that residue into the next stroke, which also takes a
 * fresh dollop of the next pigment, so the board builds up like a painting.
 * A low raking light catches every ridge and striation with a soft shade and
 * an oil gloss, drawn per pixel by one WebGL2 pass over a height-and-colour
 * field the knife edits on the CPU (2 px cells); without WebGL2 the same
 * field is lit on the CPU. A double click scrapes the board: an edge sweeps
 * across, heaping all the paint into a ridge it carries off. Arrow keys move
 * the knife, Enter or Space pulls a stroke, Delete scrapes. Under reduced
 * motion painting stays 1:1, the pull lands at once and the scrape fades.
 */
export function ImpastoKnife({
  thickness = 0.6,
  palette = "ochre",
  colors,
  lightAngle = 225,
  lightHeight = 0.3,
  gloss = 0.5,
  knifeWidth = 30,
  blend = 0.55,
  ground = "oklch(from var(--warn) 0.93 0.018 h)",
  defaultStrokes = 3,
  interactive = true,
  clearKey,
  seed = 3,
  dpr = 2,
  label = "Paint board",
  sound = false,
  onStroke,
  onClear,
  disabled = false,
  className,
}: ImpastoKnifeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const glRef = React.useRef<HTMLCanvasElement | null>(null);
  const flatRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const scratch = React.useRef<LoopHandle | null>(null);
  const taps = React.useRef({ t: -1e9, x: 0, y: 0 });
  const keyAt = React.useRef({ x: -1, y: 0, angle: 0 });
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const live = interactive && !disabled;
  const pigments =
    colors && colors.length >= 2 ? colors.slice(0, 6) : PALETTES[palette];

  // The knife the hand holds: where it is, which way it faces, how hard it presses.
  const kx = useMotionValue(0);
  const ky = useMotionValue(0);
  const krot = useMotionValue(0);
  const kpress = useMotionValue(0);
  const kshow = useMotionValue(0);
  const shadowX = useTransform(kpress, (p) => r2(5 - 3 * p));
  const shadowY = useTransform(kpress, (p) => r2(7 - 4.5 * p));
  const shadowOpacity = useTransform(kpress, (p) => r2(0.2 + 0.12 * p));
  const kscale = useTransform(kpress, (p) => r2(1 - 0.04 * p));

  const cfg: Config = {
    thickness,
    lightAngle,
    lightHeight,
    gloss,
    knifeWidth,
    blend,
    defaultStrokes,
    seed,
    dpr,
    motionSafe,
  };
  const cfgRef = React.useRef(cfg);
  const report = React.useRef<Report>({
    onStroke,
    onClear,
    said: () => {},
    scratch: () => {},
  });
  React.useLayoutEffect(() => {
    cfgRef.current = cfg;
    report.current = {
      onStroke,
      onClear,
      said: (text) => setSaid((s) => ({ n: s.n + 1, text })),
      scratch: (level, pitch) => {
        if (level <= 0) {
          scratch.current?.stop();
          scratch.current = null;
          return;
        }
        if (!sound) return;
        // Sound answers the visitor only: never before the page has had a
        // press or a key.
        const activated =
          typeof navigator === "undefined" ||
          (
            navigator as Navigator & {
              userActivation?: { hasBeenActive: boolean };
            }
          ).userActivation?.hasBeenActive !== false;
        if (!activated) return;
        if (!scratch.current) {
          scratch.current = audio.start("scratch", { gain: 0, pitch });
        }
        scratch.current.set({ gain: Math.min(0.6, level * 0.6), pitch });
      },
    };
  });

  const readColours = React.useCallback(() => {
    const host = carriersRef.current;
    if (!host) return;
    const kids = Array.from(host.children);
    const list = kids.slice(0, -1).map((el) => getComputedStyle(el).color);
    const last = kids[kids.length - 1];
    engine.current?.colours(
      list,
      last ? getComputedStyle(last).color : "rgb(236, 230, 218)",
    );
  }, []);

  // The engine is bound to its canvases: built with them, gone with them.
  React.useEffect(() => {
    const root = rootRef.current;
    const glCanvas = glRef.current;
    const flatCanvas = flatRef.current;
    if (!root || !glCanvas || !flatCanvas) return;
    const e = createBoard(root, glCanvas, flatCanvas, report);
    engine.current = e;
    e.configure(cfgRef.current);
    readColours();
    e.resize();
    e.setVisible(visible.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      scratch.current?.stop();
      scratch.current = null;
    };
  }, [readColours]);

  const cfgKey = JSON.stringify(cfg);
  React.useEffect(() => {
    engine.current?.configure(cfgRef.current);
  }, [cfgKey]);

  const colourKey = `${pigments.join("|")}|${ground}`;
  React.useEffect(() => {
    readColours();
  }, [colourKey, readColours]);

  // A changed clearKey scrapes — not the first value, and not StrictMode's rehearsal.
  const lastClear = React.useRef(clearKey);
  React.useEffect(() => {
    if (lastClear.current === clearKey) return;
    lastClear.current = clearKey;
    engine.current?.scrape();
  }, [clearKey]);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => engine.current?.resize());
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      engine.current?.setVisible(visible.current);
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
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

  const hover = React.useRef({ x: 0, y: 0, has: false, angle: 0 });
  const placeKnife = (x: number, y: number, angle: number) => {
    kx.set(r2(x));
    ky.set(r2(y));
    krot.set(r2((angle * 180) / Math.PI));
  };
  const showKnife = (on: boolean) => {
    const root = rootRef.current;
    if (root) {
      if (on) root.dataset.knife = "on";
      else delete root.dataset.knife;
    }
    animate(kshow, on ? 1 : 0, {
      duration: on ? durations.fast : durations.fast * 0.6,
      ease: on ? easings.enter : easings.exit,
    });
  };
  const press = (on: boolean) => {
    if (motionSafe) animate(kpress, on ? 1 : 0, springs.flick);
    else kpress.set(on ? 1 : 0);
  };

  const pointerLast = React.useRef({ x: 0, y: 0, t: 0 });
  const drag = useDrag({
    threshold: 3,
    disabled: !live,
    onStart: (info) => {
      const at = local(
        info.point.x - info.offset.x,
        info.point.y - info.offset.y,
      );
      engine.current?.strokeStart(at.x, at.y);
      pointerLast.current = { x: at.x, y: at.y, t: performance.now() };
      press(true);
      report.current.scratch(0.01, 0.9 + 0.3 * thickness);
    },
    onMove: (info) => {
      const at = local(info.point.x, info.point.y);
      const picked = engine.current?.strokeMove(at.x, at.y) ?? 0;
      const now = performance.now();
      const last = pointerLast.current;
      const dt = Math.max(1, now - last.t) / 1000;
      const speed = Math.hypot(at.x - last.x, at.y - last.y) / dt;
      pointerLast.current = { x: at.x, y: at.y, t: now };
      placeKnife(at.x, at.y, engine.current?.facing() ?? 0);
      report.current.scratch(
        clamp(speed / 1400, 0.04, 1) * (0.55 + Math.min(0.45, picked * 0.08)),
        0.85 + 0.35 * thickness,
      );
    },
    onEnd: () => {
      engine.current?.strokeEnd();
      press(false);
      report.current.scratch(0, 1);
    },
    onCancel: () => {
      engine.current?.strokeEnd();
      press(false);
      report.current.scratch(0, 1);
    },
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      const now = performance.now();
      const prev = taps.current;
      if (
        now - prev.t < DOUBLE_TAP &&
        Math.hypot(at.x - prev.x, at.y - prev.y) < 10
      ) {
        taps.current = { t: -1e9, x: 0, y: 0 };
        engine.current?.scrape();
        return;
      }
      taps.current = { t: now, x: at.x, y: at.y };
      engine.current?.print(at.x, at.y, hover.current.angle);
      press(true);
      window.setTimeout(() => press(false), 90);
    },
  });

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (!live || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    const h = hover.current;
    if (h.has) {
      const dx = at.x - h.x;
      const dy = at.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5 && !(engine.current?.busy() ?? false)) {
        // The hovering knife turns toward its travel over a short distance,
        // the same wrist the stroke has.
        const target = Math.atan2(dy, dx);
        let delta = target - h.angle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        h.angle += delta * (motionSafe ? 1 - Math.exp(-d / 10) : 1);
      }
    }
    h.x = at.x;
    h.y = at.y;
    if (!h.has) showKnife(true);
    h.has = true;
    keyAt.current.x = -1;
    if (event.buttons === 0) placeKnife(at.x, at.y, h.angle);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    hover.current.has = false;
    showKnife(false);
  };

  /** The keyboard's knife starts where the pointer last was, or left of centre facing right. */
  const startKeys = (root: HTMLDivElement) => {
    const k = keyAt.current;
    const h = hover.current;
    k.x = h.has ? h.x : root.clientWidth * 0.3;
    k.y = h.has ? h.y : root.clientHeight * 0.5;
    k.angle = h.has ? h.angle : 0;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const root = rootRef.current;
    if (root) delete root.dataset.knife;
    const k = keyAt.current;
    if (k.x < 0 && root) startKeys(root);
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      engine.current?.scrape();
      return;
    }
    const by = event.shiftKey ? 48 : 16;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (!move || !root) return;
    event.preventDefault();
    k.angle = Math.atan2(move[1], move[0]);
    k.x = clamp(k.x + move[0], 8, root.clientWidth - 8);
    k.y = clamp(k.y + move[1], 8, root.clientHeight - 8);
    placeKnife(k.x, k.y, k.angle);
    kshow.set(1);
  };

  const pullFromKeys = () => {
    const root = rootRef.current;
    const k = keyAt.current;
    if (!root) return;
    if (k.x < 0) startKeys(root);
    const len = Math.min(PULL_LENGTH, root.clientWidth * 0.5);
    engine.current?.pull(k.x, k.y, k.angle, len);
    k.x = clamp(k.x + Math.cos(k.angle) * len, 8, root.clientWidth - 8);
    k.y = clamp(k.y + Math.sin(k.angle) * len, 8, root.clientHeight - 8);
    if (motionSafe) {
      animate(kx, r2(k.x), { duration: PULL_TIME, ease: easings.move });
      animate(ky, r2(k.y), { duration: PULL_TIME, ease: easings.move });
    } else placeKnife(k.x, k.y, k.angle);
  };

  // Cheap and pure: a handful of numbers per stroke.
  const still = standIn(seed, defaultStrokes, pigments);
  const kw = clamp(knifeWidth, 12, 80);
  const span = r2(kw * 4);

  return (
    <div
      ref={bindRoot}
      {...drag}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onContextMenu={(event) => {
        // A long press on glass is a stroke, not a request for the system menu.
        if (
          live &&
          (event.nativeEvent as PointerEvent).pointerType === "touch"
        ) {
          event.preventDefault();
        }
      }}
      className={cn(
        "group/impasto-knife relative isolate h-56 w-full overflow-clip select-none",
        live ? "touch-none" : "touch-auto",
        "data-[knife=on]:cursor-none",
        className,
      )}
      style={{ backgroundColor: ground }}
    >
      <svg
        aria-hidden
        viewBox="0 0 1000 300"
        preserveAspectRatio="xMidYMid slice"
        className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/impasto-knife:opacity-0"
      >
        {still.map((s) => (
          <g key={s.k} transform={`translate(${s.x} ${s.y}) rotate(${s.deg})`}>
            <rect
              x={0}
              y={-26}
              width={s.len}
              height={52}
              rx={10}
              opacity={0.94}
              style={{ fill: s.fill }}
            />
            <rect
              x={4}
              y={-27}
              width={s.len - 8}
              height={4}
              rx={2}
              fill="white"
              opacity={0.32}
            />
            <rect
              x={4}
              y={23}
              width={s.len - 8}
              height={4}
              rx={2}
              fill="black"
              opacity={0.16}
            />
            <rect
              x={s.len - 14}
              y={-24}
              width={14}
              height={48}
              rx={7}
              opacity={0.98}
              style={{ fill: s.fill }}
            />
          </g>
        ))}
      </svg>
      <canvas
        ref={glRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full group-data-fallback/impasto-knife:hidden"
      />
      <canvas
        ref={flatRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden size-full group-data-fallback/impasto-knife:block"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={readColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {pigments.map((p, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: p }}
          />
        ))}
        <span
          className="transition-colors duration-1"
          style={{ color: ground }}
        />
      </span>
      <button
        type="button"
        aria-label={label}
        aria-describedby={live ? hintId : undefined}
        disabled={!live}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible")) return;
          const root = rootRef.current;
          const k = keyAt.current;
          if (k.x < 0 && root) startKeys(root);
          placeKnife(k.x, k.y, k.angle);
          kshow.set(1);
        }}
        onBlur={() => {
          if (!hover.current.has) kshow.set(0);
        }}
        onClick={(event) => {
          // Enter, Space or assistive technology: a click with no pointer
          // behind it pulls a stroke the way the knife faces.
          if (event.detail === 0 && live) pullFromKeys();
        }}
        className={cn(
          "absolute inset-0 size-full cursor-[inherit] rounded-[inherit] outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0"
        style={{ x: kx, y: ky, opacity: kshow }}
      >
        <motion.svg
          width={span}
          height={span}
          viewBox={`${-span / 2} ${-span / 2} ${span} ${span}`}
          className="absolute overflow-visible"
          style={{
            left: -span / 2,
            top: -span / 2,
            rotate: krot,
            scale: kscale,
          }}
        >
          <motion.g style={{ x: shadowX, y: shadowY, opacity: shadowOpacity }}>
            <KnifeShape kw={kw} shadow />
          </motion.g>
          <KnifeShape kw={kw} />
        </motion.svg>
      </motion.div>
      {live ? (
        <p id={hintId} className="sr-only">
          Arrow keys move the knife; Enter or Space pulls a stroke the way it
          faces; Delete scrapes the board.
        </p>
      ) : null}
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * A palette knife seen from above, lying across the stroke: the trowel blade
 * runs along the blade line through the hot spot (its pointed tip one way,
 * narrowing to the neck the other), then a cranked steel neck, a brass
 * ferrule and the turned wooden handle beyond.
 */
function KnifeShape({ kw, shadow = false }: { kw: number; shadow?: boolean }) {
  const L = kw / 2;
  const W = kw * 0.17;
  const blade = `M 0 ${r2(-L)} C ${r2(W * 0.9)} ${r2(-L * 0.7)} ${r2(W * 1.15)} ${r2(-L * 0.1)} ${r2(W * 0.18)} ${r2(L)} L ${r2(-W * 0.18)} ${r2(L)} C ${r2(-W * 1.15)} ${r2(-L * 0.1)} ${r2(-W * 0.9)} ${r2(-L * 0.7)} 0 ${r2(-L)} Z`;
  const neck = `M 0 ${r2(L)} L ${r2(-kw * 0.08)} ${r2(L + kw * 0.2)} L ${r2(-kw * 0.08)} ${r2(L + kw * 0.3)}`;
  const handle = {
    x: r2(-kw * 0.08 - kw * 0.085),
    y: r2(L + kw * 0.36),
    width: r2(kw * 0.17),
    height: r2(kw * 0.95),
    rx: r2(kw * 0.085),
  };
  if (shadow) {
    return (
      <g fill="black" stroke="black">
        <path d={blade} strokeWidth={0} />
        <path d={neck} strokeWidth={2.4} fill="none" />
        <rect {...handle} strokeWidth={0} />
      </g>
    );
  }
  return (
    <g>
      <path
        d={neck}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        style={{ stroke: "oklch(from var(--ink-3) 0.58 0.01 h)" }}
      />
      <path
        d={blade}
        strokeWidth={0.8}
        style={{
          fill: "oklch(from var(--ink-3) 0.87 0.008 h)",
          stroke: "oklch(from var(--ink-3) 0.48 0.01 h)",
        }}
      />
      <path
        d={`M ${r2(-W * 0.35)} ${r2(-L * 0.72)} C ${r2(-W * 0.75)} ${r2(-L * 0.25)} ${r2(-W * 0.6)} ${r2(L * 0.35)} ${r2(-W * 0.12)} ${r2(L * 0.82)}`}
        strokeWidth={1.1}
        fill="none"
        strokeLinecap="round"
        stroke="white"
        opacity={0.8}
      />
      <rect
        x={r2(-kw * 0.08 - kw * 0.07)}
        y={r2(L + kw * 0.27)}
        width={r2(kw * 0.14)}
        height={r2(kw * 0.12)}
        rx={1}
        style={{ fill: "oklch(from var(--warn) 0.7 0.07 h)" }}
      />
      <rect
        {...handle}
        strokeWidth={0.8}
        style={{
          fill: "oklch(from var(--warn) 0.46 0.08 calc(h - 30))",
          stroke: "oklch(from var(--warn) 0.3 0.05 calc(h - 30))",
        }}
      />
      <rect
        x={r2(handle.x + kw * 0.035)}
        y={r2(handle.y + kw * 0.06)}
        width={r2(kw * 0.04)}
        height={r2(kw * 0.8)}
        rx={r2(kw * 0.02)}
        fill="white"
        opacity={0.28}
      />
    </g>
  );
}
