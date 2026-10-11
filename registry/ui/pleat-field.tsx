"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { project, rubberClamp, useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PleatPalette = "prism" | "tide" | "ember" | "mono";

export type PleatFieldProps = {
  /** How many panels the sheet is folded into, 6 to 24. @default 12 */
  pleats?: number;
  /** How closely the points sit, 0 (a sparse lattice) to 1 (a fine one). @default 0.5 */
  density?: number;
  /** The spectrum the faces are tinted from, crease to crease. @default "prism" */
  palette?: PleatPalette;
  /** Two or three CSS colours that replace the palette: one way, the creases, the other way. */
  colors?: string[];
  /** Where the sheet rests, 0 (closed) to 1 (fully open). @default 0.5 */
  rest?: number;
  /** Let go, the sheet eases back to `rest`; off, it stays where it is left. @default true */
  springBack?: boolean;
  /** The folds' edge, 0 (rounded, like cloth) to 1 (knife-sharp creases). @default 0.6 */
  crease?: number;
  /** How far the top of the fan leans away from the eye, degrees, 0 to 60. @default 20 */
  tilt?: number;
  /** How large and bright the points burn, 0 to 1. @default 0.6 */
  glow?: number;
  /** How much the fan breathes and shimmers while it rests, 0 (still) to 1. @default 0.4 */
  sway?: number;
  /** The hand opens and closes the sheet and the pointer leans it. @default true */
  interactive?: boolean;
  /** Hold the breathing still; the hand still works. @default false */
  paused?: boolean;
  /** Seeds each point's shimmer, so two sheets never twinkle together. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The sheet's accessible name. @default "Pleated sheet" */
  label?: string;
  /** Fires with the opening (0 to 1) the hand or the keys asked for, and with `rest` when it is let go. */
  onOpenChange?: (open: number) => void;
  /** The sheet is drawn and holds still; drag and keys are ignored. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-full w-full" */
  className?: string;
};

/** The flat sheet's angle, rad: a fan opened flat would span 160°. */
const SPAN = 2.8;
/** The fold angle closed and fully open, rad: 78° and 17°. */
const FOLD_CLOSED = 1.36;
const FOLD_OPEN = 0.3;
/** The inner edge of the sheet, as a share of its radius. */
const INNER = 0.26;
const STEP = 1 / 240;
const CALM_FRAME = 31;
const KEY_STEP = 0.1;
const PAGE_STEP = 0.25;
/** A key let go eases back after a beat, so a tap still shows its flex. */
const KEY_HOLD = 140;
const ENTRANCE_DELAY = 0.12;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

type Spring = { stiffness: number; damping: number; mass: number };

/** Pigments at a fixed lightness per theme, so a face is the same colour on any page. */
const PALETTES: Record<PleatPalette, readonly [string, string, string]> = {
  prism: ["var(--accent-bright)", "var(--signal)", "var(--warn)"],
  tide: [
    "var(--accent-bright)",
    "color-mix(in oklch, var(--accent-bright), var(--signal))",
    "var(--signal)",
  ],
  ember: [
    "var(--danger)",
    "color-mix(in oklch, var(--danger), var(--warn))",
    "var(--warn)",
  ],
  mono: ["var(--foreground)", "var(--foreground)", "var(--foreground)"],
};

/** Glow on a dark page; ink on a pale one. Mono keeps its own lightness steps. */
const glowOf = (c: string, i: number, mono: boolean) =>
  mono
    ? `oklch(from ${c} ${[0.78, 0.94, 0.86][i] ?? 0.86} 0.02 h)`
    : `oklch(from ${c} 0.8 calc(c * 0.95) h)`;
const inkOf = (c: string, i: number, mono: boolean) =>
  mono
    ? `oklch(from ${c} ${[0.3, 0.46, 0.38][i] ?? 0.38} 0.02 h)`
    : `oklch(from ${c} 0.6 calc(c * 1.1) h)`;

/** Any CSS colour the canvas understands, as 0–1 sRGB, by painting one pixel. */
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

function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The crease's softness for the profile: 0.5 is a near-sine, 0.995 a triangle. */
const softnessOf = (crease: number) => 0.5 + 0.495 * clamp(crease, 0, 1);

type View = { tilt: number; yaw: number; cam: number; centre: number };

/**
 * One point of the folded sheet, in the fan's own units (radius 1): the
 * same geometry the vertex shader runs, for fitting the fan to its box and
 * for the server's still frame.
 */
