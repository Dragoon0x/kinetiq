"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createPingPong,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type PingPong,
  type Program,
  type UniformValue,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type HeatPuttyPalette = "mood" | "sunset" | "glacier" | "orchid";

export type HeatPuttyProps = {
  /** How quickly a resting hand warms the putty, 0.2 to 2. @default 1 */
  warmth?: number;
  /** How quickly it cools back, 0.2 to 2. @default 1 */
  cooling?: number;
  /** The thermochromic pigment, cool to hot: a preset, or 2–5 CSS colours. @default "sunset" */
  palette?: HeatPuttyPalette | string[];
  /** How long a rested hand's print lingers, 0 (gone at once) to 1 (a long while). @default 0.6 */
  handprints?: number;
  /** How much warmth softens the putty so it slumps and spreads, 0 to 1. @default 0.5 */
  slump?: number;
  /** How far a press flattens it, 0 to 1. @default 0.6 */
  squash?: number;
  /** The radius of a warm touch, px. @default 30 */
  hand?: number;
  /** The blob's outline: any number gives its own lump. @default 7 */
  seed?: number;
  /** Draw the stone slab it rests on; off, it sits on whatever is behind. @default true */
  slab?: boolean;
  /** Pointer, touch and keys warm and press it. @default true */
  interactive?: boolean;
  /** Hold the putty as it is: no warming, no cooling. @default false */
  paused?: boolean;
  /** Device-pixel-ratio cap for the canvas, at most 2. @default 2 */
  dpr?: number;
  /** Fires with the putty's mean warmth, in tenths, as it changes. */
  onHeatChange?: (heat: number) => void;
  /** The putty's accessible name. @default "Thermochromic putty" */
  label?: string;
  disabled?: boolean;
  /** Size with a height class; the putty fits the shorter side. @default "h-56" */
  className?: string;
};

