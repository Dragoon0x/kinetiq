"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type StormStrike = {
  /** Where the strike was called, CSS px from the box's top-left. */
  x: number;
  y: number;
  /** A visitor's click or focus called it, or the storm made it on its own. */
  source: "visitor" | "storm";
};

export type StormFrontProps = {
  /** The content under the storm: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many flashes the storm makes on its own, per minute, 0 to 20. @default 6 */
  rate?: number;
  /** How heavy the cloud deck is, 0 (broken) to 1 (solid). @default 0.6 */
  density?: number;
  /** The storm's light and colour, any CSS colour; taken at a fixed lightness so both themes read it. @default "var(--accent-bright)" */
  tint?: string;
  /** How fast the cloud rolls, 0 (still) to 2. @default 1 */
  speed?: number;
  /** Where the cloud base sits, as a fraction of the height from the top, 0.4 to 0.85. @default 0.62 */
  base?: number;
  /** How much rain hangs from the base, 0 to 1. @default 0.4 */
  rain?: number;
  /** How bright the lightning is, 0 to 1.5. @default 1 */
  intensity?: number;
  /** How much each discharge branches, 0 (a single channel) to 1. @default 0.6 */
  branches?: number;
  /** A click calls lightning at the pointer and keyboard focus calls a discharge above a control; the pointer gathers a faint glow. @default true */
  interactive?: boolean;
  /** Thunder after a strike the visitor calls (never for the storm's own flashes). Off unless asked for. @default false */
  sound?: boolean;
  /** Hold the cloud still; flashes already running finish, and no new ones start on their own. @default false */
  paused?: boolean;
  /** Seeds the cloud and every flash the storm makes. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when lightning strikes, with where it was called and by whom. */
  onStrike?: (strike: StormStrike) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Cloud is soft: half the capped pixel ratio, scaled up by the browser. */
const RENDER_SCALE = 0.5;
const CALM_FRAME = 31;
const SEGMENTS = 24;
/** The stepped leader takes this long to cross its channel. */
const LEADER = 0.12;
/** A return stroke's decay, and the afterglow's. */
const STROKE_DECAY = 0.07;
const AFTERGLOW = 0.35;
/** A reduced-motion strike fades out by opacity over this long. */
const STILL_FADE = 0.7;
const DRIFT = springs.drift;
const STEP = 1 / 120;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
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

/** What a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/** The light at a fixed lightness, and its near-white heart. */
const lightOf = (c: string) => `oklch(from ${c} 0.8 calc(c * 0.8) h)`;
const coreOf = (c: string) => `oklch(from ${c} 0.97 calc(c * 0.2) h)`;

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_col;
uniform vec3 u_core;
uniform float u_base;
uniform float u_density;
uniform float u_rain;
uniform vec2 u_seed;
uniform vec4 u_seg[48];
uniform vec3 u_info[48];
uniform vec4 u_flash[2];
uniform vec3 u_hand;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = turn * p * 2.03 + 4.7;
    a *= 0.5;
  }
  return s / 0.9375;
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

float baseAt(float x, float t) {
  return u_base + 0.04 * (fbm(vec2(x * 1.7 + t * 0.03, 3.1) + u_seed) - 0.5);
}

