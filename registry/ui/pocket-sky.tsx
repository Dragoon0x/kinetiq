"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFramebuffer,
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  type Framebuffer,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PocketSkyTime = "morning" | "day" | "evening";

export type PocketSkyProps = {
  /** The content above the sky: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How much of the sky the clouds cover, 0 (a couple of fair-weather clouds) to 1 (crowded). @default 0.45 */
  coverage?: number;
  /** The sun's height, 0 (on the horizon) to 1 (high in the sky). @default 0.55 */
  sunHeight?: number;
  /** How hard the hand's wind pulls the clouds along, 0 to 1. @default 0.6 */
  windDrag?: number;
  /** The light: a pale morning, a blue day or a warm evening. @default "day" */
  timeOfDay?: PocketSkyTime;
  /** Where the sun stands across the sky, 0 (left) to 1 (right). @default 0.64 */
  sunX?: number;
  /** How strongly light shafts break through the gaps, 0 to 1. @default 0.6 */
  rays?: number;
  /** The sky's own breeze and the clouds' slow boil, 0 (still) to 1. @default 0.3 */
  drift?: number;
  /** About how long torn clouds take to gather themselves again, in seconds. @default 4 */
  gather?: number;
  /** Dragging, taps and keys make wind. @default true */
  interactive?: boolean;
  /** Hold the sky still; the hand's wind still moves it. @default false */
  paused?: boolean;
  /** Names the sky for assistive technology. @default "Push the clouds" */
  label?: string;
  /** Seeds the clouds' shapes and places, so two skies never match. @default 6 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when wind starts (true), from a drag, a tap or a key, and when the clouds have gathered again (false). */
  onWindChange?: (blowing: boolean) => void;
  /** Shows the sky but takes no input. @default false */
  disabled?: boolean;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** The props a sky must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button:not([data-sky]),input,select,textarea,label,summary,[role='button'],[role='link'],[role='tab'],[contenteditable='true']";

/** Zenith, horizon, sun, sunlit cloud, cloud shadow, silver lining: fixed art, a sky is a sky in either theme. */
const SKIES: Record<PocketSkyTime, readonly string[]> = {
  morning: [
    "oklch(0.72 0.085 238)",
    "oklch(0.9 0.05 68)",
    "oklch(0.97 0.07 86)",
    "oklch(0.97 0.025 75)",
    "oklch(0.68 0.035 288)",
    "oklch(0.99 0.05 86)",
  ],
  day: [
    "oklch(0.6 0.12 248)",
    "oklch(0.87 0.05 222)",
    "oklch(0.99 0.025 95)",
    "oklch(0.985 0.006 250)",
    "oklch(0.7 0.03 256)",
    "oklch(1 0 0)",
  ],
  evening: [
    "oklch(0.4 0.08 282)",
    "oklch(0.77 0.12 50)",
    "oklch(0.91 0.12 70)",
    "oklch(0.86 0.08 52)",
    "oklch(0.46 0.05 320)",
    "oklch(0.95 0.1 72)",
  ],
};

const MAX_PUFFS = 64;
const STEP = 1 / 120;
/** The hand's wind reaches this far either side of its path, in box heights. */
const REACH = 0.2;
/** A keyboard gust sweeps the sky in this long, s. */
const GUST = 0.7;
/**
 * Clouds gather with the drift spring's damping ratio (1: no overshoot), at
 * the slower period `gather` sets, because a cloud is a large surface.
 */
const GATHER_ZETA =
  springs.drift.damping /
  (2 * Math.sqrt(springs.drift.stiffness * springs.drift.mass));

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const toLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/**
 * Pass one: the clouds' density, at half resolution. Each puff is a smooth
 * kernel stretched along its own wind; the noise that erodes the edges is
 * carried with the puffs, so a cloud's texture travels with it.
 */
const DENSITY = /* glsl */ `
${GLSL_NOISE}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_time;
uniform int u_count;
uniform vec4 u_pa[64];
uniform vec4 u_pb[64];

void main() {
  vec2 p = v_uv * u_res;
  float d = 0.0;
  float wsum = 0.0;
  vec2 carry = vec2(0.0);
  for (int i = 0; i < 64; i++) {
    if (i >= u_count) break;
    vec4 a = u_pa[i];
    vec4 b = u_pb[i];
    vec2 q = p - a.xy;
    float s = max(length(b.xy), 1.0);
    vec2 dir = b.xy / s;
    float along = dot(q, dir);
    // Stretched along its wind and thinner across it as it goes.
    q = dir * (along / s) + (q - dir * along) * mix(1.0, 1.35, (s - 1.0) * 0.5);
    float r2 = dot(q, q) / (a.z * a.z);
    if (r2 >= 1.0) continue;
    float k = (1.0 - r2) * (1.0 - r2);
    d += a.w * k;
    wsum += k;
    carry += k * b.zw;
  }
  vec2 moved = wsum > 1e-4 ? carry / wsum : vec2(0.0);
  vec2 np = (p - moved) / u_res.y * 6.0 + vec2(u_time * 0.4, -u_time * 0.25);
  // Warped noise erodes the edges into billows, so a puff reads as vapour.
  vec2 warp = vec2(kx_fbm(np + 3.1), kx_fbm(np + 7.7)) - 0.5;
  float n = kx_fbm(np + warp * 1.3);
  n = clamp((n - 0.5) * 2.4 + 0.5, 0.0, 1.0);
  float billow = kx_noise(np * 2.7 + warp * 2.0);
  float rho = d * (0.3 + 1.1 * n + 0.3 * billow) - 0.4;
  o_color = vec4(clamp(rho, 0.0, 1.0), 0.0, 0.0, 1.0);
}
`;

/** Pass two: the sky, the sun, light shafts through the gaps, and the clouds lit. */
const COMPOSE = /* glsl */ `
${GLSL_SRGB}
in vec2 v_uv;
out vec4 o_color;
uniform sampler2D u_cloud;
uniform vec2 u_res;
uniform vec2 u_sun;
uniform float u_rays;
uniform vec3 u_zenith;
uniform vec3 u_horizon;
uniform vec3 u_sunCol;
uniform vec3 u_lit;
uniform vec3 u_shadow;
uniform vec3 u_silver;

float dens(vec2 px) { return texture(u_cloud, clamp(px / u_res, 0.0, 1.0)).r; }

float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 p = v_uv * u_res;
  float H = u_res.y;
  float t = p.y / H;
  vec3 sky = mix(u_zenith, u_horizon, pow(clamp(t, 0.0, 1.0), 1.3));
  vec2 toSun = u_sun - p;
  float ds = length(toSun);
  float glow = exp(-ds / (H * 0.32));
  sky += u_sunCol * (0.45 * glow + 0.7 * exp(-ds / (H * 0.05)));
  float r = H * 0.045;
  sky = mix(sky, u_sunCol * 1.15, 1.0 - smoothstep(r - 1.0, r + 1.0, ds));

  // Light shafts: walk toward the sun; every clear stretch of sky near it
  // lights the air, every cloud on the way shades it.
  float shaft = 0.0;
  float wsum = 0.0;
  for (int i = 0; i < 18; i++) {
    float f = (float(i) + grain(p + float(i))) / 18.0;
    vec2 at = p + toSun * f;
    float clear = 1.0 - dens(at);
    float w = 0.6 + 0.4 * f;
    shaft += clear * w;
    wsum += w;
  }
  shaft = shaft / wsum;
  float reach = exp(-ds / (H * 0.9));
  float open = 1.0 - dens(p);
  sky += u_sunCol * u_rays * reach * (shaft - 0.55) * 0.9 * open;

  float rho = dens(p);
  float alpha = smoothstep(0.0, 0.55, rho);
  vec2 dir = ds > 1.0 ? toSun / ds : vec2(0.0, -1.0);
  float tau = 0.0;
  for (int j = 1; j <= 4; j++) tau += dens(p + dir * float(j) * H * 0.03);
  float lit = exp(-tau * 0.45);
  float above = dens(p - vec2(0.0, H * 0.05));
  float below = dens(p + vec2(0.0, H * 0.05));
  float belly = smoothstep(-0.05, 0.45, above - below + rho * 0.4);
  vec3 cloud = mix(u_shadow, u_lit, clamp(0.32 + 0.68 * lit, 0.0, 1.0));
  cloud = mix(cloud, u_shadow * 0.95, belly * 0.3);
  // The thin edges nearest the sun go silver.
  float rim = (1.0 - smoothstep(0.0, 0.42, rho)) * alpha * exp(-ds / (H * 0.55));
  cloud += u_silver * rim * 1.5;
  vec3 c = mix(sky, cloud, alpha);
  c += (grain(gl_FragCoord.xy) - 0.5) / 255.0;
  o_color = vec4(kx_linearToSrgb(clamp(c, 0.0, 1.0)), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  density: Program;
  compose: Program;
  triD: FullscreenTriangle;
  triC: FullscreenTriangle;
  fbo: Framebuffer | null;
  lost: boolean;
};

type Cloud = { x: number; y: number; lane: number; vx: number; vy: number };

type Sky = {
  /** Width in box heights; everything here is in box heights. */
  W: number;
  clouds: Cloud[];
  count: number;
  owner: Int32Array;
  hx: Float32Array;
  hy: Float32Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  r: Float32Array;
  d: Float32Array;
  /** The stretch each puff shows, eased toward its speed. */
  sx: Float32Array;
  sy: Float32Array;
  t: number;
  boil: number;
  last: number;
  carry: number;
};

type Hand = {
  on: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
};

type Gust = {
  on: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  left: number;
};

type Size = { w: number; h: number; bw: number; bh: number };

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
  reseed: () => void;
};

/**
 * The sky's clouds for an aspect: a few cumulus spread across it, each a
 * cluster of puffs — wide ones along a flat base, rounder ones stacked into a
 * dome — with the cloud nearest the sun moved in front of it.
 */
function buildSky(
  W: number,
  coverage: number,
  seed: number,
  sunX: number,
  sunY: number,
): Sky {
  const rand = lcg(seed);
  const n = clamp(Math.round((1.1 + coverage * 2.7) * (W / 2)), 1, 9);
  const clouds: Cloud[] = [];
  const owner: number[] = [];
  const hx: number[] = [];
  const hy: number[] = [];
  const r: number[] = [];
  const d: number[] = [];
  let nearSun = 0;
  let nearD = Infinity;
  for (let c = 0; c < n; c += 1) {
    const x = ((c + 0.5 + (rand() - 0.5) * 0.6) / n) * W;
    const lane = 0.3 + rand() * 0.3;
    clouds.push({ x, y: lane, lane, vx: 0, vy: 0 });
    const dd = Math.abs(x - sunX * W);
    if (dd < nearD) {
      nearD = dd;
      nearSun = c;
    }
  }
  const sun = clouds[nearSun];
  if (sun) {
    sun.x = sunX * W - 0.1;
    sun.lane = clamp(sunY + 0.06, 0.25, 0.7);
    sun.y = sun.lane;
  }
  // Every cloud gets its share of the puffs the pass can take.
  const budget = Math.max(5, Math.floor(MAX_PUFFS / n));
  clouds.forEach((_, c) => {
    const size = (0.24 + coverage * 0.16) * (0.8 + rand() * 0.4);
    const base = Math.min(budget - 3, 4 + Math.floor(rand() * 2));
    for (let i = 0; i < base && owner.length < MAX_PUFFS; i += 1) {
      owner.push(c);
      hx.push(
        ((i + 0.5) / base - 0.5) * size * 2.1 + (rand() - 0.5) * size * 0.2,
      );
      hy.push(size * 0.22 + (rand() - 0.5) * size * 0.08);
      r.push(size * (0.45 + rand() * 0.15));
      d.push(0.9 + rand() * 0.25);
    }
    const crown = Math.min(budget - base, 4 + Math.floor(rand() * 3));
    for (let i = 0; i < crown && owner.length < MAX_PUFFS; i += 1) {
      owner.push(c);
      const a = ((i + 0.5) / crown - 0.5) * 1.6;
      hx.push(Math.sin(a) * size * 0.6 + (rand() - 0.5) * size * 0.2);
      hy.push(-Math.cos(a) * size * 0.42 + size * 0.02);
      r.push(size * (0.4 + rand() * 0.2));
      d.push(0.85 + rand() * 0.3);
    }
  });
  const count = owner.length;
  const sky: Sky = {
    W,
    clouds,
    count,
    owner: Int32Array.from(owner),
    hx: Float32Array.from(hx),
    hy: Float32Array.from(hy),
    x: new Float32Array(count),
    y: new Float32Array(count),
    vx: new Float32Array(count),
    vy: new Float32Array(count),
    r: Float32Array.from(r),
    d: Float32Array.from(d),
    sx: new Float32Array(count).fill(1),
    sy: new Float32Array(count),
    t: 0,
    boil: rand() * 10,
    last: 0,
    carry: 0,
  };
  for (let i = 0; i < count; i += 1) {
    const cl = clouds[sky.owner[i] ?? 0];
    sky.x[i] = (cl?.x ?? 0) + (sky.hx[i] ?? 0);
    sky.y[i] = (cl?.y ?? 0) + (sky.hy[i] ?? 0);
  }
  return sky;
}

/**
 * A small sky in a box, drawn in two WebGL2 passes with content above it: a
 * few soft cumulus in a blue sky with the sun behind them. Each cloud is a
 * cluster of puffs summed into a density field at half resolution, eroded by
 * noise carried with the puffs; the second pass lights it — density toward
 * the sun gives grey bellies and bright crowns, the thin edges nearest the
 * sun go silver — and walks every pixel toward the sun through the clouds, so
 * light shafts fan out wherever there is a gap.
 *
 * Drag through the sky and your hand becomes wind: puffs near its path are
 * dragged toward its velocity, those either side curl opposite ways, each
 * stretches along its speed and thins, and the clouds part so the rays break
 * through. Then every puff gathers back into its cloud on a critically damped
 * spring whose period is `gather` — slower than the house drift spring,
 * because clouds are huge — while the cloud keeps a little of the push and
 * coasts on. Arrow keys send a gust from each side, the same wind a drag
 * makes. Under reduced motion the sky is still; wind moves the clouds in one
 * still step and they gather again in three.
 */
export function PocketSky({
  children,
  coverage = 0.45,
  sunHeight = 0.55,
  windDrag = 0.6,
  timeOfDay = "day",
  sunX = 0.64,
  rays = 0.6,
  drift = 0.3,
  gather = 4,
  interactive = true,
  paused = false,
  label = "Push the clouds",
  seed = 6,
  dpr = 2,
  onWindChange,
  disabled = false,
  className,
}: PocketSkyProps) {
  const motionSafe = useMotionSafe();
  const hintId = React.useId();
  const [said, setSaid] = React.useState({ n: 0, text: "" });
  const palette = SKIES[timeOfDay] ?? SKIES.day;
  const sunY = 0.92 + (0.14 - 0.92) * clamp01(sunHeight);

  const k = {
    coverage: clamp01(coverage),
    sunX: clamp01(sunX),
    sunY,
    drag: clamp01(windDrag),
    rays: clamp01(rays),
    drift: clamp01(drift),
    gather: clamp(gather, 0.5, 20),
    paused,
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    enabled: interactive && !disabled,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const sky = React.useRef<Sky | null>(null);
  const colour = React.useRef(new Float32Array(18));
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const pa = React.useRef(new Float32Array(MAX_PUFFS * 4));
  const pb = React.useRef(new Float32Array(MAX_PUFFS * 4));
  const hand = React.useRef<Hand>({
    on: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    t: 0,
  });
  const gust = React.useRef<Gust>({
    on: false,
    x: 0,
    y: 0,
    dx: 0,
    dy: 0,
    left: 0,
  });
  const blowing = React.useRef(false);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const stillTimer = React.useRef<number | null>(null);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onWindChange);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const readColours = () => {
    const carriers = carriersRef.current;
    if (!carriers) return;
    if (!reader.current) {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      reader.current = c.getContext("2d", { willReadFrequently: true });
    }
    const ctx = reader.current;
    if (!ctx) return;
    const out = colour.current;
    for (let i = 0; i < 6; i += 1) {
      const span = carriers.children[i];
      if (!span) continue;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[i * 3] = toLinear(d[0] ?? 0);
      out[i * 3 + 1] = toLinear(d[1] ?? 0);
      out[i * 3 + 2] = toLinear(d[2] ?? 0);
    }
  };

  const reseed = () => {
    const sz = size.current;
    if (!sz) return;
    sky.current = buildSky(sz.w / sz.h, k.coverage, k.seed, k.sunX, k.sunY);
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    const w = r.width / r.dpr;
    const h = r.height / r.dpr;
    const was = size.current;
    size.current = { w, h, bw: r.width, bh: r.height };
    // The density pass runs at half the CSS resolution.
    const fw = clamp(Math.round(w * 0.5), 16, 640);
    const fh = clamp(Math.round(h * 0.5), 8, 240);
    if (!g.fbo || g.fbo.width !== fw || g.fbo.height !== fh) {
      g.fbo?.dispose();
      g.fbo = createFramebuffer(g.gl, fw, fh, false);
    }
    // A new shape of box lays the sky out again; a resize of the same shape keeps it.
    if (!sky.current || !was || Math.abs(was.w / was.h - w / h) > 0.02)
      reseed();
  };

  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    const S = sky.current;
    if (!g || g.lost || !sz || !S || !g.fbo || !visible.current) return;
    const { gl, density, compose, triD, triC, fbo } = g;
    // Puffs go to the density pass in its own px: box heights times its height.
    const H = fbo.height;
    const A = pa.current;
    const B = pb.current;
    for (let i = 0; i < S.count; i += 1) {
      const cl = S.clouds[S.owner[i] ?? 0];
      A[i * 4] = (S.x[i] ?? 0) * H;
      A[i * 4 + 1] = (S.y[i] ?? 0) * H;
      A[i * 4 + 2] = (S.r[i] ?? 0) * H * (1 + 0.15 * ((S.sx[i] ?? 1) - 1));
      // A stretched puff thins: its density spreads over a longer shape.
      const stretch = Math.hypot(S.sx[i] ?? 1, S.sy[i] ?? 0);
      A[i * 4 + 3] = (S.d[i] ?? 1) / Math.sqrt(Math.max(1, stretch));
      B[i * 4] = S.sx[i] ?? 1;
      B[i * 4 + 1] = S.sy[i] ?? 0;
      B[i * 4 + 2] = ((S.x[i] ?? 0) - (cl?.x ?? 0) - (S.hx[i] ?? 0)) * H;
      B[i * 4 + 3] = ((S.y[i] ?? 0) - (cl?.y ?? 0) - (S.hy[i] ?? 0)) * H;
    }
    // Pass one, into the half-size buffer, in its own px.
    fbo.bind();
    density.use();
    const ud = density.uniforms;
    gl.uniform2f(ud.u_res ?? null, fbo.width, fbo.height);
    gl.uniform1f(ud.u_time ?? null, S.boil);
    gl.uniform1i(ud.u_count ?? null, S.count);
    gl.uniform4fv(ud.u_pa ?? null, A);
    gl.uniform4fv(ud.u_pb ?? null, B);
    triD.draw();
    // Pass two, to the screen.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, sz.bw, sz.bh);
    compose.use();
    const uc = compose.uniforms;
    const c = colour.current;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, fbo.texture);
    gl.uniform1i(uc.u_cloud ?? null, 0);
    gl.uniform2f(uc.u_res ?? null, sz.w, sz.h);
    gl.uniform2f(uc.u_sun ?? null, k.sunX * sz.w, k.sunY * sz.h);
    gl.uniform1f(uc.u_rays ?? null, k.rays);
    gl.uniform3f(uc.u_zenith ?? null, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);
    gl.uniform3f(uc.u_horizon ?? null, c[3] ?? 0, c[4] ?? 0, c[5] ?? 0);
    gl.uniform3f(uc.u_sunCol ?? null, c[6] ?? 1, c[7] ?? 1, c[8] ?? 1);
    gl.uniform3f(uc.u_lit ?? null, c[9] ?? 1, c[10] ?? 1, c[11] ?? 1);
    gl.uniform3f(uc.u_shadow ?? null, c[12] ?? 0, c[13] ?? 0, c[14] ?? 0);
    gl.uniform3f(uc.u_silver ?? null, c[15] ?? 1, c[16] ?? 1, c[17] ?? 1);
    triC.draw();
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** The wind along a hand's path this step: drag, tumble, and a share to the clouds. */
  const blow = (
    S: Sky,
    x: number,
    y: number,
    vx: number,
    vy: number,
    dt: number,
  ) => {
    const speed = Math.hypot(vx, vy);
    if (speed < 0.01) return;
    const grip = 1 - Math.exp(-dt * 9 * k.drag);
    const ux = vx / speed;
    const uy = vy / speed;
    for (let i = 0; i < S.count; i += 1) {
      const dx = (S.x[i] ?? 0) - x;
      const dy = (S.y[i] ?? 0) - y;
      const f = Math.exp(-(dx * dx + dy * dy) / (REACH * REACH));
      if (f < 0.01) continue;
      // Dragged toward the wind's own velocity, and curled by which side of
      // the path it is on: that difference is the shear and the tumble.
      const side = Math.sign(ux * dy - uy * dx) || 1;
      const ax =
        (vx - (S.vx[i] ?? 0)) * grip * f - uy * side * speed * grip * f * 0.3;
      const ay =
        (vy - (S.vy[i] ?? 0)) * grip * f + ux * side * speed * grip * f * 0.3;
      S.vx[i] = (S.vx[i] ?? 0) + ax;
      S.vy[i] = (S.vy[i] ?? 0) + ay;
      const cl = S.clouds[S.owner[i] ?? 0];
      if (cl) {
        cl.vx += ax * 0.05;
        cl.vy += ay * 0.03;
      }
    }
  };

  /** Advances the sky by dt; says whether anything still moves. */
  const step = (dt: number, ambient: boolean): boolean => {
    const S = sky.current;
    if (!S) return false;
    if (ambient) {
      S.boil += dt * k.drift * 0.06;
    }
    const breeze = ambient ? k.drift * 0.03 : 0;
    // Clouds gather on a critically damped spring of period `gather`.
    const w0 = (Math.PI * 2) / (k.gather * 0.9);
    const K = w0 * w0;
    const C = 2 * GATHER_ZETA * w0;
    let moving = false;
    S.carry += dt;
    let steps = 0;
    while (S.carry >= STEP && steps < 12) {
      S.carry -= STEP;
      steps += 1;
      const hd = hand.current;
      if (hd.on) blow(S, hd.x, hd.y, hd.vx, hd.vy, STEP);
      const gs = gust.current;
      if (gs.on) {
        const speed = (S.W + 0.6) / GUST;
        gs.x += gs.dx * speed * STEP;
        gs.y += gs.dy * speed * STEP;
        // A gust is a broad hand: three lanes across the middle of the sky.
        const len = Math.hypot(gs.dx, gs.dy) || 1;
        const px = -gs.dy / len;
        const py = gs.dx / len;
        for (const off of [-0.18, 0, 0.18]) {
          blow(
            S,
            gs.x + px * off,
            gs.y + py * off,
            gs.dx * speed * 0.6,
            gs.dy * speed * 0.6,
            STEP,
          );
        }
        gs.left -= STEP;
        if (gs.left <= 0) gs.on = false;
      }
      for (const cl of S.clouds) {
        cl.x += (breeze + cl.vx) * STEP;
        cl.y += cl.vy * STEP;
        cl.vx *= Math.exp(-STEP / 2.6);
        cl.vy *= Math.exp(-STEP / 1.4);
        cl.y += (cl.lane - cl.y) * (1 - Math.exp(-STEP / 3));
      }
      for (let i = 0; i < S.count; i += 1) {
        const cl = S.clouds[S.owner[i] ?? 0];
        const homeX = (cl?.x ?? 0) + (S.hx[i] ?? 0);
        const homeY = (cl?.y ?? 0) + (S.hy[i] ?? 0);
        const x = S.x[i] ?? 0;
        const y = S.y[i] ?? 0;
        const vx =
          (S.vx[i] ?? 0) + (-K * (x - homeX) - C * (S.vx[i] ?? 0)) * STEP;
        const vy =
          (S.vy[i] ?? 0) + (-K * (y - homeY) - C * (S.vy[i] ?? 0)) * STEP;
        S.vx[i] = vx;
        S.vy[i] = vy;
        S.x[i] = x + (vx + breeze) * STEP;
        S.y[i] = y + vy * STEP;
        // The stretch follows the puff's speed through the air.
        const sp = Math.hypot(vx, vy);
        const amount = Math.min(2.4, sp * 3.2);
        const tx = sp > 1e-4 ? (vx / sp) * (1 + amount) : 1;
        const ty = sp > 1e-4 ? (vy / sp) * (1 + amount) : 0;
        const ease = 1 - Math.exp(-STEP * 6);
        S.sx[i] = (S.sx[i] ?? 1) + (tx - (S.sx[i] ?? 1)) * ease;
        S.sy[i] = (S.sy[i] ?? 0) + (ty - (S.sy[i] ?? 0)) * ease;
        if (
          Math.abs(x - homeX) + Math.abs(y - homeY) > 0.002 ||
          sp > 0.004 ||
          Math.abs((S.sx[i] ?? 1) - 1) > 0.01
        )
          moving = true;
      }
    }
    if (steps === 12) S.carry = 0;
    // Clouds that drift off one side come back in on the other.
    for (let c = 0; c < S.clouds.length; c += 1) {
      const cl = S.clouds[c];
      if (!cl) continue;
      const span = S.W + 1.2;
      const shift = cl.x > S.W + 0.6 ? -span : cl.x < -0.6 ? span : 0;
      if (!shift) continue;
      cl.x += shift;
      for (let i = 0; i < S.count; i += 1) {
        if (S.owner[i] === c) S.x[i] = (S.x[i] ?? 0) + shift;
      }
    }
    const windy = hand.current.on || gust.current.on;
    for (const cl of S.clouds) {
      if (Math.abs(cl.vx) + Math.abs(cl.vy) > 0.002) moving = true;
    }
    return moving || windy;
  };

  const calm = () => {
    if (!blowing.current) return;
    blowing.current = false;
    report.current?.(false);
    setSaid((s) => ({ n: s.n + 1, text: "The clouds have gathered." }));
  };

  const tick = (now: number) => {
    frame.current = 0;
    const S = sky.current;
    if (
      !S ||
      !visible.current ||
      document.hidden ||
      !gpu.current ||
      gpu.current.lost
    ) {
      if (S) S.last = 0;
      return;
    }
    const dt = S.last ? Math.min(0.05, (now - S.last) / 1000) : 1 / 60;
    S.last = now;
    const ambient = !k.paused && k.drift > 0;
    const moving = step(dt, ambient);
    draw();
    if (!moving) calm();
    if (moving || ambient) frame.current = window.requestAnimationFrame(loop);
    else S.last = 0;
  };

  const kick = () => {
    if (!visible.current || document.hidden) return;
    if (!k.motionSafe) {
      draw();
      return;
    }
    if (frame.current) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick, reseed };
    report.current = onWindChange;
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const density = createProgram(gl, FULLSCREEN_VERTEX, DENSITY);
      const compose = createProgram(gl, FULLSCREEN_VERTEX, COMPOSE);
      if (!density || !compose) {
        density?.dispose();
        compose?.dispose();
        return false;
      }
      const triD = createFullscreenTriangle(gl, density);
      const triC = createFullscreenTriangle(gl, compose);
      gpu.current = {
        gl,
        density,
        compose,
        triD,
        triC,
        fbo: null,
        lost: false,
      };
      api.current?.readColours();
      api.current?.resize();
      api.current?.draw();
      api.current?.kick();
      return true;
    };
    if (!build()) {
      rootRef.current?.setAttribute("data-fallback", "");
      return;
    }
    const detach = onContextLoss(
      canvas,
      () => {
        if (gpu.current) gpu.current.lost = true;
        shown.current = false;
        rootRef.current?.removeAttribute("data-live");
      },
      () => {
        gpu.current = null;
        build();
      },
    );
    return () => {
      detach();
      const g = gpu.current;
      gpu.current = null;
      if (g && !g.lost) {
        g.fbo?.dispose();
        g.triD.dispose();
        g.triC.dispose();
        g.density.dispose();
        g.compose.dispose();
      }
    };
  }, []);

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [timeOfDay]);

  // A new cover, sun or seed lays the sky out again.
  React.useEffect(() => {
    api.current?.reseed();
    api.current?.draw();
    api.current?.kick();
  }, [k.coverage, k.seed, k.sunX, k.sunY]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [k.rays, k.drift, k.gather, k.drag, paused, motionSafe]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    const timer = stillTimer;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, []);

  const bindRoot = React.useCallback((node: HTMLDivElement | null) => {
    rootRef.current = node;
    if (!node) return;
    const sizer = new ResizeObserver(() => {
      api.current?.resize();
      api.current?.draw();
    });
    sizer.observe(node);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (!visible.current) return;
      api.current?.draw();
      api.current?.kick();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const begin = () => {
    if (blowing.current) return;
    blowing.current = true;
    report.current?.(true);
  };

  /**
   * Reduced motion: the wind's effect is worked out off screen and shown in
   * one still step; the clouds gather again in three more.
   */
  const stillWind = (apply: (S: Sky) => void) => {
    const S = sky.current;
    if (!S) return;
    begin();
    apply(S);
    for (let i = 0; i < 60; i += 1) step(STEP * 6, false);
    draw();
    stillGather(3);
  };

  const stillGather = (left: number) => {
    if (stillTimer.current !== null) window.clearTimeout(stillTimer.current);
    stillTimer.current = window.setTimeout(
      () => {
        stillTimer.current = null;
        const S = sky.current;
        if (!S) return;
        if (!visible.current || document.hidden) {
          stillGather(left);
          return;
        }
        const seconds = (k.gather / 3) * (left <= 1 ? 4 : 1);
        for (let t = 0; t < seconds; t += STEP * 6) step(STEP * 6, false);
        draw();
        if (left > 1) stillGather(left - 1);
        else calm();
      },
      Math.round((k.gather * 1000) / 3),
    );
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const sz = size.current;
    if (!root || !sz) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return { x: (clientX - r.left) / sz.h, y: (clientY - r.top) / sz.h };
  };

  const drag = useDrag({
    threshold: 3,
    disabled: !k.enabled,
    onStart: ({ point, offset, event }) => {
      const from = local(point.x - offset.x, point.y - offset.y);
      hand.current = {
        on: k.motionSafe,
        x: from.x,
        y: from.y,
        vx: 0,
        vy: 0,
        t: event.timeStamp,
      };
      begin();
      kick();
    },
    onMove: ({ point, event }) => {
      const hd = hand.current;
      const at = local(point.x, point.y);
      const dt = Math.max(0.004, (event.timeStamp - hd.t) / 1000);
      const blend = Math.min(1, dt / 0.05);
      hd.vx += ((at.x - hd.x) / dt - hd.vx) * blend;
      hd.vy += ((at.y - hd.y) / dt - hd.vy) * blend;
      hd.x = at.x;
      hd.y = at.y;
      hd.t = event.timeStamp;
      if (k.motionSafe) kick();
    },
    onEnd: () => {
      const hd = hand.current;
      hd.on = false;
      if (!k.motionSafe) {
        const { x, y, vx, vy } = hd;
        stillWind((S) => {
          for (let i = 0; i < 30; i += 1)
            blow(S, x - vx * 0.01 * i, y - vy * 0.01 * i, vx, vy, STEP);
        });
        return;
      }
      kick();
    },
    onCancel: () => {
      hand.current.on = false;
      kick();
    },
    onTap: (event) => {
      // A tap breathes on the sky: a short puff of wind out from the finger.
      const at = local(event.clientX, event.clientY);
      const puff = (S: Sky) => {
        for (let i = 0; i < S.count; i += 1) {
          const dx = (S.x[i] ?? 0) - at.x;
          const dy = (S.y[i] ?? 0) - at.y;
          const d = Math.hypot(dx, dy) || 1;
          const f = Math.exp(-(d * d) / (REACH * REACH * 1.5)) * k.drag;
          S.vx[i] = (S.vx[i] ?? 0) + (dx / d) * f * 0.5;
          S.vy[i] = (S.vy[i] ?? 0) + (dy / d) * f * 0.5;
        }
      };
      const S = sky.current;
      if (!S) return;
      if (!k.motionSafe) {
        stillWind(puff);
        return;
      }
      begin();
      puff(S);
      kick();
    },
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!k.enabled) return;
    const dirs: Record<string, [number, number, string]> = {
      ArrowRight: [1, 0, "Gust from the left."],
      ArrowLeft: [-1, 0, "Gust from the right."],
      ArrowDown: [0, 1, "Gust from above."],
      ArrowUp: [0, -1, "Gust from below."],
    };
    const d = dirs[event.key];
    const S = sky.current;
    if (!d || !S) return;
    event.preventDefault();
    if (event.repeat && gust.current.on) return;
    const [dx, dy, text] = d;
    setSaid((s) => ({ n: s.n + 1, text }));
    // The broad hand enters from the far side and sweeps across the middle.
    const start = {
      on: true,
      x: dx > 0 ? -0.3 : dx < 0 ? S.W + 0.3 : S.W / 2,
      y: dy > 0 ? -0.3 : dy < 0 ? 1.3 : 0.45,
      dx,
      dy: dy * (1 / Math.max(1, S.W)),
      left: GUST,
    };
    if (!k.motionSafe) {
      stillWind((sk) => {
        const speed = (sk.W + 0.6) / GUST;
        for (let t = 0; t < GUST; t += STEP) {
          const x = start.x + dx * speed * t;
          const y = start.y + start.dy * speed * t;
          blow(sk, x, y, dx * speed * 0.6, start.dy * speed * 0.6, STEP);
        }
      });
      return;
    }
    begin();
    gust.current = start;
    kick();
  };

  const still = standIn(palette, k.coverage, k.sunX, k.sunY, seed);

  return (
    <div
      ref={bindRoot}
      onPointerDown={(event) => {
        if (!k.enabled || fromContent(event.target)) return;
        drag.onPointerDown(event);
      }}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      className={cn(
        "group/pocket-sky [container-type:size] relative isolate h-full w-full overflow-clip",
        k.enabled
          ? "cursor-grab touch-pan-y active:cursor-grabbing"
          : "touch-auto",
        className,
      )}
    >
      {still}
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => {
          api.current?.readColours();
          api.current?.draw();
        }}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {palette.map((c, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: c }}
          />
        ))}
      </span>
      <button
        type="button"
        data-sky=""
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        className="absolute inset-0 z-0 size-full cursor-[inherit] rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        Drag through the sky to blow the clouds about; they gather themselves
        again. Arrow keys send a gust from either side.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the sky's gradient, the sun's glow, and soft clouds where
 * the seed puts them.
 */
function standIn(
  palette: readonly string[],
  coverage: number,
  sunX: number,
  sunY: number,
  seed: number,
): React.ReactNode {
  const [zenith, horizon, sun, lit] = palette;
  const rand = lcg(seed);
  const n = Math.round(2 + coverage * 3);
  const blobs: string[] = [];
  for (let c = 0; c < n; c += 1) {
    const x = (c + 0.5 + (rand() - 0.5) * 0.5) / n;
    const y = 0.3 + rand() * 0.3;
    const w = 18 + coverage * 10 + rand() * 6;
    blobs.push(
      `radial-gradient(${Math.round(w)}% ${Math.round(w * 0.9)}cqh at ${pct(x)} ${pct(y)}, color-mix(in oklab, ${lit} 92%, transparent), transparent 70%)`,
    );
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/pocket-sky:invisible group-data-live/pocket-sky:opacity-0"
      style={{
        backgroundImage: [
          ...blobs,
          `radial-gradient(circle at ${pct(sunX)} ${pct(sunY)}, ${sun} 0 4.5cqh, color-mix(in oklab, ${sun} 45%, transparent) 6cqh, transparent 40cqh)`,
          `linear-gradient(to bottom, ${zenith}, ${horizon})`,
        ].join(", "),
      }}
    />
  );
}
