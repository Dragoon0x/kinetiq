"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type FlutedTumblerProps = {
  /** How many layers of liquid are stacked in the glass, 2 to 4; they take the first colours of `colors`. @default 3 */
  layers?: number;
  /** The layers' colours, bottom to top, as CSS colours. Pigment: they read the same in either theme. @default cherry, amber, cream, sage */
  colors?: readonly string[];
  /** Each layer's share of the liquid, bottom to top; only the ratios matter. @default [1, 1.1, 0.8, 0.6] */
  amounts?: readonly number[];
  /** How full the glass is, 0.3 to 0.95 of the space above its heavy base. @default 0.78 */
  fill?: number;
  /** Flutes round the whole glass, 8 to 40; about half face you. @default 20 */
  fluteCount?: number;
  /** How hard each flute bends what is behind it, 0 (flat glass) to 1 (each flute shows a small inverted sliver). @default 0.6 */
  fluteDepth?: number;
  /** The colour fringe where the image jumps at a rib, 0 to 1. @default 0.5 */
  fringe?: number;
  /** How thick the liquid is, 0 to 1: runny liquid swirls long and sloshes, syrup turns slowly and comes to rest quickly. @default 0.4 */
  viscosity?: number;
  /** Roughly how long the layers take to separate again by weight, in seconds. @default 5 */
  settle?: number;
  /** The furthest a sideways move tips the glass, in degrees. @default 5 */
  tilt?: number;
  /** The glass's own tint, any CSS colour; resolved on the element so it follows the theme. @default "var(--ink-3)" */
  glassColor?: string;
  /** Drag, tap and keys stir the glass. @default true */
  interactive?: boolean;
  /** Hold the liquid exactly where it is. @default false */
  paused?: boolean;
  /** Names the glass for assistive technology. @default "A fluted tumbler of layered colour" */
  label?: string;
  /** Play a pour while the liquid spins. Off unless asked for. @default false */
  sound?: boolean;
  /** Seeds where the overturning currents run, so two glasses never stir alike. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the visitor starts stirring a settled glass: a drag, a tap or a key. */
  onStir?: () => void;
  /** Fires once the stirred layers have separated again and the glass is still. */
  onSettle?: () => void;
  /** Shows the glass but takes no stirring. @default false */
  disabled?: boolean;
  /** Sizes the box; give it a height. @default "h-56 w-full" */
  className?: string;
};

/** Pigments at fixed lightness, bottom to top: cherry, amber, cream, sage. */
const LIQUIDS = [
  "oklch(0.47 0.14 18)",
  "oklch(0.75 0.15 64)",
  "oklch(0.92 0.05 92)",
  "oklch(0.7 0.09 165)",
] as const;

const DEFAULT_AMOUNTS = [1, 1.1, 0.8, 0.6] as const;

