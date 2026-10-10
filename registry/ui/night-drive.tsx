"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type NightDriveColors = "sodium" | "neon" | "ice" | "accent";

export type NightDriveProps = {
  /** The content on top of the road: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How fast the car cruises, 0 (parked, the scene holds still) to 2. @default 1 */
  speed?: number;
  /** Lanes across the road, 2 to 6; the left half is oncoming. @default 4 */
  lanes?: number;
  /** Headlights, taillights and street lamps: a named set, or three CSS colours of your own in that order. @default "sodium" */
  colors?: NightDriveColors | readonly string[];
  /** How busy the road is, 0 (empty) to 1 (nose to tail). @default 0.6 */
  traffic?: number;
  /** The exposure: how long each light's trail runs, 0 (short dashes) to 1 (long ribbons). @default 0.5 */
  streak?: number;
  /** How hard the road bends through its sweeping curves, 0 (dead straight) to 1. @default 0.5 */
  curve?: number;
  /** How wet the asphalt is: how strongly every light is mirrored in it, 0 to 1. @default 0.6 */
  reflection?: number;
  /** Street lamps along both shoulders, with their pools and reflections. @default true */
  lamps?: boolean;
  /** How many times faster the car goes at full warp, 1 to 10. @default 5 */
  warpFactor?: number;
  /** Hold the warp from outside: a button, a key, a scroll position. The pointer's own hold works either way. @default false */
  warp?: boolean;
  /** Fires when the visitor's hold puts the car into warp (true) or lets it ease back to a cruise (false). */
  onWarpChange?: (warping: boolean) => void;
  /** The pointer steers across the lanes and a held press warps; keyboard focus inside steers and surges. @default true */
  interactive?: boolean;
  /** How far the hand steers the car across its lanes, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the scene still; steering and the warp still answer. @default false */
  paused?: boolean;
  /** Seeds the traffic and the bends, so two roads never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) steering. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Lights are emissive, so they keep their own colour in either theme: head, tail, lamp. */
const SETS: Record<NightDriveColors, readonly [string, string, string]> = {
  sodium: ["oklch(0.95 0.035 88)", "oklch(0.62 0.22 27)", "oklch(0.8 0.15 68)"],
  neon: ["oklch(0.9 0.1 205)", "oklch(0.64 0.25 345)", "oklch(0.72 0.16 295)"],
  ice: ["oklch(0.95 0.03 245)", "oklch(0.7 0.16 22)", "oklch(0.86 0.06 220)"],
  accent: [
    "oklch(from var(--accent-bright) 0.93 calc(c * 0.3) h)",
    "oklch(from var(--accent) 0.6 c h)",
    "oklch(from var(--signal) 0.82 calc(c * 0.8) h)",
  ],
};

/**
 * The sky and the asphalt come from the page: the sky is the page's own tone
 * pulled a little toward night blue, and the road sits far below the page's
 * lightness, so a dark page gets night and a light page blue hour.
 */
const SKY = "color-mix(in oklab, var(--background) 84%, oklch(0.32 0.09 262))";
const ROAD = "oklch(from var(--background) calc(l * 0.2 + 0.11) 0.016 258)";
const GROUND = "var(--background)";

/** The browser draws the canvas a quarter smaller and scales it up: lights are soft by nature. */
const RENDER_SCALE = 0.75;
const STEP = 1 / 120;
/** The warp rises on glide and lets go on drift; the car's place across the lanes follows on glide. */
const GLIDE = springs.glide;
const DRIFT = springs.drift;
/** Metres per second at speed 1: a brisk motorway cruise. */
const CRUISE = 27;
/** The keyboard's surge, ms. */
const SURGE = 450;
/** Car patterns repeat every this many cars, so a lane's flow can wrap without a seam. */
const WRAP = 64;
const LANE = 3.6;
const MEDIAN = 0.35;
const LAMP_GAP = 46;
/** Camera and lamp heights, metres: a high cab seat, tall street lamps. */
const CAM_H = 2.3;
const LAMP_H = 8.5;
const DASH = 12;
/** Where the horizon sits, of the height: the sky keeps room for a headline. */
const HORIZON = 0.4;

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

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_px;
uniform float u_horizon;
uniform float u_focal;
uniform float u_camX;
uniform float u_roll;
uniform float u_K;
uniform float u_K1;
uniform float u_yaw;
uniform float u_dash;
uniform float u_lampPhase;
uniform vec3 u_flowOn;
uniform vec3 u_flowUs;
uniform vec3 u_spOn;
uniform vec3 u_spUs;
uniform float u_on;
uniform float u_us;
uniform float u_traffic;
uniform float u_trail;
uniform float u_warp;
uniform float u_wet;
uniform float u_lamps;
uniform float u_day;
uniform vec3 u_sky;
uniform vec3 u_road;
uniform vec3 u_head;
uniform vec3 u_tail;
uniform vec3 u_lamp;
uniform float u_seed;
uniform float u_frame;
uniform vec4 u_lampA[18];
uniform vec4 u_lampB[18];
uniform vec2 u_lampC[18];
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

const float CAM_H = 2.3;
const float LIGHT_H = 0.7;
const float LANE = 3.6;
const float MEDIAN = 0.35;
const float LAMP_GAP = 46.0;
const float LAMP_FIRST = 16.0;

// The road's centre, across, at depth z: the bend ahead from the curvature
// and its rate of change, less the camera's own turn into the bend.
float bend(float z) {
  return 0.5 * u_K * z * z + u_K1 * z * z * z / 6.0 - u_yaw * z;
}

// A line's coverage of this pixel, its energy kept when thinner than one.
float lineCov(float d, float halfW, float mpp) {
  float w = max(halfW, mpp * 0.5);
  return clamp((w - d) / mpp + 0.5, 0.0, 1.0) * (halfW / w);
}

float carOn(float k, float lane) {
  return kx_hash(vec2(mod(k, 64.0) + u_seed * 7.13, lane * 13.7 + 3.1));
}

// One lane's light trails at depth z. Oncoming cars flow toward the camera
// with their trails behind them (farther away); ours flow away with their
// trails toward us. Past a pixel's footprint the pattern becomes its mean.
float trails(float z, float dz, float lane, float sp, float flow, float toward) {
  float q = toward > 0.5 ? (z + flow) / sp : (z - flow) / sp;
  float k = floor(q);
  float fr = q - k;
  float behind = toward > 0.5 ? fr * sp : (1.0 - fr) * sp;
  float car = toward > 0.5 ? k : k + 1.0;
  float present = step(carOn(car, lane), u_traffic);
  // Oncoming cars close fast, so their exposure runs longer.
  float trail = min(u_trail * (toward > 0.5 ? 1.4 : 1.0), sp * 0.92);
  float tail = pow(clamp(1.0 - behind / trail, 0.0, 1.0), 1.25);
  float head = exp(-(behind * behind) / 0.7);
  float b = present * (tail * 0.8 + head * 0.9);
  float mean = u_traffic * (trail / sp) * 0.36;
  return mix(b, mean, smoothstep(0.18, 0.7, dz / sp));
}

// Every car's two lights at lateral u and depth z, on the light plane or its
// mirror; widen spreads them for the wet reflection.
vec3 traffic(float z, float dz, float u, float mpp, float widen) {
  if (z < 1.0) return vec3(0.0);
  float au = abs(u) - MEDIAN;
  if (au < 0.0) return vec3(0.0);
  float idx = floor(au / LANE);
  float oncoming = u < 0.0 ? 1.0 : 0.0;
  float count = oncoming > 0.5 ? u_on : u_us;
  if (idx >= count) return vec3(0.0);
  float o = au - LANE * (idx + 0.5);
  float d = min(abs(o - 0.78), abs(o + 0.78));
  float w = max(0.07, mpp * 0.85) * widen;
  float lat = exp(-(d * d) / (w * w)) + 0.16 * exp(-d / (w * 5.0));
  float sp;
  float flow;
  if (oncoming > 0.5) {
    sp = idx < 0.5 ? u_spOn.x : idx < 1.5 ? u_spOn.y : u_spOn.z;
    flow = idx < 0.5 ? u_flowOn.x : idx < 1.5 ? u_flowOn.y : u_flowOn.z;
  } else {
    sp = idx < 0.5 ? u_spUs.x : idx < 1.5 ? u_spUs.y : u_spUs.z;
    flow = idx < 0.5 ? u_flowUs.x : idx < 1.5 ? u_flowUs.y : u_flowUs.z;
  }
  float b = trails(z, dz, idx + oncoming * 8.0, sp, flow, oncoming);
  // No car is ever right on top of the camera: ours keep their distance,
  // oncoming ones leave the frame before they pass.
  float near = oncoming > 0.5 ? smoothstep(1.2, 3.5, z) : smoothstep(12.0, 24.0, z);
  float fog = exp(-z / 340.0);
  vec3 tint = oncoming > 0.5 ? u_head : u_tail;
  return tint * lat * b * near * fog * 1.6;
}

void main() {
  vec2 p = v_uv * u_size;
  float cx = u_size.x * 0.5;
  // The car leans a little into a lane change: the frame turns about the
  // vanishing point.
  vec2 rel = p - vec2(cx, u_horizon);
  float cr = cos(u_roll);
  float sr = sin(u_roll);
  rel = vec2(cr * rel.x - sr * rel.y, sr * rel.x + cr * rel.y);
  p = rel + vec2(cx, u_horizon);
  float sx = rel.x;
  float dy = rel.y;
  float f = u_focal;
  float h = u_size.y;
  float onePx = 1.0 / u_px;

  // Depths of this pixel on the road, the light plane and its mirror. Their
  // derivatives are taken here, for every pixel, before any branching.
  float dyc = max(dy, 0.25);
  float zRoad = CAM_H * f / dyc;
  float zLight = (CAM_H - LIGHT_H) * f / dyc;
  float zMirror = (CAM_H + LIGHT_H) * f / dyc;
  float dzLight = fwidth(zLight);
  float dzMirror = fwidth(zMirror);
  float qDash = (zRoad + u_dash) / 12.0;
  float dDash = fwidth(qDash);

  vec3 hazeC = mix(u_sky, u_lamp, mix(0.12, 0.26, u_day));
  vec3 col;
  vec3 light = vec3(0.0);
  float lampCore = 0.0;

  if (dy <= 0.0) {
    // Sky: the page's tone at the top, a haze of lamp light at the horizon.
    float t = clamp(-dy / max(u_horizon, 1.0), 0.0, 1.0);
    col = mix(hazeC, u_sky, pow(t, 0.5));
    col += u_lamp * (0.07 + 0.08 * u_warp) * exp(dy / (h * 0.07)) * (1.0 - 0.5 * u_day);
    // A low ridge far off, with a few lights along its foot at night.
    float ridge = u_horizon - h * (0.012 + 0.034 * kx_fbm(vec2(sx / (h * 0.8) + u_seed * 3.1, 0.37)));
    vec3 ridgeC = mix(u_road, u_sky, mix(0.28, 0.45, u_day));
    float onRidge = smoothstep(ridge - onePx, ridge + onePx, p.y);
    col = mix(col, ridgeC, onRidge);
    float town = step(0.94, kx_hash(vec2(floor(p.x / 3.0), u_seed)));
    col += u_lamp * town * onRidge * exp(-pow((p.y - u_horizon + 1.5) / 1.1, 2.0)) * 0.5 * (1.0 - u_day);
  } else {
    float z = zRoad;
    float mpp = z / (f * u_px);
    float u = sx * z / f + u_camX - bend(z);
    float au = abs(u);
    float edgeL = MEDIAN + LANE * u_on;
    float edgeR = MEDIAN + LANE * u_us;
    float edge = u < 0.0 ? edgeL : edgeR;
    float count = u < 0.0 ? u_on : u_us;
    // Asphalt, a pale strip of shoulder, then the dark verge.
    vec3 asphalt = u_road * (0.94 + 0.12 * kx_noise(vec2(u * 5.0, z * 5.0)) * (1.0 - smoothstep(0.02, 0.08, mpp)));
    float shoulder = smoothstep(edge - mpp, edge + mpp, au);
    float verge = smoothstep(edge + 2.4 - mpp, edge + 2.4 + mpp, au);
    col = mix(asphalt, u_road * 1.12, shoulder);
    col = mix(col, mix(u_road * 0.7, u_sky, 0.08), verge);

    // Light on the road: our own headlights near the car, sodium pools
    // under every lamp.
    float own = exp(-z / 26.0) * exp(-pow((u - u_camX) / (2.0 + z * 0.09), 2.0));
    float dzL = (fract((z + u_lampPhase - LAMP_FIRST) / LAMP_GAP + 0.5) - 0.5) * LAMP_GAP;
    float poolL = exp(-(dzL * dzL + pow(u + edgeL + 1.6, 2.0)) / 60.0);
    float poolR = exp(-(dzL * dzL + pow(u - edgeR - 1.6, 2.0)) / 60.0);
    float pools = (poolL + poolR) * u_lamps;
    col += u_head * own * 0.16 + u_lamp * pools * 0.22;

    // Markings: dashed dividers, solid edges, a double line in the middle.
    float lw = 0.065;
    float off = au - MEDIAN;
    float k = clamp(floor(off / LANE + 0.5), 1.0, max(1.0, count - 1.0));
    float divider = count > 1.5 ? lineCov(abs(off - LANE * k), lw, mpp) : 0.0;
    float fd = fract(qDash);
    float aa = max(dDash, 1e-4);
    float dash = smoothstep(0.0, aa, fd) * (1.0 - smoothstep(0.3 - aa, 0.3, fd));
    dash = mix(dash, 0.3, smoothstep(0.25, 0.65, dDash + u_warp * 0.55));
    float edgeLine = lineCov(abs(au - edge + 0.12), lw, mpp);
    float middle = lineCov(abs(au - 0.12), lw * 0.8, mpp);
    float lit = 0.22 + 0.9 * own + 0.9 * pools;
    vec3 paint = mix(u_road, vec3(0.92), 0.55);
    col = mix(col, paint * lit, clamp(divider * dash + edgeLine, 0.0, 1.0) * 0.85);
    col = mix(col, mix(u_road, u_lamp, 0.6) * (0.45 + 0.6 * lit), middle * 0.55);

    // The wet road: the sky mirrored at a grazing angle, more toward the
    // horizon.
    float fresnel = mix(0.18, 1.0, exp(-dy / (h * 0.16)));
    col = mix(col, hazeC, u_wet * fresnel * 0.4);

    // Traffic on the light plane, and its reflection in the wet asphalt,
    // rippled by a fine noise.
    float zl = zLight;
    float ul = sx * zl / f + u_camX - bend(zl);
    light += traffic(zl, dzLight, ul, zl / (f * u_px), 1.0);
    float zm = zMirror;
    float um = sx * zm / f + u_camX - bend(zm);
    um += (kx_noise(vec2(zm * 0.3, um * 1.6 + u_dash * 0.2)) - 0.5) * 0.6 * u_wet;
    light += traffic(zm, dzMirror, um, zm / (f * u_px), 2.6) * u_wet * 0.45 * fresnel;

    // Distance swallows the road into the horizon's haze.
    col = mix(col, hazeC, 1.0 - exp(-z / 190.0));
  }

  // Street lamps on both shoulders: a glowing head on a dark pole, and a
  // long reflection of each in the wet road below. Their places on screen
  // are worked out once a frame on the CPU; each pixel only tests the few
  // that can reach it.
  if (u_lamps > 0.5) {
    float pole = 0.0;
    for (int i = 0; i < 18; i++) {
      vec4 a = u_lampA[i];
      if (a.w <= 0.0) continue;
      vec4 b = u_lampB[i];
      vec2 c = u_lampC[i];
      vec2 dh = p - a.xy;
      float d2 = dot(dh, dh);
      float r = a.z;
      if (d2 < r * r * 1600.0) {
        float d = sqrt(d2);
        float core = exp(-d2 / (r * r));
        lampCore += core * a.w;
        light += u_lamp * a.w * (core * 1.3 + exp(-d / (r * 7.0)) * 0.2);
      }
      float px = abs(p.x - b.x);
      if (px < b.z * 2.0 + onePx && p.y >= a.y && p.y <= b.y) {
        pole = max(pole, lineCov(px, b.z * 0.5, onePx) * a.w * 0.75);
      }
      float dx = p.x - a.x;
      if (p.y > u_horizon && abs(dx) < c.x * 3.0) {
        float dyM = p.y - b.w;
        light += u_lamp * a.w * u_wet * 0.42 * exp(-(dx * dx) / (c.x * c.x)) * exp(-(dyM * dyM) / (c.y * c.y));
      }
    }
    col = mix(col, mix(u_road * 0.6, u_sky * 0.4, u_day * 0.5), pole * (1.0 - 0.4 * u_day));
  }

  // Light adds to the dark and screens over the pale; at blue hour a lamp
  // head is a warm dot against the sky rather than a white one.
  light = light / (1.0 + light * 0.45);
  col = col + light * (1.0 - col * mix(0.15, 0.85, u_day));
  col = mix(col, u_lamp, clamp(lampCore, 0.0, 1.0) * u_day * 0.7);
  float grain = kx_hash(gl_FragCoord.xy + vec2(u_frame * 13.0, u_frame * 29.0));
  col += (grain - 0.5) * 0.018;
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
  speed: number;
  lanes: number;
  colorKey: string;
  traffic: number;
  streak: number;
  curve: number;
  reflection: number;
  lamps: boolean;
  warpFactor: number;
  warp: boolean;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onWarp: (warping: boolean) => void;
  onActive: (active: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  hold: (on: boolean) => void;
  surge: () => void;
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
  let disposed = false;
  let failed = false;
  let active = false;
  let reported = false;
  let frames = 0;
  let surgeTimer = 0;
  let pressing = false;
  let surging = false;
  let day = 0;
  const read = rgbReader();
  /** sky, road, head, tail, lamp, page */
  const colours = new Float32Array(18);
  const size = { w: 0, h: 0 };
  /** Each lane's car spacing, metres: oncoming three, then ours. */
  const spacing = new Float32Array(6);
  const flows = new Float64Array(6);
  /** Each lamp's place on screen this frame: head, pole and reflection. */
  const lampA = new Float32Array(18 * 4);
  const lampB = new Float32Array(18 * 4);
  const lampC = new Float32Array(18 * 2);
  /** The two slow waves the road's bends are made of, seeded. */
  const curves = { p1: 0, p2: 0 };
  const sim = {
    /** Distance travelled, metres, kept in float64 for the bends. */
    travelled: 0,
    warp: 0,
    warpV: 0,
    camX: MEDIAN + LANE / 2,
    camV: 0,
  };
  const hand = {
    x: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  /** The visitor's own hold (a press or a keyboard surge), told once per change. */
  const tellWarp = () => {
    const now = pressing || surging;
    if (now === reported) return;
    reported = now;
    cfg?.onWarp(now);
  };

  const holding = () => pressing || surging || Boolean(cfg?.warp);

  const lanesOf = (c: Config) => {
    const n = clamp(Math.round(c.lanes), 2, 6);
    const on = Math.floor(n / 2);
    return { on, us: n - on };
  };

  /** Where the car wants to be across the road, metres from the median. */
  const steerTarget = (c: Config) => {
    const { us } = lanesOf(c);
    const home = MEDIAN + LANE / 2;
    if (!hand.present || !c.interactive || size.w < 1) return home;
    const lo = MEDIAN + 0.9;
    const hi = MEDIAN + LANE * us - 0.9;
    const fx = clamp(hand.x / size.w, 0, 1);
    return home + (lo + (hi - lo) * fx - home) * clamp(c.pointerStrength, 0, 1);
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

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const { on, us } = lanesOf(c);
    program.use();
    gl.uniform2f(u.u_size ?? null, size.w, size.h);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_horizon ?? null, size.h * HORIZON);
    gl.uniform1f(u.u_on ?? null, on);
    gl.uniform1f(u.u_us ?? null, us);
    gl.uniform1f(u.u_traffic ?? null, clamp(c.traffic, 0, 1));
    gl.uniform1f(u.u_wet ?? null, clamp(c.reflection, 0, 1));
    gl.uniform1f(u.u_lamps ?? null, c.lamps ? 1 : 0);
    gl.uniform1f(u.u_day ?? null, day);
    gl.uniform1f(u.u_seed ?? null, (Math.abs(Math.round(c.seed)) % 97) + 0.5);
    gl.uniform3f(
      u.u_spOn ?? null,
      spacing[0] ?? 40,
      spacing[1] ?? 40,
      spacing[2] ?? 40,
    );
    gl.uniform3f(
      u.u_spUs ?? null,
      spacing[3] ?? 40,
      spacing[4] ?? 40,
      spacing[5] ?? 40,
    );
    const names = ["u_sky", "u_road", "u_head", "u_tail", "u_lamp"];
    for (let i = 0; i < 5; i += 1) {
      gl.uniform3f(
        u[names[i] ?? "u_sky"] ?? null,
        colours[i * 3] ?? 0,
        colours[i * 3 + 1] ?? 0,
        colours[i * 3 + 2] ?? 0,
      );
    }
  };

  /**
   * The lamps on screen, nearest first: nine down each shoulder, each a head
   * on a pole with its reflection, faded in from the haze far off.
   */
  const placeLamps = (
    c: Config,
    focal: number,
    K: number,
    K1: number,
    travelled: number,
  ) => {
    lampA.fill(0);
    if (!c.lamps) return;
    const { on, us } = lanesOf(c);
    const horizon = size.h * HORIZON;
    const cx = size.w / 2;
    const one = size.w / Math.max(1, canvas.width);
    const phase = travelled % LAMP_GAP;
    const yaw = K * 35;
    for (let j = 0; j < 9; j += 1) {
      const z = 16 + LAMP_GAP * j - phase;
      if (z < 3) continue;
      const ppm = focal / z;
      const far = Math.min(1, Math.max(0, (z - 300) / 70));
      const fog = Math.exp(-z / 300) * (1 - far * far * (3 - 2 * far));
      const bend = 0.5 * K * z * z + (K1 * z * z * z) / 6 - yaw * z;
      for (let side = 0; side < 2; side += 1) {
        const k = j * 2 + side;
        const base =
          side === 0 ? -(MEDIAN + LANE * on) - 2.3 : MEDIAN + LANE * us + 2.3;
        const inward = side === 0 ? 1.1 : -1.1;
        lampA[k * 4] = cx + (base + inward - sim.camX + bend) * ppm;
        lampA[k * 4 + 1] = horizon - (LAMP_H - CAM_H) * ppm;
        lampA[k * 4 + 2] = Math.max(1.1 * one, 0.3 * ppm);
        lampA[k * 4 + 3] = fog;
        lampB[k * 4] = cx + (base - sim.camX + bend) * ppm;
        lampB[k * 4 + 1] = horizon + CAM_H * ppm;
        lampB[k * 4 + 2] = Math.max(0.7 * one, 0.16 * ppm);
        lampB[k * 4 + 3] = horizon + (LAMP_H + CAM_H) * ppm;
        lampC[k * 2] = Math.max(1.3 * one, 0.45 * ppm);
        lampC[k * 2 + 1] = (LAMP_H + CAM_H) * ppm * 0.5;
      }
    }
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    // The bend at the camera and how fast it is changing, from the distance
    // travelled: two slow incommensurate waves, so the road never repeats.
    const s = sim.travelled;
    const amp = clamp(c.curve, 0, 1) * 0.0034;
    const K =
      amp *
      (0.66 * Math.sin(s / 540 + curves.p1) +
        0.34 * Math.sin(s / 197 + curves.p2));
    const K1 =
      amp *
      ((0.66 / 540) * Math.cos(s / 540 + curves.p1) +
        (0.34 / 197) * Math.cos(s / 197 + curves.p2));
    const w = sim.warp;
    const focal = size.h * 0.95 * (1 - 0.22 * w);
    placeLamps(c, focal, K, K1, s);
    program.use();
    if (u.u_lampA) gl.uniform4fv(u.u_lampA, lampA);
    if (u.u_lampB) gl.uniform4fv(u.u_lampB, lampB);
    if (u.u_lampC) gl.uniform2fv(u.u_lampC, lampC);
    gl.uniform1f(u.u_focal ?? null, focal);
    gl.uniform1f(u.u_camX ?? null, sim.camX);
    gl.uniform1f(u.u_roll ?? null, clamp(-sim.camV * 0.012, -0.035, 0.035));
    gl.uniform1f(u.u_K ?? null, K);
    gl.uniform1f(u.u_K1 ?? null, K1);
    // The driver looks into the bend, about thirty-five metres ahead.
    gl.uniform1f(u.u_yaw ?? null, K * 35);
    gl.uniform1f(u.u_dash ?? null, s % DASH);
    gl.uniform1f(u.u_lampPhase ?? null, s % LAMP_GAP);
    gl.uniform3f(
      u.u_flowOn ?? null,
      flows[0] ?? 0,
      flows[1] ?? 0,
      flows[2] ?? 0,
    );
    gl.uniform3f(
      u.u_flowUs ?? null,
      flows[3] ?? 0,
      flows[4] ?? 0,
      flows[5] ?? 0,
    );
    gl.uniform1f(
      u.u_trail ?? null,
      (12 + 60 * clamp(c.streak, 0, 1)) * (1 + 3 * w),
    );
    gl.uniform1f(u.u_warp ?? null, w);
    gl.uniform1f(u.u_frame ?? null, c.motionSafe ? frames % 64 : 0);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    frames += 1;
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Lane flows wrap after a whole number of cars, so no car ever pops. */
  const travel = (dt: number, c: Config) => {
    const v = clamp(c.speed, 0, 2);
    const boost = 1 + (clamp(c.warpFactor, 1, 10) - 1) * sim.warp;
    for (let i = 0; i < 6; i += 1) {
      const lane = i % 3;
      const rate =
        i < 3
          ? (CRUISE * 1.9 + 4 * lane) * v * boost
          : (7 + 5 * lane) * v * (1 + (boost - 1) * 0.6);
      const span = (spacing[i] ?? 40) * WRAP;
      flows[i] = ((flows[i] ?? 0) + rate * dt) % span;
    }
    sim.travelled += CRUISE * v * boost * dt;
  };

  /** Advances the road, the warp and the steering. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    const driving = !c.paused && c.speed > 0;
    if (driving) travel(dt, c);
    const want = holding() ? 1 : 0;
    const spring = want > sim.warp ? GLIDE : DRIFT;
    const target = steerTarget(c);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      sim.warpV +=
        ((spring.stiffness * (want - sim.warp) - spring.damping * sim.warpV) /
          spring.mass) *
        h;
      sim.warp += sim.warpV * h;
      sim.camV +=
        ((GLIDE.stiffness * (target - sim.camX) - GLIDE.damping * sim.camV) /
          GLIDE.mass) *
        h;
      sim.camX += sim.camV * h;
    }
    const warping =
      Math.abs(want - sim.warp) > 0.001 || Math.abs(sim.warpV) > 0.01;
    if (!warping) {
      sim.warp = want;
      sim.warpV = 0;
    }
    const steering =
      Math.abs(target - sim.camX) > 0.002 || Math.abs(sim.camV) > 0.01;
    if (!steering) {
      sim.camX = target;
      sim.camV = 0;
    }
    return driving || warping || steering;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
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

  /** Reduced motion: the long exposure stands still; the warp and the steering land at once. */
  const still = () => {
    const c = cfg;
    if (!c || c.motionSafe) return;
    sim.warp = holding() ? 1 : 0;
    sim.warpV = 0;
    sim.camX = steerTarget(c);
    sim.camV = 0;
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 6; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const page =
      0.2126 * (colours[15] ?? 0) +
      0.7152 * (colours[16] ?? 0) +
      0.0722 * (colours[17] ?? 0);
    day = page > 0.5 ? 1 : 0;
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

  /** A seeded moment on the road, so the first frame and the still frame are the same picture. */
  const placeAt = (c: Config) => {
    const rand = lcg(c.seed * 5 + 11);
    for (let i = 0; i < 6; i += 1) spacing[i] = Math.round(30 + rand() * 34);
    for (let i = 0; i < 6; i += 1)
      flows[i] = rand() * (spacing[i] ?? 40) * WRAP;
    curves.p1 = rand() * Math.PI * 2;
    curves.p2 = rand() * Math.PI * 2;
    sim.travelled = 300 + rand() * 4000;
  };

  const startGpu = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  /** Something the visitor did: the still frame catches up, the loop wakes. */
  const answer = () => {
    still();
    draw();
    kick();
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!was || was.seed !== next.seed) placeAt(next);
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS road stays, and nothing retries.
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
        answer();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (!next.interactive) {
        if (hand.present) {
          hand.present = false;
          hand.source = null;
          setActive(false);
        }
        if (pressing || surging) {
          pressing = false;
          surging = false;
          tellWarp();
        }
      }
      answer();
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
    handTo(x, source) {
      hand.x = x;
      hand.present = true;
      hand.source = source;
      setActive(true);
      answer();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      answer();
    },
    hold(on) {
      if (pressing === on) return;
      pressing = on;
      tellWarp();
      answer();
    },
    surge() {
      window.clearTimeout(surgeTimer);
      surging = true;
      tellWarp();
      answer();
      surgeTimer = window.setTimeout(() => {
        surging = false;
        tellWarp();
        answer();
      }, SURGE);
    },
    dispose() {
      disposed = true;
      window.clearTimeout(surgeTimer);
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };
}

/**
 * A background of a highway at night seen from a moving car, drawn as a long
 * exposure that never stops being taken, with the content on top in its own
 * layer. One WebGL2 pass casts every pixel onto the road, the light plane and
 * its mirror under the wet asphalt: oncoming headlights stream toward you in
 * pale trails, taillights pull away toward the vanishing point in red, lane
 * dashes rush past, lamps on both shoulders pass overhead with their pools
 * and long reflections, and the road sweeps through slow bends.
 *
 * The pointer steers across your own lanes, the car's place following on
 * glide and the frame leaning into the move. Holding a press puts the foot
 * down: the warp rises on glide — speed, trail length and field of view all
 * stretch, the dashes blur into rails — and eases back to a cruise on drift
 * when you let go. Keyboard focus on a control inside steers toward it and
 * surges. Only on screen in a visible page; still when parked. Without WebGL2
 * a CSS night road stands in, and under reduced motion the long exposure is
 * one still frame whose warp and steering land at once.
 */
export function NightDrive({
  children,
  speed = 1,
  lanes = 4,
  colors = "sodium",
  traffic = 0.6,
  streak = 0.5,
  curve = 0.5,
  reflection = 0.6,
  lamps = true,
  warpFactor = 5,
  warp = false,
  onWarpChange,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: NightDriveProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(() => {
    const set =
      typeof colors === "string"
        ? (SETS[colors as NightDriveColors] ?? SETS.sodium)
        : colors.length >= 3
          ? colors.slice(0, 3)
          : SETS.sodium;
    return [SKY, ROAD, ...set, GROUND];
  }, [colors]);
  const colorKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onWarpChange, onActiveChange });
  /** Stops listening for the end of the current hold, and lets go. */
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    speed,
    lanes,
    colorKey,
    traffic,
    streak,
    curve,
    reflection,
    lamps,
    warpFactor,
    warp,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onWarp: (w) => report.current.onWarpChange?.(w),
    onActive: (a) => report.current.onActiveChange?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onWarpChange, onActiveChange };
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
    const listening = unlisten;
    return () => listening.current?.();
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      // A hidden page never hears the release: let go now.
      if (document.hidden) unlisten.current?.();
      else engine.current?.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Size and sighting, bound to the node when it arrives.
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

  const localX = (clientX: number) => {
    const root = rootRef.current;
    if (!root) return 0;
    return clientX - root.getBoundingClientRect().left - root.clientLeft;
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    engine.current?.handTo(localX(event.clientX), "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    engine.current?.handTo(localX(event.clientX), "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    // A press on a control is the control's; the road only steers.
    if (hit && rootRef.current?.contains(hit)) return;
    // A second finger takes over from the first.
    unlisten.current?.();
    const root = rootRef.current;
    root?.setAttribute("data-pressing", "");
    engine.current?.hold(true);
    // The release can land anywhere, even off the road: listen on the window.
    const id = event.pointerId;
    const touch = event.pointerType === "touch";
    const done = (e: PointerEvent) => {
      if (e.pointerId === id) unlisten.current?.();
    };
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
    unlisten.current = () => {
      root?.removeAttribute("data-pressing");
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      unlisten.current = null;
      engine.current?.hold(false);
      // A finger that lifts takes the hand with it; a mouse stays over the road.
      if (touch) engine.current?.handAway("pointer");
    };
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside steers toward it and surges.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    engine.current?.handTo(localX(r.left + r.width / 2), "focus");
    engine.current?.surge();
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
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        // A sideways finger steers and a held one warps; an upright swipe
        // scrolls the page. Holding never opens the touch callout.
        "group/night-drive relative isolate h-full w-full touch-pan-y overflow-clip [-webkit-touch-callout:none] data-pressing:select-none",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/night-drive:opacity-0"
        style={standIn(paints)}
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
 * browser without WebGL2: sky over a haze of lamp light, a dark road, and the
 * trails of both directions fanning out of the vanishing point.
 */
function standIn(paints: readonly string[]): React.CSSProperties {
  const [sky, road, head, tail, lamp] = paints;
  const soft = (c: string | undefined, k: number) =>
    `color-mix(in oklab, ${c ?? "white"} ${k}%, transparent)`;
  const ray = (c: string | undefined, a: number) =>
    `transparent ${a}deg, ${soft(c, 70)} ${a}deg ${a + 0.8}deg, transparent ${a + 0.8}deg`;
  return {
    backgroundColor: road,
    backgroundImage: [
      `radial-gradient(ellipse 46% 9% at 50% 40%, ${soft(lamp, 42)}, transparent 72%)`,
      `conic-gradient(from 0deg at 50% 40%, transparent 0deg, ${ray(tail, 118)}, ${ray(tail, 132)}, ${ray(tail, 146)}, ${ray(head, 212)}, ${ray(head, 226)}, ${ray(head, 240)}, transparent 360deg)`,
      `linear-gradient(180deg, ${sky} 0%, color-mix(in oklab, ${sky} 78%, ${lamp}) 39.4%, ${road} 40%, color-mix(in oklab, ${road} 82%, black) 100%)`,
    ].join(", "),
  };
}