// The deck's body: three layers stretched into horizontal rolls, each
// drifting at its own pace so the near billows slide over the far ones.
float body(vec2 w, float t) {
  float back = fbm(w * vec2(1.1, 2.2) + vec2(t * 0.011, 0.0) + u_seed);
  float mid = fbm(w * vec2(2.3, 4.0) + vec2(t * 0.024, 1.3) + u_seed.yx);
  float fine = fbm(w * vec2(5.2, 8.0) + vec2(t * 0.045, 4.1) + u_seed);
  return back * 0.5 + mid * 0.33 + fine * 0.17;
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 size = u_res / u_px;
  vec2 p = v_uv * size;
  float h = size.y;
  vec2 q = p / h;
  float t = u_time;

  vec2 warp = vec2(
    fbm(q * 1.3 + vec2(t * 0.008, 1.7) + u_seed),
    fbm(q * 1.3 + vec2(5.2, -t * 0.006) + u_seed.yx)
  ) - 0.5;
  vec2 w = q + warp * vec2(0.5, 0.18);
  float n = body(w, t);
  // A lobe whose cloud thickens downward is the underside of a billow,
  // facing the light of the clear band below.
  float lobe = clamp((n - body(w - vec2(0.0, 0.03), t)) * 7.0, -1.0, 1.0);
  float b = baseAt(q.x, t);
  float edgeY = b + (n - 0.5) * 0.16;
  float under = smoothstep(edgeY + 0.012, edgeY - 0.012, q.y);
  // Deeper into the deck it closes; thin cloud opens into gaps.
  float rise = smoothstep(b, b - 0.42, q.y);
  float thr = mix(0.6, 0.26, u_density);
  float d = under * smoothstep(thr - 0.07, thr + 0.07, n + rise * 0.3);
  // Overhead is darkest; the undersides near the base catch the band.
  float vert = smoothstep(b - 0.6, b + 0.02, q.y);
  float tone = clamp(0.2 + 0.4 * vert + 0.36 * lobe * (0.4 + 0.6 * vert) + 0.9 * (n - 0.5), 0.0, 1.0);

  // Scud: torn fragments just under the base, rolling faster.
  float scud = fbm(q * vec2(3.2, 9.0) + vec2(t * 0.07, 0.0) + u_seed * 2.0);
  scud = smoothstep(0.56, 0.74, scud) * smoothstep(b - 0.01, b + 0.025, q.y) * smoothstep(b + 0.12, b + 0.035, q.y) * u_density;

  // Rain: slanted streaks in patchy curtains hanging from the base.
  float curtain = smoothstep(0.45, 0.72, fbm(vec2(q.x * 2.4 + t * 0.02, 1.3) + u_seed));
  float streak = noise(vec2((q.x + q.y * 0.22) * 70.0, q.y * 2.6 - t * 2.2));
  float rain = u_rain * curtain * smoothstep(b - 0.01, b + 0.08, q.y) * (1.0 - 0.75 * smoothstep(b + 0.05, 1.0, q.y)) * smoothstep(0.35, 0.8, streak);

  // Lightning: each flash's channel, glimpsed where the cloud is thin, and
  // its light spreading through the cloud and onto the billows' undersides.
  float trans = exp(-3.2 * d * smoothstep(0.3, 0.72, n));
  float glow = 0.0;
  float channel = 0.0;
  for (int k = 0; k < 2; k++) {
    vec4 fl = u_flash[k];
    if (fl.y <= 0.001) continue;
    float dmin = 10.0;
    float core = 0.0;
    float halo = 0.0;
    for (int j = 0; j < 24; j++) {
      int i = k * 24 + j;
      vec3 info = u_info[i];
      if (info.x <= 0.0) continue;
      if (info.y > fl.x) continue;
      vec4 s = u_seg[i];
      float sd = segDist(q, s.xy, s.zw);
      float wgt = info.x * mix(1.0, fl.z, info.z);
      dmin = min(dmin, sd / max(wgt, 0.2));
      float cw = sd * h / (1.1 + wgt * 1.0);
      core += wgt * exp(-cw * cw);
      halo += wgt * exp(-sd * h / 7.0);
    }
    float I = fl.y;
    glow += I * (exp(-dmin / 0.08) + 0.4 * exp(-dmin / 0.3) + 0.08);
    channel += I * (core * trans * 1.3 + halo * 0.35 * sqrt(trans));
  }
  glow = min(glow, 3.0);
  channel = min(channel, 3.0);

  // The hand: a faint charge gathering inside the cloud where it points.
  float hand = u_hand.z * 0.22 * exp(-length((q - u_hand.xy) * vec2(1.0, 1.6)) / 0.13) * d;

  vec3 bg = lin(u_bg);
  vec3 fg = lin(u_fg);
  vec3 L = lin(u_col);
  vec3 C = lin(u_core);

  float cloud = clamp(d + scud * 0.75, 0.0, 1.0);
  float shape = mix(0.5, tone, d);
  float lightIn = glow * cloud * (0.25 + 0.9 * smoothstep(0.3, 0.75, n) + 0.7 * max(lobe, 0.0)) + glow * (rain + 0.15) * 0.45 + hand;
  float bandGlow = exp(-max(q.y - b, 0.0) / 0.16);

  // Night: blue-black cloud over a deep band that holds the last light.
  vec3 bandN = mix(bg, fg, 0.008 + 0.022 * bandGlow) + L * 0.012 * bandGlow;
  vec3 gapN = mix(bg, fg, 0.02);
  vec3 cloudN = mix(bg * 0.35, mix(bg, fg, 0.05) + L * 0.006, shape);
  vec3 baseN = mix(mix(bandN, gapN, under), cloudN, cloud);
  baseN = mix(baseN, mix(bg, fg, 0.04), rain * 0.35);
  vec3 night = 1.0 - (1.0 - baseN) * exp(-(L * lightIn + C * channel));

  // Day: a grey storm, darker overhead, over a pale band.
  vec3 bandD = mix(bg, fg, 0.05 - 0.035 * bandGlow);
  vec3 gapD = mix(bg, fg, 0.2);
  vec3 cloudD = mix(mix(bg, fg, 0.72), mix(bg, fg, 0.3) + L * 0.012, shape);
  vec3 baseD = mix(mix(bandD, gapD, under), cloudD, cloud);
  baseD = mix(baseD, mix(bg, fg, 0.28), rain * 0.45);
  vec3 day = mix(baseD, mix(L, C, 0.45), clamp(lightIn * 1.05, 0.0, 0.92));
  // In clear daylight a white channel would vanish: below the cloud it
  // takes a deeper shade of the tint instead.
  vec3 chanD = mix(mix(L, L * L, 0.7), C, smoothstep(0.2, 0.7, cloud));
  day = mix(day, chanD, clamp(channel * mix(0.9, 1.2, cloud), 0.0, 1.0));

  vec3 col = mix(night, day, u_light);
  outColor = vec4(srgb(col), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  tintKey: string;
  rate: number;
  density: number;
  speed: number;
  base: number;
  rain: number;
  intensity: number;
  branches: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onStrike: (strike: StormStrike) => void;
  thunder: (pitch: number, gain: number, pan: number) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number) => void;
  handAway: () => void;
  strike: (x: number, y: number, strength: number, loud: boolean) => void;
  dispose: () => void;
};

