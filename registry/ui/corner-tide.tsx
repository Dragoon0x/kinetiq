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
import { cn } from "@/registry/lib/utils";

export type CornerTideProps = {
  /** How square the squarest tiles get: the corner exponent at the tide's crest, 3 to 12. @default 6 */
  exponent?: number;
  /** How round the roundest tiles get: the corner exponent in the trough, 1.2 to 4 (2 is a circle). @default 2 */
  minExponent?: number;
  /** The gap between tiles, in px, 2 to 16. @default 6 */
  gap?: number;
  /** How much light each tile holds and spills around it, 0 to 1. @default 0.5 */
  glow?: number;
  /** One tile and its gap, in px, 16 to 64. @default 30 */
  cell?: number;
  /** The tiles' colours, one to three CSS colours laid across the grid; resolved on the element so they follow the theme. @default ["var(--accent-bright)", "var(--signal)"] */
  colors?: readonly string[];
  /** How far the tide swings the corners, 0 (every tile still at the middle exponent) to 1. @default 0.85 */
  tide?: number;
  /** How fast the tide travels, 0 to 1. @default 0.35 */
  speed?: number;
  /** The reach of the pointer's rounded patch, in px. @default 70 */
  patchRadius?: number;
  /** How fast a squaring ripple travels outward, in px per second. @default 520 */
  rippleSpeed?: number;
  /** Content above the tiles: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The pointer and keys push the patch and send ripples. @default true */
  interactive?: boolean;
  /** Hold the tide where it is; the patch and ripples still answer. @default false */
  paused?: boolean;
  /** Names the grid for assistive technology. @default "Tile grid" */
  label?: string;
  /** Seeds the tide's directions and phases, so two grids never swing alike. @default 4 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when a ripple is sent, with its origin in px from the box's top left. */
  onRipple?: (x: number, y: number) => void;
  /** Shows the tide but takes no input. @default false */
  disabled?: boolean;
  /** Sizes the box. @default "h-56 w-full" */
  className?: string;
};

const STEP = 1 / 120;
const RIPPLES = 4;
/** The keys move the patch one tile at a time. */
const MARGIN = 12;

/**
 * Each tile rings like the recoil spring: its damping ratio (ζ ≈ 0.53, two
 * visible bounces) and its ~700 ms settle, as an impulse response the shader
 * can evaluate for any tile at any moment without holding state.
 */
const RING = (() => {
  const { stiffness, damping, mass } = springs.recoil;
  const zeta = damping / (2 * Math.sqrt(stiffness * mass));
  const decay = 4 / 0.7;
  const w0 = decay / zeta;
  const wd = w0 * Math.sqrt(1 - zeta * zeta);
  const peakAt = Math.atan(wd / decay) / wd;
  const peak = Math.exp(-decay * peakAt) * Math.sin(wd * peakAt);
  return { decay, wd, norm: 1 / peak };
})();

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** A small seeded generator: the same tide for the same seed. */
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

/** Two long waves crossing the grid at different angles, as [kx, ky, phase] pairs. */
function wavesOf(seed: number): Float32Array {
  const rand = lcg(seed);
  const a1 = 0.25 + rand() * 0.5;
  const a2 = -0.9 - rand() * 0.6;
  const l1 = 330 + rand() * 120;
  const l2 = 210 + rand() * 90;
  return new Float32Array([
    (Math.cos(a1) * Math.PI * 2) / l1,
    (Math.sin(a1) * Math.PI * 2) / l1,
    rand() * Math.PI * 2,
    (Math.cos(a2) * Math.PI * 2) / l2,
    (Math.sin(a2) * Math.PI * 2) / l2,
    rand() * Math.PI * 2,
  ]);
}

