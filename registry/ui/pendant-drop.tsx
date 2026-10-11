"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type PendantDropPalette = "iris" | "amber" | "lagoon" | "rose";

export type PendantDropProps = {
  /** How thick the liquid is, 0 (runny: quick, wobbly) to 1 (thick: slow, composed, gooier joins). @default 0.5 */
  viscosity?: number;
  /** How far away the drop notices your hand, 0 (only right beside it) to 1 (across the frame). @default 0.6 */
  reach?: number;
  /** The liquid's colours, pale at the root to deep in the lobe: a preset, or two CSS colours of your own. @default "iris" */
  palette?: PendantDropPalette | [string, string];
  /** How far the drop stretches before a droplet pinches off, 0 (lets go early) to 1 (holds on long). @default 0.5 */
  tension?: number;
  /** The bulb's radius in px; it shrinks to fit a small frame. @default 34 */
  size?: number;
  /** Where along the top edge the drop hangs, 0 (left) to 1 (right). @default 0.5 */
  anchor?: number;
  /** How fast a droplet falls, 0.5 to 2. @default 1 */
  gravity?: number;
  /** The glassy highlights, rim light and caustic, 0 (matte) to 1. @default 0.6 */
  gloss?: number;
  /** Draw the pool along the bottom edge that droplets fall into. Off, they fall out of the frame. @default true */
  pool?: boolean;
  /** The pointer and touch pull the drop. Keys still lean it. @default true */
  interactive?: boolean;
  /** Hold the liquid still. @default false */
  paused?: boolean;
  /** The frame's accessible name. @default "Pendant drop" */
  label?: string;
  /** Play a plip as each droplet lands. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires as each droplet lets go, with how many have fallen. */
  onDrip?: (count: number) => void;
  /** Nothing reaches the drop and the frame's button is disabled. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the frame. @default "h-96 w-full" */
  className?: string;
};

/** Pigment at fixed lightness, so the liquid is the same liquid on any page. */
const PALETTES: Record<PendantDropPalette, [string, string]> = {
  iris: [
    "oklch(from var(--accent-bright) 0.88 0.07 calc(h + 35))",
    "oklch(from var(--accent-bright) 0.5 0.2 calc(h + 18))",
  ],
  amber: [
    "oklch(from var(--warn) 0.93 0.08 calc(h + 8))",
    "oklch(from var(--warn) 0.64 0.17 calc(h - 38))",
  ],
  lagoon: [
    "oklch(from var(--signal) 0.91 0.06 h)",
    "oklch(from var(--signal) 0.5 0.11 calc(h + 55))",
  ],
  rose: [
    "oklch(from var(--danger) 0.91 0.05 calc(h + 12))",
    "oklch(from var(--danger) 0.55 0.19 calc(h - 8))",
  ],
};
const SHADE = "oklch(from var(--ink) 0.3 0.03 h)";

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec3 u_root;
uniform float u_film;
uniform vec4 u_neckA;
uniform vec4 u_neckM;
uniform vec4 u_bulb;
uniform vec2 u_bulbDir;
uniform float u_rJoin;
uniform vec4 u_drops[3];
uniform vec2 u_dropDir[3];
uniform vec3 u_pool;
uniform vec4 u_ripples[4];
uniform vec3 u_mound;
uniform float u_k;
uniform vec3 u_top;
uniform vec3 u_lobe;
uniform vec4 u_shade;
uniform float u_gloss;
uniform float u_pinch;
uniform float u_R;
in vec2 v_uv;
out vec4 o_color;

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float cro(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }

// A capsule whose radius runs from ra at pa to rb at pb.
float sdUneven(vec2 p, vec2 pa, vec2 pb, float ra, float rb) {
  p -= pa;
  pb -= pa;
  float h = dot(pb, pb);
  float b = ra - rb;
  if (h <= b * b + 1e-3) return length(p) - max(ra, rb);
  vec2 q = vec2(dot(p, vec2(pb.y, -pb.x)), dot(p, pb)) / h;
  q.x = abs(q.x);
  vec2 c = vec2(sqrt(h - b * b), b);
  float k = cro(c, q);
  float m = dot(c, q);
  float n = dot(q, q);
  if (k < 0.0) return sqrt(h * n) - ra;
  if (k > c.x) return sqrt(h * (n + 1.0 - 2.0 * q.y)) - rb;
  return m - ra;
}
float hTube(vec2 p, vec2 a, vec2 b, float ra, float rb) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-3), 0.0, 1.0);
  float r = mix(ra, rb, t);
  vec2 d = p - a - ab * t;
  return sqrt(max(0.0, r * r - dot(d, d)));
}
vec2 blobQ(vec2 p, vec2 c, float s, vec2 dir) {
  vec2 d = p - c;
  return vec2(dot(d, dir) / s, dot(d, vec2(-dir.y, dir.x)) * s);
}
float sdBlob(vec2 p, vec2 c, float r, float s, vec2 dir) {
  return (length(blobQ(p, c, s, dir)) - r) * min(s, 1.0 / s);
}
float hBlob(vec2 p, vec2 c, float r, float s, vec2 dir) {
  vec2 q = blobQ(p, c, s, dir);
  return r * sqrt(max(0.0, 1.0 - dot(q, q) / (r * r)));
}

