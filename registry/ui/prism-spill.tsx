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

export type PrismSpillProps = {
  /** The content on top of the light: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How widely the glass splits the light, 0 (a single white beam) to 1. @default 0.5 */
  spread?: number;
  /** How fast the prism sways on its own, 0 (still) to 2. @default 0.5 */
  speed?: number;
  /** How brightly the colours spill across the surface, 0 to 1. @default 0.6 */
  glow?: number;
  /** How quickly the bands soften into a wash as they travel, 0 to 1. @default 0.6 */
  diffusion?: number;
  /** The prism's length (its longest face), px; it shrinks to fit a small box. @default 150 */
  size?: number;
  /** Where the prism lies, as fractions of the box: [x, y]. @default [0.28, 0.38] */
  anchor?: readonly [number, number];
  /** The direction the window light falls, in degrees below the horizontal: steep, from the upper edge. @default 66 */
  beamAngle?: number;
  /** How far the prism swings either side of its resting angle, degrees. @default 12 */
  sway?: number;
  /** The glass: its tint and the rim of its unlit faces. @default the ink, softened into the page */
  lineColor?: string;
  /** The pointer and keyboard focus turn the prism, and a press sends a pulse down the beam. @default true */
  interactive?: boolean;
  /** How far the pointer can turn the prism, 0 to 1 (8° to 40°). @default 0.6 */
  pointerStrength?: number;
  /** The light draws itself in from the window and the colours spread the first time it is seen. @default true */
  intro?: boolean;
  /** Hold the prism still; the pointer still turns it. @default false */
  paused?: boolean;
  /** Seeds where in its sway the prism starts. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) turning the prism. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const LINE = "color-mix(in oklab, var(--foreground) 72%, var(--background))";
const PAGE = "var(--background)";
/** The surface the glass lies on: warm ink under a dark theme, warm paper under a light one. */
const INK = "oklch(0.2 0.025 55)";
const PAPER = "oklch(0.91 0.022 78)";
/** What the box shows before the canvas paints: the page with a little of that warmth. */
const SURFACE =
  "color-mix(in oklab, var(--background) 88%, oklch(0.5 0.05 60))";
/** Window light: warm white, a little warmer on a dark surface. */
const SUN = "oklch(0.97 0.03 85)";

/** Seven wavelengths across the visible band, µm. */
const LAMBDAS = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7] as const;
const MID = 3;
/** Cauchy's fit for the glass: n(λ) = A + B / λ², B scaled by `spread`. */
const CAUCHY_A = 1.42;
const PULSE_SPEED = 900;
const STEP = 1 / 120;
/** Heavy glass turns on drift: no overshoot, a long settle. */
const DRIFT = springs.drift;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const deg = (d: number) => (d * Math.PI) / 180;
const r3 = (v: number) => Number(v.toFixed(3));

/**
 * The cut: a long 30-60-90 dispersing prism with its longest face 1, centred
 * on its centroid — the 60° apex the light crosses, the right angle, and the
 * long 30° tip. Faces: 0 the short face, 1 the long back, 2 the hypotenuse;
 * 0 and 2 meet at the apex. The cut is handed: this hand lies nearly flat
 * when light from the upper left is sent on to the right.
 */
const CUT_X = [-0.2887, -0.2887, 0.5774] as const;
const CUT_Y = [0.3333, -0.1667, -0.1667] as const;
/** The shaft is aimed this far from the centroid toward the apex, where a dispersing prism is used. */
const APEX_AIM = 0.42;
/** Where the colours are sent at rest: on across the surface, a little downhill. */
const SPILL = deg(22);

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The light's path through the prism for every wavelength, in reused arrays. */
type Optics = {
  vx: Float64Array;
  vy: Float64Array;
  ex: Float64Array;
  ey: Float64Array;
  dx: Float64Array;
  dy: Float64Array;
  /** 1 when that wavelength escaped the glass. */
  ok: Uint8Array;
  /** The face each wavelength left by, and how many times it was reflected inside first. */
  face: Int8Array;
  bounces: Uint8Array;
  /** Where the beam enters, where the middle wavelength leaves, and that face's outward normal. */
  inX: number;
  inY: number;
  outX: number;
  outY: number;
  nX: number;
  nY: number;
  hit: boolean;
  /** The face the beam enters by. */
  entry: number;
};

const createOptics = (): Optics => ({
  vx: new Float64Array(3),
  vy: new Float64Array(3),
  ex: new Float64Array(LAMBDAS.length),
  ey: new Float64Array(LAMBDAS.length),
  dx: new Float64Array(LAMBDAS.length),
  dy: new Float64Array(LAMBDAS.length),
  ok: new Uint8Array(LAMBDAS.length),
  face: new Int8Array(LAMBDAS.length),
  bounces: new Uint8Array(LAMBDAS.length),
  inX: 0,
  inY: 0,
  outX: 0,
  outY: 0,
  nX: 0,
  nY: 0,
  hit: false,
  entry: -1,
});

/** The ray's parameter where it meets edge k, or Infinity. */
function edgeHit(
  o: Optics,
  k: number,
  px: number,
  py: number,
  dx: number,
  dy: number,
): number {
  const ax = o.vx[k] ?? 0;
  const ay = o.vy[k] ?? 0;
  const bx = o.vx[(k + 1) % 3] ?? 0;
  const by = o.vy[(k + 1) % 3] ?? 0;
  const ex = bx - ax;
  const ey = by - ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return Infinity;
  const wx = ax - px;
  const wy = ay - py;
  const t = (wx * ey - wy * ex) / den;
  const u = (wx * dy - wy * dx) / den;
  return t > 1e-6 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity;
}

