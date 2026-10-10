"use client";

import * as React from "react";

import { animate, motion, useMotionValue } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  uploadTexture,
} from "@/registry/lib/glsl";
import { durations, easings, springs } from "@/registry/lib/motion";
import { rubberband, useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type GlassOrbWeather = "clear" | "cloud" | "snow" | "storm";

export type GlassOrbProps = {
  /** What is inside the glass: nothing, a drifting mist, snow, or a dark storm with rain. @default "snow" */
  weather?: GlassOrbWeather;
  /** How hard the glass bends light, 0 to 1: 0 is a clear bubble, 1 a solid crystal that shows the room upside down. @default 0.6 */
  refraction?: number;
  /** How deeply the glass is coloured by `glassColor`, 0 to 1; the thick middle colours more than the rim. @default 0.3 */
  tint?: number;
  /** The colour of the glass, any CSS colour; resolved on the element so it follows the theme. @default "var(--accent-bright)" */
  glassColor?: string;
  /** The colour of snow and mist, any CSS colour. Pigment, so it reads the same in both themes. @default "oklch(0.97 0.01 250)" */
  weatherColor?: string;
  /** A word set large on the wall behind the orb; the glass shows it flipped and magnified. */
  backdropText?: string;
  /** The orb's diameter as a share of the box height, 0.4 to 0.9 (never more than 72% of the width). @default 0.66 */
  size?: number;
  /** How strongly rolling, lifting and landing stir the weather, 0 to 1. @default 0.6 */
  swirl?: number;
  /** How much the orb rocks as it rolls home, 0 (settles like a glide) to 1 (two visible rocks). @default 0.5 */
  wobble?: number;
  /** The slow circulation of the weather while nobody touches it, 0 to 1; 0 lets everything settle and the loop stop. @default 0.3 */
  drift?: number;
  /** Drag, tap and keys move the orb. @default true */
  interactive?: boolean;
  /** Describes the scene for assistive technology. @default "A glass orb on a table" */
  alt?: string;
  /** Seed for the weather's arrangement and the mist's grain. @default 7 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Freeze the weather where it is. @default false */
  paused?: boolean;
  /** Play a swish when the visitor rolls, lifts or shakes the orb. Off unless asked for. @default false */
  sound?: boolean;
  /** Fires when the visitor moves the orb: a drag, a tap or a key. */
  onStir?: () => void;
  /** Fires when, after a stir, the orb is home and the weather has calmed. */
  onSettle?: () => void;
  /** Classes for the scene box; set its height here. @default "h-56" */
  className?: string;
};

const MAX_FLAKES = 64;
const BINS = 18;
const GRAVITY = 2400;
const RESTITUTION = 0.32;
const STEP = 1 / 120;
const REACH = 0.9;

type Weather = { cloud: number; flakes: number; rain: boolean; storm: number };

const WEATHER: Record<GlassOrbWeather, Weather> = {
  clear: { cloud: 0, flakes: 0, rain: false, storm: 0 },
  cloud: { cloud: 1, flakes: 0, rain: false, storm: 0 },
  snow: { cloud: 0.22, flakes: 64, rain: false, storm: 0 },
  storm: { cloud: 1, flakes: 56, rain: true, storm: 1 },
};

/**
 * The room's colours, from tokens: a wall that is the page, a table a step
 * darker, boards in the strong hairline. The window light and the storm are
 * fixed art — a window is warm white in either theme.
 */
const SCENE = {
  wall: "var(--background)",
  wallLow: "color-mix(in oklab, var(--background) 72%, var(--bg-2))",
  table: "color-mix(in oklab, var(--bg-2) 82%, var(--ink-3))",
  tableFront: "color-mix(in oklab, var(--bg-2) 70%, var(--ink-3))",
  line: "var(--hairline-strong)",
  label: "color-mix(in oklab, var(--ink-3) 44%, var(--background))",
  light: "oklch(0.98 0.012 90)",
  shadow: "color-mix(in oklab, var(--bg-2) 45%, black)",
  storm: "oklch(0.4 0.03 255)",
} as const;

const HORIZON = 0.64;
const FLOOR = HORIZON + (1 - HORIZON) * 0.55;

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
uniform sampler2D u_backdrop;
uniform vec2 u_res;
uniform vec3 u_orb;
uniform float u_floor;
uniform float u_lift;
uniform float u_ior;
uniform float u_tint;
uniform vec3 u_glass;
uniform vec3 u_weather;
uniform vec3 u_storm;
uniform vec3 u_light;
uniform vec3 u_shadow;
uniform float u_cloud;
uniform float u_stormMix;
uniform float u_phi;
uniform float u_time;
uniform float u_flash;
uniform float u_hover;
uniform float u_seed;
uniform vec4 u_flakes[${MAX_FLAKES}];
uniform int u_count;
uniform int u_rain;
uniform vec2 u_fall;
in vec2 v_uv;
out vec4 o_color;

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 px = v_uv * u_res;
  vec3 col = texture(u_backdrop, v_uv).rgb;
  float R = max(u_orb.z, 1.0);
  float liftK = clamp(u_lift / R, 0.0, 1.0);
  float focus = smoothstep(0.05, 0.9, (u_ior - 1.0) / 0.55);

  // The floor: a shadow cast away from the window, a tight contact shadow
  // under a resting orb, and the window focused by the ball into a caustic
  // that sharpens with the refraction.
  vec2 sc = vec2(u_orb.x + R * 0.32, u_floor + R * 0.02);
  vec2 sr = vec2(R * (0.98 + liftK * 0.4), R * (0.2 + liftK * 0.08));
  float sd = length((px - sc) / sr);
  float shade = (1.0 - smoothstep(0.3, 1.0 + liftK * 0.4, sd)) * (0.42 - liftK * 0.22);
  float cd = length((px - vec2(u_orb.x, u_floor)) / vec2(R * 0.5, R * 0.07));
  shade += (1.0 - smoothstep(0.0, 1.0, cd)) * 0.38 * (1.0 - liftK);
  col = mix(col, col * u_shadow, clamp(shade, 0.0, 0.85));
  vec2 kc = vec2(u_orb.x + R * 0.54, u_floor + R * 0.05);
  vec2 kr = vec2(R * 0.3, R * 0.065) * (1.0 + liftK * 0.8) * mix(1.7, 0.85, focus);
  float kd = length((px - kc) / kr);
  float caustic = (1.0 - smoothstep(0.0, 1.0, kd)) * focus * (1.0 - liftK * 0.6);
  vec3 causticTone = mix(u_light, u_light * mix(vec3(1.0), u_glass * 1.3, 0.75), u_tint);
  col += caustic * 0.5 * causticTone * (1.0 + u_flash);

  vec2 d = (px - u_orb.xy) / R;
  float rho = length(d);
  float aa = 1.4 / R;
  if (rho < 1.0 + aa) {
    vec2 m = vec2(d.x, -d.y);
    float z = sqrt(max(0.0, 1.0 - dot(m, m)));
    vec3 n1 = vec3(m, z);
    vec3 I = vec3(0.0, 0.0, -1.0);

    // In through the front, across the ball, out of the back and on to the
    // room behind it: a ball lens, so the room comes back inverted.
    vec3 t1 = refract(I, n1, 1.0 / u_ior);
    float s = max(-2.0 * dot(n1, t1), 0.0);
    vec3 p2 = n1 + t1 * s;
    vec3 n2 = normalize(p2);
    vec3 t2 = refract(t1, -n2, u_ior);
    if (dot(t2, t2) < 1e-4) t2 = reflect(t1, -n2);
    float k = (-3.2 - p2.z) / min(t2.z, -0.05);
    vec3 p3 = p2 + t2 * k;
    vec2 hit = vec2(u_orb.x + p3.x * R, u_orb.y - p3.y * R);
    vec3 seen = texture(u_backdrop, clamp(hit / u_res, vec2(0.001), vec2(0.999))).rgb;
    vec3 absorb = exp(-(1.0 - u_glass) * u_tint * s * 1.15);
    seen *= absorb;

    // The weather, seen through the front surface (slightly magnified).
    float mag = 1.0 + (u_ior - 1.0) * 0.35;
    vec2 q = m / mag;
    float r = length(q);
    vec3 inside = sqrt(absorb);
    if (u_cloud > 0.001) {
      float ang = u_phi * (1.3 - 0.6 * r);
      vec2 qa = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * q;
      float ang2 = u_phi * 0.7 + 1.7;
      vec2 qb = mat2(cos(ang2), sin(ang2), -sin(ang2), cos(ang2)) * q;
      float n = kx_fbm(qa * 2.2 + vec2(u_seed, u_time * 0.04)) * 0.7
        + kx_fbm(qb * 1.4 + vec2(u_time * 0.03, u_seed * 0.5)) * 0.45;
      float dens = smoothstep(0.4, 0.86, n) * (1.0 - smoothstep(0.5, 0.97, r));
      vec3 mist = mix(u_weather, u_storm, u_stormMix);
      mist = mix(mist, u_light, u_flash * 0.85);
      seen = mix(seen, mist * inside, clamp(dens * u_cloud * 0.9, 0.0, 1.0));
    }
    float flake = 0.0;
    float dusk = 0.0;
    for (int i = 0; i < ${MAX_FLAKES}; i += 1) {
      if (i >= u_count) break;
      vec4 f = u_flakes[i];
      if (u_rain == 1) {
        float dd = segment(m, f.xy, f.xy - u_fall * f.z * 7.0);
        flake += f.w * (1.0 - smoothstep(f.z * 0.25, f.z * 0.7, dd));
      } else {
        float dd = length(m - f.xy);
        flake += f.w * (1.0 - smoothstep(f.z * 0.45, f.z, dd));
        float ds = length(m - f.xy + vec2(-f.z * 0.35, f.z * 0.35));
        dusk += f.w * (1.0 - smoothstep(f.z * 0.6, f.z * 1.6, ds));
      }
    }
    // A faint shadow under each flake keeps white snow legible on a light room.
    seen *= 1.0 - clamp(dusk, 0.0, 1.0) * 0.22;
    vec3 flakeTone = mix(u_weather, mix(u_weather, u_storm, 0.35), u_stormMix);
    seen = mix(seen, flakeTone * mix(inside, vec3(1.0), 0.5), clamp(flake, 0.0, 1.0) * 0.94);
    seen += u_flash * 0.2 * u_light * (1.0 - r);

    // The surface: Fresnel at the rim, the window reflected as a highlight
    // with its cross bar, a broad sheen, and a caustic crescent burning on
    // the inside of the rim opposite the light.
    float fres = 0.04 + 0.96 * pow(1.0 - z, 5.0);
    vec3 rv = reflect(I, n1);
    vec3 L = normalize(vec3(-0.5, 0.55, 0.67));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), L));
    vec3 upL = cross(L, right);
    vec3 dr = rv - L;
    float wu = dot(dr, right);
    float wv = dot(dr, upL);
    float win = (1.0 - smoothstep(0.12, 0.16, abs(wu))) * (1.0 - smoothstep(0.16, 0.2, abs(wv)));
    win *= smoothstep(0.01, 0.02, abs(wu)) * smoothstep(0.01, 0.02, abs(wv));
    float sheen = pow(max(dot(rv, L), 0.0), 6.0) * 0.16;
    vec3 env = mix(texture(u_backdrop, vec2(0.5, 0.15)).rgb, u_light, 0.35);
    vec3 orb = seen * (1.0 - fres * 0.55) + env * fres * 0.75;
    orb += u_light * (win * 0.8 + sheen) * (1.0 + u_hover * 0.3);
    vec2 cdir = normalize(vec2(0.6, -0.8));
    float crescent = smoothstep(0.8, 0.94, rho) * (1.0 - smoothstep(0.95, 0.99, rho))
      * pow(max(dot(m / max(rho, 1e-4), cdir), 0.0), 2.5);
    orb += crescent * 0.6 * causticTone * (0.35 + 0.65 * focus);
    float rim = smoothstep(0.955, 0.998, rho);
    orb = mix(orb, orb * 0.5, rim * 0.65);
    float a = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, rho);
    col = mix(col, orb, a);
  }
  o_color = vec4(col, 1.0);
}
`;

type Rgb = [number, number, number];

type Flake = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  size: number;
  hash: number;
  /** Hangs in the still (reduced-motion) frame instead of lying in the drift. */
  hang: boolean;
  /** Resting in the drift, in this bin; -1 while in the air. */
  bin: number;
};

type Sim = {
  x: number;
  vx: number;
  lift: number;
  vy: number;
  omega: number;
  phi: number;
  flash: number;
  time: number;
  prevVx: number;
  prevVy: number;
  dragging: boolean;
  dragX: number;
  dragLift: number;
  lastMoveT: number;
  stirred: boolean;
  shakeSign: number;
  jolt: boolean;
};

type Geometry = {
  w: number;
  h: number;
  r: number;
  restX: number;
  restY: number;
  floor: number;
  horizon: number;
  maxLift: number;
  range: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r2 = (v: number) => Math.round(v * 100) / 100;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Any CSS colour string to sRGB bytes, through a 1×1 canvas. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): Rgb => {
    if (!ctx) return [0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(0, 0, 0)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
}

function geometry(w: number, h: number, size: number): Geometry {
  const r = Math.max(8, Math.min((clamp(size, 0.4, 0.9) * h) / 2, w * 0.36));
  const floor = h * FLOOR;
  const restY = floor - r;
  return {
    w,
    h,
    r,
    restX: w / 2,
    restY,
    floor,
    horizon: h * HORIZON,
    maxLift: Math.max(0, Math.min(r * 0.6, restY - r - 4)),
    range: Math.max(0, w / 2 - r - 6),
  };
}

const binOf = (x: number) =>
  clamp(Math.floor(((x + REACH) / (2 * REACH)) * BINS), 0, BINS - 1);

/** Where a flake at `x` comes to rest: the bowl of the ball, raised by the drift already lying there. */
const floorAt = (f: Flake, heap: Float32Array) => {
  const reach = Math.sqrt(Math.max(0, REACH * REACH - f.z * f.z));
  const bowl = -Math.sqrt(Math.max(0, reach * reach - f.x * f.x));
  return bowl + (heap[binOf(f.x)] ?? 0);
};

function seedFlakes(
  flakes: Flake[],
  heap: Float32Array,
  count: number,
  seed: number,
  rain: boolean,
): void {
  const rnd = mulberry32(seed * 7919 + 13);
  flakes.length = 0;
  heap.fill(0);
  for (let i = 0; i < count; i += 1) {
    const z = (rnd() * 2 - 1) * 0.75;
    const reach = Math.sqrt(Math.max(0, REACH * REACH - z * z));
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * reach;
    flakes.push({
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      z,
      vx: 0,
      vy: 0,
      size: rain ? 0.012 + rnd() * 0.006 : 0.02 + rnd() * 0.022,
      hash: rnd(),
      hang: !rain && i % 9 === 4,
      bin: -1,
    });
  }
}

/** Lets the snow fall straight down into a drift, offline: the still frame. */
function settleFlakes(flakes: Flake[], heap: Float32Array): void {
  for (const f of flakes) {
    if (f.hang) continue;
    f.y = floorAt(f, heap);
    const b = binOf(f.x);
    heap[b] = (heap[b] ?? 0) + f.size * 0.55;
    f.bin = b;
  }
}

/**
 * A glass sphere on a table, drawn in one WebGL2 pass: each pixel inside the
 * ball follows the view ray in through the front surface, across the glass
 * and out of the back on to the room behind it, so the room comes back
 * inverted and magnified as it does in a real crystal ball, tinted more where
 * the glass is thicker. Inside lives a small weather — mist, snow or a storm —
 * in the ball's own frame: the fluid is dragged after the glass and lags it,
 * so rolling the orb winds the mist into a spiral and lifts the snow out of
 * its drift, and a landing throws it into the air.
 *
 * The orb is a real button. Dragged, it follows the finger 1:1 along the
 * table and up off it; released, it rolls home on a spring that takes the
 * throw's velocity (ζ from `wobble`, between the glide and recoil springs),
 * and a lifted orb falls under gravity and lands with a small bounce. Left and
 * Right roll it, Up lifts and drops it, Enter or Space shakes it. Under reduced
 * motion nothing travels: the weather is a still, settled arrangement and a
 * key or a tap shows a new one.
 */
export function GlassOrb({
  weather = "snow",
  refraction = 0.6,
  tint = 0.3,
  glassColor = "var(--accent-bright)",
  weatherColor = "oklch(0.97 0.01 250)",
  backdropText,
  size = 0.66,
  swirl = 0.6,
  wobble = 0.5,
  drift = 0.3,
  interactive = true,
  alt = "A glass orb on a table",
  seed = 7,
  dpr = 2,
  paused = false,
  sound = false,
  onStir,
  onSettle,
  className,
}: GlassOrbProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = React.useState(false);
  const [glKey, setGlKey] = React.useState(0);

  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);
  const hover = useMotionValue(0);

  const s = clamp(size, 0.4, 0.9);
  const diameter = `min(${r2(s * 100)}cqh, 72cqw)`;

  const params = React.useRef({
    weather,
    refraction,
    tint,
    swirl,
    wobble,
    drift,
    size: s,
    seed,
    dpr,
    paused,
    motionSafe,
    backdropText,
    glassColor,
    weatherColor,
  });
  const events = React.useRef({ onStir, onSettle, audio });
  React.useEffect(() => {
    params.current = {
      weather,
      refraction,
      tint,
      swirl,
      wobble,
      drift,
      size: s,
      seed,
      dpr,
      paused,
      motionSafe,
      backdropText,
      glassColor,
      weatherColor,
    };
    events.current = { onStir, onSettle, audio };
  });

  const sim = React.useRef<Sim>({
    x: 0,
    vx: 0,
    lift: 0,
    vy: 0,
    omega: 0,
    phi: 0,
    flash: 0,
    time: 0,
    prevVx: 0,
    prevVy: 0,
    dragging: false,
    dragX: 0,
    dragLift: 0,
    lastMoveT: 0,
    stirred: false,
    shakeSign: 1,
    jolt: false,
  });
  const api = React.useRef<{
    wake: () => void;
    redraw: () => void;
    reseed: (still: boolean) => void;
    repaint: () => void;
    geometry: () => Geometry;
  } | null>(null);

  // GL, the room, the observers and the loop share one lifetime, so
  // StrictMode's second run rebuilds them all; only a restored context
  // (glKey) starts a new one. Everything else is read through `params`.
  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    const gl = createGL(canvas, { alpha: false, antialias: false });
    if (!gl) return;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return;
    const tri = createFullscreenTriangle(gl, program);
    const U = program.uniforms;
    const read = rgbReader();
    const room = document.createElement("canvas");
    const flakes: Flake[] = [];
    const heap = new Float32Array(BINS);
    const flakeData = new Float32Array(MAX_FLAKES * 4);
    const colours: Record<
      "glass" | "weather" | "storm" | "light" | "shadow",
      Rgb
    > = {
      glass: [0.5, 0.6, 1],
      weather: [1, 1, 1],
      storm: [0.3, 0.3, 0.35],
      light: [1, 1, 0.97],
      shadow: [0.4, 0.4, 0.45],
    };
    let texture: WebGLTexture | null = null;
    let geo = geometry(1, 1, params.current.size);
    let raf = 0;
    let last = 0;
    let acc = 0;
    let skip = false;
    let inView = true;
    let lost = false;
    let shown = false;
    let reseeds = 0;

    const resolve = (css: string): Rgb => {
      const probe = probeRef.current;
      if (!probe) return [0, 0, 0];
      probe.style.color = css;
      return read(getComputedStyle(probe).color);
    };
    const unit = (c: Rgb): Rgb => [c[0] / 255, c[1] / 255, c[2] / 255];
    const css = (c: Rgb, a = 1) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
    // The room is painted with the cascade's own computed strings, so a
    // translucent token (the hairline) keeps its alpha.
    const computed = (value: string) => {
      const probe = probeRef.current;
      if (!probe) return "black";
      probe.style.color = value;
      return getComputedStyle(probe).color;
    };

    const paintRoom = () => {
      const { w, h, horizon } = geo;
      const ratio = Math.min(
        2,
        Math.max(1, params.current.dpr),
        window.devicePixelRatio || 1,
      );
      room.width = Math.max(1, Math.round(w * ratio));
      room.height = Math.max(1, Math.round(h * ratio));
      const ctx = room.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const wall = ctx.createLinearGradient(0, 0, 0, horizon);
      wall.addColorStop(0, computed(SCENE.wall));
      wall.addColorStop(1, computed(SCENE.wallLow));
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, w, horizon);
      // The window the light comes from, as a faint wash high on the left.
      const light = resolve(SCENE.light);
      const wash = ctx.createRadialGradient(
        w * 0.18,
        h * 0.12,
        0,
        w * 0.18,
        h * 0.12,
        h * 0.9,
      );
      wash.addColorStop(0, css(light, 0.1));
      wash.addColorStop(1, css(light, 0));
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, w, horizon);
      const text = params.current.backdropText;
      if (text) {
        ctx.font = `500 ${Math.round(h * 0.3)}px ${getComputedStyle(root).fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = computed(SCENE.label);
        ctx.fillText(text, w / 2, horizon - h * 0.08, w * 0.92);
      }
      const table = ctx.createLinearGradient(0, horizon, 0, h);
      table.addColorStop(0, computed(SCENE.table));
      table.addColorStop(1, computed(SCENE.tableFront));
      ctx.fillStyle = table;
      ctx.fillRect(0, horizon, w, h - horizon);
      // Boards running away from the viewer, so the glass has lines to bend.
      ctx.strokeStyle = computed(SCENE.line);
      ctx.lineWidth = 1;
      const vanish = horizon - h * 1.4;
      const toward = (horizon - vanish) / (h - vanish);
      ctx.beginPath();
      for (let i = -8; i <= 8; i += 1) {
        const fx = w / 2 + i * w * 0.085;
        ctx.moveTo(w / 2 + (fx - w / 2) * toward, horizon);
        ctx.lineTo(fx, h);
      }
      ctx.moveTo(0, horizon + 0.5);
      ctx.lineTo(w, horizon + 0.5);
      ctx.stroke();
      texture = uploadTexture(gl, room, { linear: true }, texture);
    };

    const readColours = () => {
      const p = params.current;
      colours.glass = unit(resolve(p.glassColor));
      colours.weather = unit(resolve(p.weatherColor));
      colours.storm = unit(resolve(SCENE.storm));
      colours.light = unit(resolve(SCENE.light));
      colours.shadow = unit(resolve(SCENE.shadow));
    };

    const reseed = (still: boolean) => {
      const p = params.current;
      const wx = WEATHER[p.weather];
      seedFlakes(flakes, heap, wx.flakes, p.seed + reseeds, wx.rain);
      if (still && !wx.rain) settleFlakes(flakes, heap);
    };

    const draw = () => {
      if (lost || gl.isContextLost() || !texture) return;
      const p = params.current;
      const wx = WEATHER[p.weather];
      const t = sim.current;
      resizeGL(gl, canvas, { dprCap: Math.min(2, Math.max(1, p.dpr)) });
      const ior = 1 + clamp(p.refraction, 0, 1) * 0.55;
      // Flakes in the ball's frame, seen through the front surface: the
      // deeper a flake sits, the more the glass magnifies it.
      const count = Math.min(MAX_FLAKES, flakes.length);
      for (let i = 0; i < count; i += 1) {
        const f = flakes[i];
        if (!f) continue;
        const mag = 1 + (ior - 1) * 0.55 * (0.5 - f.z * 0.5);
        let x = f.x * mag;
        let y = f.y * mag;
        const len = Math.hypot(x, y);
        if (len > 0.95) {
          x = (x / len) * 0.95;
          y = (y / len) * 0.95;
        }
        flakeData[i * 4] = x;
        flakeData[i * 4 + 1] = y;
        flakeData[i * 4 + 2] = f.size * (1 + f.z * 0.25);
        flakeData[i * 4 + 3] = wx.rain
          ? 0.5
          : 0.62 + 0.38 * ((f.z + 0.9) / 1.8);
      }
      const lean = Math.hypot(t.omega * 0.35, 1);
      program.use();
      program.texture("u_backdrop", texture, 0);
      gl.uniform2f(U.u_res ?? null, geo.w, geo.h);
      gl.uniform3f(U.u_orb ?? null, geo.restX + t.x, geo.restY - t.lift, geo.r);
      gl.uniform1f(U.u_floor ?? null, geo.floor);
      gl.uniform1f(U.u_lift ?? null, t.lift);
      gl.uniform1f(U.u_ior ?? null, ior);
      gl.uniform1f(U.u_tint ?? null, clamp(p.tint, 0, 1));
      gl.uniform3fv(U.u_glass ?? null, colours.glass);
      gl.uniform3fv(U.u_weather ?? null, colours.weather);
      gl.uniform3fv(U.u_storm ?? null, colours.storm);
      gl.uniform3fv(U.u_light ?? null, colours.light);
      gl.uniform3fv(U.u_shadow ?? null, colours.shadow);
      gl.uniform1f(U.u_cloud ?? null, wx.cloud);
      gl.uniform1f(U.u_stormMix ?? null, wx.storm);
      gl.uniform1f(U.u_phi ?? null, t.phi);
      gl.uniform1f(U.u_time ?? null, t.time);
      gl.uniform1f(U.u_flash ?? null, t.flash);
      gl.uniform1f(U.u_hover ?? null, hover.get());
      gl.uniform1f(U.u_seed ?? null, (p.seed % 97) * 1.37);
      if (U.u_flakes) gl.uniform4fv(U.u_flakes, flakeData);
      gl.uniform1i(U.u_count ?? null, count);
      gl.uniform1i(U.u_rain ?? null, wx.rain ? 1 : 0);
      gl.uniform2f(U.u_fall ?? null, (t.omega * 0.35) / lean, -1 / lean);
      tri.draw();
      offsetX.set(r2(t.x));
      offsetY.set(r2(-t.lift));
      if (!shown) {
        shown = true;
        setReady(true);
      }
    };

    const land = (impact: number) => {
      const p = params.current;
      const t = sim.current;
      const stir = 0.25 + clamp(p.swirl, 0, 1) * 1.5;
      const jolt = Math.min(2.6, (impact / geo.r) * 0.08) * stir;
      for (const f of flakes) {
        f.vy += jolt * (0.5 + f.hash * 0.5);
        f.vx += jolt * 0.45 * (f.hash - 0.5);
      }
      t.jolt = true;
      t.omega += (t.shakeSign * jolt) / 2;
      if (impact > 160) {
        events.current.audio.play("swish", {
          pitch: 0.62,
          gain: Math.min(0.5, impact / 2400),
          pan: Number((((geo.restX + t.x) / geo.w) * 1.2 - 0.6).toFixed(3)),
        });
      }
    };

    /** One fixed step of the orb, the fluid inside it and the flakes. */
    const step = (dt: number) => {
      const p = params.current;
      const t = sim.current;
      const wx = WEATHER[p.weather];
      const stir = 0.25 + clamp(p.swirl, 0, 1) * 1.5;
      if (!t.dragging) {
        const w = clamp(p.wobble, 0, 1);
        const stiffness = lerp(
          springs.glide.stiffness,
          springs.recoil.stiffness,
          w,
        );
        const damping = 2 * lerp(0.98, 0.53, w) * Math.sqrt(stiffness);
        t.vx += (-stiffness * t.x - damping * t.vx) * dt;
        t.x += t.vx * dt;
        if (t.lift > 0 || t.vy > 0) {
          t.vy -= GRAVITY * dt;
          t.lift += t.vy * dt;
          if (t.lift <= 0) {
            t.lift = 0;
            const impact = -t.vy;
            t.vy = impact > 60 ? impact * RESTITUTION : 0;
            if (impact > 60) land(impact);
          }
        }
      }
      // The glass turns as it rolls; the fluid is dragged after it and lags,
      // so it keeps turning for a moment once the glass stops.
      const glassSpin = (-t.vx / geo.r) * (t.lift > 1 ? 0.4 : 1);
      const ambient =
        clamp(p.drift, 0, 1) * 0.35 * Math.sin(t.time * 0.23 + p.seed);
      t.omega += (glassSpin * stir - t.omega) * (1 - Math.exp(-dt / 0.85));
      t.phi += (t.omega + ambient) * dt;
      t.time += dt;
      t.flash = Math.max(0, t.flash - dt / 0.26);
      // The orb's own acceleration sloshes whatever is inside it.
      const ax = (t.vx - t.prevVx) / dt;
      const ay = (t.vy - t.prevVy) / dt;
      t.prevVx = t.vx;
      t.prevVy = t.vy;
      const spin = t.omega + ambient;
      const agitation = clamp(
        Math.abs(t.omega) * 0.5 + t.flash + p.drift,
        0,
        1,
      );
      const fall = wx.rain ? 1.5 * agitation : 0.12;
      const follow = 1 - Math.exp(-dt / (wx.rain ? 0.05 : 0.25));
      const slosh = ((0.35 * stir) / Math.max(geo.r, 1)) * dt;
      const shove = Math.hypot(ax, ay) * slosh;
      for (const f of flakes) {
        const ux = -spin * f.y;
        const uy = spin * f.x;
        if (f.bin >= 0) {
          // Lying in the drift until the fluid or a jolt picks it up.
          if (!t.jolt && Math.hypot(ux, uy) < 0.2 && shove < 0.02) continue;
          heap[f.bin] = Math.max(0, (heap[f.bin] ?? 0) - f.size * 0.55);
          f.bin = -1;
        }
        f.vx += (ux - f.vx) * follow - ax * slosh;
        f.vy += (uy - fall - f.vy) * follow - ay * slosh;
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        const reach = Math.sqrt(Math.max(0, REACH * REACH - f.z * f.z));
        const len = Math.hypot(f.x, f.y);
        if (len > reach) {
          const nx = f.x / len;
          const ny = f.y / len;
          f.x = nx * reach;
          f.y = ny * reach;
          const vn = f.vx * nx + f.vy * ny;
          if (vn > 0) {
            f.vx -= vn * nx;
            f.vy -= vn * ny;
          }
          f.vx *= 0.85;
          f.vy *= 0.85;
          // Rain reaching the floor of a stirred storm falls again from the
          // top; in a calm one it beads there like the snow.
          if (wx.rain && ny < -0.6 && agitation > 0.05) {
            const x = (f.hash - 0.5) * 1.1;
            f.x = x;
            f.y = Math.sqrt(Math.max(0, reach * reach - x * x)) * 0.9;
            f.hash = (f.hash * 9.73 + 0.31) % 1;
            continue;
          }
        }
        const floor = floorAt(f, heap);
        if (f.y <= floor && f.vy <= 0 && Math.hypot(f.vx, f.vy) < 0.3) {
          f.y = floor;
          f.vx = 0;
          f.vy = 0;
          f.bin = binOf(f.x);
          heap[f.bin] = (heap[f.bin] ?? 0) + f.size * 0.55;
        }
      }
      t.jolt = false;
    };

    const settled = () => {
      const t = sim.current;
      if (t.dragging) return false;
      if (Math.abs(t.x) > 0.05 || Math.abs(t.vx) > 1) return false;
      if (t.lift > 0.05 || Math.abs(t.vy) > 1) return false;
      // Spin only matters when there is weather to show it; under ~3° a
      // second it no longer reads.
      const wx = WEATHER[params.current.weather];
      const empty = wx.cloud === 0 && wx.flakes === 0;
      return (empty || Math.abs(t.omega) < 0.05) && t.flash === 0;
    };
    const flakesStill = () => {
      for (const f of flakes) if (f.bin < 0) return false;
      return true;
    };

    const frame = (now: number) => {
      raf = 0;
      const p = params.current;
      if (lost || !inView || document.hidden || !p.motionSafe) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : STEP;
      last = now;
      if (p.paused) {
        draw();
        last = 0;
        return;
      }
      acc += dt;
      while (acc >= STEP) {
        step(STEP);
        acc -= STEP;
      }
      const t = sim.current;
      const still = settled();
      if (still && t.stirred) {
        t.stirred = false;
        events.current.onSettle?.();
      }
      const wx = WEATHER[p.weather];
      const busy = !still || (wx.flakes > 0 && !flakesStill());
      // Mist drifts for as long as it is on screen; snow only until the
      // last flake has landed.
      const ambient = p.drift > 0 && wx.cloud >= 0.5;
      if (!busy && !ambient) {
        draw();
        last = 0;
        return;
      }
      // Only the slow ambient weather is left: it is drawn at half rate.
      skip = !busy && !skip;
      if (!skip) draw();
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || lost) return;
      if (!params.current.motionSafe) {
        draw();
        return;
      }
      if (!inView || document.hidden) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const rebuild = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w < 2 || h < 2) return;
      geo = geometry(w, h, params.current.size);
      readColours();
      paintRoom();
      draw();
      start();
    };

    reseed(!params.current.motionSafe);
    api.current = {
      wake: start,
      redraw: () => {
        if (!raf) draw();
      },
      reseed: (still) => {
        reseeds += 1;
        reseed(still);
      },
      // A new size, word or colour re-lays the room from the box as it is.
      repaint: () => {
        if (texture) rebuild();
      },
      geometry: () => geo,
    };

    const sizer = new ResizeObserver(rebuild);
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) start();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const detach = onContextLoss(
      canvas,
      () => {
        lost = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        setReady(false);
      },
      () => setGlKey((k) => k + 1),
    );
    void document.fonts?.ready.then(() => {
      if (!lost && texture) {
        paintRoom();
        draw();
      }
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      lost = true;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      detach();
      if (texture) gl.deleteTexture(texture);
      tri.dispose();
      program.dispose();
      api.current = null;
    };
    // Every prop reaches the loop through `params`; the room is rebuilt by
    // the effects below, not by tearing down the context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [glKey]);

  // New words or colours repaint the room; a new size re-lays it out.
  React.useEffect(() => {
    api.current?.repaint();
  }, [backdropText, glassColor, weatherColor, size, dpr]);

  // A new weather (or seed) starts in the air and falls; reduced motion
  // shows it already settled.
  const shownWeather = React.useRef({ weather, seed });
  React.useEffect(() => {
    const prev = shownWeather.current;
    if (prev.weather === weather && prev.seed === seed) return;
    shownWeather.current = { weather, seed };
    api.current?.reseed(!motionSafe);
    api.current?.redraw();
    api.current?.wake();
  }, [weather, seed, motionSafe]);

  // Anything else needs a fresh frame, or the loop to resume.
  React.useEffect(() => {
    api.current?.redraw();
    api.current?.wake();
  }, [refraction, tint, swirl, wobble, drift, paused, motionSafe]);

  React.useEffect(
    () => hover.on("change", () => api.current?.redraw()),
    [hover],
  );

  const panAt = (geo: Geometry) =>
    Number((((geo.restX + sim.current.x) / geo.w) * 1.2 - 0.6).toFixed(3));

  const stir = (kind: "roll" | "hop" | "shake", direction = 1) => {
    const geo = api.current?.geometry();
    if (!geo) return;
    const t = sim.current;
    onStir?.();
    if (!motionSafe) {
      // Reduced motion: nothing travels — the weather settles into a new
      // still arrangement at once, so it is settled as soon as it is stirred.
      api.current?.reseed(true);
      api.current?.redraw();
      onSettle?.();
      return;
    }
    t.stirred = true;
    const swirlK = 0.25 + clamp(swirl, 0, 1) * 1.5;
    if (kind === "roll") {
      t.vx += direction * geo.r * 9;
      t.omega -= direction * 1.2 * swirlK;
      t.jolt = true;
      audio.play("swish", { pitch: 1.05, gain: 0.4, pan: panAt(geo) });
    } else {
      const height = Math.min(
        geo.maxLift,
        geo.r * (kind === "shake" ? 0.42 : 0.34),
      );
      if (t.lift < 1 && height > 2) t.vy = Math.sqrt(2 * GRAVITY * height);
      if (kind === "shake") {
        t.shakeSign = -t.shakeSign;
        t.omega += t.shakeSign * 3.4 * swirlK;
        t.vx += t.shakeSign * geo.r * 2.4;
        t.jolt = true;
        if (WEATHER[weather].storm > 0) t.flash = 1;
      }
      audio.play("swish", {
        pitch: kind === "shake" ? 1.25 : 0.9,
        gain: kind === "shake" ? 0.55 : 0.35,
        pan: panAt(geo),
      });
    }
    api.current?.wake();
  };

  const drag = useDrag({
    threshold: 4,
    disabled: !interactive,
    onStart: () => {
      const t = sim.current;
      onStir?.();
      if (!motionSafe) return;
      t.dragging = true;
      t.stirred = true;
      t.dragX = t.x;
      t.dragLift = t.lift;
      t.lastMoveT = performance.now();
      api.current?.wake();
    },
    onMove: ({ offset }) => {
      const geo = api.current?.geometry();
      const t = sim.current;
      if (!geo || !t.dragging) return;
      const rawX = t.dragX + offset.x;
      const x =
        rawX < -geo.range
          ? -geo.range + rubberband(rawX + geo.range, geo.r * 2)
          : rawX > geo.range
            ? geo.range + rubberband(rawX - geo.range, geo.r * 2)
            : rawX;
      const rawLift = t.dragLift - offset.y;
      const lift =
        rawLift > geo.maxLift
          ? geo.maxLift + rubberband(rawLift - geo.maxLift, geo.r)
          : Math.max(0, rawLift);
      const now = performance.now();
      const dt = Math.max(0.008, (now - t.lastMoveT) / 1000);
      t.lastMoveT = now;
      // The hand places the orb; its speed is what turns the glass.
      t.vx = lerp(t.vx, (x - t.x) / dt, 0.5);
      t.vy = lerp(t.vy, (lift - t.lift) / dt, 0.5);
      t.x = x;
      t.lift = lift;
    },
    onEnd: ({ velocity }) => {
      const t = sim.current;
      const geo = api.current?.geometry();
      if (!t.dragging || !geo) {
        // Reduced motion: the drag never moved the orb; show a new stillness.
        api.current?.reseed(true);
        api.current?.redraw();
        onSettle?.();
        return;
      }
      t.dragging = false;
      t.vx = clamp(velocity.x, -4000, 4000);
      t.vy = clamp(-velocity.y, -4000, 4000);
      const speed = Math.hypot(velocity.x, velocity.y);
      if (speed > 220) {
        audio.play("swish", {
          pitch: 0.9 + Math.min(0.5, speed / 6000),
          gain: Math.min(0.6, speed / 4000),
          pan: panAt(geo),
        });
      }
      api.current?.wake();
    },
    onCancel: () => {
      sim.current.dragging = false;
      api.current?.wake();
    },
    onTap: (event) => {
      const geo = api.current?.geometry();
      const rect = rootRef.current?.getBoundingClientRect();
      if (!geo || !rect) return;
      // A tap pushes the orb away from the side it lands on.
      const centre = rect.left + geo.restX + sim.current.x;
      stir("roll", event.clientX < centre ? 1 : -1);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      stir("roll", event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      stir("hop");
    }
  };

  const top = `calc(${r2(FLOOR * 100)}cqh - ${diameter})`;
  const left = `calc(50% - ${diameter} / 2)`;

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={alt}
      className={cn(
        "[container-type:size] relative h-56 w-full overflow-hidden rounded-3",
        className,
      )}
    >
      {/* The still life without WebGL, and before the first frame: the same
          room, and a glass orb drawn with gradients where the GL one sits. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `linear-gradient(to bottom, ${SCENE.wall} 0%, ${SCENE.wallLow} ${HORIZON * 100}%, ${SCENE.table} ${HORIZON * 100}%, ${SCENE.tableFront} 100%)`,
        }}
      >
        {backdropText ? (
          <span
            className="absolute inset-x-0 text-center leading-none font-medium whitespace-nowrap"
            style={{ top: "31cqh", fontSize: "30cqh", color: SCENE.label }}
          >
            {backdropText}
          </span>
        ) : null}
        <span
          className="absolute rounded-full"
          style={{
            left: `calc(50% - ${diameter} * 0.2)`,
            top: `calc(${r2(FLOOR * 100)}cqh - ${diameter} * 0.08)`,
            width: `calc(${diameter} * 1.1)`,
            height: `calc(${diameter} * 0.18)`,
            background: `radial-gradient(closest-side, color-mix(in oklab, ${SCENE.shadow} 55%, transparent), transparent)`,
          }}
        />
        <span
          className="absolute rounded-full"
          style={{
            left,
            top,
            width: diameter,
            height: diameter,
            background: `radial-gradient(circle at 34% 26%, oklch(1 0 0 / 0.75) 0 5%, transparent 14%), radial-gradient(circle at 62% 70%, color-mix(in oklab, ${glassColor} 30%, transparent) 0, transparent 60%), radial-gradient(circle, color-mix(in oklab, ${glassColor} ${Math.round(clamp(tint, 0, 1) * 30 + 6)}%, transparent) 55%, color-mix(in oklab, ${glassColor} 40%, black) 100%)`,
            boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${glassColor} 30%, transparent)`,
          }}
        />
      </div>
      <motion.canvas
        key={glKey}
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
        initial={false}
        animate={{ opacity: ready ? 1 : 0 }}
        transition={
          motionSafe
            ? { duration: durations.base, ease: easings.enter }
            : { duration: 0 }
        }
      />
      {interactive ? (
        <motion.button
          type="button"
          aria-label="Shake the orb"
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          onClick={(event) => {
            // Space and Enter arrive as a click with no pointer behind it.
            if (event.detail === 0) stir("shake");
          }}
          onPointerEnter={() =>
            animate(hover, 1, { duration: durations.fast, ease: easings.enter })
          }
          onPointerLeave={() =>
            animate(hover, 0, { duration: durations.base, ease: easings.exit })
          }
          {...drag}
          className="absolute cursor-grab touch-none rounded-full outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid active:cursor-grabbing"
          style={{
            left,
            top,
            width: diameter,
            height: diameter,
            x: offsetX,
            y: offsetY,
          }}
        />
      ) : null}
      <span id={hintId} className="sr-only">
        Drag to roll or lift it. Left and Right roll it, Up lifts and drops it,
        Enter or Space shakes it.
      </span>
      {/* Colours are resolved on this probe, inside the component, so a
          themed wrapper's tokens are the ones read. */}
      <span
        ref={probeRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      />
      {/* A theme change shows up as this carrier's 1ms colour transition. */}
      <span
        aria-hidden
        onTransitionEnd={() => api.current?.repaint()}
        className="pointer-events-none absolute size-0 overflow-hidden bg-background text-foreground transition-colors duration-1"
      />
    </div>
  );
}
