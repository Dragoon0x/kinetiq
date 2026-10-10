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
import { easings, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BeaconPillarProps = {
  /** The content beside the light: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How wide the pillar's body is, px (held under 45 % of the box). @default 90 */
  width?: number;
  /** How bright the pillar burns, 0.2 to 1.5. @default 1 */
  intensity?: number;
  /** The light's colour, any CSS colour; it is taken at a fixed light lightness so both themes read it the same. @default "var(--warn)" */
  color?: string;
  /** Where the pillar stands across the box, 0 (left) to 1 (right). @default 0.5 */
  position?: number;
  /** Where the floor line sits, as a fraction of the height. @default 0.84 */
  floor?: number;
  /** How much the edges waver with heat, 0 to 1. @default 0.5 */
  shimmer?: number;
  /** How many motes rise through the light, 0 (none) to 1. @default 0.5 */
  motes?: number;
  /** The soft glow of air around the pillar, 0 to 1. @default 0.5 */
  haze?: number;
  /** How fast the motes and the heat rise, 0 (still) to 2. @default 1 */
  speed?: number;
  /** The pointer and keyboard focus bend the pillar, and a press surges it. @default true */
  interactive?: boolean;
  /** How far the pillar leans toward the hand and how hard a press surges it, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the motes and the heat still; the pillar still leans. @default false */
  paused?: boolean;
  /** Seeds the motes and the heat, so two pillars never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) bending the pillar. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press sends a surge up the column. */
  onSurge?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const RENDER_SCALE = 0.75;
const STEP = 1 / 120;
const CALM_FRAME = 31;
/** The floor ring travels out over this long, on the enter easing. */
const RING = 0.7;
/** A surge's push into the drift spring: peaks near 1 a tenth of a second in. */
const SURGE = 26;
const GLIDE = springs.glide;
const DRIFT = springs.drift;
const [E1, E2, E3, E4] = easings.enter;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** The house enter curve as a function, for the ring's tween. */
function enterEase(t: number): number {
  // Solve the cubic bezier for x by a few Newton steps; t is already 0–1.
  let u = t;
  for (let i = 0; i < 5; i += 1) {
    const x =
      3 * (1 - u) * (1 - u) * u * E1 + 3 * (1 - u) * u * u * E3 + u * u * u;
    const dx =
      3 * (1 - u) * (1 - u) * E1 +
      6 * (1 - u) * u * (E3 - E1) +
      3 * u * u * (1 - E3);
    if (Math.abs(dx) < 1e-6) break;
    u = clamp(u - (x - t) / dx, 0, 1);
  }
  return 3 * (1 - u) * (1 - u) * u * E2 + 3 * (1 - u) * u * u * E4 + u * u * u;
}

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

/** The light as a pigment at a fixed lightness, and its near-white core. */
const lightOf = (c: string) => `oklch(from ${c} 0.8 calc(c * 0.9) h)`;
const coreOf = (c: string) => `oklch(from ${c} 0.97 calc(c * 0.22) h)`;

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_rise;
uniform float u_heat;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_col;
uniform vec3 u_core;
uniform float u_width;
uniform float u_x0;
uniform float u_floor;
uniform float u_lean;
uniform float u_intensity;
uniform float u_shimmer;
uniform float u_motes;
uniform float u_haze;
uniform float u_surge;
uniform float u_ring;
uniform vec3 u_hand;
uniform vec2 u_seed;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
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
  for (int i = 0; i < 3; i++) {
    s += a * noise(p);
    p = turn * p * 2.03 + 7.1;
    a *= 0.5;
  }
  return s / 0.875;
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

// Where the pillar's middle is at height y: planted at the floor, leaning
// more the higher it climbs.
float centre(float y) {
  float up = clamp((u_floor - y) / max(u_floor, 1.0), 0.0, 1.4);
  return u_x0 + u_lean * up * up;
}

// The beam across: a near-white core, a body and a wide faint halo.
vec3 profile(float x, float y, float halfW) {
  float u = (x - centre(y)) / halfW;
  return vec3(exp(-u * u * 14.0), exp(-u * u * 1.3), exp(-u * u * 0.3));
}

void main() {
  vec2 size = u_res / u_px;
  vec2 p = v_uv * size;
  float up = clamp((u_floor - p.y) / max(u_floor, 1.0), 0.0, 1.4);
  float halfW = u_width * 0.5 * (1.0 + 0.3 * up);

  // Heat: the sides waver on a field that flows upward; the core holds.
  float c0 = centre(p.y);
  float side = smoothstep(0.25, 1.1, abs(p.x - c0) / halfW);
  float n = noise(vec2(p.x / 16.0, (p.y + u_heat * 46.0) / 22.0) + u_seed);
  float n2 = noise(vec2(p.x / 7.0, (p.y + u_heat * 70.0) / 11.0) - u_seed);
  float wave = ((n - 0.5) * 1.4 + (n2 - 0.5) * 0.6) * u_shimmer * (3.0 + 9.0 * up);
  float x = p.x + wave * (0.3 + 0.7 * side);

  vec3 prof = profile(x, p.y, halfW);
  // Brightness climbs in slow bands, and the body is never quite even.
  float bands = 0.86 + 0.14 * sin((p.y + u_heat * 34.0) / 21.0 + n * 2.0);
  float body = 0.7 + 0.6 * fbm(vec2((x - c0) / halfW * 0.9, (p.y + u_heat * 30.0) / 80.0) + u_seed * 0.5);
  float climb = 0.3 + 0.7 * exp(-up * 1.25);
  float above = smoothstep(0.0, 6.0, u_floor - p.y);
  float surge = 1.0 + 0.6 * u_surge;
  float handSide = u_hand.z * smoothstep(-1.0, 1.0, sign(u_hand.x - c0) * (p.x - c0) / halfW);
  float glowBeam = (prof.y * 0.55 * body * bands + prof.z * 0.07 * (0.4 + u_haze) * (1.0 + 0.4 * handSide)) * climb * above * surge;
  float coreBeam = prof.x * 0.9 * climb * above * surge;

  // The pool on the floor, a wider wash and the ring a surge sends out.
  float fx = (p.x - centre(u_floor)) / (u_width * 2.6);
  float fy = (p.y - u_floor) / (u_width * 0.42);
  float e = sqrt(fx * fx + fy * fy);
  float pool = exp(-e * e * 2.2) * 0.8 + exp(-e * e * 0.5) * 0.05 * (0.5 + u_haze);
  float ringR = u_ring * 2.4;
  float ring = u_ring > 0.0 && u_ring < 1.0
    ? exp(-((e - ringR) / 0.16) * ((e - ringR) / 0.16)) * (1.0 - u_ring) * (1.0 - u_ring) * 0.9
    : 0.0;

  // Below the floor: a faint, rippled reflection of the column.
  float below = max(p.y - u_floor, 0.0);
  float mirrorY = u_floor - below * 1.8;
  float rip = (noise(vec2(p.x / 9.0, p.y / 3.0 + u_heat * 0.6)) - 0.5) * 6.0 * u_shimmer;
  vec3 mprof = profile(p.x + rip, mirrorY, u_width * 0.5);
  float mirror = (mprof.x * 0.5 + mprof.y * 0.35) * exp(-below / (u_width * 0.55)) * step(0.0, p.y - u_floor) * 0.45;

  // Motes rise through it in three depths, bent with the column.
  float motes = 0.0;
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float cell = 30.0 + fj * 16.0;
    vec2 q = vec2(p.x - centre(p.y), p.y + u_rise * (0.55 + 0.35 * fj)) / cell;
    vec2 id = floor(q);
    vec2 h = hash2(id + u_seed * (3.0 + fj));
    if (hash(id * 1.37 + fj * 11.0 + u_seed) > u_motes * 0.8) continue;
    float sway = sin(u_heat * (0.7 + 0.4 * h.y) + h.x * 6.2831) * 0.16;
    vec2 at = vec2(0.18 + h.x * 0.64 + sway, 0.2 + h.y * 0.6);
    float d = length((fract(q) - at) * cell);
    float r = 0.55 + fj * 0.45 + h.y * 0.35;
    float dot1 = smoothstep(r + 0.9, r - 0.2, d);
    float twinkle = 0.55 + 0.45 * sin(u_heat * (1.6 + h.x) + h.y * 6.2831);
    float inside = prof.y * 0.85 + prof.z * 0.12;
    float fade = smoothstep(0.0, 0.08, up) * exp(-up * 0.9);
    motes += dot1 * twinkle * inside * fade * (0.7 + 0.3 * fj);
  }

  float I = u_intensity;
  vec3 L = lin(u_col);
  vec3 C = lin(u_core);
  // Two kinds of light: the coloured glow and the near-white core.
  float glow = (glowBeam + pool * 0.5 * surge + mirror + ring * 0.5) * I;
  float core = (coreBeam + ring * 0.4 + pool * 0.12) * I + motes * 1.2 * (1.0 + 0.5 * u_surge);

  // The room: a deep ground on a dark page, a pale dusk on a light one,
  // the floor a touch lighter than the wall.
  vec3 night = lin(u_bg) * 0.72 + L * 0.004;
  vec3 dusk = lin(mix(mix(u_bg, u_fg, 0.15), u_col, 0.05));
  vec3 ground = mix(night, dusk, u_light);
  ground *= 1.0 + 0.05 * smoothstep(u_floor - 6.0, u_floor + 10.0, p.y);
  // In the dark, light lands like a screen: toward white, never past it.
  vec3 dark = 1.0 - (1.0 - ground) * exp(-(L * glow + C * core));
  // In daylight a glow cannot brighten much, so it colours: the column is
  // the light's own hue, its core still burns toward white.
  vec3 day = mix(ground, L * 1.1, clamp(glow * 0.62, 0.0, 0.88));
  day = 1.0 - (1.0 - day) * exp(-C * core * 1.6);
  vec3 col = mix(dark, day, u_light);
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
  colorKey: string;
  width: number;
  intensity: number;
  position: number;
  floor: number;
  shimmer: number;
  motes: number;
  haze: number;
  speed: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onSurge: () => void;
};

type Source = "pointer" | "focus";

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: Source) => void;
  handAway: (source: Source) => void;
  /** A surge up the column; `hold` matters only under reduced motion. */
  surge: (strength: number, hold: boolean) => void;
  letGo: () => void;
  dispose: () => void;
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
  let active = false;
  const read = rgbReader();
  const colours = new Float32Array(12);
  const size = { w: 0, h: 0 };
  let light = 0;
  /** Seconds of heat and px of rise, both accumulated so speed changes never jump. */
  const sim = { heat: 0, rise: 0 };
  const hand = {
    x: 0,
    y: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as Source | null,
  };
  const lean = { x: 0, v: 0 };
  const surge = { x: 0, v: 0, held: false };
  /** Seconds since the ring left; past RING it is gone. */
  let ring = RING;

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

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

  const widthOf = (c: Config) =>
    clamp(c.width, 12, Math.max(12, size.w * 0.45));
  const baseX = (c: Config) => clamp(c.position, 0, 1) * size.w;

  /** How far the top of the frame leans toward the hand, px. */
  const leanFor = (c: Config) => {
    if (!hand.present || !c.interactive) return 0;
    const reach = clamp((hand.x - baseX(c)) / Math.max(1, size.w * 0.5), -1, 1);
    return reach * widthOf(c) * 0.6 * clamp(c.pointerStrength, 0, 1);
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const rand = lcg(c.seed * 17 + 5);
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_light ?? null, light);
    gl.uniform1f(u.u_width ?? null, widthOf(c));
    gl.uniform1f(u.u_x0 ?? null, baseX(c));
    gl.uniform1f(u.u_floor ?? null, clamp(c.floor, 0.5, 0.98) * size.h);
    gl.uniform1f(u.u_intensity ?? null, clamp(c.intensity, 0, 2));
    gl.uniform1f(u.u_shimmer ?? null, clamp(c.shimmer, 0, 1));
    gl.uniform1f(u.u_motes ?? null, clamp(c.motes, 0, 1));
    gl.uniform1f(u.u_haze ?? null, clamp(c.haze, 0, 1));
    gl.uniform2f(u.u_seed ?? null, rand() * 9, rand() * 9);
    const names = ["u_bg", "u_fg", "u_col", "u_core"];
    for (let i = 0; i < 4; i += 1) {
      gl.uniform3f(
        u[names[i] ?? "u_bg"] ?? null,
        colours[i * 3] ?? 0,
        colours[i * 3 + 1] ?? 0,
        colours[i * 3 + 2] ?? 0,
      );
    }
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_rise ?? null, sim.rise);
    gl.uniform1f(u.u_heat ?? null, sim.heat);
    gl.uniform1f(u.u_lean ?? null, lean.x);
    gl.uniform1f(u.u_surge ?? null, Math.max(0, surge.x));
    gl.uniform1f(
      u.u_ring ?? null,
      ring < RING && c.motionSafe ? enterEase(ring / RING) : -1,
    );
    gl.uniform3f(u.u_hand ?? null, hand.x, hand.y, hand.amount);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const rising = !c.paused && c.speed > 0;
    if (rising) {
      const pace = clamp(c.speed, 0, 2);
      sim.heat += dt * pace;
      // A surge hurries the motes up the column, three times at its peak.
      sim.rise += dt * pace * 26 * (1 + 2 * Math.max(0, surge.x));
      moving = true;
    }
    if (ring < RING) {
      ring += dt;
      moving = true;
    }
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    const bend = leanFor(c);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      // Heavy and hot: the lean follows on drift, the side warmth on glide.
      lean.v +=
        ((DRIFT.stiffness * (bend - lean.x) - DRIFT.damping * lean.v) /
          DRIFT.mass) *
        h;
      lean.x += lean.v * h;
      hand.amountV +=
        ((GLIDE.stiffness * (want - hand.amount) -
          GLIDE.damping * hand.amountV) /
          GLIDE.mass) *
        h;
      hand.amount += hand.amountV * h;
      surge.v +=
        ((-DRIFT.stiffness * surge.x - DRIFT.damping * surge.v) / DRIFT.mass) *
        h;
      surge.x += surge.v * h;
    }
    const leaning = Math.abs(bend - lean.x) > 0.05 || Math.abs(lean.v) > 0.5;
    if (!leaning) {
      lean.x = bend;
      lean.v = 0;
    }
    const arriving =
      Math.abs(want - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = want;
      hand.amountV = 0;
    }
    const surging = Math.abs(surge.x) > 0.002 || Math.abs(surge.v) > 0.02;
    if (!surging) {
      surge.x = 0;
      surge.v = 0;
    }
    return moving || leaning || arriving || surging;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const calm =
      !hand.present &&
      lean.x === 0 &&
      hand.amount === 0 &&
      surge.x === 0 &&
      ring >= RING;
    if (calm && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : false;
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden || !gpu)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  /** Reduced motion: the lean and the light land exactly where they are going. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    lean.x = leanFor(c);
    lean.v = 0;
    hand.amount =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    hand.amountV = 0;
    surge.x = surge.held ? 0.6 : 0;
    surge.v = 0;
    ring = RING;
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
    size.w = w;
    size.h = h;
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
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) place();
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
    handTo(x, y, source) {
      const c = cfg;
      if (!c || !c.interactive) return;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (!c.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    surge(strength, hold) {
      const c = cfg;
      if (!c || !c.interactive) return;
      c.onSurge();
      if (!c.motionSafe) {
        // Still frames: the column is brighter for as long as the press.
        surge.held = hold;
        place();
        draw();
        return;
      }
      surge.v +=
        SURGE * clamp(strength, 0, 1) * (0.5 + 0.5 * c.pointerStrength);
      ring = 0;
      kick();
    },
    letGo() {
      if (!surge.held) return;
      surge.held = false;
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
      }
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };
}

/**
 * A background of one vertical pillar of light standing on a floor and
 * rising past the top of the frame: a near-white core, a body in the light's
 * colour and a wide faint halo, fading as it climbs with slow bands of
 * brightness rising through it. Its edges waver with heat, a pool of light
 * spreads across the floor with a rippled reflection under it, and motes
 * drift up through the column in three depths, bright only inside it.
 *
 * The pillar bends toward the hand: planted at the floor, leaning more the
 * higher it climbs, on the drift spring, so it sways like something heavy
 * and hot. A press on the bare background sends a surge up it — an impulse
 * into a critically damped drift spring that peaks in a tenth of a second
 * and falls away — brightening the column, hurrying the motes and sending a
 * ring of light out across the floor on the enter easing. Keyboard focus on
 * a control inside is the hand there, with a half surge. One fullscreen
 * WebGL2 draw at three quarters of the capped pixel ratio, 30 frames a second
 * while it only rises, nothing off screen or in a hidden page. Without WebGL2
 * a CSS still frame stands in; under reduced motion one still frame is drawn
 * and the lean lands exactly where the hand puts it.
 */