const FRAGMENT = /* glsl */ `
${GLSL_SRGB}
in vec2 v_uv;
out vec4 o_color;
uniform vec2 u_res;
uniform float u_px;
uniform vec4 u_grid;
uniform vec2 u_origin;
uniform vec3 u_exp;
uniform float u_glow;
uniform float u_time;
uniform vec4 u_w1;
uniform vec4 u_w2;
uniform vec4 u_patch;
uniform vec4 u_rip[4];
uniform vec4 u_ring;
uniform float u_reduced;
uniform vec3 u_col[3];
uniform float u_ncol;
uniform float u_dark;

// How square a tile is, 0 (the roundest) to 1 (the squarest), and past either
// end while it rings; flash is how hard a passing ripple has just hit it.
float squareness(vec2 c, out float flash) {
  float a = sin(dot(c, u_w1.xy) - u_time * u_w1.z + u_w1.w);
  float b = sin(dot(c, u_w2.xy) - u_time * u_w2.z + u_w2.w);
  float f = 0.5 + 0.5 * u_exp.z * clamp((a + b) * 0.75, -1.0, 1.0);
  vec2 dp = c - u_patch.xy;
  float near = exp(-dot(dp, dp) / (u_patch.z * u_patch.z));
  f = mix(f, 0.0, near * u_patch.w);
  flash = 0.0;
  for (int i = 0; i < 4; i++) {
    vec4 r = u_rip[i];
    if (r.z < 0.0) continue;
    float dist = length(c - r.xy);
    float h;
    if (u_reduced > 0.5) {
      float reach = u_grid.x * 3.5;
      h = exp(-(dist * dist) / (reach * reach)) * (1.0 - smoothstep(0.0, 0.5, r.z));
    } else {
      float tau = r.z - dist / u_ring.x;
      if (tau <= 0.0) continue;
      h = exp(-u_ring.y * tau) * sin(u_ring.z * tau) * u_ring.w;
      h /= 1.0 + dist / 520.0;
    }
    f += r.w * h;
    flash += r.w * max(h, 0.0);
  }
  return f;
}

vec3 paletteAt(vec2 c) {
  float t = clamp(dot(c / u_res, vec2(0.72, 0.28)), 0.0, 1.0);
  if (u_ncol < 1.5) return u_col[0];
  if (u_ncol < 2.5) return mix(u_col[0], u_col[1], t);
  return t < 0.5
    ? mix(u_col[0], u_col[1], t * 2.0)
    : mix(u_col[1], u_col[2], t * 2.0 - 1.0);
}

void main() {
  vec2 p = v_uv * u_res;
  float cell = u_grid.x;
  float halfTile = u_grid.y;
  vec2 i0 = floor((p - u_origin) / cell - 0.5);
  vec3 tileRgb = vec3(0.0);
  float cover = 0.0;
  vec3 haloRgb = vec3(0.0);
  float haloA = 0.0;
  // The four nearest tiles: the one under the pixel and the three whose
  // halos can reach it, so light meets across the gaps without seams.
  for (int dj = 0; dj < 2; dj++) {
    for (int di = 0; di < 2; di++) {
      vec2 idx = i0 + vec2(float(di), float(dj));
      if (idx.x < 0.0 || idx.y < 0.0 || idx.x > u_grid.z - 1.0 || idx.y > u_grid.w - 1.0) continue;
      vec2 c = u_origin + (idx + 0.5) * cell;
      float flash;
      float f = squareness(c, flash);
      // Ringing past the square end sharpens further; past the round end it
      // holds at the roundest, so a tile never pinches into a diamond.
      float n = clamp(mix(u_exp.x, u_exp.y, f), u_exp.x, 18.0);
      vec2 q = abs(p - c) / halfTile;
      // The superellipse's own norm, scaled so a large exponent never overflows.
      float m = max(max(q.x, q.y), 1e-4);
      float L = m * pow(pow(q.x / m, n) + pow(q.y / m, n), 1.0 / n);
      float d = (L - 1.0) * halfTile;
      float cov = 1.0 - smoothstep(-u_px, u_px, d);
      vec3 col = paletteAt(c);
      float roundness = clamp(1.0 - f, 0.0, 1.0);
      float hit = min(flash, 1.0);
      // Lit from within: a pale core to a deeper rim, the core brighter as the
      // tile rounds into a lens and as a ripple strikes it.
      // The light inside is round whatever the tile's corners do, so a square
      // tile glows like a lamp behind glass rather than a pyramid.
      float core = 1.0 - smoothstep(0.0, 1.25, length(p - c) / halfTile);
      core *= core;
      vec3 rim = col * mix(0.74, 0.42, u_dark);
      vec3 lit = mix(col, vec3(1.0), 0.16 + 0.3 * roundness + 0.42 * hit);
      vec3 inside = mix(rim, lit, core);
      vec2 dir = (p - c) / max(length(p - c), 1e-3);
      float edge = smoothstep(-3.0, -0.8, d) * (1.0 - smoothstep(-0.8, 0.4, d));
      inside = mix(inside, vec3(1.0), edge * max(0.0, dot(dir, vec2(-0.6, -0.8))) * 0.35);
      tileRgb += inside * cov;
      cover += cov;
      float spill = exp(-max(d, 0.0) / (halfTile * 0.55)) * (1.0 - cov);
      float h = spill * u_glow * (0.5 + 0.35 * roundness + 0.6 * hit) * mix(0.5, 1.0, u_dark);
      haloRgb += col * h;
      haloA += h;
    }
  }
  cover = min(cover, 1.0);
  float k = 0.55;
  haloA = min(haloA * k, 1.0);
  haloRgb *= k;
  vec3 rgb = tileRgb + haloRgb * (1.0 - cover);
  float a = cover + haloA * (1.0 - cover);
  vec3 straight = a > 1e-4 ? clamp(rgb / a, 0.0, 1.0) : vec3(0.0);
  o_color = vec4(kx_linearToSrgb(straight) * a, a);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  lost: boolean;
};

type Size = {
  w: number;
  h: number;
  bw: number;
  bh: number;
  dpr: number;
  cols: number;
  rows: number;
  ox: number;
  oy: number;
};

type Sim = {
  last: number;
  carry: number;
  /** The tide's clock, s. */
  t: number;
  /** The patch: where it is, how fast it moves, and how far it has swelled in. */
  px: number;
  py: number;
  vx: number;
  vy: number;
  amount: number;
  amountV: number;
  /** The ripples: origin x, y, age (s, below zero when none) and strength. */
  rip: Float32Array;
};

type Hand = {
  x: number;
  y: number;
  present: boolean;
  source: "pointer" | "key" | null;
  placed: boolean;
};

type Api = {
  draw: () => void;
  kick: () => void;
  resize: () => void;
  readColours: () => void;
  tick: (now: number) => void;
};

/** The props a grid must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button:not([data-tide]),input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[contenteditable='true']";

/**
 * A centred grid of glowing tiles drawn per pixel in one WebGL2 pass on a
 * transparent canvas. Each tile is a superellipse, |x|ⁿ + |y|ⁿ = 1, whose
 * corner exponent rides a slow travelling field — two long waves crossing at
 * different angles — so bands of tiles soften toward circles and sharpen back
 * toward squares while every tile keeps its size. Each is lit from within, a
 * pale core to a deeper rim, brighter as it rounds into a lens, with a halo
 * summed over the four nearest tiles so the light meets across the gaps.
 *
 * The pointer pushes its own rounded patch through the grid, following on
 * the glide spring and swelling in on drift. A click sends a squaring ripple
 * outward: as the ring passes, each tile is kicked square and rings back with
 * the recoil spring's damping ratio — rounder than its rest once, then home —
 * its core flashing as it squares. The keyboard's way in is a transparent
 * button behind the content: arrow keys move the patch a tile at a time,
 * Enter or Space sends a ripple from it. Under reduced motion the tide is
 * frozen, the patch moves without easing, and a ripple squares the tiles
 * near it at once and lets them ease back without travelling.
 */
export function CornerTide({
  exponent = 6,
  minExponent = 2,
  gap = 6,
  glow = 0.5,
  cell = 30,
  colors = ["var(--accent-bright)", "var(--signal)"],
  tide = 0.85,
  speed = 0.35,
  patchRadius = 70,
  rippleSpeed = 520,
  children,
  interactive = true,
  paused = false,
  label = "Tile grid",
  seed = 4,
  dpr = 2,
  onRipple,
  disabled = false,
  className,
}: CornerTideProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const lo = clamp(minExponent, 1.2, 4);
  const given = (colors.length ? colors : ["var(--accent-bright)"]).slice(0, 3);
  // Two colours meet through their oklch midpoint, so the grid's middle keeps
  // its chroma instead of passing through grey.
  const paints =
    given.length === 2
      ? [
          given[0] ?? "",
          `color-mix(in oklch, ${given[0] ?? ""}, ${given[1] ?? ""})`,
          given[1] ?? "",
        ]
      : given;
  const paintKey = paints.join("|");
  const pitch = clamp(cell, 16, 64);
  const k = {
    hi: Math.max(lo + 0.5, clamp(exponent, 3, 12)),
    lo,
    cell: pitch,
    gap: clamp(gap, 2, Math.min(16, pitch - 8)),
    glow: clamp01(glow),
    tide: clamp01(tide),
    speed: clamp01(speed),
    radius: clamp(patchRadius, 16, 400),
    ripple: clamp(rippleSpeed, 80, 3000),
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
  const colour = React.useRef({ rgb: new Float32Array(9), count: 1, dark: 1 });
  const waves = React.useMemo(() => wavesOf(seed), [seed]);
  const reader = React.useRef<CanvasRenderingContext2D | null>(null);
  const frame = React.useRef(0);
  const visible = React.useRef(false);
  const shown = React.useRef(false);
  const sim = React.useRef<Sim>({
    last: 0,
    carry: 0,
    t: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    amount: 0,
    amountV: 0,
    rip: new Float32Array(RIPPLES * 4).fill(-1),
  });
  const hand = React.useRef<Hand>({
    x: 0,
    y: 0,
    present: false,
    source: null,
    placed: false,
  });
  const nextRipple = React.useRef(0);
  const api = React.useRef<Api | null>(null);
  const report = React.useRef(onRipple);
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
    const n = Math.max(1, carriers.children.length - 1);
    for (let i = 0; i < 3; i += 1) {
      const c = read(carriers.children[Math.min(i, n - 1)]);
      out.rgb[i * 3] = c[0] ?? 0;
      out.rgb[i * 3 + 1] = c[1] ?? 0;
      out.rgb[i * 3 + 2] = c[2] ?? 0;
    }
    out.count = n;
    const page = read(carriers.children[n]);
    const lum =
      0.2126 * (page[0] ?? 0) +
      0.7152 * (page[1] ?? 0) +
      0.0722 * (page[2] ?? 0);
    out.dark = lum < 0.3 ? 1 : 0;
  };

  const resize = () => {
    const g = gpu.current;
    const canvas = canvasRef.current;
    if (!g || g.lost || !canvas) return;
    const r = resizeGL(g.gl, canvas, { dprCap: k.dpr });
    const w = r.width / r.dpr;
    const h = r.height / r.dpr;
    const cols = Math.max(1, Math.floor((w - 2 * MARGIN + k.gap) / k.cell));
    const rows = Math.max(1, Math.floor((h - 2 * MARGIN + k.gap) / k.cell));
    const ox = (w - (cols * k.cell - k.gap)) / 2 - k.gap / 2;
    const oy = (h - (rows * k.cell - k.gap)) / 2 - k.gap / 2;
    size.current = {
      w,
      h,
      bw: r.width,
      bh: r.height,
      dpr: r.dpr,
      cols,
      rows,
      ox,
      oy,
    };
    const s = sim.current;
    if (!hand.current.placed) {
      s.px = w / 2;
      s.py = h / 2;
    }
  };

  const draw = () => {
    const g = gpu.current;
    const sz = size.current;
    if (!g || g.lost || !sz) return;
    const { gl, program, tri } = g;
    const u = program.uniforms;
    const s = sim.current;
    const c = colour.current;
    const w = waves;
    // The tide's two waves move at their own pace; speed scales both.
    const pace = 0.2 + 1.6 * k.speed;
    program.use();
    gl.viewport(0, 0, sz.bw, sz.bh);
    gl.uniform2f(u.u_res ?? null, sz.w, sz.h);
    gl.uniform1f(u.u_px ?? null, 0.75 / sz.dpr);
    gl.uniform4f(
      u.u_grid ?? null,
      k.cell,
      (k.cell - k.gap) / 2,
      sz.cols,
      sz.rows,
    );
    gl.uniform2f(u.u_origin ?? null, sz.ox, sz.oy);
    gl.uniform3f(u.u_exp ?? null, k.lo, k.hi, k.tide);
    gl.uniform1f(u.u_glow ?? null, k.glow);
    gl.uniform1f(u.u_time ?? null, s.t);
    gl.uniform4f(u.u_w1 ?? null, w[0] ?? 0, w[1] ?? 0, 0.9 * pace, w[2] ?? 0);
    gl.uniform4f(u.u_w2 ?? null, w[3] ?? 0, w[4] ?? 0, 1.2 * pace, w[5] ?? 0);
    gl.uniform4f(u.u_patch ?? null, s.px, s.py, k.radius, s.amount);
    gl.uniform4fv(u.u_rip ?? null, s.rip);
    gl.uniform4f(u.u_ring ?? null, k.ripple, RING.decay, RING.wd, RING.norm);
    gl.uniform1f(u.u_reduced ?? null, k.motionSafe ? 0 : 1);
    gl.uniform3fv(u.u_col ?? null, c.rgb);
    gl.uniform1f(u.u_ncol ?? null, c.count);
    gl.uniform1f(u.u_dark ?? null, c.dark);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    tri.draw();
    if (!shown.current) {
      shown.current = true;
      rootRef.current?.setAttribute("data-live", "");
    }
  };

  /** Steps the tide, the patch's springs and the ripples; says whether anything moves. */
  const advance = (dt: number): boolean => {
    const s = sim.current;
    const sz = size.current;
    const hd = hand.current;
    let busy = false;
    const want = hd.present && k.enabled ? 1 : 0;
    if (!k.motionSafe) {
      s.px = hd.present ? hd.x : s.px;
      s.py = hd.present ? hd.y : s.py;
      s.vx = 0;
      s.vy = 0;
      s.amount = want;
      s.amountV = 0;
    } else {
      if (!k.paused && k.tide > 0) {
        s.t += dt;
        busy = true;
      }
      // The patch follows on the glide spring; it swells in and out on drift.
      const gs = springs.glide;
      const ds = springs.drift;
      s.carry += dt;
      let steps = 0;
      while (s.carry >= STEP && steps < 8) {
        s.carry -= STEP;
        steps += 1;
        if (hd.present) {
          s.vx +=
            ((-gs.stiffness * (s.px - hd.x) - gs.damping * s.vx) / gs.mass) *
            STEP;
          s.vy +=
            ((-gs.stiffness * (s.py - hd.y) - gs.damping * s.vy) / gs.mass) *
            STEP;
          s.px += s.vx * STEP;
          s.py += s.vy * STEP;
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
          (Math.abs(s.px - hd.x) > 0.05 ||
            Math.abs(s.py - hd.y) > 0.05 ||
            Math.abs(s.vx) + Math.abs(s.vy) > 0.5)) ||
        Math.abs(s.amount - want) > 0.002 ||
        Math.abs(s.amountV) > 0.01;
      if (!moving) {
        s.amount = want;
        s.amountV = 0;
        if (hd.present) {
          s.px = hd.x;
          s.py = hd.y;
          s.vx = 0;
          s.vy = 0;
        }
      } else busy = true;
    }
    // A ripple lives until its ring has left the grid and the last tile it
    // struck has rung down.
    const reach = sz ? Math.hypot(sz.w, sz.h) : 1000;
    for (let i = 0; i < RIPPLES; i += 1) {
      const age = s.rip[i * 4 + 2]!;
      if (age < 0) continue;
      const next = age + dt;
      const life = k.motionSafe ? reach / k.ripple + 0.9 : 0.55;
      s.rip[i * 4 + 2] = next > life ? -1 : next;
      busy = true;
    }
    return busy;
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
    const busy = advance(dt);
    draw();
    if (busy) frame.current = window.requestAnimationFrame(loop);
    else s.last = 0;
  };

  const kick = () => {
    if (frame.current || !visible.current || document.hidden) return;
    frame.current = window.requestAnimationFrame(loop);
  };

  React.useLayoutEffect(() => {
    api.current = { draw, kick, resize, readColours, tick };
    report.current = onRipple;
  });

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
    api.current?.kick();
  }, [k.dpr, k.cell, k.gap]);

  React.useEffect(() => {
    api.current?.draw();
    api.current?.kick();
  }, [
    k.hi,
    k.lo,
    k.glow,
    k.tide,
    k.speed,
    k.radius,
    k.ripple,
    waves,
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

  const handTo = (x: number, y: number, source: "pointer" | "key") => {
    const hd = hand.current;
    const fresh = !hd.present;
    hd.x = x;
    hd.y = y;
    hd.present = true;
    hd.placed = true;
    hd.source = source;
    // A patch arriving from nowhere starts where the hand is, not across the grid.
    if (fresh && sim.current.amount < 0.05) {
      sim.current.px = x;
      sim.current.py = y;
      sim.current.vx = 0;
      sim.current.vy = 0;
    }
    kick();
  };

  const handLeave = () => {
    const hd = hand.current;
    hd.present = false;
    hd.source = null;
    kick();
  };

  /** A squaring ripple from (x, y), in px from the box's top left. */
  const ripple = (x: number, y: number) => {
    if (!k.enabled) return;
    const s = sim.current;
    const i = nextRipple.current;
    nextRipple.current = (i + 1) % RIPPLES;
    s.rip[i * 4] = x;
    s.rip[i * 4 + 1] = y;
    s.rip[i * 4 + 2] = 0;
    s.rip[i * 4 + 3] = 0.95;
    report.current?.(Math.round(x), Math.round(y));
    setSaid((v) => ({ n: v.n + 1, text: "Ripple sent." }));
    kick();
  };

  const drag = useDrag({
    threshold: 6,
    disabled: !k.enabled,
    onStart: ({ point, event }) => {
      if (event.pointerType === "mouse") return;
      const at = local(point.x, point.y);
      handTo(at.x, at.y, "pointer");
    },
    onMove: ({ point, event }) => {
      if (event.pointerType === "mouse") return;
      const at = local(point.x, point.y);
      handTo(at.x, at.y, "pointer");
    },
    onEnd: ({ event }) => {
      if (event.pointerType !== "mouse") handLeave();
    },
    onCancel: () => handLeave(),
    onTap: (event) => {
      const at = local(event.clientX, event.clientY);
      ripple(at.x, at.y);
    },
  });

  const fromContent = (target: EventTarget) => {
    const el = target instanceof Element ? target : null;
    const hit = el?.closest(INTERACTIVE);
    return Boolean(hit && rootRef.current?.contains(hit));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!k.enabled || fromContent(event.target)) return;
    drag.onPointerDown(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.onPointerMove(event);
    if (event.pointerType !== "mouse" || !k.enabled) return;
    const at = local(event.clientX, event.clientY);
    handTo(at.x, at.y, "pointer");
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
      const from = hd.present
        ? { x: hd.x, y: hd.y }
        : { x: sz.w / 2, y: sz.h / 2 };
      handTo(
        clamp(
          from.x + move[0] * k.cell,
          sz.ox + k.cell / 2,
          sz.ox + (sz.cols - 0.5) * k.cell,
        ),
        clamp(
          from.y + move[1] * k.cell,
          sz.oy + k.cell / 2,
          sz.oy + (sz.rows - 0.5) * k.cell,
        ),
        "key",
      );
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
    // The keyboard's patch lands on the tile nearest the middle.
    const cx = sz.ox + (Math.floor(sz.cols / 2) + 0.5) * k.cell;
    const cy = sz.oy + (Math.floor(sz.rows / 2) + 0.5) * k.cell;
    handTo(cx, cy, "key");
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
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onLostPointerCapture={drag.onLostPointerCapture}
      onPointerLeave={(event) => {
        if (
          event.pointerType !== "touch" &&
          hand.current.source === "pointer"
        ) {
          handLeave();
        }
      }}
      className={cn(
        "group/corner-tide relative isolate h-56 w-full overflow-clip",
        k.enabled ? "touch-pan-y" : "touch-auto",
        className,
      )}
    >
      <TideStill
        uid={uid}
        paint={paints[0] ?? "var(--accent-bright)"}
        cell={k.cell}
        gap={k.gap}
        exponent={(k.lo + k.hi) / 2}
      />
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
        {[...paints, "var(--background)"].map((paint, i) => (
          <span
            key={i}
            className="transition-colors duration-1"
            style={{ color: paint }}
          />
        ))}
      </span>
      <button
        type="button"
        data-tide=""
        aria-label={label}
        aria-describedby={hintId}
        disabled={disabled}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={(event) => {
          // Enter, Space or assistive technology: a click with no pointer
          // behind it sends a ripple from the patch.
          if (event.detail !== 0) return;
          const sz = size.current;
          const hd = hand.current;
          if (!sz) return;
          ripple(hd.present ? hd.x : sz.w / 2, hd.present ? hd.y : sz.h / 2);
        }}
        className={cn(
          "absolute inset-0 z-0 size-full rounded-[inherit] outline-none",
          k.enabled ? "cursor-pointer" : "cursor-default",
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        )}
      />
      <div className="pointer-events-none relative z-10 size-full *:pointer-events-auto">
        {children}
      </div>
      <p id={hintId} className="sr-only">
        Enter or Space sends a squaring ripple from the patch. Arrow keys move
        the rounded patch a tile at a time; Escape lifts it.
      </p>
      <p role="status" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </p>
    </div>
  );
}

/**
 * The designed still for the server render, the first paint and any browser
 * without WebGL2: the grid's tiles at the middle exponent, each with a pale
 * core, tiled from the centre of the box as an SVG pattern.
 */
function TideStill({
  uid,
  paint,
  cell,
  gap,
  exponent,
}: {
  uid: string;
  paint: string;
  cell: number;
  gap: number;
  exponent: number;
}) {
  const d = React.useMemo(() => {
    const half = (cell - gap) / 2;
    const c = cell / 2;
    const e = 2 / exponent;
    const pts: string[] = [];
    for (let i = 0; i < 48; i += 1) {
      const a = (i / 48) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = c + Math.sign(ca) * Math.pow(Math.abs(ca), e) * half;
      const y = c + Math.sign(sa) * Math.pow(Math.abs(sa), e) * half;
      pts.push(`${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`);
    }
    return `M${pts.join("L")}Z`;
  }, [cell, gap, exponent]);
  const pattern = `${uid}-tile`;
  const fill = `${uid}-fill`;
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full transition-opacity duration-300 group-data-live/corner-tide:opacity-0"
    >
      <defs>
        <radialGradient id={fill}>
          <stop
            offset="0%"
            style={{ stopColor: `color-mix(in oklab, ${paint} 45%, white)` }}
          />
          <stop offset="100%" style={{ stopColor: paint }} />
        </radialGradient>
        <pattern
          id={pattern}
          patternUnits="userSpaceOnUse"
          x="50%"
          y="50%"
          width={cell}
          height={cell}
        >
          <path d={d} fill={`url(#${fill})`} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${pattern})`} />
    </svg>
  );
}
