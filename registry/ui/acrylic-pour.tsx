"use client";

import * as React from "react";

import {
  animate,
  motion,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound, type LoopHandle } from "@/registry/lib/tactile-sound";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createPingPong,
  createProgram,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type PingPong,
  type Program,
} from "@/registry/lib/glsl";
import { cn } from "@/registry/lib/utils";

export type AcrylicPourPalette = "tide" | "ember" | "moss" | "dusk";

export type AcrylicPourProps = {
  /** The composition (controlled). A new seed pours a new one over the old. */
  seed?: number;
  /** The composition to begin with when uncontrolled. @default 1 */
  defaultSeed?: number;
  /** Fires from the tap or key that asked for a new pour, with its seed. */
  onSeedChange?: (seed: number) => void;
  /** How much the lighter layer breaks through as lacy cells, 0 (none) to 1 (open lace). @default 0.55 */
  cells?: number;
  /** How far a drag tips the canvas and how freely the paint runs, 0 to 1. @default 0.6 */
  tilt?: number;
  /** The paints: a named set, or up to five CSS colours. @default "tide" */
  palette?: AcrylicPourPalette | string[];
  /** How many cups were poured, 2 to 7. @default 4 */
  pours?: number;
  /** How thick the paint is, 0 (runny, flows far) to 1 (heavy, creeps). @default 0.5 */
  viscosity?: number;
  /** How glossy the wet paint looks, 0 to 1. @default 0.6 */
  gloss?: number;
  /** The lighter layer that shows through the cells, any CSS colour. @default titanium white */
  base?: string;
  /** Play the paint's pour while it runs. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when the paint starts and stops flowing. */
  onFlowChange?: (flowing: boolean) => void;
  /** Names the canvas for assistive technology. @default "Acrylic pour" */
  label?: string;
  /** Shows the pour but takes no input. @default false */
  disabled?: boolean;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Sizes the component; give it a height. The canvas is the largest square inside. @default "h-52 w-full" */
  className?: string;
};

/* --------------------------------- helpers -------------------------------- */

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

const pigment = (token: string, l: number, c: number, turn = 0) =>
  `oklch(from var(${token}) ${l} ${c} calc(h + ${turn}))`;

const PALETTES: Record<AcrylicPourPalette, string[]> = {
  tide: [
    pigment("--accent", 0.3, 0.08),
    pigment("--signal", 0.56, 0.09, 20),
    pigment("--signal", 0.84, 0.05, 10),
    pigment("--warn", 0.86, 0.05),
    pigment("--accent", 0.52, 0.15),
  ],
  ember: [
    pigment("--danger", 0.36, 0.11),
    pigment("--danger", 0.6, 0.18, 8),
    pigment("--warn", 0.78, 0.14, -6),
    pigment("--warn", 0.92, 0.04),
    pigment("--warn", 0.42, 0.07, -24),
  ],
  moss: [
    pigment("--success", 0.36, 0.07),
    pigment("--success", 0.66, 0.07, 10),
    pigment("--warn", 0.72, 0.12),
    pigment("--warn", 0.93, 0.02),
    pigment("--accent", 0.42, 0.04),
  ],
  dusk: [
    pigment("--danger", 0.34, 0.09, -40),
    pigment("--danger", 0.62, 0.09, -40),
    pigment("--warn", 0.82, 0.08, -30),
    pigment("--accent", 0.7, 0.1),
    pigment("--accent", 0.25, 0.05),
  ],
};

const PALETTE_NAMES: Record<AcrylicPourPalette, string> = {
  tide: "tide blues",
  ember: "ember reds",
  moss: "moss greens",
  dusk: "dusk plums",
};

const DEFAULT_BASE = pigment("--warn", 0.97, 0.012);

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Pour = { x: number; y: number; r: number; band: number };

/**
 * A seeded composition: one flood that covers the canvas, then cups tipped
 * at points spread over it, each leaving rings of its own width. Rounded so
 * the server's still and the client's agree.
 */