float surfaceY(float x) {
  float y = u_pool.x;
  float dm = (x - u_mound.x) / max(1.0, u_mound.z);
  y -= u_mound.y * exp(-dm * dm);
  for (int i = 0; i < 4; i += 1) {
    vec4 r = u_ripples[i];
    if (r.y == 0.0) continue;
    float dist = abs(x - r.x);
    float front = r.z * r.w;
    float e = (dist - front) / 30.0;
    y -= r.y * exp(-r.z * 1.5) * cos((dist - front) * 0.15) * exp(-e * e);
  }
  return y;
}

// The film and the pool are optional: the shadow is cast by the drop alone,
// so the ceiling film does not darken a band along the top of the frame.
float scene(vec2 p, bool whole) {
  float k = u_k;
  vec2 qr = (p - vec2(u_root.x, 0.0)) / u_root.yz;
  float d = (length(qr) - 1.0) * min(u_root.y, u_root.z);
  if (whole) d = smin(p.y - u_film, d, k * 0.8);
  if (u_neckA.w > 0.5) {
    d = smin(d, sdUneven(p, u_neckA.xy, u_neckM.xy, u_neckA.z, u_neckM.z), k * 0.5);
    d = smin(d, sdUneven(p, u_neckM.xy, u_bulb.xy, u_neckM.z, u_rJoin), k * 0.5);
  }
  d = smin(d, sdBlob(p, u_bulb.xy, u_bulb.z, u_bulb.w, u_bulbDir), k);
  for (int i = 0; i < 3; i += 1) {
    vec4 dr = u_drops[i];
    if (dr.z <= 0.0) continue;
    d = smin(d, sdBlob(p, dr.xy, dr.z, dr.w, u_dropDir[i]), k);
  }
  if (whole && u_pool.y > 0.5) d = smin(d, surfaceY(p.x) - p.y, k);
  return d;
}

// A height above the page for the glass shading: each part's own dome or
// tube (so a neck is a round tube, not a creased ridge), joined smoothly,
// with the union's own distance filling the bridges between them.
float heightAt(vec2 p, float d) {
  float k = u_k * 0.6;
  vec2 qr = (p - vec2(u_root.x, 0.0)) / u_root.yz;
  float h = u_root.z * sqrt(max(0.0, 1.0 - dot(qr, qr)));
  h = smax(h, max(0.0, u_film - p.y) * 0.6, k);
  if (u_neckA.w > 0.5) {
    h = smax(h, hTube(p, u_neckA.xy, u_neckM.xy, u_neckA.z, u_neckM.z), k);
    h = smax(h, hTube(p, u_neckM.xy, u_bulb.xy, u_neckM.z, u_rJoin), k);
  }
  h = smax(h, hBlob(p, u_bulb.xy, u_bulb.z, u_bulb.w, u_bulbDir), k);
  for (int i = 0; i < 3; i += 1) {
    vec4 dr = u_drops[i];
    if (dr.z <= 0.0) continue;
    h = smax(h, hBlob(p, dr.xy, dr.z, dr.w, u_dropDir[i]), k);
  }
  if (u_pool.y > 0.5) {
    // A rounded lip along the surface, then the flat face of the pool.
    float lip = min(u_pool.z, u_R * 0.3);
    float s = clamp(p.y - surfaceY(p.x), 0.0, lip);
    h = smax(h, sqrt(max(0.0, s * (2.0 * lip - s))), k);
  }
  float rb = u_R * 0.45;
  float s = clamp(-d, 0.0, rb);
  return max(h, sqrt(max(0.0, s * (2.0 * rb - s))));
}

