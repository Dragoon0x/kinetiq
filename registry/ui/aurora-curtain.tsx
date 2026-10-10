"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type AuroraCurtainPalette = "polar" | "glacier" | "rose" | "ember";

export type AuroraCurtainProps = {
  /** The content on top of the sky: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many curtains hang in the sky, far to near, 1 to 5. @default 3 */
  curtains?: number;
  /** Ray detail, 0 (broad soft striation) to 1 (fine, dense, crisp rays). @default 0.6 */
  rays?: number;
  /** A named palette, or three CSS colours of your own: lower fringe, body, crown. @default "polar" */
  palette?: AuroraCurtainPalette | readonly string[];
  /** How tall the nearest curtain stands, as a fraction of the box, 0.2 to 0.9. @default 0.55 */
  height?: number;
  /** How deeply the curtains fold, 0 (flat sheets) to 1 (deep travelling folds). @default 0.5 */
  fold?: number;
  /** How bright the light is, 0 to 1. @default 0.7 */
  intensity?: number;
  /** How fast the curtains drift and the rays shimmer, 0 (still) to 2. @default 0.6 */
  speed?: number;
  /** The star field behind, 0 to 1; it shows only on a dark page. @default 0.5 */
  stars?: number;
  /** Height of the ridge and treeline at the foot, as a fraction of the box, 0 (none) to 0.3. @default 0.1 */
  horizon?: number;
  /** The pointer and keyboard focus gather the rays, and a press sets off a flare. @default true */
  interactive?: boolean;
  /** How hard the hand gathers the rays and how high a flare throws them, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** How far the hand reaches along a curtain, px. @default 150 */
  radius?: number;
  /** Hold the sky still; the hand still gathers and flares. @default false */
  paused?: boolean;
  /** Seeds the curtains, the stars and the ridge, so two skies never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) gathering the rays. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press or keyboard focus sets off a flare. */
  onFlare?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Pigments at fixed lightness — the lower fringe, the body, the crown — so the
 * light is the same light on a dark sky and a pale one. The polar body takes
 * the signal token's hue, its crown the accent's turned toward violet.
 */
const PALETTES: Record<AuroraCurtainPalette, readonly string[]> = {
  polar: [
    "oklch(0.66 0.2 352)",
    "oklch(from var(--signal) 0.82 0.17 h)",
    "oklch(from var(--accent) 0.6 0.16 calc(h + 40))",
  ],
  glacier: [
    "oklch(0.68 0.13 285)",
    "oklch(0.83 0.11 196)",
    "oklch(0.62 0.14 252)",
  ],
  rose: ["oklch(0.66 0.19 12)", "oklch(0.8 0.12 352)", "oklch(0.6 0.13 302)"],
  ember: ["oklch(0.64 0.19 28)", "oklch(0.83 0.13 78)", "oklch(0.58 0.17 32)"],
};

/**
 * The sky is made from the page itself — its background, the accent for the
 * zenith's blue, the ink for a pale page's ridge — so it belongs to its theme.
 */
const SKY = [
  "var(--background)",
  "var(--accent)",
  "var(--foreground)",
] as const;

/** The CSS still sky: a zenith a shade bluer than the page, a ridge a shade darker (oklab keeps the hue). */
const STILL_SKY = {
  zenith: "color-mix(in oklab, var(--background) 84%, var(--accent))",
  ground: "color-mix(in oklab, var(--background) 84%, black)",
} as const;

/** The browser draws the canvas a quarter smaller and scales it up; the rays stay crisp enough. */
const RENDER_SCALE = 0.75;
const STEP = 1 / 120;
/** The gather's place follows on glide, its presence and the flare on drift. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/** A flare's charge fades with this time constant, s; the drift spring follows it. */
/** A flare's kick: peak brightness × ω·e, so the critically damped drift spring peaks there after 1/ω (~100 ms). */
/** How far inside its span a curtain's light starts, as a fraction of the width. */
const LIT_EDGE = 0.06;
const FLARE_KICK =
  Math.sqrt(springs.drift.stiffness / springs.drift.mass) * Math.E;
/** A composed moment for the still sky. */
const STILL_TIME = 37;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Curtain = {
  /** Lower edge, from the top, in box heights. */
  base: number;
  /** How tall it stands, in box heights. */
  height: number;
  /** 0 far, 1 near. */
  depth: number;
  phase: number;
  /** Where it begins and ends, in fractions of the width. */
  x0: number;
  x1: number;
  /** Folds per box height. */
  freq: number;
  /** Its own pace and direction. */
  pace: number;
};

/** The curtains, far to near: far ones low and short, near ones tall and wide. */
function layCurtains(count: number, seed: number, height: number): Curtain[] {
  const rand = lcg(seed * 31 + 7);
  const n = clamp(Math.round(count), 1, 5);
  const tall = clamp(height, 0.2, 0.9);
  const out: Curtain[] = [];
  for (let i = 0; i < n; i += 1) {
    const depth = n === 1 ? 1 : i / (n - 1);
    const span = 0.6 + 0.55 * depth + rand() * 0.25;
    const centre = 0.2 + rand() * 0.6;
    out.push({
      base: r3(0.8 - depth * 0.19 + (rand() - 0.5) * 0.05),
      height: r3(tall * (0.42 + 0.58 * depth) * (0.88 + 0.24 * rand())),
      depth: r3(depth),
      phase: r3(rand() * 6.283),
      x0: r3(centre - span / 2),
      x1: r3(centre + span / 2),
      freq: r3(0.5 + rand() * 0.45),
      pace: r3((0.75 + rand() * 0.5) * (rand() < 0.5 ? -1 : 1)),
    });
  }
  return out;
}

/** Any CSS colour, as linear RGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return (colour: string, out: Float32Array, at: number) => {
    if (!ctx) return;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    out[at] = lin(d[0] ?? 0);
    out[at + 1] = lin(d[1] ?? 0);
    out[at + 2] = lin(d[2] ?? 0);
  };
}

/** A focus this soon after a press or a lift inside came from the hand, ms. */
const PRESS_FOCUS_MS = 1000;

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,video[controls],audio[controls],[role='button'],[role='link'],[role='slider'],[role='tab'],[role='checkbox'],[role='radio'],[role='switch'],[role='menuitem'],[role='option'],[role='combobox'],[role='spinbutton'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform int u_count;
uniform float u_ray;
uniform float u_fold;
uniform float u_intensity;
uniform float u_stars;
uniform float u_horizon;
uniform float u_dark;
uniform float u_seed;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_bg;
uniform vec3 u_accent;
uniform vec3 u_ink;
uniform vec4 u_cA[5];
uniform vec4 u_cB[5];
uniform vec4 u_hand;
uniform vec4 u_flare;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}
${GLSL_SRGB}

void main() {
  float H = u_res.y / u_px;
  float W = u_res.x / u_px;
  vec2 px = v_uv * vec2(W, H);
  vec2 q = px / H;
  float aspect = W / H;
  float t = u_time;
  float onePx = 1.0 / H;

  // The sky, from the page: on a dark page a zenith deeper and bluer than
  // the page; on a pale one a dawn, blue above and paper-white low down.
  vec3 zenith = mix(mix(u_bg, u_accent, 0.2), mix(u_bg, u_accent, 0.08) * 0.6, u_dark);
  vec3 low = mix(mix(u_bg, u_c0, 0.07), u_bg * 1.06 + u_c1 * 0.008, u_dark);
  vec3 ground = mix(mix(u_bg, u_ink, 0.2), u_bg * 0.42, u_dark);
  vec3 sky = mix(zenith, low, smoothstep(-0.1, 1.05, q.y));

  float hx = u_hand.x / H;
  float hy = u_hand.y / H;
  float hr = max(u_hand.w / H, 0.05);
  float fx = u_flare.x / H;

  vec3 light = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 5; i++) {
    if (i >= u_count) break;
    vec4 A = u_cA[i];
    vec4 B = u_cB[i];
    float base = A.x;
    float height = A.y;
    float depth = A.z;
    float ph = A.w;
    float x0 = B.x * aspect;
    float x1 = B.y * aspect;
    float fq = B.z * 6.2831853;
    float tt = t * B.w;
    float x = q.x;

    // The hand gathers the sheet toward it: the sheet coordinate is pulled
    // in from both sides, most on the curtain whose band holds the hand.
    float bandY = base - height * 0.45;
    float band = exp(-pow((hy - bandY) / (height * 0.6 + 0.1), 2.0));
    float g = u_hand.z * band * 0.75;
    float dh = x - hx;
    float gs = exp(-dh * dh / (2.0 * hr * hr));
    float gather = g * dh * gs;
    float dGather = g * gs * (1.0 - dh * dh / (hr * hr));

    // Two travelling folds; where the sheet bunches the rays crowd and the
    // light thickens (more sheet in the line of sight).
    float k1 = fq;
    float k2 = fq * 2.37;
    float a1 = x * k1 + tt * 0.42 + ph;
    float a2 = x * k2 - tt * 0.61 + ph * 2.1;
    float fold = u_fold * (0.42 / k1 * sin(a1) + 0.24 / k2 * sin(a2));
    float dFold = u_fold * (0.42 * cos(a1) + 0.24 * cos(a2));
    float u = x + fold + gather;
    float bunch = clamp(1.0 + dFold + dGather, 0.3, 2.4);

    // The lower edge ripples with the sheet, not on its own.
    float edge = base
      + 0.016 * sin(u * fq * 1.7 + tt * 0.23 + ph * 1.3)
      + 0.01 * sin(u * fq * 4.1 - tt * 0.37 + ph)
      + 0.012 * (kx_noise(vec2(u * 9.0 + ph, tt * 0.2)) - 0.5);
    float above = edge - q.y;
    float up = max(above, 0.0);

    // Rays: the sheet slides, and the rays lean very slightly toward a
    // zenith above the frame.
    float ur = u - tt * 0.018 + above * (x - aspect * 0.5) * 0.2;
    float rf = mix(12.0, 62.0, u_ray) * mix(1.35, 1.0, depth);
    float r1 = kx_noise(vec2(ur * rf, tt * 0.33 + ph * 11.0));
    float fine = clamp(1.6 - fwidth(ur * rf * 2.7) * 2.2, 0.0, 1.0);
    float r2 = kx_noise(vec2(ur * rf * 2.7 + 7.3, tt * 0.57 + ph * 5.0));
    float r = mix(r1, r2, 0.36 * fine);
    float contrast = mix(1.2, 3.4, u_ray);
    float rays = pow(clamp(r * 1.3, 0.0, 1.0), contrast) * (1.0 + contrast * 0.42);
    rays = mix(1.0, rays, mix(0.4, 0.94, u_ray));

    // A flare on this curtain: its rays there shoot up and brighten.
    float fl = 0.0;
    if (abs(float(i) - u_flare.z) < 0.5) {
      float fd = x - fx;
      fl = u_flare.y * exp(-fd * fd / (1.4 * hr * hr));
    }
    float rh = 0.55 + 0.9 * kx_noise(vec2(ur * rf * 0.31 + 3.1, tt * 0.12 + ph));
    float hgt = height * rh * (1.0 + 0.75 * fl * u_flare.w);

    // A sharp lower edge, light that thins upward, a ragged fading top.
    float lower = smoothstep(-1.2 * onePx, 1.4 * onePx, above);
    float body = exp(-up / max(hgt * 0.36, 0.01));
    float tail = 1.0 - smoothstep(hgt * 0.35, hgt * 1.08, up);
    float prof = lower * (0.7 * body + 0.3 * tail) * tail;
    float raysUp = mix(rays, rays * rays, clamp(up / max(hgt, 0.01), 0.0, 1.0));

    float env = smoothstep(x0, x0 + 0.38, u) * (1.0 - smoothstep(x1 - 0.38, x1, u));
    float I = u_intensity * env * prof * raysUp * bunch * mix(0.42, 1.0, depth)
      * (1.0 + 0.8 * g * gs + 1.5 * fl);

    // Colour by altitude: a thin pink fringe at the edge, the body, the crown.
    float alt = clamp(up / max(hgt, 0.01), 0.0, 1.0);
    vec3 c = mix(u_c1, u_c2, smoothstep(0.32, 1.0, alt));
    float fringe = exp(-up / (3.2 * onePx)) * lower * (0.3 + 1.6 * fl);
    c = mix(c, u_c0, clamp(fringe, 0.0, 0.85));
    light += c * I;
    total += I;
  }

  // A dark page: the light adds, tone-mapped so it glows without clipping.
  vec3 glow = 1.0 - exp(-light * 1.35);
  vec3 darkCol = sky + glow * (1.0 - sky * 0.6);
  // A pale page: the light is colour laid on a dawn sky, like ink.
  float cover = 1.0 - exp(-total * 1.5);
  vec3 tint = pow(light / max(total, 1e-4), vec3(1.45)) * 1.1;
  vec3 lightCol = sky * mix(vec3(1.0), tint, cover * 0.9);
  vec3 col = mix(lightCol, darkCol, u_dark);

  // Stars, on a dark page only, dimmed under the light and near the horizon.
  vec2 cell = floor(px / 6.0);
  float sh = kx_hash(cell + u_seed * 3.1);
  if (sh > 0.968) {
    vec2 at = (cell + vec2(kx_hash(cell + 1.7), kx_hash(cell + 9.2))) * 6.0;
    vec2 d = px - at;
    float twinkle = 0.65 + 0.35 * sin(t * (0.6 + sh * 2.0) + sh * 40.0);
    float s = exp(-dot(d, d) * 1.4) * (sh - 0.968) * 31.0 * twinkle;
    col += vec3(s) * u_stars * u_dark * (1.0 - cover) * smoothstep(0.95, 0.4, q.y) * 0.55;
  }

  // The ridge and its treeline, in front of everything.
  if (u_horizon > 0.001) {
    float rx = px.x / H;
    float ridge = 1.0 - u_horizon * (0.5
      + 0.32 * kx_noise(vec2(rx * 1.6 + u_seed, 0.5))
      + 0.18 * kx_noise(vec2(rx * 4.3 + u_seed * 2.0, 1.5)));
    float tc = px.x / 7.0;
    float ti = floor(tc);
    float th = kx_hash(vec2(ti, u_seed + 4.0));
    float tree = th > 0.3 ? (2.5 + 7.0 * (th - 0.3)) * max(0.0, 1.0 - abs(fract(tc) - 0.5) * 2.8) : 0.0;
    float line = ridge * H - tree * min(1.0, u_horizon * 12.0);
    float land = smoothstep(line - 0.6, line + 0.6, px.y);
    col = mix(col, ground, land);
  }

  col = kx_linearToSrgb(max(col, vec3(0.0)));
  col += (kx_hash(gl_FragCoord.xy + 0.5) - 0.5) / 255.0;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  curtains: number;
  rays: number;
  paletteKey: string;
  height: number;
  fold: number;
  intensity: number;
  speed: number;
  stars: number;
  horizon: number;
  interactive: boolean;
  pointerStrength: number;
  radius: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onFlare: () => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  flare: (x: number, y: number, strength: number) => void;
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
  let curtains: Curtain[] = [];
  const read = rgbReader();
  /** fringe, body, crown, page, accent, ink — linear RGB. */
  const colours = new Float32Array(18);
  const cA = new Float32Array(20);
  const cB = new Float32Array(20);
  let dark = 1;
  const size = { w: 0, h: 0 };
  // The moving sky starts from the same moment the still one shows.
  const sim = { t: STILL_TIME };
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };
  /** The flare: where, on which curtain, and the spring its kick rides. */
  const flare = {
    x: 0,
    curtain: -1,
    amount: 0,
    v: 0,
    grow: 1,
  };

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

  const layout = () => {
    const c = cfg;
    if (!c) return;
    curtains = layCurtains(c.curtains, c.seed, c.height);
    cA.fill(0);
    cB.fill(0);
    curtains.forEach((k, i) => {
      cA.set([k.base, k.height, k.depth, k.phase], i * 4);
      cB.set([k.x0, k.x1, k.freq, k.pace], i * 4);
    });
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    p.program.set({
      u_res: [canvas.width, canvas.height],
      u_px: canvas.width / Math.max(1, size.w),
      u_count: curtains.length,
      u_ray: clamp(c.rays, 0, 1),
      u_fold: clamp(c.fold, 0, 1),
      u_intensity: clamp(c.intensity, 0, 1),
      u_stars: clamp(c.stars, 0, 1),
      u_horizon: clamp(c.horizon, 0, 0.3),
      u_dark: dark,
      u_seed: (Math.abs(Math.round(c.seed)) % 97) + 0.5,
      u_c0: colours.subarray(0, 3),
      u_c1: colours.subarray(3, 6),
      u_c2: colours.subarray(6, 9),
      u_bg: colours.subarray(9, 12),
      u_accent: colours.subarray(12, 15),
      u_ink: colours.subarray(15, 18),
      u_cA: cA,
      u_cB: cB,
    });
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_time ?? null, c.motionSafe ? sim.t : STILL_TIME);
    gl.uniform4f(
      u.u_hand ?? null,
      hand.px,
      hand.py,
      hand.amount,
      clamp(c.radius, 40, 600),
    );
    gl.uniform4f(
      u.u_flare ?? null,
      flare.x,
      flare.amount,
      flare.curtain,
      flare.grow,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances time, the hand and the flare. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const want =
      hand.present && c.interactive ? clamp(c.pointerStrength, 0, 1) : 0;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (hand.x - hand.px) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (hand.y - hand.py) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.px += hand.vx * h;
      hand.py += hand.vy * h;
      hand.amountV +=
        ((DRIFT.stiffness * (want - hand.amount) -
          DRIFT.damping * hand.amountV) /
          DRIFT.mass) *
        h;
      hand.amount += hand.amountV * h;
      flare.v +=
        ((DRIFT.stiffness * -flare.amount - DRIFT.damping * flare.v) /
          DRIFT.mass) *
        h;
      flare.amount += flare.v * h;
      // Repeated presses stack, but the light never runs past full.
      if (flare.amount > 1.4) {
        flare.amount = 1.4;
        flare.v = Math.min(0, flare.v);
      }
    }
    const handMoving =
      Math.abs(hand.x - hand.px) + Math.abs(hand.y - hand.py) > 0.1 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5;
    if (!handMoving) {
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
    }
    const arriving =
      Math.abs(want - hand.amount) > 0.002 || Math.abs(hand.amountV) > 0.01;
    if (!arriving) {
      hand.amount = want;
      hand.amountV = 0;
    }
    const flaring = flare.amount > 0.002 || Math.abs(flare.v) > 0.01;
    if (!flaring) {
      flare.amount = 0;
      flare.v = 0;
    }
    return moving || (handMoving && hand.amount > 0.001) || arriving || flaring;
  };

  /** Reduced motion: the flare is a brightening that fades, nothing grows. */
  const fadeStill = (dt: number): boolean => {
    flare.amount = Math.max(0, flare.amount - dt / durations.page);
    return flare.amount > 0;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (
      disposed ||
      !visible.current ||
      document.hidden ||
      !c ||
      !gpu ||
      gpu.lost
    ) {
      last = 0;
      return;
    }
    // Drifting alone, the sky moves slowly enough for thirty frames a
    // second; the hand and a flare get every frame.
    const calm =
      !hand.present && hand.amount === 0 && flare.amount === 0 && flare.v === 0;
    if (calm && last && now - drawnAt < 31) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
    const moving = c.motionSafe ? step(dt) : fadeStill(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (
      disposed ||
      frame ||
      !visible.current ||
      document.hidden ||
      !gpu ||
      gpu.lost
    )
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 6; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    // The page colour says which way the light composes.
    const lum =
      0.2126 * (colours[9] ?? 0) +
      0.7152 * (colours[10] ?? 0) +
      0.0722 * (colours[11] ?? 0);
    dark = clamp((0.3 - lum) / 0.22, 0, 1);
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
    layout();
    readColours();
    resize();
    return true;
  };

  /** Which curtain is nearest a point, in px: its band's height, and only where it has light. */
  const nearestCurtain = (x: number, y: number) => {
    const u = x / Math.max(1, size.w);
    let best = -1;
    let gap = Infinity;
    curtains.forEach((k, i) => {
      const band = (k.base - k.height * 0.45) * size.h;
      // Outside its span a curtain is dark there: a far worse match than any height.
      const outside = Math.max(0, k.x0 + LIT_EDGE - u, u - (k.x1 - LIT_EDGE));
      const d =
        Math.abs(y - band) / (0.6 + 0.4 * k.depth) + outside * 4 * size.h;
      if (d < gap) {
        gap = d;
        best = i;
      }
    });
    return best;
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS still sky stays, and nothing retries.
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
      if (
        was.curtains !== next.curtains ||
        was.seed !== next.seed ||
        was.height !== next.height
      ) {
        layout();
        flare.curtain = -1;
      }
      if (was.dpr !== next.dpr) resize();
      if (was.paletteKey !== next.paletteKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) {
        hand.px = hand.x;
        hand.py = hand.y;
        hand.amount =
          hand.present && next.interactive
            ? clamp(next.pointerStrength, 0, 1)
            : 0;
        flare.v = 0;
        flare.grow = 0;
      } else {
        flare.grow = 1;
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
    handTo(x, y, source) {
      const c = cfg;
      // A still stand-in has no hand to report.
      if (!c?.interactive || failed || !gpu || gpu.lost) return;
      if (!hand.present || hand.amount < 0.01) {
        hand.px = x;
        hand.py = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (!c.motionSafe) {
        // Reduced motion: the gather lands exactly where the hand is.
        hand.px = x;
        hand.py = y;
        hand.amount = clamp(c.pointerStrength, 0, 1);
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) hand.amount = 0;
      kick();
    },
    flare(x, y, strength) {
      const c = cfg;
      if (!c?.interactive || !gpu) return;
      const target = nearestCurtain(x, y);
      if (target < 0) return;
      // The flare burns where the curtain has light, as near the press as it can.
      const k = curtains[target];
      if (k)
        x = clamp(x, (k.x0 + LIT_EDGE) * size.w, (k.x1 - LIT_EDGE) * size.w);
      const power = clamp(c.pointerStrength, 0, 1) * strength;
      if (flare.amount < 0.05 || flare.curtain !== target) {
        flare.curtain = target;
        flare.x = x;
      } else {
        // A second press on a burning curtain moves the flare along it.
        flare.x += (x - flare.x) * 0.6;
      }
      if (c.motionSafe) {
        // A velocity kick: the light rises in ~100 ms and is gone by ~800 ms, without a wobble.
        flare.v += FLARE_KICK * (0.55 + 0.6 * power);
        flare.grow = 1;
      } else {
        flare.amount = 0.4 + 0.6 * power;
        flare.grow = 0;
      }
      c.onFlare();
      kick();
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
 * A night sky with an aurora in it: tall curtains of light with a sharp lower
 * edge, a body of fine vertical rays, and a ragged top that fades into the
 * sky, drifting over a low ridge and treeline, with the content on top in its
 * own layer. Each curtain is a sheet sampled through travelling folds — where
 * the sheet bunches the rays crowd and the light thickens, where it spreads
 * they thin — and coloured by altitude: a thin pink fringe at the edge, the
 * body, the crown. Far curtains sit low and dim, near ones stand tall.
 *
 * The pointer gathers the rays: the sheet is drawn in toward the hand from
 * both sides, so the rays slide together and brighten under it, the place
 * following on glide and the presence arriving on drift. A press sets off a
 * breakup on the nearest curtain — its rays there shoot up and brighten and
 * the fringe flashes pink — through a charge that fades and a critically
 * damped spring with the drift constants that follows it, so the light rises
 * fast and dies away without a wobble. Keyboard focus on a control inside
 * brings the gather there with a softer flare. Thirty frames a second while it
 * only drifts, every frame while the hand works; nothing off screen or in a
 * hidden page. Without WebGL2 a CSS still sky stands in; under reduced motion
 * one still sky is drawn, the gather lands where the hand is, and a flare is a
 * brightening that fades without growing.
 */
export function AuroraCurtain({
  children,
  curtains = 3,
  rays = 0.6,
  palette = "polar",
  height = 0.55,
  fold = 0.5,
  intensity = 0.7,
  speed = 0.6,
  stars = 0.5,
  horizon = 0.1,
  interactive = true,
  pointerStrength = 0.6,
  radius = 150,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onFlare,
  className,
}: AuroraCurtainProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(() => {
    const list =
      typeof palette === "string"
        ? (PALETTES[palette] ?? PALETTES.polar)
        : palette.length >= 3
          ? palette.slice(0, 3)
          : PALETTES.polar;
    return [...list, ...SKY];
  }, [palette]);
  const paletteKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);
  const flared = React.useRef(onFlare);

  const config: Config = {
    curtains,
    rays,
    paletteKey,
    height,
    fold,
    intensity,
    speed,
    stars,
    horizon,
    interactive,
    pointerStrength,
    radius,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
    onFlare: () => flared.current?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
    flared.current = onFlare;
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

  /** When the hand last pressed or lifted inside, so the focus it causes is not taken for the keyboard. */
  const pressedAt = React.useRef(-Infinity);

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
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    pressedAt.current = performance.now();
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    engine.current?.handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit))
      engine.current?.flare(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    // A tap focuses its target after the finger lifts.
    pressedAt.current = performance.now();
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
    // A text field shows a focus ring even when clicked; a press is not the keyboard.
    if (performance.now() - pressedAt.current < PRESS_FOCUS_MS) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    engine.current?.flare(at.x, at.y, 0.55);
  };

  // A key pressed inside means the next focus is the keyboard's, however
  // recently the hand pressed.
  const onKeyDown = () => {
    pressedAt.current = -Infinity;
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    engine.current?.handAway("focus");
  };

  const still = layCurtains(curtains, seed, height);

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
      onKeyDownCapture={onKeyDown}
      className={cn(
        // Nothing is dragged here; the page keeps its vertical scroll on touch.
        "group/aurora-curtain relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/aurora-curtain:opacity-0"
        style={{
          backgroundImage: `linear-gradient(to bottom, ${STILL_SKY.zenith}, var(--background))`,
        }}
      >
        {still.map((k, i) => (
          <div
            key={i}
            className="absolute"
            style={standInCurtain(k, paints[1] ?? "currentColor", intensity)}
          />
        ))}
        {horizon > 0.001 ? (
          <div
            className="absolute inset-x-0 bottom-0"
            style={standInRidge(horizon, seed)}
          />
        ) : null}
      </div>
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

/** One curtain of the still sky: fine stripes of the body colour fading upward from a hard edge. */
function standInCurtain(
  k: Curtain,
  body: string,
  intensity: number,
): React.CSSProperties {
  const left = Math.max(-10, Math.round(k.x0 * 100));
  const right = Math.max(-10, Math.round((1 - k.x1) * 100));
  const top = Math.round((k.base - k.height) * 100);
  const tall = Math.round(k.height * 100);
  const alpha = Math.round(
    (0.25 + 0.5 * k.depth) * clamp(intensity, 0, 1) * 100,
  );
  const ray = `color-mix(in oklab, ${body} ${alpha}%, transparent)`;
  const mist = `color-mix(in oklab, ${body} ${Math.round(alpha * 0.45)}%, transparent)`;
  const mask =
    "linear-gradient(to top, black, color-mix(in oklab, black 40%, transparent) 45%, transparent)";
  const ends =
    "linear-gradient(to right, transparent, black 22%, black 78%, transparent)";
  return {
    left: `${left}%`,
    right: `${right}%`,
    top: `${top}%`,
    height: `${tall}%`,
    backgroundImage: `repeating-linear-gradient(90deg, ${ray} 0 1px, transparent 1px 3px, ${mist} 3px 5px, transparent 5px 7px), linear-gradient(to top, ${mist}, transparent)`,
    maskImage: `${mask}, ${ends}`,
    maskComposite: "intersect",
  };
}

/** The ridge of the still sky, as a seeded polygon in whole percentages. */
function standInRidge(horizon: number, seed: number): React.CSSProperties {
  const rand = lcg(seed * 17 + 3);
  const points: string[] = ["0% 100%"];
  for (let i = 0; i <= 12; i += 1) {
    const y = Math.round(100 - (50 + rand() * 45));
    points.push(`${Math.round((i / 12) * 100)}% ${y}%`);
  }
  points.push("100% 100%");
  return {
    height: `${Math.round(clamp(horizon, 0, 0.3) * 100)}%`,
    backgroundColor: STILL_SKY.ground,
    clipPath: `polygon(${points.join(", ")})`,
  };
}
