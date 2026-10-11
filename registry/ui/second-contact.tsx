"use client";

import * as React from "react";

import {
  animate,
  useMotionValue,
  type AnimationPlaybackControls,
} from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
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
import { cn } from "@/registry/lib/utils";

export type SecondContactPhase =
  "clear" | "partial" | "beads" | "diamond" | "totality";

export type SecondContactPoint = { x: number; y: number };

export type SecondContactProps = {
  /** Where the moon's centre is (controlled), in sun radii from the sun's centre, y down. */
  value?: SecondContactPoint;
  /** Where the moon starts when uncontrolled. @default { x: -0.95, y: 0.28 } */
  defaultValue?: SecondContactPoint;
  /** Fires from the drag, tap or key that moved the moon. */
  onValueChange?: (point: SecondContactPoint) => void;
  /** Fires when the eclipse moves between clear, partial, beads, the diamond ring and totality. */
  onPhaseChange?: (phase: SecondContactPhase) => void;
  /** How far the corona reaches, 0 to 1: a tight bright collar to streamers past three radii. @default 0.6 */
  corona?: number;
  /** How bright the last light is, 0 to 1: faint pinpricks to blazing beads and a big diamond. @default 0.7 */
  beads?: number;
  /** The corona's tint, a hue in degrees. @default 200 */
  hue?: number;
  /** The sun's radius as a share of the shorter side, 0.12 to 0.32. @default 0.21 */
  sunSize?: number;
  /** How many pink prominences stand on the limb at totality, 0 to 1. @default 0.5 */
  prominences?: number;
  /** Stars come out as the sky darkens. @default true */
  stars?: boolean;
  /** The daytime sky, any CSS colour. @default a pigment from the accent token */
  sky?: string;
  /** The sky at totality, any CSS colour. @default a deep blue pigment */
  night?: string;
  /** How much the beads and the corona shimmer, 0 to 1. @default 0.4 */
  shimmer?: number;
  /** Seeds the moon's mountains and valleys and the corona's streamers. @default 7 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The scene's accessible name. @default "Eclipse" */
  label?: string;
  /** No dragging or keys. @default false */
  disabled?: boolean;
  /** Sizes the scene; it fills its parent by default. */
  className?: string;
};