/** One flash slot: its channel's age, its strokes, its strength. */
type Flash = {
  age: number;
  /** Seconds after the leader at which each return stroke fires. */
  strokes: Float32Array;
  count: number;
  strength: number;
  live: boolean;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  carriers: HTMLElement,
  visible: { current: boolean },
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let frame = 0;
  let last = 0;
  let drawnAt = 0;
  let disposed = false;
  let failed = false;
  let rand = lcg(1);
  const read = rgbReader();
  const colours = new Float32Array(12);
  const segs = new Float32Array(48 * 4);
  const info = new Float32Array(48 * 3);
  const flashData = new Float32Array(8);
  const size = { w: 0, h: 0 };
  let light = 0;
  /** Cloud clock, and when the storm flashes next on its own. */
  const sim = { t: 0, next: 0 };
  const flashes: [Flash, Flash] = [
    {
      age: 9,
      strokes: new Float32Array(3),
      count: 0,
      strength: 0,
      live: false,
    },
    {
      age: 9,
      strokes: new Float32Array(3),
      count: 0,
      strength: 0,
      live: false,
    },
  ];
  const hand = { x: 0, y: 0, present: false };
  /** The glow under the hand, on the drift spring: position and presence. */
  const charge = { x: 0, y: 0, vx: 0, vy: 0, a: 0, va: 0 };
  const timers: number[] = [];

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

  const aspect = () => (size.h > 0 ? size.w / size.h : 3);
  const baseOf = (c: Config) => clamp(c.base, 0.4, 0.85);

  /**
   * A seeded channel into slot k, in box units (height = 1): from (x, y),
   * crawling both ways through the cloud, or — called below the base — a
   * stroke dropping from the base to the point with crawlers along the base
   * from its top. Each segment carries its weight, when the leader reaches
   * it (0–1), and whether it is a branch.
   */
  const grow = (c: Config, k: number, x: number, y: number) => {
    const at = k * SEGMENTS;
    for (let i = 0; i < SEGMENTS; i += 1) info[(at + i) * 3] = 0;
    let used = 0;
    let longest = 0.001;
    const put = (
      ax: number,
      ay: number,
      bx: number,
      by: number,
      weight: number,
      reach: number,
      branch: boolean,
    ) => {
      if (used >= SEGMENTS) return false;
      const i = at + used;
      segs[i * 4] = ax;
      segs[i * 4 + 1] = ay;
      segs[i * 4 + 2] = bx;
      segs[i * 4 + 3] = by;
      info[i * 3] = weight;
      info[i * 3 + 1] = reach;
      info[i * 3 + 2] = branch ? 1 : 0;
      longest = Math.max(longest, reach);
      used += 1;
      return true;
    };
    const wide = aspect();
    const baseY = baseOf(c);
    const fork = clamp(c.branches, 0, 1);
    /** A crawling channel from (sx, sy) heading at `angle`, `steps` long. */
    const crawl = (
      sx: number,
      sy: number,
      angle: number,
      steps: number,
      len: number,
      weight: number,
      reach0: number,
      branch: boolean,
      depth: number,
    ) => {
      let px = sx;
      let py = sy;
      let a = angle;
      let reach = reach0;
      // Spider lightning runs along a layer of the deck: each kink is
      // sharp, but the heading keeps returning to its course and the
      // channel drifts toward a layer just above the base.
      const layer = sy + (baseY - 0.1 - sy) * 0.35;
      for (let s = 0; s < steps; s += 1) {
        a += (angle - a) * 0.3 + (rand() - 0.5) * 1.3;
        const step = len * (0.7 + rand() * 0.6);
        const nx = clamp(px + Math.cos(a) * step, 0.02, wide - 0.02);
        // Bounce off the deck's top and its base rather than sliding along
        // them, so a channel never runs flat along an edge.
        let ny = py + Math.sin(a) * step * 0.6 + (layer - py) * 0.25;
        if (ny > baseY - 0.05) ny = 2 * (baseY - 0.05) - ny;
        if (ny < 0.04) ny = 0.08 - ny;
        reach += step;
        if (!put(px, py, nx, ny, weight, reach, branch)) return;
        if (depth < 1 && rand() < fork * 0.42) {
          const side = rand() < 0.5 ? -1 : 1;
          crawl(
            nx,
            ny,
            a + side * (0.5 + rand() * 0.7),
            2 + Math.floor(rand() * 2),
            len * 0.62,
            weight * 0.55,
            reach,
            true,
            depth + 1,
          );
        }
        px = nx;
        py = ny;
      }
    };
    const len = 0.07 + rand() * 0.04;
    if (y > baseY + 0.02) {
      // Below the base: the stroke drops to the point, then the base lights.
      const top = baseY - 0.03;
      let px = x + (rand() - 0.5) * 0.06;
      let py = top;
      const drop = 5;
      let reach = 0;
      for (let s = 0; s < drop; s += 1) {
        const f = (s + 1) / drop;
        const nx =
          s === drop - 1 ? x : x + (px - x) * 0.4 + (rand() - 0.5) * 0.05;
        const ny = top + (y - top) * f;
        reach += Math.hypot(nx - px, ny - py);
        put(px, py, nx, ny, 1, reach, false);
        px = nx;
        py = ny;
      }
      crawl(
        x,
        top,
        Math.PI + (rand() - 0.5) * 0.4,
        3,
        len * 0.8,
        0.6,
        0,
        true,
        1,
      );
      crawl(x, top, (rand() - 0.5) * 0.4, 3, len * 0.8, 0.6, 0, true, 1);
    } else {
      const sy = clamp(y, 0.06, baseY - 0.02);
      const steps = 4 + Math.floor(rand() * 3);
      crawl(x, sy, Math.PI + (rand() - 0.5) * 0.6, steps, len, 1, 0, false, 0);
      crawl(x, sy, (rand() - 0.5) * 0.6, steps, len, 1, 0, false, 0);
    }
    for (let i = 0; i < used; i += 1) {
      const j = (at + i) * 3 + 1;
      info[j] = (info[j] ?? 0) / longest;
    }
    const f = flashes[k === 0 ? 0 : 1];
    f.age = 0;
    f.live = true;
    f.count = 1 + Math.floor(rand() * 3);
    let when = 0;
    for (let s = 0; s < 3; s += 1) {
      f.strokes[s] = when;
      when += 0.06 + rand() * 0.06;
    }
  };

  /** A flash's brightness at its age: a dim leader, return strokes, afterglow. */
  const brightness = (f: Flash) => {
    if (!f.live) return 0;
    const t = f.age;
    if (t < LEADER) return 0.22 * (t / LEADER);
    const after = t - LEADER;
    let b = 0.3 * Math.exp(-after / AFTERGLOW);
    for (let s = 0; s < f.count; s += 1) {
      const at = f.strokes[s] ?? 0;
      if (after >= at)
        b += (s === 0 ? 1 : 0.7) * Math.exp(-(after - at) / STROKE_DECAY);
    }
    return b;
  };
  const lifeOf = (f: Flash) =>
    LEADER + (f.strokes[Math.max(0, f.count - 1)] ?? 0) + 1.2;

  const uploadChannels = () => {
    const p = gpu;
    if (!p || p.lost) return;
    const u = p.program.uniforms;
    p.program.use();
    p.gl.uniform4fv(u.u_seg ?? null, segs);
    p.gl.uniform3fv(u.u_info ?? null, info);
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const r = lcg(c.seed * 23 + 9);
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_light ?? null, light);
    gl.uniform1f(u.u_base ?? null, baseOf(c));
    gl.uniform1f(u.u_density ?? null, clamp(c.density, 0, 1));
    gl.uniform1f(u.u_rain ?? null, clamp(c.rain, 0, 1));
    gl.uniform2f(u.u_seed ?? null, r() * 9, r() * 9);
    const names = ["u_bg", "u_fg", "u_col", "u_core"];
    for (let i = 0; i < 4; i += 1) {
      gl.uniform3f(
        u[names[i] ?? "u_bg"] ?? null,
        colours[i * 3] ?? 0,
        colours[i * 3 + 1] ?? 0,
        colours[i * 3 + 2] ?? 0,
      );
    }
    uploadChannels();
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const power = clamp(c.intensity, 0, 1.5);
    for (let k = 0; k < 2; k += 1) {
      const f = flashes[k === 0 ? 0 : 1];
      let b: number;
      let progress: number;
      if (c.motionSafe) {
        b = brightness(f);
        progress = clamp(f.age / LEADER, 0, 1);
      } else if (k === 0) {
        // Reduced motion: the storm holds one discharge at a soft glow.
        b = f.live ? 0.32 : 0;
        progress = 1;
      } else {
        b = f.live ? Math.max(0, 1 - f.age / STILL_FADE) : 0;
        progress = 1;
      }
      const branchFade = Math.exp(-Math.max(0, f.age - LEADER) / 0.16);
      flashData[k * 4] = progress;
      flashData[k * 4 + 1] = b * power * f.strength;
      flashData[k * 4 + 2] = c.motionSafe ? branchFade : 1;
      flashData[k * 4 + 3] = 0;
    }
    program.use();
    gl.uniform1f(u.u_time ?? null, sim.t);
    gl.uniform4fv(u.u_flash ?? null, flashData);
    gl.uniform3f(
      u.u_hand ?? null,
      charge.x / Math.max(1, size.h),
      charge.y / Math.max(1, size.h),
      clamp(charge.a, 0, 1),
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const schedule = (c: Config) => {
    const rate = clamp(c.rate, 0, 20);
    if (rate <= 0) {
      sim.next = Infinity;
      return;
    }
    // Seeded intervals around the mean, never closer than two seconds.
    sim.next = sim.t + Math.max(2, (60 / rate) * (0.45 + rand() * 1.1));
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const rolling = !c.paused && c.speed > 0;
    if (rolling) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    // The storm's own flashes keep their seeded rhythm on the cloud clock.
    if (rolling && sim.t >= sim.next && !flashes[0].live) {
      const wide = aspect();
      const x = (0.1 + rand() * 0.8) * wide;
      const y = baseOf(c) - 0.06 - rand() * 0.22;
      flashes[0].strength = 0.75 + rand() * 0.35;
      grow(c, 0, x, y);
      uploadChannels();
      c.onStrike({
        x: Math.round(x * size.h),
        y: Math.round(y * size.h),
        source: "storm",
      });
      schedule(c);
    }
    for (const f of flashes) {
      if (!f.live) continue;
      f.age += dt;
      if (f.age > lifeOf(f)) f.live = false;
      else moving = true;
    }
    // The charge under the hand follows on the drift spring.
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const want = hand.present && c.interactive ? 1 : 0;
    const k = DRIFT.stiffness;
    const b = DRIFT.damping;
    const m = DRIFT.mass;
    for (let s = 0; s < steps; s += 1) {
      charge.vx += ((k * (hand.x - charge.x) - b * charge.vx) / m) * h;
      charge.vy += ((k * (hand.y - charge.y) - b * charge.vy) / m) * h;
      charge.va += ((k * (want - charge.a) - b * charge.va) / m) * h;
      charge.x += charge.vx * h;
      charge.y += charge.vy * h;
      charge.a += charge.va * h;
    }
    const still =
      Math.abs(charge.vx) + Math.abs(charge.vy) < 0.5 &&
      Math.abs(want - charge.a) < 0.002 &&
      Math.abs(charge.va) < 0.01;
    if (still) {
      charge.vx = 0;
      charge.vy = 0;
      charge.va = 0;
      charge.a = want;
    }
    return moving || !still;
  };

  const busy = () =>
    flashes[0].live ||
    flashes[1].live ||
    charge.va !== 0 ||
    charge.vx !== 0 ||
    charge.vy !== 0;

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    if (c.motionSafe && !busy() && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    let moving: boolean;
    if (c.motionSafe) moving = step(dt);
    else {
      // Reduced motion: only a visitor's strike fades, by opacity.
      const f = flashes[1];
      if (f.live) {
        f.age += dt;
        if (f.age >= STILL_FADE) f.live = false;
      }
      moving = f.live;
    }
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** A fresh storm: a seeded cloud moment, the first flash's time, and the still discharge. */
  const restart = (c: Config) => {
    rand = lcg(c.seed * 37 + 1);
    sim.t = 20 + rand() * 40;
    flashes[0].live = false;
    flashes[1].live = false;
    if (!c.motionSafe) {
      flashes[0].strength = 1;
      grow(c, 0, (0.3 + rand() * 0.4) * aspect(), baseOf(c) - 0.12);
      flashes[0].live = true;
    }
    // The first flash comes early, so a visitor sees one soon.
    sim.next = sim.t + 1.6 + rand() * 1.5;
    if (clamp(c.rate, 0, 20) <= 0) sim.next = Infinity;
    uploadChannels();
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const lum =
      0.2126 * (colours[0] ?? 0) +
      0.7152 * (colours[1] ?? 0) +
      0.0722 * (colours[2] ?? 0);
    light = lum > 0.5 ? 1 : 0;
    statics();
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
    if (first) restart(c);
    resizeGL(p.gl, canvas, {
      dprCap: clamp(c.dpr, 0.5, 2),
      renderScale: RENDER_SCALE,
    });
    statics();
    draw();
    kick();
  };

  const startGpu = () => {
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
      if (failed) return;
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS still frame stays, and nothing retries.
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
            if (!disposed) startGpu();
          },
        );
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (
        was.seed !== next.seed ||
        was.motionSafe !== next.motionSafe ||
        was.base !== next.base
      )
        restart(next);
      if (was.rate !== next.rate) schedule(next);
      if (was.tintKey !== next.tintKey) readColours();
      else statics();
      if (!next.interactive && hand.present) hand.present = false;
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
    handTo(x, y) {
      const c = cfg;
      if (!c || !c.interactive) return;
      if (!hand.present) {
        // The charge gathers where the hand arrives, not where it last left.
        charge.x = x;
        charge.y = y;
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      if (c.motionSafe) kick();
    },
    handAway() {
      hand.present = false;
      if (cfg?.motionSafe) kick();
    },
    strike(x, y, strength, loud) {
      const c = cfg;
      if (!c || !c.interactive || size.h < 1) return;
      const qx = x / size.h;
      const qy = y / size.h;
      flashes[1].strength = clamp(strength, 0, 1);
      grow(c, 1, qx, qy);
      uploadChannels();
      c.onStrike({ x: Math.round(x), y: Math.round(y), source: "visitor" });
      if (loud) {
        // Thunder comes after the flash, later and lower the deeper the
        // strike sits in the cloud; a second, softer roll follows it.
        const deep = clamp((baseOf(c) - qy) / 0.4, 0, 1);
        const wait = Math.round((0.16 + deep * 0.42) * 1000);
        const pan = panFrom(root.getBoundingClientRect().left + x, root);
        const pitch = 1 - deep * 0.28;
        const gain = 0.7 * (1 - deep * 0.3) * flashes[1].strength;
        timers.push(
          window.setTimeout(() => c.thunder(pitch, gain, pan), wait),
          window.setTimeout(
            () => c.thunder(pitch * 0.78, gain * 0.5, pan * 0.6),
            wait + 240,
          ),
        );
        if (timers.length > 8) {
          for (const t of timers.splice(0, timers.length - 8))
            window.clearTimeout(t);
        }
      }
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      for (const t of timers) window.clearTimeout(t);
      timers.length = 0;
      detach();
      release();
    },
  };
}

/**
 * A background of a storm deck seen from beneath, rolling slowly: layers of
 * domain-warped cloud at their own scales and speeds, a ragged base with
 * torn scud under it, and rain curtains hanging over a paler band. The cloud
 * is lit from inside by lightning that crawls through it: seeded discharges
 * branching along the base, their channels hidden where the cloud is thick
 * and glimpsed where it thins, their light flooding the cloud around them
 * and catching the undersides of the billows — a dim leader, two or three
 * return strokes, an afterglow.
 *
 * A click calls lightning at the pointer: in the cloud a discharge crawls
 * out both ways from it; below the base a stroke drops to it. With `sound`
 * on, thunder answers after the flash, later and lower the deeper the strike
 * sits. The pointer gathers a faint glow inside the cloud on the
 * `springs.drift` constants, and keyboard focus on a control inside calls a
 * softer, silent discharge above it. One fullscreen WebGL2 draw at half the
 * capped pixel ratio, 30 frames a second while it only rolls, nothing off
 * screen or in a hidden page. Without WebGL2 a CSS still frame stands in;
 * under reduced motion the cloud holds still around one softly lit discharge.
 */
export function StormFront({
  children,
  rate = 6,
  density = 0.6,
  tint = "var(--accent-bright)",
  speed = 1,
  base = 0.62,
  rain = 0.4,
  intensity = 1,
  branches = 0.6,
  interactive = true,
  sound = false,
  paused = false,
  seed = 1,
  dpr = 2,
  onStrike,
  className,
}: StormFrontProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "var(--foreground)",
      lightOf(tint),
      coreOf(tint),
    ],
    [tint],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportStrike = React.useRef(onStrike);
  const voice = React.useRef(audio);

  const config: Config = {
    tintKey: tint,
    rate,
    density,
    speed,
    base,
    rain,
    intensity,
    branches,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onStrike: (s) => reportStrike.current?.(s),
    thunder: (pitch, gain, pan) =>
      voice.current.play("thud", { pitch, gain, pan }),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportStrike.current = onStrike;
    voice.current = audio;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
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

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.pointerType === "touch") return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y);
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway();
  };

  // A click (a real activation, so thunder may sound) calls the strike.
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!interactive || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A click on a control is the control's; only the bare sky strikes.
    if (hit && rootRef.current?.contains(hit)) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.strike(at.x, at.y, 1, true);
  };

  // Keyboard focus on a control inside calls a soft discharge above it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const root = rootRef.current;
    if (!root) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top);
    // Into the cloud above the control, never below the base.
    const ceiling = root.clientHeight * clamp(base, 0.4, 0.85) * 0.7;
    engine.current?.strike(at.x, Math.min(at.y - 12, ceiling), 0.55, false);
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
      onFocus={onFocus}
      className={cn(
        // A tap strikes; every swipe stays the page's.
        "group/storm-front relative isolate h-full w-full touch-manipulation overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity group-data-live/storm-front:opacity-0"
        style={{
          ...standIn(paints, base, seed),
          transitionDuration: `${Math.round(durations.slow * 1000)}ms`,
        }}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {paints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: billows of cloud massed above a pale band, one
 * patch of them lit from within.
 */
function standIn(
  paints: readonly string[],
  base: number,
  seed: number,
): React.CSSProperties {
  const rand = lcg(seed * 5 + 3);
  const b = clamp(base, 0.4, 0.85);
  const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;
  const deep = "color-mix(in oklab, var(--background) 78%, var(--foreground))";
  const mid = "color-mix(in oklab, var(--background) 87%, var(--foreground))";
  const light = paints[2] ?? "white";
  const billows: string[] = [];
  for (let i = 0; i < 9; i += 1) {
    const x = pct(rand());
    const y = pct(b - 0.04 - rand() * 0.18);
    const rx = Math.round(10 + rand() * 12);
    billows.push(
      `radial-gradient(ellipse ${rx}% ${Math.round(rx * 1.4)}% at ${x} ${y}, ${mid}, transparent 70%)`,
    );
  }
  const lx = pct(0.25 + rand() * 0.5);
  return {
    backgroundColor:
      "color-mix(in oklab, var(--background) 94%, var(--foreground))",
    backgroundImage: [
      `radial-gradient(ellipse 22% 30% at ${lx} ${pct(b - 0.12)}, color-mix(in oklab, ${light} 38%, transparent), transparent 70%)`,
      ...billows,
      `linear-gradient(to bottom, ${deep} 0%, ${mid} ${pct(b - 0.05)}, transparent ${pct(b + 0.03)})`,
    ].join(", "),
  };
}
