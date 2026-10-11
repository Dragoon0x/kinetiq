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

export type SatinRakeTint = "cobalt" | "ivory" | "rose" | "jade";

export type SatinRakeProps = {
  /** The content on top of the satin: a headline, a product plate, a call to action. */
  children?: React.ReactNode;
  /** How many long folds lie across the cloth, 3 to 14. @default 7 */
  foldCount?: number;
  /** How strongly the ridges streak with sheen, 0 (matte silk) to 1 (liquid satin). @default 0.7 */
  sheen?: number;
  /** The dye: a named satin or any CSS colour. Named dyes hold their lightness, so the cloth is the same on a light and a dark page. @default "cobalt" */
  tint?: SatinRakeTint | (string & {});
  /** The direction the folds run, in degrees from horizontal (negative rises to the right). @default -28 */
  angle?: number;
  /** The folds' profile, 0 (pressed creases) to 1 (soft rolls). @default 0.55 */
  softness?: number;
  /** How deep the folds are, 0 (nearly flat) to 1 (deep drape). @default 0.6 */
  depth?: number;
  /** How high the lamp hangs over the cloth, 0 (raking, deep shadows) to 1 (overhead, even light). @default 0.3 */
  lampHeight?: number;
  /** The size of the lamp's pool of light, as a share of the box's diagonal, 0.2 to 1. @default 0.6 */
  reach?: number;
  /** One slow return trip of the unattended lamp, in ms. @default 9000 */
  sweep?: number;
  /** How high a click's wave lifts the cloth, 0 (no waves) to 1. @default 0.6 */
  waveStrength?: number;
  /** How fast a wave rolls out through the cloth, px per second. @default 180 */
  waveSpeed?: number;
  /** The pointer and keys steer the lamp, and a click sends a wave. @default true */
  interactive?: boolean;
  /** Hold the unattended lamp still; the hand and waves still move. @default false */
  paused?: boolean;
  /** Seeds the drape, so two lengths of satin never fold alike. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The accessible name of the lamp control. @default "Steer the lamp" */
  label?: string;
  /** Fires when a click or Enter sends a wave, with its origin as shares of the box (0 to 1). */
  onWave?: (origin: { x: number; y: number }) => void;
  /** Fires when the pointer or the keyboard takes the lamp (true) or hands it back to its sweep (false). */
  onActiveChange?: (active: boolean) => void;
  /** Sizes and shapes the box; it fills its parent by default. */
  className?: string;
};

/**
 * Base, shadow and sheen for each named dye. A dyed cloth is pigment, not
 * text: each holds a fixed lightness taken from a token's hue, so the satin
 * reads the same in either theme.
 */
const DYES: Record<SatinRakeTint, readonly [string, string, string]> = {
  cobalt: [
    "oklch(from var(--accent) 0.46 0.16 h)",
    "oklch(from var(--accent) 0.2 0.08 h)",
    "oklch(from var(--accent) 0.95 0.035 h)",
  ],
  ivory: [
    "oklch(from var(--warn) 0.87 0.035 h)",
    "oklch(from var(--warn) 0.5 0.035 calc(h - 12))",
    "oklch(from var(--warn) 0.99 0.012 h)",
  ],
  rose: [
    "oklch(from var(--danger) 0.6 0.12 calc(h - 6))",
    "oklch(from var(--danger) 0.27 0.07 calc(h - 10))",
    "oklch(from var(--danger) 0.96 0.025 h)",
  ],
  jade: [
    "oklch(from var(--signal) 0.52 0.085 h)",
    "oklch(from var(--signal) 0.21 0.04 h)",
    "oklch(from var(--signal) 0.96 0.025 h)",
  ],
};

function dyeOf(tint: string): readonly [string, string, string] {
  const named = DYES[tint as SatinRakeTint];
  if (named) return named;
  return [
    tint,
    `color-mix(in oklab, ${tint} 38%, black)`,
    `color-mix(in oklab, ${tint} 18%, white)`,
  ];
}

