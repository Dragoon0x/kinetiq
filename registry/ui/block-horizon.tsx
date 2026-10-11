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
import { cascade, springs } from "@/registry/lib/motion";
import { project, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type BlockHorizonColors = "dusk" | "slate" | "sand";

export type BlockHorizonProps = {
  /** The content above the sea: a kicker, a figure, a call to action. */
  children?: React.ReactNode;
  /** Values the near rows stand up as a chart, oldest first; up to 64. @default 14 weeks of sessions */
  series?: readonly number[];
  /** What the series is, for assistive technology. @default "Weekly sessions" */
  seriesLabel?: string;
  /** A block's width in the nearest row, in px, 12 to 40; the whole sea scales with it. @default 18 */
  blockSize?: number;
  /** Height of the swell, 0 (a flat calm) to 1 (a heavy sea). @default 0.55 */
  swell?: number;
  /** The sun's height above the horizon, in degrees: low means long glints and deep shade. @default 12 */
  sunAngle?: number;
  /** Where the sun stands across the sky, in degrees from straight ahead (negative is left). @default -18 */
  sunAzimuth?: number;
  /** A named palette, or CSS colours in order: block, sunlit top, sky, horizon haze, chart, sun. @default "dusk" */
  colors?: BlockHorizonColors | readonly string[];
  /** How fast the sea moves, 0 (held) to 2. @default 1 */
  speed?: number;
  /** How small the world is, 0 (nearly flat) to 1 (a tight curve at the rim). @default 0.5 */
  curvature?: number;
  /** How many of the nearest rows stand up as the chart, 0 to 4. @default 2 */
  chartRows?: number;
  /** The tallest value's height, in blocks. @default 4.5 */
  chartHeight?: number;
  /** The swell's heading when you control it, in degrees; pair with `onValueChange`. */
  value?: number;
  /** The swell's heading to start from, in degrees: 0 rolls toward you from the horizon. @default 35 */
  defaultValue?: number;
  /** Fires from the drag or the key that turned the swell, with the new heading in whole degrees, 0 to 359. */
  onValueChange?: (degrees: number) => void;
  /** Dragging and keys turn the swell. @default true */
  interactive?: boolean;
  /** Hold the sea still; the swell can still be turned. @default false */
  paused?: boolean;
  /** Names the heading control for assistive technology. @default "Swell heading" */
  label?: string;
  /** Seeds the swells' phases and the second swell's crossing angle. @default 4 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Shows the sea but takes no input. @default false */
  disabled?: boolean;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Fourteen weeks of sessions, in thousands: a realistic, rising line. */
export const defaultBlockHorizonSeries = [
  18.2, 19.6, 21.4, 20.1, 22.8, 24.5, 23.9, 26.2, 27.8, 26.9, 28.4, 30.1, 29.2,
  31.4,
] as const;

/** Block, sunlit top, sky, horizon haze, chart, sun — mixed with the page so the sea sits in its theme. */
const PRESETS: Record<BlockHorizonColors, readonly string[]> = {
  dusk: [
    "color-mix(in oklab, var(--accent) 36%, var(--bg-2))",
    "oklch(0.86 0.09 70)",
    "color-mix(in oklab, var(--accent) 14%, var(--background))",
    "color-mix(in oklab, oklch(0.84 0.09 62) 42%, var(--background))",
    "var(--accent-bright)",
    "oklch(0.96 0.07 85)",
  ],
  slate: [
    "color-mix(in oklab, var(--ink-3) 42%, var(--bg-2))",
    "oklch(0.93 0.02 250)",
    "color-mix(in oklab, var(--ink-3) 10%, var(--background))",
    "color-mix(in oklab, var(--ink-3) 24%, var(--background))",
    "var(--accent-bright)",
    "oklch(0.98 0.01 250)",
  ],
  sand: [
    "color-mix(in oklab, oklch(0.72 0.07 70) 52%, var(--bg-2))",
    "oklch(0.93 0.07 85)",
    "color-mix(in oklab, oklch(0.8 0.06 60) 16%, var(--background))",
    "color-mix(in oklab, oklch(0.85 0.08 55) 48%, var(--background))",
    "oklch(0.62 0.13 38)",
    "oklch(0.96 0.08 80)",
  ],
};

function paletteOf(colors: BlockHorizonColors | readonly string[]) {
  if (typeof colors === "string") return PRESETS[colors] ?? PRESETS.dusk;
  const fallback = PRESETS.dusk;
  return fallback.map((c, i) => colors[i] ?? c);
}

const STEP = 1 / 120;
const DEG = Math.PI / 180;
/** The camera's vertical field of view. */
const FOV_Y = 24 * DEG;
/** The heading turns this many degrees per px of drag. */
const TURN = 0.35;
const KEY_STEP = 15;
const MAX_SERIES = 64;
const MAX_INSTANCES = 14000;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const mod = (v: number, m: number) => ((v % m) + m) % m;
const r1 = (v: number) => Math.round(v * 10) / 10;

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

const POINTS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

/** The heading in words: where the swell comes from. */
function describe(degrees: number): string {
  const d = mod(Math.round(degrees), 360);
  const from = POINTS[Math.round(d / 45) % 8] ?? "north";
  return `${d} degrees, swell from the ${from}`;
}

/** The props a scene must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='tab'],[contenteditable='true']";

const SKY = /* glsl */ `
${GLSL_SRGB}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform vec2 u_sunPos;
uniform float u_horizon;
uniform vec3 u_sky;
uniform vec3 u_haze;
uniform vec3 u_sun;

void main() {
  vec2 p = v_uv * u_res;
  float t = clamp(p.y / max(u_horizon, 1.0), 0.0, 1.0);
  vec3 c = mix(u_sky, u_haze, pow(t, 1.7));
  float d = length(p - u_sunPos);
  float r = u_res.y * 0.032;
  c += u_sun * (0.42 * exp(-d / (u_res.y * 0.22)) + 0.3 * exp(-d / (u_res.y * 0.06)));
  c = mix(c, u_sun, 1.0 - smoothstep(r - 1.0, r + 1.0, d));
  o_color = vec4(kx_linearToSrgb(clamp(c, 0.0, 1.0)), 1.0);
}
`;

const BLOCK_VERTEX = /* glsl */ `
in vec3 a_pos;
in vec3 a_normal;
in vec3 a_cell;
uniform mat4 u_vp;
uniform vec3 u_eye;
uniform float u_near;
uniform float u_radius;
uniform float u_time;
uniform vec4 u_swell;
uniform vec4 u_heading;
uniform vec2 u_phase;
uniform vec4 u_series[16];
uniform vec4 u_mix[16];
uniform vec4 u_chart;
out vec3 v_world;
out vec3 v_normal;
out vec3 v_face;
out float v_crest;
out float v_chart;

float sea(vec2 p) {
  float t = u_time;
  float a = sin(dot(p, u_heading.xy) * u_swell.y - t * 0.9 + u_phase.x);
  float b = sin(dot(p, u_heading.zw) * u_swell.z - t * 1.17 + u_phase.y);
  float chop = sin(p.x * 0.93 + p.y * 0.61 + t * 1.7) * sin(p.y * 0.82 - p.x * 0.33 - t * 1.31);
  return u_swell.x * (0.68 * a + 0.32 * b) + u_swell.w * chop;
}

void main() {
  float col = a_cell.x;
  float row = a_cell.y;
  float size = a_cell.z;
  vec2 xz = vec2(col + 0.5 * size, -(u_near + row + 0.5 * size));
  float s = sea(xz);
  float h = 1.2 + s;
  float chart = 0.0;
  int si = int(col - u_chart.x);
  if (row < u_chart.z) {
    // The near rows calm into the series: a chart that still breathes.
    if (si >= 0 && float(si) < u_chart.y) {
      float m = u_mix[si >> 2][si & 3];
      h = mix(h, u_series[si >> 2][si & 3] + 0.12 * s, m);
      // The latest value carries the full chart colour; the rest a tint of it.
      chart = m * (float(si) > u_chart.y - 1.5 ? 1.0 : 0.6);
    } else {
      h = mix(h, 0.5 + 0.12 * s, u_chart.w);
    }
  } else if (row < u_chart.z + 3.0) {
    float w = (1.0 - (row - u_chart.z + 1.0) / 4.0) * u_chart.w;
    h = mix(h, 0.8 + 0.4 * s, w);
  }
  // Feet only as deep as a trough can show; the nearest rows' fronts run
  // down past the frame's foot.
  float foot = row < 2.0 ? -12.0 : -3.0;
  float y = a_pos.y > 0.5 ? h : foot;
  // Columns stand flush: the camera looks straight down the line x = 0, and
  // any gap there would show the sky through every row.
  vec3 world = vec3(xz.x + a_pos.x * size, y, xz.y + a_pos.z * size);
  // The world is small: everything drops away with distance from the camera's foot.
  world.y -= (world.x * world.x + world.z * world.z) / (2.0 * u_radius);
  vec3 n = a_normal;
  if (a_normal.y > 0.5) {
    // A top tilts with the swell under it, so the glints run and sparkle.
    float dx = sea(xz + vec2(0.5, 0.0)) - sea(xz - vec2(0.5, 0.0));
    float dz = sea(xz + vec2(0.0, 0.5)) - sea(xz - vec2(0.0, 0.5));
    n = normalize(vec3(-dx * 0.5 * (1.0 - chart), 1.0, -dz * 0.5 * (1.0 - chart)));
    v_face = vec3(a_pos.x, a_pos.z, 1.0);
  } else {
    float across = abs(a_normal.x) > 0.5 ? a_pos.z : a_pos.x;
    v_face = vec3(across, (1.0 - a_pos.y) * (h - foot), 0.0);
  }
  v_crest = s / max(u_swell.x + u_swell.w, 0.05);
  v_chart = chart;
  v_world = world;
  v_normal = n;
  gl_Position = u_vp * vec4(world, 1.0);
}
`;

const BLOCK_FRAGMENT = /* glsl */ `
${GLSL_SRGB}
in vec3 v_world;
in vec3 v_normal;
in vec3 v_face;
in float v_crest;
in float v_chart;
out vec4 o_color;
uniform vec3 u_eye;
uniform vec3 u_sunDir;
uniform vec3 u_block;
uniform vec3 u_top;
uniform vec3 u_haze;
uniform vec3 u_chartCol;
uniform vec3 u_sun;
uniform float u_fog;

void main() {
  vec3 n = normalize(v_normal);
  vec3 base = mix(u_block, u_chartCol, v_chart * 0.85);
  float diff = max(dot(n, u_sunDir), 0.0);
  float crest = smoothstep(-1.0, 1.0, v_crest);
  vec3 c;
  if (v_face.z > 0.5) {
    // Tops: crests lit, troughs in shade, a lit lip on the sun's side, and
    // the glint path where a top mirrors the sun to the eye.
    float edge = max(abs(v_face.x), abs(v_face.y));
    float lit = mix(crest, 0.75, v_chart);
    c = base * (0.5 + 0.34 * lit) + u_top * diff * (0.12 + 0.42 * lit);
    // Each top's rim: a fine shadow line where blocks meet, a lit lip inside it.
    float rim = fwidth(edge) * 1.5 + 0.004;
    c = mix(c, u_top, smoothstep(0.4, 0.47, edge) * 0.2 * (0.4 + lit));
    c *= 1.0 - 0.35 * smoothstep(0.5 - rim, 0.5, edge);
    vec3 V = normalize(u_eye - v_world);
    vec3 H = normalize(V + u_sunDir);
    float spec = pow(max(dot(n, H), 0.0), 90.0);
    c += u_sun * spec * (0.7 + crest) * (1.0 - 0.6 * v_chart);
  } else {
    // Sides: lit by how they face the sun, darker the deeper they go.
    float ao = exp(-v_face.y * 0.55);
    c = base * (0.2 + 0.46 * diff + 0.2 * ao) * mix(0.5, 1.0, ao);
  }
  float f = 1.0 - exp(-length(v_world - u_eye) / u_fog);
  c = mix(c, u_haze, clamp(f * f, 0.0, 1.0));
  o_color = vec4(kx_linearToSrgb(clamp(c, 0.0, 1.0)), 1.0);
}
`;

/** One unit column: x and z across −½…½, y from its foot (0) to its top (1); the five faces a camera can see. */
function boxVertices(): Float32Array {
  const faces: [number[], number[], number[], number[], number[]][] = [
    // top
    [
      [0, 1, 0],
      [-0.5, 1, -0.5],
      [-0.5, 1, 0.5],
      [0.5, 1, 0.5],
      [0.5, 1, -0.5],
    ],
    // toward the camera
    [
      [0, 0, 1],
      [-0.5, 0, 0.5],
      [0.5, 0, 0.5],
      [0.5, 1, 0.5],
      [-0.5, 1, 0.5],
    ],
    // away
    [
      [0, 0, -1],
      [0.5, 0, -0.5],
      [-0.5, 0, -0.5],
      [-0.5, 1, -0.5],
      [0.5, 1, -0.5],
    ],
    // right
    [
      [1, 0, 0],
      [0.5, 0, 0.5],
      [0.5, 0, -0.5],
      [0.5, 1, -0.5],
      [0.5, 1, 0.5],
    ],
    // left
    [
      [-1, 0, 0],
      [-0.5, 0, -0.5],
      [-0.5, 0, 0.5],
      [-0.5, 1, 0.5],
      [-0.5, 1, -0.5],
    ],
  ];
  const out: number[] = [];
  for (const [n, a, b, c, d] of faces) {
    for (const p of [a, b, c, a, c, d]) out.push(...p, ...n);
  }
  return new Float32Array(out);
}

type Gpu = {
  gl: GLContext;
  sky: Program;
  tri: FullscreenTriangle;
  blocks: Program;
  vao: WebGLVertexArrayObject;
  box: WebGLBuffer;
  cells: WebGLBuffer;
  count: number;
  lost: boolean;
};

type View = {
  w: number;
  h: number;
  bw: number;
  bh: number;
  vp: Float32Array;
  eye: [number, number, number];
  near: number;
  radius: number;
  horizonY: number;
  sunX: number;
  sunY: number;
  sunDir: [number, number, number];
  fog: number;
  /** The leftmost column shown in the nearest row, for centring the chart. */
  span: number;
};

type Sim = {
  t: number;
  last: number;
  carry: number;
  heading: number;
  headingV: number;
  dragging: boolean;
  /** The chart: each column's height (blocks) and presence, eased. */
  height: Float32Array;
  heightV: Float32Array;
  presence: Float32Array;
  presenceV: Float32Array;
  /** When each column's rise may start, s on the sea's clock. */
  startAt: Float32Array;
  /** The chart's own clock, s: it runs while the loop does, sea or no sea. */
  clock: number;
  risen: boolean;
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
  arrive: () => void;
};

/** Column-major 4×4 product a·b. */
function multiply(a: Float32Array, b: Float32Array, out: Float32Array) {
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let s = 0;
      for (let k = 0; k < 4; k += 1)
        s += (a[k * 4 + r] ?? 0) * (b[c * 4 + k] ?? 0);
      out[c * 4 + r] = s;
    }
  }
}

