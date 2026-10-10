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

export type WindowShaftsProps = {
  /** The content in the room: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The sun's angle from vertical, degrees: low numbers fall steeply, high ones rake across. @default 38 */
  angle?: number;
  /** The light's colour, 0 (neutral daylight) to 1 (deep amber); the shade cools against it. @default 0.6 */
  warmth?: number;
  /** How much dust hangs in the air and glints in the beams, 0 to 1. @default 0.5 */
  dust?: number;
  /** Columns of glass in the window, 2 to 5. @default 3 */
  panes?: number;
  /** Rows of glass in the window, 1 to 4. @default 2 */
  rows?: number;
  /** Where the patch of light lands across the box, 0 (left) to 1 (right); narrow boxes push it further right. @default 0.64 */
  position?: number;
  /** How soft the shadow bars' edges are, 0 (crisp) to 1. @default 0.4 */
  softness?: number;
  /** How plainly the beams show in the air, 0 to 1. @default 0.5 */
  haze?: number;
  /** How fast the sun and the dust move, 0 (still) to 2. @default 1 */
  speed?: number;
  /** The pointer and keyboard focus move the sun, and a press stirs the dust. @default true */
  interactive?: boolean;
  /** How far the hand moves the sun and how hard a press stirs the dust, 0 to 1. @default 0.6 */
  pointerStrength?: number;
  /** Hold the sun and the dust still; the hand still moves the sun. @default false */
  paused?: boolean;
  /** Seeds the dust and the haze, so two rooms never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) moving the sun. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press (or keyboard focus) stirs the dust. */
  onStir?: () => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

const RENDER_SCALE = 0.75;
const STEP = 1 / 120;
const CALM_FRAME = 31;
/** A stir's push into the drift spring, radians a second at full strength. */
const STIR = 16;
const DRIFT = springs.drift;
/** Ambient time for a still frame: a seeded afternoon, not the first instant. */
const STILL = 30;
const DEG = Math.PI / 180;

/** Sunlight as pigments: the neutral end and the amber end of warmth. */
const DAYLIGHT = "oklch(0.97 0.018 95)";
const AMBER = "oklch(0.8 0.13 62)";

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

/** What a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_res;
uniform float u_px;
uniform float u_time;
uniform float u_light;
uniform vec3 u_bg;
uniform vec3 u_fg;
uniform vec3 u_day;
uniform vec3 u_amber;
uniform float u_warm;
uniform vec2 u_origin;
uniform vec2 u_across;
uniform vec2 u_along;
uniform float u_panes;
uniform float u_rows;
uniform float u_bar;
uniform float u_soft;
uniform float u_haze;
uniform float u_dust;
uniform vec4 u_stir;
uniform float u_glint;
uniform vec2 u_seed;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash2(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 3; i++) {
    s += a * noise(p);
    p = turn * p * 2.03 + 3.7;
    a *= 0.5;
  }
  return s / 0.875;
}
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 srgb(vec3 c) { return pow(max(c, 0.0), vec3(1.0 / 2.2)); }

// Lit between the bars: 1 in the glass, 0 on a bar, soft at the edges.
// d is the distance from the nearest bar's middle, px.
float glass(float d, float bar, float pen) {
  return smoothstep(bar - pen, bar + pen, d);
}

void main() {
  vec2 size = u_res / u_px;
  vec2 p = v_uv * size;
  float t = u_time;

  // Window space: u across the panes, v along the sun's travel. The lit
  // on the wall is the window's image, so the frame's shadows are its bars.
  vec2 rel = p - u_origin;
  float det = u_across.x * u_along.y - u_across.y * u_along.x;
  float u = (rel.x * u_along.y - rel.y * u_along.x) / det;
  float v = (u_across.x * rel.y - u_across.y * rel.x) / det;
  float W = length(u_across);
  float len = length(u_along);
  vec2 dir = u_along / len;

  // The penumbra widens the further the light has come from the opening.
  float pen = 1.2 + u_soft * 12.0 * (0.25 + clamp(v, 0.0, 1.0));
  float cu = u * u_panes;
  float dCol = abs(fract(cu + 0.5) - 0.5) / u_panes * W;
  float edgeU = min(u, 1.0 - u) * W;
  float litU = glass(dCol, u_bar, pen) * smoothstep(-pen, pen, edgeU - u_bar);
  float cv = v * u_rows;
  float dRow = abs(fract(cv + 0.5) - 0.5) / u_rows * len;
  float edgeV = min(v, 1.0 - v) * len;
  float litV = glass(dRow, u_bar * 0.85, pen) * smoothstep(-pen, pen, edgeV - u_bar * 0.85);
  float lit = litU * litV;

  // The beams in the air: the columns only (the cross bars wash out along
  // the beam), from the edge of the frame down to the lit.
  float across = dot(p, vec2(-dir.y, dir.x));
  float down = dot(p, dir);
  float hz = fbm(vec2(across / 46.0, down / 150.0 - t * 0.12) + u_seed);
  float airPen = 3.0 + u_soft * 16.0;
  float beamAir = glass(dCol, u_bar, airPen) * smoothstep(-airPen, airPen, edgeU - u_bar);
  float upstream = smoothstep(0.02, -0.06, v);
  // Dust is what makes a beam visible: more of it, plainer shafts.
  float dusty = 0.45 + 1.1 * u_dust;
  float shaft = beamAir * upstream * (0.5 + 0.5 * exp(v * 0.9)) * u_haze * dusty * (0.3 + 1.1 * hz * hz);
  // Over the lit the air still carries some beam.
  float overPatch = beamAir * smoothstep(1.04, 0.96, v) * (1.0 - upstream) * u_haze * dusty * 0.25 * (0.5 + hz);

  // Bounce: the lit warms the wall around it.
  vec2 centre = u_origin + 0.5 * (u_across + u_along);
  vec2 off = p - centre;
  float bounce = exp(-dot(off, off) / pow(max(W, len) * 0.95, 2.0));

  // Dust: two depths of motes drifting on slow air, glinting only in a beam.
  float motes = 0.0;
  vec2 s = p - u_stir.xy;
  float swirl = u_stir.z * exp(-dot(s, s) / (u_stir.w * u_stir.w));
  float cs = cos(swirl);
  float sn = sin(swirl);
  vec2 q0 = u_stir.xy + mat2(cs, sn, -sn, cs) * s;
  float glintBoost = 1.0 + 2.5 * u_glint * exp(-dot(s, s) / (u_stir.w * u_stir.w * 2.0));
  float inBeam = max(beamAir * smoothstep(1.05, 0.9, v), 0.0);
  for (int j = 0; j < 2; j++) {
    float fj = float(j);
    float cell = 22.0 + fj * 20.0;
    vec2 wind = vec2(3.5, -2.2) * t * (0.6 + 0.5 * fj);
    vec2 q = (q0 + wind) / cell;
    vec2 id = floor(q);
    if (hash(id * 1.31 + fj * 17.0 + u_seed) > u_dust * 0.85) continue;
    vec2 h = hash2(id + u_seed * (2.0 + fj));
    vec2 at = 0.2 + h * 0.6 + 0.12 * vec2(sin(t * 0.7 + h.x * 6.28), cos(t * 0.55 + h.y * 6.28));
    float d = length((fract(q) - at) * cell);
    float r = 0.75 + 0.6 * fj + h.y * 0.45;
    float dot1 = smoothstep(r + 0.9, r - 0.25, d);
    float glint = 0.3 + 0.7 * pow(0.5 + 0.5 * sin(t * (1.1 + h.x * 1.4) + h.y * 6.28), 6.0);
    motes += dot1 * glint * (0.7 + 0.3 * fj);
  }
  motes *= inBeam * glintBoost * (0.8 + 0.7 * u_dust);

  vec3 S = mix(lin(u_day), lin(u_amber), u_warm);
  vec3 hot = mix(S, vec3(1.0), 0.4);
  // The shade cools as the light warms.
  vec3 cool = mix(vec3(1.0), vec3(0.9, 0.96, 1.1), u_warm);
  vec3 wallDark = (lin(u_bg) * 1.15 + lin(u_fg) * 0.012) * cool;
  vec3 wallDay = lin(mix(u_bg, u_fg, 0.2)) * cool;
  float shade = 1.0 - 0.18 * smoothstep(0.3, 1.2, length((v_uv - vec2(0.62, 0.55)) * vec2(1.0, 1.4)));

  // Plaster: the faintest tooth, so the wall is a surface, not a fill.
  float plaster = 0.97 + 0.06 * noise(p / 3.0 + u_seed) * noise(p / 17.0 - u_seed);
  // The patch is brightest nearest the opening and fades a touch with distance.
  lit *= 1.12 - 0.28 * clamp(v, 0.0, 1.0);
  vec3 dark = wallDark * shade * plaster;
  float E = lit * 1.25 + shaft * 0.5 + overPatch * 0.4 + bounce * 0.07;
  dark = 1.0 - (1.0 - dark) * exp(-S * E);
  dark += hot * motes * 0.9;

  vec3 day = wallDay * shade * plaster;
  day = mix(day, hot * 1.06, clamp(lit * 0.82 + bounce * 0.08, 0.0, 0.9));
  day = mix(day, hot, clamp(shaft * 1.0 + overPatch * 0.5, 0.0, 0.7));
  day = 1.0 - (1.0 - day) * exp(-hot * motes * 1.4);

  vec3 col = mix(dark, day, u_light);
  outColor = vec4(srgb(col), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Config = {
  angle: number;
  warmth: number;
  dust: number;
  panes: number;
  rows: number;
  position: number;
  softness: number;
  haze: number;
  speed: number;
  interactive: boolean;
  pointerStrength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onStir: () => void;
};

type Source = "pointer" | "focus";

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: Source) => void;
  handAway: (source: Source) => void;
  /** Stir the air at (x, y); `hold` matters only under reduced motion. */
  stir: (x: number, y: number, strength: number, hold: boolean) => void;
  letGo: () => void;
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
  let active = false;
  const read = rgbReader();
  const colours = new Float32Array(12);
  const size = { w: 0, h: 0 };
  let light = 0;
  const sim = { t: STILL };
  const hand = {
    x: 0,
    y: 0,
    present: false,
    source: null as Source | null,
  };
  /** The sun: its turn (radians) and the patch's stretch, each on drift. */
  const sun = { turn: 0, turnV: 0, stretch: 1, stretchV: 0 };
  const stir = { x: 0, y: 0, angle: 0, v: 0, held: false };

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

  /** Where the hand wants the sun, written into one reused object: a turn and a stretch. */
  const aim = { turn: 0, stretch: 1 };
  const sunFor = (c: Config) => {
    aim.turn = 0;
    aim.stretch = 1;
    if (!hand.present || !c.interactive || size.w < 1) return aim;
    const s = clamp(c.pointerStrength, 0, 1);
    const nx = clamp((hand.x - size.w / 2) / (size.w / 2), -1, 1);
    const ny = clamp((hand.y - size.h / 2) / (size.h / 2), -1, 1);
    // Higher hand, higher sun, shorter patch.
    aim.turn = nx * 12 * DEG * s;
    aim.stretch = 1 + ny * 0.22 * s;
    return aim;
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const rand = lcg(c.seed * 23 + 9);
    program.use();
    gl.uniform2f(u.u_res ?? null, canvas.width, canvas.height);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_light ?? null, light);
    gl.uniform1f(u.u_warm ?? null, clamp(c.warmth, 0, 1));
    gl.uniform1f(u.u_panes ?? null, Math.round(clamp(c.panes, 1, 6)));
    gl.uniform1f(u.u_rows ?? null, Math.round(clamp(c.rows, 1, 5)));
    gl.uniform1f(u.u_soft ?? null, clamp(c.softness, 0, 1));
    gl.uniform1f(u.u_haze ?? null, clamp(c.haze, 0, 1));
    gl.uniform1f(u.u_dust ?? null, clamp(c.dust, 0, 1));
    gl.uniform2f(u.u_seed ?? null, rand() * 9, rand() * 9);
    const names = ["u_bg", "u_fg", "u_day", "u_amber"];
    for (let i = 0; i < 4; i += 1) {
      gl.uniform3f(
        u[names[i] ?? "u_bg"] ?? null,
        colours[i * 3] ?? 0,
        colours[i * 3 + 1] ?? 0,
        colours[i * 3 + 2] ?? 0,
      );
    }
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const { w, h } = size;
    const t = sim.t;
    // The afternoon moves on its own: a few degrees of sway, a slow slide.
    const theta =
      (clamp(c.angle, 5, 80) + 2.5 * Math.sin(t * 0.05)) * DEG + sun.turn;
    // On a narrow box the patch is smaller and further over, so a headline
    // on the left keeps its shade.
    const narrow = clamp((480 - w) / 200, 0, 1);
    const W = Math.max(w * 0.32, Math.min(120, w * 0.34));
    const len =
      (h * (0.72 - 0.1 * narrow) * sun.stretch) /
      Math.max(0.3, Math.cos(theta));
    const ax = W;
    const ay = W * 0.05;
    const bx = Math.sin(theta) * len;
    const by = Math.cos(theta) * len;
    const at = Math.max(clamp(c.position, 0, 1), 0.64 + 0.16 * narrow);
    const cx = w * (at + 0.03 * Math.sin(t * 0.031 + 1));
    const cy = h * 0.58;
    program.use();
    gl.uniform1f(u.u_time ?? null, t);
    gl.uniform2f(u.u_origin ?? null, cx - (ax + bx) / 2, cy - (ay + by) / 2);
    gl.uniform2f(u.u_across ?? null, ax, ay);
    gl.uniform2f(u.u_along ?? null, bx, by);
    gl.uniform1f(u.u_bar ?? null, clamp(W * 0.035, 3, 9));
    gl.uniform4f(
      u.u_stir ?? null,
      stir.x,
      stir.y,
      stir.angle,
      clamp(Math.min(w, h) * 0.45, 60, 200),
    );
    // Tumbling dust catches more light; under reduced motion a held press
    // shows the dust caught brighter, without the swirl.
    gl.uniform1f(
      u.u_glint ?? null,
      c.motionSafe
        ? Math.min(1, Math.abs(stir.angle) / 0.4)
        : stir.held
          ? 1
          : 0,
    );
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    if (!c.paused && c.speed > 0) {
      sim.t += dt * clamp(c.speed, 0, 2);
      moving = true;
    }
    const { turn, stretch } = sunFor(c);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      // The sun is heavy: it moves on drift, and so does the air it stirs.
      sun.turnV +=
        ((DRIFT.stiffness * (turn - sun.turn) - DRIFT.damping * sun.turnV) /
          DRIFT.mass) *
        h;
      sun.turn += sun.turnV * h;
      sun.stretchV +=
        ((DRIFT.stiffness * (stretch - sun.stretch) -
          DRIFT.damping * sun.stretchV) /
          DRIFT.mass) *
        h;
      sun.stretch += sun.stretchV * h;
      stir.v +=
        ((-DRIFT.stiffness * stir.angle - DRIFT.damping * stir.v) /
          DRIFT.mass) *
        h;
      stir.angle += stir.v * h;
    }
    const turning =
      Math.abs(turn - sun.turn) > 0.0005 ||
      Math.abs(sun.turnV) > 0.002 ||
      Math.abs(stretch - sun.stretch) > 0.0005 ||
      Math.abs(sun.stretchV) > 0.002;
    if (!turning) {
      sun.turn = turn;
      sun.turnV = 0;
      sun.stretch = stretch;
      sun.stretchV = 0;
    }
    const stirring = Math.abs(stir.angle) > 0.001 || Math.abs(stir.v) > 0.01;
    if (!stirring) {
      stir.angle = 0;
      stir.v = 0;
    }
    return moving || turning || stirring;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    const calm =
      !hand.present &&
      sun.turn === 0 &&
      sun.stretch === 1 &&
      stir.angle === 0 &&
      stir.v === 0;
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

  /** Reduced motion: the sun stands exactly where the hand puts it. */
  const place = () => {
    const c = cfg;
    if (!c) return;
    const { turn, stretch } = sunFor(c);
    sun.turn = turn;
    sun.turnV = 0;
    sun.stretch = stretch;
    sun.stretchV = 0;
    stir.angle = 0;
    stir.v = 0;
    sim.t = STILL;
  };

  const readColours = () => {
    const kids = carriers.children;
    for (let i = 0; i < 4; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    const lum =
      0.2126 * (colours[0] ?? 0) +
      0.7152 * (colours[1] ?? 0) +
      0.0722 * (colours[2] ?? 0);
    light = lum > 0.5 ? 1 : 0;
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
      if (was.dpr !== next.dpr) resize();
      statics();
      if (!next.interactive && hand.present) {
        hand.present = false;
        hand.source = null;
        setActive(false);
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
      draw();
      kick();
    },
    handTo(x, y, source) {
      const c = cfg;
      if (!c || !c.interactive) return;
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      if (!c.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
        return;
      }
      kick();
    },
    stir(x, y, strength, hold) {
      const c = cfg;
      if (!c || !c.interactive) return;
      stir.x = x;
      stir.y = y;
      c.onStir();
      if (!c.motionSafe) {
        stir.held = hold;
        place();
        draw();
        return;
      }
      // Alternate the turn so repeated stirs read as eddies, not a spin.
      const sign = stir.angle > 0 ? -1 : 1;
      stir.v +=
        sign * STIR * clamp(strength, 0, 1) * (0.4 + 0.6 * c.pointerStrength);
      kick();
    },
    letGo() {
      if (!stir.held) return;
      stir.held = false;
      if (cfg && !cfg.motionSafe) {
        place();
        draw();
      }
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

/**
 * A background of a wall in shade with late sun coming through a tall
 * window that is never seen. The window's light lands as a skewed patch —
 * its image along the sun's direction, the frame's mullions and transoms
 * casting soft shadow bars whose penumbra widens with distance — and
 * upstream of it the beams cross the air as parallel shafts, broken by
 * slow drifting haze. The patch warms the wall around it; the shade cools
 * as the light warms. The sun moves on its own: a few degrees of sway and
 * a slow slide, so the bars drift over tens of seconds. Dust hangs in two
 * depths and glints only where a beam catches it.
 *
 * The hand moves the sun — across turns its angle, up and down changes its
 * height and so the patch's length — on the drift spring, heavy and smooth.
 * A press on the bare background stirs the air: the dust near it swirls on a
 * critically damped drift-spring impulse and glints brighter as it tumbles.
 * Keyboard focus on a control inside is the hand there, with a softer stir.
 * One fullscreen WebGL2 draw at three quarters of the capped pixel ratio,
 * 30 frames a second while the afternoon drifts, nothing off screen or in a
 * hidden page. Without WebGL2 a CSS still frame stands in; under reduced
 * motion one still afternoon is drawn and the sun lands where the hand is.
 */
export function WindowShafts({
  children,
  angle = 38,
  warmth = 0.6,
  dust = 0.5,
  panes = 3,
  rows = 2,
  position = 0.64,
  softness = 0.4,
  haze = 0.5,
  speed = 1,
  interactive = true,
  pointerStrength = 0.6,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onStir,
  className,
}: WindowShaftsProps) {
  const motionSafe = useMotionSafe();
  const paints = [
    "var(--background)",
    "var(--foreground)",
    DAYLIGHT,
    AMBER,
  ] as const;

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const reportActive = React.useRef(onActiveChange);
  const reportStir = React.useRef(onStir);
  const unlisten = React.useRef<(() => void) | null>(null);

  const config: Config = {
    angle,
    warmth,
    dust,
    panes,
    rows,
    position,
    softness,
    haze,
    speed,
    interactive,
    pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => reportActive.current?.(a),
    onStir: () => reportStir.current?.(),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    reportActive.current = onActiveChange;
    reportStir.current = onStir;
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
    const listening = unlisten;
    return () => {
      listening.current?.();
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

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  const letGo = () => {
    unlisten.current?.();
    engine.current?.letGo();
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
    if (hit && rootRef.current?.contains(hit)) return;
    engine.current?.stir(at.x, at.y, 1, true);
    unlisten.current?.();
    const id = event.pointerId;
    const end = (e: PointerEvent) => {
      if (e.pointerId === id) letGo();
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    unlisten.current = () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      unlisten.current = null;
    };
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    letGo();
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
    engine.current?.stir(at.x, at.y, 0.5, false);
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
        // A sideways finger moves the sun on touch; an upright one scrolls.
        "group/window-shafts relative isolate h-full w-full touch-pan-y overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/window-shafts:opacity-0"
        style={standIn(angle, warmth)}
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
 * browser without WebGL2: the wall in shade, a soft band of beam crossing
 * from the upper left, and the warm patch where it lands.
 */
function standIn(angle: number, warmth: number): React.CSSProperties {
  const warm = Math.round(clamp(warmth, 0, 1) * 100);
  const sun = `color-mix(in oklab, ${AMBER} ${warm}%, ${DAYLIGHT})`;
  const across = Math.round(90 + clamp(angle, 5, 80));
  return {
    backgroundColor:
      "color-mix(in oklab, var(--background) 84%, var(--foreground))",
    backgroundImage: [
      `radial-gradient(ellipse 24% 34% at 64% 60%, color-mix(in oklab, ${sun} 70%, transparent) 0, transparent 72%)`,
      `linear-gradient(${across}deg, transparent 30%, color-mix(in oklab, ${sun} 22%, transparent) 42%, transparent 58%)`,
      `radial-gradient(ellipse 50% 60% at 64% 60%, color-mix(in oklab, ${sun} 14%, transparent) 0, transparent 70%)`,
    ].join(", "),
  };
}