function composition(seed: number, count: number): Pour[] {
  const rnd = lcg(seed * 7919 + 13);
  const n = clamp(Math.round(count), 2, 7);
  const out: Pour[] = [
    {
      x: r3(0.2 + rnd() * 0.6),
      y: r3(0.2 + rnd() * 0.6),
      r: 3,
      band: r3(0.09 + rnd() * 0.06),
    },
  ];
  for (let k = 1; k < n; k += 1) {
    const a = rnd() * Math.PI * 2;
    const d = 0.08 + rnd() * 0.26;
    out.push({
      x: r3(0.5 + Math.cos(a) * d),
      y: r3(0.5 + Math.sin(a) * d),
      r: r3(0.16 + rnd() * 0.24 - k * 0.012),
      band: r3(0.024 + rnd() * 0.034),
    });
  }
  return out;
}

/** The still pour in CSS: rings as radial gradients, a few cells on top. */
function stillArt(
  seed: number,
  count: number,
  colours: string[],
  base: string,
) {
  const pours = composition(seed, count);
  const pal = (i: number) => colours[((i % 5) + 5) % 5] ?? colours[0] ?? "gray";
  const layers: string[] = [];
  const rnd = lcg(seed * 31 + 5);
  for (let i = 0; i < 12; i += 1) {
    const x = r2(12 + rnd() * 76);
    const y = r2(12 + rnd() * 76);
    const s = r2(0.8 + rnd() * 1.8);
    layers.push(
      `radial-gradient(circle at ${x}% ${y}%, ${base} 0 ${s}%, color-mix(in oklab, ${pal(i)} 70%, black) ${r2(s + 0.5)}%, transparent ${r2(s + 1)}%)`,
    );
  }
  for (let k = pours.length - 1; k >= 1; k -= 1) {
    const p = pours[k];
    if (!p) continue;
    const bands = Math.max(2, Math.floor(p.r / p.band));
    const stops: string[] = [];
    for (let b = 0; b < bands; b += 1) {
      const c = pal(b + k * 2);
      stops.push(
        `${c} ${r2((b / bands) * 100)}% ${r2(((b + 1) / bands) * 100)}%`,
      );
    }
    const R = r2(p.r * 100);
    layers.push(
      `radial-gradient(${R}% ${R}% at ${r2(p.x * 100)}% ${r2(p.y * 100)}%, ${stops.join(", ")}, transparent 100%)`,
    );
  }
  const ground = pours[0];
  if (ground) {
    const w = r2(ground.band * 100);
    layers.push(
      `repeating-radial-gradient(circle at ${r2(ground.x * 100)}% ${r2(ground.y * 100)}%, ${pal(0)} 0 ${w}%, ${pal(1)} ${w}% ${r2(w * 2)}%, ${pal(4)} ${r2(w * 2)}% ${r2(w * 3)}%)`,
    );
  }
  return layers.join(", ");
}

/** Resolves any CSS colour to sRGB 0–1 through a 1px canvas. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = (d[0] ?? 0) / 255;
    out[at + 1] = (d[1] ?? 0) / 255;
    out[at + 2] = (d[2] ?? 0) / 255;
  };
}

/* --------------------------------- shaders -------------------------------- */

/** Offsets in uv; a byte field stores them in ±RANGE around one half. */
const CODEC = /* glsl */ `
uniform float u_bytes;
const float RANGE = 0.6;
vec2 dec(vec4 t) { return u_bytes > 0.5 ? (t.rg - 0.5) * 2.0 * RANGE : t.rg; }
vec4 enc(vec2 d) { return u_bytes > 0.5 ? vec4(clamp(d / (2.0 * RANGE) + 0.5, 0.0, 1.0), 0.0, 1.0) : vec4(d, 0.0, 1.0); }
`;

/**
 * One step of the flow. The field says where the paint at each point came
 * from; gravity along the tilt carries it on. Mobility is read from the paint
 * itself, so neighbouring colours run at different speeds and the film
 * shears, and paint that has run far is thin and slows to a stop.
 */