/** Thermochromic pigments, cool to hot, the same in both themes. */
const PALETTES: Record<HeatPuttyPalette, string[]> = {
  mood: [
    "oklch(0.3 0.07 285)",
    "oklch(0.5 0.13 250)",
    "oklch(0.7 0.14 168)",
    "oklch(0.86 0.15 98)",
  ],
  sunset: [
    "oklch(0.42 0.1 305)",
    "oklch(0.6 0.16 352)",
    "oklch(0.74 0.15 42)",
    "oklch(0.89 0.12 88)",
  ],
  glacier: [
    "oklch(0.38 0.08 255)",
    "oklch(0.6 0.1 228)",
    "oklch(0.8 0.07 205)",
    "oklch(0.95 0.025 200)",
  ],
  orchid: [
    "oklch(0.4 0.08 160)",
    "oklch(0.6 0.11 185)",
    "oklch(0.7 0.14 322)",
    "oklch(0.87 0.09 342)",
  ],
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function lcg(seed: number) {
  let s = (Math.floor(seed * 9973) ^ 0x5bd1e995) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The outline's lumps from a seed: amplitudes and phases of harmonics 2–5. */
function harmonics(seed: number) {
  const r = lcg(seed);
  const amp = [0.045, 0.032, 0.018, 0.009].map((a) =>
    r3(a * (0.6 + 0.8 * r())),
  );
  const phase = [0, 0, 0, 0].map(() => r3(r() * Math.PI * 2));
  return { amp, phase };
}

/** The blob in uv: centre, and radius as a fraction of the box's height. */
const BLOB = { x: 0.5, y: 0.52, r: 0.33 };

/* --------------------------------- shaders -------------------------------- */

const SHAPE = `
uniform float u_aspect;
uniform vec4 u_shape;   // slump, squash, press x, press y (uv)
uniform vec4 u_harmA;
uniform vec4 u_harmP;
uniform vec3 u_blob;    // centre (uv), radius (height units)

// Signed distance to the putty's outline, in height units: negative inside.
// Warmth slumps it wider and lower about its base; a press squashes it the
// same way and dents it under the hand.
float blob(vec2 uv) {
  vec2 p = (uv - u_blob.xy) * vec2(u_aspect, 1.0);
  float s = u_shape.x;
  float k = u_shape.y;
  p.y -= u_blob.z * (0.1 * s + 0.12 * k);
  p.x /= 1.0 + 0.16 * s + 0.14 * k;
  p.y /= 1.0 - 0.12 * s - 0.16 * k;
  float a = atan(p.y, p.x);
  float r = u_blob.z * (1.0
    + u_harmA.x * cos(2.0 * a + u_harmP.x)
    + u_harmA.y * cos(3.0 * a + u_harmP.y)
    + u_harmA.z * cos(4.0 * a + u_harmP.z)
    + u_harmA.w * cos(5.0 * a + u_harmP.w));
  float d = length(p) - r;
  vec2 q = (uv - u_shape.zw) * vec2(u_aspect, 1.0);
  d += 0.035 * k * exp(-dot(q, q) / 0.012);
  return d;
}
`;

const SIM = `
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_prev;
uniform vec2 u_texel;
uniform float u_dt;
uniform vec3 u_hand;     // x, y (uv), heat per second
uniform float u_handR;   // radius, height units
uniform float u_cool;    // base loss per second
uniform float u_clear;
${SHAPE}
void main() {
  if (u_clear > 0.5) { o = vec4(0.0); return; }
  float h = texture(u_prev, v_uv).r;
  float n = texture(u_prev, v_uv + vec2(u_texel.x, 0.0)).r
          + texture(u_prev, v_uv - vec2(u_texel.x, 0.0)).r
          + texture(u_prev, v_uv + vec2(0.0, u_texel.y)).r
          + texture(u_prev, v_uv - vec2(0.0, u_texel.y)).r;
  // Heat spreads to its neighbours: the halo grows outward from the touch.
  h = mix(h, n * 0.25, clamp(u_dt * 7.0, 0.0, 0.85));
  float d = blob(v_uv);
  float inside = smoothstep(0.012, -0.012, d);
  float depth = clamp(-d / u_blob.z, 0.0, 1.0);
  vec2 q = (v_uv - u_hand.xy) * vec2(u_aspect, 1.0);
  h += u_hand.z * u_dt * exp(-dot(q, q) / (u_handR * u_handR)) * inside;
  // Thin putty near the outline loses heat fastest, so a warm patch cools
  // back from its edges inward.
  float rate = u_cool * (1.0 + 2.2 * (1.0 - smoothstep(0.0, 0.5, depth)));
  h *= exp(-rate * u_dt);
  o = vec4(min(h, 3.0) * inside, 0.0, 0.0, 1.0);
}
`;

const SCREEN = `
in vec2 v_uv;
out vec4 o;
uniform sampler2D u_heat;
uniform vec3 u_pal[5];
uniform float u_palN;
uniform vec3 u_slab;
uniform float u_slabOn;
${SHAPE}
${GLSL_NOISE}

vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

// The pigment at a temperature, mixed in linear light along the stops.
vec3 ramp(float t) {
  float n = u_palN - 1.0;
  float x = clamp(t, 0.0, 1.0) * n;
  float i = min(floor(x), n - 1.0);
  float f = smoothstep(0.0, 1.0, x - i);
  vec3 a = u_pal[0];
  vec3 b = u_pal[1];
  for (int k = 0; k < 4; k++) {
    if (float(k) == i) { a = u_pal[k]; b = u_pal[k + 1]; }
  }
  return mix(lin(a), lin(b), f);
}

float dome(float d) {
  float t = clamp(-d / u_blob.z, 0.0, 1.0);
  return sqrt(1.0 - (1.0 - t) * (1.0 - t)) * (1.0 - 0.32 * u_shape.x - 0.25 * u_shape.y);
}

void main() {
  vec2 uv = v_uv;
  float d = blob(uv);
  float soft = 0.0045 + 0.007 * u_shape.x;
  float alpha = smoothstep(soft, -soft, d);

  // Shading from the dome's slope.
  float e = 0.004;
  float h0 = dome(d);
  float hx = dome(blob(uv + vec2(e / u_aspect, 0.0)));
  float hy = dome(blob(uv + vec2(0.0, e)));
  vec3 n = normalize(vec3((h0 - hx) * 0.11 / e, (h0 - hy) * 0.11 / e, 1.0));
  vec3 l = normalize(vec3(-0.45, -0.65, 0.85));
  float diffuse = max(dot(n, l), 0.0);
  vec3 r = reflect(-l, n);
  float sheen = pow(max(r.z, 0.0), 18.0) * 0.16;

  float heat = texture(u_heat, uv).r;
  // Saturates slowly, so the pigment keeps a long gradient around the
  // warmest spot instead of a flat disc of the hottest colour.
  float temp = heat / (heat + 0.55);
  vec3 pigment = ramp(temp);
  float depth = clamp(-d / u_blob.z, 0.0, 1.0);
  // Soft matte putty: a broad wrap of light, a little occlusion where it
  // meets the slab, a faint sheen.
  vec3 putty = pigment * (0.42 + 0.72 * diffuse) * mix(0.82, 1.0, smoothstep(0.0, 0.35, depth));
  putty += vec3(sheen);

  // The slab: the page's own surface, with a faint stone grain and the
  // putty's contact shadow.
  vec2 so = vec2(0.018 / u_aspect, 0.03);
  float ds = blob(uv - so);
  float shadow = exp(-max(ds, 0.0) * 22.0) * 0.32 * (1.0 - alpha);
  vec2 g = uv * vec2(u_aspect, 1.0) * 180.0;
  float grain = (kx_noise(g) - 0.5) * 0.035 + (kx_noise(g * 0.13) - 0.5) * 0.03;
  vec3 slab = lin(u_slab) * (1.0 + grain) * (1.0 - shadow);

  if (u_slabOn > 0.5) {
    o = vec4(srgb(mix(slab, putty, alpha)), 1.0);
  } else {
    float a = max(alpha, shadow);
    vec3 c = mix(vec3(0.0), putty, alpha / max(a, 0.0001));
    o = vec4(srgb(c) * a, a);
  }
}
`;

/* --------------------------------- engine --------------------------------- */

type Config = {
  warmth: number;
  cooling: number;
  handprints: number;
  slump: number;
  squash: number;
  hand: number;
  seed: number;
  slab: boolean;
  paused: boolean;
  dpr: number;
  motionSafe: boolean;
  colorKey: string;
};

type Hand = {
  x: number;
  y: number;
  present: boolean;
  pressed: boolean;
  /** Pointer speed, px/s; a resting hand warms, a moving one barely. */
  speed: number;
};

type Events = { heat: (mean: number) => void };

type Gpu = {
  gl: GLContext;
  sim: Program;
  screen: Program;
  triSim: FullscreenTriangle;
  triScreen: FullscreenTriangle;
  field: PingPong;
  lost: boolean;
};

type Engine = {
  configure: (c: Config) => void;
  setHand: (h: Partial<Hand>) => void;
  resize: () => void;
  readColours: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

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
    const p = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = (p[0] ?? 0) / 255;
    out[at + 1] = (p[1] ?? 0) / 255;
    out[at + 2] = (p[2] ?? 0) / 255;
  };
}

/** The putty's outline in JS, for knowing whether the hand is on it. */
function blobAt(
  x: number,
  y: number,
  aspect: number,
  slump: number,
  squash: number,
  harm: { amp: number[]; phase: number[] },
): number {
  let px = (x - BLOB.x) * aspect;
  let py = y - BLOB.y;
  py -= BLOB.r * (0.1 * slump + 0.12 * squash);
  px /= 1 + 0.16 * slump + 0.14 * squash;
  py /= 1 - 0.12 * slump - 0.16 * squash;
  const a = Math.atan2(py, px);
  let r = 1;
  for (let k = 0; k < 4; k += 1) {
    r += (harm.amp[k] ?? 0) * Math.cos((k + 2) * a + (harm.phase[k] ?? 0));
  }
  return Math.hypot(px, py) - BLOB.r * r;
}

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  squashMv: MotionValue<number>,
  events: Events,
): Engine {
  const STEP = 1 / 60;
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let clearNext = true;
  const size = { w: 0, h: 0 };
  const read = rgbReader();
  const pal = new Float32Array(15);
  let palN = 4;
  const slabRGB = new Float32Array(3);
  let harm = harmonics(7);
  const hand: Hand = {
    x: 0.5,
    y: 0.5,
    present: false,
    pressed: false,
    speed: 0,
  };
  // The CPU's model of the putty: its mean warmth and its slump spring.
  let mean = 0;
  let slumpNow = 0;
  let slumpVel = 0;
  let reported = -1;

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) return false;
    const sim = createProgram(gl, FULLSCREEN_VERTEX, SIM);
    const screen = createProgram(gl, FULLSCREEN_VERTEX, SCREEN);
    if (!sim || !screen) return false;
    gpu = {
      gl,
      sim,
      screen,
      triSim: createFullscreenTriangle(gl, sim),
      triScreen: createFullscreenTriangle(gl, screen),
      field: createPingPong(gl, 8, 8, true),
      lost: false,
    };
    clearNext = true;
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.triSim.dispose();
    g.triScreen.dispose();
    g.sim.dispose();
    g.screen.dispose();
    g.field.dispose();
  };

  const fieldSize = () => {
    const w = Math.max(16, Math.min(128, Math.round(size.w / 3)));
    const h = Math.max(12, Math.round((w * size.h) / Math.max(1, size.w)));
    return { w, h };
  };

  // Uniforms are written into these each frame rather than rebuilt.
  const shapeV = new Float32Array(4);
  const harmA = new Float32Array(4);
  const harmP = new Float32Array(4);
  const blobV = new Float32Array([BLOB.x, BLOB.y, BLOB.r]);
  const handV = new Float32Array(3);
  const texel = new Float32Array(2);
  const slabV = new Float32Array(3);
  const simU: Record<string, UniformValue> = {
    u_aspect: 1,
    u_shape: shapeV,
    u_harmA: harmA,
    u_harmP: harmP,
    u_blob: blobV,
    u_texel: texel,
    u_dt: STEP,
    u_hand: handV,
    u_handR: 0.1,
    u_cool: 0.3,
    u_clear: 0,
  };
  const screenU: Record<string, UniformValue> = {
    u_aspect: 1,
    u_shape: shapeV,
    u_harmA: harmA,
    u_harmP: harmP,
    u_blob: blobV,
    u_pal: pal,
    u_palN: 4,
    u_slab: slabV,
    u_slabOn: 1,
  };

  const refreshShape = () => {
    const c = cfg;
    const squash = c && c.motionSafe ? clamp(squashMv.get(), -0.4, 1.4) : 0;
    shapeV[0] = c && c.motionSafe ? slumpNow : 0;
    shapeV[1] = squash * clamp01(c?.squash ?? 0.6);
    shapeV[2] = hand.x;
    shapeV[3] = hand.y;
    for (let i = 0; i < 4; i += 1) {
      harmA[i] = harm.amp[i] ?? 0;
      harmP[i] = harm.phase[i] ?? 0;
    }
    const aspect = size.w / Math.max(1, size.h);
    simU.u_aspect = aspect;
    screenU.u_aspect = aspect;
  };

  /** Heat put in per second by the hand, and whether it is on the putty. */
  const source = () => {
    const c = cfg;
    if (!c || !hand.present || c.paused) return 0;
    const aspect = size.w / Math.max(1, size.h);
    const on = blobAt(hand.x, hand.y, aspect, slumpNow, 0, harm) < 0.01;
    if (!on) return 0;
    const still = 1 - clamp01((hand.speed - 30) / 420);
    return (
      clamp(c.warmth, 0.2, 2) * (0.25 + 0.75 * still) * (hand.pressed ? 2.6 : 1)
    );
  };

  const coolRate = () => {
    const c = cfg;
    if (!c) return 0.3;
    // Prints that linger cool slowly; `cooling` scales the whole of it.
    return clamp(c.cooling, 0.2, 2) * (0.85 - 0.72 * clamp01(c.handprints));
  };

  const draw = (dt: number) => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c || size.w < 1) return;
    const { gl } = g;
    const fs = fieldSize();
    if (g.field.read.width !== fs.w || g.field.read.height !== fs.h) {
      g.field.dispose();
      g.field = createPingPong(gl, fs.w, fs.h, true);
      clearNext = true;
    }
    // A byte field cannot hold slow cooling: step it coarser so each loss
    // is more than one level.
    const step = g.field.precision === "half" ? STEP : 1 / 15;
    acc += c.paused ? 0 : dt;
    refreshShape();
    texel[0] = 1 / fs.w;
    texel[1] = 1 / fs.h;
    handV[0] = hand.x;
    handV[1] = hand.y;
    handV[2] = source() * 2.4;
    simU.u_dt = step;
    simU.u_handR =
      (clamp(c.hand, 8, 120) / Math.max(1, size.h)) * (hand.pressed ? 1.5 : 1);
    simU.u_cool = coolRate();
    let steps = 0;
    while ((acc >= step || clearNext) && steps < 4) {
      simU.u_clear = clearNext ? 1 : 0;
      g.sim.use();
      g.sim.set(simU);
      g.sim.texture("u_prev", g.field.read.texture, 0);
      g.field.write.bind();
      g.triSim.draw();
      g.field.swap();
      clearNext = false;
      acc = Math.max(0, acc - step);
      steps += 1;
    }
    if (steps >= 4) acc = 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    g.screen.use();
    slabV[0] = slabRGB[0] ?? 0.9;
    slabV[1] = slabRGB[1] ?? 0.9;
    slabV[2] = slabRGB[2] ?? 0.9;
    screenU.u_palN = palN;
    screenU.u_slabOn = c.slab ? 1 : 0;
    g.screen.set(screenU);
    g.screen.texture("u_heat", g.field.read.texture, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    g.triScreen.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** The CPU side of each frame: mean warmth and the slump spring. */
  const think = (dt: number) => {
    const c = cfg;
    if (!c || c.paused) return;
    const put = source();
    // Tracks the field's total roughly: in with the hand, out at a slightly
    // slower rate than the field, so the loop never stops before the colour.
    mean += dt * (put * 0.22 - coolRate() * 0.8 * mean);
    mean = clamp(mean, 0, 1);
    const target = clamp01(c.slump) * clamp01(mean * 1.5);
    // springs.drift's constants, integrated here because its target moves
    // every frame.
    const { stiffness, damping, mass } = springs.drift;
    const a = (stiffness * (target - slumpNow) - damping * slumpVel) / mass;
    slumpVel += a * dt;
    slumpNow += slumpVel * dt;
    const tenth = Math.round(mean * 10) / 10;
    if (tenth !== reported) {
      reported = tenth;
      events.heat(tenth);
    }
  };

  const busy = () => {
    const c = cfg;
    if (!c || c.paused) return false;
    return (
      source() > 0 ||
      mean > 0.003 ||
      Math.abs(slumpVel) > 0.0005 ||
      Math.abs(slumpNow - clamp01(c.slump) * clamp01(mean * 1.5)) > 0.001 ||
      squashMv.isAnimating() ||
      Math.abs(squashMv.get()) > 0.001
    );
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible || document.hidden || !cfg) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : STEP;
    last = now;
    think(dt);
    draw(dt);
    if (busy()) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const n = Math.max(0, kids.length - 1);
    palN = clamp(n, 2, 5);
    for (let i = 0; i < 5; i += 1) {
      const el = kids[Math.min(i, n - 1)];
      if (el) read(getComputedStyle(el).color, pal, i * 3);
    }
    const slabEl = kids[n];
    if (slabEl) read(getComputedStyle(slabEl).color, slabRGB, 0);
  };

  const resize = () => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return;
    size.w = w;
    size.h = h;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    resizeGL(g.gl, canvas, {
      dprCap: cap,
      renderScale: ratio >= 1.5 ? 0.75 : 1,
    });
    draw(0);
  };

  const start = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was || was.seed !== next.seed) harm = harmonics(next.seed);
      if (failed) return;
      if (!gpu) {
        if (!start()) {
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
      draw(0);
      kick();
    },
    setHand(h) {
      Object.assign(hand, h);
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw(0);
    },
    setVisible(on) {
      visible = on;
      if (on) {
        draw(0);
        kick();
      }
    },
    wake() {
      draw(0);
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
      root.removeAttribute("data-live");
    },
  };
}