/** Fixed physics step: the springs integrate at 120 Hz whatever the display does. */
const STEP = 1 / 120;
const WAVES = 3;
/** A wave fades by this rate, 1/s, as it widens. */
const WAVE_FADE = 0.34;
/** Under reduced motion a click's swell holds still and fades over this long, s. */
const STILL_SWELL = 0.7;
/** Keyboard steps across the cloth, in percent. */
const KEY_STEP = 5;
const KEY_PAGE = 20;
/** Where the keyboard's lamp hangs, as a share of the height. */
const KEY_Y = 0.32;
/** Where the lamp rests when nothing has moved it, as shares of the box. */
const REST = { x: 0.3, y: 0.3 };

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** A small seeded generator: the same drape for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The props a surface must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = /* glsl */ `
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform vec2 u_dir;
uniform float u_lambda;
uniform float u_soft;
uniform float u_relief;
uniform vec4 u_seed;
uniform vec3 u_lamp;
uniform float u_reach;
uniform float u_sheen;
uniform vec3 u_base;
uniform vec3 u_deep;
uniform vec3 u_lite;
uniform vec4 u_wave[3];
uniform float u_waveW;

const float PI = 3.14159265359;

float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// How far each wave lifts the cloth here: a raised ring with a shallow trough
// riding behind it, so the swell reads as a roll rather than a bump.
float waves(vec2 p) {
  float sum = 0.0;
  for (int i = 0; i < 3; i++) {
    vec4 w = u_wave[i];
    if (w.w <= 0.0) continue;
    float x = (length(p - w.xy) - w.z) / u_waveW;
    sum += w.w * (exp(-x * x) - 0.45 * exp(-(x + 1.3) * (x + 1.3)));
  }
  return sum;
}

// The fold's line drifts sideways along its length, so no fold runs straight.
float meander(float u) {
  return 0.32 * u_lambda * sin(u / (u_lambda * 7.5) * 6.2832 + u_seed.x)
       + 0.12 * u_lambda * sin(u / (u_lambda * 3.6) * 6.2832 + u_seed.y);
}
float meanderSlope(float u) {
  return 0.32 * 6.2832 / 7.5 * cos(u / (u_lambda * 7.5) * 6.2832 + u_seed.x)
       + 0.12 * 6.2832 / 3.6 * cos(u / (u_lambda * 3.6) * 6.2832 + u_seed.y);
}

// The cloth's height at p, in fold units (about 0 at a crease to 1.5 on a
// ridge). |sin| raised to a power gives a crease in the trough and a rounded
// ridge on top; the power is the softness.
float cloth(vec2 p, out float creaseOut) {
  float u = dot(p, u_dir);
  float v = dot(p, vec2(-u_dir.y, u_dir.x));
  float w = waves(p);
  float e = mix(0.9, 2.4, u_soft);
  // Folds are not evenly spaced: a slow warp across them widens some and
  // crowds others.
  float crowd = 0.26 * u_lambda * sin(v / (u_lambda * 1.9) + u_seed.w);
  float ph = (v + crowd + meander(u) + w * u_lambda * 0.3) / u_lambda;
  float main = pow(abs(sin(PI * ph)), e);
  // A finer set of folds swells and fades along the length, so folds seem
  // to branch and merge the way real cloth does.
  float m2 = 0.2 * u_lambda * sin(u / (u_lambda * 5.1) * 6.2832 + u_seed.z);
  float ph2 = (v + crowd + m2 + w * u_lambda * 0.3) / (u_lambda * 0.71) + 0.31;
  float swell = smoothstep(0.35, 1.0, 0.5 + 0.5 * sin(u / (u_lambda * 3.4) + u_seed.w));
  float second = pow(abs(sin(PI * ph2)), e + 0.6) * swell;
  // One broad billow under everything: the cloth never lies flat.
  vec2 q = p / max(u_res.x, u_res.y);
  float billow = 0.5 * sin(q.x * 4.1 + q.y * 6.3 + u_seed.x) + 0.35 * sin(-q.x * 5.7 + q.y * 2.9 + u_seed.y);
  creaseOut = main;
  return main * 0.85 + second * 0.2 + billow * 0.5 + w * 0.9;
}

void main() {
  vec2 p = v_uv * u_res;
  float crease;
  float c0;
  float h = cloth(p, crease);
  float hx = cloth(p + vec2(1.0, 0.0), c0) - h;
  float hy = cloth(p + vec2(0.0, 1.0), c0) - h;
  vec3 n = normalize(vec3(-hx * u_relief, -hy * u_relief, 1.0));

  // Satin's warp runs along the fold, so its sheen does too: the tangent
  // follows each fold's meander.
  vec2 perp = vec2(-u_dir.y, u_dir.x);
  vec2 along = normalize(u_dir - meanderSlope(dot(p, u_dir)) * perp);
  vec3 t = normalize(vec3(along, 0.0) - n * dot(vec3(along, 0.0), n));
  vec3 b = cross(n, t);

  vec3 P = vec3(p, h * u_relief);
  vec3 toLamp = u_lamp - P;
  float dist = length(toLamp);
  vec3 L = toLamp / dist;
  vec3 V = vec3(0.0, 0.0, 1.0);
  float pool = (u_reach * u_reach) / (u_reach * u_reach + dist * dist);

  // Wrapped diffuse keeps the dye rich in the troughs instead of black.
  float ndl = dot(n, L);
  float diffuse = clamp((ndl + 0.3) / 1.3, 0.0, 1.0);
  // Anisotropic sheen: a lobe long along the fold and narrow across it.
  vec3 H = normalize(L + V);
  float hn = max(dot(H, n), 0.05);
  float ht = dot(H, t) / 0.9;
  float hb = dot(H, b) / 0.24;
  float spec = exp(-(ht * ht + hb * hb) / (hn * hn)) * clamp(ndl * 2.5, 0.0, 1.0);
  // The steep walls carry a soft lustre on the side facing the lamp.
  float wall = 1.0 - clamp(n.z, 0.0, 1.0);
  vec2 side = length(n.xy) > 1e-4 ? normalize(n.xy) : vec2(0.0);
  float lustre = wall * wall * max(dot(side, normalize(L.xy + 1e-4)), 0.0);

  vec3 c = mix(u_deep, u_base, clamp(diffuse * (0.3 + 0.7 * pool) + 0.12, 0.0, 1.05));
  // Creases hold a little shadow whatever the lamp does.
  c *= mix(0.8, 1.0, smoothstep(0.0, 0.3, crease));
  c = mix(c, u_lite, clamp(spec * u_sheen * (0.25 + 0.95 * pool), 0.0, 0.92));
  c = mix(c, u_lite, clamp(lustre * 0.55 * u_sheen * pool, 0.0, 0.4));
  // The cloth falls away into shade toward its edges.
  vec2 e = (v_uv - 0.5) * vec2(1.0, 1.35);
  c = mix(c, u_deep, 0.22 * smoothstep(0.45, 1.05, length(e)));
  c += (grain(gl_FragCoord.xy) - 0.5) / 255.0;
  o_color = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Wave = { x: number; y: number; age: number; strength: number };

type Sim = {
  /** Sweep time, s. */
  t: number;
  last: number;
  drawnAt: number;
  carry: number;
  /** Where the hand wants the lamp, and where the hand's lamp is. */
  tx: number;
  ty: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** How much the hand owns the lamp, against the sweep. */
  own: number;
  ownV: number;
  on: boolean;
  source: "pointer" | "keyboard" | null;
  /** Where the lamp rests under reduced motion, as shares of the box. */
  rest: { x: number; y: number };
  waves: Wave[];
};

type Size = { w: number; h: number; bw: number; bh: number; dpr: number };

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readPalette: () => void;
  tick: (now: number) => void;
};

/**
 * A length of satin lying in soft folds, with the content on top in its own
 * layer. One WebGL2 pass shades a height field of meandering folds — crisp in
 * the crease, rounded on the ridge — with satin's own light: a wrapped
 * diffuse that keeps the dye rich in the troughs and an anisotropic sheen
 * whose lobe runs long along each fold, so the highlights streak down the
 * ridges.
 *
 * The light is a lamp a little above the cloth. Left alone it sweeps slowly
 * back and forth; the pointer takes it (where, on springs.glide; how much the
 * hand owns it, on springs.drift), and moving it over a trough turns the
 * trough's walls to the light. A click on the cloth sends one slow wave
 * rolling out through it, lifting every fold it crosses. One focus stop, a
 * slider under the content, steers the lamp from the keyboard and Enter sends
 * a wave. Under reduced motion the cloth is still, the lamp goes straight
 * where it is put, and a click lifts a still swell that fades.
 */
export function SatinRake({
  children,
  foldCount = 7,
  sheen = 0.7,
  tint = "cobalt",
  angle = -28,
  softness = 0.55,
  depth = 0.6,
  lampHeight = 0.3,
  reach = 0.6,
  sweep = 9000,
  waveStrength = 0.6,
  waveSpeed = 180,
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  label = "Steer the lamp",
  onWave,
  onActiveChange,
  className,
}: SatinRakeProps) {
  const motionSafe = useMotionSafe();
  const paints = dyeOf(tint);
  const paintKey = paints.join("|");
  const hintId = React.useId();

  const k = {
    folds: clamp(Math.round(foldCount), 3, 14),
    sheen: clamp01(sheen),
    angle: (clamp(angle, -90, 90) * Math.PI) / 180,
    soft: clamp01(softness),
    depth: clamp01(depth),
    lampHeight: clamp01(lampHeight),
    reach: clamp(reach, 0.2, 1),
    sweep: Math.max(1500, sweep),
    wave: clamp01(waveStrength),
    waveSpeed: clamp(waveSpeed, 40, 1200),
    interactive,
    paused,
    seed,
    dpr: clamp(dpr, 0.5, 2),
    motionSafe,
  };

  const [lampAt, setLampAt] = React.useState(Math.round(REST.x * 100));

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const gpu = React.useRef<Gpu | null>(null);
  const size = React.useRef<Size | null>(null);
  const colour = React.useRef(new Float32Array(9));
  const lamp = React.useRef({ x: 0, y: 0 });
  const waveData = React.useRef(new Float32Array(WAVES * 4));
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const active = React.useRef(false);
  const shown = React.useRef(false);
  const sim = React.useRef<Sim>({
    t: 0,
    last: 0,
    drawnAt: 0,
    carry: 0,
    tx: 0,
    ty: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    own: 0,
    ownV: 0,
    on: false,
    source: null,
    rest: { ...REST },
    waves: Array.from({ length: WAVES }, () => ({
      x: 0,
      y: 0,
      age: 0,
      strength: 0,
    })),
  });
  const api = React.useRef<Api | null>(null);
  const report = React.useRef({ onWave, onActiveChange });
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
    for (let i = 0; i < 3; i += 1) {
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
    size.current = {
      w: r.width / r.dpr,
      h: r.height / r.dpr,
      bw: r.width,
      bh: r.height,
      dpr: r.dpr,
    };
  };

  /** Where the lamp is now — the sweep's point, the hand's, or between them — written into `lamp`. */
  const lampPoint = (sz: Size) => {
    const s = sim.current;
    const out = lamp.current;
    if (!k.motionSafe) {
      out.x = s.on ? s.tx : s.rest.x * sz.w;
      out.y = s.on ? s.ty : s.rest.y * sz.h;
      return out;
    }
    const phase = (s.t * Math.PI * 2) / (k.sweep / 1000);
    // A lazy figure of eight: back and forth across the cloth, dipping and
    // rising a little on each pass.
    const sx = sz.w * (0.5 + 0.42 * Math.sin(phase));
    const sy = sz.h * (0.3 + 0.16 * Math.sin(phase * 2 + 0.6));
    out.x = sx + (s.x - sx) * s.own;
    out.y = sy + (s.y - sy) * s.own;
    return out;
  };

  /** One frame from the sim as it stands. Uniforms go straight to their locations: nothing is allocated. */
  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    if (!g || g.lost || !sz || !visible.current) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const dirX = Math.cos(k.angle);
    const dirY = Math.sin(k.angle);
    // The fold's wavelength from the box's extent across the folds, so
    // every size shows the same number of folds.
    const extent = Math.abs(sz.w * dirY) + Math.abs(sz.h * dirX);
    const lambda = Math.max(18, extent / k.folds);
    const diag = Math.hypot(sz.w, sz.h);
    const relief = (0.08 + 0.34 * k.depth) * lambda;
    const at = lampPoint(sz);
    const lampZ = (0.05 + 0.75 * k.lampHeight) * diag * 0.5 + relief;
    const waveW = lambda * 1.15;
    const wd = waveData.current;
    for (let i = 0; i < WAVES; i += 1) {
      const wv = s.waves[i];
      const live = wv && wv.strength > 0;
      let amp = 0;
      let radius = 0;
      if (live) {
        if (k.motionSafe) {
          radius = wv.age * k.waveSpeed;
          amp = wv.strength * Math.exp(-wv.age * WAVE_FADE);
          // Rising in over the first beat, so a wave is born, not dropped.
          amp *= Math.min(1, wv.age / 0.25);
        } else {
          amp = wv.strength * Math.max(0, 1 - wv.age / STILL_SWELL);
        }
      }
      wd[i * 4] = live ? wv.x : 0;
      wd[i * 4 + 1] = live ? wv.y : 0;
      wd[i * 4 + 2] = radius;
      wd[i * 4 + 3] = amp * 2.4;
    }
    const pal = colour.current;
    const rand = seedPhases(k.seed);
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform2f(u.u_dir ?? null, dirX, dirY);
    gl.uniform1f(u.u_lambda ?? null, lambda);
    gl.uniform1f(u.u_soft ?? null, k.soft);
    gl.uniform1f(u.u_relief ?? null, relief);
    gl.uniform4f(u.u_seed ?? null, rand[0], rand[1], rand[2], rand[3]);
    gl.uniform3f(u.u_lamp ?? null, at.x, at.y, lampZ);
    gl.uniform1f(u.u_reach ?? null, k.reach * diag * 0.75);
    gl.uniform1f(u.u_sheen ?? null, k.sheen);
    gl.uniform3f(u.u_base ?? null, pal[0] ?? 0, pal[1] ?? 0, pal[2] ?? 0);
    gl.uniform3f(u.u_deep ?? null, pal[3] ?? 0, pal[4] ?? 0, pal[5] ?? 0);
    gl.uniform3f(u.u_lite ?? null, pal[6] ?? 1, pal[7] ?? 1, pal[8] ?? 1);
    gl.uniform4fv(u.u_wave ?? null, wd);
    gl.uniform1f(u.u_waveW ?? null, waveW);
    tri.draw();
    // Marked once: re-setting an attribute every frame would restyle the
    // subtree every frame.
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Advances the sweep, the hand and the waves by dt; says whether anything still moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    let waves = false;
    for (const wv of s.waves) {
      if (wv.strength <= 0) continue;
      wv.age += dt;
      const sz = size.current;
      const far = sz ? Math.hypot(sz.w, sz.h) + 200 : 2000;
      const gone = k.motionSafe
        ? Math.exp(-wv.age * WAVE_FADE) * wv.strength < 0.015 ||
          wv.age * k.waveSpeed > far
        : wv.age >= STILL_SWELL;
      if (gone) wv.strength = 0;
      else waves = true;
    }
    if (!k.motionSafe) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = 0;
      s.vy = 0;
      s.own = s.on ? 1 : 0;
      s.ownV = 0;
      return waves;
    }
    const target = s.on ? 1 : 0;
    // The sweep only matters while the hand does not wholly own the lamp.
    const sweeping = !k.paused && (s.own < 0.999 || target < 1);
    if (sweeping) s.t += dt;
    const G = springs.glide;
    const D = springs.drift;
    s.carry += dt;
    let steps = 0;
    while (s.carry >= STEP && steps < 8) {
      s.carry -= STEP;
      steps += 1;
      // Where: the hand's lamp trails the pointer on glide, so it swings
      // over the cloth like a lamp on an arm rather than a cursor.
      const ax = (-G.stiffness * (s.x - s.tx) - G.damping * s.vx) / G.mass;
      const ay = (-G.stiffness * (s.y - s.ty) - G.damping * s.vy) / G.mass;
      s.vx += ax * STEP;
      s.vy += ay * STEP;
      s.x += s.vx * STEP;
      s.y += s.vy * STEP;
      // How much: taking and handing back the lamp both drift.
      const ao =
        (-D.stiffness * (s.own - target) - D.damping * s.ownV) / D.mass;
      s.ownV += ao * STEP;
      s.own += s.ownV * STEP;
    }
    if (steps === 8) s.carry = 0;
    const handMoving =
      Math.abs(s.x - s.tx) + Math.abs(s.y - s.ty) > 0.05 ||
      Math.abs(s.vx) + Math.abs(s.vy) > 0.5;
    if (!handMoving) {
      s.x = s.tx;
      s.y = s.ty;
      s.vx = 0;
      s.vy = 0;
    }
    const owning = Math.abs(s.own - target) > 0.001 || Math.abs(s.ownV) > 0.005;
    if (!owning) {
      s.own = target;
      s.ownV = 0;
    }
    return sweeping || (handMoving && s.own > 0.001) || owning || waves;
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
    // Sweeping alone, the lamp is slow enough for thirty frames a second;
    // the hand and the waves get every frame.
    let calm = !s.on && s.own === 0;
    for (const wv of s.waves) if (wv.strength > 0) calm = false;
    if (calm && s.last && now - s.drawnAt < 31) {
      frame.current = window.requestAnimationFrame(loop);
      return;
    }
    const dt = s.last ? Math.min(0.05, (now - s.drawnAt) / 1000) : 1 / 60;
    s.last = now;
    s.drawnAt = now;
    const moving = advance(dt);
    draw();
    if (moving) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readPalette, tick };
    report.current = { onWave, onActiveChange };
  });

  // The GPU side, bound to the canvas: built, rebuilt after a lost context,
  // torn down with the component. StrictMode's second run builds again on
  // the same context, which the browser hands back unchanged.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const build = (): boolean => {
      const gl = createGL(canvas, { alpha: false });
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
    k.folds,
    k.sheen,
    k.angle,
    k.soft,
    k.depth,
    k.lampHeight,
    k.reach,
    k.sweep,
    k.seed,
    paused,
    motionSafe,
  ]);

  const setActive = (next: boolean) => {
    if (active.current === next) return;
    active.current = next;
    report.current.onActiveChange?.(next);
  };

  // Switching the hand off hands the lamp back to its sweep, and says so.
  React.useEffect(() => {
    if (interactive) return;
    const s = sim.current;
    s.on = false;
    s.source = null;
    api.current?.kick();
    if (active.current) {
      active.current = false;
      report.current.onActiveChange?.(false);
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
    if (!root) return { x: 0, y: 0 };
    const r = root.getBoundingClientRect();
    return {
      x: clientX - r.left - root.clientLeft,
      y: clientY - r.top - root.clientTop,
    };
  };

  /** The hand takes the lamp to (x, y); taking it from the sweep starts where the lamp already is. */
  const handTo = (x: number, y: number, source: "pointer" | "keyboard") => {
    const s = sim.current;
    const sz = size.current;
    if (s.own < 0.01 && sz && k.motionSafe) {
      const at = lampPoint(sz);
      s.x = at.x;
      s.y = at.y;
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

  /** The hand lets go: the lamp drifts back into its sweep, or rests where it was left. */
  const handAway = (source: "pointer" | "keyboard") => {
    const s = sim.current;
    if (s.source !== source) return;
    const sz = size.current;
    if (sz && sz.w > 0 && sz.h > 0) {
      s.rest = { x: clamp01(s.tx / sz.w), y: clamp01(s.ty / sz.h) };
    }
    s.on = false;
    s.source = null;
    setActive(false);
    if (!k.motionSafe) api.current?.draw();
    kick();
  };

  const sendWave = (x: number, y: number) => {
    const sz = size.current;
    if (k.wave <= 0 || !sz) return;
    const waves = sim.current.waves;
    // A free slot, or else the oldest wave gives way.
    let pick = 0;
    for (let i = 0; i < waves.length; i += 1) {
      const age = waves[i]?.strength ? (waves[i]?.age ?? 0) : Infinity;
      const best = waves[pick]?.strength ? (waves[pick]?.age ?? 0) : Infinity;
      if (age > best) pick = i;
    }
    const slot = waves[pick];
    if (!slot) return;
    slot.x = x;
    slot.y = y;
    slot.age = 0;
    slot.strength = k.wave;
    report.current.onWave?.({
      x: r2(clamp01(x / sz.w)),
      y: r2(clamp01(y / sz.h)),
    });
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
    // A press on a control is the control's; only open cloth sends a wave.
    if (!hit || !rootRef.current?.contains(hit)) sendWave(at.x, at.y);
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") handAway("pointer");
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") handAway("pointer");
  };

  /** The keyboard's lamp: `percent` across the cloth, hanging high. */
  const keyLamp = (percent: number) => {
    const sz = size.current;
    const root = rootRef.current;
    const w = sz?.w ?? root?.clientWidth ?? 0;
    const h = sz?.h ?? root?.clientHeight ?? 0;
    handTo((percent / 100) * w, KEY_Y * h, "keyboard");
  };

  const onSurfaceFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (!event.currentTarget.matches(":focus-visible")) return;
    keyLamp(lampAt);
  };

  const onSurfaceBlur = () => handAway("keyboard");

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    let next: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = lampAt + KEY_STEP;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = lampAt - KEY_STEP;
        break;
      case "PageUp":
        next = lampAt + KEY_PAGE;
        break;
      case "PageDown":
        next = lampAt - KEY_PAGE;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = 100;
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        if (event.repeat) return;
        const sz = size.current;
        if (!sz) return;
        keyLamp(lampAt);
        sendWave((lampAt / 100) * sz.w, KEY_Y * sz.h + sz.h * 0.25);
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    const value = clamp(Math.round(next), 0, 100);
    setLampAt(value);
    keyLamp(value);
  };

  const onColour = () => {
    api.current?.readPalette();
    api.current?.draw();
  };

  const side =
    lampAt < 40
      ? "from the left"
      : lampAt > 60
        ? "from the right"
        : "in the middle";

  return (
    <div
      ref={bindRoot}
      onPointerMove={onPointerMove}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerLeave}
      className={cn(
        // A sideways finger rakes the lamp; an upright swipe scrolls the page.
        "group/satin-rake relative isolate h-full w-full touch-pan-y overflow-clip",
        className,
      )}
      style={{ backgroundColor: paints[0] }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-[opacity,visibility] duration-400 group-data-live/satin-rake:invisible group-data-live/satin-rake:opacity-0"
        style={standIn(paints, k.folds, angle)}
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
      <div
        role="slider"
        tabIndex={interactive ? 0 : -1}
        aria-label={label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={lampAt}
        aria-valuetext={`Lamp ${lampAt} percent across, ${side}`}
        aria-disabled={!interactive || undefined}
        onKeyDown={onKeyDown}
        onFocus={onSurfaceFocus}
        onBlur={onSurfaceBlur}
        className="absolute inset-0 rounded-[inherit] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
      />
      <p id={hintId} className="sr-only">
        Arrow keys move the lamp across the satin; Enter sends a wave through
        it.
      </p>
      <div className="relative z-10 size-full">{children}</div>
    </div>
  );
}

/** Four seeded phases for the drape: two meanders, the branch and its swell. */
const phaseCache = new Map<number, readonly [number, number, number, number]>();
function seedPhases(seed: number): readonly [number, number, number, number] {
  const hit = phaseCache.get(seed);
  if (hit) return hit;
  const rand = lcg(seed * 7 + 3);
  const out = [
    rand() * Math.PI * 2,
    rand() * Math.PI * 2,
    rand() * Math.PI * 2,
    rand() * Math.PI * 2,
  ] as const;
  if (phaseCache.size > 32) phaseCache.clear();
  phaseCache.set(seed, out);
  return out;
}

/**
 * The designed still frame for the server render, the first paint and any
 * browser without WebGL2: the folds as a repeating gradient across their
 * direction, crease to ridge to crease, under a soft pool of lamplight.
 */
function standIn(
  paints: readonly [string, string, string],
  folds: number,
  angle: number,
): React.CSSProperties {
  const [base, deep, lite] = paints;
  const p = 100 / folds;
  const at = (share: number) => `${r2(p * share)}%`;
  const ridge = `color-mix(in oklab, ${lite} 34%, ${base})`;
  const crease = `color-mix(in oklab, ${deep} 70%, ${base})`;
  const cssAngle = Math.round(180 + clamp(angle, -90, 90));
  return {
    backgroundColor: base,
    backgroundImage: [
      `radial-gradient(70% 120% at 28% 22%, color-mix(in oklab, ${lite} 30%, transparent), transparent 70%)`,
      `radial-gradient(120% 140% at 50% 50%, transparent 55%, color-mix(in oklab, ${deep} 45%, transparent))`,
      `repeating-linear-gradient(${cssAngle}deg, ${crease} 0%, ${base} ${at(0.26)}, ${ridge} ${at(0.55)}, ${base} ${at(0.8)}, ${crease} ${at(1)})`,
    ].join(", "),
  };
}