const ADVECT = /* glsl */ `
uniform sampler2D u_field;
uniform vec2 u_tilt;
uniform float u_dt;
uniform float u_speed;
uniform float u_seed;
in vec2 v_uv;
out vec4 o_color;
${CODEC}
${GLSL_NOISE}
void main() {
  vec2 uv = v_uv;
  vec2 D = dec(texture(u_field, uv));
  vec2 src = uv + D;
  float mob = 0.3 + 1.2 * kx_fbm(src * 3.0 + u_seed);
  float thin = exp(-length(D) * 3.2);
  vec2 side = vec2(-u_tilt.y, u_tilt.x);
  float lace = kx_noise(src * 9.0 - u_seed) - 0.5;
  vec2 v = (u_tilt * mob + side * lace * 0.6) * thin * u_speed;
  vec2 back = uv - v * u_dt;
  vec2 Db = dec(texture(u_field, back));
  o_color = enc(Db + back - uv);
}
`;

const SCREEN = /* glsl */ `
uniform sampler2D u_field;
uniform sampler2D u_snap;
uniform vec3 u_pal[5];
uniform vec4 u_pours[7];
uniform float u_count;
uniform float u_flood;
uniform float u_fade;
uniform float u_cells;
uniform float u_gloss;
uniform vec2 u_tilt;
uniform vec3 u_base;
uniform float u_seed;
uniform vec2 u_texel;
uniform float u_bump;
in vec2 v_uv;
out vec4 o_color;
${CODEC}
${GLSL_NOISE}

vec2 h2(vec2 p) {
  return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

vec3 pal(float i) { return u_pal[int(mod(i, 5.0))]; }

/**
 * The paint at q: every pour from the first to the last, each laid over the
 * ones before it with a soft wet edge. Its band colour, how domed the band is
 * there, and how much of q any pour covers yet (a new pour floods in).
 */
vec3 pourAt(vec2 q, out float height, out float cover) {
  vec3 col = u_pal[0];
  height = 0.5;
  cover = 0.0;
  for (int k = 0; k < 7; k += 1) {
    float fk = float(k);
    if (fk >= u_count) break;
    vec4 p = u_pours[k];
    float g = clamp((u_flood - fk * 0.1) / 0.5, 0.0, 1.0);
    g = 1.0 - pow(1.0 - g, 3.0);
    float wob = (kx_noise(q * 6.0 + fk * 3.1 + u_seed) - 0.5) * 0.06
      + (kx_noise(q * 21.0 + fk) - 0.5) * 0.014;
    float d = length(q - p.xy) + wob;
    // The flood under everything grows to cover the canvas, not its full reach.
    float reach = (k == 0 ? 1.45 : p.z) * g;
    float a = smoothstep(reach, reach - 0.006, d);
    if (a <= 0.0) continue;
    float band = d / p.w;
    float f = fract(band);
    float idx = floor(band) + fk * 2.0;
    // Wet bands bleed a little into each other at their edges.
    vec3 c = mix(pal(idx - 1.0), pal(idx), smoothstep(0.0, 0.16, f));
    col = mix(col, c, a);
    height = mix(height, 0.35 + 0.65 * sin(f * 3.14159), a);
    cover = max(cover, a);
  }
  return col;
}

/** Cells: seeded holes in the film, each with its own size; 1 inside, with a darker rim around. */
float cellsAt(vec2 q, float scale, float open, float salt, out float rim) {
  vec2 p = q * scale;
  vec2 i = floor(p);
  vec2 f = fract(p);
  float best = 9.0;
  for (int y = -1; y <= 1; y += 1) {
    for (int x = -1; x <= 1; x += 1) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = h2(i + g + salt);
      float r = mix(0.1, 0.44, fract(o.x * 7.3 + o.y * 3.1)) * open;
      float d = length(g + o - f) / max(r, 0.001);
      best = min(best, d);
    }
  }
  rim = smoothstep(1.45, 1.0, best) * smoothstep(0.7, 1.0, best);
  return smoothstep(1.0, 0.82, best);
}

vec2 field(vec2 uv) { return dec(texture(u_field, uv)); }

void main() {
  vec2 uv = v_uv;
  vec2 D = field(uv);
  vec2 q = uv + D;
  float h;
  float cover;
  vec3 col = pourAt(q, h, cover);

  // Stretch: how far the map pulls neighbours apart. Where the film is
  // stretched it is thin, and the lighter layer opens through it.
  vec2 ex = vec2(u_texel.x, 0.0);
  vec2 ey = vec2(0.0, u_texel.y);
  vec2 dx = (field(uv + ex) - field(uv - ex)) / (2.0 * u_texel.x);
  vec2 dy = (field(uv + ey) - field(uv - ey)) / (2.0 * u_texel.y);
  float stretch = clamp(length(dx) + length(dy), 0.0, 1.6);
  float open = min(1.2, u_cells * (0.26 + 1.2 * stretch + 0.5 * length(D)));
  float rimA;
  float rimB;
  float cellA = cellsAt(q, 9.0, open, u_seed, rimA);
  float cellB = cellsAt(q, 22.0, open * 0.8, u_seed + 17.0, rimB);
  float salt = kx_hash(floor(q * 9.0) + u_seed);
  vec3 lighter = mix(u_base, col, 0.12 + 0.18 * salt);
  vec3 rimCol = col * 0.6;
  col = mix(col, rimCol, max(rimA, rimB * 0.8) * step(0.001, u_cells));
  col = mix(col, lighter, max(cellA, cellB));
  h = h * 0.6 - max(cellA, cellB) * 0.35 + max(rimA, rimB) * 0.25;

  // Gloss: a bump from the bands and cells, a sharp highlight, and a broad
  // softbox reflection that slides across the wet paint as the canvas tilts.
  vec3 n = normalize(vec3(-dFdx(h) * u_bump, -dFdy(h) * u_bump, 1.0));
  vec3 L = normalize(vec3(-0.45 + u_tilt.x * 0.6, -0.6 + u_tilt.y * 0.6, 0.7));
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float lit = 0.9 + 0.1 * dot(n, L);
  float spec = pow(max(dot(n, H), 0.0), 56.0) * 0.4 * u_gloss;
  float sweep = uv.x * 0.62 + uv.y * 0.78 - 0.5 + u_tilt.x * 0.45 + u_tilt.y * 0.55 + n.x * 0.06 + n.y * 0.06;
  float softbox = exp(-pow(sweep / 0.1, 2.0)) * 0.16 * u_gloss;
  vec3 paint = col * lit + vec3(spec + softbox);

  vec3 old = texture(u_snap, uv).rgb;
  vec3 outc = mix(old, paint, cover);
  outc = mix(old, outc, u_fade);
  o_color = vec4(clamp(outc, 0.0, 1.0), 1.0);
}
`;