/** The liquid's field: angle round the wall by height. */
const NT = 64;
const NZ = 40;
/** The spin a brisk stir reaches, rad/s. */
const SPIN_MAX = 9;
/** The springs and the slosh integrate at 120 Hz; the field steps at 60. */
const STEP = 1 / 120;
const FIELD_STEP = 1 / 60;
const TAU = Math.PI * 2;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** A small seeded generator: the same currents for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** sRGB byte to linear light, so the shader mixes colours as light mixes. */
const toLinear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const FRAGMENT = /* glsl */ `
${GLSL_SRGB}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform vec4 u_glass;
uniform vec4 u_dims;
uniform vec4 u_motion;
uniform vec4 u_optics;
uniform float u_count;
uniform vec3 u_col[4];
uniform vec3 u_bounds;
uniform vec4 u_tint;
uniform vec4 u_edge;
uniform vec3 u_spec;
uniform vec4 u_shade;
uniform highp sampler2D u_field;

const float TAU = 6.28318530718;

// The layer colour for a source height s: each boundary a soft step, wider
// while the liquid is churned, so stirred colour reads as mixing.
vec3 ramp(float s, float soft) {
  vec3 c = u_col[0];
  c = mix(c, u_col[1], smoothstep(u_bounds.x - soft, u_bounds.x + soft, s));
  if (u_count > 2.5) c = mix(c, u_col[2], smoothstep(u_bounds.y - soft, u_bounds.y + soft, s));
  if (u_count > 3.5) c = mix(c, u_col[3], smoothstep(u_bounds.z - soft, u_bounds.z + soft, s));
  return c;
}

// The field carries the large folds; while the liquid churns, fine helical
// striations wound by its turning ride on top, so the mixing reads as streaks.
float field(float theta, float z) {
  float s = texture(u_field, vec2(theta / TAU, clamp(z, 0.0, 1.0))).r;
  float turn = u_motion.w;
  float streak =
    sin(theta * 5.0 + z * 23.0 - turn * 0.9) *
    sin(theta * 3.0 - z * 14.0 + turn * 0.6);
  return s + u_optics.w * 0.08 * streak;
}

float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 p = v_uv * u_res;
  float cx = u_glass.x;
  float yb = u_glass.y;
  float R = u_glass.z;
  float Hg = u_glass.w;
  float e = u_dims.x;
  float Hb = u_dims.y;
  float wall = u_dims.z;
  float Hl = u_dims.w;
  float tilt = u_motion.x;
  float slope = u_motion.y;
  float spin = u_motion.z;
  float spinAbs = abs(spin);
  float mixAmt = u_optics.w;

  // The shadow and the light that came through the liquid lie on the surface
  // the glass stands on, so they stay put while the glass tips.
  vec4 outc = vec4(0.0);
  vec2 sd = (p - vec2(cx + 0.16 * R, yb + 0.3 * e)) / vec2(1.25 * R, 1.6 * e);
  float sh = 1.0 - smoothstep(0.2, 1.0, length(sd));
  outc = vec4(u_shade.rgb, 1.0) * (u_shade.a * sh * sh);
  vec2 cd = (p - vec2(cx + 0.66 * R, yb + 0.55 * e)) / vec2(0.62 * R, 0.9 * e);
  float ca = 1.0 - smoothstep(0.0, 1.0, length(cd));
  ca *= ca * 0.34;
  vec3 pool = ramp(u_bounds.x + 0.02, 0.2);
  outc = vec4(pool, 1.0) * ca + outc * (1.0 - ca);

  // Into the glass's own frame: rotate about the middle of its foot.
  vec2 d = p - vec2(cx, yb);
  float ct = cos(tilt);
  float st = sin(tilt);
  vec2 q = vec2(ct * d.x + st * d.y, -st * d.x + ct * d.y);
  float px = max(fwidth(q.x), 1e-3);
  float u = q.x / R;
  float au = abs(u);

  if (au < 1.0 + 2.0 * px / R) {
    float k = sqrt(max(0.0, 1.0 - u * u));
    float yt = -Hg;
    float top = yt - e * k;
    float bottom = e * k;
    float yv = q.y;
    float inside =
      smoothstep(top - px, top + px, yv) *
      (1.0 - smoothstep(bottom - px, bottom + px, yv)) *
      (1.0 - smoothstep(1.0 - px / R, 1.0 + px / R, au));

    if (inside > 0.0) {
      float Ri = R - wall;
      float ei = e * Ri / R;
      float yib = -Hb;
      float theta = asin(clamp(u, -1.0, 1.0));
      float N = u_optics.x;
      float phi = theta * N / TAU + 0.5;
      float fi = floor(phi);
      float f = phi - fi - 0.5;
      float thc = fi * TAU / N;
      // Each flute is a small convex lens: it resamples the liquid about its
      // own centre, compressing and at depth inverting it; the three channels
      // bend by slightly different amounts, which is the fringe.
      float m = mix(1.0, -0.9, u_optics.y);
      float dm = 0.16 * u_optics.z;
      float thG = thc + (theta - thc) * m;
      float thR = thc + (theta - thc) * (m - dm);
      float thB = thc + (theta - thc) * (m + dm);
      float frontRim = yt + e * k;
      float seamW = fwidth(phi) * 1.3 + 0.015;
      float seam = 1.0 - smoothstep(0.0, seamW, 0.5 - abs(f));
      float soft = 0.008 + 0.05 * mixAmt;

      vec3 col;
      float a;
      bool front = yv >= frontRim;
      float sxG = sin(thG);
      float wallTop = 1.0 + 0.1 * spinAbs * spinAbs;
      // Height above the inner floor at the wall, then levelled: the liquid
      // stays level in the world while the glass tips, and the upper layers
      // slosh more than the lower.
      float zpx = (yib + ei * cos(thG)) - yv;
      float zn0 = zpx / Hl;
      float x = sxG * Ri;
      float zn = (zpx + x * slope * (0.35 + 0.65 * clamp(zn0, 0.0, 1.0))) / Hl;
      // Where the floor of the glass is, at this angle.
      float floorY = yib + ei * cos(thG);

      if (front && yv > floorY) {
        // The heavy base: a compressed, inverted glimpse of the lowest layer
        // fading toward the foot, with a bright line where the floor meets it.
        float bz = clamp((yv - floorY) / max(Hb + e * k, 1.0), 0.0, 1.0);
        vec3 low = ramp(field(thG, 0.03), soft);
        col = mix(low, u_tint.rgb, 0.2 + 0.6 * bz);
        a = mix(0.62, 0.16, bz);
        float lip = exp(-pow((yv - floorY) / 1.6, 2.0));
        col += u_spec * lip * 0.35;
      } else if (front && zn <= wallTop) {
        // The liquid at the wall, seen through the flute.
        float zR = zn + (sin(thR) - sxG) * Ri * slope / Hl;
        float zB = zn + (sin(thB) - sxG) * Ri * slope / Hl;
        col = vec3(
          ramp(field(thR, zR), soft).r,
          ramp(field(thG, zn), soft).g,
          ramp(field(thB, zB), soft).b
        );
        // Longer paths through the liquid near the sides, a little depth to
        // the lower layers, and light carried through to the far side.
        col *= (1.0 - 0.3 * pow(abs(sxG), 4.0)) * (0.9 + 0.1 * clamp(zn, 0.0, 1.0));
        col += col * 0.22 * smoothstep(0.15, 0.85, sxG);
        // The meniscus catches the light where the liquid meets the wall.
        float men = exp(-pow((zn - wallTop) * Hl / 1.4, 2.0));
        col = mix(col, u_spec, men * 0.35);
        a = 0.97;
      } else {
        // Above the liquid, or looking in over the rim: the liquid's top seen
        // from above, inside its ellipse; otherwise the empty glass.
        float ex = front ? sxG : u * R / Ri;
        float surfY = yib - Hl * (1.0 + 0.04 * spinAbs * spinAbs) + x * slope;
        float ey = (yv - surfY) / ei;
        float rr2 = ex * ex + ey * ey;
        if (rr2 <= 1.0) {
          float rr = sqrt(rr2);
          float az = atan(ex, ey);
          // A strong spin dips the middle and winds the colours into a spiral.
          float dip = (1.0 - rr * rr) * 0.6 * spinAbs;
          float wind = (1.0 - rr) * 2.4 * spin;
          col = ramp(field(az - wind, 1.0 - dip), soft);
          col = mix(col, u_spec, 0.1 + 0.08 * (1.0 - rr));
          float glint = exp(-pow((ey + 0.55) * 3.2, 2.0) - pow((ex + 0.25) * 2.2, 2.0));
          col += u_spec * glint * 0.28;
          a = 0.97;
        } else {
          col = u_tint.rgb;
          a = u_tint.a;
          // The far wall's flutes, faint through the near one.
          float back = 1.0 - smoothstep(0.0, seamW * 1.4, abs(fract(phi + 0.5) - 0.5));
          col = mix(col, u_edge.rgb, back * 0.5);
          a = max(a, back * u_edge.a * 0.35);
        }
      }

      if (front) {
        // The ribs themselves: a dark seam between flutes with a trace of
        // fringe, each flute rounder on its lit side, and over the liquid a
        // darkening rather than an ink line.
        col *= 1.0 - 0.24 * seam;
        col += vec3(0.05, 0.0, -0.04) * u_optics.z * seam * sign(f);
        // Each flute is round: darker where its sides turn away, a soft band
        // of light left of its crest.
        float af = abs(2.0 * f);
        col *= 1.0 - 0.2 * af * af * af;
        col *= 1.0 + 0.16 * (1.0 - smoothstep(0.0, 0.3, abs(f + 0.14))) * (1.0 - 0.6 * au);
        a = max(a, seam * u_edge.a * 0.6);
        col = mix(col, u_edge.rgb, seam * (1.0 - a) * 0.6);
      }

      // The glass seen edge-on near the silhouette is thicker and tints more.
      float edgeBand = smoothstep(0.84, 1.0, au);
      col = mix(col, u_tint.rgb, edgeBand * 0.45);
      a = max(a, edgeBand * u_tint.a * 3.0);

      vec4 g = vec4(col * a, a);

      // Light: a narrow streak on every flute that faces the upper-left lamp,
      // a broad soft sheet on the right, the rim's ring and the foot's edge.
      float normalAngle = theta + asin(clamp(2.0 * f, -1.0, 1.0)) * 0.6;
      float spec = pow(max(0.0, cos(normalAngle + 0.85)), 30.0);
      spec *= front ? (0.45 + 0.55 * smoothstep(0.0, Hg, -yv)) : 0.25;
      float sheet = smoothstep(0.5, 0.95, u) * 0.1;
      float rimD = length(vec2(u, (yv - yt) / e));
      float rimIn = 1.0 - wall / R;
      float ring = 1.0 - smoothstep(0.0, px / R * 1.5 + 0.006, max(rimIn - rimD, rimD - 1.0));
      ring *= yv > yt ? 0.9 : 0.5;
      float foot = exp(-pow((yv - bottom + 1.2) / 1.1, 2.0)) * smoothstep(1.0, 0.3, au) * 0.55;
      float silhouette = exp(-pow((1.0 - au) * R / 1.1, 2.0)) * 0.55;
      float light = clamp(spec * 0.55 + sheet + ring * 0.7 + foot + silhouette, 0.0, 1.2);
      g.rgb = g.rgb * (1.0 - light * 0.5) + u_spec * light;
      g.a = max(g.a, min(1.0, light));
      g.rgb = mix(g.rgb, u_edge.rgb * max(g.a, ring * u_edge.a), ring * (1.0 - a) * 0.4);

      g *= inside;
      outc = g + outc * (1.0 - g.a);
    }
  }

  // Back to display light, premultiplied, with a bit of grain so the long
  // gradients never band.
  float alpha = clamp(outc.a, 0.0, 1.0);
  vec3 straight = alpha > 0.0001 ? clamp(outc.rgb / alpha, 0.0, 1.0) : vec3(0.0);
  vec3 display = kx_linearToSrgb(straight) + (grain(gl_FragCoord.xy) - 0.5) / 255.0;
  o_color = vec4(display * alpha, alpha);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  field: WebGLTexture;
  lost: boolean;
};

type Spoon = {
  on: boolean;
  theta: number;
  z: number;
  vt: number;
  vz: number;
};

type Liquid = {
  /** Where each cell's liquid came from, as a height 0..1: a still glass is s = z. */
  s: Float32Array;
  scratch: Float32Array;
  /** The liquid's spin about the glass's axis, rad/s; positive is clockwise from above. */
  spin: number;
  /** How far it has turned, rad. */
  turn: number;
  /** How churned the colours are, 0..1. */
  mix: number;
  /** The furthest any parcel sits from its own height. */
  dev: number;
  tilt: number;
  tiltV: number;
  tiltTo: number;
  /** The surface's angle in the world, rad: the slosh. */
  slosh: number;
  sloshV: number;
  /** The visitor's stir: the spin the hand asks for while it circles. */
  stirring: boolean;
  ask: number;
  spoon: Spoon;
  carry: number;
  fieldCarry: number;
  last: number;
  dirty: boolean;
  /** A stir is in progress (from the first touch to the settle). */
  episode: boolean;
};

type Layout = {
  w: number;
  h: number;
  bw: number;
  bh: number;
  dpr: number;
  cx: number;
  yb: number;
  R: number;
  Hg: number;
  e: number;
  Hb: number;
  wall: number;
  Hl: number;
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
  upload: () => void;
};

/** The glass's geometry for a box, in CSS px. The CSS still uses the same numbers. */
function layoutFor(w: number, h: number, fill: number) {
  const Hg = Math.max(24, Math.min(h * 0.72, w * 1.05));
  const R = Hg * 0.42;
  const e = R * 0.2;
  const Hb = Hg * 0.19;
  const wall = R * 0.075;
  const Hl = clamp(fill, 0.3, 0.95) * (Hg - Hb - e * 0.4);
  return { Hg, R, e, Hb, wall, Hl, cx: w / 2, yb: h / 2 + Hg * 0.5 - 0.4 * e };
}

/**
 * A heavy tumbler with vertical flutes, holding two to four layers of
 * coloured liquid, drawn per pixel in one WebGL2 pass on a transparent canvas.
 * Every flute is a small lens that resamples the liquid about its own centre,
 * so the layers' smile-shaped boundaries break into repeating slivers that
 * step from flute to flute, with a faint colour fringe where the image jumps.
 *
 * The liquid is a field over angle-round-the-wall by height, each cell
 * holding where its liquid came from. Drag in circles round the glass and the
 * hand's angular velocity spins it; the spin shears the field, overturning
 * currents carry the top layer down and the bottom up in waves round the
 * glass, and the hand drags the liquid where it crosses it. Buoyancy pulls
 * every parcel back toward its own height, so the colours swirl into one
 * another and then separate again by weight. A sideways move tips the glass
 * on the glide spring — heavy, no bounce — and its swing sets the surface
 * sloshing on a pendulum damped by the liquid's viscosity.
 *
 * Keyboard: the glass is a button; Left and Right stir, Shift with them
 * tips it, Enter or Space gives a brisk stir. Under reduced motion the glass
 * rests still: a stir swaps to a still of the stirred liquid, and the layers
 * separate again in three still steps.
 */
export function FlutedTumbler({
  layers = 3,
  colors = LIQUIDS,
  amounts = DEFAULT_AMOUNTS,
  fill = 0.78,
  fluteCount = 20,
  fluteDepth = 0.6,
  fringe = 0.5,
  viscosity = 0.4,
  settle = 5,
  tilt = 5,
  glassColor = "var(--ink-3)",
  interactive = true,
  paused = false,
  label = "A fluted tumbler of layered colour",
  sound = false,
  seed = 3,
  dpr = 2,
  onStir,
  onSettle,
  disabled = false,
  className,
}: FlutedTumblerProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const count = clamp(Math.round(layers), 2, 4);
  const liquids = Array.from(
    { length: count },
    (_, i) => colors[i] ?? LIQUIDS[i] ?? LIQUIDS[0],
  );
  const shares = Array.from({ length: count }, (_, i) =>
    Math.max(0.05, amounts[i] ?? DEFAULT_AMOUNTS[i] ?? 1),
  );
  const total = shares.reduce((sum, v) => sum + v, 0);
  const bounds: number[] = [];
  let run = 0;
  for (let i = 0; i < count - 1; i += 1) {
    run += (shares[i] ?? 0) / total;
    bounds.push(r3(run));
  }
  const paintKey = `${liquids.join("|")}|${glassColor}`;
  const boundsKey = bounds.join(",");

  const k = {
    count,
    bounds,
    fill: clamp(fill, 0.3, 0.95),
    flutes: clamp(Math.round(fluteCount), 8, 40),
    depth: clamp01(fluteDepth),
    fringe: clamp01(fringe),
    visc: clamp01(viscosity),
    settle: clamp(settle, 0.5, 30),
    tiltMax: (clamp(tilt, 0, 15) * Math.PI) / 180,
    paused,
    phase: lcg(seed)() * TAU,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
    enabled: interactive && !disabled,
  };

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Layout | null>(null);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  /** Linear colours: tint, edge, highlight, shadow (rgba each), then four layers (rgb each). */
  const colour = React.useRef(new Float32Array(28));
  const layerData = React.useRef(new Float32Array(12));
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const pour = React.useRef<ReturnType<typeof audio.start> | null>(null);
  const settleTimer = React.useRef<number | null>(null);
  const lastDir = React.useRef(1);
  const liquid = React.useRef<Liquid | null>(null);
  if (liquid.current === null) {
    const s = new Float32Array(NT * NZ);
    for (let j = 0; j < NZ; j += 1) s.fill((j + 0.5) / NZ, j * NT, j * NT + NT);
    liquid.current = {
      s,
      scratch: new Float32Array(NT * NZ),
      spin: 0,
      turn: 0,
      mix: 0,
      dev: 0,
      tilt: 0,
      tiltV: 0,
      tiltTo: 0,
      slosh: 0,
      sloshV: 0,
      stirring: false,
      ask: 0,
      spoon: { on: false, theta: 0, z: 0, vt: 0, vz: 0 },
      carry: 0,
      fieldCarry: 0,
      last: 0,
      dirty: true,
      episode: false,
    };
  }
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onStir, onSettle });
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /** Each carrier's colour as linear floats with its alpha, by painting one pixel. */
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
    const spans = carriers.children;
    for (let i = 0; i < spans.length && i < 8; i += 1) {
      const span = spans[i];
      if (!span) continue;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      if (i < 4) {
        out[i * 4] = toLinear(d[0] ?? 0);
        out[i * 4 + 1] = toLinear(d[1] ?? 0);
        out[i * 4 + 2] = toLinear(d[2] ?? 0);
        out[i * 4 + 3] = (d[3] ?? 0) / 255;
      } else {
        const o = 16 + (i - 4) * 3;
        out[o] = toLinear(d[0] ?? 0);
        out[o + 1] = toLinear(d[1] ?? 0);
        out[o + 2] = toLinear(d[2] ?? 0);
      }
    }
    layerData.current.set(out.subarray(16, 28));
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    const w = r.width / r.dpr;
    const h = r.height / r.dpr;
    size.current = {
      w,
      h,
      bw: r.width,
      bh: r.height,
      dpr: r.dpr,
      ...layoutFor(w, h, k.fill),
    };
  };

  const upload = () => {
    const g = gpu.current;
    const L = liquid.current;
    if (!g || g.lost || !L) return;
    const { gl } = g;
    gl.bindTexture(gl.TEXTURE_2D, g.field);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, NT, NZ, gl.RED, gl.FLOAT, L.s);
    L.dirty = false;
  };

  /** One frame from the liquid as it stands; nothing is allocated. */
  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    const L = liquid.current;
    if (!g || g.lost || !sz || !L || !visible.current) return;
    if (L.dirty) upload();
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const c = colour.current;
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.field);
    gl.uniform1i(u.u_field ?? null, 0);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform4f(u.u_glass ?? null, sz.cx, sz.yb, sz.R, sz.Hg);
    gl.uniform4f(u.u_dims ?? null, sz.e, sz.Hb, sz.wall, sz.Hl);
    const spinShown = clamp(L.spin / SPIN_MAX, -1, 1);
    gl.uniform4f(
      u.u_motion ?? null,
      L.tilt,
      Math.tan(clamp(L.slosh - L.tilt, -0.6, 0.6)),
      spinShown,
      L.turn,
    );
    gl.uniform4f(u.u_optics ?? null, k.flutes, k.depth, k.fringe, L.mix);
    gl.uniform1f(u.u_count ?? null, k.count);
    gl.uniform3fv(u.u_col ?? null, layerData.current);
    gl.uniform3f(
      u.u_bounds ?? null,
      k.bounds[0] ?? 2,
      k.bounds[1] ?? 2,
      k.bounds[2] ?? 2,
    );
    gl.uniform4f(u.u_tint ?? null, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, 0.06);
    gl.uniform4f(u.u_edge ?? null, c[4] ?? 0, c[5] ?? 0, c[6] ?? 0, c[7] ?? 0);
    gl.uniform3f(u.u_spec ?? null, c[8] ?? 1, c[9] ?? 1, c[10] ?? 1);
    gl.uniform4f(
      u.u_shade ?? null,
      c[12] ?? 0,
      c[13] ?? 0,
      c[14] ?? 0,
      c[15] ?? 0,
    );
    gl.disable(gl.BLEND);
    tri.draw();
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /**
   * One 60 Hz step of the field: every cell traces back along the liquid's
   * velocity and takes what was there. Spin shears it (strongest near the
   * top, where a spoon is), overturning cells carry it up and down in waves
   * that turn slower than the liquid, the hand drags it where it passes, and
   * buoyancy pulls each parcel toward its own height.
   */
  const stepField = (L: Liquid, dt: number) => {
    const { s, scratch } = L;
    const spinAbs = Math.min(1, Math.abs(L.spin) / SPIN_MAX);
    const over = 1.1 * spinAbs;
    // A churning glass stays mixed; weight only wins as the spin dies.
    const buoy = (3 / k.settle) * (1 - 0.85 * Math.min(1, spinAbs * 2.5));
    const toCellsT = NT / TAU;
    const sp = L.spoon;
    let dev = 0;
    for (let j = 0; j < NZ; j += 1) {
      const z = (j + 0.5) / NZ;
      // Clockwise from above carries the near side of the glass leftward.
      const ut = -L.spin * (0.3 + 0.7 * z * z);
      const lift = Math.sin(Math.PI * z) * over;
      for (let i = 0; i < NT; i += 1) {
        const th = ((i + 0.5) / NT) * TAU;
        const at = j * NT + i;
        const here = s[at] ?? z;
        let vt = ut;
        let vz =
          lift *
            (Math.sin(3 * th - 0.6 * L.turn + 4 * z + k.phase) +
              0.6 * Math.sin(2 * th + 0.4 * L.turn - 3 * z + k.phase * 2) +
              0.35 * Math.sin(5 * th - 1.1 * L.turn + 7 * z)) +
          buoy * (here - z);
        if (sp.on) {
          let dth = th - sp.theta;
          dth -= TAU * Math.round(dth / TAU);
          const dz = z - sp.z;
          const g = Math.exp(-(dth * dth) / 0.16 - (dz * dz) / 0.018);
          vt += sp.vt * g;
          vz += sp.vz * g;
        }
        const fi = i + 0.5 - vt * dt * toCellsT - 0.5;
        const fj = clamp(j + 0.5 - vz * dt * NZ - 0.5, 0, NZ - 1);
        const i0 = Math.floor(fi);
        const j0 = Math.floor(fj);
        const ax = fi - i0;
        const ay = fj - j0;
        const ia = ((i0 % NT) + NT) % NT;
        const ib = (ia + 1) % NT;
        const ja = j0;
        const jb = Math.min(NZ - 1, j0 + 1);
        const top =
          (s[ja * NT + ia] ?? 0) * (1 - ax) + (s[ja * NT + ib] ?? 0) * ax;
        const bot =
          (s[jb * NT + ia] ?? 0) * (1 - ax) + (s[jb * NT + ib] ?? 0) * ax;
        const v = top + (bot - top) * ay;
        scratch[at] = v;
        const off = Math.abs(v - z);
        if (off > dev) dev = off;
      }
    }
    L.s = scratch;
    L.scratch = s;
    L.dev = dev;
    L.dirty = true;
  };

  const resetField = (L: Liquid) => {
    for (let j = 0; j < NZ; j += 1)
      L.s.fill((j + 0.5) / NZ, j * NT, j * NT + NT);
    L.dev = 0;
    L.dirty = true;
  };

  /** Advances the liquid and the glass by dt; says whether anything still moves. */
  const advance = (dt: number): boolean => {
    const L = liquid.current;
    if (!L) return false;
    if (k.paused) return false;
    const v = k.visc;
    // A runny liquid keeps its spin for seconds; syrup lets it go quickly.
    const spinLife = lerp(3.4, 0.7, v);
    const coupling = lerp(6, 2.4, v);
    const G = springs.glide;
    const w0 = TAU * 1.45;
    const zeta = lerp(0.07, 0.42, v);
    L.carry += dt;
    let steps = 0;
    while (L.carry >= STEP && steps < 10) {
      L.carry -= STEP;
      steps += 1;
      if (L.stirring)
        L.spin += (L.ask - L.spin) * (1 - Math.exp(-STEP * coupling));
      L.spin *= Math.exp(-STEP / spinLife);
      L.turn = (L.turn + L.spin * STEP) % (TAU * 64);
      // How churned the colours are follows the spin, and fades by itself.
      const churn = Math.min(1, Math.abs(L.spin) / SPIN_MAX);
      L.mix +=
        (churn * lerp(1.8, 0.9, v) * (1 - L.mix) - L.mix / (k.settle * 0.45)) *
        STEP;
      L.mix = clamp01(L.mix);
      // The glass is heavy: it tips toward the push and rights itself on the
      // glide spring, never bouncing.
      const ta =
        (-G.stiffness * (L.tilt - L.tiltTo) - G.damping * L.tiltV) / G.mass;
      L.tiltV += ta * STEP;
      L.tilt += L.tiltV * STEP;
      L.tiltTo *= Math.exp(-STEP / 0.24);
      // The surface lags the glass's swing and swings back on a pendulum
      // damped by the liquid's viscosity.
      const sa = -w0 * w0 * L.slosh - 2 * zeta * w0 * L.sloshV + ta * 0.9;
      L.sloshV += sa * STEP;
      L.slosh = clamp(L.slosh + L.sloshV * STEP, -0.5, 0.5);
    }
    if (steps === 10) L.carry = 0;
    L.fieldCarry += dt;
    let fieldSteps = 0;
    while (L.fieldCarry >= FIELD_STEP && fieldSteps < 4) {
      L.fieldCarry -= FIELD_STEP;
      fieldSteps += 1;
      stepField(L, FIELD_STEP);
    }
    if (fieldSteps === 4) L.fieldCarry = 0;
    const glassMoving =
      Math.abs(L.tilt) + Math.abs(L.tiltV) + Math.abs(L.tiltTo) > 2e-4 ||
      Math.abs(L.slosh) + Math.abs(L.sloshV) > 2e-4;
    const liquidMoving =
      L.stirring ||
      Math.abs(L.spin) > 0.02 ||
      L.mix > 0.003 ||
      L.dev > 0.004 ||
      L.spoon.on;
    if (!liquidMoving && L.dev > 0) resetField(L);
    if (!glassMoving) {
      L.tilt = 0;
      L.tiltV = 0;
      L.tiltTo = 0;
      L.slosh = 0;
      L.sloshV = 0;
    }
    if (!liquidMoving) {
      L.spin = 0;
      L.mix = 0;
    }
    return glassMoving || liquidMoving;
  };

  const stopPour = () => {
    pour.current?.stop();
    pour.current = null;
  };

  /** The pour follows the spin; it stops once the liquid slows. */
  const voicePour = () => {
    const L = liquid.current;
    const loopHandle = pour.current;
    if (!L || !loopHandle) return;
    const level = Math.min(1, Math.abs(L.spin) / SPIN_MAX);
    if (!L.stirring && level < 0.03) {
      stopPour();
      return;
    }
    loopHandle.set({
      gain: Math.min(0.6, level * 0.85),
      pitch: 0.7 + level * 0.5,
    });
  };

  const settled = () => {
    const L = liquid.current;
    if (!L || !L.episode) return;
    L.episode = false;
    report.current.onSettle?.();
    setSaid((s) => ({ n: s.n + 1, text: "Settled into layers." }));
  };

  const tick = (now: number) => {
    frame.current = 0;
    const L = liquid.current;
    if (
      !L ||
      !visible.current ||
      document.hidden ||
      !gpu.current ||
      gpu.current.lost
    ) {
      if (L) L.last = 0;
      stopPour();
      return;
    }
    const dt = L.last ? Math.min(0.05, (now - L.last) / 1000) : 1 / 60;
    L.last = now;
    const moving = advance(dt);
    voicePour();
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else {
      L.last = 0;
      stopPour();
      if (!k.paused) settled();
    }
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    if (!k.motionSafe) {
      draw();
      return;
    }
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick, upload };
    report.current = { onStir, onSettle };
  });

  // The GPU side, bound to the canvas: built, rebuilt after a lost context,
  // torn down with the component. StrictMode's second run builds again on the
  // same context, which the browser hands back unchanged.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      const field = gl.createTexture();
      if (!field) {
        tri.dispose();
        program.dispose();
        return false;
      }
      gl.bindTexture(gl.TEXTURE_2D, field);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R16F,
        NT,
        NZ,
        0,
        gl.RED,
        gl.FLOAT,
        liquid.current?.s ?? null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gpu.current = { gl, program, tri, field, lost: false };
      api.current?.readColours();
      api.current?.resize();
      api.current?.upload();
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
        g.gl.deleteTexture(g.field);
        g.tri.dispose();
        g.program.dispose();
      }
    };
  }, []);

  React.useEffect(() => {
    api.current?.readColours();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr, k.fill]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [
    k.count,
    boundsKey,
    k.flutes,
    k.depth,
    k.fringe,
    k.visc,
    k.tiltMax,
    paused,
    motionSafe,
  ]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    const timer = settleTimer;
    const loopHandle = pour;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      loopHandle.current?.stop();
      loopHandle.current = null;
    };
  }, []);

  // Sound switched off mid-pour: the hook stops its loops; forget ours.
  React.useEffect(() => {
    if (!sound) pour.current = null;
  }, [sound]);

  // Size and sighting, bound to the node when it arrives.
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

  /** A stir begins: says so once per episode, and starts the pour. */
  const begin = (spoken: boolean) => {
    const L = liquid.current;
    if (!L) return;
    if (!L.episode) {
      L.episode = true;
      report.current.onStir?.();
      if (spoken) setSaid((s) => ({ n: s.n + 1, text: "Stirred." }));
    }
    if (sound && k.motionSafe && !pour.current) {
      pour.current = audio.start("pour", { gain: 0, pitch: 0.7 });
    }
  };

  /**
   * Reduced motion: the stirred liquid is worked out off screen and shown at
   * once, then the layers separate in three still steps.
   */
  const stillStir = (spin: number) => {
    const L = liquid.current;
    if (!L) return;
    L.spin = spin;
    L.stirring = false;
    L.mix = 0;
    for (let i = 0; i < 70; i += 1) {
      L.spin *= Math.exp(-FIELD_STEP / 1.6);
      L.turn += L.spin * FIELD_STEP;
      L.mix = Math.min(0.7, L.mix + FIELD_STEP * 1.2);
      stepField(L, FIELD_STEP);
    }
    L.spin = 0;
    api.current?.draw();
    scheduleSettle(3);
  };

  const scheduleSettle = (left: number) => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(
      () => {
        settleTimer.current = null;
        const L = liquid.current;
        if (!L) return;
        if (!visible.current || document.hidden) {
          scheduleSettle(left);
          return;
        }
        if (left <= 1) {
          resetField(L);
          L.mix = 0;
          api.current?.draw();
          settled();
          return;
        }
        const steps = Math.round((k.settle / 3 / FIELD_STEP) * 0.5);
        for (let i = 0; i < steps; i += 1) stepField(L, FIELD_STEP);
        L.mix *= 0.45;
        api.current?.draw();
        scheduleSettle(left - 1);
      },
      Math.round((k.settle * 1000) / 3),
    );
  };

  /** A push of spin (rad/s), from a tap or a key. */
  const impulse = (amount: number, spoken: boolean) => {
    const L = liquid.current;
    if (!L || !k.enabled) return;
    begin(spoken);
    lastDir.current = Math.sign(amount) || lastDir.current;
    if (!k.motionSafe) {
      stillStir(clamp(amount * 2.2, -SPIN_MAX, SPIN_MAX));
      return;
    }
    L.spin = clamp(L.spin + amount, -SPIN_MAX, SPIN_MAX);
    kick();
  };

  /** A sideways nudge: the glass tips and the liquid sloshes. */
  const nudge = (dir: number) => {
    const L = liquid.current;
    if (!L || !k.enabled || !k.motionSafe) return;
    begin(false);
    L.tiltTo = dir * k.tiltMax;
    L.sloshV += dir * 0.9;
    kick();
  };

  // Where the hand is relative to the glass, in its box's px.
  const geometry = () => size.current;
  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const hand = React.useRef({ x: 0, y: 0, t: 0, vx: 0, vy: 0, w: 0 });

  const drag = useDrag({
    threshold: 3,
    disabled: !k.enabled,
    onStart: ({ point, offset, event }) => {
      const L = liquid.current;
      if (!L) return;
      const at = local(point.x - offset.x, point.y - offset.y);
      hand.current = {
        x: at.x,
        y: at.y,
        t: event.timeStamp,
        vx: 0,
        vy: 0,
        w: 0,
      };
      begin(false);
      if (k.motionSafe) {
        L.stirring = true;
        L.ask = L.spin;
      }
      kick();
    },
    onMove: ({ point, event }) => {
      const L = liquid.current;
      const g = geometry();
      if (!L || !g) return;
      const at = local(point.x, point.y);
      const hd = hand.current;
      const dtm = Math.max(4, event.timeStamp - hd.t) / 1000;
      const vx = (at.x - hd.x) / dtm;
      const vy = (at.y - hd.y) / dtm;
      // Smoothed over a few events so a jittery hand still stirs evenly.
      const blend = Math.min(1, dtm / 0.06);
      const ax = vx - hd.vx;
      hd.vx += (vx - hd.vx) * blend;
      hd.vy += (vy - hd.vy) * blend;
      // The hand's angular velocity about the glass's axis is the stir.
      const mid = g.yb - g.Hg / 2;
      const rx = at.x - g.cx;
      const ry = at.y - mid;
      const r2 = Math.max(rx * rx + ry * ry, (g.R * 0.6) ** 2);
      const w = (rx * hd.vy - ry * hd.vx) / r2;
      hd.w += (w - hd.w) * blend;
      hd.x = at.x;
      hd.y = at.y;
      hd.t = event.timeStamp;
      if (!k.motionSafe) return;
      L.ask = clamp(hd.w * 0.8, -SPIN_MAX, SPIN_MAX);
      if (Math.abs(L.ask) > 0.5) lastDir.current = Math.sign(L.ask);
      L.tiltTo = clamp(hd.vx / 1400, -1, 1) * k.tiltMax;
      L.sloshV += clamp(ax / 6000, -0.4, 0.4);
      // Where the hand crosses the glass, it drags the liquid with it.
      const u = (at.x - g.cx) / g.R;
      const zpx = g.yb - g.Hb - at.y;
      const z = zpx / g.Hl;
      const sp = L.spoon;
      if (Math.abs(u) < 0.98 && z > 0 && z < 1.05) {
        sp.on = true;
        sp.theta = Math.asin(clamp(u, -1, 1));
        sp.z = clamp01(z);
        sp.vt = clamp(
          hd.vx / (g.R * Math.max(0.3, Math.cos(sp.theta))),
          -12,
          12,
        );
        sp.vz = clamp(-hd.vy / g.Hl, -6, 6);
      } else sp.on = false;
      kick();
    },
    onEnd: () => {
      const L = liquid.current;
      if (!L) return;
      L.stirring = false;
      L.spoon.on = false;
      if (!k.motionSafe)
        stillStir(clamp(hand.current.w * 0.8, -SPIN_MAX, SPIN_MAX) || 4);
      kick();
    },
    onCancel: () => {
      const L = liquid.current;
      if (!L) return;
      L.stirring = false;
      L.spoon.on = false;
      kick();
    },
    onTap: (event) => {
      const g = geometry();
      if (!g) return;
      // A tap on one side turns the liquid away from it.
      const at = local(event.clientX, event.clientY);
      impulse(at.x < g.cx ? 2.4 : -2.4, false);
    },
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!k.enabled) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const dir = event.key === "ArrowRight" ? 1 : -1;
    if (event.shiftKey) {
      nudge(dir);
      return;
    }
    impulse(dir * 2.2, true);
  };

  const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // Space and Enter arrive as a click with no pointer behind it: a brisk
    // stir the way the last one went.
    if (event.detail !== 0 || !k.enabled) return;
    impulse(lastDir.current * SPIN_MAX * 0.75, true);
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  const still = standIn(liquids, shares, k.fill, k.flutes);
  const carriers = [
    `color-mix(in oklab, ${glassColor} 60%, transparent)`,
    "color-mix(in oklab, var(--foreground) 42%, transparent)",
    "oklch(0.99 0.006 90)",
    "oklch(0 0 0 / 0.26)",
    ...liquids,
  ];

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-label={label}
      className={cn(
        "group/fluted-tumbler [container-type:size] relative isolate h-56 w-full overflow-clip",
        className,
      )}
      style={{ "--hg": "min(72cqh, 105cqw)" } as React.CSSProperties}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/fluted-tumbler:invisible group-data-live/fluted-tumbler:opacity-0"
      >
        {still}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {carriers.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      {interactive ? (
        <button
          type="button"
          aria-label="Stir the tumbler"
          aria-describedby={hintId}
          disabled={disabled}
          onKeyDown={onKeyDown}
          onClick={onClick}
          {...drag}
          className={cn(
            "absolute inset-y-0 left-1/2 w-[calc(var(--hg)*1.26)] max-w-full -translate-x-1/2 cursor-grab touch-none rounded-3 outline-none select-none active:cursor-grabbing",
            "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
            "disabled:cursor-not-allowed",
          )}
        />
      ) : null}
      <p id={hintId} className="sr-only">
        Drag in circles round the glass to stir it, or sideways to tip it. Left
        and Right stir, Shift with them tips the glass, Enter or Space gives a
        brisk stir.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the same glass at the same place, its layers as bands, its
 * flutes as soft stripes, the rim and the foot as rings, and its shadow.
 */
function standIn(
  liquids: readonly string[],
  shares: readonly number[],
  fill: number,
  flutes: number,
): React.ReactNode {
  // In units of the glass height: its foot is 19% thick and the liquid fills
  // `fill` of what is above it, as the shader draws it.
  const base = 0.19;
  const room = 1 - base - 0.0336;
  const liquid = room * fill;
  const total = shares.reduce((a, b) => a + b, 0) || 1;
  const stops: string[] = [];
  let from = base;
  stops.push(
    `color-mix(in oklab, var(--ink-3) 18%, transparent) 0 ${pct(base)}`,
  );
  liquids.forEach((paint, i) => {
    const to = from + (liquid * (shares[i] ?? 1)) / total;
    stops.push(`${paint} ${pct(from)} ${pct(to)}`);
    from = to;
  });
  stops.push(
    `color-mix(in oklab, var(--ink-3) 10%, transparent) ${pct(from)} 100%`,
  );
  const stripe = Math.max(4, Math.round(1000 / (flutes / 2)) / 10);
  const seamAt = Math.round((stripe - 0.6) * 10) / 10;
  return (
    <>
      <span
        className="absolute rounded-[50%]"
        style={{
          left: "calc(50% - min(var(--hg) * 0.5, 50%))",
          top: "calc(50cqh + var(--hg) * 0.357)",
          width: "min(var(--hg), 100%)",
          height: "calc(var(--hg) * 0.269)",
          background:
            "radial-gradient(closest-side, oklch(0 0 0 / 0.2), transparent)",
        }}
      />
      <span
        className="absolute"
        style={{
          left: "calc(50% - var(--hg) * 0.42)",
          top: "calc(50cqh - var(--hg) * 0.5336)",
          width: "calc(var(--hg) * 0.84)",
          height: "var(--hg)",
          borderRadius:
            "0 0 50% 50% / 0 0 calc(var(--hg) * 0.084) calc(var(--hg) * 0.084)",
          backgroundImage: `repeating-linear-gradient(90deg, transparent 0 ${seamAt}%, color-mix(in oklab, var(--foreground) 22%, transparent) ${seamAt}% ${stripe}%), linear-gradient(90deg, oklch(1 0 0 / 0.16), transparent 30%, transparent 70%, oklch(0 0 0 / 0.12)), linear-gradient(to top, ${stops.join(", ")})`,
          boxShadow:
            "inset 0 0 0 1px color-mix(in oklab, var(--foreground) 24%, transparent)",
        }}
      />
      <span
        className="absolute rounded-[50%]"
        style={{
          left: "calc(50% - var(--hg) * 0.42)",
          top: "calc(50cqh - var(--hg) * 0.6176)",
          width: "calc(var(--hg) * 0.84)",
          height: "calc(var(--hg) * 0.168)",
          boxShadow:
            "inset 0 0 0 1.5px color-mix(in oklab, var(--foreground) 30%, transparent)",
        }}
      />
    </>
  );
}