/** Edge k's outward unit normal, written into n. */
function normalOf(o: Optics, k: number, cx: number, cy: number, n: number[]) {
  const ax = o.vx[k] ?? 0;
  const ay = o.vy[k] ?? 0;
  const bx = o.vx[(k + 1) % 3] ?? 0;
  const by = o.vy[(k + 1) % 3] ?? 0;
  let nx = by - ay;
  let ny = -(bx - ax);
  const len = Math.hypot(nx, ny) || 1;
  nx /= len;
  ny /= len;
  if (nx * ((ax + bx) / 2 - cx) + ny * ((ay + by) / 2 - cy) < 0) {
    nx = -nx;
    ny = -ny;
  }
  n[0] = nx;
  n[1] = ny;
}

const scratch = [0, 0];

/**
 * Traces the light through the prism (its longest face `side`, centroid c,
 * turned by rot) for every wavelength: Snell's law in, at most one total
 * internal reflection, Snell's law out. The light comes down its own line
 * through the aim point (c + aim), fixed in the room however the glass
 * turns. Writes the exits into o; allocates nothing.
 */
function traceLight(
  o: Optics,
  cx: number,
  cy: number,
  side: number,
  rot: number,
  beam: number,
  spread: number,
  aimX: number,
  aimY: number,
) {
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let k = 0; k < 3; k += 1) {
    const lx = (CUT_X[k] ?? 0) * side;
    const ly = (CUT_Y[k] ?? 0) * side;
    o.vx[k] = cx + lx * cr - ly * sr;
    o.vy[k] = cy + lx * sr + ly * cr;
  }
  const d0x = Math.cos(beam);
  const d0y = Math.sin(beam);
  const sx = cx + aimX - d0x * 4000;
  const sy = cy + aimY - d0y * 4000;
  let first = Infinity;
  let e1 = -1;
  for (let k = 0; k < 3; k += 1) {
    const t = edgeHit(o, k, sx, sy, d0x, d0y);
    if (t < first) {
      first = t;
      e1 = k;
    }
  }
  o.hit = e1 >= 0;
  o.entry = e1;
  o.ok.fill(0);
  if (!o.hit) return;
  o.inX = sx + d0x * first;
  o.inY = sy + d0y * first;
  normalOf(o, e1, cx, cy, scratch);
  const n1x = scratch[0] ?? 0;
  const n1y = scratch[1] ?? 0;
  const B = 0.004 + clamp(spread, 0, 1) * 0.042;
  for (let l = 0; l < LAMBDAS.length; l += 1) {
    const lam = LAMBDAS[l] ?? 0.55;
    const n = CAUCHY_A + B / (lam * lam);
    // In: from air into glass, against the entry face's outward normal.
    let eta = 1 / n;
    let cosi = -(d0x * n1x + d0y * n1y);
    let k2 = 1 - eta * eta * (1 - cosi * cosi);
    if (k2 < 0) continue;
    let dx = eta * d0x + (eta * cosi - Math.sqrt(k2)) * n1x;
    let dy = eta * d0y + (eta * cosi - Math.sqrt(k2)) * n1y;
    let px = o.inX;
    let py = o.inY;
    let face = e1;
    let escaped = false;
    for (let bounce = 0; bounce < 2 && !escaped; bounce += 1) {
      let best = Infinity;
      let next = -1;
      for (let k = 0; k < 3; k += 1) {
        if (k === face) continue;
        const t = edgeHit(o, k, px, py, dx, dy);
        if (t < best) {
          best = t;
          next = k;
        }
      }
      if (next < 0) break;
      px += dx * best;
      py += dy * best;
      face = next;
      normalOf(o, face, cx, cy, scratch);
      const nx = scratch[0] ?? 0;
      const ny = scratch[1] ?? 0;
      // Out: from glass into air, against the inward normal.
      eta = n;
      cosi = dx * nx + dy * ny;
      k2 = 1 - eta * eta * (1 - cosi * cosi);
      if (k2 < 0) {
        // Totally reflected: the colour stays in the glass a while longer.
        dx -= 2 * cosi * nx;
        dy -= 2 * cosi * ny;
        continue;
      }
      const ox = eta * dx + (eta * cosi - Math.sqrt(k2)) * -nx;
      const oy = eta * dy + (eta * cosi - Math.sqrt(k2)) * -ny;
      const len = Math.hypot(ox, oy) || 1;
      o.ex[l] = px;
      o.ey[l] = py;
      o.dx[l] = ox / len;
      o.dy[l] = oy / len;
      o.ok[l] = 1;
      o.face[l] = face;
      o.bounces[l] = bounce;
      if (l === MID) {
        o.outX = px;
        o.outY = py;
        o.nX = nx;
        o.nY = ny;
      }
      escaped = true;
    }
  }
}

/** The aim point toward the apex for a prism turned by rot, in units of its length. */
const aimOf = (rot: number): [number, number] => [
  APEX_AIM *
    ((CUT_X[0] ?? 0) * Math.cos(rot) - (CUT_Y[0] ?? 0) * Math.sin(rot)),
  APEX_AIM *
    ((CUT_X[0] ?? 0) * Math.sin(rot) + (CUT_Y[0] ?? 0) * Math.cos(rot)),
];

/**
 * The prism's resting turn (to a whole degree, so a server and a browser
 * agree) and its aim: the passage through the apex — in by one of its faces,
 * out by the other — of least deviation for the middle of the spectrum,
 * tie-broken toward sending the colours on across the surface. There the
 * passage is symmetric, the spill is at its calmest, and a sway barely
 * swings it. Of the two ways to lay the glass for that passage, the one on
 * its long face wins.
 */