function fanPoint(
  open: number,
  rho: number,
  x: number,
  n: number,
  k: number,
  view: View,
): { x: number; y: number; z: number; lean: number } {
  // Past either end the fold stops at flat and at nearly shut.
  const a = clamp(FOLD_CLOSED + (FOLD_OPEN - FOLD_CLOSED) * open, 0, 1.5);
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const d0 = SPAN / n;
  const phi = (x - n / 2) * d0 * ca;
  const r = INNER + (1 - INNER) * rho;
  const cx = Math.cos(Math.PI * x);
  const prof = Math.asin(k * cx) / Math.asin(k);
  const dprof =
    (-k * Math.PI * Math.sin(Math.PI * x)) /
    (Math.sqrt(Math.max(1e-4, 1 - k * k * cx * cx)) * Math.asin(k));
  const hz = 0.5 * d0 * sa;
  // Tangents along the angle and the radius; their cross is the face.
  const tp = [
    r * ca * Math.cos(phi),
    -r * ca * Math.sin(phi),
    (r * hz * dprof) / d0,
  ];
  const tr = [Math.sin(phi), Math.cos(phi), hz * prof];
  const nx = (tr[1] ?? 0) * (tp[2] ?? 0) - (tr[2] ?? 0) * (tp[1] ?? 0);
  const ny = (tr[2] ?? 0) * (tp[0] ?? 0) - (tr[0] ?? 0) * (tp[2] ?? 0);
  const nz = (tr[0] ?? 0) * (tp[1] ?? 0) - (tr[1] ?? 0) * (tp[0] ?? 0);
  const nl = Math.hypot(nx, ny, nz) || 1;
  const lean = (nx * Math.cos(phi) - ny * Math.sin(phi)) / nl;
  // About the fan's middle: the top leans away, then the whole turns.
  let px = r * Math.sin(phi);
  let py = r * Math.cos(phi) - view.centre;
  let pz = r * hz * prof;
  const ct = Math.cos(view.tilt);
  const st = Math.sin(view.tilt);
  const ty = py * ct + pz * st;
  pz = -py * st + pz * ct;
  py = ty;
  const cy = Math.cos(view.yaw);
  const sy = Math.sin(view.yaw);
  const tx = px * cy + pz * sy;
  pz = -px * sy + pz * cy;
  px = tx;
  const s = view.cam / (view.cam - pz);
  return { x: px * s, y: -py * s, z: pz, lean };
}