/**
 * The camera for a box: the nearest row's blocks are `blockSize` px wide, the
 * near row sits at the foot of the frame and the horizon about a third of the
 * way down. The horizon's distance is set by `curvature` (a small world's is
 * close); the camera's height is what puts both rows where they belong, and
 * the world's radius is what puts the horizon at that distance.
 */
function solveView(
  w: number,
  h: number,
  blockSize: number,
  curvature: number,
  sunAngle: number,
  sunAzimuth: number,
) {
  const f = h / 2 / Math.tan(FOV_Y / 2);
  const near = clamp(f / blockSize, 6, 120);
  const below = Math.atan((0.38 * h) / f);
  const above = Math.atan((0.14 * h) / f);
  const gap = below + above;
  const reach = 7 + (4.2 - 7) * curvature;
  const horizonDist = reach * near;
  const D2 = horizonDist * horizonDist;
  const radiusAt = (H: number) => Math.max(1, (D2 - H * H) / (2 * H));
  // The sea's angle on screen from height H: the near row's depression less
  // the horizon's dip. It rises, peaks, then falls; take the rising side.
  const span = (H: number) => {
    const R = radiusAt(H);
    const drop = (near * near) / (2 * R);
    return (
      Math.atan((H - 1.2 + drop) / near) -
      Math.asin(Math.min(1, horizonDist / (R + H)))
    );
  };
  let peak = near * 0.1;
  let best = -Infinity;
  for (let i = 0; i <= 48; i += 1) {
    const H = near * (0.1 + (2.9 * i) / 48);
    const v = span(H);
    if (v > best) {
      best = v;
      peak = H;
    }
  }
  let lo = near * 0.1;
  let hi = peak;
  if (best > gap) {
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (span(mid) < gap) lo = mid;
      else hi = mid;
    }
  }
  const camH = best > gap ? (lo + hi) / 2 : peak;
  const radius = radiusAt(camH);
  const drop = (near * near) / (2 * radius);
  const pitch = Math.atan((camH - 1.2 + drop) / near) - below;
  const dip = Math.asin(Math.min(1, horizonDist / (radius + camH)));
  const horizonY = clamp(h / 2 + f * Math.tan(dip - pitch), 0, h);
  const far = horizonDist * 1.4 + 40;
  const aspect = w / h;
  const proj = new Float32Array(16);
  const t = 1 / Math.tan(FOV_Y / 2);
  proj[0] = t / aspect;
  proj[5] = t;
  proj[10] = (far + 0.3) / (0.3 - far);
  proj[11] = -1;
  proj[14] = (2 * far * 0.3) / (0.3 - far);
  const fy = -Math.sin(pitch);
  const fz = -Math.cos(pitch);
  const uy = Math.cos(pitch);
  const uz = -Math.sin(pitch);
  const eye: [number, number, number] = [0, camH, 0];
  const view = new Float32Array(16);
  view[0] = 1;
  view[5] = uy;
  view[6] = -fy;
  view[9] = uz;
  view[10] = -fz;
  view[13] = -(uy * camH);
  view[14] = fy * camH;
  view[15] = 1;
  const vp = new Float32Array(16);
  multiply(proj, view, vp);
  // The sun's height is measured from the horizon the viewer sees, which
  // dips below level on a small world.
  const e = dip + clamp(sunAngle, 1, 80) * 0.8 * DEG;
  const az = clamp(sunAzimuth, -80, 80) * DEG;
  const sunDir: [number, number, number] = [
    Math.sin(az) * Math.cos(e),
    Math.sin(e),
    -Math.cos(az) * Math.cos(e),
  ];
  // The sun's place on screen, from a point far along its direction.
  const sx = sunDir[0] * 1e4;
  const sy = camH + sunDir[1] * 1e4;
  const sz = sunDir[2] * 1e4;
  const cx =
    (vp[0] ?? 0) * sx + (vp[4] ?? 0) * sy + (vp[8] ?? 0) * sz + (vp[12] ?? 0);
  const cy =
    (vp[1] ?? 0) * sx + (vp[5] ?? 0) * sy + (vp[9] ?? 0) * sz + (vp[13] ?? 0);
  const cw =
    (vp[3] ?? 0) * sx + (vp[7] ?? 0) * sy + (vp[11] ?? 0) * sz + (vp[15] ?? 0);
  const sunX = cw > 0 ? ((cx / cw) * 0.5 + 0.5) * w : w / 2;
  const sunY = cw > 0 ? (0.5 - (cy / cw) * 0.5) * h : -h;
  const halfAcross = Math.tan(FOV_Y / 2) * aspect;
  return {
    vp,
    eye,
    near,
    radius,
    horizonY,
    sunX,
    sunY,
    sunDir,
    fog: horizonDist * 0.55,
    horizonDist,
    halfAcross,
    span: -Math.floor(near * halfAcross),
  };
}