const MOON = 1.15;
/** The moon's mountains and valleys, in sun radii either side of its mean limb. */
const RELIEF = 0.038;
const MAX_BEADS = 8;
const LIMB_STEPS = 720;
const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A seeded random in [0, 1), unsigned throughout. */
function seeded(seed: number, k: number): number {
  let h = Math.imul((seed * 7919 + k * 104729) ^ 0x2c1b3c6d, 0x297a2d39);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

type Limb = { amp: number[]; freq: number[]; phase: number[] };

/** Eight sines of whole frequencies: a closed, jagged limb, the same for a seed. */
function limbOf(seed: number): Limb {
  // Unevenly spaced frequencies, so the relief reads as mountains rather
  // than a regular scallop.
  const freq = [13, 17, 22, 27, 33, 38, 44, 51];
  const amp = freq.map(
    (f, k) => (0.35 + 0.65 * seeded(seed, k)) / Math.pow(f, 0.8),
  );
  const total = amp.reduce((a, b) => a + b, 0);
  return {
    freq,
    amp: amp.map((a) => a / total),
    phase: freq.map((_, k) => seeded(seed, k + 20) * TAU),
  };
}

const profile = (limb: Limb, a: number) => {
  let s = 0;
  for (let k = 0; k < 8; k += 1) {
    s +=
      (limb.amp[k] ?? 0) *
      Math.sin((limb.freq[k] ?? 0) * a + (limb.phase[k] ?? 0));
  }
  return s;
};

/** The moon's limb radius toward angle `a` (seen from its centre). */
const limbAt = (limb: Limb, a: number) => MOON + RELIEF * profile(limb, a);

type Reading = {
  /** Share of the sun's light still reaching the ground. */
  light: number;
  /** Share of the sun's disc covered, 0 to 100. */
  covered: number;
  phase: SecondContactPhase;
  /** x, y, strength, size per bead. */
  beads: Float32Array;
  count: number;
  diamond: [number, number, number];
};

const scratchGaps = new Float32Array(LIMB_STEPS);

/**
 * Measures the light: the visible share of the disc by sampling it, and near
 * totality the gap between the moon's jagged limb and the sun's at 720
 * angles, gathered into beads.
 */
function measure(limb: Limb, mx: number, my: number, out: Reading): Reading {
  const d = Math.hypot(mx, my);
  let seen = 0;
  let lit = 0;
  let weight = 0;
  const rings = 16;
  const spokes = 48;
  for (let i = 0; i < rings; i += 1) {
    const r = Math.sqrt((i + 0.5) / rings);
    const mu = Math.sqrt(Math.max(0, 1 - r * r));
    const w = 0.45 + 0.55 * mu;
    for (let j = 0; j < spokes; j += 1) {
      const a = ((j + 0.5) / spokes) * TAU;
      const px = r * Math.cos(a) - mx;
      const py = r * Math.sin(a) - my;
      const visible = Math.hypot(px, py) > limbAt(limb, Math.atan2(py, px));
      weight += w;
      if (visible) {
        seen += 1;
        lit += w;
      }
    }
  }
  let light = lit / weight;
  let geometric = seen / (rings * spokes);
  // The limb: along each ray from the sun's centre, how deep inside the
  // sun's edge the light still shows beyond the moon.
  const gaps = scratchGaps;
  let any = 0;
  let deepest = 0;
  for (let i = 0; i < LIMB_STEPS; i += 1) {
    const a = (i / LIMB_STEPS) * TAU;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const along = ux * mx + uy * my;
    const across = mx * mx + my * my - along * along;
    let reach = MOON;
    let far = -1;
    for (let k = 0; k < 2; k += 1) {
      const disc = reach * reach - across;
      if (disc < 0) {
        far = -1;
        break;
      }
      far = along + Math.sqrt(disc);
      const ex = far * ux - mx;
      const ey = far * uy - my;
      reach = limbAt(limb, Math.atan2(ey, ex));
    }
    const near =
      far < 0 ? 2 : along - Math.sqrt(Math.max(0, reach * reach - across));
    const gap = far < 0 || near >= 1 ? 1 : Math.max(0, 1 - far);
    gaps[i] = gap;
    if (gap > 0) any += 1;
    deepest = Math.max(deepest, gap);
  }
  out.count = 0;
  out.diamond[2] = 0;
  if (d >= 1 + MOON + RELIEF) {
    out.phase = "clear";
  } else if (geometric > 0.004 || deepest > 0.06) {
    out.phase = "partial";
  } else if (any === 0) {
    out.phase = "totality";
    light = 0;
    geometric = 0;
  } else {
    // Gather the lit runs of the limb into beads, wrapping round.
    let start = 0;
    while (start < LIMB_STEPS && (gaps[start] ?? 0) > 0) start += 1;
    const runs: { a: number; w: number; depth: number }[] = [];
    let sx = 0;
    let sy = 0;
    let w = 0;
    let depth = 0;
    for (let n = 1; n <= LIMB_STEPS; n += 1) {
      const i = (start + n) % LIMB_STEPS;
      const g = gaps[i] ?? 0;
      if (g > 0) {
        const a = (i / LIMB_STEPS) * TAU;
        sx += Math.cos(a) * g;
        sy += Math.sin(a) * g;
        w += g;
        depth = Math.max(depth, g);
      } else if (w > 0) {
        runs.push({ a: Math.atan2(sy, sx), w, depth });
        sx = 0;
        sy = 0;
        w = 0;
        depth = 0;
      }
    }
    if (w > 0) runs.push({ a: Math.atan2(sy, sx), w, depth });
    runs.sort((p, q) => q.w - p.w);
    const step = TAU / LIMB_STEPS;
    const total = runs.reduce((s, r) => s + r.w, 0);
    light = Math.max(light, ((total * step) / Math.PI) * 0.5);
    const top = runs[0];
    const share = top && total > 0 ? top.w / total : 0;
    out.phase = runs.length <= 1 || share > 0.72 ? "diamond" : "beads";
    for (const run of runs.slice(0, MAX_BEADS)) {
      const k = out.count;
      const area = run.w * step;
      out.beads[k * 4] = Math.cos(run.a) * (1 - run.depth * 0.5);
      out.beads[k * 4 + 1] = Math.sin(run.a) * (1 - run.depth * 0.5);
      out.beads[k * 4 + 2] = clamp(Math.sqrt(area) * 26, 0.2, 1);
      out.beads[k * 4 + 3] = run.depth;
      out.count += 1;
    }
    if (out.phase === "diamond" && top) {
      out.diamond[0] = Math.cos(top.a);
      out.diamond[1] = Math.sin(top.a);
      out.diamond[2] = clamp(1.1 - (total * step) / 0.02, 0.35, 1);
    }
  }
  out.light = clamp(light, 0, 1);
  out.covered = Math.round((1 - geometric) * 100);
  // A partial eclipse never reads as none or all of the sun.
  if (out.phase === "partial") out.covered = clamp(out.covered, 1, 99);
  if (out.phase === "clear") out.covered = 0;
  return out;
}

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform float u_sunR;
uniform float u_aa;
uniform vec2 u_moon;
uniform float u_moonR;
uniform float u_relief;
uniform vec4 u_ampA;
uniform vec4 u_ampB;
uniform vec4 u_freqA;
uniform vec4 u_freqB;
uniform vec4 u_phA;
uniform vec4 u_phB;
uniform float u_light;
uniform float u_crown;
uniform float u_reach;
uniform float u_hue;
uniform float u_time;
uniform float u_shimmer;
uniform vec3 u_sky;
uniform vec3 u_night;
uniform vec4 u_beads[${MAX_BEADS}];
uniform int u_beadCount;
uniform vec3 u_diamond;
uniform float u_beadGain;
uniform float u_prom;
uniform float u_stars;
uniform float u_seed;
in vec2 v_uv;
out vec4 o_color;
${GLSL_NOISE}

float hash1(float n) { return fract(sin(n * 12.9898 + u_seed * 78.233) * 43758.5453); }

float limb(float a) {
  vec4 s1 = sin(u_freqA * a + u_phA);
  vec4 s2 = sin(u_freqB * a + u_phB);
  return u_moonR + u_relief * (dot(u_ampA, s1) + dot(u_ampB, s2));
}

vec3 tint(float h) {
  vec3 c = 0.5 + 0.5 * cos(6.28318 * (h / 6.28318 + vec3(0.0, 0.33, 0.67)));
  return mix(vec3(1.0), c, 0.42);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 q = (px - 0.5 * u_res) / u_sunR;
  float r = length(q);
  float a = atan(q.y, q.x);
  float day = pow(clamp(u_light, 0.0, 1.0), 0.38);

  // The sky: day blue darkening to night, a ring of sunset low all round.
  vec3 col = mix(u_night, u_sky, day);
  col *= 0.86 + 0.14 * (1.0 - v_uv.y);
  float dusk = (1.0 - day) * smoothstep(0.62, 1.0, v_uv.y);
  col += vec3(0.95, 0.52, 0.28) * dusk * 0.36;

  // Stars, once the sky is dark enough.
  if (u_stars > 0.5 && day < 0.35) {
    vec2 cell = floor(px / 22.0);
    float h = kx_hash(cell + u_seed);
    if (h > 0.93) {
      vec2 at = (cell + vec2(kx_hash(cell + 3.1), kx_hash(cell + 7.7))) * 22.0;
      float d = length(px - at);
      float tw = 0.75 + 0.25 * sin(u_time * (1.0 + h * 3.0) * u_shimmer * 3.0 + h * 40.0);
      col += vec3(0.85, 0.9, 1.0) * exp(-d * d / 0.9) * (h - 0.93) * 14.0 * (1.0 - day / 0.35) * tw;
    }
  }

  // Glare round the sun while any of it shows.
  float glare = pow(clamp(u_light, 0.0, 1.0), 0.55);
  col += vec3(1.0, 0.95, 0.85) * glare * 0.75 * exp(-max(r - 1.0, 0.0) * 2.4);

  // The corona: an inner collar, a soft outer glow and long helmet
  // streamers, with fine striations, tinted toward the hue farther out.
  if (u_crown > 0.002 && r > 0.9) {
    // Measured from just inside the moon's edge, so the bright inner collar
    // shows round the dark disc.
    float x = max(r - u_moonR + 0.04, 0.0) / mix(0.45, 1.7, u_reach);
    float base = 0.95 * exp(-x * 7.0) + 0.26 * exp(-x * 2.2);
    float streams = 0.0;
    for (int k = 0; k < 7; k += 1) {
      float fk = float(k);
      float ak = 6.28318 * hash1(fk + 1.0);
      if (k < 2) ak = 6.28318 * hash1(1.0) + 3.14159 * fk;
      float wk = mix(0.18, 0.42, hash1(fk + 9.0));
      float sk = k < 2 ? 1.0 : mix(0.35, 0.8, hash1(fk + 17.0));
      float dd = abs(mod(a - ak + 3.14159, 6.28318) - 3.14159);
      float w = wk / (1.0 + x * 2.2) + 0.03;
      streams += sk * exp(-(dd * dd) / (w * w)) * (k < 2 ? 0.62 * exp(-x * 1.0) : 0.42 * exp(-x * 1.7));
    }
    float drift = u_time * 0.02 * u_shimmer;
    float stri = 0.8 + 0.2 * kx_noise(vec2(a * 34.0 + u_seed, log(1.0 + x) * 3.0 - drift));
    float corona = (base + streams) * stri * 0.85;
    float hue = u_hue + 0.42 * sin(u_time * 0.11 + a * 0.5);
    vec3 cc = mix(vec3(1.0, 0.98, 0.95), tint(hue), clamp(x * 0.9, 0.0, 0.6));
    col += cc * corona * u_crown;
    // Prominences: small pink tongues standing on the limb.
    if (u_prom > 0.01) {
      for (int k = 0; k < 5; k += 1) {
        float fk = float(k);
        if (fk / 5.0 > u_prom) break;
        float ak = 6.28318 * hash1(fk + 31.0);
        float dd = abs(mod(a - ak + 3.14159, 6.28318) - 3.14159);
        float h = (0.09 + 0.07 * hash1(fk + 41.0)) * exp(-(dd * dd) / 0.004);
        float inside = (1.0 - smoothstep(1.0 + h * 0.4, 1.0 + h, r)) * step(0.98, r);
        col += vec3(1.0, 0.36, 0.5) * inside * 0.9 * u_crown;
      }
    }
  }

  // The sun, limb-darkened.
  float sun = 1.0 - smoothstep(1.0 - u_aa, 1.0 + u_aa, r);
  float mu = sqrt(max(0.0, 1.0 - r * r));
  vec3 photo = vec3(1.0, 0.96, 0.86) * (0.62 + 0.5 * mu) * 1.5;
  col = mix(col, photo, sun);

  // The moon, its jagged limb in front of everything but the last light.
  vec2 m = q - u_moon;
  float mr = length(m);
  float lr = limb(atan(m.y, m.x));
  float moon = 1.0 - smoothstep(lr - u_aa, lr + u_aa, mr);
  vec3 moonCol = mix(vec3(0.012, 0.014, 0.022), u_sky * 0.12, day * 0.7);
  moonCol += vec3(0.02, 0.025, 0.04) * (1.0 - day) * (1.0 - mr / lr);
  col = mix(col, moonCol, moon);

  // Baily's beads: sunlight through the valleys of the limb.
  float shimmer = 1.0 + u_shimmer * 0.35 * sin(u_time * 9.0 + a * 13.0);
  for (int i = 0; i < ${MAX_BEADS}; i += 1) {
    if (i >= u_beadCount) break;
    vec4 b = u_beads[i];
    float d = length(q - b.xy);
    float s = b.z * u_beadGain * shimmer;
    col += vec3(1.0, 0.95, 0.86) * s * (2.6 * exp(-d * d / 0.0006) + 0.8 * exp(-d * d / 0.01) + 0.28 * exp(-d / 0.14));
  }

  // The diamond: the last bead flares into a starburst.
  if (u_diamond.z > 0.001) {
    vec2 c = q - u_diamond.xy;
    float d = length(c);
    float D = u_diamond.z * u_beadGain;
    float flare = 3.2 * exp(-d * d / 0.003) + 1.3 * exp(-d / 0.24);
    float rays = 0.0;
    for (int k = 0; k < 4; k += 1) {
      float t = 0.35 + float(k) * 0.785398;
      vec2 dir = vec2(cos(t), sin(t));
      float along = dot(c, dir);
      float across = abs(c.x * dir.y - c.y * dir.x);
      rays += exp(-across / 0.012) * exp(-abs(along) / 0.85);
    }
    col += vec3(1.0, 0.97, 0.9) * D * (flare + 0.9 * rays) * shimmer;
  }

  col = clamp(col, 0.0, 1.0);
  o_color = vec4(col, 1.0);
}
`;

/** Any CSS colour as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0.5, 0.5, 0.5];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

type Config = {
  corona: number;
  beads: number;
  hue: number;
  sunSize: number;
  prominences: number;
  stars: boolean;
  shimmer: number;
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
  moonAt: (x: number, y: number) => void;
  sunPx: () => number;
  dispose: () => void;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
  onReading: { current: (r: Reading) => void },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let frame = 0;
  let started = 0;
  let limb = limbOf(7);
  // The limb's sines as uniforms, rebuilt only when the seed changes.
  const limbU = {
    ampA: new Float32Array(4),
    ampB: new Float32Array(4),
    freqA: new Float32Array(4),
    freqB: new Float32Array(4),
    phA: new Float32Array(4),
    phB: new Float32Array(4),
  };
  const setLimb = (seed: number) => {
    limb = limbOf(seed);
    limbU.ampA.set(limb.amp.slice(0, 4));
    limbU.ampB.set(limb.amp.slice(4, 8));
    limbU.freqA.set(limb.freq.slice(0, 4));
    limbU.freqB.set(limb.freq.slice(4, 8));
    limbU.phA.set(limb.phase.slice(0, 4));
    limbU.phB.set(limb.phase.slice(4, 8));
  };
  const moonUniform = new Float32Array(2);
  const resUniform = new Float32Array(2);
  const moon = { x: -0.95, y: 0.28 };
  const size = { w: 0, h: 0, scale: 1 };
  const read = rgbReader();
  const sky: [number, number, number] = [0.5, 0.7, 0.9];
  const night: [number, number, number] = [0.05, 0.06, 0.12];
  const reading: Reading = {
    light: 1,
    covered: 0,
    phase: "partial",
    beads: new Float32Array(MAX_BEADS * 4),
    count: 0,
    diamond: [0, 0, 0],
  };
  let measured = "";

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
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

  const sunPx = () =>
    clamp(cfg?.sunSize ?? 0.21, 0.12, 0.32) * Math.min(size.w, size.h);

  const remeasure = () => {
    const key = `${r3(moon.x)}|${r3(moon.y)}|${cfg?.seed ?? 7}`;
    if (key === measured) return;
    measured = key;
    measure(limb, moon.x, moon.y, reading);
    onReading.current(reading);
  };

  /** The corona is out while totality, the diamond or late beads show. */
  const crown = () => {
    const c = cfg;
    if (!c) return 0;
    if (reading.phase === "totality") return 1;
    return clamp(1 - reading.light / 0.035, 0, 1) * 0.9;
  };

  const ambient = () => {
    const c = cfg;
    return Boolean(
      c &&
      c.motionSafe &&
      (crown() > 0.05 || reading.count > 0) &&
      (c.shimmer > 0 || crown() > 0.05),
    );
  };

  const draw = (now: number) => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost || size.w < 2) return;
    const t = c.motionSafe ? (now - started) / 1000 : 0;
    resUniform[0] = size.w;
    resUniform[1] = size.h;
    moonUniform[0] = moon.x;
    moonUniform[1] = moon.y;
    g.program.set({
      u_res: resUniform,
      u_sunR: sunPx(),
      u_aa: r3(1.2 / Math.max(1, sunPx())),
      u_moon: moonUniform,
      u_moonR: MOON,
      u_relief: RELIEF,
      u_ampA: limbU.ampA,
      u_ampB: limbU.ampB,
      u_freqA: limbU.freqA,
      u_freqB: limbU.freqB,
      u_phA: limbU.phA,
      u_phB: limbU.phB,
      u_light: reading.light,
      u_crown: crown(),
      u_reach: clamp(c.corona, 0, 1),
      u_hue: (c.hue * Math.PI) / 180,
      u_time: t,
      u_shimmer: c.motionSafe ? clamp(c.shimmer, 0, 1) : 0,
      u_sky: sky,
      u_night: night,
      u_beads: reading.beads,
      u_beadCount: reading.count,
      u_diamond: reading.diamond,
      u_beadGain: lerp(0.25, 1.6, clamp(c.beads, 0, 1)),
      u_prom: clamp(c.prominences, 0, 1),
      u_stars: c.stars ? 1 : 0,
      u_seed: (Math.round(c.seed) % 97) + 0.5,
    });
    g.gl.viewport(0, 0, canvas.width, canvas.height);
    g.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  let drawnAt = 0;
  let dirty = true;
  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden) return;
    remeasure();
    // The corona's slow drift needs no more than thirty frames a second; a
    // moved moon draws at once.
    if (dirty || now - drawnAt >= 33) {
      draw(now);
      drawnAt = now;
      dirty = false;
    }
    if (ambient()) frame = window.requestAnimationFrame(tick);
  };

  const kick = () => {
    dirty = true;
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const a = kids[0];
    const b = kids[1];
    if (a) sky.splice(0, 3, ...read(getComputedStyle(a).color));
    if (b) night.splice(0, 3, ...read(getComputedStyle(b).color));
  };

  const resize = () => {
    const c = cfg;
    size.w = root.clientWidth;
    size.h = root.clientHeight;
    const g = gpu;
    if (!c || !g || g.lost || size.w < 2 || size.h < 2) return;
    const cap = clamp(c.dpr, 0.5, 2);
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    const scale = ratio >= 1.5 ? 0.75 : 1;
    size.scale = resizeGL(g.gl, canvas, {
      dprCap: cap,
      renderScale: scale,
    }).dpr;
    draw(performance.now());
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
      if (!was) {
        started = performance.now();
        setLimb(next.seed);
      } else if (was.seed !== next.seed) {
        setLimb(next.seed);
        measured = "";
      }
      remeasure();
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
      if (was && was.dpr !== next.dpr) resize();
      if (was && was.colorKey !== next.colorKey) readColours();
      kick();
    },
    resize,
    readColours() {
      readColours();
      kick();
    },
    wake() {
      kick();
    },
    moonAt(x, y) {
      moon.x = x;
      moon.y = y;
      dirty = true;
      remeasure();
      kick();
    },
    sunPx,
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

const PHASE_SAYS: Record<SecondContactPhase, string> = {
  clear: "clear of the sun",
  partial: "partial eclipse",
  beads: "Baily's beads",
  diamond: "the diamond ring",
  totality: "totality",
};

/**
 * A solar eclipse you drive. The sun stands in a day sky with the dark moon
 * part-way across it; drag the moon (anywhere on the sky moves it 1:1, a tap
 * glides it there on springs.glide) and as it covers more the sky deepens
 * through a metallic twilight to night, a ring of sunset lights the horizon
 * and stars come out. The moon's limb is jagged — a seeded profile of
 * mountains and valleys — so near totality the last thin crescent breaks
 * into Baily's beads of light through the valleys, then a single diamond
 * ring with the inner corona already showing, then totality: the pearly
 * corona with long helmet streamers and fine striations, drifting in colour
 * around `hue`, and pink prominences on the limb. Releasing leaves the moon
 * where it is.
 *
 * One WebGL2 pass draws the scene; the light is measured on the CPU — the
 * visible share of the disc, and at 720 angles round the limb the gap the
 * valleys leave — and gathered into beads. The moon is a slider of how much
 * of the sun is covered: arrow keys move it (finely near the sun, Shift for
 * big steps), Home sets it at totality and End back where it began. Under
 * reduced motion the scene is still and a tap moves the moon at once.
 */
export function SecondContact({
  value,
  defaultValue = { x: -0.95, y: 0.28 },
  onValueChange,
  onPhaseChange,
  corona = 0.6,
  beads = 0.7,
  hue = 200,
  sunSize = 0.21,
  prominences = 0.5,
  stars = true,
  sky = "oklch(from var(--accent) 0.74 0.09 h)",
  night = "oklch(0.17 0.035 265)",
  shimmer = 0.4,
  seed = 7,
  dpr = 2,
  label = "Eclipse",
  disabled = false,
  className,
}: SecondContactProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const radius = clamp(sunSize, 0.12, 0.32);

  const [own, setOwn] = React.useState<SecondContactPoint>(defaultValue);
  const point = value ?? own;
  const [mount] = React.useState(point);
  const [state, setState] = React.useState<{
    phase: SecondContactPhase;
    covered: number;
  }>(() => {
    const r = measure(limbOf(seed), point.x, point.y, {
      light: 1,
      covered: 0,
      phase: "partial",
      beads: new Float32Array(MAX_BEADS * 4),
      count: 0,
      diamond: [0, 0, 0],
    });
    return { phase: r.phase, covered: r.covered };
  });

  const mx = useMotionValue(point.x);
  const my = useMotionValue(point.y);
  const gliding = React.useRef<AnimationPlaybackControls[]>([]);
  const start = React.useRef({ x: 0, y: 0 });
  const asked = React.useRef(point);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const handleRef = React.useRef<HTMLDivElement | null>(null);
  const shadeRef = React.useRef<HTMLDivElement | null>(null);
  const crownRef = React.useRef<HTMLDivElement | null>(null);
  const discRef = React.useRef<HTMLDivElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);

  const config: Config = {
    corona,
    beads,
    hue,
    sunSize: radius,
    prominences,
    stars,
    shimmer,
    seed,
    dpr,
    motionSafe,
    colorKey: `${sky}|${night}`,
  };
  const latest = React.useRef(config);
  // Null until the first reading, so the phase is reported from the start.
  const phaseRef = React.useRef<SecondContactPhase | null>(null);
  const reported = React.useRef<{ phase: SecondContactPhase; covered: number }>(
    state,
  );
  const onReading = React.useRef<(r: Reading) => void>(() => {});
  React.useEffect(() => {
    latest.current = config;
    onReading.current = (r) => {
      const prev = reported.current;
      if (prev.phase !== r.phase || prev.covered !== r.covered) {
        reported.current = { phase: r.phase, covered: r.covered };
        setState(reported.current);
      }
      if (phaseRef.current !== r.phase) {
        phaseRef.current = r.phase;
        onPhaseChange?.(r.phase);
      }
      // The CSS scene (the server's frame and the no-WebGL fallback) follows.
      const day = Math.pow(r.light, 0.38);
      if (shadeRef.current) {
        shadeRef.current.style.opacity = String(r3(1 - day));
      }
      if (crownRef.current) {
        crownRef.current.style.opacity = String(
          r3(
            r.phase === "totality" ? 1 : clamp(1 - r.light / 0.035, 0, 1) * 0.9,
          ),
        );
      }
    };
    engine.current?.configure(config);
  });

  /** Puts the moon (and the handle, and the CSS moon) at (x, y) sun radii. */
  const place = React.useCallback((x: number, y: number) => {
    const left = `calc(50% + ${r3(x)} * var(--sc-r))`;
    const top = `calc(50% + ${r3(y)} * var(--sc-r))`;
    for (const el of [handleRef.current, discRef.current]) {
      if (!el) continue;
      el.style.left = left;
      el.style.top = top;
    }
    engine.current?.moonAt(x, y);
  }, []);

  React.useEffect(() => {
    const update = () => place(mx.get(), my.get());
    const offX = mx.on("change", update);
    const offY = my.on("change", update);
    return () => {
      offX();
      offY();
    };
  }, [mx, my, place]);

  const halt = () => {
    for (const g of gliding.current) g.stop();
    gliding.current = [];
  };

  /** The moon's reach: it may leave the sun but not the sky. */
  const bounds = () => {
    const el = rootRef.current;
    const r = engine.current?.sunPx() ?? 50;
    const w = el?.clientWidth ?? 320;
    const h = el?.clientHeight ?? 216;
    return { x: w / 2 / Math.max(1, r) + 0.4, y: h / 2 / Math.max(1, r) + 0.4 };
  };

  const report = (x: number, y: number) => {
    const next = { x: r3(x), y: r3(y) };
    asked.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  const glideTo = (x: number, y: number) => {
    halt();
    const b = bounds();
    const tx = clamp(x, -b.x, b.x);
    const ty = clamp(y, -b.y, b.y);
    if (!latest.current.motionSafe) {
      mx.jump(tx);
      my.jump(ty);
      place(tx, ty);
    } else {
      gliding.current = [
        animate(mx, tx, springs.glide),
        animate(my, ty, springs.glide),
      ];
    }
    report(tx, ty);
  };

  // A host that moves the moon gets the same glide a tap would.
  React.useEffect(() => {
    const was = asked.current;
    if (Math.abs(was.x - point.x) < 1e-4 && Math.abs(was.y - point.y) < 1e-4) {
      return;
    }
    asked.current = point;
    halt();
    if (!motionSafe) {
      mx.jump(point.x);
      my.jump(point.y);
      place(point.x, point.y);
      return;
    }
    gliding.current = [
      animate(mx, point.x, springs.glide),
      animate(my, point.y, springs.glide),
    ];
  }, [point, motionSafe, mx, my, place]);

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible, onReading);
    engine.current = e;
    e.configure(latest.current);
    place(mx.get(), my.get());
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      for (const g of gliding.current) g.stop();
      gliding.current = [];
    };
  }, [mx, my, place]);

  React.useEffect(() => {
    const onVisibility = () => engine.current?.wake();
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
      engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const toSun = (clientX: number, clientY: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    const r = engine.current?.sunPx() ?? 50;
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - rect.width / 2) / Math.max(1, r),
      y: (clientY - rect.top - rect.height / 2) / Math.max(1, r),
    };
  };

  const drag = useDrag({
    threshold: 3,
    disabled,
    onStart: () => {
      halt();
      start.current = { x: mx.get(), y: my.get() };
    },
    onMove: ({ offset }) => {
      const r = engine.current?.sunPx() ?? 50;
      const b = bounds();
      const x = clamp(start.current.x + offset.x / Math.max(1, r), -b.x, b.x);
      const y = clamp(start.current.y + offset.y / Math.max(1, r), -b.y, b.y);
      mx.set(r3(x));
      my.set(r3(y));
    },
    onEnd: () => report(mx.get(), my.get()),
    onCancel: () => report(mx.get(), my.get()),
    onTap: (event) => {
      if (disabled) return;
      const at = toSun(event.clientX, event.clientY);
      glideTo(at.x, at.y);
      handleRef.current?.focus({ preventScroll: true });
    },
  });

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    const x = mx.get();
    const y = my.get();
    // Fine steps where the beads and the ring are, coarse ones far off.
    const d = Math.hypot(x, y);
    const step =
      (d < 0.35 ? 0.01 : d < 0.6 ? 0.03 : 0.08) * (event.shiftKey ? 4 : 1);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [x - step, y],
      ArrowRight: [x + step, y],
      ArrowUp: [x, y - step],
      ArrowDown: [x, y + step],
      Home: [0, 0],
      End: [defaultValue.x, defaultValue.y],
    };
    const to = moves[event.key];
    if (!to) return;
    event.preventDefault();
    if (event.key === "Home" || event.key === "End") {
      glideTo(to[0], to[1]);
      return;
    }
    halt();
    const b = bounds();
    const nx = clamp(to[0], -b.x, b.x);
    const ny = clamp(to[1], -b.y, b.y);
    mx.jump(nx);
    my.jump(ny);
    place(nx, ny);
    report(nx, ny);
  };

  const left = `calc(50% + ${r3(mount.x)} * var(--sc-r))`;
  const top = `calc(50% + ${r3(mount.y)} * var(--sc-r))`;
  const valueText = `${state.covered}% covered, ${PHASE_SAYS[state.phase]}`;

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="eclipse"
      aria-label={label}
      aria-describedby={hintId}
      {...drag}
      className={cn(
        "group/second-contact [container-type:size] relative isolate h-full w-full touch-none overflow-clip rounded-3 select-none",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "cursor-grab active:cursor-grabbing",
        className,
      )}
      style={
        {
          "--sc-r": `${r3(radius * 100)}cqmin`,
          backgroundColor: sky,
        } as React.CSSProperties
      }
    >
      {/* The server's frame, and the scene without WebGL2: sky, sun, corona, moon. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 group-data-live/second-contact:hidden"
      >
        <div
          ref={shadeRef}
          className="absolute inset-0"
          style={{ backgroundColor: night, opacity: 0.25 }}
        />
        <div
          ref={crownRef}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: "calc(var(--sc-r) * 7)",
            height: "calc(var(--sc-r) * 7)",
            backgroundImage:
              "radial-gradient(closest-side, oklch(0.98 0.02 220 / 0.95) 26%, oklch(0.9 0.04 220 / 0.35) 40%, transparent 100%)",
            opacity: 0,
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: "calc(var(--sc-r) * 2)",
            height: "calc(var(--sc-r) * 2)",
            backgroundImage:
              "radial-gradient(closest-side, oklch(0.99 0.03 95), oklch(0.95 0.07 85) 80%, oklch(0.9 0.09 75))",
            boxShadow: "0 0 calc(var(--sc-r) * 0.8) oklch(0.97 0.05 90 / 0.8)",
          }}
        />
        <div
          ref={discRef}
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            left,
            top,
            width: `calc(var(--sc-r) * ${MOON * 2})`,
            height: `calc(var(--sc-r) * ${MOON * 2})`,
            backgroundColor: "oklch(0.16 0.012 260)",
          }}
        />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/second-contact:opacity-100"
      />
      <div
        ref={handleRef}
        role="slider"
        aria-label="Moon"
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.covered}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute -translate-x-1/2 -translate-y-1/2 rounded-full outline-none",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
        style={{
          left,
          top,
          width: `calc(var(--sc-r) * ${MOON * 2})`,
          height: `calc(var(--sc-r) * ${MOON * 2})`,
        }}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[sky, night].map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <p id={hintId} className="sr-only">
        Drag the sky to move the moon, or tap where it should go. Arrow keys
        move it, in fine steps near the sun and big steps with Shift; Home sets
        it over the sun, End back where it began.
      </p>
      <p role="status" className="sr-only">
        {state.phase === "partial" || state.phase === "clear"
          ? ""
          : `${PHASE_SAYS[state.phase].replace(/^./, (c) => c.toUpperCase())}.`}
      </p>
    </div>
  );
}