const VERTEX = `
in vec3 a_pt;
uniform vec2 u_size;
uniform float u_scale;
uniform vec2 u_anchor;
uniform float u_R;
uniform float u_n;
uniform float u_open;
uniform float u_k;
uniform float u_ak;
uniform float u_tilt;
uniform float u_yaw;
uniform float u_cam;
uniform float u_centre;
uniform float u_point;
uniform float u_time;
uniform float u_shimmer;
uniform float u_glow;
uniform float u_light;
uniform float u_press;
uniform vec3 u_c0;
uniform vec3 u_c1;
uniform vec3 u_c2;
out vec3 v_col;
out float v_a;
out float v_hot;

const float PI = 3.14159265;

void main() {
  float a = clamp(mix(${FOLD_CLOSED.toFixed(2)}, ${FOLD_OPEN.toFixed(2)}, u_open), 0.0, 1.5);
  float ca = cos(a);
  float sa = sin(a);
  float d0 = ${SPAN.toFixed(2)} / u_n;
  float x = a_pt.y;
  float phi = (x - 0.5 * u_n) * d0 * ca;
  float rho = a_pt.x;
  float r = mix(${INNER.toFixed(2)}, 1.0, rho);
  float cx = cos(PI * x);
  float prof = asin(u_k * cx) / u_ak;
  float dprof = -u_k * PI * sin(PI * x) / (sqrt(max(1e-4, 1.0 - u_k * u_k * cx * cx)) * u_ak);
  float hz = 0.5 * d0 * sa;
  vec3 P = vec3(r * sin(phi), r * cos(phi) - u_centre, r * hz * prof);
  vec3 tp = vec3(r * ca * cos(phi), -r * ca * sin(phi), r * hz * dprof / d0);
  vec3 tr = vec3(sin(phi), cos(phi), hz * prof);
  vec3 N = normalize(cross(tr, tp));
  // The face's lean across the fan picks its colour: one way, the crease, the other way.
  float lean = dot(N, vec3(cos(phi), -sin(phi), 0.0));
  // Normalised so a resting fan reaches the palette's ends and an open one keeps a hint of them.
  float t = clamp(0.5 + 0.5 * lean / 0.8, 0.0, 1.0);
  vec3 col = t < 0.5 ? mix(u_c0, u_c1, t * 2.0) : mix(u_c1, u_c2, t * 2.0 - 1.0);

  float ct = cos(u_tilt);
  float st = sin(u_tilt);
  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  P = vec3(P.x, P.y * ct + P.z * st, -P.y * st + P.z * ct);
  P = vec3(P.x * cy + P.z * sy, P.y, -P.x * sy + P.z * cy);
  N = vec3(N.x, N.y * ct + N.z * st, -N.y * st + N.z * ct);
  N = vec3(N.x * cy + N.z * sy, N.y, -N.x * sy + N.z * cy);
  float s = u_cam / (u_cam - P.z);
  vec2 screen = u_anchor + vec2(P.x, -P.y) * s * u_R;
  gl_Position = vec4(screen.x / u_size.x * 2.0 - 1.0, 1.0 - screen.y / u_size.y * 2.0, 0.0, 1.0);

  // Faces turned to the eye glow; a soft light from the upper left adds a sheen.
  float facing = abs(N.z);
  float sheen = pow(max(dot(N * sign(N.z), normalize(vec3(-0.5, 0.45, 0.74))), 0.0), 4.0);
  float bright = (0.42 + 0.58 * facing) * (0.72 + 0.9 * sheen);
  float shimmer = 1.0 + u_shimmer * 0.38 * sin(rho * 7.0 - u_time * 1.3 + a_pt.z * 6.2831);
  // A closed fan crowds its points; each one gives a little less so the bundle does not burn out.
  float crowd = mix(0.5, 1.0, ca / ${Math.cos(FOLD_OPEN).toFixed(3)});
  float inner = smoothstep(0.0, 0.2, rho);
  v_col = col;
  v_a = clamp(bright * shimmer * crowd * inner * (0.6 + 0.6 * u_glow) * (1.0 + 0.35 * u_press), 0.0, 1.0);
  v_hot = u_light > 0.5 ? 0.0 : clamp((sheen * 0.8 + u_press * 0.4) * u_glow, 0.0, 1.0);
  gl_PointSize = max(1.0, u_point * s * u_scale * (0.8 + 0.35 * facing) * (1.0 + 0.12 * u_press));
}
`;