export function BeaconPillar({
  children,
  width = 90,
  intensity = 1,
  color = "var(--warn)",
  position = 0.5,
  floor = 0.84,
  shimmer = 0.5,
  motes = 0.5,
  haze = 0.5,
  speed = 1,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onSurge,
  className,
}: BeaconPillarProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(
    () => [
      "var(--background)",
      "var(--foreground)",
      lightOf(color),
      coreOf(color),
    ],
    [color],
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportActive = React.useRef(onActiveChange);
  const reportSurge = React.useRef(onSurge);
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    colorKey: color,
    width,
    intensity,
    position,
    floor,
    shimmer,
    motes,
    haze,
    speed,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => reportActive.current?.(a),
    onSurge: () => reportSurge.current?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportActive.current = onActiveChange;
    reportSurge.current = onSurge;
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
    const listening = unlisten;
    return () => {
      listening.current?.();
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

  const letGo = () => {
    unlisten.current?.();
    engine.current?.letGo();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.surge(1, true);
    unlisten.current?.();
    const id = event.pointerId;
    const end = (e: PointerEvent) => {
      if (e.pointerId === id) letGo();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    unlisten.current = () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      unlisten.current = null;
    };
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    letGo();
    if (event.pointerType === "touch") engine.current?.handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.surge(0.5, false);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        // A sideways finger bends the light on touch; an upright one scrolls.
        "group/beacon-pillar relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/beacon-pillar:opacity-0"
        style={standIn(paints, position, floor)}
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
 * browser without WebGL2: the column as a tall soft ellipse of the light,
 * its core a narrow brighter one, and the pool on the floor.
 */
function standIn(
  paints: readonly string[],
  position: number,
  floor: number,
): React.CSSProperties {
  const x = Math.round(clamp(position, 0, 1) * 1000) / 10;
  const y = Math.round(clamp(floor, 0.5, 0.98) * 1000) / 10;
  const glow = paints[2] ?? "white";
  const core = paints[3] ?? "white";
  return {
    backgroundColor:
      "color-mix(in oklab, var(--background) 93%, var(--foreground))",
    backgroundImage: [
      `radial-gradient(ellipse 3% 70% at ${x}% ${y}%, ${core} 0, transparent 70%)`,
      `radial-gradient(ellipse 9% 95% at ${x}% ${y}%, color-mix(in oklab, ${glow} 70%, transparent) 0, transparent 70%)`,
      `radial-gradient(ellipse 26% 12% at ${x}% ${y}%, color-mix(in oklab, ${glow} 60%, transparent) 0, transparent 70%)`,
      `radial-gradient(ellipse 30% 110% at ${x}% ${y}%, color-mix(in oklab, ${glow} 14%, transparent) 0, transparent 70%)`,
    ].join(", "),
  };
}
