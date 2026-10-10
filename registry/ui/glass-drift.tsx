"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  bindScreen,
  createFramebuffer,
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  onContextLoss,
  resizeGL,
  type Framebuffer,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type GlassDriftPalette = "lagoon" | "dawn" | "orchid" | "mono";

export type GlassDriftProps = {
  /** The content on top of the glass: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many shards float over the colour, 3 to 40. @default 14 */
  count?: number;
  /** How strongly each shard bends and splits what is behind it, 0 to 1. @default 0.5 */
  refraction?: number;
  /** A named palette, or your own CSS colours: the wash, then up to three blooms. @default "lagoon" */
  palette?: GlassDriftPalette | readonly string[];
  /** A shard's size, as a share of the box's shorter side (0.15 to 1). @default 0.5 */
  size?: number;
  /** How far the shards tilt in depth, 0 (flat to you) to 1. @default 0.5 */
  depth?: number;
  /** How fast the colour and the glass drift, 0 (held) to 3. @default 1 */
  speed?: number;
  /** How much the glass tints what it shows, 0 (clear) to 1 (frosted). @default 0.35 */
  tint?: number;
  /** How bright the shards' edges catch the light, 0 to 1. @default 0.7 */
  edge?: number;
  /** The pointer and keyboard focus part the shards. @default true */
  interactive?: boolean;
  /** How far the pointer pushes the shards aside, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** A press on the glass (not on a control) puffs the shards outward from it. @default true */
  pulse?: boolean;
  /** The shards float up out of the colour the first time it comes into view. @default true */
  intro?: boolean;
  /** Hold the drift still; the pointer can still part the shards. @default false */
  paused?: boolean;
  /** Seeds the cut of every shard and where it floats. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) parting the shards. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * The wash and three blooms. Each pigment is mixed into the page in oklab, so
 * the field is pastel on a light page and deep on a dark one, hue intact.
 */
const PALETTES: Record<
  GlassDriftPalette,
  readonly [string, string, string, string]
> = {
  lagoon: [
    "color-mix(in oklab, oklch(0.76 0.07 215) 32%, var(--background))",
    "color-mix(in oklab, oklch(0.72 0.12 200) 70%, var(--background))",
    "color-mix(in oklab, oklch(0.6 0.15 262) 66%, var(--background))",
    "color-mix(in oklab, oklch(0.8 0.1 165) 62%, var(--background))",
  ],
  dawn: [
    "color-mix(in oklab, oklch(0.86 0.05 60) 36%, var(--background))",
    "color-mix(in oklab, oklch(0.78 0.11 45) 70%, var(--background))",
    "color-mix(in oklab, oklch(0.7 0.13 12) 62%, var(--background))",
    "color-mix(in oklab, oklch(0.88 0.09 90) 66%, var(--background))",
  ],
  orchid: [
    "color-mix(in oklab, oklch(0.76 0.05 310) 32%, var(--background))",
    "color-mix(in oklab, oklch(0.66 0.15 305) 66%, var(--background))",
    "color-mix(in oklab, oklch(0.62 0.15 265) 62%, var(--background))",
    "color-mix(in oklab, oklch(0.78 0.1 350) 60%, var(--background))",
  ],
  mono: [
    "color-mix(in oklab, var(--ink-3) 14%, var(--background))",
    "color-mix(in oklab, var(--accent) 46%, var(--background))",
    "color-mix(in oklab, var(--ink-3) 42%, var(--background))",
    "color-mix(in oklab, var(--accent-bright) 30%, var(--background))",
  ],
};

/** The glass itself, its lit rim, its shaded rim and the shadow it casts. */
const GLASS = [
  "color-mix(in oklab, var(--background) 30%, white)",
  "color-mix(in oklab, white 88%, var(--background))",
  "color-mix(in oklab, var(--background) 62%, black)",
  "color-mix(in oklab, var(--background) 40%, black)",
] as const;

function paletteOf(
  palette: GlassDriftPalette | readonly string[],
): readonly [string, string, string, string] {
  if (typeof palette === "string")
    return PALETTES[palette as GlassDriftPalette] ?? PALETTES.lagoon;
  const wash = palette[0] ?? PALETTES.lagoon[0];
  const a = palette[1] ?? wash;
  return [wash, a, palette[2] ?? a, palette[3] ?? palette[2] ?? a];
}

/** Fixed physics step: the springs integrate at 120 Hz whatever the display does. */
const STEP = 1 / 120;
/** A press throws the nearest shards outward at up to this speed, px/s. */
const PUFF = 640;
/** The keyboard's puff is a softer one than a press. */
const FOCUS_PULSE = 0.55;
const MAX_CORNERS = 6;
/** Floats per vertex: position (2), distance to the rim (1), offset from the centre (2). */
const STRIDE = 5;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** A small seeded generator: the same glass for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The cut of every shard and how it floats: fixed for a count and a seed. */
type Plan = {
  n: number;
  corners: Uint8Array;
  /** Unit polygon corners, MAX_CORNERS per shard. */
  lx: Float32Array;
  ly: Float32Array;
  /** Home, as fractions of the box. */
  hx: Float32Array;
  hy: Float32Array;
  /** Depth, 0 far to 1 near. */
  z: Float32Array;
  scale: Float32Array;
  /** Wander: reach and rate across and down, and their phases. */
  wa: Float32Array;
  wb: Float32Array;
  fa: Float32Array;
  fb: Float32Array;
  pa: Float32Array;
  pb: Float32Array;
  /** Turn: starting angle and rate, rad and rad/s. */
  rz: Float32Array;
  rzv: Float32Array;
  /** Tilt rate and phase. */
  tf: Float32Array;
  tp: Float32Array;
  /** Far shards first, so near ones lie over them. */
  order: Uint8Array;
};

function planShards(count: number, seed: number): Plan {
  const n = clamp(Math.round(count), 3, 40);
  const rand = lcg(seed * 7 + 3);
  const f = () => new Float32Array(n);
  const plan: Plan = {
    n,
    corners: new Uint8Array(n),
    lx: new Float32Array(n * MAX_CORNERS),
    ly: new Float32Array(n * MAX_CORNERS),
    hx: f(),
    hy: f(),
    z: f(),
    scale: f(),
    wa: f(),
    wb: f(),
    fa: f(),
    fb: f(),
    pa: f(),
    pb: f(),
    rz: f(),
    rzv: f(),
    tf: f(),
    tp: f(),
    order: new Uint8Array(n),
  };
  // Halton points (bases 2 and 3), offset by the seed: evenly spread in both
  // directions however few shards there are, never clumped into columns.
  const skip = Math.floor(rand() * 24);
  const halton = (index: number, base: number) => {
    let step = 1;
    let r = 0;
    let i = index;
    while (i > 0) {
      step /= base;
      r += step * (i % base);
      i = Math.floor(i / base);
    }
    return r;
  };
  for (let i = 0; i < n; i += 1) {
    plan.hx[i] = 0.06 + 0.88 * halton(i + 1 + skip, 2);
    plan.hy[i] = 0.1 + 0.8 * halton(i + 1 + skip, 3);
    const z = rand();
    plan.z[i] = z;
    // A shard: three to six corners round a stretched circle, gaps uneven,
    // so it reads as broken glass rather than a polygon.
    const k = 3 + Math.floor(rand() * 4);
    plan.corners[i] = k;
    const stretch = 1 + rand() * 0.9;
    const turn = rand() * Math.PI;
    const gaps: number[] = [];
    let total = 0;
    for (let c = 0; c < k; c += 1) {
      const g = 0.55 + rand() * 0.9;
      gaps.push(g);
      total += g;
    }
    let a = rand() * Math.PI * 2;
    let far = 0;
    const px: number[] = [];
    const py: number[] = [];
    for (let c = 0; c < k; c += 1) {
      const r = 0.62 + rand() * 0.38;
      const x = Math.cos(a) * r * stretch;
      const y = Math.sin(a) * r;
      const rx = x * Math.cos(turn) - y * Math.sin(turn);
      const ry = x * Math.sin(turn) + y * Math.cos(turn);
      px.push(rx);
      py.push(ry);
      far = Math.max(far, Math.hypot(rx, ry));
      a += ((gaps[c] ?? 1) / total) * Math.PI * 2;
    }
    for (let c = 0; c < k; c += 1) {
      plan.lx[i * MAX_CORNERS + c] = (px[c] ?? 0) / far;
      plan.ly[i * MAX_CORNERS + c] = (py[c] ?? 0) / far;
    }
    plan.scale[i] = (0.45 + rand() * 0.55) * (0.7 + 0.3 * z);
    plan.wa[i] = 0.5 + rand() * 0.5;
    plan.wb[i] = 0.5 + rand() * 0.5;
    plan.fa[i] = 0.05 + rand() * 0.06;
    plan.fb[i] = 0.04 + rand() * 0.06;
    plan.pa[i] = rand() * Math.PI * 2;
    plan.pb[i] = rand() * Math.PI * 2;
    plan.rz[i] = rand() * Math.PI * 2;
    plan.rzv[i] = (rand() - 0.5) * 0.16;
    plan.tf[i] = 0.08 + rand() * 0.1;
    plan.tp[i] = rand() * Math.PI * 2;
  }
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (plan.z[a] ?? 0) - (plan.z[b] ?? 0),
  );
  order.forEach((v, i) => (plan.order[i] = v));
  return plan;
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FIELD = /* glsl */ `
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform vec3 u_wash;
uniform vec3 u_c1;
uniform vec3 u_c2;
uniform vec3 u_c3;
uniform vec4 u_blob[4];

void main() {
  vec2 p = v_uv * u_res;
  vec3 acc = u_wash * 0.5;
  float sum = 0.5;
  for (int i = 0; i < 4; i++) {
    vec4 b = u_blob[i];
    float d = length(p - b.xy) / b.z;
    // A flat-topped bloom with a soft but definite edge: something for the
    // glass to bend.
    float g = exp(-pow(d, 3.0) * 1.6) * 1.6;
    vec3 c = b.w < 0.5 ? u_c1 : (b.w < 1.5 ? u_c2 : u_c3);
    acc += c * g;
    sum += g;
  }
  o_color = vec4(acc / sum, 1.0);
}
`;

const BLIT = /* glsl */ `
in vec2 v_uv;
out vec4 o_color;
uniform sampler2D u_field;

float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec3 c = texture(u_field, vec2(v_uv.x, 1.0 - v_uv.y)).rgb;
  vec2 q = v_uv - 0.5;
  c *= 1.0 - dot(q, q) * 0.16;
  c += (grain(gl_FragCoord.xy) - 0.5) * (2.5 / 255.0);
  o_color = vec4(c, 1.0);
}
`;

const SHARD_VERTEX = /* glsl */ `
in vec2 a_pos;
in float a_edge;
in vec2 a_local;
uniform vec2 u_res;
uniform vec2 u_offset;
out float v_edge;
out vec2 v_local;
out vec2 v_px;

void main() {
  v_edge = a_edge;
  v_local = a_local;
  v_px = a_pos;
  vec2 clip = (a_pos + u_offset) / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const SHARD = /* glsl */ `
in float v_edge;
in vec2 v_local;
in vec2 v_px;
out vec4 o_color;
uniform sampler2D u_field;
uniform vec2 u_res;
uniform float u_dpr;
uniform vec2 u_centre;
uniform vec3 u_normal;
uniform float u_radius;
uniform float u_refr;
uniform float u_tint;
uniform float u_edge;
uniform float u_alpha;
uniform float u_mode;
uniform vec3 u_glass;
uniform vec3 u_hi;
uniform vec3 u_lo;
uniform vec3 u_shadow;

vec3 field(vec2 px) {
  vec2 uv = clamp(px / u_res, 0.0, 1.0);
  return texture(u_field, vec2(uv.x, 1.0 - uv.y)).rgb;
}

void main() {
  // Distance to the rim in device pixels: the fan's edge value is linear
  // from the rim (0) to the centre (1).
  float e = v_edge / max(fwidth(v_edge), 1e-5);
  if (u_mode > 0.5) {
    // The shadow: soft from the rim inward.
    float a = smoothstep(0.0, 0.4, v_edge) * u_alpha;
    o_color = vec4(u_shadow * a, a);
    return;
  }
  vec2 out2 = normalize(v_local + vec2(1e-4, 0.0));
  float bevelPx = (4.0 + 0.06 * u_radius) * u_dpr;
  float bevel = 1.0 - smoothstep(0.0, bevelPx, e);
  // The lens: what is behind, magnified about the shard's centre, shifted by
  // its tilt and bent hard across the bevel.
  vec2 at = u_centre + (v_px - u_centre) * (1.0 - 0.42 * u_refr)
    - u_normal.xy * u_refr * 0.9 * u_radius
    + out2 * bevel * bevel * u_refr * 0.22 * u_radius;
  // Dispersion: the channels part a little along the bevel.
  vec2 split = out2 * (0.6 + 2.6 * bevel) * u_refr * 3.0;
  vec3 c = vec3(field(at - split).r, field(at).g, field(at + split).b);
  c = mix(c, u_glass, u_tint * 0.36);
  float fres = pow(1.0 - clamp(abs(u_normal.z), 0.0, 1.0), 1.4);
  c = mix(c, u_hi, fres * 0.3 + 0.02);
  // The rim: lit on the side that faces the light, shaded on the far side,
  // with a fainter line where the bevel meets the face.
  vec2 light = normalize(vec2(-0.55, -0.85));
  float facing = dot(out2, light);
  float rim = 1.0 - smoothstep(0.5, 1.7 * u_dpr, e);
  float seam = (1.0 - smoothstep(0.0, 1.1 * u_dpr, abs(e - bevelPx))) * 0.35;
  c = mix(c, u_hi, (rim + seam) * u_edge * smoothstep(-0.25, 0.85, facing));
  c = mix(c, u_lo, rim * u_edge * 0.7 * smoothstep(0.25, -0.85, facing));
  o_color = vec4(c, 1.0) * u_alpha;
}
`;

type Gpu = {
  gl: GLContext;
  field: Program;
  blit: Program;
  shard: Program;
  fieldTri: FullscreenTriangle;
  blitTri: FullscreenTriangle;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  fbo: Framebuffer | null;
  lost: boolean;
};

type Sim = {
  t: number;
  last: number;
  carry: number;
  rise: number;
  riseV: number;
  riseTo: number;
  tx: number;
  ty: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  on: boolean;
  level: number;
  levelV: number;
  source: "pointer" | "focus" | null;
  focus: { x: number; y: number } | null;
};

/** Per-shard motion: the parting offset and puff spin on their springs, and this frame's pose. */
type Phys = {
  n: number;
  ox: Float32Array;
  oy: Float32Array;
  ovx: Float32Array;
  ovy: Float32Array;
  spin: Float32Array;
  spinV: Float32Array;
  cx: Float32Array;
  cy: Float32Array;
  nx: Float32Array;
  ny: Float32Array;
  nz: Float32Array;
  radius: Float32Array;
  verts: Float32Array;
};

function physOf(n: number): Phys {
  const f = () => new Float32Array(n);
  return {
    n,
    ox: f(),
    oy: f(),
    ovx: f(),
    ovy: f(),
    spin: f(),
    spinV: f(),
    cx: f(),
    cy: f(),
    nx: f(),
    ny: f(),
    nz: f(),
    radius: f(),
    verts: new Float32Array(n * MAX_CORNERS * 3 * STRIDE),
  };
}

/** Stands in until the first effect sizes the motion state to the shards. */
const NO_PHYS = physOf(0);

type Size = { w: number; h: number; bw: number; bh: number; dpr: number };

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readPalette: () => void;
  tick: (now: number) => void;
  arrive: () => void;
};

/**
 * Glass shards drifting through soft colour, as a background, with the
 * content on top in its own layer. A wash and four slow blooms make the
 * field; over it float seeded shards in shallow 3D, each wandering, tilting
 * and turning on its own, drawn far to near. Each refracts the field behind
 * it — magnified, shifted by its tilt, bent hard across a bevel at its rim,
 * the colours parting a little there — tints it toward glass, brightens as
 * it turns edge-on and carries a crisp rim, lit on the side toward the light
 * and shaded on the other, with a soft shadow under it.
 *
 * The pointer parts the shards (each moves aside on springs.glide and
 * drifts back on springs.drift when the pointer goes), and a press puffs
 * them outward with a little spin before the drift spring brings them home.
 * It is decoration: `aria-hidden`, never a focus stop, never in the way of a
 * click; keyboard focus on a control inside parts the glass around it and
 * puffs gently. WebGL2, drawn only while on screen, in a visible page and
 * while something moves; without WebGL2 a CSS composition of the same
 * blooms and shards stands in. Under reduced motion the glass holds still
 * and the pointer parts it directly, with no springs.
 */
export function GlassDrift({
  children,
  count = 14,
  refraction = 0.5,
  palette = "lagoon",
  size = 0.5,
  depth = 0.5,
  speed = 1,
  tint = 0.35,
  edge = 0.7,
  interactive = true,
  pointerStrength = 0.6,
  pulse = true,
  intro = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: GlassDriftProps) {
  const motionSafe = useMotionSafe();
  const paints = [...paletteOf(palette), ...GLASS] as const;
  const paintKey = paints.join("|");
  const n = clamp(Math.round(count), 3, 40);
  const plan = React.useMemo(() => planShards(n, seed), [n, seed]);

  const k = {
    refraction: clamp01(refraction),
    size: clamp(size, 0.15, 1),
    depth: clamp01(depth),
    speed: clamp(speed, 0, 3),
    tint: clamp01(tint),
    edge: clamp01(edge),
    strength: clamp01(pointerStrength),
    pulse,
    intro,
    paused,
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const box = React.useRef<Size | null>(null);
  const colour = React.useRef(new Float32Array(24));
  const blobs = React.useRef(new Float32Array(16));
  const phys = React.useRef<Phys>(NO_PHYS);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const arrived = React.useRef(false);
  const active = React.useRef(false);
  /** The canvas has painted, and the stand-in has been told to go. */
  const shown = React.useRef(false);
  const sim = React.useRef<Sim>({
    t: 0,
    last: 0,
    carry: 0,
    rise: 1,
    riseV: 0,
    riseTo: 1,
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    on: false,
    level: 0,
    levelV: 0,
    source: null,
    focus: null,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onActiveChange);
  /** Every frame goes through the latest render's tick, never a stale one. */
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /** Each CSS colour as sRGB floats, read back from its carrier by painting one pixel. */
  const readPalette = () => {
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
    for (let i = 0; i < 8; i += 1) {
      const span = spans[i];
      if (!span) continue;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[i * 3] = (d[0] ?? 0) / 255;
      out[i * 3 + 1] = (d[1] ?? 0) / 255;
      out[i * 3 + 2] = (d[2] ?? 0) / 255;
    }
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    box.current = {
      w: r.width / r.dpr,
      h: r.height / r.dpr,
      bw: r.width,
      bh: r.height,
      dpr: r.dpr,
    };
    // The field is soft, so half resolution is plenty to refract.
    const fw = Math.max(1, Math.ceil(r.width / 2));
    const fh = Math.max(1, Math.ceil(r.height / 2));
    if (!g.fbo || g.fbo.width !== fw || g.fbo.height !== fh) {
      g.fbo?.dispose();
      g.fbo = createFramebuffer(g.gl, fw, fh);
    }
  };

  /** Where every shard is this frame, and its corners into the vertex array. */
  const pose = () => {
    const sz = box.current;
    if (!sz) return;
    const p = phys.current;
    const s = sim.current;
    const t = s.t;
    const minSide = Math.min(sz.w, sz.h);
    const focal = 2.2 * Math.max(sz.w, sz.h);
    const tilt = k.depth * 0.85;
    const rise = s.rise;
    let o = 0;
    for (let j = 0; j < plan.n; j += 1) {
      const i = plan.order[j] ?? j;
      const z = plan.z[i] ?? 0;
      const radius =
        k.size * minSide * 0.62 * (plan.scale[i] ?? 1) * (0.82 + 0.18 * rise);
      const reach = minSide * 0.07;
      const cx =
        (plan.hx[i] ?? 0.5) * sz.w +
        Math.sin(t * (plan.fa[i] ?? 0) + (plan.pa[i] ?? 0)) *
          reach *
          (plan.wa[i] ?? 1) +
        (p.ox[i] ?? 0);
      const cy =
        (plan.hy[i] ?? 0.5) * sz.h +
        Math.cos(t * (plan.fb[i] ?? 0) + (plan.pb[i] ?? 0)) *
          reach *
          (plan.wb[i] ?? 1) +
        (p.oy[i] ?? 0) +
        (1 - rise) * minSide * 0.12 * (1 - z);
      const rz = (plan.rz[i] ?? 0) + t * (plan.rzv[i] ?? 0) + (p.spin[i] ?? 0);
      const rx = tilt * Math.sin(t * (plan.tf[i] ?? 0) + (plan.tp[i] ?? 0));
      const ry =
        tilt * Math.cos(t * (plan.tf[i] ?? 0) * 0.8 + (plan.tp[i] ?? 0) * 1.7);
      const cz = Math.cos(rz);
      const sn = Math.sin(rz);
      const cxr = Math.cos(rx);
      const sxr = Math.sin(rx);
      const cyr = Math.cos(ry);
      const syr = Math.sin(ry);
      p.cx[i] = cx;
      p.cy[i] = cy;
      p.radius[i] = radius;
      p.nx[i] = cxr * syr;
      p.ny[i] = -sxr;
      p.nz[i] = cxr * cyr;
      const k0 = plan.corners[i] ?? 3;
      const v = p.verts;
      for (let c = 0; c < k0; c += 1) {
        for (let e = 0; e < 2; e += 1) {
          const ci = (c + e) % k0;
          const lx = plan.lx[i * MAX_CORNERS + ci] ?? 0;
          const ly = plan.ly[i * MAX_CORNERS + ci] ?? 0;
          // In the plane, turned; then tilted about x and y; then seen in
          // a mild perspective.
          const x = (lx * cz - ly * sn) * radius;
          const y = (lx * sn + ly * cz) * radius;
          const y1 = y * cxr;
          const z1 = y * sxr;
          const x2 = x * cyr + z1 * syr;
          const z2 = -x * syr + z1 * cyr;
          const persp = focal / (focal - z2);
          const sx = cx + x2 * persp;
          const sy = cy + y1 * persp;
          if (e === 0) {
            v[o] = cx;
            v[o + 1] = cy;
            v[o + 2] = 1;
            v[o + 3] = 0;
            v[o + 4] = 0;
            o += STRIDE;
          }
          v[o] = sx;
          v[o + 1] = sy;
          v[o + 2] = 0;
          v[o + 3] = sx - cx;
          v[o + 4] = sy - cy;
          o += STRIDE;
        }
      }
    }
  };

  /** One frame, from the sim as it stands. Uniforms go straight to their locations: nothing is allocated. */
  const draw = () => {
    const g = gpu.current;
    const sz = box.current;
    if (!g || g.lost || !sz || !g.fbo || !visible.current) return;
    const { gl } = g;
    const s = sim.current;
    const pal = colour.current;
    const p = phys.current;
    if (p.n !== plan.n) return;
    pose();

    // The field, at half resolution.
    const t = s.t;
    const b = blobs.current;
    const big = Math.max(sz.w, sz.h);
    for (let i = 0; i < 4; i += 1) {
      const ph = (k.seed % 13) * 0.7 + i * 2.1;
      b[i * 4] = sz.w * (0.5 + 0.38 * Math.sin(t * 0.11 * (1 + i * 0.17) + ph));
      b[i * 4 + 1] =
        sz.h * (0.5 + 0.36 * Math.cos(t * 0.09 * (1 + i * 0.23) + ph * 1.3));
      b[i * 4 + 2] = big * (0.17 + 0.035 * i);
      b[i * 4 + 3] = i % 3;
    }
    g.fbo.bind();
    let u = g.field.uniforms;
    g.field.use();
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform3f(u.u_wash ?? null, pal[0] ?? 0, pal[1] ?? 0, pal[2] ?? 0);
    gl.uniform3f(u.u_c1 ?? null, pal[3] ?? 0, pal[4] ?? 0, pal[5] ?? 0);
    gl.uniform3f(u.u_c2 ?? null, pal[6] ?? 0, pal[7] ?? 0, pal[8] ?? 0);
    gl.uniform3f(u.u_c3 ?? null, pal[9] ?? 0, pal[10] ?? 0, pal[11] ?? 0);
    gl.uniform4fv(u.u_blob ?? null, b);
    g.fieldTri.draw();

    // The field on screen.
    bindScreen(gl);
    u = g.blit.uniforms;
    g.blit.use();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.fbo.texture);
    gl.uniform1i(u.u_field ?? null, 0);
    g.blitTri.draw();

    // The shards, far to near, each a fan: its shadow, then its glass.
    gl.bindBuffer(gl.ARRAY_BUFFER, g.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, p.verts);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    u = g.shard.uniforms;
    g.shard.use();
    gl.bindVertexArray(g.vao);
    gl.uniform1i(u.u_field ?? null, 0);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_dpr ?? null, sz.dpr);
    gl.uniform1f(u.u_refr ?? null, k.refraction);
    gl.uniform1f(u.u_tint ?? null, k.tint);
    gl.uniform3f(u.u_glass ?? null, pal[12] ?? 1, pal[13] ?? 1, pal[14] ?? 1);
    gl.uniform3f(u.u_hi ?? null, pal[15] ?? 1, pal[16] ?? 1, pal[17] ?? 1);
    gl.uniform3f(u.u_lo ?? null, pal[18] ?? 0, pal[19] ?? 0, pal[20] ?? 0);
    gl.uniform3f(u.u_shadow ?? null, pal[21] ?? 0, pal[22] ?? 0, pal[23] ?? 0);
    let first = 0;
    for (let j = 0; j < plan.n; j += 1) {
      const i = plan.order[j] ?? j;
      const z = plan.z[i] ?? 0;
      const verts = (plan.corners[i] ?? 3) * 3;
      const radius = p.radius[i] ?? 1;
      gl.uniform2f(u.u_centre ?? null, p.cx[i] ?? 0, p.cy[i] ?? 0);
      gl.uniform3f(
        u.u_normal ?? null,
        p.nx[i] ?? 0,
        p.ny[i] ?? 0,
        p.nz[i] ?? 1,
      );
      gl.uniform1f(u.u_radius ?? null, radius);
      // Nearer glass casts its shadow further and shows its rim brighter.
      gl.uniform1f(u.u_mode ?? null, 1);
      gl.uniform2f(
        u.u_offset ?? null,
        (3 + 7 * z) * k.depth + 2,
        (5 + 10 * z) * k.depth + 3,
      );
      gl.uniform1f(u.u_alpha ?? null, 0.12 * (0.6 + 0.4 * z) * s.rise);
      gl.drawArrays(gl.TRIANGLES, first, verts);
      gl.uniform1f(u.u_mode ?? null, 0);
      gl.uniform2f(u.u_offset ?? null, 0, 0);
      gl.uniform1f(u.u_edge ?? null, k.edge * (0.65 + 0.35 * z));
      gl.uniform1f(u.u_alpha ?? null, s.rise);
      gl.drawArrays(gl.TRIANGLES, first, verts);
      first += verts;
    }
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Where the hand pushes shard i to, given where the shard floats. */
  const parting = (i: number, out: { x: number; y: number }) => {
    const sz = box.current;
    const s = sim.current;
    out.x = 0;
    out.y = 0;
    if (!sz || s.level < 0.001) return;
    const p = phys.current;
    const reach = clamp(Math.min(sz.w, sz.h) * 0.6, 90, 280);
    const dx = (p.cx[i] ?? 0) - (p.ox[i] ?? 0) - s.x;
    const dy = (p.cy[i] ?? 0) - (p.oy[i] ?? 0) - s.y;
    const d = Math.hypot(dx, dy) || 1;
    const push =
      k.strength * s.level * reach * 0.6 * Math.exp(-(d * d) / (reach * reach));
    out.x = (dx / d) * push;
    out.y = (dy / d) * push;
  };

  const aim = { x: 0, y: 0 };

  /** Advances the drift and the springs by dt; says whether anything still moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const p = phys.current;
    const target = s.on ? 1 : 0;
    if (!k.motionSafe) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = 0;
      s.vy = 0;
      s.level = target;
      s.levelV = 0;
      s.rise = 1;
      s.riseV = 0;
      // The glass stands exactly where the hand puts it: no springs.
      p.ox.fill(0);
      p.oy.fill(0);
      pose();
      for (let i = 0; i < p.n; i += 1) {
        parting(i, aim);
        p.ox[i] = aim.x;
        p.oy[i] = aim.y;
        p.ovx[i] = 0;
        p.ovy[i] = 0;
        p.spin[i] = 0;
        p.spinV[i] = 0;
      }
      return false;
    }
    const drifting = !k.paused && k.speed > 0;
    if (drifting) s.t += dt * k.speed;
    const G = springs.glide;
    const D = springs.drift;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      const ax = (-G.stiffness * (s.x - s.tx) - G.damping * s.vx) / G.mass;
      const ay = (-G.stiffness * (s.y - s.ty) - G.damping * s.vy) / G.mass;
      s.vx += ax * STEP;
      s.vy += ay * STEP;
      s.x += s.vx * STEP;
      s.y += s.vy * STEP;
      const al =
        (-D.stiffness * (s.level - target) - D.damping * s.levelV) / D.mass;
      s.levelV += al * STEP;
      s.level += s.levelV * STEP;
      const ar =
        (-D.stiffness * (s.rise - s.riseTo) - D.damping * s.riseV) / D.mass;
      s.riseV += ar * STEP;
      s.rise += s.riseV * STEP;
    }
    if (steps === 8) s.carry = 0;
    // Each shard's offset: glide aside while the hand is there, drift home
    // when it has gone; the puff's spin unwinds on the drift spring too.
    pose();
    const S = s.level > 0.5 ? G : D;
    let settling = false;
    for (let i = 0; i < p.n; i += 1) {
      parting(i, aim);
      let ox = p.ox[i] ?? 0;
      let oy = p.oy[i] ?? 0;
      let vx = p.ovx[i] ?? 0;
      let vy = p.ovy[i] ?? 0;
      let spin = p.spin[i] ?? 0;
      let spinV = p.spinV[i] ?? 0;
      for (let q = 0; q < steps; q += 1) {
        vx += ((-S.stiffness * (ox - aim.x) - S.damping * vx) / S.mass) * STEP;
        vy += ((-S.stiffness * (oy - aim.y) - S.damping * vy) / S.mass) * STEP;
        spinV += ((-D.stiffness * spin - D.damping * spinV) / D.mass) * STEP;
        ox += vx * STEP;
        oy += vy * STEP;
        spin += spinV * STEP;
      }
      p.ox[i] = ox;
      p.oy[i] = oy;
      p.ovx[i] = vx;
      p.ovy[i] = vy;
      p.spin[i] = spin;
      p.spinV[i] = spinV;
      const off =
        Math.abs(ox - aim.x) +
        Math.abs(oy - aim.y) +
        Math.abs(vx) * 0.02 +
        Math.abs(vy) * 0.02 +
        Math.abs(spin) * 40 +
        Math.abs(spinV) * 4;
      if (off > 0.05) settling = true;
    }
    const handMoving =
      Math.abs(s.x - s.tx) + Math.abs(s.y - s.ty) > 0.05 ||
      Math.abs(s.vx) + Math.abs(s.vy) > 0.5;
    if (!handMoving) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = 0;
      s.vy = 0;
    }
    const levelMoving =
      Math.abs(s.level - target) > 0.002 || Math.abs(s.levelV) > 0.01;
    if (!levelMoving) {
      s.level = target;
      s.levelV = 0;
    }
    const rising =
      Math.abs(s.rise - s.riseTo) > 0.001 || Math.abs(s.riseV) > 0.005;
    if (!rising) {
      s.rise = s.riseTo;
      s.riseV = 0;
    }
    return (
      drifting ||
      settling ||
      (handMoving && s.level > 0.001) ||
      levelMoving ||
      rising
    );
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    const g = gpu.current;
    if (!visible.current || document.hidden || !g || g.lost) {
      s.last = 0;
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.last) / 1000) : 1 / 60;
    s.last = now;
    const moving = advance(dt);
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** The first sighting: the shards float up out of the colour. */
  const arrive = () => {
    if (arrived.current) return;
    arrived.current = true;
    const s = sim.current;
    if (k.intro && k.motionSafe) {
      s.rise = 0;
      s.riseV = 0;
    }
    s.riseTo = 1;
    kick();
  };

  /** A puff from (x, y): the nearest shards thrown outward with a little spin. */
  const puff = (x: number, y: number, strength: number) => {
    if (!k.pulse || !k.motionSafe) return;
    const sz = box.current;
    if (!sz) return;
    const p = phys.current;
    const reach = clamp(Math.min(sz.w, sz.h) * 0.8, 110, 340);
    for (let i = 0; i < p.n; i += 1) {
      const dx = (p.cx[i] ?? 0) - x;
      const dy = (p.cy[i] ?? 0) - y;
      const d = Math.hypot(dx, dy) || 1;
      const j = PUFF * strength * Math.exp(-d / reach);
      p.ovx[i] = (p.ovx[i] ?? 0) + (dx / d) * j;
      p.ovy[i] = (p.ovy[i] ?? 0) + (dy / d) * j;
      // The spin follows the side the puff struck: clockwise to the right.
      p.spinV[i] = (p.spinV[i] ?? 0) + (dx >= 0 ? 1 : -1) * j * 0.004;
    }
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readPalette, tick, arrive };
    report.current = onActiveChange;
  });

  // New shards get fresh motion state, sized to them.
  React.useEffect(() => {
    phys.current = physOf(plan.n);
    api.current?.draw();
    api.current?.kick();
  }, [plan]);

  // The GPU side, bound to the canvas: built, rebuilt after a lost context,
  // torn down with the component. StrictMode's second run builds again on
  // the same context, which the browser hands back unchanged.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      // Multisampling keeps the shards' cut edges clean.
      const gl = createGL(canvas, { alpha: false, antialias: true });
      if (!gl) return false;
      const field = createProgram(gl, FULLSCREEN_VERTEX, FIELD);
      const blit = createProgram(gl, FULLSCREEN_VERTEX, BLIT);
      const shard = createProgram(gl, SHARD_VERTEX, SHARD);
      const vao = gl.createVertexArray();
      const buffer = gl.createBuffer();
      if (!field || !blit || !shard || !vao || !buffer) {
        field?.dispose();
        blit?.dispose();
        shard?.dispose();
        return false;
      }
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        40 * MAX_CORNERS * 3 * STRIDE * 4,
        gl.DYNAMIC_DRAW,
      );
      const bytes = STRIDE * 4;
      const attr = (name: string, size: number, offset: number) => {
        const at = shard.attributes[name];
        if (at === undefined || at < 0) return;
        gl.enableVertexAttribArray(at);
        gl.vertexAttribPointer(at, size, gl.FLOAT, false, bytes, offset * 4);
      };
      attr("a_pos", 2, 0);
      attr("a_edge", 1, 2);
      attr("a_local", 2, 3);
      gl.bindVertexArray(null);
      gpu.current = {
        gl,
        field,
        blit,
        shard,
        fieldTri: createFullscreenTriangle(gl, field),
        blitTri: createFullscreenTriangle(gl, blit),
        vao,
        buffer,
        fbo: null,
        lost: false,
      };
      api.current?.readPalette();
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
        g.fieldTri.dispose();
        g.blitTri.dispose();
        g.field.dispose();
        g.blit.dispose();
        g.shard.dispose();
        g.gl.deleteVertexArray(g.vao);
        g.gl.deleteBuffer(g.buffer);
      }
    };
  }, []);

  React.useEffect(() => {
    api.current?.readPalette();
    api.current?.draw();
  }, [paintKey]);

  React.useEffect(() => {
    api.current?.resize();
    api.current?.draw();
  }, [k.dpr]);

  // Anything that changes the picture: draw it, and run if it now moves.
  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [
    k.refraction,
    k.size,
    k.depth,
    k.speed,
    k.tint,
    k.edge,
    k.strength,
    k.seed,
    paused,
    motionSafe,
  ]);

  // Switching the hand off lets the glass drift home, and says so.
  React.useEffect(() => {
    if (interactive) return;
    const s = sim.current;
    s.on = false;
    s.source = null;
    s.focus = null;
    api.current?.kick();
    if (active.current) {
      active.current = false;
      report.current?.(false);
    }
  }, [interactive]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
    };
  }, []);

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
      api.current?.arrive();
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

  const setActive = (next: boolean) => {
    if (active.current === next) return;
    active.current = next;
    report.current?.(next);
  };

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  /** The hand goes to (x, y); arriving from nowhere, it starts there. */
  const handTo = (x: number, y: number, source: "pointer" | "focus") => {
    const s = sim.current;
    if (s.level < 0.01 || !k.motionSafe) {
      s.x = x;
      s.y = y;
      s.vx = 0;
      s.vy = 0;
    }
    s.tx = x;
    s.ty = y;
    s.on = true;
    s.source = source;
    setActive(true);
    if (!k.motionSafe) api.current?.draw();
    kick();
  };

  /** The pointer leaves: the glass parts round a focused control, or drifts home. */
  const handAway = () => {
    const s = sim.current;
    if (s.focus) {
      handTo(s.focus.x, s.focus.y, "focus");
      return;
    }
    s.on = false;
    s.source = null;
    setActive(false);
    kick();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "touch" && event.buttons === 0) return;
    const at = local(event.clientX, event.clientY);
    handTo(at.x, at.y, "pointer");
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const at = local(event.clientX, event.clientY);
    handTo(at.x, at.y, "pointer");
    const target = event.target instanceof Element ? event.target : null;
    const hit = target?.closest(INTERACTIVE);
    if (!hit || !rootRef.current?.contains(hit)) puff(at.x, at.y, 1);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") handAway();
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" && sim.current.source === "pointer")
      handAway();
  };

  // Keyboard focus on a control inside is a hand at that control.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    const root = rootRef.current;
    if (!root || !(el instanceof Element) || !el.matches(":focus-visible"))
      return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    sim.current.focus = at;
    handTo(at.x, at.y, "focus");
    puff(at.x, at.y, FOCUS_PULSE);
  };

  const onBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && rootRef.current?.contains(next)) return;
    const s = sim.current;
    s.focus = null;
    if (s.source === "focus") handAway();
  };

  const onColour = () => {
    api.current?.readPalette();
    api.current?.draw();
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
        "group/glass-drift relative isolate h-full w-full touch-manipulation overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/glass-drift:invisible group-data-live/glass-drift:opacity-0"
        style={fieldStandIn(paints, k.seed)}
      >
        {standInShards(plan, k.size).map((shard, i) => (
          <div
            key={i}
            className="absolute aspect-square -translate-1/2 backdrop-blur-[2px]"
            style={shard}
          />
        ))}
      </div>
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColour}
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

/** The still field for the server render and browsers without WebGL2: the wash and three blooms. */
function fieldStandIn(
  paints: readonly string[],
  seed: number,
): React.CSSProperties {
  const spots = [0, 1, 2, 3].map((i) => {
    const ph = (seed % 13) * 0.7 + i * 2.1;
    return {
      x: Math.round((0.5 + 0.38 * Math.sin(ph)) * 100),
      y: Math.round((0.5 + 0.36 * Math.cos(ph * 1.3)) * 100),
      c: paints[1 + (i % 3)] ?? paints[0],
    };
  });
  return {
    backgroundColor: paints[0],
    backgroundImage: spots
      .map(
        (s) =>
          `radial-gradient(ellipse 46% 70% at ${s.x}% ${s.y}%, ${s.c} 0%, color-mix(in oklab, ${s.c} 55%, transparent) 45%, transparent 75%)`,
      )
      .join(", "),
  };
}

/** The still shards: the same cut and resting places, as clipped panes of frosted white. */
function standInShards(plan: Plan, size: number): React.CSSProperties[] {
  const out: React.CSSProperties[] = [];
  for (let j = 0; j < plan.n; j += 1) {
    const i = plan.order[j] ?? j;
    const k = plan.corners[i] ?? 3;
    const pts: string[] = [];
    for (let c = 0; c < k; c += 1) {
      const x = round2(((plan.lx[i * MAX_CORNERS + c] ?? 0) * 0.5 + 0.5) * 100);
      const y = round2(((plan.ly[i * MAX_CORNERS + c] ?? 0) * 0.5 + 0.5) * 100);
      pts.push(`${x}% ${y}%`);
    }
    const share = round2(size * (plan.scale[i] ?? 1) * 26);
    const z = plan.z[i] ?? 0;
    out.push({
      left: `${round2((plan.hx[i] ?? 0.5) * 100)}%`,
      top: `${round2((plan.hy[i] ?? 0.5) * 100)}%`,
      width: `clamp(32px, ${share}%, ${Math.round(share * 9)}px)`,
      clipPath: `polygon(${pts.join(", ")})`,
      backgroundImage: `linear-gradient(140deg, color-mix(in oklab, white ${Math.round(30 + 16 * z)}%, transparent), color-mix(in oklab, white 6%, transparent) 62%)`,
    });
  }
  return out;
}