const FRAGMENT = `
in vec3 v_col;
in float v_a;
in float v_hot;
uniform float u_light;
out vec4 outColor;

void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float d = dot(q, q);
  if (d > 1.0) discard;
  float soft = u_light > 0.5 ? smoothstep(1.0, 0.45, d) : exp(-d * 2.4) * smoothstep(1.0, 0.7, d);
  float a = v_a * soft;
  vec3 col = mix(v_col, vec3(1.0), v_hot * exp(-d * 5.0));
  outColor = vec4(col * a, a);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  count: number;
  lost: boolean;
};

type Config = {
  pleats: number;
  density: number;
  colorKey: string;
  crease: number;
  tilt: number;
  glow: number;
  sway: number;
  rest: number;
  springBack: boolean;
  interactive: boolean;
  disabled: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  /** The hand takes the sheet (a drag or a held key). */
  hold: () => void;
  /** Where the hand has the sheet now, 0–1, unclamped (rubber-banded here). */
  holdAt: (open: number) => void;
  /** The hand lets go with a velocity in openings per second. */
  release: (velocity: number) => number;
  /** A key's step: glides to `open` and holds there. */
  stepTo: (open: number) => void;
  /** Where the sheet is heading. */
  current: () => number;
  /** Where the sheet is drawn now. */
  position: () => number;
  /** The pointer over the sheet, -1..1 across and down; null when it leaves. */
  lean: (x: number | null, y: number) => void;
  press: (down: boolean) => void;
  /** The fan's width on screen, px, for the drag's scale. */
  span: () => number;
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
  let entered = false;
  let entranceAt = 0;
  const read = rgbReader();
  const colours = new Float32Array(9);
  let light = 0;
  const size = { w: 0, h: 0, R: 1, ax: 0, ay: 0, width: 1 };
  const sim = { t: 0 };
  /** The opening, its velocity, where its spring is heading and on which spring. */
  const open = {
    x: 0.5,
    v: 0,
    target: 0.5,
    held: false,
    spring: springs.drift as Spring,
  };
  const leanX = { x: 0, v: 0, target: 0 };
  const leanY = { x: 0, v: 0, target: 0 };
  const pressed = { x: 0, v: 0, target: 0 };

  const view = (c: Config, yaw = 0): View => ({
    tilt: (clamp(c.tilt, 0, 60) * Math.PI) / 180,
    yaw,
    cam: 3.2,
    centre: 0.5,
  });

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true });
    if (!gl) return false;
    const program = createProgram(gl, VERTEX, FRAGMENT);
    if (!program) return false;
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    if (!vao || !buffer) {
      program.dispose();
      return false;
    }
    gpu = { gl, program, vao, buffer, count: 0, lost: false };
    return true;
  };

  const releaseGpu = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.gl.deleteVertexArray(g.vao);
    g.gl.deleteBuffer(g.buffer);
    g.program.dispose();
  };

  /** The lattice: rows along the radius, columns along the angle with one on every crease. */
  const lay = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost) return;
    const n = Math.round(clamp(c.pleats, 6, 24));
    const d = clamp(c.density, 0, 1);
    // Dense along the radius and sparser across, so the ribs read as a fan.
    const rows = Math.round(13 + 23 * d);
    const per = Math.round(2 + 5 * d);
    const cols = n * per + 1;
    const data = new Float32Array(rows * cols * 3);
    const rand = lcg(c.seed * 7 + 3);
    let o = 0;
    for (let i = 0; i < rows; i += 1) {
      const rho = rows > 1 ? i / (rows - 1) : 1;
      for (let j = 0; j < cols; j += 1) {
        data[o] = rho;
        data[o + 1] = j / per;
        data[o + 2] = rand();
        o += 3;
      }
    }
    const { gl, program, vao, buffer } = p;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const at = program.attributes.a_pt;
    if (at !== undefined) {
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, 3, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    p.count = rows * cols;
  };

  /**
   * The fan's radius and anchor for this box: the union of its outline
   * closed and over-opened, so it never moves as it folds.
   */
  const fit = () => {
    const c = cfg;
    if (!c || size.w < 1) return;
    const n = Math.round(clamp(c.pleats, 6, 24));
    const k = softnessOf(c.crease);
    const v = view(c);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const o of [0, 0.5, 1]) {
      for (const rho of [0, 1]) {
        for (let j = 0; j <= n * 2; j += 1) {
          const q = fanPoint(o, rho, j / 2, n, k, v);
          minX = Math.min(minX, q.x);
          maxX = Math.max(maxX, q.x);
          minY = Math.min(minY, q.y);
          maxY = Math.max(maxY, q.y);
        }
      }
    }
    const padX = Math.max(10, size.w * 0.04);
    const padY = Math.max(6, size.h * 0.05);
    // A little room for the lean and the breathing.
    const R = Math.max(
      8,
      Math.min(
        (size.w - padX * 2) / ((maxX - minX) * 1.08),
        (size.h - padY * 2) / ((maxY - minY) * 1.03),
      ),
    );
    size.R = R;
    size.ax = size.w / 2 - ((minX + maxX) / 2) * R;
    size.ay = size.h - padY - maxY * R;
    const half = fanPoint(c.rest, 1, 0, n, k, v);
    size.width = Math.max(60, Math.abs(half.x) * 2 * R);
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const k = softnessOf(c.crease);
    const g = clamp(c.glow, 0, 1);
    const d = clamp(c.density, 0, 1);
    program.set({
      u_size: [size.w, size.h],
      u_scale: canvas.width / Math.max(1, size.w),
      u_anchor: [size.ax, size.ay],
      u_R: size.R,
      u_n: Math.round(clamp(c.pleats, 6, 24)),
      u_k: k,
      u_ak: Math.asin(k),
      u_tilt: (clamp(c.tilt, 0, 60) * Math.PI) / 180,
      u_cam: 3.2,
      u_centre: 0.5,
      u_point: (light ? 3 : 3.4) * (1.4 - 0.6 * d) * (0.7 + 0.6 * g),
      u_glow: g,
      u_light: light,
      u_c0: [colours[0] ?? 0, colours[1] ?? 0, colours[2] ?? 0],
      u_c1: [colours[3] ?? 0, colours[4] ?? 0, colours[5] ?? 0],
      u_c2: [colours[6] ?? 0, colours[7] ?? 0, colours[8] ?? 0],
    });
    gl.useProgram(program.program);
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const s = clamp(c.sway, 0, 1);
    const breathing = c.motionSafe && !c.paused ? s : 0;
    const yaw =
      leanX.x * 0.16 + breathing * 0.07 * Math.sin(sim.t * 0.42 + 0.6);
    const tiltLean =
      leanY.x * 0.09 + breathing * 0.035 * Math.sin(sim.t * 0.31 + 1.7);
    program.set({
      u_open: open.x,
      u_yaw: yaw,
      u_tilt: (clamp(c.tilt, 0, 60) * Math.PI) / 180 + tiltLean,
      u_time: sim.t,
      u_shimmer: breathing,
      u_press: Math.max(0, pressed.x),
    });
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    if (light) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindVertexArray(p.vao);
    gl.drawArrays(gl.POINTS, 0, p.count);
    gl.bindVertexArray(null);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const integrate = (
    s: { x: number; v: number; target: number },
    k: Spring,
    h: number,
  ) => {
    s.v += ((k.stiffness * (s.target - s.x) - k.damping * s.v) / k.mass) * h;
    s.x += s.v * h;
  };

  const settled = (s: { x: number; v: number; target: number }, eps: number) =>
    Math.abs(s.target - s.x) < eps && Math.abs(s.v) < eps * 10;

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && clamp(c.sway, 0, 1) > 0) {
      sim.t += dt;
      moving = true;
    }
    if (entranceAt > 0) {
      entranceAt -= dt;
      if (entranceAt <= 0) {
        entranceAt = 0;
        open.target = clamp(c.rest, 0, 1);
      }
      moving = true;
    }
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i += 1) {
      if (!open.held) integrate(open, open.spring, h);
      integrate(leanX, springs.glide, h);
      integrate(leanY, springs.glide, h);
      integrate(pressed, springs.flick, h);
    }
    if (!open.held) {
      if (settled(open, 0.0005)) {
        open.x = open.target;
        open.v = 0;
      } else moving = true;
    }
    for (const s of [leanX, leanY, pressed]) {
      if (settled(s, 0.001)) {
        s.x = s.target;
        s.v = 0;
      } else moving = true;
    }
    return moving || open.held;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Only the breathing left: thirty frames a second is plenty.
    const calm =
      !open.held &&
      open.v === 0 &&
      leanX.v === 0 &&
      leanY.v === 0 &&
      pressed.v === 0 &&
      entranceAt === 0;
    if (calm && last && now - drawnAt < CALM_FRAME) {
      frame = window.requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(0.05, (now - drawnAt) / 1000) : 1 / 60;
    last = now;
    drawnAt = now;
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

  /** Reduced motion: everything stands where it is asked to be. */
  const place = () => {
    for (const s of [open, leanX, leanY, pressed]) {
      s.x = s.target;
      s.v = 0;
    }
    leanX.x = 0;
    leanY.x = 0;
    pressed.x = 0;
    entranceAt = 0;
  };

  const readColours = () => {
    const kids = carriers.children;
    const bg = new Float32Array(3);
    const first = kids[0];
    if (first) read(getComputedStyle(first).color, bg, 0);
    const lum =
      0.2126 * (bg[0] ?? 0) + 0.7152 * (bg[1] ?? 0) + 0.0722 * (bg[2] ?? 0);
    light = lum > 0.5 ? 1 : 0;
    // Carriers 1–3 are the glows, 4–6 the inks.
    for (let i = 0; i < 3; i += 1) {
      const el = kids[1 + i + (light ? 3 : 0)];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    statics();
  };

  /** Starts the sheet: an unfold the first time it is seen, at rest otherwise. */
  const enter = () => {
    const c = cfg;
    if (!c || entered || !visible.current) return;
    entered = true;
    if (!c.motionSafe) {
      open.target = clamp(c.rest, 0, 1);
      place();
      return;
    }
    // The fan flicks open: from closed to rest on the snap spring.
    open.x = 0;
    open.v = 0;
    open.target = 0;
    open.spring = springs.snap;
    entranceAt = ENTRANCE_DELAY;
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
    fit();
    statics();
    enter();
    draw();
    kick();
  };

  const startGpu = () => {
    if (!build()) return false;
    lay();
    readColours();
    resize();
    return true;
  };

  let detach: () => void = () => {};

  const goTo = (target: number, k: Spring, velocity = 0) => {
    open.held = false;
    open.target = target;
    open.spring = k;
    open.v = velocity;
    if (!cfg?.motionSafe) {
      open.x = target;
      open.v = 0;
      draw();
      return;
    }
    kick();
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!gpu) {
        open.x = clamp(next.rest, 0, 1);
        open.target = open.x;
        if (!startGpu()) {
          // No WebGL2: the SVG still stays, and nothing retries.
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
        was.pleats !== next.pleats ||
        was.density !== next.density ||
        was.seed !== next.seed
      )
        lay();
      if (
        was.dpr !== next.dpr ||
        was.pleats !== next.pleats ||
        was.crease !== next.crease ||
        was.tilt !== next.tilt ||
        was.rest !== next.rest
      ) {
        resize();
      }
      if (was.colorKey !== next.colorKey) readColours();
      else statics();
      if (!open.held && was.rest !== next.rest && entranceAt === 0) {
        open.target = clamp(next.rest, 0, 1);
        open.spring = springs.drift;
      }
      if (!next.motionSafe) place();
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      draw();
    },
    wake() {
      enter();
      draw();
      kick();
    },
    hold() {
      open.held = true;
      open.v = 0;
      entranceAt = 0;
      kick();
    },
    holdAt(o) {
      open.held = true;
      open.x = rubberClamp(o, 0, 1, 0.3);
      open.target = open.x;
      if (!cfg?.motionSafe) {
        draw();
        return;
      }
      kick();
    },
    release(velocity) {
      const c = cfg;
      if (!c) return open.x;
      if (c.springBack) {
        const to = clamp(c.rest, 0, 1);
        goTo(to, springs.drift, c.motionSafe ? velocity : 0);
        return to;
      }
      // A free stop: a throw comes to rest where it was heading.
      const to = clamp(project(open.x, velocity, 0.995), 0, 1);
      goTo(to, springs.glide, c.motionSafe ? velocity : 0);
      return to;
    },
    stepTo(o) {
      const c = cfg;
      if (!c) return;
      open.held = false;
      entranceAt = 0;
      goTo(clamp(o, 0, 1), springs.snap, open.v);
    },
    current: () =>
      entranceAt > 0 && cfg ? clamp(cfg.rest, 0, 1) : open.target,
    position: () => open.x,
    lean(x, y) {
      const c = cfg;
      if (!c) return;
      if (x === null || !c.interactive || !c.motionSafe) {
        leanX.target = 0;
        leanY.target = 0;
      } else {
        leanX.target = clamp(x, -1, 1);
        leanY.target = clamp(y, -1, 1);
      }
      if (!c.motionSafe) place();
      kick();
    },
    press(down) {
      pressed.target = down && cfg?.motionSafe ? 1 : 0;
      kick();
    },
    span: () => size.width,
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      releaseGpu();
    },
  };
}

/**
 * A fan-shaped sheet of glowing points, pinned under the bottom edge and
 * folded into accordion pleats in real 3D. Each panel keeps its flat
 * width, so as the folds steepen the fan narrows and its pleats deepen; the
 * crease profile is a smoothed triangle wave, so the surface turns
 * continuously through every crease. Each point is tinted by the way its
 * face leans — one end of the palette, the creases in the middle, the
 * other end — so a quiet spectrum runs crease to crease, and opening the
 * fan sweeps the colour toward the middle as the faces flatten. Faces
 * turned to the eye glow and foreshortened faces crowd their points, so
 * the folds read in depth.
 *
 * A sideways drag opens and closes it 1:1 and rubber-bands past either end;
 * let go, it eases back to `rest` on the drift spring with the release
 * velocity. The first time it is seen it flicks open from closed on the
 * snap spring. It is a `role="slider"`: arrow keys open and close it while
 * held and let it ease back when let go. One WebGL2 draw of points placed
 * by the vertex shader; under reduced motion one still fold.
 */
export function PleatField({
  pleats = 12,
  density = 0.5,
  palette = "prism",
  colors,
  rest = 0.5,
  springBack = true,
  crease = 0.6,
  tilt = 20,
  glow = 0.6,
  sway = 0.4,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Pleated sheet",
  onOpenChange,
  disabled = false,
  className,
}: PleatFieldProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const tones = React.useMemo(() => {
    const base = PALETTES[palette] ?? PALETTES.prism;
    const picked = colors && colors.length >= 2 ? colors : base;
    const three = [
      picked[0] ?? base[0],
      picked.length >= 3
        ? (picked[1] ?? base[1])
        : `color-mix(in oklch, ${picked[0] ?? base[0]}, ${picked[1] ?? base[2]})`,
      picked[picked.length - 1] ?? base[2],
    ];
    return three;
  }, [palette, colors]);
  const mono = !colors && palette === "mono";
  const paints = React.useMemo(
    () => [
      "var(--background)",
      ...tones.map((c, i) => glowOf(c, i, mono)),
      ...tones.map((c, i) => inkOf(c, i, mono)),
    ],
    [tones, mono],
  );
  const restAt = clamp(rest, 0, 1);
  const [valueNow, setValueNow] = React.useState(Math.round(restAt * 100));
  const [active, setActive] = React.useState(false);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  // Nothing draws until the observer has said the sheet is on screen.
  const visible = React.useRef(false);
  const dragStart = React.useRef(0);
  const keyTimer = React.useRef<number | null>(null);
  const keyHeld = React.useRef(false);
  const told = React.useRef(restAt);
  const report = React.useRef(onOpenChange);

  const config: Config = {
    pleats,
    density,
    colorKey: paints.join("|"),
    crease,
    tilt,
    glow,
    sway,
    rest: restAt,
    springBack,
    interactive,
    disabled,
    paused,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onOpenChange;
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
    const timer = keyTimer;
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
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

  /** Tells the host and the slider where the sheet is heading. */
  const tell = (open: number, always = false) => {
    const o = Math.round(clamp(open, 0, 1) * 100) / 100;
    setValueNow(Math.round(o * 100));
    if (o === told.current && !always) return;
    told.current = o;
    report.current?.(o);
  };

  const live = interactive && !disabled;

  const drag = useDrag({
    axis: "x",
    threshold: 3,
    disabled: !live,
    onStart: () => {
      const e = engine.current;
      if (!e) return;
      // The drag takes the sheet from where it is drawn, not where it was heading.
      dragStart.current = e.position();
      e.hold();
      setActive(true);
    },
    onMove: ({ offset }) => {
      const e = engine.current;
      if (!e) return;
      const o = dragStart.current + (offset.x / e.span()) * 1.1;
      e.holdAt(o);
      tell(o);
    },
    onEnd: ({ velocity }) => {
      const e = engine.current;
      setActive(false);
      e?.press(false);
      if (!e) return;
      tell(e.release((velocity.x / e.span()) * 1.1), true);
    },
    onCancel: () => {
      const e = engine.current;
      setActive(false);
      e?.press(false);
      if (!e) return;
      tell(e.release(0), true);
    },
    onTap: () => engine.current?.press(false),
  });

  const leanFrom = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return;
    const r = root.getBoundingClientRect();
    engine.current?.lean(
      ((clientX - r.left) / Math.max(1, r.width)) * 2 - 1,
      ((clientY - r.top) / Math.max(1, r.height)) * 2 - 1,
    );
  };

  const letKeyGo = () => {
    keyHeld.current = false;
    if (keyTimer.current !== null) window.clearTimeout(keyTimer.current);
    keyTimer.current = window.setTimeout(() => {
      keyTimer.current = null;
      const e = engine.current;
      if (!e || keyHeld.current) return;
      setActive(false);
      if (latest.current.springBack) tell(e.release(0), true);
    }, KEY_HOLD);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const e = engine.current;
    if (!e || !live) return;
    const now = e.current();
    const steps: Record<string, number> = {
      ArrowRight: now + KEY_STEP,
      ArrowUp: now + KEY_STEP,
      ArrowLeft: now - KEY_STEP,
      ArrowDown: now - KEY_STEP,
      PageUp: now + PAGE_STEP,
      PageDown: now - PAGE_STEP,
      Home: 0,
      End: 1,
    };
    const to = steps[event.key];
    if (to === undefined) return;
    event.preventDefault();
    keyHeld.current = true;
    if (keyTimer.current !== null) window.clearTimeout(keyTimer.current);
    keyTimer.current = null;
    setActive(true);
    const next = Math.round(clamp(to, 0, 1) * 100) / 100;
    e.stepTo(next);
    tell(next);
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!live) return;
    if (
      [
        "ArrowRight",
        "ArrowUp",
        "ArrowLeft",
        "ArrowDown",
        "PageUp",
        "PageDown",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      letKeyGo();
    }
  };

  const still = React.useMemo(
    () => standIn(pleats, crease, tilt, restAt, uid),
    [pleats, crease, tilt, restAt, uid],
  );

  return (
    <div
      ref={bindRoot}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-describedby={hintId}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={valueNow}
      aria-valuetext={`${valueNow}% open`}
      aria-disabled={disabled || undefined}
      aria-orientation="horizontal"
      data-active={active ? "" : undefined}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        if (keyHeld.current) letKeyGo();
      }}
      onPointerDown={(event) => {
        if (!live) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;
        engine.current?.press(true);
        drag.onPointerDown(event);
      }}
      onPointerMove={(event) => {
        drag.onPointerMove(event);
        if (event.pointerType !== "touch")
          leanFrom(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        drag.onPointerUp(event);
        engine.current?.press(false);
      }}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") engine.current?.lean(null, 0);
      }}
      className={cn(
        "group/pleat-field relative isolate h-full w-full overflow-clip select-none",
        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        live
          ? "cursor-ew-resize touch-pan-y data-active:cursor-grabbing"
          : "touch-auto",
        disabled && "opacity-60",
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${still.w} ${still.h}`}
        preserveAspectRatio="xMidYMax meet"
        className="pointer-events-none absolute inset-0 size-full group-data-live/pleat-field:hidden"
      >
        <defs>
          {still.dots.map((d, i) => (
            <pattern
              key={d}
              id={d}
              width={6}
              height={6}
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx={3}
                cy={3}
                r={1.1}
                style={{ fill: inkOrGlow(tones[i * 2] ?? tones[0] ?? "") }}
              />
            </pattern>
          ))}
        </defs>
        {still.panels.map((p, i) => (
          <g key={i}>
            <polygon
              points={p.points}
              style={{
                fill: inkOrGlow(tones[p.side ? 2 : 0] ?? ""),
                fillOpacity: p.shade,
              }}
            />
            <polygon
              points={p.points}
              fill={`url(#${still.dots[p.side ? 1 : 0] ?? ""})`}
              opacity={0.85}
            />
          </g>
        ))}
        <path
          d={still.creases}
          fill="none"
          strokeWidth={1}
          style={{ stroke: inkOrGlow(tones[1] ?? "") }}
          opacity={0.7}
        />
      </svg>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
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
      <span id={hintId} className="sr-only">
        {springBack
          ? "Drag sideways, or hold the arrow keys, to open or close the folds; let go and it eases back to rest."
          : "Drag sideways, or use the arrow keys, to open or close the folds."}
      </span>
    </div>
  );
}