/* -------------------------------- component ------------------------------- */

const KEY_STEP = 0.06;

/**
 * A soft blob of thermochromic putty resting on a slab. A pointer resting on
 * it warms the spot beneath — a moving hand barely — and a halo of colour
 * spreads outward through the palette as the heat diffuses; the putty
 * softens as it warms, slumping wider and lower on the drift spring's
 * constants. Moving away lets it cool, fastest where it is thin, so the
 * colour draws back from its edges inward and a rested hand leaves a print
 * that fades for a while. A press squashes it on the snap spring and lets it
 * go on recoil, with a palm-sized print.
 *
 * Heat lives in a small WebGL2 field that diffuses and cools, shaded into a
 * matte domed body with a contact shadow; without WebGL2 a drawn blob
 * stands in. The putty is a button: focus puts a hand on it, arrow keys
 * move the hand, Space or Enter held presses. Under reduced motion it never
 * slumps or squashes; the colour still spreads and cools.
 */
export function HeatPutty({
  warmth = 1,
  cooling = 1,
  palette = "sunset",
  handprints = 0.6,
  slump = 0.5,
  squash = 0.6,
  hand = 30,
  seed = 7,
  slab = true,
  interactive = true,
  paused = false,
  dpr = 2,
  onHeatChange,
  label = "Thermochromic putty",
  disabled = false,
  className,
}: HeatPuttyProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const colours = (
    Array.isArray(palette) ? palette : (PALETTES[palette] ?? PALETTES.sunset)
  ).slice(0, 5);
  const stops = colours.length >= 2 ? colours : PALETTES.sunset;
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const [ring, setRing] = React.useState(false);

  const rootRef = React.useRef<HTMLButtonElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visibleRef = React.useRef(false);
  const squashMv = useMotionValue(0);
  const squashRun = React.useRef<AnimationPlaybackControls | null>(null);
  const ringX = useMotionValue(0);
  const ringY = useMotionValue(0);
  const keyHand = React.useRef({ x: 0.5, y: 0.5, on: false });
  const lastMove = React.useRef({ x: 0, y: 0, t: 0 });
  const stillTimer = React.useRef(0);
  const tapTimer = React.useRef(0);
  const lastKey = React.useRef(0);
  const level = React.useRef<"cool" | "warm" | "hot">("cool");

  const live = interactive && !disabled;
  const config: Config = {
    warmth,
    cooling,
    handprints,
    slump,
    squash,
    hand,
    seed,
    slab,
    paused,
    dpr,
    motionSafe,
    colorKey: stops.join("|"),
  };
  const latest = React.useRef(config);
  const handlers = React.useRef<Events>({ heat: () => {} });

  React.useEffect(() => {
    latest.current = config;
    engine.current?.configure(config);
    handlers.current = {
      heat: (mean) => {
        onHeatChange?.(mean);
        const was = level.current;
        // With a little hysteresis, so a reading near a line is not chatter.
        let now = was;
        if (mean >= 0.7) now = "hot";
        else if (mean >= 0.35 && !(was === "hot" && mean > 0.6)) now = "warm";
        else if (mean < 0.08) now = "cool";
        if (now === was) return;
        level.current = now;
        setSaid((s) => ({
          n: s.n + 1,
          text: now === "hot" ? "Hot." : now === "warm" ? "Warm." : "Cooled.",
        }));
      },
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, squashMv, {
      heat: (m) => handlers.current.heat(m),
    });
    engine.current = e;
    e.configure(latest.current);
    e.setVisible(visibleRef.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, [squashMv]);

  // A squash wakes the loop, so the springs are drawn as they move.
  React.useEffect(
    () => squashMv.on("change", () => engine.current?.wake()),
    [squashMv],
  );

  React.useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden) engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(
    () => () => {
      window.clearTimeout(stillTimer.current);
      window.clearTimeout(tapTimer.current);
      squashRun.current?.stop();
    },
    [],
  );

  const bindRoot = React.useCallback((node: HTMLButtonElement | null) => {
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

  // The theme or the palette changed the carriers' colours: read them again.
  const repaint = React.useRef(0);
  const onColours = () => {
    if (repaint.current) return;
    repaint.current = window.requestAnimationFrame(() => {
      repaint.current = 0;
      engine.current?.readColours();
    });
  };
  React.useEffect(
    () => () => {
      if (repaint.current) window.cancelAnimationFrame(repaint.current);
    },
    [],
  );

  /* --------------------------------- hands --------------------------------- */

  const press = (on: boolean) => {
    squashRun.current?.stop();
    engine.current?.setHand({ pressed: on });
    if (!motionSafe) {
      squashMv.jump(0);
      return;
    }
    // In quickly, as a hand would; let go, it springs back with two wobbles.
    squashRun.current = animate(
      squashMv,
      on ? 1 : 0,
      on ? springs.snap : springs.recoil,
    );
  };

  const placeKeyHand = () => {
    const el = rootRef.current;
    if (!el) return;
    const k = keyHand.current;
    ringX.set(Math.round(k.x * el.clientWidth));
    ringY.set(Math.round(k.y * el.clientHeight));
    engine.current?.setHand({ x: k.x, y: k.y, present: true, speed: 0 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!live) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const r = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    const prev = lastMove.current;
    const dt = Math.max(8, event.timeStamp - prev.t);
    const speed = prev.t ? (Math.hypot(x - prev.x, y - prev.y) / dt) * 1000 : 0;
    lastMove.current = { x, y, t: event.timeStamp };
    keyHand.current.on = false;
    setRing(false);
    engine.current?.setHand({
      x: x / Math.max(1, r.width),
      y: y / Math.max(1, r.height),
      present: true,
      speed: Math.min(speed, 3000),
    });
    // The speed decays to rest when the hand stops, so a resting hand warms.
    window.clearTimeout(stillTimer.current);
    stillTimer.current = window.setTimeout(
      () => engine.current?.setHand({ speed: 0 }),
      90,
    );
  };

  const leave = () => {
    window.clearTimeout(stillTimer.current);
    lastMove.current = { x: 0, y: 0, t: 0 };
    if (keyHand.current.on) return;
    engine.current?.setHand({ present: false, pressed: false });
    if (squashMv.get() !== 0) press(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!live) return;
    const k = keyHand.current;
    const el = rootRef.current;
    const aspect = el ? el.clientWidth / Math.max(1, el.clientHeight) : 1;
    const by = event.shiftKey ? KEY_STEP * 2.5 : KEY_STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by / aspect, 0],
      ArrowRight: [by / aspect, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      lastKey.current = event.timeStamp;
      k.on = true;
      k.x = clamp(k.x + move[0], 0.08, 0.92);
      k.y = clamp(k.y + move[1], 0.1, 0.9);
      setRing(true);
      placeKeyHand();
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      lastKey.current = event.timeStamp;
      if (event.repeat) return;
      k.on = true;
      setRing(true);
      placeKeyHand();
      press(true);
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    lastKey.current = event.timeStamp;
    press(false);
  };

  return (
    <button
      ref={bindRoot}
      type="button"
      aria-label={label}
      aria-describedby={hintId}
      disabled={disabled}
      onPointerDown={(event) => {
        if (!live) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        onPointerMove(event);
        press(true);
        const id = event.pointerId;
        const up = (e: PointerEvent) => {
          if (e.pointerId !== id) return;
          window.removeEventListener("pointerup", up);
          window.removeEventListener("pointercancel", up);
          press(false);
          if (e.pointerType !== "mouse") leave();
        };
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
      }}
      onPointerMove={onPointerMove}
      onPointerLeave={(event) => {
        if (event.pointerType === "touch") return;
        leave();
      }}
      onFocus={(event) => {
        if (!live || !event.currentTarget.matches(":focus-visible")) return;
        keyHand.current.on = true;
        setRing(true);
        placeKeyHand();
      }}
      onBlur={() => {
        keyHand.current.on = false;
        setRing(false);
        leave();
      }}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onClick={(event) => {
        // A click with no pointer or key behind it — assistive technology —
        // presses for a moment.
        if (event.detail !== 0 || !live) return;
        if (event.timeStamp - lastKey.current < 500) return;
        keyHand.current.on = true;
        placeKeyHand();
        press(true);
        window.clearTimeout(tapTimer.current);
        tapTimer.current = window.setTimeout(() => press(false), 320);
      }}
      className={cn(
        "group/heat-putty relative isolate block h-56 w-full touch-none overflow-clip rounded-3 text-left select-none",
        slab ? "bg-surface-2" : "bg-transparent",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        live ? "cursor-pointer" : "cursor-default",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      {/* The stand-in: the server's frame, and the whole picture without WebGL2. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-[52%] left-1/2 block aspect-[1.05/1] h-[66%] -translate-x-1/2 -translate-y-1/2 group-data-live/heat-putty:hidden"
        style={{
          borderRadius: "48% 52% 46% 54% / 56% 52% 48% 44%",
          backgroundColor: stops[0],
          backgroundImage: `radial-gradient(circle at 36% 30%, color-mix(in oklab, ${stops[1] ?? stops[0]} 70%, white) 0%, transparent 46%), radial-gradient(circle at 60% 72%, color-mix(in oklab, ${stops[0]} 70%, black) 0%, transparent 60%)`,
          boxShadow: "0 10px 18px -6px oklch(0 0 0 / 0.35)",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/heat-putty:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {stops.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
        <span className="text-surface-2 transition-colors duration-1" />
      </span>
      {/* The keyboard's hand. */}
      <motion.span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 left-0 z-10 block rounded-full border-2 border-white/80 shadow-[0_0_0_1px_oklch(0_0_0/0.25)] transition-opacity duration-150",
          ring ? "opacity-100" : "opacity-0",
        )}
        style={{
          x: ringX,
          y: ringY,
          width: Math.round(hand * 2),
          height: Math.round(hand * 2),
          marginLeft: -Math.round(hand),
          marginTop: -Math.round(hand),
        }}
      />
      <span id={hintId} className="sr-only">
        Rest a finger on the putty to warm it; press to squash it. Arrow keys
        move your hand, hold Space or Enter to press.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </button>
  );
}