function restOf(beamAngle: number, spread: number) {
  const o = createOptics();
  const beam = deg(beamAngle);
  let best = 0;
  let bestCost = Infinity;
  for (let a = 0; a < 360; a += 1) {
    const [ax, ay] = aimOf(deg(a));
    traceLight(o, 0, 0, 100, deg(a), beam, spread, ax * 100, ay * 100);
    if (!o.ok[MID] || o.bounces[MID]) continue;
    const exit = o.face[MID] ?? -1;
    if ((o.entry !== 0 && o.entry !== 2) || (exit !== 0 && exit !== 2))
      continue;
    if (exit === o.entry) continue;
    const out = Math.atan2(o.dy[MID] ?? 0, o.dx[MID] ?? 1);
    if (Math.cos(out) < 0.2) continue;
    let turn = out - beam;
    turn -= Math.PI * 2 * Math.round(turn / (Math.PI * 2));
    // The glass can be laid either way round its apex for the same passage;
    // it lies on its long face, as near flat as the light allows.
    const cost =
      Math.abs(turn) +
      0.4 * Math.abs(out - SPILL) +
      0.3 * Math.abs(Math.sin(deg(a)));
    if (cost < bestCost - 1e-9) {
      bestCost = cost;
      best = a;
    }
  }
  const [ax, ay] = aimOf(deg(best));
  return { turn: best, ax, ay };
}

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform vec2 u_size;
uniform vec3 u_bg;
uniform vec3 u_line;
uniform vec3 u_beam;
uniform float u_light;
uniform float u_glow;
uniform float u_diff;
uniform vec2 u_v0;
uniform vec2 u_v1;
uniform vec2 u_v2;
uniform vec2 u_litA;
uniform vec2 u_litB;
uniform vec2 u_src;
uniform vec2 u_in;
uniform vec2 u_inN;
uniform vec2 u_out;
uniform vec2 u_outN;
uniform vec2 u_dr;
uniform vec2 u_dv;
uniform vec2 u_lam;
uniform float u_halfExit;
uniform float u_shaft;
uniform float u_fan;
uniform float u_reveal;
uniform vec2 u_pulse;
uniform float u_flat;
uniform float u_lenIn;
uniform float u_lenGlass;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

float cross2(vec2 a, vec2 b) { return a.x * b.y - a.y * b.x; }

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
  return length(p - a - ab * t);
}

float triangle(vec2 p) {
  float d = min(segDist(p, u_v0, u_v1), min(segDist(p, u_v1, u_v2), segDist(p, u_v2, u_v0)));
  float s0 = cross2(u_v1 - u_v0, p - u_v0);
  float s1 = cross2(u_v2 - u_v1, p - u_v1);
  float s2 = cross2(u_v0 - u_v2, p - u_v2);
  bool inside = (s0 >= 0.0 && s1 >= 0.0 && s2 >= 0.0) || (s0 <= 0.0 && s1 <= 0.0 && s2 <= 0.0);
  return inside ? -d : d;
}

// The visible band from violet (0) to red (1), as display colour.
vec3 spectrum(float x) {
  float r = smoothstep(0.42, 0.62, x) * (1.0 - 0.18 * smoothstep(0.9, 1.0, x)) + 0.38 * (1.0 - smoothstep(0.0, 0.16, x));
  float g = smoothstep(0.18, 0.42, x) * (1.0 - smoothstep(0.62, 0.86, x));
  float b = (1.0 - smoothstep(0.28, 0.52, x)) * (0.55 + 0.45 * smoothstep(0.0, 0.12, x));
  return vec3(r, g, b);
}

// Light adds to a dark surface; on a light one it is laid on as a tint.
vec3 lay(vec3 base, vec3 c, float a) {
  return u_light > 0.5 ? mix(base, c, clamp(a, 0.0, 1.0)) : base + c * a;
}