/* --------------------------------- engine --------------------------------- */

type Config = {
  seed: number;
  pours: number;
  cells: number;
  tilt: number;
  viscosity: number;
  gloss: number;
  motionSafe: boolean;
  dpr: number;
  colourKey: string;
};

type Gpu = {
  gl: GLContext;
  advect: Program;
  screen: Program;
  triAdvect: FullscreenTriangle;
  triScreen: FullscreenTriangle;
  field: PingPong;
  snap: PingPong;
  bytes: boolean;
  lost: boolean;
};

type Engine = {
  configure: (cfg: Config) => void;
  /** Pours a new composition over the current one. */
  pour: (seed: number) => void;
  readColours: () => void;
  resize: () => void;
  setVisible: (on: boolean) => void;
  wake: () => void;
  dispose: () => void;
};

const FIELD = 128;

function createEngine(
  root: HTMLElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  tiltX: MotionValue<number>,
  tiltY: MotionValue<number>,
  onFlow: (flow: number) => void,
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let visible = false;
  let frame = 0;
  let last = 0;
  let seedShown = Number.NaN;
  let flood = 1;
  let fade = 1;
  let flowing = 0;
  const pal = new Float32Array(15);
  const base = new Float32Array(3);
  const pours = new Float32Array(28);
  const read = rgbReader();

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const advect = createProgram(gl, FULLSCREEN_VERTEX, ADVECT);
    const screen = createProgram(gl, FULLSCREEN_VERTEX, SCREEN);
    if (!advect || !screen) return false;
    const field = createPingPong(gl, FIELD, FIELD, true);
    const snap = createPingPong(gl, 8, 8, false);
    gpu = {
      gl,
      advect,
      screen,
      triAdvect: createFullscreenTriangle(gl, advect),
      triScreen: createFullscreenTriangle(gl, screen),
      field,
      snap,
      bytes: field.precision === "byte",
      lost: false,
    };
    return true;
  };

  const releaseGpu = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.triAdvect.dispose();
    g.triScreen.dispose();
    g.advect.dispose();
    g.screen.dispose();
    g.field.dispose();
    g.snap.dispose();
  };

  const clearField = () => {
    const g = gpu;
    if (!g || g.lost) return;
    const v = g.bytes ? 0.5 : 0;
    for (const f of [g.field.read, g.field.write]) {
      f.bind();
      g.gl.clearColor(v, v, 0, 1);
      g.gl.clear(g.gl.COLOR_BUFFER_BIT);
    }
  };

  const setComposition = (seed: number) => {
    const c = cfg;
    const list = composition(seed, c?.pours ?? 4);
    pours.fill(0);
    list.forEach((p, k) => {
      pours[k * 4] = p.x;
      pours[k * 4 + 1] = p.y;
      pours[k * 4 + 2] = p.r;
      pours[k * 4 + 3] = p.band;
    });
    seedShown = seed;
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 5; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, pal, i * 3);
    }
    const b = kids[5];
    if (b) read(getComputedStyle(b).color, base, 0);
  };

  const screenUniforms = (into: "screen" | "snap") => {
    const g = gpu;
    const c = cfg;
    if (!g || !c) return;
    g.screen.use();
    g.screen.set({
      u_pal: pal,
      u_pours: pours,
      u_count: clamp(Math.round(c.pours), 2, 7),
      u_flood: into === "snap" ? 1 : flood,
      u_fade: into === "snap" ? 1 : fade,
      u_cells: clamp(c.cells, 0, 1),
      u_gloss: clamp(c.gloss, 0, 1),
      u_tilt: [tiltX.get(), tiltY.get()],
      u_base: base,
      u_seed: (seedShown % 97) * 1.37,
      u_texel: [1 / FIELD, 1 / FIELD],
      u_bump: Math.max(2, canvas.width / 90),
      u_bytes: g.bytes ? 1 : 0,
    });
    g.screen.texture("u_field", g.field.read.texture, 0);
    g.screen.texture("u_snap", g.snap.read.texture, 1);
  };

  const draw = () => {
    const g = gpu;
    if (!g || g.lost || !cfg || canvas.width < 2) return;
    const { gl } = g;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    screenUniforms("screen");
    g.triScreen.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** The picture on screen now, kept so a new pour can flood over it. */
  const snapshot = () => {
    const g = gpu;
    if (!g || g.lost || canvas.width < 2) return;
    if (
      g.snap.read.width !== canvas.width ||
      g.snap.read.height !== canvas.height
    ) {
      g.snap.dispose();
      g.snap = createPingPong(g.gl, canvas.width, canvas.height, false);
    }
    // Render into the write side while the program samples the read side,
    // so the texture being written is never also being read.
    screenUniforms("snap");
    g.snap.write.bind();
    g.triScreen.draw();
    g.snap.swap();
  };

  const advect = (dt: number) => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c) return;
    const tx = tiltX.get();
    const ty = tiltY.get();
    if (Math.abs(tx) + Math.abs(ty) < 0.002) return;
    g.advect.use();
    g.advect.set({
      u_tilt: [tx, ty],
      u_dt: dt,
      u_speed:
        (0.34 - 0.24 * clamp(c.viscosity, 0, 1)) *
        (0.5 + 0.9 * clamp(c.tilt, 0, 1)),
      u_seed: (seedShown % 97) * 1.37,
      u_bytes: g.bytes ? 1 : 0,
    });
    g.advect.texture("u_field", g.field.read.texture, 0);
    g.field.write.bind();
    g.triAdvect.draw();
    g.field.swap();
  };

  const busy = () =>
    flood < 1 ||
    fade < 1 ||
    Math.abs(tiltX.get()) + Math.abs(tiltY.get()) > 0.002;

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible || document.hidden || !c || !gpu || gpu.lost) {
      last = 0;
      // Off screen or hidden: nothing flows, so nothing is heard.
      if (flowing !== 0) {
        flowing = 0;
        onFlow(0);
      }
      return;
    }
    const dt = last ? Math.min(1 / 20, (now - last) / 1000) : 1 / 60;
    last = now;
    advect(dt);
    if (flood < 1) flood = Math.min(1, flood + dt / 1.1);
    if (fade < 1) fade = Math.min(1, fade + dt / 0.24);
    draw();
    const flow = Math.min(
      1,
      Math.hypot(tiltX.get(), tiltY.get()) + (flood < 1 ? 0.6 : 0),
    );
    if (Math.abs(flow - flowing) > 0.01 || (flow === 0) !== (flowing === 0)) {
      flowing = flow;
      onFlow(flow);
    }
    if (busy()) frame = window.requestAnimationFrame(tick);
    else {
      last = 0;
      if (flowing !== 0) {
        flowing = 0;
        onFlow(0);
      }
    }
  };

  const kick = () => {
    if (disposed || frame || !visible || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const g = gpu;
    const c = cfg;
    if (!g || g.lost || !c) return;
    if (canvas.clientWidth < 2 || canvas.clientHeight < 2) return;
    resizeGL(g.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
    draw();
  };

  const start = () => {
    if (!build()) return false;
    readColours();
    setComposition(cfg?.seed ?? 1);
    clearField();
    flood = 1;
    fade = 1;
    resize();
    return true;
  };

  let detach: () => void = () => {};
  const unsubX = tiltX.on("change", kick);
  const unsubY = tiltY.on("change", kick);

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
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
        return;
      }
      if (was && was.colourKey !== next.colourKey) readColours();
      if (was && was.pours !== next.pours) setComposition(seedShown);
      if (was && was.dpr !== next.dpr) resize();
      draw();
    },
    pour(seed) {
      const c = cfg;
      if (!gpu || gpu.lost || !c) {
        seedShown = seed;
        return;
      }
      if (seed === seedShown) return;
      snapshot();
      setComposition(seed);
      clearField();
      if (c.motionSafe) {
        flood = 0;
        fade = 1;
      } else {
        flood = 1;
        fade = 0;
      }
      draw();
      kick();
    },
    readColours() {
      readColours();
      draw();
    },
    resize,
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
      unsubX();
      unsubY();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      releaseGpu();
      root.removeAttribute("data-live");
    },
  };
}

