"use client";

import * as React from "react";

import { cubicBezier } from "motion/react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  GLSL_SRGB,
  onContextLoss,
  resizeGL,
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { easings, springs } from "@/registry/lib/motion";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { cn } from "@/registry/lib/utils";

export type PastelBandPalette = "dusk" | "meadow" | "ember" | "glacier";

export type PastelBandProps = {
  /** How much tooth the paper has, 0 (smooth, clean edges) to 1 (heavy tooth, grainy edges and specks of bare paper). @default 0.6 */
  tooth?: number;
  /** The ribbon's width as a share of the box's height, 0.2 to 0.8. @default 0.46 */
  width?: number;
  /** The pastel sticks laid side by side across the ribbon. @default "dusk" */
  palette?: PastelBandPalette;
  /** Your own sticks instead, two to four CSS colours from the ribbon's top edge to its bottom. Pigment: they read the same in either theme. */
  colors?: readonly string[];
  /** The paper's colour, any CSS colour; a dark sheet in either theme. @default "oklch(0.25 0.02 258)" */
  paperColor?: string;
  /** How far the ribbon waves, 0 (straight) to 1. @default 0.5 */
  wave?: number;
  /** How fast the ribbon moves, 0 (still) to 1. @default 0.35 */
  speed?: number;
  /** How many times a second the strokes are laid afresh, 0 to 15; 0 keeps the first strokes. @default 8 */
  boil?: number;
  /** How far the ribbon bends toward the pointer, 0 to 1. @default 0.6 */
  bend?: number;
  /** How much a drag softens the pastel it passes over, 0 to 1. @default 0.7 */
  smudge?: number;
  /** How long a smudge takes to give way to fresh strokes, in seconds, 2 to 30. @default 9 */
  fade?: number;
  /** The scale of the paper's grain, 0.5 (fine) to 2 (coarse). @default 1 */
  grain?: number;
  /** Content above the sheet: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The first time the sheet is seen, the ribbon is laid on from left to right. @default true */
  intro?: boolean;
  /** The pointer and keys bend and smudge the ribbon. @default true */
  interactive?: boolean;
  /** Hold the ribbon and its strokes still; bending and smudging still answer. @default false */
  paused?: boolean;
  /** Names the sheet for assistive technology. @default "Pastel ribbon" */
  label?: string;
  /** Seeds the waves and the strokes, so two sheets never match. @default 3 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a smudge is made, from the drag or key that made it. */
  onSmudge?: () => void;
  /** Shows the ribbon but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

/** Pigments at fixed lightness, top edge to bottom: pastel is pastel in either theme. */
const STICKS: Record<PastelBandPalette, readonly string[]> = {
  dusk: [
    "oklch(0.87 0.07 70)",
    "oklch(0.77 0.11 32)",
    "oklch(0.67 0.11 352)",
    "oklch(0.57 0.09 292)",
  ],
  meadow: [
    "oklch(0.9 0.09 112)",
    "oklch(0.79 0.11 142)",
    "oklch(0.67 0.09 176)",
    "oklch(0.57 0.08 222)",
  ],
  ember: [
    "oklch(0.9 0.1 92)",
    "oklch(0.79 0.14 62)",
    "oklch(0.65 0.16 36)",
    "oklch(0.52 0.12 22)",
  ],
  glacier: [
    "oklch(0.95 0.02 230)",
    "oklch(0.85 0.05 222)",
    "oklch(0.73 0.08 236)",
    "oklch(0.61 0.08 256)",
  ],
};

const STEP = 1 / 120;
/** The smudge map is a quarter of the sheet's CSS size. */
const SMUDGE_SCALE = 0.25;
const DABS = 320;
const KEY_STEP = 24;
/** Reduced motion: smudges give way in still steps this far apart, ms. */
const SETTLE_STEP = 1600;
const INTRO = 1.1;
/** The sweep arrives fast and lands softly: the enter easing. */
const sweepEase = cubicBezier(...easings.enter);

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r1 = (v: number) => Math.round(v * 10) / 10;

/** A small seeded generator: the same waves for the same seed. */
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

/** The waves' phases for a seed: two travelling waves and the width's breath. */
function phasesOf(seed: number): readonly [number, number, number, number] {
  const rand = lcg(seed);
  return [
    rand() * Math.PI * 2,
    rand() * Math.PI * 2,
    rand() * Math.PI * 2,
    rand() * 100,
  ];
}

/** The ribbon's centre at x, before any bend: the same sum the shader draws. */
function centreAt(
  x: number,
  h: number,
  amp: number,
  t: number,
  ph: readonly number[],
): number {
  return (
    h / 2 +
    amp *
      h *
      0.2 *
      Math.sin((x / 420) * Math.PI * 2 + (ph[0] ?? 0) + t * 0.55) +
    amp * h * 0.08 * Math.sin((x / 260) * Math.PI * 2 + (ph[1] ?? 0) - t * 0.8)
  );
}

const FRAGMENT = /* glsl */ `
${GLSL_NOISE}
${GLSL_SRGB}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_time;
uniform float u_boil;
uniform vec4 u_phase;
uniform vec4 u_band;
uniform vec4 u_bend;
uniform float u_reveal;
uniform vec3 u_col[4];
uniform float u_ncol;
uniform vec3 u_paper;
uniform vec3 u_hand;
uniform sampler2D u_smudge;

const float TAU = 6.28318530718;

float base(float x) {
  float h = u_res.y;
  float amp = u_band.y;
  return h * 0.5
    + amp * h * 0.2 * sin(x / 420.0 * TAU + u_phase.x + u_time * 0.55)
    + amp * h * 0.08 * sin(x / 260.0 * TAU + u_phase.y - u_time * 0.8);
}

// The centreline with the pointer's pull, held so the ribbon's edges stay on
// the sheet however hard it is pulled.
float centre(float x, float halfW) {
  float d = (x - u_bend.x) / u_bend.w;
  float y = base(x) + u_bend.z * exp(-d * d);
  float edge = u_res.y * 0.06 + halfW * 1.18;
  return clamp(y, edge, u_res.y - edge);
}

// The paper's tooth: fine grain, a felted middle scale and a faint honeycomb.
float tooth(vec2 p) {
  float g = u_band.w;
  float fine = kx_noise(p / (1.5 * g));
  float felt = kx_noise(p / (4.5 * g) + 17.0);
  float a = 6.2831 / (7.0 * g);
  float comb = (cos(a * p.x) + cos(a * (0.5 * p.x + 0.866 * p.y)) + cos(a * (0.5 * p.x - 0.866 * p.y))) / 3.0;
  return clamp(0.52 * fine + 0.3 * felt + 0.18 * (comb * 0.66 + 0.33), 0.0, 1.0);
}

void main() {
  vec2 p = v_uv * u_res;
  float h = u_res.y;
  float halfW = u_band.x * h * 0.5 * (1.0 + 0.18 * sin(p.x / 330.0 * TAU + u_phase.z + u_time * 0.4));
  float yc = centre(p.x, halfW);
  float slope = (centre(p.x + 1.0, halfW) - centre(p.x - 1.0, halfW)) * 0.5;
  float v = (p.y - yc) / sqrt(1.0 + slope * slope) / halfW;
  float sm = texture(u_smudge, v_uv).a;

  // Pressure across the ribbon: solid in the core, falling to its edges, the
  // fall wider and softer where it has been smudged.
  float av = abs(v);
  float press = 1.0 - smoothstep(0.32 - 0.18 * sm, 1.05 + 0.4 * sm, av);
  // Diagonal strokes vary the pressure; they are laid afresh each boil step.
  float boil = fract(sin(u_boil * 12.9898 + u_phase.w) * 43758.5453) * 400.0;
  vec2 r = vec2(0.9 * p.x + 0.43 * p.y, -0.43 * p.x + 0.9 * p.y);
  float g = u_band.w;
  float streak = kx_noise(vec2(r.x / (36.0 * g), r.y / (2.4 * g)) + boil);
  press *= 0.9 + 0.24 * (streak - 0.5) * 2.0 * (1.0 - sm);
  // The laying-on sweep: no pigment past its front, a thin grainy edge at it.
  press *= 1.0 - smoothstep(u_reveal - 46.0, u_reveal, p.x);

  float t = tooth(p);
  float te = 0.5 + (t - 0.5) * (0.25 + 1.35 * u_band.z) * (1.0 - 0.75 * sm);
  float soft = 0.07 + 0.22 * sm;
  // Hard pressure fills even the tooth's valleys, so the core is solid.
  float cover = smoothstep(-soft, soft, te - (1.0 - press) + 0.16 * press * press);
  float speck = kx_noise(p / (1.1 * g) + boil * 0.37);

  // The sticks side by side across the ribbon, wandering a little along it;
  // where two meet the grain picks one or the other, as dry pastel layers do,
  // and only a smudge blends them smoothly.
  float across = (v * 0.5 + 0.5) + 0.07 * sin(p.x / 170.0 + u_phase.x * 3.0);
  float n = u_ncol;
  float tt = clamp(across, 0.0, 1.0) * (n - 1.0);
  float i = min(floor(tt), n - 2.0);
  float fr = tt - i;
  vec3 a = u_col[0];
  vec3 b = u_col[1];
  if (i > 0.5) { a = u_col[1]; b = u_col[2]; }
  if (i > 1.5) { a = u_col[2]; b = u_col[3]; }
  float blend = smoothstep(0.28, 0.72, fr);
  float pick = step(speck, blend);
  vec3 pigment = mix(a, b, mix(pick, blend, sm));
  // Chalky where pressed hard, and lit a touch on the tooth's peaks.
  pigment = mix(pigment, vec3(1.0), 0.05 * press) * (0.9 + 0.2 * t);
  // Each stroke leaves a little more or less pigment than its neighbour.
  pigment *= 0.93 + 0.12 * mix(streak, 0.5, sm);

  vec3 paper = u_paper * (0.84 + 0.32 * t);
  vec2 q = v_uv - 0.5;
  paper *= 1.0 - 0.28 * dot(q, q);
  float alpha = cover * (0.72 + 0.28 * press);
  vec3 col = mix(paper, pigment, alpha);

  // The keyboard's hand: a thin ring on the paper.
  if (u_hand.z > 0.5) {
    float d = abs(length(p - u_hand.xy) - 12.0);
    col = mix(col, vec3(0.95), (1.0 - smoothstep(0.6, 1.6, d)) * 0.85);
  }
  o_color = vec4(kx_linearToSrgb(clamp(col, 0.0, 1.0)), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  smudge: WebGLTexture | null;
  lost: boolean;
};

type Size = { w: number; h: number; bw: number; bh: number; dpr: number };

type Sim = {
  last: number;
  carry: number;
  /** The ribbon's clock, s. */
  t: number;
  /** Real time since the strokes started boiling, s. */
  boilClock: number;
  boilStep: number;
  /** The bend: where it is, how fast it moves, and how hard it pulls. */
  bx: number;
  by: number;
  vx: number;
  vy: number;
  amount: number;
  amountV: number;
  /** The intro's sweep, 0 to 1; 1 when laid. */
  laid: number;
  /** Seconds since the sheet was made, for the smudges' ages. */
  now: number;
};

type Hand = {
  x: number;
  y: number;
  present: boolean;
  source: "pointer" | "key" | null;
  smudging: boolean;
  lastX: number;
  lastY: number;
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
  arrive: () => void;
};

/** The props a sheet must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button:not([data-pastel]),input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true']";

/**
 * A broad ribbon of colour waving across a sheet of dark pastel paper, drawn
 * per pixel in one WebGL2 pass. The paper has real tooth — fine grain, a
 * felted middle scale and a faint honeycomb — and the pastel catches it
 * unevenly: pigment lands where the stick's pressure reaches past the tooth,
 * so the ribbon's core is dense and its edges grainy, with specks of bare
 * paper. The sticks lie side by side across the ribbon and where two meet the
 * grain picks between them instead of blending. Diagonal strokes run through
 * the pigment and are laid afresh `boil` times a second, like pastel drawn
 * frame by frame, while the ribbon itself moves smoothly.
 *
 * The pointer bends the ribbon toward it, the pull following on the glide
 * spring and letting go on drift; a drag smudges the pastel along its path —
 * softer edges, the sticks blended — and the smudge gives way to fresh
 * strokes over `fade` seconds. The first time the sheet is seen the ribbon is
 * laid on from left to right in one sweep. The keyboard's way in is a
 * transparent button behind the content: arrow keys move a hand that bends
 * the ribbon, Shift with the arrows smudges, Enter or Space smudges where the
 * hand is. Under reduced motion the ribbon stands still, nothing boils, the
 * bend is drawn at once, and smudges give way in still steps.
 */
export function PastelBand({
  tooth = 0.6,
  width = 0.46,
  palette = "dusk",
  colors,
  paperColor = "oklch(0.25 0.02 258)",
  wave = 0.5,
  speed = 0.35,
  boil = 8,
  bend = 0.6,
  smudge = 0.7,
  fade = 9,
  grain = 1,
  children,
  intro = true,
  interactive = true,
  paused = false,
  label = "Pastel ribbon",
  seed = 3,
  dpr = 2,
  onSmudge,
  disabled = false,
  className,
}: PastelBandProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const sticks = (
    colors && colors.length >= 2 ? colors : (STICKS[palette] ?? STICKS.dusk)
  ).slice(0, 4);
  const paintKey = [...sticks, paperColor].join("|");
  const phases = React.useMemo(() => phasesOf(seed), [seed]);
  const k = {
    tooth: clamp01(tooth),
    width: clamp(width, 0.2, 0.8),
    wave: clamp01(wave),
    speed: clamp01(speed),
    boil: clamp(boil, 0, 15),
    bend: clamp01(bend),
    smudge: clamp01(smudge),
    fade: clamp(fade, 2, 30),
    grain: clamp(grain, 0.5, 2),
    intro,
    paused,
    motionSafe,
    dpr: clamp(dpr, 0.5, 2),
    enabled: interactive && !disabled,
  };

  const [said, setSaid] = React.useState({ n: 0, text: "" });

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef({
    rgb: new Float32Array(12),
    count: 4,
    paper: new Float32Array(3),
  });
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const smudgeMap = React.useRef<HTMLCanvasElement | null>(null);
  const dabSprite = React.useRef<HTMLCanvasElement | null>(null);
  const dabs = React.useRef({
    x: new Float32Array(DABS),
    y: new Float32Array(DABS),
    r: new Float32Array(DABS),
    at: new Float32Array(DABS),
    count: 0,
    next: 0,
    dirty: false,
    alive: false,
  });
  const frame = React.useRef(0);
  const settleTimer = React.useRef<number | null>(null);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const arrived = React.useRef(false);
  const sim = React.useRef<Sim>({
    last: 0,
    carry: 0,
    t: 0,
    boilClock: 0,
    boilStep: 0,
    bx: 0,
    by: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    laid: 1,
    now: 0,
  });
  const hand = React.useRef<Hand>({
    x: 0,
    y: 0,
    present: false,
    source: null,
    smudging: false,
    lastX: 0,
    lastY: 0,
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onSmudge);
  const loop = React.useCallback((now: number) => api.current?.tick(now), []);

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
    const read = (span: Element | undefined) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "rgb(0, 0, 0)";
      if (span) ctx.fillStyle = getComputedStyle(span).color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [toLinear(d[0] ?? 0), toLinear(d[1] ?? 0), toLinear(d[2] ?? 0)];
    };
    const out = colour.current;
    const n = Math.max(2, carriers.children.length - 1);
    for (let i = 0; i < 4; i += 1) {
      const c = read(carriers.children[Math.min(i, n - 1)]);
      out.rgb[i * 3] = c[0] ?? 0;
      out.rgb[i * 3 + 1] = c[1] ?? 0;
      out.rgb[i * 3 + 2] = c[2] ?? 0;
    }
    out.count = n;
    const paper = read(carriers.children[n]);
    out.paper[0] = paper[0] ?? 0;
    out.paper[1] = paper[1] ?? 0;
    out.paper[2] = paper[2] ?? 0;
  };

  /** The smudges as they stand now, painted into the map and uploaded. */
  const paintSmudges = () => {
    const g = gpu.current;
    const map = smudgeMap.current;
    const sprite = dabSprite.current;
    const sz = size.current;
    if (!g || g.lost || !map || !sprite || !sz) return;
    const d = dabs.current;
    const ctx = map.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, map.width, map.height);
    const now = sim.current.now;
    let alive = false;
    for (let i = 0; i < d.count; i += 1) {
      const a = Math.exp(-(now - d.at[i]!) / (k.fade * 0.45));
      if (a < 0.01) continue;
      alive = true;
      const r = d.r[i]! * SMUDGE_SCALE;
      ctx.globalAlpha = a * (0.25 + 0.75 * k.smudge) * 0.8;
      ctx.drawImage(
        sprite,
        d.x[i]! * SMUDGE_SCALE - r,
        d.y[i]! * SMUDGE_SCALE - r,
        r * 2,
        r * 2,
      );
    }
    ctx.globalAlpha = 1;
    d.alive = alive;
    d.dirty = false;
    g.smudge = uploadTexture(g.gl, map, { linear: true }, g.smudge);
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    // Pastel is soft: three quarters of the capped pixel ratio is plenty, and
    // the grain is drawn in CSS px so it never shrinks with the scale.
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr, renderScale: 0.75 });
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    size.current = { w, h, bw: r.width, bh: r.height, dpr: r.dpr };
    const map = smudgeMap.current ?? document.createElement("canvas");
    smudgeMap.current = map;
    const mw = Math.max(4, Math.ceil(w * SMUDGE_SCALE));
    const mh = Math.max(4, Math.ceil(h * SMUDGE_SCALE));
    if (map.width !== mw || map.height !== mh) {
      map.width = mw;
      map.height = mh;
    }
    if (!dabSprite.current) {
      const s = document.createElement("canvas");
      s.width = 32;
      s.height = 32;
      const ctx = s.getContext("2d");
      if (ctx) {
        const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, "rgb(255 255 255 / 1)");
        grad.addColorStop(0.5, "rgb(255 255 255 / 0.6)");
        grad.addColorStop(1, "rgb(255 255 255 / 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 32, 32);
      }
      dabSprite.current = s;
    }
    const s = sim.current;
    if (!hand.current.present) {
      s.bx = w / 2;
      s.by = h / 2;
    }
    paintSmudges();
  };

  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    if (!g || g.lost || !sz) return;
    // With an intro to play, the server's still stands until the sheet is
    // first seen: a page captured before then shows a finished ribbon, not
    // bare paper.
    if (!arrived.current && k.intro && k.motionSafe) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const c = colour.current;
    const hd = hand.current;
    const ph = phases;
    if (dabs.current.dirty || dabs.current.alive) paintSmudges();
    // The pull is toward the hand's height, measured from where the ribbon
    // would be there without it, and never more than a third of the sheet.
    const rest = centreAt(s.bx, sz.h, k.wave, s.t, ph);
    const pull = clamp((s.by - rest) * 0.85, -sz.h * 0.34, sz.h * 0.34);
    const reveal =
      s.laid >= 1 ? sz.w + 200 : -60 + (sz.w + 120) * sweepEase(s.laid);
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_time ?? null, s.t);
    gl.uniform1f(u.u_boil ?? null, s.boilStep);
    gl.uniform4f(u.u_phase ?? null, ph[0], ph[1], ph[2], ph[3]);
    gl.uniform4f(u.u_band ?? null, k.width, k.wave, k.tooth, k.grain);
    gl.uniform4f(
      u.u_bend ?? null,
      s.bx,
      s.by,
      pull * s.amount * k.bend,
      Math.max(60, sz.w * 0.16),
    );
    gl.uniform1f(u.u_reveal ?? null, reveal);
    gl.uniform3fv(u.u_col ?? null, c.rgb);
    gl.uniform1f(u.u_ncol ?? null, c.count);
    gl.uniform3fv(u.u_paper ?? null, c.paper);
    gl.uniform3f(
      u.u_hand ?? null,
      hd.x,
      hd.y,
      hd.present && hd.source === "key" && k.enabled ? 1 : 0,
    );
    if (g.smudge) program.texture("u_smudge", g.smudge, 0);
    tri.draw();
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Advances the ribbon, its strokes, the bend and the intro; says whether a frame is needed. */
  const advance = (dt: number): { busy: boolean; paint: boolean } => {
    const s = sim.current;
    const hd = hand.current;
    let busy = false;
    let paint = false;
    s.now += dt;
    const want = hd.present && k.enabled ? 1 : 0;
    if (!k.motionSafe) {
      s.amount = want;
      s.amountV = 0;
      if (hd.present) {
        s.bx = hd.x;
        s.by = hd.y;
      }
      s.laid = 1;
      return { busy: false, paint: true };
    }
    if (!k.paused) {
      if (k.speed > 0) {
        s.t += dt * (0.15 + 1.4 * k.speed);
        busy = true;
        paint = true;
      }
      if (k.boil > 0) {
        s.boilClock += dt;
        const step = Math.floor(s.boilClock * k.boil);
        if (step !== s.boilStep) {
          s.boilStep = step;
          paint = true;
        }
        busy = true;
      }
    }
    if (s.laid < 1) {
      s.laid = Math.min(1, s.laid + dt / INTRO);
      busy = true;
      paint = true;
    }
    const gs = springs.glide;
    const ds = springs.drift;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      if (hd.present) {
        s.vx +=
          ((-gs.stiffness * (s.bx - hd.x) - gs.damping * s.vx) / gs.mass) *
          STEP;
        s.vy +=
          ((-gs.stiffness * (s.by - hd.y) - gs.damping * s.vy) / gs.mass) *
          STEP;
        s.bx += s.vx * STEP;
        s.by += s.vy * STEP;
      }
      s.amountV +=
        ((-ds.stiffness * (s.amount - want) - ds.damping * s.amountV) /
          ds.mass) *
        STEP;
      s.amount += s.amountV * STEP;
    }
    if (steps === 8) s.carry = 0;
    const moving =
      (hd.present &&
        (Math.abs(s.bx - hd.x) > 0.05 ||
          Math.abs(s.by - hd.y) > 0.05 ||
          Math.abs(s.vx) + Math.abs(s.vy) > 0.5)) ||
      Math.abs(s.amount - want) > 0.002 ||
      Math.abs(s.amountV) > 0.01;
    if (moving) {
      busy = true;
      paint = true;
    } else {
      s.amount = want;
      s.amountV = 0;
    }
    if (dabs.current.alive || dabs.current.dirty) {
      busy = true;
      paint = true;
    }
    return { busy, paint };
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
    const { busy, paint } = advance(dt);
    if (paint) draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
    if (!k.motionSafe && dabs.current.alive) scheduleSettle();
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  /** Reduced motion: smudges give way in still steps, paused while unseen. */
  const scheduleSettle = () => {
    if (settleTimer.current !== null) return;
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null;
      if (k.motionSafe) return;
      sim.current.now += SETTLE_STEP / 1000;
      if (visible.current && !document.hidden) draw();
      if (dabs.current.alive) scheduleSettle();
    }, SETTLE_STEP);
  };

  /** The first sighting: the ribbon is laid on from the left. */
  const arrive = () => {
    if (arrived.current) return;
    arrived.current = true;
    if (k.intro && k.motionSafe) sim.current.laid = 0;
    kick();
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick, arrive };
    report.current = onSmudge;
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: false });
      if (!gl) return false;
      const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
      if (!program) return false;
      const tri = createFullscreenTriangle(gl, program);
      gpu.current = { gl, program, tri, smudge: null, lost: false };
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
        if (g.smudge) g.gl.deleteTexture(g.smudge);
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
  }, [k.dpr]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [
    k.tooth,
    k.width,
    k.wave,
    k.speed,
    k.boil,
    k.bend,
    k.smudge,
    k.fade,
    k.grain,
    phases,
    paused,
    motionSafe,
    k.enabled,
  ]);

  React.useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) return;
      api.current?.draw();
      api.current?.kick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const pending = frame;
    const settle = settleTimer;
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (pending.current) window.cancelAnimationFrame(pending.current);
      pending.current = 0;
      if (settle.current !== null) window.clearTimeout(settle.current);
      settle.current = null;
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

  const local = (clientX: number, clientY: number) => {
    const root = rootRef.current;
    const r = root?.getBoundingClientRect();
    if (!root || !r) return { x: 0, y: 0 };
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  /** Lays smudge dabs along a stroke from a to b, a few px apart. */
  const smudgeAlong = (ax: number, ay: number, bx: number, by: number) => {
    const d = dabs.current;
    const s = sim.current;
    const sz = size.current;
    if (!sz || k.smudge <= 0) return;
    const len = Math.hypot(bx - ax, by - ay);
    const radius = Math.max(16, sz.h * k.width * 0.32);
    const n = Math.max(1, Math.ceil(len / (radius * 0.35)));
    for (let i = 1; i <= n; i += 1) {
      const t = i / n;
      const q = d.next;
      d.next = (d.next + 1) % DABS;
      d.count = Math.min(DABS, d.count + 1);
      d.x[q] = ax + (bx - ax) * t;
      d.y[q] = ay + (by - ay) * t;
      d.r[q] = radius;
      d.at[q] = s.now;
    }
    d.dirty = true;
    d.alive = true;
    kick();
  };

  const smudged = () => {
    report.current?.();
    setSaid((v) => ({ n: v.n + 1, text: "Smudged." }));
  };

  const handTo = (x: number, y: number, source: "pointer" | "key") => {
    const hd = hand.current;
    const fresh = !hd.present;
    hd.lastX = hd.present ? hd.x : x;
    hd.lastY = hd.present ? hd.y : y;
    hd.x = x;
    hd.y = y;
    hd.present = true;
    hd.source = source;
    if (fresh && sim.current.amount < 0.05) {
      sim.current.bx = x;
      sim.current.by = y;
      sim.current.vx = 0;
      sim.current.vy = 0;
    }
    if (!k.motionSafe) draw();
    kick();
  };

  const handLeave = () => {
    const hd = hand.current;
    hd.present = false;
    hd.source = null;
    hd.smudging = false;
    if (!k.motionSafe) draw();
    kick();
  };

  const drag = useDrag({
    threshold: 4,
    disabled: !k.enabled,
    onStart: ({ point, offset }) => {
      const from = local(point.x - offset.x, point.y - offset.y);
      const at = local(point.x, point.y);
      handTo(at.x, at.y, "pointer");
      hand.current.smudging = true;
      smudgeAlong(from.x, from.y, at.x, at.y);
      smudged();
    },
    onMove: ({ point }) => {
      const hd = hand.current;
      const at = local(point.x, point.y);
      const fromX = hd.x;
      const fromY = hd.y;
      handTo(at.x, at.y, "pointer");
      smudgeAlong(fromX, fromY, at.x, at.y);
    },
    onEnd: ({ event }) => {
      hand.current.smudging = false;
      if (event.pointerType !== "mouse") handLeave();
    },
    onCancel: () => handLeave(),
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!k.enabled || fromContent(event.target)) return;
    rootRef.current?.setAttribute("data-pressing", "");
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (event.pointerType !== "mouse" || !k.enabled || hand.current.smudging)
      return;
    const at = local(event.clientX, event.clientY);
    handTo(at.x, at.y, "pointer");
  };

  /** A short stroke along the ribbon, centred on the hand. */
  const smudgeHere = () => {
    const hd = hand.current;
    const sz = size.current;
    if (!sz) return;
    const x = hd.present ? hd.x : sz.w / 2;
    const s = sim.current;
    const y = hd.present ? hd.y : centreAt(x, sz.h, k.wave, s.t, phases);
    const reach = Math.min(70, sz.w * 0.12);
    const y0 =
      centreAt(x - reach, sz.h, k.wave, s.t, phases) -
      centreAt(x, sz.h, k.wave, s.t, phases);
    const y1 =
      centreAt(x + reach, sz.h, k.wave, s.t, phases) -
      centreAt(x, sz.h, k.wave, s.t, phases);
    smudgeAlong(x - reach, y + y0, x + reach, y + y1);
    smudged();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const sz = size.current;
    if (!k.enabled || !sz) return;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const move = moves[event.key];
    const hd = hand.current;
    if (move) {
      event.preventDefault();
      const fromX = hd.present ? hd.x : sz.w / 2;
      const fromY = hd.present ? hd.y : sz.h / 2;
      const x = clamp(fromX + move[0] * KEY_STEP, 0, sz.w);
      const y = clamp(fromY + move[1] * KEY_STEP, 0, sz.h);
      handTo(x, y, "key");
      if (event.shiftKey) {
        smudgeAlong(fromX, fromY, x, y);
        if (!event.repeat) smudged();
      }
      return;
    }
    if (event.key === "Escape" && hd.present && hd.source === "key") {
      event.preventDefault();
      handLeave();
    }
  };

  const onFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    const sz = size.current;
    if (!sz || !k.enabled || !event.currentTarget.matches(":focus-visible"))
      return;
    const x = sz.w / 2;
    handTo(x, centreAt(x, sz.h, k.wave, sim.current.t, phases), "key");
  };

  const onBlur = () => {
    if (hand.current.source === "key") handLeave();
  };

  const onColours = () => {
    api.current?.readColours();
    api.current?.draw();
  };

  return (
    <div
      ref={bindRoot}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => {
        rootRef.current?.removeAttribute("data-pressing");
        drag.onPointerUp(event);
      }}
      onPointerCancel={(event) => {
        rootRef.current?.removeAttribute("data-pressing");
        drag.onPointerCancel(event);
      }}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (
          event.pointerType !== "touch" &&
          hand.current.source === "pointer" &&
          !hand.current.smudging
        ) {
          handLeave();
        }
      }}
      className={cn(
        "group/pastel-band relative isolate h-56 w-full overflow-clip data-pressing:select-none",
        k.enabled ? "touch-pan-y" : "touch-auto",
        className,
      )}
      style={{ backgroundColor: paperColor }}
    >
      <BandStill
        uid={uid}
        sticks={sticks}
        width={k.width}
        wave={k.wave}
        phases={phases}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 group-data-live/pastel-band:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={onColours}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[...sticks, paperColor].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <button
        type="button"
        data-pastel=""
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(event) => {
          // Enter, Space or assistive technology: a click with no pointer
          // behind it smudges where the hand is.
          if (event.detail === 0 && k.enabled) smudgeHere();
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          k.enabled ? "cursor-crosshair" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        Drag across the ribbon to smudge it. Arrow keys move your hand and bend
        the ribbon toward it; Shift with the arrows smudges as you go; Enter or
        Space smudges where your hand is; Escape lifts your hand.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/** The nominal sheet the server's still is drawn in. */
const STILL_W = 720;
const STILL_H = 208;

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the ribbon at rest as SVG, its sticks as a gradient across
 * it, a dense core over a wider band whose edges are broken by a grain filter.
 */
function BandStill({
  uid,
  sticks,
  width,
  wave,
  phases,
}: {
  uid: string;
  sticks: readonly string[];
  width: number;
  wave: number;
  phases: readonly number[];
}) {
  const band = React.useMemo(() => {
    const edge = (share: number) => {
      const top: string[] = [];
      const bottom: string[] = [];
      for (let x = 0; x <= STILL_W; x += 12) {
        const c = centreAt(x, STILL_H, wave, 0, phases);
        const half =
          width *
          STILL_H *
          0.5 *
          share *
          (1 + 0.18 * Math.sin((x / 330) * Math.PI * 2 + (phases[2] ?? 0)));
        top.push(`${x} ${r1(c - half)}`);
        bottom.unshift(`${x} ${r1(c + half)}`);
      }
      return `M${top.join("L")}L${bottom.join("L")}Z`;
    };
    return { outer: edge(1.02), inner: edge(0.62) };
  }, [width, wave, phases]);
  const fill = `${uid}-sticks`;
  const grain = `${uid}-grain`;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${STILL_W} ${STILL_H}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/pastel-band:opacity-0"
    >
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          {sticks.map((paint, i) => (
            <stop
              key={i}
              offset={`${Math.round((i / Math.max(1, sticks.length - 1)) * 100)}%`}
              style={{ stopColor: paint }}
            />
          ))}
        </linearGradient>
        <filter id={grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.42"
            numOctaves={1}
            seed={4}
            result="noise"
          />
          <feColorMatrix
            in="noise"
            type="matrix"
            values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 4.5 0 0 0 -1.9"
            result="specks"
          />
          <feComposite in="SourceGraphic" in2="specks" operator="in" />
        </filter>
      </defs>
      <path d={band.outer} fill={`url(#${fill})`} filter={`url(#${grain})`} />
      <path d={band.inner} fill={`url(#${fill})`} opacity={0.92} />
    </svg>
  );
}