void main() {
  vec2 p = v_uv * u_size;
  bool light = u_light > 0.5;
  float pulseAt = u_pulse.x;
  float pulse = u_pulse.y;

  // The surface the glass lies on: warm ink or warm paper, with a slow
  // mottle, a fine grain and a vignette, so it reads as a material rather
  // than a fill; the side nearer the window is a little lifted.
  float mottle = kx_noise(p / 150.0 + vec2(3.1, 1.7)) * 0.6 + kx_noise(p / 46.0 + vec2(7.7, 2.9)) * 0.4;
  float grain = kx_hash(floor(p * u_px) + vec2(5.0, 9.0)) - 0.5;
  vec2 q = (v_uv - 0.5) * vec2(1.0, 1.3);
  float vignette = smoothstep(0.32, 0.95, length(q));
  vec3 col = u_bg * (1.0 + (mottle - 0.5) * (light ? 0.05 : 0.16) + grain * (light ? 0.014 : 0.04));
  col *= 1.0 - vignette * (light ? 0.07 : 0.26);
  col *= 1.0 + (1.0 - v_uv.y) * (light ? 0.012 : 0.08);

  float sd = triangle(p);
  vec2 lightDir = normalize(u_in - u_src);
  // The glass lies on the surface: a soft shadow falls away from the window.
  float shadow = (1.0 - smoothstep(-4.0, 20.0, triangle(p - lightDir * 9.0))) * smoothstep(-1.0, 2.0, sd);
  col *= 1.0 - shadow * (light ? 0.14 : 0.4);

  // The shaft of window light across the surface, up to the lit facet.
  {
    vec2 seg = u_in - u_src;
    float len = max(length(seg), 1.0);
    vec2 dir = seg / len;
    float s = dot(p - u_src, dir);
    float d = abs(cross2(dir, p - u_src));
    float before = smoothstep(-1.0, 1.5, dot(p - u_in, u_inN));
    float body = 1.0 - smoothstep(u_shaft * 0.35, u_shaft, d);
    // It is window light: the soft shadow of a mullion runs down its middle.
    body *= 1.0 - 0.42 * exp(-d * d / (2.0 * pow(u_shaft * 0.13, 2.0)));
    float halo = exp(-d * d / (2.0 * pow(u_shaft * 2.0, 2.0))) * 0.35;
    float nearWindow = mix(1.0, 0.78, clamp(s / len, 0.0, 1.0));
    float on = smoothstep(-8.0, 4.0, s);
    float shown = 1.0 - smoothstep(u_reveal - 36.0, u_reveal, s);
    float boost = 1.0 + 1.6 * pulse * exp(-pow((s - pulseAt) / 44.0, 2.0)) + u_flat;
    float a = (body * 0.55 + halo) * nearWindow * on * before * shown * boost * (0.55 + 0.55 * u_glow);
    col = lay(col, u_beam, a * (light ? 0.8 : 0.5));
  }

  // The spectrum, falling on the surface as a soft wash: as wide as the
  // shaft where it leaves the glass, spreading and fading as it goes.
  if (u_fan > 0.5) {
    vec2 dm = normalize(u_dr + u_dv);
    vec2 rel = p - u_out;
    float along = dot(rel, dm);
    float front = smoothstep(-1.0, 2.0, dot(rel, u_outN)) * smoothstep(-0.5, 2.0, sd);
    if (along > 0.0 && front > 0.0) {
      float width = abs(atan(cross2(u_dr, u_dv), dot(u_dr, u_dv)));
      float halfAngle = min(0.5 * width, 0.5);
      // The same light spread over a wider fan is fainter: near a grazing
      // exit the colours thin out rather than paint a wedge.
      float energy = clamp(0.16 / max(width, 0.04), 0.0, 1.0);
      float reach = along / max(u_size.x, 1.0);
      float halfW = u_halfExit + u_shaft * 0.75 + along * (tan(halfAngle) + 0.04 + 0.1 * u_diff);
      float lateral = cross2(dm, rel);
      float side = sign(cross2(dm, u_dr));
      float t = 0.5 - 0.5 * side * lateral / halfW;
      float soft = 0.24 + u_diff * 0.4 * min(reach * 2.0, 1.0);
      float band = smoothstep(-soft, soft, t) * (1.0 - smoothstep(1.0 - soft, 1.0 + soft, t));
      float x = mix(u_lam.x, u_lam.y, clamp(t, 0.0, 1.0));
      float blur = clamp(soft * 0.5, 0.0, 0.3);
      vec3 spec = (spectrum(x - blur) + spectrum(x) + spectrum(x + blur)) / 3.0;
      spec = mix(spec, vec3(dot(spec, vec3(0.3333))), clamp(0.2 + u_diff * reach * 0.6, 0.0, 0.55));
      // The glass is not flawless: the wash carries soft, brighter veins.
      float caustic = 0.8 + 0.4 * kx_noise(vec2(t * 6.0, along / 34.0) + vec2(11.0, 4.0));
      float fade = smoothstep(0.0, 26.0, along) * exp(-along / (u_size.x * (0.3 + 0.3 * u_glow)));
      float path = u_lenIn + u_lenGlass + along;
      float shown = 1.0 - smoothstep(u_reveal - 44.0, u_reveal, path);
      float boost = 1.0 + 1.6 * pulse * exp(-pow((path - pulseAt) / 50.0, 2.0)) + u_flat;
      float wide = exp(-pow((t - 0.5) / (0.8 + 2.0 * soft), 2.0)) * 0.32;
      float k = u_glow * fade * shown * boost * front * energy;
      col = lay(col, spectrum(clamp(x, 0.1, 0.9)) * 0.8 + 0.2, wide * k * (light ? 0.45 : 0.4));
      col = lay(col, spec, band * caustic * k * (light ? 0.55 : 0.72));
    }
  }

  // The glass: a solid, faintly tinted body, denser toward its edges, with
  // light gathered just inside the lit facet, a fainter echo off the face
  // the colours leave by, and the light's own path through it.
  float aa = 0.75 / u_px;
  float inside = 1.0 - smoothstep(-aa, aa, sd);
  float litShown = smoothstep(u_lenIn - 12.0, u_lenIn + 12.0, u_reveal);
  float litDist = segDist(p, u_litA, u_litB);
  if (inside > 0.0) {
    vec3 glass = mix(col, u_line, light ? 0.08 : 0.1);
    glass *= 1.0 - (1.0 - smoothstep(0.0, 9.0, -sd)) * (light ? 0.06 : 0.14);
    float gather = exp(-litDist / 11.0) * 0.32 * litShown;
    float echo = exp(-abs(dot(p - u_out, u_outN)) / 8.0) * 0.12 * u_fan * litShown;
    glass = lay(glass, u_beam, (gather + echo) * (0.6 + 0.5 * u_glow));
    vec2 seg = u_out - u_in;
    float len = max(length(seg), 1.0);
    vec2 dir = seg / len;
    float s = dot(p - u_in, dir);
    float d = abs(cross2(dir, p - u_in));
    float through = 1.0 - smoothstep(u_shaft * 0.3, u_shaft * 0.9, d);
    float shown = 1.0 - smoothstep(u_reveal - 30.0, u_reveal, u_lenIn + s);
    float boost = 1.0 + 1.6 * pulse * exp(-pow((u_lenIn + s - pulseAt) / 40.0, 2.0)) + u_flat;
    glass = lay(glass, u_beam, through * 0.2 * shown * boost * step(0.0, s) * u_fan);
    col = mix(col, glass, inside);
  }
  // Edges: only the lit facet is bright; the others are a faint rim.
  float rim = 1.0 - smoothstep(0.35, 0.35 + 2.0 * aa, abs(sd));
  float litEdge = (1.0 - smoothstep(0.5, 1.1 + 2.0 * aa, litDist)) * litShown;
  col = mix(col, u_line, rim * (light ? 0.3 : 0.16) * (1.0 - litEdge));
  col = lay(col, u_beam, litEdge * (light ? 0.95 : 0.85) * (0.7 + 0.4 * u_glow));
  // A soft glint where the colours leave the glass.
  float leaving = smoothstep(u_lenIn + u_lenGlass - 10.0, u_lenIn + u_lenGlass + 10.0, u_reveal);
  col = lay(col, u_beam, exp(-dot(p - u_out, p - u_out) / 40.0) * 0.4 * u_glow * u_fan * leaving);

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
  spread: number;
  speed: number;
  glow: number;
  diffusion: number;
  size: number;
  ax: number;
  ay: number;
  beamAngle: number;
  sway: number;
  paintKey: string;
  interactive: boolean;
  pointerStrength: number;
  intro: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  sighted: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  pulse: (strength: number) => void;
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
  let seen = false;
  const optics = createOptics();
  const size = { w: 0, h: 0 };
  const colours = {
    page: [0, 0, 0],
    ink: [0, 0, 0],
    paper: [1, 1, 1],
    bg: [0, 0, 0],
    line: [1, 1, 1],
    light: false,
  };
  const sim = {
    t: 0,
    rest: 0,
    /** Where the light is aimed, fixed in the room, in units of the prism's length. */
    aimX: 0,
    aimY: 0,
    /** How far the prism can turn either way and keep the light on its calm path, rad. */
    roomUp: 0.3,
    roomDown: 0.3,
    rot: 0,
    rotV: 0,
    presence: 0,
    presenceV: 0,
    reveal: 1e6,
    revealing: false,
    pulseAt: -1e6,
    pulse: 0,
    flat: 0,
  };
  const hand = {
    x: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };
  const read = (() => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    return (colour: string, out: number[]) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = colour;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[0] = (d[0] ?? 0) / 255;
      out[1] = (d[1] ?? 0) / 255;
      out[2] = (d[2] ?? 0) / 255;
    };
  })();

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

  const side = () => {
    const c = cfg;
    if (!c) return 100;
    return clamp(
      c.size,
      60,
      Math.max(60, Math.min(size.h * 0.8, size.w * 0.42)),
    );
  };

  /** Where the prism stands now: resting, swaying, or turned by the hand. */
  const targetAngle = () => {
    const c = cfg;
    if (!c) return sim.rest;
    // The sway stays inside the turn that keeps the light on its calm path;
    // the hand may take it a little past, where the colours thin and go.
    const room = Math.min(sim.roomUp, sim.roomDown) * 0.8;
    const swing =
      c.motionSafe && !c.paused
        ? Math.min(deg(Math.abs(c.sway)), room) * Math.sin(sim.t)
        : 0;
    const reach = deg(8 + 32 * clamp(c.pointerStrength, 0, 1));
    const cx = clamp(c.ax, 0, 1) * size.w;
    const lean = clamp((hand.x - cx) / Math.max(1, size.w * 0.5), -1, 1);
    const turn =
      lean >= 0
        ? lean * Math.min(reach, sim.roomUp * 1.15)
        : lean * Math.min(reach, sim.roomDown * 1.15);
    return sim.rest + swing * (1 - sim.presence) + turn * sim.presence;
  };

  const statics = () => {
    const p = gpu;
    const c = cfg;
    if (!p || p.lost || !c || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform2f(u.u_size ?? null, size.w, size.h);
    const [br, bg, bb] = colours.bg;
    const [lr, lg, lb] = colours.line;
    gl.uniform3f(u.u_bg ?? null, br ?? 0, bg ?? 0, bb ?? 0);
    gl.uniform3f(u.u_line ?? null, lr ?? 1, lg ?? 1, lb ?? 1);
    // Window light: warm white, a touch warmer on a dark surface.
    if (colours.light) gl.uniform3f(u.u_beam ?? null, 1, 0.985, 0.94);
    else gl.uniform3f(u.u_beam ?? null, 1, 0.94, 0.84);
    gl.uniform1f(u.u_shaft ?? null, 9 + 9 * clamp(c.glow, 0, 1));
    gl.uniform1f(u.u_light ?? null, colours.light ? 1 : 0);
    gl.uniform1f(u.u_glow ?? null, clamp(c.glow, 0, 1));
    gl.uniform1f(u.u_diff ?? null, clamp(c.diffusion, 0, 1));
  };

  const draw = () => {
    const p = gpu;
    const c = cfg;
    if (!p || p.lost || !c || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const cx = clamp(c.ax, 0, 1) * size.w;
    const cy = clamp(c.ay, 0, 1) * size.h;
    const beam = deg(clamp(c.beamAngle, -80, 80));
    const len = side();
    traceLight(
      optics,
      cx,
      cy,
      len,
      sim.rot,
      beam,
      c.spread,
      sim.aimX * len,
      sim.aimY * len,
    );
    const o = optics;
    program.use();
    gl.uniform2f(u.u_v0 ?? null, o.vx[0] ?? 0, o.vy[0] ?? 0);
    gl.uniform2f(u.u_v1 ?? null, o.vx[1] ?? 0, o.vy[1] ?? 0);
    gl.uniform2f(u.u_v2 ?? null, o.vx[2] ?? 0, o.vy[2] ?? 0);
    // The facet the light falls on, the only edge drawn bright.
    const lit = o.entry >= 0 ? o.entry : 0;
    gl.uniform2f(u.u_litA ?? null, o.vx[lit] ?? 0, o.vy[lit] ?? 0);
    gl.uniform2f(
      u.u_litB ?? null,
      o.vx[(lit + 1) % 3] ?? 0,
      o.vy[(lit + 1) % 3] ?? 0,
    );
    normalOf(o, lit, cx, cy, scratch);
    gl.uniform2f(u.u_inN ?? null, scratch[0] ?? 0, scratch[1] ?? -1);
    // The beam starts where its line enters the box.
    const bx = Math.cos(beam);
    const by = Math.sin(beam);
    const back = Math.min(
      bx > 1e-6 ? o.inX / bx : Infinity,
      by > 1e-6 ? o.inY / by : by < -1e-6 ? (o.inY - size.h) / by : Infinity,
    );
    const lenIn = Number.isFinite(back) ? Math.max(0, back) + 4 : 2000;
    gl.uniform2f(u.u_src ?? null, o.inX - bx * lenIn, o.inY - by * lenIn);
    gl.uniform2f(u.u_in ?? null, o.inX, o.inY);
    // The fan between the reddest and the most violet colours that left by
    // the same face on the same path as the middle of the spectrum (or, if
    // the middle is trapped, as the first colour out): colours reflected out
    // of another face are a separate, fainter beam, not part of this fan.
    let ref = -1;
    if (o.ok[MID]) ref = MID;
    else
      for (let l = 0; l < LAMBDAS.length && ref < 0; l += 1)
        if (o.ok[l]) ref = l;
    let red = -1;
    let violet = -1;
    let mx = 0;
    let my = 0;
    let count = 0;
    for (let l = 0; l < LAMBDAS.length; l += 1) {
      if (!o.ok[l] || ref < 0) continue;
      if (o.face[l] !== o.face[ref] || o.bounces[l] !== o.bounces[ref])
        continue;
      if (violet < 0) violet = l;
      red = l;
      mx += o.ex[l] ?? 0;
      my += o.ey[l] ?? 0;
      count += 1;
    }
    const fan = o.hit && count > 0;
    const outX = fan ? mx / count : o.inX;
    const outY = fan ? my / count : o.inY;
    const half = fan
      ? Math.hypot(
          (o.ex[red] ?? 0) - (o.ex[violet] ?? 0),
          (o.ey[red] ?? 0) - (o.ey[violet] ?? 0),
        ) / 2
      : 0;
    gl.uniform2f(u.u_out ?? null, outX, outY);
    if (fan) normalOf(o, o.face[ref] ?? 0, cx, cy, scratch);
    gl.uniform2f(
      u.u_outN ?? null,
      fan ? (scratch[0] ?? 0) : o.nX,
      fan ? (scratch[1] ?? 0) : o.nY,
    );
    gl.uniform2f(u.u_dr ?? null, o.dx[red] ?? 1, o.dy[red] ?? 0);
    gl.uniform2f(u.u_dv ?? null, o.dx[violet] ?? 1, o.dy[violet] ?? 0);
    gl.uniform2f(
      u.u_lam ?? null,
      fan ? ((LAMBDAS[red] ?? 0.7) - 0.4) / 0.3 : 1,
      fan ? ((LAMBDAS[violet] ?? 0.4) - 0.4) / 0.3 : 0,
    );
    gl.uniform1f(u.u_halfExit ?? null, half);
    gl.uniform1f(u.u_fan ?? null, fan ? 1 : 0);
    gl.uniform1f(u.u_lenIn ?? null, lenIn);
    gl.uniform1f(
      u.u_lenGlass ?? null,
      fan ? Math.hypot(outX - o.inX, outY - o.inY) : 0,
    );
    gl.uniform1f(u.u_reveal ?? null, sim.reveal);
    gl.uniform2f(u.u_pulse ?? null, sim.pulseAt, sim.pulse);
    gl.uniform1f(u.u_flat ?? null, sim.flat * 1.2);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Advances the sway, the turn, the intro and any pulse. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2) * ((Math.PI * 2) / 10);
      moving = true;
    }
    const want = hand.present && c.interactive ? 1 : 0;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      sim.presenceV +=
        ((DRIFT.stiffness * (want - sim.presence) -
          DRIFT.damping * sim.presenceV) /
          DRIFT.mass) *
        h;
      sim.presence = clamp(sim.presence + sim.presenceV * h, 0, 1);
      const to = targetAngle();
      sim.rotV +=
        ((DRIFT.stiffness * (to - sim.rot) - DRIFT.damping * sim.rotV) /
          DRIFT.mass) *
        h;
      sim.rot += sim.rotV * h;
    }
    const to = targetAngle();
    if (Math.abs(to - sim.rot) < 1e-4 && Math.abs(sim.rotV) < 1e-3) {
      sim.rot = to;
      sim.rotV = 0;
    } else moving = true;
    if (
      Math.abs(want - sim.presence) < 0.002 &&
      Math.abs(sim.presenceV) < 0.01
    ) {
      sim.presence = want;
      sim.presenceV = 0;
    } else moving = true;
    if (sim.revealing) {
      sim.reveal += dt * 1400;
      if (sim.reveal > size.w * 3 + 2000) {
        sim.reveal = 1e6;
        sim.revealing = false;
      } else moving = true;
    }
    if (sim.pulse > 0) {
      sim.pulseAt += PULSE_SPEED * dt;
      sim.pulse *= Math.exp(-dt / 0.9);
      if (sim.pulseAt > size.w * 3 + 600 || sim.pulse < 0.02) sim.pulse = 0;
      else moving = true;
    }
    return moving;
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
    let moving = false;
    if (c.motionSafe) moving = step(dt);
    else if (sim.flat > 0) {
      // Reduced motion: a press only brightens the light, by opacity.
      sim.flat *= Math.exp(-dt / 0.25);
      if (sim.flat < 0.02) sim.flat = 0;
      else moving = true;
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

  const readColours = () => {
    const kids = carriers.children;
    const take = (i: number, out: number[]) => {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, out);
    };
    take(0, colours.page);
    take(1, colours.line);
    take(2, colours.ink);
    take(3, colours.paper);
    const [r, g, b] = colours.page;
    colours.light =
      0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0) > 0.5;
    // The surface: the page drawn most of the way into warm ink or paper.
    const into = colours.light ? colours.paper : colours.ink;
    const share = colours.light ? 0.7 : 0.75;
    for (let i = 0; i < 3; i += 1) {
      colours.bg[i] =
        (colours.page[i] ?? 0) * (1 - share) + (into[i] ?? 0) * share;
    }
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
    resizeGL(p.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
    statics();
    draw();
    kick();
  };

  const settleRest = () => {
    const c = cfg;
    if (!c) return;
    const rest = restOf(c.beamAngle, c.spread);
    sim.rest = deg(rest.turn);
    sim.aimX = rest.ax;
    sim.aimY = rest.ay;
    // Measure the calm range once: the turns either side of rest for which
    // the light still enters and the middle colour still leaves by the same
    // faces, without reflecting inside, heading on across the box.
    const o = createOptics();
    const beam = deg(c.beamAngle);
    const ax = rest.ax * 100;
    const ay = rest.ay * 100;
    traceLight(o, 0, 0, 100, sim.rest, beam, c.spread, ax, ay);
    const entry = o.entry;
    const exit = o.face[MID] ?? -1;
    const calm = (a: number) => {
      traceLight(o, 0, 0, 100, a, beam, c.spread, ax, ay);
      return (
        o.entry === entry &&
        o.ok[MID] === 1 &&
        o.face[MID] === exit &&
        o.bounces[MID] === 0 &&
        (o.dx[MID] ?? 0) > 0.2
      );
    };
    let up = 0;
    while (up < deg(45) && calm(sim.rest + up + deg(0.5))) up += deg(0.5);
    let down = 0;
    while (down < deg(45) && calm(sim.rest - down - deg(0.5))) down += deg(0.5);
    sim.roomUp = up;
    sim.roomDown = down;
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
      if (!was) {
        settleRest();
        sim.t = lcg(next.seed)() * Math.PI * 2;
        sim.rot = targetAngle();
      }
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
      if (was.beamAngle !== next.beamAngle || was.spread !== next.spread) {
        settleRest();
      }
      if (was.dpr !== next.dpr) resize();
      if (was.paintKey !== next.paintKey) readColours();
      else statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
      }
      if (!next.motionSafe) {
        sim.presence = hand.present ? 1 : 0;
        sim.rot = targetAngle();
        sim.rotV = 0;
        sim.reveal = 1e6;
        sim.revealing = false;
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
    sighted() {
      const c = cfg;
      if (seen || !c) return;
      seen = true;
      if (c.intro && c.motionSafe) {
        sim.reveal = 0;
        sim.revealing = true;
        kick();
      }
    },
    handTo(x, _y, source) {
      hand.x = x;
      hand.present = true;
      hand.source = source;
      setActive(true);
      const c = cfg;
      if (c && !c.motionSafe) {
        // Reduced motion: the prism turns exactly to the hand, unhurried by
        // any spring.
        sim.presence = 1;
        sim.rot = targetAngle();
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      const c = cfg;
      if (c && !c.motionSafe) {
        sim.presence = 0;
        sim.rot = targetAngle();
      }
      kick();
    },
    pulse(strength) {
      const c = cfg;
      if (!c) return;
      if (c.motionSafe) {
        // A packet of light from the edge, down the beam and out.
        sim.pulse = clamp(strength, 0, 1);
        sim.pulseAt = 0;
      } else {
        // Reduced motion: no travelling packet, the whole light brightens.
        sim.flat = clamp(strength, 0, 1);
      }
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

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

/**
 * A background in which a glass prism, drawn in light strokes, splits a beam
 * of white light into its colours, with the content on top in its own layer.
 * The optics are real: the beam is traced through the prism each frame for
 * seven wavelengths — Snell's law in, the glass's index from a Cauchy fit
 * whose dispersion is `spread`, one total internal reflection allowed, Snell's
 * law out — and the escaping colours fan out from the exit face as spectral
 * bands that soften and diffuse into a wash as they spill across the surface.
 * The prism sways slowly about the angle that sends the spectrum out nearest
 * level, and the fan swings with it the way a real one does, the violet edge
 * vanishing first when the glass starts to keep it.
 *
 * The pointer turns the prism — its place across the box sets the turn, on
 * the drift spring, heavy and without overshoot — and a press sends a pulse
 * of light down the beam, through the glass and out across the spectrum. On
 * first sight the beam draws itself in and the colours unfurl. Keyboard focus
 * on a control inside turns the prism toward it and sends a pulse. One
 * WebGL2 draw a frame, only on screen in a visible page; a CSS and SVG still
 * frame stands in without WebGL2. Under reduced motion the prism holds still
 * at rest, turns exactly to the hand, and a press only brightens the light.
 */
export function PrismSpill({
  children,
  spread = 0.5,
  speed = 0.5,
  glow = 0.6,
  diffusion = 0.6,
  size = 150,
  anchor = [0.28, 0.38],
  beamAngle = 66,
  sway = 12,
  lineColor = LINE,
  interactive = true,
  pointerStrength = 0.6,
  intro = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: PrismSpillProps) {
  const motionSafe = useMotionSafe();
  // An SVG reference wants a plain id: the hook's own may carry punctuation.
  const uid = `prism-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const paints = [PAGE, lineColor, INK, PAPER] as const;
  const paintKey = paints.join("|");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onActiveChange);

  const config: Config = {
    spread,
    speed,
    glow,
    diffusion,
    size,
    ax: anchor[0],
    ay: anchor[1],
    beamAngle,
    sway,
    paintKey,
    interactive,
    pointerStrength,
    intro,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current?.(a),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onActiveChange;
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
    if (visible.current) e.sighted();
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
      if (visible.current) {
        engine.current?.sighted();
        engine.current?.wake();
      }
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
    if (!hit || !rootRef.current?.contains(hit)) engine.current?.pulse(1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
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
    engine.current?.pulse(0.7);
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
        // A sideways drag turns the prism on touch; an upright one scrolls.
        "group/prism-spill relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{ backgroundColor: SURFACE }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <StandIn
        id={uid}
        size={size}
        anchor={anchor}
        beamAngle={beamAngle}
        spread={spread}
        line={lineColor}
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
 * browser without WebGL2: the glass at its resting turn in SVG, lying on the
 * warm surface with its soft shadow, the shaft of window light falling on its
 * lit facet and the colours washing out across the surface, all from the
 * same optics rounded to fixed decimals so the server and the browser draw
 * the same markup.
 */
function StandIn({
  id,
  size,
  anchor,
  beamAngle,
  spread,
  line,
}: {
  id: string;
  size: number;
  anchor: readonly [number, number];
  beamAngle: number;
  spread: number;
  line: string;
}) {
  const shape = React.useMemo(() => {
    const o = createOptics();
    const rest = restOf(beamAngle, spread);
    const len = clamp(size, 60, 400);
    const b = deg(beamAngle);
    traceLight(
      o,
      0,
      0,
      len,
      deg(rest.turn),
      b,
      spread,
      rest.ax * len,
      rest.ay * len,
    );
    const pts = [0, 1, 2]
      .map((k) => `${r3(o.vx[k] ?? 0)},${r3(o.vy[k] ?? 0)}`)
      .join(" ");
    const shade = [0, 1, 2]
      .map(
        (k) =>
          `${r3((o.vx[k] ?? 0) + Math.cos(b) * 9)},${r3((o.vy[k] ?? 0) + Math.sin(b) * 9)}`,
      )
      .join(" ");
    const lit = o.entry >= 0 ? o.entry : 0;
    const litEdge = {
      x1: r3(o.vx[lit] ?? 0),
      y1: r3(o.vy[lit] ?? 0),
      x2: r3(o.vx[(lit + 1) % 3] ?? 0),
      y2: r3(o.vy[(lit + 1) % 3] ?? 0),
    };
    const shaft = {
      x1: r3(o.inX - Math.cos(b) * 900),
      y1: r3(o.inY - Math.sin(b) * 900),
      x2: r3(o.inX),
      y2: r3(o.inY),
    };
    let wash = "";
    let grad = { x1: 0, y1: 0, x2: 0, y2: 0 };
    const red = o.ok[6] ? 6 : o.ok[5] ? 5 : -1;
    const violet = o.ok[0] ? 0 : o.ok[1] ? 1 : -1;
    if (red >= 0 && violet >= 0) {
      const far = 420;
      const ex = ((o.ex[red] ?? 0) + (o.ex[violet] ?? 0)) / 2;
      const ey = ((o.ey[red] ?? 0) + (o.ey[violet] ?? 0)) / 2;
      const mx = o.dx[MID] ?? 1;
      const my = o.dy[MID] ?? 0;
      // The wash leaves as wide as the shaft and opens as it goes.
      const open = 18 + far * 0.2;
      const side = (o.dx[red] ?? 0) * -my + (o.dy[red] ?? 0) * mx >= 0 ? 1 : -1;
      const nx = -my * side;
      const ny = mx * side;
      wash = [
        `${r3(ex - nx * 14)},${r3(ey - ny * 14)}`,
        `${r3(ex + nx * 14)},${r3(ey + ny * 14)}`,
        `${r3(ex + mx * far + nx * open)},${r3(ey + my * far + ny * open)}`,
        `${r3(ex + mx * far - nx * open)},${r3(ey + my * far - ny * open)}`,
      ].join(" ");
      grad = {
        x1: r3(ex + mx * 160 - nx * 60),
        y1: r3(ey + my * 160 - ny * 60),
        x2: r3(ex + mx * 160 + nx * 60),
        y2: r3(ey + my * 160 + ny * 60),
      };
    }
    return { pts, shade, litEdge, shaft, wash, grad };
  }, [size, beamAngle, spread]);
  const gradId = `${id}-spectrum`;
  const softId = `${id}-soft`;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-400 group-data-live/prism-spill:opacity-0"
    >
      <defs>
        <linearGradient
          id={gradId}
          gradientUnits="userSpaceOnUse"
          x1={shape.grad.x1}
          y1={shape.grad.y1}
          x2={shape.grad.x2}
          y2={shape.grad.y2}
        >
          <stop offset="0" stopColor="oklch(0.66 0.2 30)" />
          <stop offset="0.3" stopColor="oklch(0.88 0.16 95)" />
          <stop offset="0.5" stopColor="oklch(0.82 0.17 140)" />
          <stop offset="0.7" stopColor="oklch(0.7 0.15 240)" />
          <stop offset="1" stopColor="oklch(0.62 0.2 300)" />
        </linearGradient>
        <filter id={softId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <svg
        x={`${r3(clamp(anchor[0], 0, 1) * 100)}%`}
        y={`${r3(clamp(anchor[1], 0, 1) * 100)}%`}
        overflow="visible"
      >
        <polygon
          points={shape.shade}
          fill="black"
          fillOpacity={0.22}
          filter={`url(#${softId})`}
        />
        <line
          {...shape.shaft}
          stroke={SUN}
          strokeOpacity={0.28}
          strokeWidth={26}
          filter={`url(#${softId})`}
        />
        {shape.wash ? (
          <polygon
            points={shape.wash}
            fill={`url(#${gradId})`}
            fillOpacity={0.32}
            filter={`url(#${softId})`}
          />
        ) : null}
        <polygon
          points={shape.pts}
          fill={line}
          fillOpacity={0.1}
          stroke={line}
          strokeOpacity={0.18}
          strokeWidth={1}
        />
        <line
          {...shape.litEdge}
          stroke={SUN}
          strokeOpacity={0.85}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </svg>
    </svg>
  );
}