/**
 * A curved horizon of square columns heaving in long swells under a low sun,
 * drawn with WebGL2 as instanced boxes. A low camera looks toward the
 * horizon; the small world's curvature drops the far rows below an arced
 * horizon. Two long-crested swells cross at a seeded angle with a light chop;
 * the tops catch the sun — a path of glints runs toward it — while the faces
 * toward the camera sit in shade, the troughs are darker than the crests, and
 * distance fades into the warm haze.
 *
 * Pass a series and the nearest rows calm into its shape: a bar chart standing
 * in the sea, still breathing a little, while the far sea rolls on. On first
 * sight each column rises out of the swell on the drift spring, staggered by
 * the house cascade; a new series glides each column to its new height.
 *
 * Drag sideways to turn the swell's heading 1:1; a throw is projected and the
 * heading glides there with the release velocity. It is a slider: Left and
 * Right turn it 15°, Page Up and Down 45°, Home brings it to 0°. Under
 * reduced motion the sea is still and the chart stands; the heading still
 * turns, drawn at once.
 */
export function BlockHorizon({
  children,
  series = defaultBlockHorizonSeries,
  seriesLabel = "Weekly sessions",
  blockSize = 18,
  swell = 0.55,
  sunAngle = 12,
  sunAzimuth = -18,
  colors = "dusk",
  speed = 1,
  curvature = 0.5,
  chartRows = 2,
  chartHeight = 4.5,
  value,
  defaultValue = 35,
  onValueChange,
  interactive = true,
  paused = false,
  label = "Swell heading",
  seed = 4,
  dpr = 2,
  disabled = false,
  className,
}: BlockHorizonProps) {
  const motionSafe = useMotionSafe();
  const describedBy = React.useId();
  const [own, setOwn] = React.useState(defaultValue);
  const heading = value ?? own;
  const paints = paletteOf(colors);
  const paintKey = paints.join("|");
  const values = series.slice(0, MAX_SERIES).filter((v) => Number.isFinite(v));
  const seriesKey = values.join(",");
  const top = Math.max(1e-6, ...values.map((v) => Math.abs(v)));

  const k = {
    blockSize: clamp(blockSize, 12, 40),
    swell: clamp01(swell),
    sunAngle: clamp(sunAngle, 1, 80),
    sunAzimuth: clamp(sunAzimuth, -80, 80),
    speed: clamp(speed, 0, 2),
    curvature: clamp01(curvature),
    rows: clamp(Math.round(chartRows), 0, 4),
    chartHeight: clamp(chartHeight, 1, 14),
    heading,
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
  const view = React.useRef<View | null>(null);
  const colour = React.useRef(new Float32Array(18));
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const seriesData = React.useRef(new Float32Array(MAX_SERIES));
  const mixData = React.useRef(new Float32Array(MAX_SERIES));
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const arrived = React.useRef(false);
  const shown = React.useRef(false);
  const dragFrom = React.useRef(0);
  const reported = React.useRef(mod(Math.round(heading), 360));
  const sim = React.useRef<Sim>({
    t: 0,
    last: 0,
    carry: 0,
    heading,
    headingV: 0,
    dragging: false,
    height: new Float32Array(MAX_SERIES),
    heightV: new Float32Array(MAX_SERIES),
    presence: new Float32Array(MAX_SERIES),
    presenceV: new Float32Array(MAX_SERIES),
    startAt: new Float32Array(MAX_SERIES),
    clock: 0,
    risen: false,
  });
  const latest = React.useRef({ values, top });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onValueChange);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  const sea = React.useMemo(() => {
    const rand = lcg(seed);
    return {
      phase1: rand() * Math.PI * 2,
      phase2: rand() * Math.PI * 2,
      cross: (32 + rand() * 18) * DEG,
    };
  }, [seed]);

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

  /** The camera, and the instances: each row only as wide as the view at its distance. */
  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    const w = r.width / r.dpr;
    const h = r.height / r.dpr;
    const solved = solveView(
      w,
      h,
      k.blockSize,
      k.curvature,
      k.sunAngle,
      k.sunAzimuth,
    );
    view.current = {
      w,
      h,
      bw: r.width,
      bh: r.height,
      vp: solved.vp,
      eye: solved.eye,
      near: solved.near,
      radius: solved.radius,
      horizonY: solved.horizonY,
      sunX: solved.sunX,
      sunY: solved.sunY,
      sunDir: solved.sunDir,
      fog: solved.fog,
      span: solved.span,
    };
    const cells: number[] = [];
    // Beyond the horizon the world has curved away: each row is only as
    // wide as the view at its depth and the disc the horizon bounds. Far off,
    // where a block is a few px, columns stand in twos and fours.
    const rows = Math.ceil(solved.horizonDist - solved.near + 4);
    const edge = solved.horizonDist + 2;
    let j = 0;
    while (j < rows && cells.length / 3 < MAX_INSTANCES) {
      const depth = solved.near + j;
      const size =
        depth < solved.near * 2 ? 1 : depth < solved.near * 4 ? 2 : 4;
      const mid = depth + size / 2;
      const inView = mid * solved.halfAcross * 1.04 + size;
      const onWorld = Math.sqrt(Math.max(0, edge * edge - mid * mid)) + size;
      const half = Math.ceil(Math.min(inView, onWorld) / size) * size;
      for (let i = -half; i < half; i += size) cells.push(i, j, size);
      j += size;
    }
    const { gl } = g;
    gl.bindBuffer(gl.ARRAY_BUFFER, g.cells);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cells), gl.STATIC_DRAW);
    g.count = Math.min(MAX_INSTANCES, cells.length / 3);
  };

  const draw = () => {
    const g = gpu.current;
    const v = view.current;
    if (!g || g.lost || !v || !visible.current) return;
    const { gl, sky, tri, blocks } = g;
    const s = sim.current;
    const c = colour.current;
    const { values: vals } = latest.current;
    gl.viewport(0, 0, v.bw, v.bh);
    gl.clearColor(c[6] ?? 0, c[7] ?? 0, c[8] ?? 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    sky.use();
    const us = sky.uniforms;
    gl.uniform2f(us.u_res ?? null, v.w, v.h);
    gl.uniform2f(us.u_sunPos ?? null, v.sunX, v.sunY);
    gl.uniform1f(us.u_horizon ?? null, v.horizonY);
    gl.uniform3f(us.u_sky ?? null, c[6] ?? 0, c[7] ?? 0, c[8] ?? 0);
    gl.uniform3f(us.u_haze ?? null, c[9] ?? 0, c[10] ?? 0, c[11] ?? 0);
    gl.uniform3f(us.u_sun ?? null, c[15] ?? 1, c[16] ?? 1, c[17] ?? 1);
    tri.draw();

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    blocks.use();
    const u = blocks.uniforms;
    const a = s.heading * DEG;
    const b = a + sea.cross;
    const amp = k.swell * 2.2;
    const sd = seriesData.current;
    const md = mixData.current;
    let presence = 0;
    for (let i = 0; i < vals.length; i += 1) {
      sd[i] = s.height[i] ?? 0;
      md[i] = s.presence[i] ?? 0;
      presence = Math.max(presence, md[i] ?? 0);
    }
    gl.uniformMatrix4fv(u.u_vp ?? null, false, v.vp);
    gl.uniform3f(u.u_eye ?? null, v.eye[0], v.eye[1], v.eye[2]);
    gl.uniform1f(u.u_near ?? null, v.near);
    gl.uniform1f(u.u_radius ?? null, v.radius);
    gl.uniform1f(u.u_time ?? null, s.t);
    gl.uniform4f(
      u.u_swell ?? null,
      amp,
      (Math.PI * 2) / 15,
      (Math.PI * 2) / 9,
      amp * 0.12,
    );
    // A swell from heading ψ travels toward (−sin ψ, cos ψ): 0 rolls in from the horizon.
    gl.uniform4f(
      u.u_heading ?? null,
      -Math.sin(a),
      Math.cos(a),
      -Math.sin(b),
      Math.cos(b),
    );
    gl.uniform2f(u.u_phase ?? null, sea.phase1, sea.phase2);
    gl.uniform4fv(u.u_series ?? null, sd);
    gl.uniform4fv(u.u_mix ?? null, md);
    gl.uniform4f(
      u.u_chart ?? null,
      -Math.floor(vals.length / 2),
      vals.length,
      vals.length ? k.rows : 0,
      presence,
    );
    gl.uniform3f(u.u_sunDir ?? null, v.sunDir[0], v.sunDir[1], v.sunDir[2]);
    gl.uniform3f(u.u_block ?? null, c[0] ?? 0, c[1] ?? 0, c[2] ?? 0);
    gl.uniform3f(u.u_top ?? null, c[3] ?? 1, c[4] ?? 1, c[5] ?? 1);
    gl.uniform3f(u.u_haze ?? null, c[9] ?? 0, c[10] ?? 0, c[11] ?? 0);
    gl.uniform3f(u.u_chartCol ?? null, c[12] ?? 0, c[13] ?? 0, c[14] ?? 1);
    gl.uniform3f(u.u_sun ?? null, c[15] ?? 1, c[16] ?? 1, c[17] ?? 1);
    gl.uniform1f(u.u_fog ?? null, v.fog);
    gl.bindVertexArray(g.vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 30, g.count);
    gl.bindVertexArray(null);
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Advances the sea, the heading and the chart's columns; says whether anything moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const { values: vals, top: peak } = latest.current;
    const n = vals.length;
    if (!k.motionSafe) {
      if (!s.dragging) {
        s.heading = k.heading;
        s.headingV = 0;
      }
      for (let i = 0; i < n; i += 1) {
        s.height[i] = (k.chartHeight * Math.abs(vals[i] ?? 0)) / peak;
        s.heightV[i] = 0;
        s.presence[i] = s.risen || arrived.current ? 1 : 0;
        s.presenceV[i] = 0;
      }
      return false;
    }
    const rolling = !k.paused && k.speed > 0 && k.swell > 0;
    if (rolling) s.t += dt * k.speed;
    const G = springs.glide;
    const D = springs.drift;
    s.carry += dt;
    let steps = 0;
    let settling = false;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      s.clock += STEP;
      if (!s.dragging) {
        // The heading glides to its value, carrying any throw it was given.
        let gap = s.heading - k.heading;
        gap -= 360 * Math.round(gap / 360);
        const ah = (-G.stiffness * gap - G.damping * s.headingV) / G.mass;
        s.headingV += ah * STEP;
        s.heading += s.headingV * STEP;
      }
      for (let i = 0; i < n; i += 1) {
        const target = (k.chartHeight * Math.abs(vals[i] ?? 0)) / peak;
        const ah =
          (-G.stiffness * ((s.height[i] ?? 0) - target) -
            G.damping * (s.heightV[i] ?? 0)) /
          G.mass;
        s.heightV[i] = (s.heightV[i] ?? 0) + ah * STEP;
        s.height[i] = (s.height[i] ?? 0) + (s.heightV[i] ?? 0) * STEP;
        // Each column rises out of the sea on the drift spring, in turn.
        const want = s.risen && s.clock >= (s.startAt[i] ?? 0) ? 1 : 0;
        const ap =
          (-D.stiffness * ((s.presence[i] ?? 0) - want) -
            D.damping * (s.presenceV[i] ?? 0)) /
          D.mass;
        s.presenceV[i] = (s.presenceV[i] ?? 0) + ap * STEP;
        s.presence[i] = (s.presence[i] ?? 0) + (s.presenceV[i] ?? 0) * STEP;
        if (
          Math.abs((s.height[i] ?? 0) - target) > 0.002 ||
          Math.abs((s.presence[i] ?? 0) - want) > 0.002 ||
          Math.abs(s.presenceV[i] ?? 0) > 0.01
        )
          settling = true;
      }
    }
    if (steps === 8) s.carry = 0;
    let gap = s.heading - k.heading;
    gap -= 360 * Math.round(gap / 360);
    const turning =
      !s.dragging && (Math.abs(gap) > 0.02 || Math.abs(s.headingV) > 0.05);
    if (!turning && !s.dragging) {
      s.heading = k.heading;
      s.headingV = 0;
    }
    return rolling || turning || settling || s.dragging;
  };

  const tick = (now: number) => {
    frame.current = 0;
    const s = sim.current;
    if (
      !visible.current ||
      document.hidden ||
      !gpu.current ||
      gpu.current.lost
    ) {
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

  /** The first sighting: the chart rises out of the sea, column by column. */
  const arrive = () => {
    if (arrived.current) return;
    arrived.current = true;
    const s = sim.current;
    const n = latest.current.values.length;
    const gapS = cascade(n);
    for (let i = 0; i < n; i += 1) s.startAt[i] = s.clock + i * gapS;
    s.risen = true;
    if (!k.motionSafe) advance(0);
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick, arrive };
    report.current = onValueChange;
    latest.current = { values, top };
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: false, antialias: true });
      if (!gl) return false;
      const sky = createProgram(gl, FULLSCREEN_VERTEX, SKY);
      const blocks = createProgram(gl, BLOCK_VERTEX, BLOCK_FRAGMENT);
      if (!sky || !blocks) {
        sky?.dispose();
        blocks?.dispose();
        return false;
      }
      const tri = createFullscreenTriangle(gl, sky);
      const vao = gl.createVertexArray();
      const box = gl.createBuffer();
      const cells = gl.createBuffer();
      if (!vao || !box || !cells) {
        tri.dispose();
        sky.dispose();
        blocks.dispose();
        return false;
      }
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, box);
      gl.bufferData(gl.ARRAY_BUFFER, boxVertices(), gl.STATIC_DRAW);
      const pos = blocks.attributes.a_pos;
      const normal = blocks.attributes.a_normal;
      const cell = blocks.attributes.a_cell;
      if (pos !== undefined && pos >= 0) {
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 24, 0);
      }
      if (normal !== undefined && normal >= 0) {
        gl.enableVertexAttribArray(normal);
        gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, cells);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(3), gl.STATIC_DRAW);
      if (cell !== undefined && cell >= 0) {
        gl.enableVertexAttribArray(cell);
        gl.vertexAttribPointer(cell, 3, gl.FLOAT, false, 12, 0);
        gl.vertexAttribDivisor(cell, 1);
      }
      gl.bindVertexArray(null);
      gl.depthFunc(gl.LEQUAL);
      // Every face winds counter-clockwise seen from outside: faces turned
      // away from the camera are never shaded.
      gl.cullFace(gl.BACK);
      gpu.current = {
        gl,
        sky,
        tri,
        blocks,
        vao,
        box,
        cells,
        count: 0,
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
        g.gl.deleteVertexArray(g.vao);
        g.gl.deleteBuffer(g.box);
        g.gl.deleteBuffer(g.cells);
        g.tri.dispose();
        g.sky.dispose();
        g.blocks.dispose();
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
    api.current?.kick();
  }, [k.dpr, k.blockSize, k.curvature, k.sunAngle, k.sunAzimuth]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [
    k.swell,
    k.speed,
    k.rows,
    k.chartHeight,
    k.heading,
    seriesKey,
    sea,
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
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
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

  /** A heading from the visitor, in whole degrees: held here unless the host holds it. */
  const commit = (next: number) => {
    const whole = mod(Math.round(next), 360);
    if (value === undefined) setOwn(next);
    if (whole !== reported.current) {
      reported.current = whole;
      report.current?.(whole);
    }
  };

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: !k.enabled,
    onStart: () => {
      const s = sim.current;
      s.dragging = true;
      s.headingV = 0;
      dragFrom.current = s.heading;
      kick();
    },
    onMove: ({ offset }) => {
      const s = sim.current;
      // 1:1 under the hand: the heading is where the drag puts it.
      s.heading = dragFrom.current + offset.x * TURN;
      if (!k.motionSafe) api.current?.draw();
      kick();
    },
    onEnd: ({ velocity }) => {
      const s = sim.current;
      s.dragging = false;
      const v = velocity.x * TURN;
      const landing = k.motionSafe ? project(s.heading, v, 0.996) : s.heading;
      s.headingV = k.motionSafe ? v : 0;
      commit(landing);
      kick();
    },
    onCancel: () => {
      sim.current.dragging = false;
      kick();
    },
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!k.enabled) return;
    const steps: Record<string, number> = {
      ArrowRight: KEY_STEP,
      ArrowUp: KEY_STEP,
      ArrowLeft: -KEY_STEP,
      ArrowDown: -KEY_STEP,
      PageUp: 45,
      PageDown: -45,
    };
    const by = steps[event.key];
    if (by !== undefined) {
      event.preventDefault();
      commit(heading + by);
      kick();
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      // The short way round to north.
      commit(heading - 360 * Math.round(heading / 360));
      kick();
    }
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 0;
  const spoken = values.length
    ? `${seriesLabel}: ${values.map((v) => r1(v)).join(", ")}. Lowest ${r1(low)}, highest ${r1(high)}.`
    : "";

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
        "group/block-horizon relative isolate h-full w-full overflow-clip",
        k.enabled
          ? "cursor-grab touch-pan-y active:cursor-grabbing"
          : "touch-auto",
        className,
      )}
    >
      <StandIn paints={paints} values={values} rows={k.rows} />
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
        {paints.map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <div
        role="slider"
        tabIndex={k.enabled ? 0 : -1}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={mod(Math.round(heading), 360)}
        aria-valuetext={describe(heading)}
        aria-describedby={describedBy}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
        className="absolute inset-0 z-0 size-full rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={describedBy} className="sr-only">
        {spoken} Drag sideways or use the arrow keys to turn the swell.
      </p>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the sky's gradient, the sea under an arced horizon, and the
 * series standing as bars along the foot.
 */
function StandIn({
  paints,
  values,
  rows,
}: {
  paints: readonly string[];
  values: readonly number[];
  rows: number;
}) {
  const peak = Math.max(1e-6, ...values.map((v) => Math.abs(v)));
  const [block, , sky, haze, chart] = paints;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-300 group-data-live/block-horizon:invisible group-data-live/block-horizon:opacity-0"
      style={{
        // The sea is the top of a great ellipse whose crown sits a third of
        // the way down: the horizon's arc.
        backgroundImage: `radial-gradient(ellipse 160% 200% at 50% 234%, color-mix(in oklab, ${block} 70%, ${haze}) 0 99.6%, transparent 100%), linear-gradient(to bottom, ${sky}, ${haze} 34%)`,
      }}
    >
      {rows > 0 && values.length ? (
        <span className="absolute inset-x-[12%] bottom-[6%] flex h-[42%] items-end gap-[2px]">
          {values.map((v, i) => (
            <span
              key={i}
              className="min-w-0 flex-1 rounded-t-[2px]"
              style={{
                height: `${Math.round((Math.abs(v) / peak) * 1000) / 10}%`,
                background: `color-mix(in oklab, ${chart} 80%, ${block})`,
              }}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}
