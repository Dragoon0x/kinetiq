"use client";

import * as React from "react";

import { animate, motion, useMotionValue, useTransform } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createPingPong,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type PingPong,
  type Program,
} from "@/registry/lib/glsl";
import { durations, easings, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type IceCubePattern = "gingham" | "tiles" | "linen";

export type IceCubeImage = {
  /** A picture to slide the cube across; drawn with `object-fit: cover`. Same-origin or CORS-enabled. */
  src?: string;
  /** What the picture shows. Without it the picture is decoration. */
  alt?: string;
};

export type IceCubeProps = {
  /** Content laid over the picture: headlines, buttons, links. It stays fully interactive. */
  children?: React.ReactNode;
  /** The picture under the cube. Without a `src`, a cloth is drawn from the theme. */
  image?: IceCubeImage;
  /** The drawn cloth when there is no `src`. @default "gingham" */
  pattern?: IceCubePattern;
  /** How fast it melts as it slides, 0 (never) to 1 (a few seconds of sliding). @default 0.4 */
  melt?: number;
  /** Facet sharpness, 0 (soft, rounded sides) to 1 (flat facets with hard folds). @default 0.7 */
  facets?: number;
  /** How much meltwater it leaves and how long the trail takes to dry, 0 to 1. @default 0.5 */
  trail?: number;
  /** The fresh cube's edge, px; it never exceeds a third of the box's height. @default 68 */
  size?: number;
  /** How hard the ice and the water bend the picture, 0 to 1. @default 0.6 */
  refraction?: number;
  /** Frosted cracks and the cloudy core inside the ice, 0 to 1. @default 0.5 */
  frost?: number;
  /** The colour of the ice, any CSS colour. @default a cool pigment from the accent hue */
  tint?: string;
  /** Where the cube rests before anyone moves it, as fractions of the box. @default { x: 0.74, y: 0.55 } */
  rest?: { x: number; y: number };
  /** The pointer moves the cube and a click drops a fresh one. @default true */
  interactive?: boolean;
  /** Holds the cube and the water where they are. @default false */
  paused?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** A clack when a fresh cube lands or the cube hits the frame. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when a fresh cube is dropped, with how many cubes there have been. */
  onDrop?: (count: number) => void;
  /** Fires as the cube melts, with how much of it is left (1 to 0.2) in 5% steps. */
  onMelt?: (left: number) => void;
  /** Fires when the cube has melted into a puddle. */
  onMelted?: () => void;
  /** The keyboard's drop button, shown on focus. @default "Drop a fresh cube" */
  dropLabel?: string;
  /** Nothing moves the cube and the drop button is off. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const pct3 = (v: number) => `${Number((v * 100).toFixed(3))}%`;

/** The smallest the cube gets before it slumps into a puddle. */
const MIN_MASS = 0.2;
/** The water field is a quarter of the box: soft by nature, cheap to diffuse. */
const WATER_SCALE = 4;

const WATER_FRAGMENT = /* glsl */ `
uniform sampler2D u_prev;
uniform vec2 u_size;
uniform float u_scale;
uniform vec2 u_from;
uniform vec2 u_to;
uniform float u_radius;
uniform float u_amount;
uniform float u_keep;
uniform float u_spread;
uniform vec3 u_ring;
uniform float u_ringAmount;
in vec2 v_uv;
out vec4 o_color;

void main() {
  vec2 t = 1.0 / u_size;
  float c = texture(u_prev, v_uv).r;
  float n = texture(u_prev, v_uv + vec2(0.0, -t.y)).r;
  float s = texture(u_prev, v_uv + vec2(0.0, t.y)).r;
  float e = texture(u_prev, v_uv + vec2(t.x, 0.0)).r;
  float w = texture(u_prev, v_uv + vec2(-t.x, 0.0)).r;
  float h = mix(c, (n + s + e + w) * 0.25, u_spread) * u_keep;
  vec2 px = v_uv * u_size * u_scale;
  // Meltwater is laid as a capsule from where the cube was to where it is,
  // so a fast slide leaves an unbroken trail rather than a row of drops.
  vec2 pa = px - u_from;
  vec2 ba = u_to - u_from;
  float k = clamp(dot(pa, ba) / max(dot(ba, ba), 0.001), 0.0, 1.0);
  float d = length(pa - ba * k);
  h += u_amount * (1.0 - smoothstep(u_radius * 0.3, u_radius, d));
  float dr = length(px - u_ring.xy) - u_ring.z;
  h += u_ringAmount * exp(-dr * dr / 40.0);
  o_color = vec4(min(h, 1.4), 0.0, 0.0, 1.0);
}
`;

const ICE_FRAGMENT = /* glsl */ `
uniform sampler2D u_image;
uniform sampler2D u_water;
uniform vec2 u_res;
uniform vec2 u_texel;
uniform vec2 u_cube;
uniform float u_half;
uniform float u_round;
uniform float u_bevel;
uniform float u_angle;
uniform float u_soft;
uniform float u_alpha;
uniform float u_lift;
uniform float u_refr;
uniform float u_frost;
uniform vec3 u_tint;
uniform vec4 u_cracks[3];
uniform float u_seed;
in vec2 v_uv;
out vec4 o_color;

${GLSL_NOISE}

float sdBox(vec2 p, float b, float r) {
  vec2 q = abs(p) - vec2(b) + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec2 rot(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

vec3 image(vec2 px) {
  return texture(u_image, clamp(px / u_res, vec2(0.001), vec2(0.999))).rgb;
}

void main() {
  vec2 px = v_uv * u_res;
  // The light comes from the top left of the screen.
  vec2 L = normalize(vec2(-0.55, -0.83));

  // Meltwater: a thin lens whose slope bends the picture, darkens it a
  // little where wet and catches the light along its edges.
  float wc = texture(u_water, v_uv).r;
  float wl = texture(u_water, v_uv - vec2(u_texel.x, 0.0)).r;
  float wr = texture(u_water, v_uv + vec2(u_texel.x, 0.0)).r;
  float wu = texture(u_water, v_uv - vec2(0.0, u_texel.y)).r;
  float wd = texture(u_water, v_uv + vec2(0.0, u_texel.y)).r;
  vec2 grad = vec2(wr - wl, wd - wu);
  float wet = clamp(wc, 0.0, 1.0);
  vec3 col = image(px - grad * 40.0 * u_refr);
  // Wet cloth goes darker and a little richer.
  col *= 1.0 - 0.22 * wet;
  float edge = clamp(length(grad) * 6.0, 0.0, 1.0);
  col *= 1.0 - 0.14 * edge;
  vec3 wn = normalize(vec3(-grad * 7.0, 1.0));
  vec3 H = normalize(normalize(vec3(L * 0.9, 1.0)) + vec3(0.0, 0.0, 1.0));
  col += pow(max(dot(wn, H), 0.0), 60.0) * edge * 0.42;

  // The cube in its own frame.
  vec2 q = rot(px - u_cube, -u_angle);
  float sd = sdBox(q, u_half, u_round);

  // A pale shadow down and to the right, with the light the ice focuses
  // gathered into a caustic inside it.
  float reach = u_half * (0.28 + 0.9 * u_lift);
  vec2 sc = u_cube - L * reach;
  vec2 sq = rot(px - sc, -u_angle);
  float blur = u_half * (0.22 + 0.7 * u_lift);
  float sds = sdBox(sq, u_half * (0.96 + 0.2 * u_lift), u_round);
  float shadow = (1.0 - smoothstep(-blur, blur, sds)) * u_alpha * (0.2 - 0.08 * u_lift);
  col *= 1.0 - shadow * (1.0 - (1.0 - smoothstep(-1.5, 0.0, sd)) * 0.6);
  vec2 cc = u_cube - L * reach * 1.25;
  float caustic = exp(-dot(px - cc, px - cc) / (u_half * u_half * 0.16)) * u_alpha * (1.0 - u_lift);
  col += caustic * 0.32 * mix(vec3(1.0), u_tint, 0.4) * (1.0 - step(sd, 0.0) * 0.7);

  float inside = (1.0 - smoothstep(-0.75, 0.75, sd)) * u_alpha;
  if (inside > 0.001) {
    float depth = -sd;
    float t = clamp(depth / max(u_bevel, 0.5), 0.0, 1.0);
    // Flat facets pick the nearer side; soft ones follow the rounded shape.
    vec2 nSharp = abs(q.x) > abs(q.y) ? vec2(sign(q.x), 0.0) : vec2(0.0, sign(q.y));
    vec2 e = vec2(0.6, 0.0);
    vec2 nSoft = vec2(
      sdBox(q + e.xy, u_half, u_round) - sdBox(q - e.xy, u_half, u_round),
      sdBox(q + e.yx, u_half, u_round) - sdBox(q - e.yx, u_half, u_round)
    );
    nSoft = length(nSoft) > 0.0001 ? normalize(nSoft) : nSharp;
    vec2 n = normalize(mix(nSharp, nSoft, u_soft) + 0.0001);
    vec2 ns = rot(n, u_angle);
    float slope = mix(1.0, cos(t * 1.5708), u_soft) * (1.0 - smoothstep(0.9, 1.0, t));
    float onBevel = 1.0 - smoothstep(0.92, 1.0, t);

    // Through the top the picture is magnified a touch; through a facet it
    // is displaced along the facet's slope, and the inside reflection
    // doubles it faintly near the edge.
    vec2 top = u_cube + (px - u_cube) * (1.0 - 0.16 * u_refr) + L * u_half * 0.05 * u_refr;
    vec2 side = px + ns * slope * u_half * 0.85 * u_refr;
    vec2 sp = mix(top, side, onBevel);
    vec3 ice = image(sp);
    vec3 ghost = image(sp + ns * (5.0 + u_half * 0.08) * (1.0 - t));
    ice = mix(ice, ghost, 0.28 * onBevel);

    // Inside: a cloudy core, seeded crack planes and a few trapped bubbles.
    vec2 u = q / u_half;
    float fog = kx_fbm(u * 2.2 + u_seed);
    float core = (1.0 - smoothstep(0.05, 0.95, length(u * vec2(1.0, 1.08)))) * u_frost;
    float cloud = core * (0.25 + 0.75 * fog) * 0.85;
    float crack = 0.0;
    for (int k = 0; k < 3; k += 1) {
      vec4 c = u_cracks[k];
      vec2 dir = vec2(cos(c.z), sin(c.z));
      vec2 rel = u - c.xy;
      float along = dot(rel, dir);
      float across = dot(rel, vec2(-dir.y, dir.x));
      float span = 1.0 - smoothstep(c.w * 0.7, c.w, abs(along));
      float jag = across + 0.03 * (kx_noise(vec2(along * 9.0, float(k) * 7.0 + u_seed)) - 0.5);
      crack += span * (exp(-jag * jag / 0.0004) * 0.6 + exp(-jag * jag / 0.02) * 0.3);
    }
    crack *= u_frost * (1.0 - onBevel * 0.5);
    vec2 cell = floor(u * 4.0 + 4.0);
    vec2 cellUv = fract(u * 4.0 + 4.0);
    float bub = kx_hash(cell + u_seed);
    vec2 bc = vec2(kx_hash(cell + 3.1), kx_hash(cell + 7.7)) * 0.6 + 0.2;
    float br = 0.08 + 0.1 * kx_hash(cell + 1.3);
    float bd = length(cellUv - bc);
    float bubble = step(0.8, bub) * (smoothstep(br * 0.35, br * 0.6, bd) - smoothstep(br * 0.75, br, bd));
    bubble *= u_frost * (1.0 - onBevel);

    vec3 frostCol = mix(vec3(0.94, 0.97, 1.0), u_tint, 0.3);
    ice = mix(ice, ice * mix(vec3(1.0), u_tint, 0.55), 0.6);
    ice = mix(ice, frostCol, clamp(0.08 + cloud + crack * 0.75 + bubble * 0.5, 0.0, 0.9));

    // Facets that face the light catch it; those that face away dim.
    float facing = dot(ns, L);
    ice += slope * max(facing, 0.0) * 0.2 * onBevel;
    ice *= 1.0 - slope * max(-facing, 0.0) * 0.16 * onBevel;
    // The cold highlight: a hair-thin line along the top face's upper-left
    // edge, and a fainter one round the outside.
    float rim = depth - u_bevel;
    float topEdge = exp(-rim * rim / 0.45) * smoothstep(-0.1, 0.6, facing);
    float outer = exp(-depth * depth / 0.7) * (0.35 + 0.65 * max(facing, 0.0));
    float sx = u.x + u.y + 0.75;
    float streak = exp(-sx * sx / 0.04) * (1.0 - onBevel) * 0.16;
    vec3 cold = mix(vec3(1.0), u_tint, 0.2);
    ice += cold * (topEdge * 0.7 + outer * 0.3 + streak);

    col = mix(col, ice, inside);
  }
  o_color = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type Colours = {
  base: string;
  check: string;
  line: string;
  tint: [number, number, number];
  dark: boolean;
};

type Config = {
  melt: number;
  facets: number;
  trail: number;
  size: number;
  refraction: number;
  frost: number;
  rest: { x: number; y: number };
  dpr: number;
  pattern: IceCubePattern;
  src: string | undefined;
  motionSafe: boolean;
  seed: number;
};

type Report = {
  onDrop?: (count: number) => void;
  onMelt?: (left: number) => void;
  onMelted?: () => void;
  clack: (gain: number, x: number) => void;
  said: (text: string) => void;
  live: (on: boolean) => void;
  fallback: (on: boolean) => void;
  place: (x: number, y: number, angle: number, half: number) => void;
};

type Engine = {
  configure: (cfg: Config) => void;
  colours: (c: Colours) => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  setPaused: (on: boolean) => void;
  aim: (x: number, y: number, snap?: boolean) => void;
  drop: (x?: number, y?: number) => void;
  dispose: () => void;
};

type Gpu = {
  gl: GLContext;
  ice: Program;
  water: Program;
  iceTri: FullscreenTriangle;
  waterTri: FullscreenTriangle;
  pool: PingPong | null;
  image: WebGLTexture | null;
  lost: boolean;
};

function hash(seed: number, i: number, k: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(i + 1, 668265263);
  h = Math.imul(h ^ Math.imul(k + 7, 2246822519), 3266489917);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Any CSS colour as 0–1 rgb, through a 1×1 canvas. */
function colourReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0.8, 0.9, 1];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(200, 220, 240)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

/**
 * The drawn cloth: gingham (two sets of translucent bands, darker where they
 * cross, a fine weave), glazed tiles, or plain linen with two soft folds. The
 * same colours as the CSS stand-in the server sends, so nothing jumps when the
 * canvas takes over.
 */
function paintCloth(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  ratio: number,
  pattern: IceCubePattern,
  c: Colours,
) {
  ctx.save();
  ctx.scale(ratio, ratio);
  ctx.fillStyle = c.base;
  ctx.fillRect(0, 0, w, h);
  if (pattern === "gingham") {
    const band = 22;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = c.check;
    for (let x = 0; x < w; x += band * 2) ctx.fillRect(x, 0, band, h);
    for (let y = 0; y < h; y += band * 2) ctx.fillRect(0, y, w, band);
  } else if (pattern === "tiles") {
    const tile = 46;
    for (let y = 0; y < h; y += tile) {
      for (let x = 0; x < w; x += tile) {
        const k = hash(5, Math.floor(x / tile), Math.floor(y / tile));
        ctx.globalAlpha = 0.18 + 0.22 * k;
        ctx.fillStyle = c.check;
        ctx.fillRect(x + 1.5, y + 1.5, tile - 3, tile - 3);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = "rgb(255, 255, 255)";
        ctx.fillRect(x + 4, y + 4, tile * 0.42, 2);
      }
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = c.line;
    for (let x = 0; x <= w; x += tile) ctx.fillRect(x - 1, 0, 2, h);
    for (let y = 0; y <= h; y += tile) ctx.fillRect(0, y - 1, w, 2);
  } else {
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = c.check;
    const fold = ctx.createLinearGradient(0, 0, w, h);
    fold.addColorStop(0, "rgba(0, 0, 0, 0)");
    fold.addColorStop(0.35, c.check);
    fold.addColorStop(0.5, "rgba(0, 0, 0, 0)");
    fold.addColorStop(0.72, c.check);
    fold.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = fold;
    ctx.fillRect(0, 0, w, h);
  }
  // The weave: fine seeded threads both ways.
  ctx.globalAlpha = c.dark ? 0.07 : 0.05;
  ctx.fillStyle = c.line;
  for (let y = 0; y < h; y += 3) {
    if (hash(9, y, 0) < 0.55) ctx.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 3) {
    if (hash(9, x, 1) < 0.45) ctx.fillRect(x, 0, 1, h);
  }
  ctx.restore();
}

function createIce(
  root: HTMLDivElement,
  glCanvas: HTMLCanvasElement,
  report: { current: Report },
): Engine {
  let cfg: Config | null = null;
  let colours: Colours | null = null;
  let gpu: Gpu | null = null;
  let width = 0;
  let height = 0;
  let visible = false;
  let paused = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  let painted = false;
  let fallback = false;
  let imageDirty = true;
  let imageEl: HTMLImageElement | null = null;
  let imageReady = false;
  const art = document.createElement("canvas");

  const cube = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: 0,
    spin: 0,
    mass: 1,
    alpha: 1,
    scale: 1,
    lift: 0,
    tx: 0,
    ty: 0,
    placed: false,
    melted: false,
    slump: 0,
    prevX: 0,
    prevY: 0,
  };
  let count = 1;
  let wet = 0;
  let ring = { x: 0, y: 0, r: 0, amount: 0 };
  let dropRun: { stop: () => void } | null = null;
  const cracks = new Float32Array(12);

  const fullHalf = () => {
    const c = cfg;
    const cap = Math.min(height * 0.34, width * 0.3);
    return Math.max(10, Math.min(c?.size ?? 68, cap)) / 2;
  };
  const halfNow = () =>
    fullHalf() * (0.42 + 0.58 * Math.pow(cube.mass, 0.75)) * cube.scale;

  const seedCracks = (n: number) => {
    for (let k = 0; k < 3; k += 1) {
      cracks[k * 4] = (hash(n, k, 1) - 0.5) * 0.9;
      cracks[k * 4 + 1] = (hash(n, k, 2) - 0.5) * 0.9;
      cracks[k * 4 + 2] = hash(n, k, 3) * Math.PI;
      cracks[k * 4 + 3] = 0.25 + hash(n, k, 4) * 0.5;
    }
  };
  seedCracks(1);

  const buildGpu = (): boolean => {
    const gl = createGL(glCanvas, { alpha: false });
    if (!gl) return false;
    const ice = createProgram(gl, FULLSCREEN_VERTEX, ICE_FRAGMENT);
    const water = createProgram(gl, FULLSCREEN_VERTEX, WATER_FRAGMENT);
    if (!ice || !water) {
      ice?.dispose();
      water?.dispose();
      return false;
    }
    gpu = {
      gl,
      ice,
      water,
      iceTri: createFullscreenTriangle(gl, ice),
      waterTri: createFullscreenTriangle(gl, water),
      pool: null,
      image: null,
      lost: false,
    };
    imageDirty = true;
    return true;
  };

  const setFallback = (on: boolean) => {
    if (on === fallback) return;
    fallback = on;
    report.current.fallback(on);
  };

  if (!buildGpu()) setFallback(true);

  const detachLoss = onContextLoss(
    glCanvas,
    () => {
      if (gpu) gpu.lost = true;
      setFallback(true);
      request();
    },
    () => {
      gpu = null;
      if (buildGpu()) setFallback(false);
      request();
    },
  );

  const ensurePool = (g: Gpu) => {
    const ww = Math.max(2, Math.ceil(width / WATER_SCALE));
    const wh = Math.max(2, Math.ceil(height / WATER_SCALE));
    if (g.pool && g.pool.read.width === ww && g.pool.read.height === wh) {
      return g.pool;
    }
    g.pool?.dispose();
    g.pool = createPingPong(g.gl, ww, wh, true);
    for (const fb of [g.pool.read, g.pool.write]) {
      fb.bind();
      g.gl.clearColor(0, 0, 0, 1);
      g.gl.clear(g.gl.COLOR_BUFFER_BIT);
    }
    return g.pool;
  };

  const ratio = () =>
    Math.min(window.devicePixelRatio || 1, clamp(cfg?.dpr ?? 2, 0.5, 2));

  const refreshImage = (g: Gpu) => {
    if (!colours || !cfg || width < 2 || height < 2) return;
    const r = ratio();
    const bw = Math.max(1, Math.round(width * r));
    const bh = Math.max(1, Math.round(height * r));
    if (art.width !== bw || art.height !== bh) {
      art.width = bw;
      art.height = bh;
    }
    const ctx = art.getContext("2d");
    if (!ctx) return;
    if (cfg.src && imageEl && imageReady) {
      const iw = imageEl.naturalWidth || 1;
      const ih = imageEl.naturalHeight || 1;
      const s = Math.max(bw / iw, bh / ih);
      const dw = iw * s;
      const dh = ih * s;
      ctx.drawImage(imageEl, (bw - dw) / 2, (bh - dh) / 2, dw, dh);
    } else {
      paintCloth(ctx, width, height, r, cfg.pattern, colours);
    }
    try {
      g.image = uploadTexture(g.gl, art, { linear: true }, g.image);
      imageDirty = false;
    } catch {
      // A picture from another origin without CORS taints the canvas: keep
      // the plain picture and the drawn cube rather than throwing.
      setFallback(true);
    }
  };

  const clampToBox = () => {
    const half = halfNow();
    const lo = half + 2;
    let hit = 0;
    if (cube.x < lo) {
      hit = Math.max(hit, -cube.vx);
      cube.x = lo;
      cube.vx = Math.max(0, cube.vx) * 0.2;
    } else if (cube.x > width - lo) {
      hit = Math.max(hit, cube.vx);
      cube.x = width - lo;
      cube.vx = Math.min(0, cube.vx) * 0.2;
    }
    if (cube.y < lo) {
      hit = Math.max(hit, -cube.vy);
      cube.y = lo;
      cube.vy = Math.max(0, cube.vy) * 0.2;
    } else if (cube.y > height - lo) {
      hit = Math.max(hit, cube.vy);
      cube.y = height - lo;
      cube.vy = Math.min(0, cube.vy) * 0.2;
    }
    if (hit > 260) report.current.clack(Math.min(0.5, hit / 2400), cube.x);
  };

  const placeAtRest = () => {
    if (!cfg) return;
    cube.x = clamp(cfg.rest.x, 0, 1) * width;
    cube.y = clamp(cfg.rest.y, 0, 1) * height;
    cube.tx = cube.x;
    cube.ty = cube.y;
    cube.prevX = cube.x;
    cube.prevY = cube.y;
    cube.placed = true;
    clampToBox();
  };

  let lastMeltStep = 20;

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    cube.prevX = cube.x;
    cube.prevY = cube.y;
    if (!cube.melted && c.motionSafe) {
      // The glide spring, integrated per frame so the cube carries its own
      // momentum between pointer events and can be steered mid-slide.
      const k = springs.glide.stiffness;
      const d = springs.glide.damping;
      const ax0 = cube.vx;
      const ay0 = cube.vy;
      cube.vx += ((cube.tx - cube.x) * k - cube.vx * d) * dt;
      cube.vy += ((cube.ty - cube.y) * k - cube.vy * d) * dt;
      cube.x += cube.vx * dt;
      cube.y += cube.vy * dt;
      clampToBox();
      // A curving slide twists it: the turn of the velocity, felt as torque.
      const ax = (cube.vx - ax0) / Math.max(dt, 0.001);
      const ay = (cube.vy - ay0) / Math.max(dt, 0.001);
      const torque =
        (cube.vx * ay - cube.vy * ax) /
        (cube.vx * cube.vx + cube.vy * cube.vy + 4000);
      cube.spin += torque * 0.9 * dt;
      cube.spin *= Math.exp(-dt * 3.2);
      cube.angle += cube.spin * dt;
    }
    const moved = Math.hypot(cube.x - cube.prevX, cube.y - cube.prevY);
    // Sliding melts it: friction warms the face that drags on the cloth.
    if (!cube.melted && c.motionSafe && c.melt > 0) {
      cube.mass -= c.melt * (moved * 0.0008 + dt * 0.002 * Math.min(1, moved));
      const left = clamp(cube.mass, MIN_MASS, 1);
      const stepNow = Math.ceil(left * 20);
      if (stepNow !== lastMeltStep) {
        lastMeltStep = stepNow;
        report.current.onMelt?.(Math.round(stepNow * 5) / 100);
      }
      if (cube.mass <= MIN_MASS) {
        cube.mass = MIN_MASS;
        cube.melted = true;
        ring = { x: cube.x, y: cube.y, r: halfNow() * 0.6, amount: 0.3 };
        wet = Math.max(wet, 0.7);
        dropRun?.stop();
        dropRun = animate(cube.alpha, 0, {
          duration: durations.slow * 1.5,
          ease: easings.exit,
          onUpdate: (v) => {
            cube.alpha = v;
            request();
          },
          onComplete: () => {
            report.current.onMelted?.();
            report.current.said("The cube has melted.");
          },
        });
      }
    }
  };

  const busy = () =>
    Math.abs(cube.vx) + Math.abs(cube.vy) > 2 ||
    Math.hypot(cube.tx - cube.x, cube.ty - cube.y) > 0.5 ||
    wet > 0.004 ||
    dropRun !== null ||
    ring.amount > 0;

  const drawGL = (g: Gpu, dt: number) => {
    const { gl } = g;
    const c = cfg;
    if (!c || !colours) return;
    if (imageDirty || !g.image) refreshImage(g);
    if (!g.image) return;
    const pool = ensurePool(g);
    const half = halfNow();
    const keep = Math.exp(-dt / lerp(0.8, 7, clamp(c.trail, 0, 1)));
    const moved = Math.hypot(cube.x - cube.prevX, cube.y - cube.prevY);
    const deposit =
      c.motionSafe && !cube.melted && cube.alpha > 0.5
        ? lerp(0.03, 0.1, clamp(c.trail, 0, 1)) * clamp(moved / 5, 0, 1)
        : 0;
    wet = wet * keep + deposit;
    // The water pass.
    pool.write.bind();
    g.water.use();
    g.water.texture("u_prev", pool.read.texture, 0);
    g.water.set({
      u_size: [pool.read.width, pool.read.height],
      u_scale: WATER_SCALE,
      u_from: [cube.prevX, cube.prevY],
      u_to: [cube.x, cube.y],
      u_radius: half * 0.62,
      u_amount: deposit,
      u_keep: keep,
      u_spread: clamp(dt * 6, 0, 0.5),
      u_ring: [ring.x, ring.y, ring.r],
      u_ringAmount: ring.amount,
    });
    g.waterTri.draw();
    pool.swap();
    ring.amount = 0;
    // The picture through the ice and the water.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    resizeGL(gl, glCanvas, { dprCap: clamp(c.dpr, 0.5, 2) });
    g.ice.use();
    g.ice.texture("u_image", g.image, 0);
    g.ice.texture("u_water", pool.read.texture, 1);
    const mass = cube.mass;
    const soft = clamp(1 - c.facets + (1 - mass) * 0.6, 0, 1);
    // Soft facets mean a rounder, wider-shouldered cube; sharp ones a
    // crisp block with a narrow chamfer.
    const sharp = clamp(c.facets, 0, 1);
    const round = half * lerp(0.12, 0.62, 1 - mass) * lerp(2.8, 0.5, sharp);
    g.ice.set({
      u_res: [width, height],
      u_texel: [1 / pool.read.width, 1 / pool.read.height],
      u_cube: [cube.x, cube.y],
      u_half: half,
      u_round: Math.min(half * 0.98, round),
      u_bevel: half * lerp(0.36, 0.26, mass) * lerp(1.4, 0.9, sharp),
      u_angle: cube.angle,
      u_soft: soft,
      u_alpha: cube.alpha,
      u_lift: cube.lift,
      u_refr: clamp(c.refraction, 0, 1),
      u_frost: clamp(c.frost, 0, 1) * lerp(0.55, 1, mass),
      u_tint: colours.tint,
      u_cracks: cracks,
      u_seed: (count % 17) * 3.7,
    });
    g.iceTri.draw();
  };

  const draw = (now: number) => {
    frame = 0;
    if (disposed || !cfg || width < 2) return;
    if (!visible) return;
    const dt = Math.min(1 / 30, last ? (now - last) / 1000 : 1 / 60);
    last = now;
    if (!paused) step(dt);
    const g = gpu;
    if (g && !g.lost && !g.gl.isContextLost() && !fallback) {
      drawGL(g, paused ? 0 : dt);
      if (!painted) {
        painted = true;
        report.current.live(true);
      }
    }
    report.current.place(cube.x, cube.y, cube.angle, halfNow());
    if (!paused && busy()) frame = requestAnimationFrame(draw);
    else last = 0;
  };

  const request = () => {
    if (frame || disposed || !visible) return;
    frame = requestAnimationFrame(draw);
  };

  return {
    configure: (next) => {
      const prev = cfg;
      cfg = next;
      if (
        !prev ||
        prev.pattern !== next.pattern ||
        prev.src !== next.src ||
        prev.dpr !== next.dpr
      ) {
        imageDirty = true;
      }
      if (next.src && next.src !== prev?.src) {
        imageReady = false;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => {
          if (imageEl !== img) return;
          imageReady = true;
          imageDirty = true;
          request();
        };
        img.onerror = () => {
          if (imageEl === img) setFallback(true);
        };
        img.src = next.src;
        imageEl = img;
      }
      if (
        prev &&
        (prev.rest.x !== next.rest.x || prev.rest.y !== next.rest.y)
      ) {
        placeAtRest();
      }
      request();
    },
    colours: (next) => {
      colours = next;
      imageDirty = true;
      request();
    },
    resize: () => {
      const w = Math.max(1, root.clientWidth);
      const h = Math.max(1, root.clientHeight);
      const changed = w !== width || h !== height;
      if (!changed) return;
      const fx = width ? cube.x / width : -1;
      const fy = height ? cube.y / height : -1;
      width = w;
      height = h;
      imageDirty = true;
      if (!cube.placed) placeAtRest();
      else if (fx >= 0) {
        cube.x = fx * w;
        cube.y = fy * h;
        cube.tx = cube.x;
        cube.ty = cube.y;
        clampToBox();
      }
      request();
    },
    setVisible: (on) => {
      visible = on;
      if (on) request();
    },
    setPaused: (on) => {
      paused = on;
      if (!on) request();
    },
    aim: (x, y, snap = false) => {
      if (!cfg || cube.melted) return;
      const half = halfNow();
      cube.tx = clamp(x, half + 2, width - half - 2);
      cube.ty = clamp(y, half + 2, height - half - 2);
      if (snap || !cfg.motionSafe) {
        cube.x = cube.tx;
        cube.y = cube.ty;
        cube.prevX = cube.x;
        cube.prevY = cube.y;
        cube.vx = 0;
        cube.vy = 0;
      }
      request();
    },
    drop: (x, y) => {
      const c = cfg;
      if (!c) return;
      // The old cube leaves its water where it stood.
      if (!cube.melted && cube.alpha > 0.1) {
        ring = { x: cube.x, y: cube.y, r: halfNow() * 0.5, amount: 0.22 };
        wet = Math.max(wet, 0.5);
      }
      dropRun?.stop();
      count += 1;
      seedCracks(count * 13 + c.seed);
      cube.melted = false;
      cube.mass = 1;
      cube.alpha = 1;
      cube.angle = (hash(count, 3, 1) - 0.5) * 0.5;
      cube.spin = 0;
      cube.vx = 0;
      cube.vy = 0;
      lastMeltStep = 20;
      const half = fullHalf();
      const px = clamp(x ?? cube.x, half + 2, width - half - 2);
      const py = clamp(y ?? cube.y, half + 2, height - half - 2);
      cube.x = px;
      cube.y = py;
      cube.tx = px;
      cube.ty = py;
      cube.prevX = px;
      cube.prevY = py;
      report.current.onDrop?.(count);
      report.current.onMelt?.(1);
      report.current.said("Fresh cube dropped.");
      if (!c.motionSafe) {
        cube.scale = 1;
        cube.lift = 0;
        dropRun = null;
        request();
        return;
      }
      // Dropped from a little above: it lands on the recoil spring, its
      // shadow tightening as it comes down, and splashes once on contact.
      cube.scale = 1.32;
      cube.lift = 1;
      let landed = false;
      dropRun = animate(1.32, 1, {
        ...springs.recoil,
        onUpdate: (v) => {
          cube.scale = v;
          cube.lift = clamp((v - 1) / 0.32, 0, 1);
          if (!landed && v <= 1.01) {
            landed = true;
            ring = { x: px, y: py, r: half * 0.95, amount: 0.32 };
            wet = Math.max(wet, 0.4);
            report.current.clack(0.55, px);
          }
          request();
        },
        onComplete: () => {
          cube.scale = 1;
          cube.lift = 0;
          dropRun = null;
          request();
        },
      });
      request();
    },
    dispose: () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      dropRun?.stop();
      dropRun = null;
      detachLoss();
      if (imageEl) {
        imageEl.onload = null;
        imageEl.onerror = null;
      }
      const g = gpu;
      gpu = null;
      if (g && !g.lost && !g.gl.isContextLost()) {
        g.pool?.dispose();
        if (g.image) g.gl.deleteTexture(g.image);
        g.iceTri.dispose();
        g.waterTri.dispose();
        g.ice.dispose();
        g.water.dispose();
      }
    },
  };
}

const INTERACTIVE =
  "a, button, input, select, textarea, label, [role='button'], [tabindex]";

/**
 * A clear ice cube sliding across a picture. It follows the pointer on the
 * glide spring, turning a little with the curve of its slide, and bends the
 * picture per pixel in one WebGL2 pass: bevelled facets displace it (flat
 * folds or soft curves, `facets`), the top magnifies it through frosted
 * cracks and a cloudy core, a cold highlight runs along the top edge, and a
 * pale shadow holds a bright caustic. Sliding melts it — it shrinks, rounds
 * and softens, and lays meltwater into a ping-pong field that bends the
 * picture too before it dries — until it slumps into a puddle. A click drops a
 * fresh cube, which lands on `springs.recoil` with a splash; keyboard focus on
 * anything inside parks the cube on it, and a drop button appears for the
 * keyboard. Under reduced motion the cube rests still and refracting, and
 * focus or a click moves it at once.
 */
export function IceCube({
  children,
  image,
  pattern = "gingham",
  melt = 0.4,
  facets = 0.7,
  trail = 0.5,
  size = 68,
  refraction = 0.6,
  frost = 0.5,
  tint = "oklch(from var(--accent-bright) 0.9 0.05 calc(h - 40))",
  rest = { x: 0.74, y: 0.55 },
  interactive = true,
  paused = false,
  dpr = 2,
  sound = false,
  onDrop,
  onMelt,
  onMelted,
  dropLabel = "Drop a fresh cube",
  disabled = false,
  className,
}: IceCubeProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const glRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriers = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const pageShown = React.useRef(true);
  const [live, setLive] = React.useState(false);
  const [fallback, setFallback] = React.useState(false);
  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const active = interactive && !disabled;
  const restX = clamp(rest.x, 0, 1);
  const restY = clamp(rest.y, 0, 1);

  // The drawn stand-in cube (server frame and no-WebGL fallback).
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fAngle = useMotionValue(0);
  const fHalf = useMotionValue(size / 2);
  const fSide = useTransform(fHalf, (h) => r2(h * 2));

  const cfg: Config = {
    melt,
    facets,
    trail,
    size,
    refraction,
    frost,
    rest: { x: restX, y: restY },
    dpr,
    pattern,
    src: image?.src,
    motionSafe,
    seed: 3,
  };
  const cfgRef = React.useRef(cfg);
  const report = React.useRef<Report>({
    clack: () => {},
    said: () => {},
    live: () => {},
    fallback: () => {},
    place: () => {},
  });
  React.useLayoutEffect(() => {
    cfgRef.current = cfg;
    report.current = {
      onDrop,
      onMelt,
      onMelted,
      clack: (gain, x) => {
        if (!sound) return;
        // Sound answers the visitor only: never before a press or a key.
        const activated =
          typeof navigator === "undefined" ||
          (
            navigator as Navigator & {
              userActivation?: { hasBeenActive: boolean };
            }
          ).userActivation?.hasBeenActive !== false;
        if (!activated) return;
        const root = rootRef.current;
        const pan = root
          ? panFrom(root.getBoundingClientRect().left + x, root)
          : 0;
        audio.play("clack", { gain, pitch: 1.15, pan });
      },
      said: (text) => setSaid((s) => ({ n: s.n + 1, text })),
      live: (on) => setLive(on),
      fallback: (on) => setFallback(on),
      place: (x, y, angle, half) => {
        const root = rootRef.current;
        if (!root) return;
        fx.set(r2(x - restX * root.clientWidth));
        fy.set(r2(y - restY * root.clientHeight));
        fAngle.set(r2((angle * 180) / Math.PI));
        fHalf.set(r2(half));
      },
    };
  });

  const readColours = React.useCallback(() => {
    const host = carriers.current;
    if (!host) return;
    const kids = Array.from(host.children);
    const at = (i: number) => {
      const el = kids[i];
      return el ? getComputedStyle(el).color : "rgb(240, 240, 240)";
    };
    const read = colourReader();
    const base = at(0);
    const b = read(base);
    engine.current?.colours({
      base,
      check: at(1),
      line: at(2),
      tint: read(at(3)),
      dark: 0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2] < 0.4,
    });
  }, []);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = glRef.current;
    if (!root || !canvas) return;
    const e = createIce(root, canvas, report);
    engine.current = e;
    e.configure(cfgRef.current);
    readColours();
    e.resize();
    e.setVisible(visible.current && pageShown.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [readColours]);

  const cfgKey = JSON.stringify(cfg);
  React.useEffect(() => {
    engine.current?.configure(cfgRef.current);
  }, [cfgKey]);

  React.useEffect(() => {
    engine.current?.setPaused(paused);
  }, [paused]);

  const colourKey = `${tint}|${pattern}`;
  React.useEffect(() => {
    readColours();
  }, [colourKey, readColours]);

  React.useEffect(() => {
    const onVisibility = () => {
      pageShown.current = document.visibilityState !== "hidden";
      engine.current?.setVisible(visible.current && pageShown.current);
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
      engine.current?.setVisible(visible.current && pageShown.current);
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
    return { x: clientX - r.left, y: clientY - r.top };
  };

  const parked = React.useRef<HTMLElement | null>(null);
  const parkOn = (node: HTMLElement) => {
    const r = node.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.aim(at.x, at.y);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!active || !motionSafe) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.aim(at.x, at.y);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") return;
    // A keyboard visitor's cube goes back to what they are on.
    const node = parked.current;
    if (node?.isConnected) parkOn(node);
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!active) return;
    const target = event.target as HTMLElement;
    const hit = target.closest(INTERACTIVE);
    if (hit && hit !== event.currentTarget) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.drop(at.x, at.y);
  };

  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.dataset.iceDrop !== undefined) return;
    if (!target.matches(":focus-visible")) return;
    parked.current = target;
    parkOn(target);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && rootRef.current?.contains(next)) return;
    parked.current = null;
  };

  const showCloth = !image?.src;

  return (
    <div
      ref={bindRoot}
      data-live={live && !fallback ? "" : undefined}
      data-fallback={fallback ? "" : undefined}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        "group/ice-cube relative isolate h-56 w-full touch-pan-y overflow-clip",
        className,
      )}
    >
      {/* The picture as the server sends it, and as the fallback shows it. */}
      {showCloth ? (
        <div
          aria-hidden
          className="absolute inset-0 bg-card"
          style={{
            backgroundImage:
              pattern === "gingham"
                ? "linear-gradient(to right, color-mix(in oklab, var(--accent-bright) 15%, transparent) 50%, transparent 50%), linear-gradient(to bottom, color-mix(in oklab, var(--accent-bright) 15%, transparent) 50%, transparent 50%)"
                : pattern === "tiles"
                  ? "linear-gradient(to right, color-mix(in oklab, var(--ink) 16%, var(--card)) 2px, transparent 2px), linear-gradient(to bottom, color-mix(in oklab, var(--ink) 16%, var(--card)) 2px, transparent 2px)"
                  : "linear-gradient(135deg, transparent 20%, color-mix(in oklab, var(--accent-bright) 6%, transparent) 35%, transparent 50%, color-mix(in oklab, var(--accent-bright) 6%, transparent) 72%, transparent 90%)",
            backgroundSize:
              pattern === "gingham"
                ? "44px 44px"
                : pattern === "tiles"
                  ? "46px 46px"
                  : "100% 100%",
            backgroundPosition: pattern === "tiles" ? "-1px -1px" : "0 0",
          }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image?.src}
          alt={image?.alt ?? ""}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <canvas
        ref={glRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-200 group-data-fallback/ice-cube:hidden group-data-live/ice-cube:opacity-100"
      />
      {/* The drawn cube: the first frame, and the cube when WebGL is not there. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute group-data-live/ice-cube:hidden"
        style={{
          left: pct3(restX),
          top: pct3(restY),
          x: fx,
          y: fy,
        }}
      >
        <motion.div
          className="-translate-x-1/2 -translate-y-1/2 rounded-[22%] border border-white/70 shadow-[6px_9px_14px_-6px_oklch(0.2_0.02_258/0.35)]"
          style={{
            width: fSide,
            height: fSide,
            rotate: fAngle,
            backgroundColor: `color-mix(in oklab, ${tint} 30%, transparent)`,
            backgroundImage:
              "linear-gradient(135deg, oklch(1 0 0 / 0.75) 0%, oklch(1 0 0 / 0.18) 22%, oklch(1 0 0 / 0.05) 55%, oklch(1 0 0 / 0.3) 100%), radial-gradient(circle at 50% 55%, oklch(1 0 0 / 0.42) 0%, oklch(1 0 0 / 0) 55%)",
          }}
        />
      </motion.div>
      <div className="relative z-10 size-full">{children}</div>
      <button
        type="button"
        data-ice-drop=""
        disabled={!active}
        onClick={(event) => {
          event.stopPropagation();
          engine.current?.drop();
        }}
        className={cn(
          "pointer-events-none absolute right-3 bottom-3 z-20 inline-flex h-8 items-center rounded-full border border-hairline-strong bg-popover px-3 text-xs font-medium text-foreground opacity-0 outline-none",
          "focus-visible:pointer-events-auto focus-visible:opacity-100",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      >
        {dropLabel}
      </button>
      <span
        ref={carriers}
        aria-hidden
        onTransitionEnd={readColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        <span className="text-card transition-colors duration-1" />
        <span
          className="transition-colors duration-1"
          style={{
            color: "color-mix(in oklab, var(--accent-bright) 30%, var(--card))",
          }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: "color-mix(in oklab, var(--ink) 30%, var(--card))" }}
        />
        <span
          className="transition-colors duration-1"
          style={{ color: tint }}
        />
      </span>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}