void main() {
  vec2 p = v_uv * u_res;
  float d = scene(p, true);
  float aa = max(fwidth(d), 0.6);
  float alpha = clamp(0.5 - d / aa, 0.0, 1.0);
  // The shadow falls down and right of the key light, soft and short.
  float ds = scene(p - vec2(u_R * 0.22, u_R * 0.4), false);
  float shadow = (1.0 - smoothstep(-u_R * 0.3, u_R * 0.55, ds)) * u_shade.a;
  vec4 outc = vec4(u_shade.rgb * shadow, shadow);
  if (alpha > 0.0) {
    float h0 = heightAt(p, d);
    vec2 px = p + vec2(1.0, 0.0);
    vec2 py = p + vec2(0.0, 1.0);
    float hx = heightAt(px, scene(px, true));
    float hy = heightAt(py, scene(py, true));
    vec3 n = normalize(vec3(h0 - hx, h0 - hy, 1.0));

    // Colour runs from the root to the lobe; as the neck stretches the
    // split slides down it and the lobe deepens: the colour pools ahead.
    vec2 rootP = vec2(u_root.x, 0.0);
    vec2 axis = u_bulb.xy - rootP;
    float g = dot(p - rootP, axis) / max(dot(axis, axis), 1.0);
    float c = smoothstep(mix(0.12, 0.62, u_pinch), 1.0, g);
    for (int i = 0; i < 3; i += 1) {
      vec4 dr = u_drops[i];
      if (dr.z <= 0.0) continue;
      c = max(c, 1.0 - smoothstep(0.0, dr.z * 0.8, length(p - dr.xy) - dr.z));
    }
    float inPool = 0.0;
    if (u_pool.y > 0.5) {
      inPool = smoothstep(u_pool.x - u_R * 1.2, u_pool.x, p.y);
      c = max(c, inPool * 0.86);
    }
    vec3 lobe = mix(u_lobe, u_lobe * 0.8, u_pinch);
    vec3 base = mix(u_top, lobe, c);

    // The pool is deep however flat its face: it reads by depth, darkening
    // a little toward the bottom of the frame.
    float thick = clamp(h0 / (u_R * 1.05), 0.0, 1.0);
    thick = max(thick, inPool * 0.7);
    base *= 1.0 - 0.14 * inPool * clamp((p.y - u_pool.x) / max(u_pool.z, 1.0), 0.0, 1.0);
    vec3 body = mix(base * 1.06 + 0.035, base * 0.76, thick);
    float edge = -d;
    float band = smoothstep(0.4, 2.2, edge) * (1.0 - smoothstep(2.2, 7.0, edge));
    body *= 1.0 - 0.24 * band;
    vec3 L = normalize(vec3(-0.42, -0.62, 0.66));
    vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, H), 0.0), 80.0) * 1.35 * u_gloss;
    float win = smoothstep(0.958, 0.986, dot(n, normalize(vec3(-0.3, -0.42, 0.86)))) * 0.3 * u_gloss;
    vec2 nn = n.xy / max(length(n.xy), 1e-4);
    float caustic = pow(max(dot(nn, normalize(vec2(0.42, 0.76))), 0.0), 3.0)
      * smoothstep(0.08, 0.6, 1.0 - n.z) * (1.0 - 0.5 * thick);
    float fres = pow(1.0 - n.z, 2.0);
    body += base * caustic * 0.6 * u_gloss + vec3(fres * 0.2 * u_gloss);
    body = clamp(body, 0.0, 1.0);
    float bodyA = mix(0.6, 0.97, thick) * alpha;
    outc = vec4(body * bodyA, bodyA) + outc * (1.0 - bodyA);
    float lit = clamp(spec + win, 0.0, 1.0) * alpha;
    outc = vec4(outc.rgb * (1.0 - lit) + vec3(lit), outc.a + lit * (1.0 - outc.a));
  }
  o_color = outc;
}
`;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** Dense screens draw three quarters of their pixels: the liquid is soft, the edge antialiased. */
const RENDER_SCALE = 0.75;
const MAX_DROPS = 3;
const MAX_RIPPLES = 4;
const RECOIL_S = 0.7;

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = (d[0] ?? 0) / 255;
    out[at + 1] = (d[1] ?? 0) / 255;
    out[at + 2] = (d[2] ?? 0) / 255;
  };
}

/** The drop's resting geometry in a frame, px. */
function geometry(w: number, h: number, size: number, anchor: number) {
  const R = clamp(Math.min(size, w * 0.12, h * 0.09), 8, 72);
  const ax = clamp(anchor, 0, 1) * (w - 4 * R) + 2 * R;
  const rootW = R * 1.3;
  const rootH = R * 0.55;
  const neckY = rootH * 0.35;
  const rest = R * 2.05;
  return {
    R,
    ax,
    rootW,
    rootH,
    neckY,
    rest,
    film: Math.max(2, R * 0.09),
    poolDepth: Math.max(12, h * 0.05),
  };
}

type Config = {
  viscosity: number;
  reach: number;
  tension: number;
  size: number;
  anchor: number;
  gravity: number;
  gloss: number;
  pool: boolean;
  interactive: boolean;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  pointer: (x: number, y: number, on: boolean) => void;
  lean: (x: number, y: number) => void;
  pinch: () => void;
  dispose: () => void;
};

type Callbacks = {
  drip: () => void;
  land: (x: number, size: number) => void;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  events: { current: Callbacks },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let detach: () => void = () => {};
  const size = { w: 0, h: 0 };
  const read = rgbReader();
  const colours = new Float32Array(9);

  // The bulb: a mass on a spring hung from the neck.
  const bulb = { x: 0, y: 0, vx: 0, vy: 0 };
  let fill = 1;
  let recoil = 0;
  let engaged = false;
  let forced = false;
  let queued = false;
  // A lean that pulled a drop off is spent: until the keys lean again it
  // stops short of the pinch, so a held lean does not become a tap left on.
  let spent = false;
  const hand = { x: 0, y: 0, on: false };
  const lean = { x: 0, y: 0 };
  // Droplets: x, y, vx, vy, r per slot (r 0 = empty).
  const drops = new Float32Array(MAX_DROPS * 5);
  // Ripples: x0, amplitude, age, speed.
  const ripples = new Float32Array(MAX_RIPPLES * 4);
  let rippleSlot = 0;
  const mound = { x: 0, y: 0, v: 0, w: 1 };
  // Uniform staging, preallocated.
  const uDrops = new Float32Array(MAX_DROPS * 4);
  const uDropDir = new Float32Array(MAX_DROPS * 2);
  const uRipples = new Float32Array(MAX_RIPPLES * 4);
  // A reduced-motion drip shows one still of the moment after, then rests.
  let stillDrip = 0;
  let stillTimer = 0;

  const geo = () => {
    const c = cfg;
    return geometry(size.w, size.h, c?.size ?? 34, c?.anchor ?? 0.5);
  };

  const rest = () => {
    const g = geo();
    bulb.x = g.ax;
    bulb.y = g.neckY + g.rest;
    bulb.vx = 0;
    bulb.vy = 0;
  };

  const pinchLength = () => {
    const g = geo();
    return g.rest * (1.85 + 1.25 * clamp(cfg?.tension ?? 0.5, 0, 1));
  };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    gpu = { gl, program, tri, lost: false };
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.tri.dispose();
    g.program.dispose();
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1 || size.h < 1) return;
    const g = geo();
    const still = !c.motionSafe;
    const shown = still ? (stillDrip ? 0.42 : 1) : fill;
    const bx = still ? g.ax : bulb.x;
    const by = still ? g.neckY + g.rest : bulb.y;
    const vx = still ? 0 : bulb.vx;
    const vy = still ? 0 : bulb.vy;
    const nx = g.ax;
    const ny = g.neckY;
    const len = Math.hypot(bx - nx, by - ny);
    const pl = pinchLength();
    const pinch = clamp((len - g.rest) / Math.max(1, pl - g.rest), 0, 1);
    const thin = clamp((len - pl * 0.7) / (pl * 0.3), 0, 1);
    const Rb = g.R * (0.42 + 0.58 * shown) * (1 + 0.12 * pinch);
    const speed = Math.hypot(vx, vy);
    const squash = 1 + Math.min(0.22, speed / 2200);
    const dirx = speed > 4 ? vx / speed : (bx - nx) / Math.max(1, len);
    const diry = speed > 4 ? vy / speed : (by - ny) / Math.max(1, len);
    const neckR =
      g.R *
      0.4 *
      Math.sqrt(g.rest / Math.max(g.rest, len)) *
      (1 - 0.86 * thin) *
      (0.6 + 0.4 * shown);
    const mx = nx + (bx - nx) * 0.52;
    const my = ny + (by - ny) * 0.52;

    for (let i = 0; i < MAX_DROPS; i += 1) {
      const o = i * 5;
      const r = drops[o + 4] ?? 0;
      uDrops[i * 4] = drops[o] ?? 0;
      uDrops[i * 4 + 1] = drops[o + 1] ?? 0;
      uDrops[i * 4 + 2] = r;
      const dvx = drops[o + 2] ?? 0;
      const dvy = drops[o + 3] ?? 0;
      const ds = Math.hypot(dvx, dvy);
      uDrops[i * 4 + 3] = 1 + Math.min(0.32, ds / 2600);
      uDropDir[i * 2] = ds > 1 ? dvx / ds : 0;
      uDropDir[i * 2 + 1] = ds > 1 ? dvy / ds : 1;
    }
    for (let i = 0; i < MAX_RIPPLES * 4; i += 1) uRipples[i] = ripples[i] ?? 0;
    if (still && stillDrip) {
      // The moment after: the droplet already home, one ring on the pool.
      uRipples[0] = g.ax;
      uRipples[1] = g.R * 0.16;
      uRipples[2] = 0.25;
      uRipples[3] = 140;
    }
    const poolY = size.h - g.poolDepth;
    const k = g.R * lerp(0.42, 0.95, clamp(c.viscosity, 0, 1));

    p.program.set({
      u_res: [size.w, size.h],
      u_root: [g.ax, g.rootW, g.rootH],
      u_film: g.film,
      u_neckA: [nx, ny, g.R * 0.62, 1],
      u_neckM: [mx, my, Math.max(0.6, neckR), 0],
      u_bulb: [bx, by, Rb, squash],
      u_bulbDir: [dirx, diry],
      u_rJoin: Rb * 0.72,
      u_drops: uDrops,
      u_dropDir: uDropDir,
      u_pool: [poolY, c.pool ? 1 : 0, g.poolDepth],
      u_ripples: uRipples,
      u_mound: [mound.x, still ? 0 : mound.y, mound.w],
      u_k: k,
      u_top: [colours[0] ?? 0.8, colours[1] ?? 0.8, colours[2] ?? 0.9],
      u_lobe: [colours[3] ?? 0.3, colours[4] ?? 0.3, colours[5] ?? 0.7],
      u_shade: [colours[6] ?? 0, colours[7] ?? 0, colours[8] ?? 0, 0.13],
      u_gloss: clamp(c.gloss, 0, 1),
      u_pinch: pinch,
      u_R: g.R,
    });
    p.gl.viewport(0, 0, canvas.width, canvas.height);
    p.gl.clearColor(0, 0, 0, 0);
    p.gl.clear(p.gl.COLOR_BUFFER_BIT);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const spawn = () => {
    const g = geo();
    let slot = -1;
    for (let i = 0; i < MAX_DROPS; i += 1) {
      if ((drops[i * 5 + 4] ?? 0) <= 0) {
        slot = i;
        break;
      }
    }
    if (slot < 0) slot = 0;
    const Rb = g.R * (0.42 + 0.58 * fill);
    const len = Math.hypot(bulb.x - g.ax, bulb.y - g.neckY) || 1;
    const o = slot * 5;
    drops[o] = bulb.x + ((bulb.x - g.ax) / len) * Rb * 0.25;
    drops[o + 1] = bulb.y + ((bulb.y - g.neckY) / len) * Rb * 0.25;
    drops[o + 2] = bulb.vx * 0.8;
    drops[o + 3] = Math.max(60, bulb.vy * 0.8 + 80);
    drops[o + 4] = Rb * 0.7;
    // What is left of the bulb springs home with the recoil constants,
    // and the film starts refilling it.
    fill = 0.22;
    recoil = RECOIL_S;
    engaged = false;
    forced = false;
    spent = true;
    events.current.drip();
  };

  const land = (i: number) => {
    const g = geo();
    const o = i * 5;
    const x = drops[o] ?? 0;
    const r = drops[o + 4] ?? 0;
    const vy = drops[o + 3] ?? 0;
    drops[o + 4] = 0;
    // Two packets run out along the surface, and the pool takes a mound
    // that rebounds with the recoil constants: two visible bounces.
    const slot = rippleSlot;
    rippleSlot = (rippleSlot + 1) % MAX_RIPPLES;
    ripples[slot * 4] = x;
    // Gentle: a steep packet would break the surface's highlight into spikes.
    ripples[slot * 4 + 1] = clamp(r * 0.08 + vy * 0.0006, 0.6, g.R * 0.13);
    ripples[slot * 4 + 2] = 0;
    ripples[slot * 4 + 3] = 130 + g.R * 2;
    mound.x = x;
    mound.w = r * 1.5;
    mound.v += clamp(vy * 0.08, 16, 110) * (r / g.R);
    events.current.land(x, r / g.R);
  };

  const goal = { x: 0, y: 0 };
  const reachOf = () =>
    geo().R * 6 * (0.2 + 0.8 * clamp(cfg?.reach ?? 0.6, 0, 1));

  /** Where the bulb is heading now: rest, leaned, pulled by the hand, or forced. */
  const aim = () => {
    const g = geo();
    const nx = g.ax;
    const ny = g.neckY;
    const restX = nx;
    const restY = ny + g.rest;
    const pl = pinchLength();
    const leanY = spent
      ? Math.min(lean.y, ((pl - g.rest) / g.R) * 0.6)
      : lean.y;
    let tx = restX + lean.x * g.R;
    let ty = restY + leanY * g.R;
    if (engaged) {
      tx = restX + (hand.x - restX) * 0.86;
      ty = restY + (hand.y - restY) * 0.86;
    }
    if (forced) {
      tx = restX + lean.x * g.R;
      ty = ny + pl * 1.3;
    }
    // The drop cannot climb into the ceiling or leave the frame.
    ty = Math.max(ny + g.R * 0.9, ty);
    tx = clamp(tx, g.R * 1.2, size.w - g.R * 1.2);
    const far = Math.hypot(tx - nx, ty - ny);
    const maxLen = pl * 1.35;
    if (far > maxLen) {
      tx = nx + ((tx - nx) / far) * maxLen;
      ty = ny + ((ty - ny) / far) * maxLen;
    }
    goal.x = tx;
    goal.y = ty;
  };

  const step = (dt: number) => {
    const c = cfg;
    if (!c) return;
    const g = geo();
    const nx = g.ax;
    const ny = g.neckY;
    // Refill from the film, on the drift spring's time scale.
    fill += (1 - fill) * (1 - Math.exp(-dt * 3.2));
    if (fill > 0.999) fill = 1;
    recoil = Math.max(0, recoil - dt);

    // The hand takes the drop when it comes within reach of the bulb, and
    // lets it go when it moves away faster than the drop can follow.
    const reach = reachOf();
    if (hand.on && c.interactive && fill > 0.85 && recoil <= 0) {
      const d = Math.hypot(hand.x - bulb.x, hand.y - bulb.y);
      if (!engaged && d < reach) engaged = true;
      if (engaged && d > reach * 1.18) engaged = false;
    } else if (!hand.on) {
      engaged = false;
    }
    aim();
    const tx = goal.x;
    const ty = goal.y;
    const pl = pinchLength();

    const v = clamp(c.viscosity, 0, 1);
    let k = lerp(300, 80, v);
    let ratio = lerp(0.32, 1, v);
    if (recoil > 0) {
      k = springs.recoil.stiffness / springs.recoil.mass;
      ratio =
        springs.recoil.damping /
        (2 * Math.sqrt(springs.recoil.stiffness * springs.recoil.mass));
    }
    if (forced) {
      k = 420;
      ratio = 0.75;
    }
    const damp = 2 * ratio * Math.sqrt(k);
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 240);
      left -= h;
      bulb.vx += (k * (tx - bulb.x) - damp * bulb.vx) * h;
      bulb.vy += (k * (ty - bulb.y) - damp * bulb.vy) * h;
      bulb.x += bulb.vx * h;
      bulb.y += bulb.vy * h;
    }
    const len = Math.hypot(bulb.x - nx, bulb.y - ny);
    if (len > pl && fill > 0.85) spawn();
    if (queued && fill > 0.85 && recoil <= 0) {
      queued = false;
      forced = true;
    }

    // Droplets fall, stretched along their speed, and meet the pool.
    const G = 2.1 * size.h * clamp(c.gravity, 0.5, 2);
    const poolY = size.h - g.poolDepth;
    for (let i = 0; i < MAX_DROPS; i += 1) {
      const o = i * 5;
      const r = drops[o + 4] ?? 0;
      if (r <= 0) continue;
      let dvx = drops[o + 2] ?? 0;
      let dvy = drops[o + 3] ?? 0;
      dvy += G * dt;
      dvx *= Math.exp(-dt * 1.4);
      dvy *= Math.exp(-dt * 0.25);
      const x = (drops[o] ?? 0) + dvx * dt;
      const y = (drops[o + 1] ?? 0) + dvy * dt;
      drops[o] = clamp(x, r, size.w - r);
      drops[o + 1] = y;
      drops[o + 2] = dvx;
      drops[o + 3] = dvy;
      if (c.pool && y > poolY + r * 0.15) land(i);
      else if (!c.pool && y - r > size.h + 4) drops[o + 4] = 0;
    }

    // The mound: a damped oscillator with the recoil constants.
    const mk = springs.recoil.stiffness / springs.recoil.mass;
    const mc = springs.recoil.damping / springs.recoil.mass;
    mound.v += (-mk * mound.y - mc * mound.v) * dt;
    mound.y += mound.v * dt;
    if (Math.abs(mound.y) < 0.02 && Math.abs(mound.v) < 0.5) {
      mound.y = 0;
      mound.v = 0;
    }
    for (let i = 0; i < MAX_RIPPLES; i += 1) {
      const o = i * 4;
      if ((ripples[o + 1] ?? 0) === 0) continue;
      const age = (ripples[o + 2] ?? 0) + dt;
      ripples[o + 2] = age;
      if (age > 2.6) ripples[o + 1] = 0;
    }
  };

  const moving = () => {
    const c = cfg;
    if (!c || !c.motionSafe || c.paused) return false;
    if (forced || queued || recoil > 0 || fill < 0.999) return true;
    // A hand within reach is about to take the drop; one that already has it
    // keeps the loop only while the drop is still catching up.
    if (
      !engaged &&
      hand.on &&
      c.interactive &&
      Math.hypot(hand.x - bulb.x, hand.y - bulb.y) < reachOf()
    )
      return true;
    aim();
    if (Math.hypot(bulb.x - goal.x, bulb.y - goal.y) > 0.15) return true;
    if (Math.hypot(bulb.vx, bulb.vy) > 0.4) return true;
    if (mound.y !== 0 || mound.v !== 0) return true;
    for (let i = 0; i < MAX_DROPS; i += 1)
      if ((drops[i * 5 + 4] ?? 0) > 0) return true;
    for (let i = 0; i < MAX_RIPPLES; i += 1)
      if ((ripples[i * 4 + 1] ?? 0) !== 0) return true;
    return false;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden || !gpu) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.033, (now - last) / 1000) : 1 / 60;
    last = now;
    if (c.motionSafe && !c.paused) step(dt);
    draw();
    if (moving()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    if (!moving()) {
      draw();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 3; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
  };

  const resize = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    const first = size.w < 1;
    size.w = w;
    size.h = h;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    resizeGL(p.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? RENDER_SCALE : 1,
    });
    if (first) rest();
    draw();
    kick();
  };

  const start = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!start()) {
          // No WebGL2: the drawn still stays, and nothing retries.
          failed = true;
          root.setAttribute("data-fallback", "");
          return;
        }
        detach = onContextLoss(
          canvas,
          () => {
            if (gpu) gpu.lost = true;
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
            root.removeAttribute("data-live");
          },
          () => {
            gpu = null;
            if (!disposed && start()) kick();
          },
        );
        kick();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey) readColours();
      if (was.size !== next.size || was.anchor !== next.anchor) rest();
      if (!next.motionSafe && was.motionSafe) {
        rest();
        drops.fill(0);
        ripples.fill(0);
        mound.y = 0;
        mound.v = 0;
        fill = 1;
        recoil = 0;
        forced = false;
        queued = false;
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
    pointer(x, y, on) {
      hand.x = x;
      hand.y = y;
      hand.on = on;
      kick();
    },
    lean(x, y) {
      lean.x = x;
      lean.y = y;
      spent = false;
      kick();
    },
    pinch() {
      const c = cfg;
      if (!c) return;
      if (!c.motionSafe) {
        // The still of the moment after, then the still at rest.
        stillDrip = 1;
        window.clearTimeout(stillTimer);
        events.current.drip();
        draw();
        stillTimer = window.setTimeout(() => {
          stillDrip = 0;
          draw();
        }, 600);
        return;
      }
      if (c.paused) return;
      if (fill > 0.85 && recoil <= 0) forced = true;
      else queued = true;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      window.clearTimeout(stillTimer);
      detach();
      release();
      root.removeAttribute("data-live");
    },
  };
}

/** The drop at rest as one path, in px from the root: the server's frame and the fallback. */
function stillShape(size: number) {
  const R = size;
  const rw = R * 1.3;
  const rn = R * 0.36;
  const L = R * 0.2 + R * 2.05;
  const f = (v: number) => r2(v);
  return {
    R,
    width: f(rw * 2 + 8),
    height: f(L + R + 6),
    d: [
      `M ${f(-rw)} 0`,
      `C ${f(-rw * 0.5)} 0 ${f(-rn)} ${f(L * 0.22)} ${f(-rn)} ${f(L * 0.46)}`,
      `C ${f(-rn)} ${f(L * 0.66)} ${f(-R)} ${f(L - R * 0.6)} ${f(-R)} ${f(L)}`,
      `A ${f(R)} ${f(R)} 0 0 0 ${f(R)} ${f(L)}`,
      `C ${f(R)} ${f(L - R * 0.6)} ${f(rn)} ${f(L * 0.66)} ${f(rn)} ${f(L * 0.46)}`,
      `C ${f(rn)} ${f(L * 0.22)} ${f(rw * 0.5)} 0 ${f(rw)} 0`,
      "Z",
    ].join(" "),
    bulbY: f(L),
  };
}

/**
 * A single drop of coloured liquid hanging from the top edge of its frame on
 * surface tension, over a shallow pool. Bring the pointer near and the drop
 * leans and stretches toward it, its neck thinning to a thread while the
 * colour pools into the leading lobe; pull far enough and a droplet pinches
 * off, the rest recoiling home on the recoil spring's constants and refilling
 * from the film, while the droplet falls, is met by the pool and reabsorbed
 * with a rebounding mound and ripples running out along the surface.
 *
 * One WebGL2 pass of signed distances joined by a smooth minimum whose reach
 * is the viscosity, shaded as glass: specular, window light, Fresnel rim,
 * refracted dark band and caustic. The frame is a button: arrows lean the
 * drop, Down stretches it, Enter, Space or a click lets a drop fall, Escape
 * lets it hang straight. Under reduced motion a still drop, and a drip shows
 * as a still of the moment after.
 */
export function PendantDrop({
  viscosity = 0.5,
  reach = 0.6,
  palette = "iris",
  tension = 0.5,
  size = 34,
  anchor = 0.5,
  gravity = 1,
  gloss = 0.6,
  pool = true,
  interactive = true,
  paused = false,
  label = "Pendant drop",
  sound = false,
  onDrip,
  disabled = false,
  dpr = 2,
  className,
}: PendantDropProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const leanRef = React.useRef({ x: 0, y: 0 });
  const count = React.useRef(0);
  const live = !disabled;

  const [top, lobe] = Array.isArray(palette)
    ? [palette[0] ?? PALETTES.iris[0], palette[1] ?? PALETTES.iris[1]]
    : (PALETTES[palette] ?? PALETTES.iris);

  const config: Config = {
    viscosity,
    reach,
    tension,
    size,
    anchor,
    gravity,
    gloss,
    pool,
    interactive: interactive && live,
    paused,
    dpr,
    motionSafe,
    colorKey: `${top}|${lobe}`,
  };
  const latest = React.useRef(config);
  const events = React.useRef<Callbacks>({ drip: () => {}, land: () => {} });

  React.useLayoutEffect(() => {
    latest.current = config;
    events.current = {
      drip: () => {
        count.current += 1;
        onDrip?.(count.current);
      },
      land: (x, relative) => {
        if (!sound) return;
        // The plip answers the visitor: never before the page has had a press.
        const activated =
          (
            navigator as Navigator & {
              userActivation?: { hasBeenActive: boolean };
            }
          ).userActivation?.hasBeenActive === true;
        if (!activated) return;
        const r = rootRef.current?.getBoundingClientRect();
        audio.play("plip", {
          pitch: clamp(1.35 - relative * 0.55, 0.7, 1.5),
          gain: 0.5,
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
    e.lean(leanRef.current.x, leanRef.current.y);
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

  const drag = useDrag({
    threshold: 4,
    disabled: !live || !interactive,
    onMove: ({ point }) => {
      const at = local(point.x, point.y);
      if (at) engine.current?.pointer(at.x, at.y, true);
    },
    onEnd: ({ event }) => {
      if (event.pointerType === "touch") engine.current?.pointer(0, 0, false);
    },
    onCancel: () => engine.current?.pointer(0, 0, false),
    onTap: () => engine.current?.pinch(),
  });

  const setLean = (x: number, y: number) => {
    leanRef.current = { x, y };
    engine.current?.lean(x, y);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const l = leanRef.current;
    const stepSize = event.shiftKey ? 1.4 : 0.7;
    if (event.key === "ArrowLeft") setLean(clamp(l.x - stepSize, -4, 4), l.y);
    else if (event.key === "ArrowRight")
      setLean(clamp(l.x + stepSize, -4, 4), l.y);
    else if (event.key === "ArrowDown")
      setLean(l.x, clamp(l.y + stepSize, -0.8, 6));
    else if (event.key === "ArrowUp")
      setLean(l.x, clamp(l.y - stepSize, -0.8, 6));
    else if (event.key === "Escape") {
      if (l.x === 0 && l.y === 0) return;
      setLean(0, 0);
    } else return;
    event.preventDefault();
  };

  const still = stillShape(clamp(size, 8, 72));
  const gradId = `${uid}-liquid`;

  return (
    <div
      ref={bindRoot}
      className={cn(
        "group/pendant-drop relative isolate h-96 w-full overflow-clip",
        className,
      )}
    >
      <svg
        aria-hidden
        width={still.width}
        height={still.height}
        viewBox={`${r2(-still.width / 2)} 0 ${still.width} ${still.height}`}
        className="pointer-events-none absolute top-0 -translate-x-1/2 transition-opacity duration-300 group-data-live/pendant-drop:opacity-0"
        style={{ left: `${r3(clamp(anchor, 0, 1) * 60 + 20)}%` }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.25" style={{ stopColor: top }} />
            <stop offset="1" style={{ stopColor: lobe }} />
          </linearGradient>
        </defs>
        <path d={still.d} fill={`url(#${gradId})`} fillOpacity={0.92} />
        <ellipse
          cx={r2(-still.R * 0.38)}
          cy={r2(still.bulbY - still.R * 0.42)}
          rx={r2(still.R * 0.26)}
          ry={r2(still.R * 0.16)}
          fill="white"
          opacity={0.7}
        />
      </svg>
      {pool ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[5%] border-t border-white/40 transition-opacity duration-300 group-data-live/pendant-drop:opacity-0"
          style={{ backgroundColor: lobe, opacity: 0.85 }}
        />
      ) : null}
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
        {[top, lobe, SHADE].map((c, i) => (
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
        {...drag}
        onPointerMove={(event) => {
          drag.onPointerMove(event);
          if (!live || !interactive || event.pointerType === "touch") return;
          const at = local(event.clientX, event.clientY);
          if (at) engine.current?.pointer(at.x, at.y, true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "touch") return;
          engine.current?.pointer(0, 0, false);
        }}
        onKeyDown={onKeyDown}
        onClick={(event) => {
          // Enter, Space or assistive technology: a click with no pointer
          // behind it lets a drop fall. Pointer clicks arrive as the tap.
          if (event.detail === 0 && live) engine.current?.pinch();
        }}
        className={cn(
          "absolute inset-0 size-full cursor-pointer touch-none rounded-3 outline-none",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
          "disabled:cursor-default",
        )}
      />
      {live ? (
        <p id={hintId} className="sr-only">
          Arrow keys lean the drop and Down stretches it; Enter or Space lets a
          drop fall; Escape lets it hang straight.
        </p>
      ) : null}
    </div>
  );
}