/** A colour that reads on either page for the still frame: the pigment at a middle lightness. */
const inkOrGlow = (c: string) => `oklch(from ${c} 0.68 calc(c * 0.9) h)`;

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the same fold at rest as flat panels, each filled
 * with its lean's colour and a fine dot screen, creases drawn as hairlines.
 */
function standIn(
  pleats: number,
  crease: number,
  tilt: number,
  rest: number,
  uid: string,
) {
  const n = Math.round(clamp(pleats, 6, 24));
  const k = softnessOf(crease);
  const v: View = {
    tilt: (clamp(tilt, 0, 60) * Math.PI) / 180,
    yaw: 0,
    cam: 3.2,
    centre: 0.5,
  };
  const w = 400;
  const h = 210;
  const pts: { x: number; y: number }[][] = [];
  let minX = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let minY = Infinity;
  for (let j = 0; j <= n; j += 1) {
    const inner = fanPoint(rest, 0, j, n, k, v);
    const outer = fanPoint(rest, 1, j, n, k, v);
    pts.push([inner, outer]);
    for (const q of [inner, outer]) {
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
  }
  const R = Math.min((w * 0.92) / (maxX - minX), (h * 0.88) / (maxY - minY));
  const ox = w / 2 - ((minX + maxX) / 2) * R;
  const oy = h - h * 0.05 - maxY * R;
  const at = (q: { x: number; y: number }) =>
    `${r3(ox + q.x * R)},${r3(oy + q.y * R)}`;
  const panels: { points: string; side: boolean; shade: number }[] = [];
  let creases = "";
  for (let j = 0; j < n; j += 1) {
    const a = pts[j];
    const b = pts[j + 1];
    if (!a || !b || !a[0] || !a[1] || !b[0] || !b[1]) continue;
    const mid = fanPoint(rest, 0.5, j + 0.5, n, k, v);
    panels.push({
      points: `${at(a[0])} ${at(a[1])} ${at(b[1])} ${at(b[0])}`,
      side: mid.lean > 0,
      shade: r3(0.08 + 0.1 * Math.abs(mid.lean)),
    });
  }
  for (const [inner, outer] of pts) {
    if (inner && outer) creases += `M${at(inner)}L${at(outer)}`;
  }
  const safe = uid.replace(/[^a-zA-Z0-9]/g, "");
  return {
    w,
    h,
    panels,
    creases,
    dots: [`pf${safe}a`, `pf${safe}b`],
  };
}
