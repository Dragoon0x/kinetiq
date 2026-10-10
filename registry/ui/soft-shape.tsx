"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  FULLSCREEN_VERTEX,
  createFullscreenTriangle,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type UniformValue,
} from "@/registry/lib/glsl";
import { durations, springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type SoftShapeKind = "circle" | "square" | "triangle";
export type SoftShapeSet = "mixed" | "circles" | "squares" | "triangles";
export type SoftShapePalette = "cobalt" | "dusk" | "ember" | "moss";

export type SoftShapeProps = {
  /** Content laid over the shapes, such as a headline. It keeps every click, focus and key. */
  children?: React.ReactNode;
  /** Which primitives make up the composition: a named set, or your own list used in turn. @default "mixed" */
  shapes?: SoftShapeSet | readonly SoftShapeKind[];
  /** The widest the edges soften right under the pointer, in px; away from it they stay crisp. @default 28 */
  softness?: number;
  /** The pigment palette: a named set, or your own CSS colours given to the shapes in turn. @default "cobalt" */
  color?: SoftShapePalette | readonly string[];
  /** How many shapes, 2 to 8. @default 6 */
  count?: number;
  /** Shape size relative to the room each one has, 0.5 to 1.5. @default 1 */
  scale?: number;
  /** Corner rounding of the squares and triangles, 0 (sharp) to 1 (pebble). @default 0.3 */
  roundness?: number;
  /** How far apart two shapes start to flow together near the pointer, in px (the smooth minimum's reach). @default 44 */
  melt?: number;
  /** How far the pointer's pull and its soft focus reach, in px. @default 160 */
  radius?: number;
  /** How strongly nearby shapes lean toward the pointer, 0 to 1. @default 0.5 */
  pull?: number;
  /** A fine printed grain inside the soft edges, 0 to 1, so the blur never bands. @default 0.4 */
  grain?: number;
  /** With nobody pointing, a slow soft spot wanders the composition and the shapes bob. @default true */
  ambient?: boolean;
  /** Pressing gathers every shape into one soft mass; releasing scatters them home on springs.recoil. @default true */
  gather?: boolean;
  /** Follow the pointer. @default true */
  interactive?: boolean;
  /** Keyboard focus on a control inside draws the shapes and the soft spot to it. @default true */
  followFocus?: boolean;
  /** Hold the composition still and stop the frame loop. @default false */
  paused?: boolean;
  /** Seed for the layout, the kinds, the colours and the tilts. @default 7 */
  seed?: number;
  /** The highest device pixel ratio the canvas draws at (never above 2). @default 2 */
  dpr?: number;
  /** Fires when a press (or Enter/Space on a control inside) gathers the shapes, and again when they scatter. */
  onGatherChange?: (gathered: boolean) => void;
  /** Classes for the box. Give it a height; children are laid out inside it. */
  className?: string;
};

const PALETTES: Record<SoftShapePalette, readonly string[]> = {
  cobalt: [
    "oklch(from var(--accent-bright) 0.6 0.17 h)",
    "oklch(from var(--accent-bright) 0.8 0.09 h)",
    "oklch(from var(--signal) 0.82 0.12 h)",
  ],
  dusk: [
    "oklch(from var(--accent-bright) 0.6 0.15 295)",
    "oklch(from var(--danger) 0.74 0.13 h)",
    "oklch(from var(--warn) 0.86 0.11 h)",
  ],
  ember: [
    "oklch(from var(--danger) 0.63 0.19 h)",
    "oklch(from var(--warn) 0.8 0.15 h)",
    "oklch(from var(--warn) 0.91 0.07 h)",
  ],
  moss: [
    "oklch(from var(--success) 0.56 0.1 h)",
    "oklch(from var(--signal) 0.8 0.1 h)",
    "oklch(from var(--warn) 0.88 0.08 h)",
  ],
};

const SETS: Record<SoftShapeSet, readonly SoftShapeKind[]> = {
  mixed: ["circle", "square", "triangle"],
  circles: ["circle"],
  squares: ["square"],
  triangles: ["triangle"],
};

const KIND_INDEX: Record<SoftShapeKind, 0 | 1 | 2> = {
  circle: 0,
  square: 1,
  triangle: 2,
};

const MAX = 8;
/** The layout switches from two staggered rows to one zigzag row here (35rem). */
const WIDE = 560;
/** Each shape's share of its cell, as a half-extent. */
const CELL = 0.36;
/** The still's SVG box, in shape units: wide enough for a triangle's corners. */
const BOX = 1.4;
const SQRT3 = Math.sqrt(3);

const FRAGMENT = /* glsl */ `
uniform vec2 u_res;
uniform vec4 u_shape[${MAX}];
uniform vec4 u_kind[${MAX}];
uniform int u_count;
uniform vec3 u_focus;
uniform float u_radius;
uniform float u_soft;
uniform float u_melt;
uniform float u_round;
uniform float u_grain;
uniform float u_px;
in vec2 v_uv;
out vec4 o_color;

float boxDistance(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// An equilateral triangle of half-side r, centroid at the origin, apex on +y.
float triangleDistance(vec2 p, float r) {
  p.x = abs(p.x) - r;
  p.y = p.y + r / 1.7320508;
  if (p.x + 1.7320508 * p.y > 0.0) {
    p = vec2(p.x - 1.7320508 * p.y, -1.7320508 * p.x - p.y) * 0.5;
  }
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

float shapeDistance(vec2 p, vec4 s, float kind) {
  vec2 d = p - s.xy;
  float c = cos(s.w);
  float n = sin(s.w);
  // Into the shape's own frame: the inverse of a clockwise screen turn.
  vec2 l = vec2(c * d.x + n * d.y, -n * d.x + c * d.y);
  float size = s.z;
  if (kind < 0.5) return length(l) - size;
  if (kind < 1.5) {
    float b = size * 0.86;
    float rr = u_round * b * 0.6;
    return boxDistance(l, vec2(b - rr)) - rr;
  }
  // Rounding keeps the flat sides where they were and only eases the corners.
  float rr = u_round * size * 0.42;
  // Screen y runs down; the apex should point up.
  return triangleDistance(vec2(l.x, -l.y), size * 1.12 - rr * 1.7320508) - rr;
}

float grainHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 p = v_uv * u_res;
  float fd = length(p - u_focus.xy);
  float r = max(u_radius, 1.0);
  float prox = u_focus.z * exp(-(fd * fd) / (r * r) * 1.4);
  // The smooth minimum reaches further near the pointer: shapes there flow
  // together through a neck, shapes far from it only meet edge to edge.
  float k = max(u_melt * (0.22 + 0.78 * prox), 0.001);
  float d = 1e5;
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${MAX}; i += 1) {
    if (i >= u_count) break;
    vec4 kd = u_kind[i];
    float di = shapeDistance(p, u_shape[i], kd.x);
    if (i == 0) {
      d = di;
      col = kd.yzw;
    } else {
      float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0);
      d = mix(di, d, h) - k * h * (1.0 - h);
      // The colours blend across the neck by the same weight.
      col = mix(kd.yzw, col, h);
    }
  }
  float feather = max(u_px, u_soft * prox);
  float a = clamp(0.5 - d / feather, 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a);
  // A fixed grain, only inside a soft gradient: ink on paper, never banding.
  float soft = smoothstep(2.0, 10.0, feather);
  float g = (grainHash(floor(gl_FragCoord.xy)) - 0.5) * u_grain * 0.4;
  a = clamp(a + g * 4.0 * a * (1.0 - a) * soft, 0.0, 1.0);
  o_color = vec4(col * a, a);
}
`;

type Home = {
  fx: number;
  fy: number;
  s: number;
  angle: number;
  kind: 0 | 1 | 2;
  tone: number;
};

type Layout = {
  rows: 1 | 2;
  cols: number;
  homes: Home[];
  /** Where the reduced-motion soft spot rests: between the closest pair. */
  rest: [number, number];
};

type Body = {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  a: number;
  va: number;
  ha: number;
  s: number;
  kind: number;
  tone: number;
  near: number;
  phase: number;
  rate: number;
};

type Rgb = [number, number, number];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Number(v.toFixed(3));

const hash = (i: number, seed: number) => {
  let h = (Math.imul(i + 1, 374761393) + Math.imul(seed, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * The composition, in fractions of the box: one zigzag row on a wide box, two
 * staggered rows on a narrow one. Pure and seeded, so the server's still and
 * the canvas place every shape in the same spot.
 */
function compose(
  count: number,
  kinds: readonly SoftShapeKind[],
  tones: number,
  seed: number,
  rows: 1 | 2,
): Layout {
  const n = clamp(Math.round(count), 2, MAX);
  const r = n <= 3 ? 1 : rows;
  const cols = r === 1 ? n : Math.ceil(n / 2);
  const homes: Home[] = [];
  const kindOffset = Math.floor(hash(91, seed) * kinds.length);
  let tone = Math.floor(hash(57, seed) * Math.max(1, tones));
  for (let i = 0; i < n; i += 1) {
    const kindName = kinds[(i + kindOffset) % kinds.length] ?? "circle";
    const kind = KIND_INDEX[kindName];
    if (i > 0 && tones > 1) {
      tone =
        (tone + 1 + Math.floor(hash(i * 7 + 3, seed) * (tones - 1))) % tones;
    }
    const jx = hash(i * 7 + 1, seed) - 0.5;
    const jy = hash(i * 7 + 2, seed) - 0.5;
    let fx: number;
    let fy: number;
    if (r === 1) {
      fx = (i + 0.5 + jx * 0.26) / n;
      fy = 0.5 + (i % 2 === 0 ? -1 : 1) * (0.13 + 0.05 * (jy + 0.5));
    } else {
      const row = i < cols ? 0 : 1;
      const c = row === 0 ? i : i - cols;
      const inRow = row === 0 ? cols : n - cols;
      const stagger = row === 0 ? -0.16 : 0.16;
      fx = (c + 0.5 + (cols - inRow) / 2 + stagger + jx * 0.16) / cols;
      fy = 0.28 + row * 0.44 + jy * 0.06;
    }
    const tilt = hash(i * 7 + 4, seed) - 0.5;
    homes.push({
      fx: r3(fx),
      fy: r3(fy),
      s: r3(0.8 + 0.26 * hash(i * 7 + 5, seed)),
      angle: kind === 0 ? 0 : r3(tilt * (kind === 1 ? 40 : 30)),
      kind,
      tone,
    });
  }
  // The closest pair on a box of this layout's typical shape.
  const aspect = r === 1 ? 3 : 1.2;
  let best = Infinity;
  let rest: [number, number] = [0.5, 0.5];
  for (let i = 0; i < homes.length; i += 1) {
    for (let j = i + 1; j < homes.length; j += 1) {
      const a = homes[i];
      const b = homes[j];
      if (!a || !b) continue;
      const d = Math.hypot((a.fx - b.fx) * aspect, a.fy - b.fy);
      if (d < best) {
        best = d;
        rest = [r3((a.fx + b.fx) / 2), r3((a.fy + b.fy) / 2)];
      }
    }
  }
  return { rows: r, cols, homes, rest };
}

/** The rounded triangle as an SVG path, in shape units (half-side 1.12, apex up). */
function trianglePath(roundness: number): string {
  const rr = roundness * 0.42;
  const t = 1.12 - rr * SQRT3;
  const v = [
    [0, (-2 * t) / SQRT3],
    [t, t / SQRT3],
    [-t, t / SQRT3],
  ] as const;
  const normal = (a: readonly number[], b: readonly number[]) => {
    const dx = (b[0] ?? 0) - (a[0] ?? 0);
    const dy = (b[1] ?? 0) - (a[1] ?? 0);
    const len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len] as const;
  };
  const f = (x: number, y: number) => `${r3(x)} ${r3(y)}`;
  const parts: string[] = [];
  for (let k = 0; k < 3; k += 1) {
    const a = v[k];
    const b = v[(k + 1) % 3];
    const c = v[(k + 2) % 3];
    if (!a || !b || !c) continue;
    const n1 = normal(a, b);
    const n2 = normal(b, c);
    if (k === 0) parts.push(`M ${f(a[0] + n1[0] * rr, a[1] + n1[1] * rr)}`);
    parts.push(`L ${f(b[0] + n1[0] * rr, b[1] + n1[1] * rr)}`);
    if (rr > 0.001) {
      parts.push(
        `A ${r3(rr)} ${r3(rr)} 0 0 1 ${f(b[0] + n2[0] * rr, b[1] + n2[1] * rr)}`,
      );
    }
  }
  parts.push("Z");
  return parts.join(" ");
}

/** One semi-implicit spring step; returns the new velocity. */
function springStep(
  pos: number,
  vel: number,
  target: number,
  spring: { stiffness: number; damping: number; mass: number },
  dt: number,
): number {
  return (
    vel +
    ((spring.stiffness * (target - pos) - spring.damping * vel) / spring.mass) *
      dt
  );
}

function StillShape({
  home,
  unit,
  scale,
  roundness,
  fill,
}: {
  home: Home;
  unit: string;
  scale: number;
  roundness: number;
  fill: string;
}) {
  const span = r3(2 * BOX * home.s * scale);
  const b = 0.86;
  const rr = roundness * b * 0.6;
  return (
    <svg
      viewBox={`${-BOX} ${-BOX} ${2 * BOX} ${2 * BOX}`}
      className="absolute overflow-visible"
      style={{
        left: `${r3(home.fx * 100)}%`,
        top: `${r3(home.fy * 100)}%`,
        width: `calc(${unit} * ${span})`,
        height: `calc(${unit} * ${span})`,
        transform: `translate(-50%, -50%) rotate(${home.angle}deg)`,
      }}
    >
      {home.kind === 0 ? (
        <circle r={1} style={{ fill }} />
      ) : home.kind === 1 ? (
        <rect
          x={-b}
          y={-b}
          width={2 * b}
          height={2 * b}
          rx={r3(rr)}
          style={{ fill }}
        />
      ) : (
        <path d={trianglePath(roundness)} style={{ fill }} />
      )}
    </svg>
  );
}

/**
 * Flat pigment shapes — circles, rounded squares and rounded triangles —
 * drawn as signed-distance fields in one WebGL2 pass behind the content,
 * joined by a polynomial smooth minimum whose reach grows near the pointer.
 * As the pointer draws two shapes together (each leans toward it on a
 * springs.glide spring and goes home on springs.drift), they flow into one
 * mass through a neck and their colours blend across it, while every edge
 * softens into a grained gradient near the pointer and stays crisp away from
 * it. Pressing gathers the whole composition into one soft mass under the
 * pointer; releasing scatters it home on springs.recoil.
 *
 * Keyboard focus on a control inside draws the shapes and the soft spot to
 * it, and Enter or Space on it pulses a gather. Without WebGL2, or after a
 * lost context, the server-rendered still of the same shapes stays. Under
 * reduced motion it is one still frame with a soft neck between the two
 * closest shapes; the soft spot jumps to the pointer and nothing travels.
 */
export function SoftShape({
  children,
  shapes = "mixed",
  softness = 28,
  color = "cobalt",
  count = 6,
  scale = 1,
  roundness = 0.3,
  melt = 44,
  radius = 160,
  pull = 0.5,
  grain = 0.4,
  ambient = true,
  gather = true,
  interactive = true,
  followFocus = true,
  paused = false,
  seed = 7,
  dpr = 2,
  onGatherChange,
  className,
}: SoftShapeProps) {
  const motionSafe = useMotionSafe();
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const probeRef = React.useRef<HTMLSpanElement | null>(null);
  const [ready, setReady] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const api = React.useRef<{
    recolour: () => void;
    relayout: () => void;
    wake: () => void;
  } | null>(null);

  const kinds: readonly SoftShapeKind[] =
    typeof shapes === "string"
      ? (SETS[shapes as SoftShapeSet] ?? SETS.mixed)
      : shapes.length > 0
        ? shapes
        : SETS.mixed;
  const palette: readonly string[] =
    typeof color === "string"
      ? (PALETTES[color as SoftShapePalette] ?? PALETTES.cobalt)
      : color.length > 0
        ? color
        : PALETTES.cobalt;
  const n = clamp(Math.round(count), 2, MAX);
  const shapeScale = clamp(scale, 0.5, 1.5);
  const round = clamp(roundness, 0, 1);
  const kindKey = kinds.join(",");
  const paletteKey = palette.join("|");

  const layouts = React.useMemo(() => {
    const list = kindKey.split(",") as SoftShapeKind[];
    const tones = paletteKey.split("|").length;
    return {
      one: compose(n, list, tones, seed, 1),
      two: compose(n, list, tones, seed, 2),
    };
  }, [n, kindKey, paletteKey, seed]);

  const params = React.useRef({
    softness,
    melt,
    radius,
    pull,
    grain,
    ambient,
    gather,
    interactive,
    followFocus,
    paused,
    dpr,
    motionSafe,
    onGatherChange,
    round,
    shapeScale,
    layouts,
    palette,
  });
  React.useEffect(() => {
    params.current = {
      softness,
      melt,
      radius,
      pull,
      grain,
      ambient,
      gather,
      interactive,
      followFocus,
      paused,
      dpr,
      motionSafe,
      onGatherChange,
      round,
      shapeScale,
      layouts,
      palette,
    };
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas || failed) return;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    const program = gl ? createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT) : null;
    const tri = gl && program ? createFullscreenTriangle(gl, program) : null;
    // No WebGL2: the still stays, and nothing else is set up.
    if (!gl || !program || !tri) {
      program?.dispose();
      return;
    }
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
      gl.ONE,
      gl.ONE_MINUS_SRC_ALPHA,
    );

    // Everything the shader reads is made once and filled in place.
    const res = new Float32Array(2);
    const shapeData = new Float32Array(MAX * 4);
    const kindData = new Float32Array(MAX * 4);
    const focusData = new Float32Array(3);
    const uniforms: Record<string, UniformValue> = {
      u_res: res,
      u_shape: shapeData,
      u_kind: kindData,
      u_count: 0,
      u_focus: focusData,
      u_radius: 160,
      u_soft: 28,
      u_melt: 36,
      u_round: 0.3,
      u_grain: 0.4,
      u_px: 0.5,
    };
    const bodies: Body[] = Array.from({ length: MAX }, () => ({
      hx: 0,
      hy: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      a: 0,
      va: 0,
      ha: 0,
      s: 1,
      kind: 0,
      tone: 0,
      near: 0,
      phase: 0,
      rate: 0,
    }));
    let colours: Rgb[] = [];
    let live = 0;
    let unit = 40;
    let rest = { x: 0, y: 0 };
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = 0;
    let carry = 0;
    let clock = 0;
    let inView = true;
    let lost = false;
    let shown = false;
    let readyFrame = 0;
    let placed = false;
    // The soft spot: where the edges blur, and what the shapes lean toward.
    const spot = { x: 0, y: 0, vx: 0, vy: 0 };
    const goal = { x: 0, y: 0, strength: 0, keen: false };
    let soft = 0;
    let gathered = 0;
    let gathering = false;
    let gatherPoint = { x: 0, y: 0 };
    let scatterUntil = -1;
    let pulse = 0;
    const pointer = { x: 0, y: 0, inside: false, down: false, touch: false };
    let focusPoint: { x: number; y: number } | null = null;
    const ambientPhase = hash(13, seed) * Math.PI * 2;

    const reader = (() => {
      const c = document.createElement("canvas");
      c.width = 1;
      c.height = 1;
      return c.getContext("2d", { willReadFrequently: true });
    })();
    const rgb = (css: string): Rgb => {
      const probe = probeRef.current;
      if (!probe || !reader) return [0.5, 0.5, 0.5];
      probe.style.color = css;
      reader.clearRect(0, 0, 1, 1);
      reader.fillStyle = "rgb(128, 128, 128)";
      reader.fillStyle = getComputedStyle(probe).color;
      reader.fillRect(0, 0, 1, 1);
      const d = reader.getImageData(0, 0, 1, 1).data;
      return [(d[0] ?? 128) / 255, (d[1] ?? 128) / 255, (d[2] ?? 128) / 255];
    };
    const recolour = () => {
      colours = params.current.palette.map(rgb);
    };

    /**
     * Places the homes for the current box. A resize carries every shape with
     * its home rather than flinging it; a new layout (count, set, seed) leaves
     * the shapes where they are so their springs morph them to the new homes.
     */
    const layout = (carry: boolean) => {
      const p = params.current;
      const plan = w >= WIDE ? p.layouts.one : p.layouts.two;
      const live0 = live;
      live = plan.homes.length;
      unit = Math.min((w * CELL) / plan.cols, (h * CELL) / plan.rows);
      rest = { x: plan.rest[0] * w, y: plan.rest[1] * h };
      plan.homes.forEach((home, i) => {
        const b = bodies[i];
        if (!b) return;
        const hx = home.fx * w;
        const hy = home.fy * h;
        const fresh = !placed || i >= live0;
        b.x = fresh ? hx : carry ? b.x + hx - b.hx : b.x;
        b.y = fresh ? hy : carry ? b.y + hy - b.hy : b.y;
        b.hx = hx;
        b.hy = hy;
        b.ha = (home.angle * Math.PI) / 180;
        if (!placed) b.a = b.ha;
        b.s = home.s;
        b.kind = home.kind;
        b.tone = home.tone;
        b.phase = hash(i * 11 + 6, seed) * Math.PI * 2;
        b.rate = 0.35 + hash(i * 11 + 8, seed) * 0.3;
      });
      if (!placed) {
        spot.x = rest.x;
        spot.y = rest.y;
      }
      placed = true;
    };

    const ambientAt = (t: number) => {
      goal.x = w * (0.5 + 0.36 * Math.sin(t * 0.21 + ambientPhase));
      goal.y = h * (0.5 + 0.3 * Math.sin(t * 0.33 + ambientPhase * 1.7));
    };

    /** Where the soft spot is headed, and how strong it should be there. */
    const aim = () => {
      const p = params.current;
      goal.keen = true;
      if (gathering) {
        goal.x = gatherPoint.x;
        goal.y = gatherPoint.y;
        goal.strength = 1;
      } else if (p.interactive && pointer.inside) {
        goal.x = pointer.x;
        goal.y = pointer.y;
        goal.strength = 1;
      } else if (p.followFocus && focusPoint) {
        goal.x = focusPoint.x;
        goal.y = focusPoint.y;
        goal.strength = 1;
      } else if (p.ambient) {
        ambientAt(clock);
        goal.strength = 0.6;
        goal.keen = false;
      } else {
        goal.x = spot.x;
        goal.y = spot.y;
        goal.strength = 0;
        goal.keen = false;
      }
    };

    let energy = 0;
    const integrate = (dt: number) => {
      const p = params.current;
      aim();
      const R = Math.max(1, p.radius);
      const lean = clamp(p.pull, 0, 1);
      const scattering = clock < scatterUntil;
      const bob = p.ambient ? unit * 0.06 : 0;
      // Centroid of the homes, so a gathered mass keeps a little of the
      // composition's structure instead of collapsing to one point.
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < live; i += 1) {
        const b = bodies[i];
        if (!b) continue;
        cx += b.hx / live;
        cy += b.hy / live;
      }
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h1 = dt / steps;
      energy = 0;
      for (let s = 0; s < steps; s += 1) {
        clock += h1;
        // The soft spot: snap toward a pointer, drift along the ambient path.
        const spotSpring = goal.keen ? springs.snap : springs.drift;
        spot.vx = springStep(spot.x, spot.vx, goal.x, spotSpring, h1);
        spot.vy = springStep(spot.y, spot.vy, goal.y, spotSpring, h1);
        spot.x += spot.vx * h1;
        spot.y += spot.vy * h1;
        // Softness and the gather's melt are tweens, not springs: a blur has
        // no mass to overshoot with.
        soft += (goal.strength - soft) * (1 - Math.exp(-h1 / 0.08));
        gathered +=
          ((gathering ? 1 : 0) - gathered) *
          (1 - Math.exp(-h1 / (gathering ? 0.06 : 0.12)));
        for (let i = 0; i < live; i += 1) {
          const b = bodies[i];
          if (!b) continue;
          let bx = b.hx;
          let by = b.hy;
          if (bob > 0) {
            bx += bob * Math.sin(clock * b.rate + b.phase);
            by += bob * Math.cos(clock * b.rate * 1.3 + b.phase * 0.7);
          }
          const dx = spot.x - bx;
          const dy = spot.y - by;
          b.near = Math.exp(-(dx * dx + dy * dy) / (R * R));
          let tx: number;
          let ty: number;
          let ta: number;
          if (gathering) {
            tx = gatherPoint.x + (b.hx - cx) * 0.22;
            ty = gatherPoint.y + (b.hy - cy) * 0.22;
            ta = b.ha;
          } else {
            const k = lean * 0.7 * b.near * soft;
            tx = bx + dx * k;
            ty = by + dy * k;
            ta = b.ha + clamp(dx / R, -1, 1) * 0.22 * lean * soft * b.near;
          }
          // Gathering glides in; a release lands home with two bounces; a
          // shape answering the pointer glides, one drifting home drifts.
          const spring = gathering
            ? springs.glide
            : scattering
              ? springs.recoil
              : goal.keen
                ? springs.glide
                : springs.drift;
          b.vx = springStep(b.x, b.vx, tx, spring, h1);
          b.vy = springStep(b.y, b.vy, ty, spring, h1);
          b.va = springStep(b.a, b.va, ta, springs.glide, h1);
          b.x += b.vx * h1;
          b.y += b.vy * h1;
          b.a += b.va * h1;
          energy = Math.max(
            energy,
            Math.abs(b.vx) + Math.abs(b.vy),
            Math.abs(tx - b.x) + Math.abs(ty - b.y),
          );
        }
      }
      energy = Math.max(
        energy,
        Math.abs(spot.vx) + Math.abs(spot.vy),
        Math.abs(goal.strength - soft) * 100,
        gathered * 100,
      );
    };

    const draw = () => {
      if (lost || w < 1 || h < 1 || gl.isContextLost()) return;
      const p = params.current;
      const cap = clamp(p.dpr, 0.5, 2);
      const size = resizeGL(gl, canvas, { dprCap: cap });
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      for (let i = 0; i < live; i += 1) {
        const b = bodies[i];
        if (!b) continue;
        const swell = 1 + 0.06 * soft * b.near;
        shapeData[i * 4] = b.x;
        shapeData[i * 4 + 1] = b.y;
        shapeData[i * 4 + 2] = unit * b.s * p.shapeScale * swell;
        shapeData[i * 4 + 3] = b.a;
        const c = colours[b.tone % Math.max(1, colours.length)] ?? [
          0.5, 0.5, 0.5,
        ];
        kindData[i * 4] = b.kind;
        kindData[i * 4 + 1] = c[0];
        kindData[i * 4 + 2] = c[1];
        kindData[i * 4 + 3] = c[2];
      }
      res[0] = w;
      res[1] = h;
      focusData[0] = spot.x;
      focusData[1] = spot.y;
      focusData[2] = Math.max(soft, gathered);
      uniforms.u_count = live;
      uniforms.u_radius = Math.max(1, p.radius) * (1 + 0.25 * gathered);
      uniforms.u_soft = Math.max(0, p.softness);
      uniforms.u_melt = Math.max(0, p.melt) * (1 + 1.4 * gathered);
      uniforms.u_round = p.round;
      uniforms.u_grain = clamp(p.grain, 0, 1);
      uniforms.u_px = 1 / size.dpr;
      program.use();
      program.set(uniforms);
      tri.draw();
      if (!shown) {
        shown = true;
        readyFrame = requestAnimationFrame(() => setReady(true));
      }
    };

    /** Reduced motion: no travel. Shapes at home (or gathered), spot placed. */
    const drawStill = () => {
      const p = params.current;
      let fx = rest.x;
      let fy = rest.y;
      let strength = 0.8;
      if (gathering) {
        fx = gatherPoint.x;
        fy = gatherPoint.y;
        strength = 1;
      } else if (p.interactive && pointer.inside) {
        fx = pointer.x;
        fy = pointer.y;
        strength = 1;
      } else if (p.followFocus && focusPoint) {
        fx = focusPoint.x;
        fy = focusPoint.y;
        strength = 1;
      }
      let cx = 0;
      let cy = 0;
      for (let i = 0; i < live; i += 1) {
        const b = bodies[i];
        if (!b) continue;
        cx += b.hx / live;
        cy += b.hy / live;
      }
      const R = Math.max(1, p.radius);
      for (let i = 0; i < live; i += 1) {
        const b = bodies[i];
        if (!b) continue;
        b.x = gathering ? fx + (b.hx - cx) * 0.22 : b.hx;
        b.y = gathering ? fy + (b.hy - cy) * 0.22 : b.hy;
        b.a = b.ha;
        b.vx = 0;
        b.vy = 0;
        b.va = 0;
        const dx = fx - b.x;
        const dy = fy - b.y;
        b.near = Math.exp(-(dx * dx + dy * dy) / (R * R));
      }
      spot.x = fx;
      spot.y = fy;
      spot.vx = 0;
      spot.vy = 0;
      soft = strength;
      gathered = gathering ? 1 : 0;
      draw();
    };

    const canRun = () => {
      const p = params.current;
      if (!inView || document.hidden || p.paused || !p.motionSafe) return false;
      if (lost || w < 1) return false;
      return (
        p.ambient ||
        pointer.inside ||
        focusPoint !== null ||
        gathering ||
        clock < scatterUntil ||
        energy > 0.3
      );
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      carry += dt;
      // With only the ambient spot wandering, every other frame is plenty.
      const lively =
        pointer.inside ||
        focusPoint !== null ||
        gathering ||
        clock < scatterUntil ||
        gathered > 0.01;
      if (lively || carry >= 1 / 30) {
        integrate(carry);
        carry = 0;
        draw();
      }
      if (canRun()) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!params.current.motionSafe) {
        drawStill();
        return;
      }
      if (raf || !canRun()) {
        if (!raf) draw();
        return;
      }
      last = performance.now();
      carry = 0;
      energy = Math.max(energy, 1);
      raf = requestAnimationFrame(tick);
    };
    const halt = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const resize = () => {
      const nw = root.clientWidth;
      const nh = root.clientHeight;
      if (nw < 1 || nh < 1) return;
      w = nw;
      h = nh;
      layout(true);
      if (params.current.motionSafe) draw();
      wake();
    };

    const local = (clientX: number, clientY: number) => {
      const box = root.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    };

    const setGathering = (on: boolean, at?: { x: number; y: number }) => {
      if (on === gathering) {
        if (on && at) gatherPoint = at;
        return;
      }
      gathering = on;
      if (on && at) gatherPoint = at;
      if (!on) scatterUntil = clock + 0.9;
      params.current.onGatherChange?.(on);
      wake();
    };

    const onMove = (event: PointerEvent) => {
      const p = params.current;
      if (!p.interactive) return;
      const pt = local(event.clientX, event.clientY);
      // Touch only counts while the finger is down; a hover has no meaning.
      if (event.pointerType === "touch" && !pointer.down) return;
      pointer.x = pt.x;
      pointer.y = pt.y;
      pointer.inside = true;
      if (gathering && pointer.down) gatherPoint = pt;
      wake();
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === "touch" && pointer.down) return;
      pointer.inside = false;
      wake();
    };
    const release = () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      pointer.down = false;
      // A finger has no hover: once it lifts, the soft spot lets go too.
      if (pointer.touch) pointer.inside = false;
      setGathering(false);
    };
    const onDown = (event: PointerEvent) => {
      const p = params.current;
      if (!p.interactive || !p.gather) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const pt = local(event.clientX, event.clientY);
      pointer.down = true;
      pointer.touch = event.pointerType === "touch";
      pointer.x = pt.x;
      pointer.y = pt.y;
      pointer.inside = true;
      window.clearTimeout(pulse);
      // The release may land anywhere: listen on the window once pressed.
      window.addEventListener("pointerup", release);
      window.addEventListener("pointercancel", release);
      setGathering(true, pt);
    };
    // Enter or Space on a control inside: a click with no pointer behind it.
    const onClick = (event: MouseEvent) => {
      const p = params.current;
      if (event.detail !== 0 || !p.gather) return;
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      const r = el.getBoundingClientRect();
      const pt = local(r.left + r.width / 2, r.top + r.height / 2);
      window.clearTimeout(pulse);
      setGathering(true, pt);
      pulse = window.setTimeout(() => setGathering(false), 420);
    };
    const onFocusIn = (event: FocusEvent) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || el === root) return;
      if (!el.matches(":focus-visible") || !params.current.followFocus) return;
      const r = el.getBoundingClientRect();
      focusPoint = local(r.left + r.width / 2, r.top + r.height / 2);
      wake();
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && root.contains(next)) return;
      focusPoint = null;
      wake();
    };

    root.addEventListener("pointermove", onMove);
    root.addEventListener("pointerenter", onMove);
    root.addEventListener("pointerleave", onLeave);
    root.addEventListener("pointerdown", onDown);
    root.addEventListener("click", onClick);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", onFocusOut);

    const sizer = new ResizeObserver(resize);
    sizer.observe(root);
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (!entry) return;
      inView = entry.isIntersecting;
      if (inView) wake();
      else halt();
    });
    watcher.observe(root);
    const onVisibility = () => {
      if (document.hidden) halt();
      else wake();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const detach = onContextLoss(canvas, () => {
      lost = true;
      halt();
      // The still comes back and stays: it is the designed fallback.
      setReady(false);
      setFailed(true);
    });

    recolour();
    resize();
    api.current = {
      recolour: () => {
        recolour();
        if (params.current.motionSafe) draw();
        else drawStill();
      },
      relayout: () => {
        if (w < 1 || h < 1) return;
        layout(false);
        wake();
      },
      wake: () => {
        if (!params.current.interactive) {
          pointer.inside = false;
          if (gathering) setGathering(false);
        }
        if (!params.current.followFocus) focusPoint = null;
        wake();
      },
    };

    return () => {
      halt();
      cancelAnimationFrame(readyFrame);
      window.clearTimeout(pulse);
      lost = true;
      sizer.disconnect();
      watcher.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      detach();
      root.removeEventListener("pointermove", onMove);
      root.removeEventListener("pointerenter", onMove);
      root.removeEventListener("pointerleave", onLeave);
      root.removeEventListener("pointerdown", onDown);
      root.removeEventListener("click", onClick);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", onFocusOut);
      tri.dispose();
      program.dispose();
      api.current = null;
    };
  }, [failed, seed]);

  React.useEffect(() => {
    api.current?.recolour();
  }, [paletteKey]);

  React.useEffect(() => {
    api.current?.relayout();
  }, [layouts, shapeScale]);

  React.useEffect(() => {
    api.current?.wake();
  }, [
    softness,
    melt,
    radius,
    pull,
    grain,
    round,
    ambient,
    gather,
    interactive,
    followFocus,
    paused,
    dpr,
    motionSafe,
  ]);

  const stills = [layouts.one, layouts.two].filter(
    (plan, i) => i === 0 || plan.rows === 2,
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative isolate touch-manipulation overflow-clip",
        className,
      )}
    >
      {/* The server and the first paint get the shapes at home as SVG, which
          the canvas replaces on its first frame; without WebGL2 it stays. */}
      <div
        aria-hidden
        data-still={ready ? undefined : ""}
        className={cn(
          "pointer-events-none absolute inset-0 z-0 transition-opacity",
          ready && "opacity-0",
        )}
        style={{
          containerType: "size",
          transitionDuration: `${Math.round(durations.slow * 1000)}ms`,
        }}
      >
        {stills.map((plan) => {
          const unit = `min(${r3((CELL * 100) / plan.cols)}cqw, ${r3((CELL * 100) / plan.rows)}cqh)`;
          return (
            <div
              key={plan.rows}
              className={cn(
                "absolute inset-0",
                stills.length === 1
                  ? "block"
                  : plan.rows === 1
                    ? "hidden @min-[35rem]:block"
                    : "@min-[35rem]:hidden",
              )}
            >
              {plan.homes.map((home, i) => (
                <StillShape
                  key={i}
                  home={home}
                  unit={unit}
                  scale={shapeScale}
                  roundness={round}
                  fill={palette[home.tone % palette.length] ?? "currentColor"}
                />
              ))}
            </div>
          );
        })}
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 z-0 size-full",
          failed && "hidden",
        )}
      />
      <div className="relative z-10 size-full">{children}</div>
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
        onTransitionEnd={() => api.current?.recolour()}
        className="pointer-events-none absolute size-0 overflow-hidden bg-background text-foreground transition-colors duration-1"
      />
    </div>
  );
}