/* -------------------------------- component -------------------------------- */

const KEY_TILT = 0.45;

/**
 * A small canvas with cups of glossy acrylic poured onto it. Drag to tilt it:
 * the canvas tips under the hand 1:1 and the paint runs downhill, thinning
 * and stretching, each colour at its own pace so the rings shear and drift,
 * and where the film thins the lighter layer underneath opens through it in
 * lacy cells. Let go and the canvas settles level on the drift spring with
 * the throw's velocity; the paint stays where it ran. A tap pours a new
 * seeded composition: the cups flood out over the old one, one after
 * another.
 *
 * The paint is a flow map in WebGL2, advected each frame by gravity along the
 * tilt and sampled once by a screen pass that finds the composition, the
 * cells and the gloss. The canvas is focusable: arrow keys tilt it gently
 * while held, Enter or Space pours anew. Under reduced motion the canvas does
 * not tip (the paint still follows the hand) and a new pour cross-fades.
 * Without WebGL2 a still pour is drawn in CSS.
 */
export function AcrylicPour({
  seed,
  defaultSeed = 1,
  onSeedChange,
  cells = 0.55,
  tilt = 0.6,
  palette = "tide",
  pours = 4,
  viscosity = 0.5,
  gloss = 0.6,
  base = DEFAULT_BASE,
  sound = false,
  onFlowChange,
  label = "Acrylic pour",
  disabled = false,
  dpr = 2,
  className,
}: AcrylicPourProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const uid = React.useId();
  const [own, setOwn] = React.useState(defaultSeed);
  const current = Math.round(seed ?? own);
  const colours = (
    Array.isArray(palette)
      ? palette.length > 0
        ? palette
        : PALETTES.tide
      : (PALETTES[palette] ?? PALETTES.tide)
  ).slice(0, 5);
  while (colours.length < 5)
    colours.push(colours[colours.length % 2] ?? "gray");
  const paletteName = Array.isArray(palette)
    ? "custom colours"
    : (PALETTE_NAMES[palette] ?? PALETTE_NAMES.tide);
  const colourKey = `${colours.join("|")}|${base}`;
  const count = clamp(Math.round(pours), 2, 7);

  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const maxDeg = 4 + 6 * clamp(tilt, 0, 1);
  const rotateY = useTransform(tiltX, (t) => (motionSafe ? r2(t * maxDeg) : 0));
  const rotateX = useTransform(tiltY, (t) =>
    motionSafe ? r2(-t * maxDeg) : 0,
  );
  const shadow = useTransform(
    [tiltX, tiltY] as MotionValue<number>[],
    ([x, y]) => {
      const tx = motionSafe ? (x as number) : 0;
      const ty = motionSafe ? (y as number) : 0;
      return `${r2(-tx * 6)}px ${r2(8 - ty * 6)}px 22px color-mix(in oklab, black 26%, transparent), 0 1px 2px color-mix(in oklab, black 20%, transparent)`;
    },
  );

  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const say = (text: string) => setSaid((s) => ({ n: s.n + 1, text }));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const running = React.useRef<AnimationPlaybackControls[]>([]);
  const loopRef = React.useRef<LoopHandle | null>(null);
  const keys = React.useRef(new Set<string>());
  const dragSize = React.useRef(200);
  const wasFlowing = React.useRef(false);

  const config: Config = {
    seed: current,
    pours: count,
    cells,
    tilt,
    viscosity,
    gloss,
    motionSafe,
    dpr,
    colourKey,
  };
  const latest = React.useRef({ config, sound, audio, onFlowChange });
  React.useEffect(() => {
    latest.current = { config, sound, audio, onFlowChange };
    engine.current?.configure(config);
  });

  /** The pour sound follows the flow, and only ever answers the visitor. */
  const onFlow = React.useCallback((flow: number) => {
    const L = latest.current;
    const flowingNow = flow > 0.02;
    if (flowingNow !== wasFlowing.current) {
      wasFlowing.current = flowingNow;
      L.onFlowChange?.(flowingNow);
    }
    const active =
      typeof navigator === "undefined" ||
      (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
        .userActivation?.hasBeenActive !== false;
    if (!flowingNow || !L.sound || !active) {
      loopRef.current?.stop();
      loopRef.current = null;
      return;
    }
    const opts = { gain: r2(0.2 + 0.5 * flow), pitch: r2(0.75 + 0.5 * flow) };
    if (!loopRef.current) loopRef.current = L.audio.start("pour", opts);
    else loopRef.current.set(opts);
  }, []);

  React.useEffect(() => {
    if (sound) return;
    loopRef.current?.stop();
    loopRef.current = null;
  }, [sound]);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, tiltX, tiltY, onFlow);
    engine.current = e;
    e.configure(latest.current.config);
    const sizer = new ResizeObserver(() => e.resize());
    sizer.observe(canvas);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      e.setVisible(Boolean(entry?.isIntersecting));
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) e.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      e.dispose();
      if (engine.current === e) engine.current = null;
      loopRef.current?.stop();
      loopRef.current = null;
    };
  }, [tiltX, tiltY, onFlow]);

  // Any new seed, from a tap or from the host, floods in over the old pour.
  React.useEffect(() => {
    engine.current?.pour(current);
  }, [current]);

  React.useEffect(
    () => () => {
      for (const c of running.current) c.stop();
      running.current = [];
    },
    [],
  );

  const settleTilt = (x: number, y: number, vx = 0, vy = 0) => {
    for (const c of running.current) c.stop();
    if (!motionSafe) {
      tiltX.set(x);
      tiltY.set(y);
      running.current = [];
      return;
    }
    running.current = [
      animate(tiltX, x, { ...springs.drift, velocity: vx }),
      animate(tiltY, y, { ...springs.drift, velocity: vy }),
    ];
  };

  const pourNew = () => {
    if (disabled) return;
    const next = current + 1;
    if (seed === undefined) setOwn(next);
    onSeedChange?.(next);
    // The flood itself is heard through the flow: the pour loop runs while
    // the new cups spread, and stops when they have.
    say(`New pour, number ${next}.`);
  };

  const drag = useDrag({
    threshold: 4,
    disabled,
    onStart: () => {
      for (const c of running.current) c.stop();
      running.current = [];
      const r = canvasRef.current?.getBoundingClientRect();
      dragSize.current = Math.max(60, r ? r.width : 200);
    },
    onMove: ({ offset }) => {
      // The canvas tips 1:1 under the hand: half its width of travel is a
      // full tilt, scaled by the sensitivity.
      const k = (0.5 + 0.9 * clamp(tilt, 0, 1)) / (dragSize.current * 0.5);
      tiltX.set(r3(clamp(offset.x * k, -1, 1)));
      tiltY.set(r3(clamp(offset.y * k, -1, 1)));
    },
    onEnd: ({ velocity }) => {
      const k = (0.5 + 0.9 * clamp(tilt, 0, 1)) / (dragSize.current * 0.5);
      settleTilt(0, 0, velocity.x * k, velocity.y * k);
      if (motionSafe) say("Level.");
    },
    onCancel: () => settleTilt(0, 0),
    onTap: () => pourNew(),
  });

  const keyTarget = () => {
    const k = keys.current;
    const x = (k.has("ArrowRight") ? 1 : 0) - (k.has("ArrowLeft") ? 1 : 0);
    const y = (k.has("ArrowDown") ? 1 : 0) - (k.has("ArrowUp") ? 1 : 0);
    return { x: x * KEY_TILT, y: y * KEY_TILT };
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      if (keys.current.has(event.key)) return;
      keys.current.add(event.key);
      const t = keyTarget();
      for (const c of running.current) c.stop();
      running.current = motionSafe
        ? [
            animate(tiltX, t.x, springs.glide),
            animate(tiltY, t.y, springs.glide),
          ]
        : [
            animate(tiltX, t.x, { duration: 0 }),
            animate(tiltY, t.y, { duration: 0 }),
          ];
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!event.repeat) pourNew();
    }
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!keys.current.has(event.key)) return;
    keys.current.delete(event.key);
    const t = keyTarget();
    settleTilt(t.x, t.y);
  };

  const still = stillArt(current, count, colours, base);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-roledescription="pour canvas"
      aria-label={`${label}, number ${current}, in ${paletteName}`}
      aria-describedby={`${uid}-keys`}
      tabIndex={disabled ? -1 : 0}
      {...drag}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        if (keys.current.size === 0) return;
        keys.current.clear();
        settleTilt(0, 0);
      }}
      className={cn(
        "group/acrylic-pour [container-type:size] relative isolate flex h-52 w-full touch-none items-center justify-center rounded-3 select-none",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
      style={{ perspective: 720 }}
    >
      <motion.div
        className="relative size-[calc(min(100cqw,100cqh)-20px)] shrink-0 rounded-2"
        style={{ rotateX, rotateY, boxShadow: shadow }}
      >
        <div
          aria-hidden
          className="absolute inset-0 rounded-2"
          style={{ backgroundImage: still }}
        />
        <canvas
          ref={canvasRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full rounded-2 opacity-0 transition-opacity duration-300 group-data-live/acrylic-pour:opacity-100"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2 shadow-[inset_0_0_0_1px_color-mix(in_oklab,black_14%,transparent),inset_0_0_14px_color-mix(in_oklab,black_16%,transparent)]"
        />
      </motion.div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[...colours, base].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <span id={`${uid}-keys`} className="sr-only">
        Drag, or hold the arrow keys, to tilt the canvas and let the paint run.
        Enter pours a new composition.
      </span>
      <span role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </span>
    </div>
  );
}
