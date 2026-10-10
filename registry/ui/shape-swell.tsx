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
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ShapeSwellShapes = "mixed" | "round" | "plus" | "angular";

export type ShapeSwellProps = {
  /** The content on top of the field: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** Distance between shape centres, in px (12 to 80). @default 28 */
  spacing?: number;
  /** How fast the swell rolls, 0 (held) to 3. @default 1 */
  speed?: number;
  /** Which shapes fill the grid: all four, circles, plus signs, or squares and triangles. @default "mixed" */
  shapes?: ShapeSwellShapes;
  /** A shape's size at the crest, as a share of the spacing (0.2 to 0.8). @default 0.5 */
  size?: number;
  /** Crest fill colours, laid across the field along the swell, as CSS colours (1 to 3). @default ["var(--accent-bright)", "color-mix(in oklch, var(--accent-bright) 40%, var(--signal))"] */
  colors?: readonly string[];
  /** The trough outlines' colour, any CSS colour. @default "var(--ink-3)" */
  outline?: string;
  /** Outline width, in px. @default 1.25 */
  stroke?: number;
  /** Degrees a shape turns as the crest lifts it (0 to 180): squares become diamonds, plus signs crosses. @default 90 */
  turn?: number;
  /** Distance between crests, in px. @default 320 */
  wavelength?: number;
  /** The heading the swell rolls along, in degrees; 0 runs left to right. @default 35 */
  angle?: number;
  /** The pointer and keyboard focus raise a crest of their own. @default true */
  interactive?: boolean;
  /** How strongly the pointer lifts the shapes near it, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** A press on the field (not on a control) sends a ring crest out from it. @default true */
  pulse?: boolean;
  /** The swell rises out of quiet outlines the first time the field comes into view. @default true */
  intro?: boolean;
  /** Hold the swell still; the pointer can still lift shapes. @default false */
  paused?: boolean;
  /** Seeds which shape sits where and how each lags the swell. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) raising its crest. */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const COLORS = [
  "var(--accent-bright)",
  "color-mix(in oklch, var(--accent-bright) 40%, var(--signal))",
] as const;
const SETS: Record<ShapeSwellShapes, number> = {
  mixed: 0,
  round: 1,
  plus: 2,
  angular: 3,
};

/** Fixed physics step: the springs integrate at 120 Hz whatever the display does. */
const STEP = 1 / 120;
/** A ring crest travels this fast, px/s, and fades with this rate, 1/s. */
const RING_SPEED = 420;
const RING_FADE = 0.9;
/** The keyboard's ring is a softer one than a press. */
const FOCUS_PULSE = 0.65;
const RINGS = 4;
/** One crest passes a point every this many seconds at speed 1. */
const PERIOD = 6;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const rad = (deg: number) => (deg * Math.PI) / 180;

/** A small seeded generator: the same field for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = /* glsl */ `
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_dpr;
uniform float u_spacing;
uniform vec2 u_origin;
uniform vec2 u_count;
uniform float u_size;
uniform float u_stroke;
uniform float u_turn;
uniform int u_set;
uniform vec4 u_wave;
uniform float u_rise;
uniform float u_seed;
uniform vec3 u_colA;
uniform vec3 u_colB;
uniform vec3 u_colC;
uniform vec4 u_line;
uniform vec4 u_hand;
uniform vec4 u_ring[4];

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// An equilateral triangle of circumradius 1, apex up on screen.
float sdTri(vec2 p) {
  const float k = 1.7320508;
  const float r = 0.8660254;
  p.y = -p.y;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

// 0 circle, 1 rounded square, 2 plus, 3 triangle; all about unit size.
float shape(int kind, vec2 q) {
  if (kind == 0) return length(q) - 0.92;
  if (kind == 1) return sdBox(q, vec2(0.68)) - 0.14;
  if (kind == 2) return min(sdBox(q, vec2(0.96, 0.26)), sdBox(q, vec2(0.26, 0.96))) - 0.04;
  return sdTri(q * 1.04) / 1.04;
}

int kindOf(float h) {
  if (u_set == 1) return 0;
  if (u_set == 2) return 2;
  if (u_set == 3) return h < 0.5 ? 1 : 3;
  return int(floor(h * 4.0));
}

void main() {
  vec2 p = v_uv * u_res;
  vec2 g = (p - u_origin) / u_spacing;
  vec2 base = floor(g);
  vec2 side = step(0.5, g - base) * 2.0 - 1.0;
  float aa = 0.85 / u_dpr;
  vec4 acc = vec4(0.0);
  // The four nearest cells, so a shape turned past its cell edge never clips.
  for (int i = 0; i < 4; i++) {
    vec2 cell = base + vec2(float(i & 1), float(i >> 1)) * side;
    if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, u_count))) continue;
    vec2 c = (cell + 0.5) * u_spacing + u_origin;
    float h1 = hash(cell + u_seed);
    float h2 = hash(cell.yx + u_seed * 1.7 + 3.1);
    int kind = kindOf(h1);
    // The swell at this shape's centre, lagged a little per shape so the
    // rows never move as one sheet.
    float s = 0.5 + 0.5 * sin(dot(c, u_wave.xy) * u_wave.z - u_wave.w + (h2 - 0.5) * 0.9);
    s = s * s * (3.0 - 2.0 * s) * u_rise;
    vec2 dh = c - u_hand.xy;
    s = max(s, u_hand.z * exp(-dot(dh, dh) / (u_hand.w * u_hand.w)));
    for (int r = 0; r < 4; r++) {
      vec4 ring = u_ring[r];
      if (ring.w <= 0.0) continue;
      float x = (length(c - ring.xy) - ring.z) / 58.0;
      s = max(s, min(1.0, ring.w * exp(-x * x)));
    }
    float fill = smoothstep(0.56, 0.8, s);
    float scale = mix(0.46, 1.0, smoothstep(0.08, 0.92, s)) * mix(0.86, 1.08, h2);
    // Triangles stand apex up or apex down; the rest are symmetric.
    float rot = (kind == 3 ? step(0.5, h2) * 3.1415927 : 0.0) + u_turn * s;
    float cr = cos(rot);
    float sr = sin(rot);
    float radius = 0.5 * u_size * u_spacing * scale;
    vec2 q = mat2(cr, -sr, sr, cr) * (p - c) / radius;
    float sd = shape(kind, q) * radius;
    float inside = smoothstep(aa, -aa, sd);
    float edge = 1.0 - smoothstep(0.5 * u_stroke - aa, 0.5 * u_stroke + aa, abs(sd));
    // Fill runs across the field along the swell's heading.
    float t = clamp(dot(c / u_res - 0.5, u_wave.xy) + 0.5, 0.0, 1.0);
    vec3 fillCol = t < 0.5 ? mix(u_colA, u_colB, t * 2.0) : mix(u_colB, u_colC, t * 2.0 - 1.0);
    float a1 = inside * fill;
    float a2 = edge * u_line.a * mix(0.55, 1.0, s) * (1.0 - fill);
    vec4 shapeCol = vec4(fillCol * a1, a1) + vec4(u_line.rgb * a2, a2) * (1.0 - a1);
    acc += shapeCol * (1.0 - acc.a);
  }
  o_color = acc;
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Ring = { x: number; y: number; age: number; strength: number };

type Sim = {
  /** Swell time, s. */
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
  rings: Ring[];
};

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
 * A grid of small shapes — circles, rounded squares, plus signs and
 * triangles — as a background, with the content on top in its own layer. A
 * diagonal swell rolls through them: rising toward the crest a shape grows,
 * turns and fills with colour; sinking into the trough it shrinks, turns home
 * and fades to a fine outline. Every edge is a signed distance field, so the
 * shapes stay crisp at any size and density.
 *
 * The pointer raises a crest of its own (springs.glide for where,
 * springs.drift for how much), and a press sends a ring crest out across the
 * grid, popping every shape it passes. It is decoration: `aria-hidden`, never
 * a focus stop, never in the way of a click; keyboard focus landing on a
 * control inside raises the crest there and sends a softer ring. One WebGL2
 * fragment pass on a transparent canvas, drawn only while on screen, in a
 * visible page and while something moves. Under reduced motion the field is
 * still, a diagonal band of filled shapes across the outlines, and the
 * pointer's crest is drawn straight under it.
 */
export function ShapeSwell({
  children,
  spacing = 28,
  speed = 1,
  shapes = "mixed",
  size = 0.5,
  colors = COLORS,
  outline = "var(--ink-3)",
  stroke = 1.25,
  turn = 90,
  wavelength = 320,
  angle = 35,
  interactive = true,
  pointerStrength = 0.6,
  pulse = true,
  intro = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  className,
}: ShapeSwellProps) {
  const motionSafe = useMotionSafe();
  const first = colors[0] ?? COLORS[0];
  const paints = [
    first,
    colors[1] ?? first,
    colors[2] ?? colors[1] ?? first,
    outline,
  ] as const;
  const paintKey = paints.join("|");

  const k = {
    spacing: clamp(spacing, 12, 80),
    speed: clamp(speed, 0, 3),
    set: SETS[shapes] ?? 0,
    size: clamp(size, 0.2, 0.8),
    stroke: clamp(stroke, 0.5, 4),
    turn: rad(clamp(turn, 0, 180)),
    wavelength: clamp(wavelength, 60, 4000),
    angle: rad(angle),
    strength: clamp01(pointerStrength),
    pulse,
    intro,
    paused,
    seed,
    phase: lcg(seed)() * Math.PI * 2,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
  };

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const box = React.useRef<Size | null>(null);
  const colour = React.useRef(new Float32Array(16));
  const ringData = React.useRef(new Float32Array(RINGS * 4));
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
    rings: Array.from({ length: RINGS }, () => ({
      x: 0,
      y: 0,
      age: 0,
      strength: 0,
    })),
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onActiveChange);
  /** Every frame goes through the latest render's tick, never a stale one. */
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

  /** Each CSS colour as sRGB floats (and alpha), read back from its carrier by painting one pixel. */
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
    for (let i = 0; i < 4; i += 1) {
      const span = spans[i];
      if (!span) continue;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      out[i * 4] = (d[0] ?? 0) / 255;
      out[i * 4 + 1] = (d[1] ?? 0) / 255;
      out[i * 4 + 2] = (d[2] ?? 0) / 255;
      out[i * 4 + 3] = (d[3] ?? 255) / 255;
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
  };

  /** One frame, from the sim as it stands. Uniforms go straight to their locations: nothing is allocated. */
  const draw = () => {
    const g = gpu.current;
    const sz = box.current;
    if (!g || g.lost || !sz || !visible.current) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    // Whole cells only, centred: the margins match on every side.
    const cols = Math.max(1, Math.floor(sz.w / k.spacing));
    const rows = Math.max(1, Math.floor(sz.h / k.spacing));
    const reach = clamp(Math.min(sz.w, sz.h) * 0.32, 50, 150);
    const rings = ringData.current;
    for (let i = 0; i < RINGS; i += 1) {
      const r = s.rings[i];
      const live = r && r.strength > 0;
      rings[i * 4] = live ? r.x : 0;
      rings[i * 4 + 1] = live ? r.y : 0;
      rings[i * 4 + 2] = live ? r.age * RING_SPEED : 0;
      rings[i * 4 + 3] = live
        ? 1.25 * r.strength * Math.exp(-r.age * RING_FADE)
        : 0;
    }
    const pal = colour.current;
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_dpr ?? null, sz.dpr);
    gl.uniform1f(u.u_spacing ?? null, k.spacing);
    gl.uniform2f(
      u.u_origin ?? null,
      (sz.w - cols * k.spacing) / 2,
      (sz.h - rows * k.spacing) / 2,
    );
    gl.uniform2f(u.u_count ?? null, cols, rows);
    gl.uniform1f(u.u_size ?? null, k.size);
    gl.uniform1f(u.u_stroke ?? null, k.stroke);
    gl.uniform1f(u.u_turn ?? null, k.turn);
    gl.uniform1i(u.u_set ?? null, k.set);
    gl.uniform4f(
      u.u_wave ?? null,
      Math.cos(k.angle),
      Math.sin(k.angle),
      (Math.PI * 2) / k.wavelength,
      s.t * ((Math.PI * 2) / PERIOD) - k.phase,
    );
    gl.uniform1f(u.u_rise ?? null, s.rise);
    gl.uniform1f(u.u_seed ?? null, (k.seed % 97) * 1.37);
    gl.uniform3f(u.u_colA ?? null, pal[0] ?? 0, pal[1] ?? 0, pal[2] ?? 0);
    gl.uniform3f(u.u_colB ?? null, pal[4] ?? 0, pal[5] ?? 0, pal[6] ?? 0);
    gl.uniform3f(u.u_colC ?? null, pal[8] ?? 0, pal[9] ?? 0, pal[10] ?? 0);
    gl.uniform4f(
      u.u_line ?? null,
      pal[12] ?? 0.5,
      pal[13] ?? 0.5,
      pal[14] ?? 0.5,
      (pal[15] ?? 1) * 0.62,
    );
    gl.uniform4f(
      u.u_hand ?? null,
      s.x,
      s.y,
      (0.55 + 0.6 * k.strength) * s.level,
      reach,
    );
    gl.uniform4fv(u.u_ring ?? null, rings);
    tri.draw();
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Advances the swell and the springs by dt; says whether anything still moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
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
      for (const r of s.rings) r.strength = 0;
      return false;
    }
    const rolling = !k.paused && k.speed > 0;
    if (rolling) s.t += dt * k.speed;
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
    const sz = box.current;
    const far = sz ? Math.hypot(sz.w, sz.h) + 80 : 2000;
    let rings = false;
    for (const r of s.rings) {
      if (r.strength <= 0) continue;
      r.age += dt;
      if (r.age * RING_SPEED > far || Math.exp(-r.age * RING_FADE) < 0.03)
        r.strength = 0;
      else rings = true;
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
      rolling ||
      (handMoving && s.level > 0.001) ||
      levelMoving ||
      rising ||
      rings
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

  /** The first sighting: the swell rises out of quiet outlines. */
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

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readPalette, tick, arrive };
    report.current = onActiveChange;
  });

  // The GPU side, bound to the canvas: built, rebuilt after a lost context,
  // torn down with the component. StrictMode's second run builds again on
  // the same context, which the browser hands back unchanged.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpu.current = { gl, program, tri, lost: false };
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
        g.tri.dispose();
        g.program.dispose();
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
    k.spacing,
    k.speed,
    k.set,
    k.size,
    k.stroke,
    k.turn,
    k.wavelength,
    k.angle,
    k.strength,
    k.seed,
    paused,
    motionSafe,
  ]);

  // Switching the hand off lets go of its crest, and says so.
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

  /** The hand goes to (x, y); arriving from nowhere, the crest starts there. */
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
    kick();
  };

  /** The pointer leaves: the crest goes back to a focused control, or sinks. */
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

  const ringAt = (x: number, y: number, strength: number) => {
    if (!k.pulse || !k.motionSafe) return;
    // A free slot, or else the oldest ring gives way.
    const rings = sim.current.rings;
    let pick = 0;
    for (let i = 0; i < rings.length; i += 1) {
      const age = rings[i]?.strength ? (rings[i]?.age ?? 0) : Infinity;
      const best = rings[pick]?.strength ? (rings[pick]?.age ?? 0) : Infinity;
      if (age > best) pick = i;
    }
    const slot = rings[pick];
    if (!slot) return;
    slot.x = x;
    slot.y = y;
    slot.age = 0;
    slot.strength = strength;
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
    if (!hit || !rootRef.current?.contains(hit)) ringAt(at.x, at.y, 1);
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
    ringAt(at.x, at.y, FOCUS_PULSE);
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
        "group/shape-swell relative isolate h-full w-full touch-manipulation overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/shape-swell:invisible group-data-live/shape-swell:opacity-0"
        style={standIn(paints, k.spacing, k.size, k.stroke)}
      />
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

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: a grid of quiet rings in CSS, with a soft band of
 * the crest colour across it.
 */
function standIn(
  paints: readonly [string, string, string, string],
  spacing: number,
  size: number,
  stroke: number,
): React.CSSProperties {
  const [a, b, , line] = paints;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const r = spacing * size * 0.23;
  const inner = r2(r - stroke);
  const mid = r2(r - stroke + 0.5);
  const outer = r2(r);
  const past = r2(r + 0.5);
  return {
    backgroundImage: [
      `linear-gradient(125deg, transparent 28%, color-mix(in oklab, ${a} 16%, transparent) 46%, color-mix(in oklab, ${b} 14%, transparent) 56%, transparent 74%)`,
      `radial-gradient(circle, transparent ${inner}px, color-mix(in oklab, ${line} 60%, transparent) ${mid}px ${outer}px, transparent ${past}px)`,
    ].join(", "),
    backgroundSize: `100% 100%, ${spacing}px ${spacing}px`,
    backgroundPosition: "0 0, center",
  };
}
