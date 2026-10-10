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

export type PulseTilesPattern = "diagonal" | "ripple" | "checker" | "spiral";
export type PulseTilesPalette = "cobalt" | "dusk" | "reef" | "ember";

export type PulseTilesProps = {
  /** The content on top of the tiles: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** The tile pitch in px, 12 to 64: small tiles make a fine mosaic, large ones pads. @default 28 */
  tile?: number;
  /** How much page shows between tiles, px. @default 3 */
  gap?: number;
  /** A tile's corner radius, px. @default 5 */
  radius?: number;
  /** Beats per minute, 30 to 200; four beats make a bar. @default 96 */
  tempo?: number;
  /** A named palette, or 2 to 6 CSS colours of your own; each wave carries the next. @default "cobalt" */
  palette?: PulseTilesPalette | readonly string[];
  /** The patterns the grid plays, in turn. @default ["diagonal", "ripple", "checker", "spiral"] */
  patterns?: readonly PulseTilesPattern[];
  /** How many bars each pattern plays before the next one takes over. @default 4 */
  bars?: number;
  /** How long a struck tile takes to fade back to rest, ms. @default 900 */
  decay?: number;
  /** How far lit tiles bloom into the gaps around them, 0 to 1. @default 0.6 */
  glow?: number;
  /** How much a struck tile swells inside its gap, 0 to 1. @default 0.5 */
  pop?: number;
  /** A hovering pointer lifts the tile under it and a press sends a ripple. @default true */
  interactive?: boolean;
  /** How far and how brightly a ripple from a press travels, 0 to 1. @default 0.7 */
  pointerStrength?: number;
  /** Stop the beat: lit tiles fade and the grid rests until it is touched. @default false */
  paused?: boolean;
  /** Seeds where each pattern starts, which way it runs and the colour order. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires with the pattern now playing: once when the beat starts, then at every change. */
  onPatternChange?: (pattern: PulseTilesPattern) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/**
 * Pigments at fixed lightness, so a lit tile is the same colour on a light
 * page and a dark one. The default is built from the accent tokens.
 */
const PALETTES: Record<PulseTilesPalette, readonly string[]> = {
  cobalt: [
    "oklch(from var(--accent-bright) 0.64 c h)",
    "oklch(from var(--signal) 0.78 c h)",
    "oklch(from var(--accent-bright) 0.8 calc(c * 0.5) calc(h - 48))",
    "oklch(from var(--accent-bright) 0.56 calc(c * 0.85) calc(h + 38))",
  ],
  dusk: [
    "oklch(0.68 0.12 300)",
    "oklch(0.72 0.13 352)",
    "oklch(0.81 0.1 70)",
    "oklch(0.6 0.1 258)",
  ],
  reef: [
    "oklch(0.74 0.1 192)",
    "oklch(0.8 0.13 150)",
    "oklch(0.66 0.1 236)",
    "oklch(0.78 0.11 42)",
  ],
  ember: [
    "oklch(0.66 0.15 34)",
    "oklch(0.78 0.13 66)",
    "oklch(0.58 0.14 18)",
    "oklch(0.86 0.1 92)",
  ],
};

/** The page between tiles, a tile at rest, and the light that catches a bevel. */
const GROUND = "var(--background)";
const REST = "color-mix(in oklab, var(--foreground) 7%, var(--background))";
const HIGHLIGHT = "color-mix(in oklab, var(--background) 30%, white)";

const ALL_PATTERNS: readonly PulseTilesPattern[] = [
  "diagonal",
  "ripple",
  "checker",
  "spiral",
];

/** Beats between the waves each pattern launches. */
const PERIOD: Record<PulseTilesPattern, number> = {
  diagonal: 2,
  ripple: 2,
  checker: 2,
  spiral: 4,
};

/** A press's ripple front travels this many tiles a second. */
const RIPPLE_SPEED = 14;
/** The keyboard's ripple is a softer one than a press. */
const FOCUS_RIPPLE = 0.6;
const RIPPLES = 4;
/** A full-strength strike kicks the swell spring hard enough to peak near 1. */
const POP_KICK = 38;
/** Fixed physics step for the swell springs. */
const STEP = 1 / 120;
/** The recoil spring: a struck tile taps, overshoots twice and is still. */
const RECOIL = springs.recoil;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** A small seeded generator: the same grid for the same seed. */
function lcg(seed: number) {
  let s = (Math.imul(Math.round(seed) | 0, 2654435761) ^ 2246822519) >>> 0;
  if (s === 0) s = 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Any CSS colour the canvas understands, as sRGB 0–1, by painting one pixel. */
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

/** The props a background must leave to the content on top of it. */
const INTERACTIVE =
  "a[href],button,input,select,textarea,label,summary,[role='button'],[role='link'],[role='slider'],[role='tab'],[contenteditable='true'],[tabindex]:not([tabindex='-1'])";

const FRAGMENT = `
uniform vec2 u_size;
uniform float u_scale;
uniform vec2 u_origin;
uniform float u_pitch;
uniform float u_rest;
uniform float u_round;
uniform float u_swell;
uniform ivec2 u_grid;
uniform highp sampler2D u_data;
uniform vec3 u_ground;
uniform vec3 u_base;
uniform vec3 u_hi;
uniform float u_glow;
in vec2 v_uv;
out vec4 outColor;

float box(vec2 p, float hs, float r) {
  vec2 q = abs(p) - vec2(hs - r);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

vec4 lightOf(ivec2 c) { return texelFetch(u_data, ivec2(c.x * 2, c.y), 0); }
vec4 shapeOf(ivec2 c) { return texelFetch(u_data, ivec2(c.x * 2 + 1, c.y), 0); }

void main() {
  vec2 px = v_uv * u_size;
  ivec2 c = clamp(ivec2(floor((px - u_origin) / u_pitch)), ivec2(0), u_grid - 1);
  vec2 local = px - u_origin - (vec2(c) + 0.5) * u_pitch;
  vec4 a = lightOf(c);
  vec4 b = shapeOf(c);
  float level = a.a;
  float swell = (b.r * 255.0 - 128.0) / 100.0;
  float hover = b.g;
  float after = b.b;
  float hs = u_rest + swell * u_swell + hover * u_swell * 0.4;
  float d = box(local, hs, min(u_round, hs));
  float aa = 0.6 / u_scale;
  float inside = 1.0 - smoothstep(-aa, aa, d);

  // Lit neighbours bloom into the gap around them: their light, weighted by
  // how close their edge is, mixed into the page.
  vec3 bloom = vec3(0.0);
  float weight = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      ivec2 n = c + ivec2(x, y);
      if (n.x < 0 || n.y < 0 || n.x >= u_grid.x || n.y >= u_grid.y) continue;
      vec4 na = lightOf(n);
      vec2 np = local - vec2(float(x), float(y)) * u_pitch;
      float nd = max(box(np, u_rest, min(u_round, u_rest)), 0.0);
      float f = na.a * exp(-nd / (u_pitch * 0.3));
      bloom += na.rgb * f;
      weight += f;
    }
  }
  vec3 halo = weight > 0.0 ? bloom / weight : u_ground;
  vec3 ground = mix(u_ground, halo, clamp(weight, 0.0, 1.0) * u_glow * 0.62);

  vec3 rest = mix(u_base, a.rgb, after * 0.16);
  vec3 tile = mix(rest, a.rgb, level);
  // Light from the upper left: a soft bevel that strengthens as the tile lights.
  float bevel = clamp((-local.x - local.y) / (hs * 2.0), -1.0, 1.0);
  tile = mix(tile, u_hi, max(bevel, 0.0) * (0.06 + 0.24 * level + 0.3 * hover));
  tile = mix(tile, u_ground, max(-bevel, 0.0) * 0.1 * (1.0 - level));
  // The hovered tile carries a hairline rim of light.
  float rim = (1.0 - smoothstep(0.0, aa * 2.0 + 0.6, abs(d + 0.9))) * hover * 0.55;
  tile = mix(tile, u_hi, rim);
  outColor = vec4(mix(ground, tile, inside), 1.0);
}
`;

type Config = {
  tile: number;
  gap: number;
  radius: number;
  tempo: number;
  paletteKey: string;
  patterns: readonly PulseTilesPattern[];
  bars: number;
  decay: number;
  glow: number;
  pop: number;
  interactive: boolean;
  strength: number;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onPatternChange?: (pattern: PulseTilesPattern) => void;
};

type Grid = {
  w: number;
  h: number;
  pitch: number;
  cols: number;
  rows: number;
  n: number;
  ox: number;
  oy: number;
  level: Float32Array;
  /** How fast each tile's light fades: a ripple's strike passes quicker than a beat's. */
  quick: Uint8Array;
  /** The frozen chord under reduced motion; never decays. */
  hold: Float32Array;
  after: Float32Array;
  /** The lit colour shown, and the colour it is easing toward. */
  rgb: Float32Array;
  target: Float32Array;
  swell: Float32Array;
  swellV: Float32Array;
  hover: Float32Array;
  delay: Float32Array;
  wave: Int32Array;
  data: Uint8Array;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  texture: WebGLTexture;
  texW: number;
  texH: number;
  lost: boolean;
};

type Ripple = {
  on: boolean;
  x: number;
  y: number;
  radius: number;
  reach: number;
  strength: number;
  colour: number;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  ripple: (x: number, y: number, strength: number) => void;
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
  let grid: Grid | null = null;
  let frame = 0;
  let last = 0;
  let disposed = false;
  let failed = false;
  let reported: PulseTilesPattern | null = null;
  const read = rgbReader();
  /** Ground, rest, highlight, then up to six palette colours, as RGB 0–1. */
  const colours = new Float32Array(27);
  let paletteSize = 4;
  const sim = {
    beat: 0,
    slot: -1,
    kind: "diagonal" as PulseTilesPattern,
    period: 2,
    colourShift: 0,
    nextRipple: 0,
  };
  const hand = {
    x: 0,
    y: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };
  const ripples: Ripple[] = Array.from({ length: RIPPLES }, () => ({
    on: false,
    x: 0,
    y: 0,
    radius: 0,
    reach: 0,
    strength: 0,
    colour: 0,
  }));

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    const texture = gl.createTexture();
    if (!texture) {
      tri.dispose();
      program.dispose();
      return false;
    }
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gpu = { gl, program, tri, texture, texW: 0, texH: 0, lost: false };
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.gl.deleteTexture(g.texture);
    g.tri.dispose();
    g.program.dispose();
  };

  const seedShift = () => Math.floor(lcg(cfg?.seed ?? 1)() * 997);

  /**
   * Lays the delays of the pattern that owns the current bar. At a bar line
   * the new pattern is dated from the line itself; laid for any other reason
   * (a resize, a new seed) it starts from now, so nothing flashes at once.
   */
  const lay = (atBarLine = false) => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const list = c.patterns.length ? c.patterns : ALL_PATTERNS;
    const span = Math.max(1, Math.round(c.bars)) * 4;
    const shift = seedShift();
    const slot = Math.floor(sim.beat / span);
    const kind =
      list[((slot % list.length) + list.length) % list.length] ?? "diagonal";
    const rand = lcg((c.seed | 0) * 31 + slot);
    const { cols, rows, delay } = g;
    const cx = (cols - 1) / 2 + (rand() - 0.5) * cols * 0.3;
    const cy = (rows - 1) / 2 + (rand() - 0.5) * rows * 0.3;
    const flip = rand() < 0.5;
    const turn = rand() < 0.5 ? 1 : -1;
    let far = 0;
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        far = Math.max(far, Math.hypot(i - cx, j - cy));
      }
    }
    far = Math.max(1, far);
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = j * cols + i;
        const r = Math.hypot(i - cx, j - cy) / far;
        let d = 0;
        if (kind === "diagonal") {
          const ii = flip ? cols - 1 - i : i;
          d = ((ii + j) / Math.max(1, cols + rows - 2)) * 3;
        } else if (kind === "ripple") {
          d = r * 2.5;
        } else if (kind === "checker") {
          // The odd squares answer the even ones a beat later.
          d = (i + j) & 1;
        } else {
          const a = Math.atan2(j - cy, i - cx) * turn;
          d = ((a / (Math.PI * 2) + 0.5) * 0.8 + r * 0.45) * PERIOD.spiral;
        }
        delay[k] = d;
      }
    }
    sim.slot = slot;
    sim.kind = kind;
    sim.period = PERIOD[kind];
    sim.colourShift = shift;
    // At a bar line, a front that should have left a tile since the line
    // strikes it on the next step, so the first wave is whole even though the
    // switch is noticed a frame late.
    const from = atBarLine || sim.beat === 0 ? slot * span : sim.beat;
    for (let k = 0; k < g.n; k += 1) {
      g.wave[k] = Math.floor((from - (delay[k] ?? 0)) / sim.period - 1e-9);
    }
    if (reported !== kind) {
      reported = kind;
      c.onPatternChange?.(kind);
    }
  };

  const colourOf = (wave: number, k: number) => {
    const g = grid;
    let index = wave + sim.colourShift;
    if (sim.kind === "checker" && g) {
      const i = k % g.cols;
      const j = Math.floor(k / g.cols);
      index += (i + j) & 1;
    }
    return ((index % paletteSize) + paletteSize) % paletteSize;
  };

  const strike = (
    k: number,
    strength: number,
    colour: number,
    quick = false,
  ) => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const at = 9 + colour * 3;
    const r = colours[at] ?? 0;
    const gg = colours[at + 1] ?? 0;
    const b = colours[at + 2] ?? 0;
    // A dark tile takes the colour at once; a lit one eases into it.
    if ((g.level[k] ?? 0) < 0.06 && (g.hold[k] ?? 0) < 0.06) {
      g.rgb[k * 3] = r;
      g.rgb[k * 3 + 1] = gg;
      g.rgb[k * 3 + 2] = b;
    }
    g.target[k * 3] = r;
    g.target[k * 3 + 1] = gg;
    g.target[k * 3 + 2] = b;
    // A ripple's strike fades fast, so it reads as a ring travelling
    // outward rather than a flood; a beat lands over the beat's own decay.
    if (strength >= (g.level[k] ?? 0)) g.quick[k] = quick ? 1 : 0;
    g.level[k] = Math.max(g.level[k] ?? 0, strength);
    g.after[k] = Math.max(g.after[k] ?? 0, strength);
    if (c.motionSafe) {
      g.swellV[k] = (g.swellV[k] ?? 0) + POP_KICK * c.pop * strength;
    }
  };

  /** Reduced motion: the first pattern frozen mid-wave, a still chord. */
  const still = () => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return;
    const saved = sim.beat;
    sim.beat = 0;
    sim.slot = -1;
    lay();
    sim.beat = saved;
    const at = 1.4;
    for (let k = 0; k < g.n; k += 1) {
      const d = g.delay[k] ?? 0;
      const wave = Math.floor((at - d) / sim.period);
      const age = at - (wave * sim.period + d);
      const accent = (wave * sim.period) % 4 === 0 ? 1 : 0.72;
      const colour = colourOf(wave, k);
      const ci = 9 + colour * 3;
      for (let ch = 0; ch < 3; ch += 1) {
        g.rgb[k * 3 + ch] = colours[ci + ch] ?? 0;
        g.target[k * 3 + ch] = colours[ci + ch] ?? 0;
      }
      g.hold[k] = 0.9 * accent * Math.exp(-age * 1.1);
      g.after[k] = 1;
      g.level[k] = 0;
      g.swell[k] = 0;
      g.swellV[k] = 0;
    }
  };

  const layout = (): boolean => {
    const c = cfg;
    if (!c) return false;
    const w = root.clientWidth;
    const h = root.clientHeight;
    if (w < 1 || h < 1) return false;
    const pitch = clamp(Math.round(c.tile), 12, 64);
    // One tile sits dead centre, so the cut at every edge is even.
    const kx = Math.ceil((w / 2 - pitch / 2) / pitch);
    const ky = Math.ceil((h / 2 - pitch / 2) / pitch);
    const ox = w / 2 - pitch / 2 - kx * pitch;
    const oy = h / 2 - pitch / 2 - ky * pitch;
    const cols = Math.ceil((w - ox) / pitch);
    const rows = Math.ceil((h - oy) / pitch);
    if (
      grid &&
      grid.cols === cols &&
      grid.rows === rows &&
      grid.pitch === pitch
    ) {
      grid.w = w;
      grid.h = h;
      grid.ox = ox;
      grid.oy = oy;
      return true;
    }
    const n = cols * rows;
    grid = {
      w,
      h,
      pitch,
      cols,
      rows,
      n,
      ox,
      oy,
      level: new Float32Array(n),
      quick: new Uint8Array(n),
      hold: new Float32Array(n),
      after: new Float32Array(n),
      rgb: new Float32Array(n * 3),
      target: new Float32Array(n * 3),
      swell: new Float32Array(n),
      swellV: new Float32Array(n),
      hover: new Float32Array(n),
      delay: new Float32Array(n),
      wave: new Int32Array(n),
      data: new Uint8Array(n * 8),
    };
    for (const r of ripples) r.on = false;
    sim.slot = -1;
    lay();
    if (!c.motionSafe) still();
    return true;
  };

  /** Uniforms that change only with the layout, the look or the theme. */
  const statics = () => {
    const g = grid;
    const c = cfg;
    const p = gpu;
    if (!g || !c || !p || p.lost) return;
    const { gl, program } = p;
    const u = program.uniforms;
    const gap = clamp(c.gap, 0, g.pitch * 0.3);
    const rest = (g.pitch - gap) / 2;
    program.use();
    gl.uniform2f(u.u_size ?? null, g.w, g.h);
    gl.uniform1f(u.u_scale ?? null, canvas.width / Math.max(1, g.w));
    gl.uniform2f(u.u_origin ?? null, g.ox, g.oy);
    gl.uniform1f(u.u_pitch ?? null, g.pitch);
    gl.uniform1f(u.u_rest ?? null, rest);
    gl.uniform1f(u.u_round ?? null, clamp(c.radius, 0, rest));
    gl.uniform1f(u.u_swell ?? null, Math.max(gap * 0.45, g.pitch * 0.05));
    gl.uniform2i(u.u_grid ?? null, g.cols, g.rows);
    gl.uniform3f(
      u.u_ground ?? null,
      colours[0] ?? 0,
      colours[1] ?? 0,
      colours[2] ?? 0,
    );
    gl.uniform3f(
      u.u_base ?? null,
      colours[3] ?? 0,
      colours[4] ?? 0,
      colours[5] ?? 0,
    );
    gl.uniform3f(
      u.u_hi ?? null,
      colours[6] ?? 1,
      colours[7] ?? 1,
      colours[8] ?? 1,
    );
    gl.uniform1f(u.u_glow ?? null, clamp(c.glow, 0, 1));
    gl.uniform1i(u.u_data ?? null, 0);
  };

  const sizeCanvas = () => {
    const p = gpu;
    const c = cfg;
    if (!p || p.lost || !c) return;
    resizeGL(p.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
  };

  const draw = () => {
    const g = grid;
    const p = gpu;
    if (!g || !p || p.lost || !visible.current) return;
    const { gl } = p;
    const data = g.data;
    for (let j = 0; j < g.rows; j += 1) {
      for (let i = 0; i < g.cols; i += 1) {
        const k = j * g.cols + i;
        const o = (j * g.cols * 2 + i * 2) * 4;
        const lit = Math.max(g.level[k] ?? 0, g.hold[k] ?? 0);
        data[o] = Math.round((g.rgb[k * 3] ?? 0) * 255);
        data[o + 1] = Math.round((g.rgb[k * 3 + 1] ?? 0) * 255);
        data[o + 2] = Math.round((g.rgb[k * 3 + 2] ?? 0) * 255);
        data[o + 3] = Math.round(clamp(lit, 0, 1) * 255);
        data[o + 4] = Math.round(clamp(128 + (g.swell[k] ?? 0) * 100, 0, 255));
        data[o + 5] = Math.round(clamp(g.hover[k] ?? 0, 0, 1) * 255);
        data[o + 6] = Math.round(clamp(g.after[k] ?? 0, 0, 1) * 255);
        data[o + 7] = 0;
      }
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, p.texture);
    const tw = g.cols * 2;
    if (p.texW !== tw || p.texH !== g.rows) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        tw,
        g.rows,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
      p.texW = tw;
      p.texH = g.rows;
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        tw,
        g.rows,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data,
      );
    }
    p.program.use();
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** One frame of the beat, the ripples and every tile's light. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const g = grid;
    const c = cfg;
    if (!g || !c) return false;
    const playing = c.motionSafe && !c.paused;
    if (playing) {
      sim.beat += (dt * clamp(c.tempo, 30, 200)) / 60;
      const span = Math.max(1, Math.round(c.bars)) * 4;
      if (Math.floor(sim.beat / span) !== sim.slot) lay(true);
      for (let k = 0; k < g.n; k += 1) {
        const wave = Math.floor((sim.beat - (g.delay[k] ?? 0)) / sim.period);
        if (wave > (g.wave[k] ?? 0)) {
          g.wave[k] = wave;
          // Downbeats land at full strength; the other beats answer softer.
          const accent = (wave * sim.period) % 4 === 0 ? 1 : 0.72;
          strike(k, accent, colourOf(wave, k));
        }
      }
    }

    let moving = playing;
    for (const rp of ripples) {
      if (!rp.on) continue;
      moving = true;
      const from = rp.radius;
      const to = c.motionSafe ? from + RIPPLE_SPEED * dt : rp.reach + 1;
      rp.radius = to;
      for (let j = 0; j < g.rows; j += 1) {
        for (let i = 0; i < g.cols; i += 1) {
          const d = Math.hypot(i - rp.x, j - rp.y);
          if (d < from || d >= to || d > rp.reach) continue;
          strike(
            j * g.cols + i,
            rp.strength * (1 - (0.6 * d) / Math.max(1, rp.reach)),
            rp.colour,
            c.motionSafe,
          );
        }
      }
      if (from > rp.reach) rp.on = false;
    }

    const tau = Math.max(0.05, c.decay / 1000 / 2.3);
    const fade = Math.exp(-dt / tau);
    const fadeQuick = Math.exp(-dt / (tau * 0.4));
    const linger = Math.exp(-dt / 2.2);
    const ease = 1 - Math.exp(-dt / 0.12);
    const lift = c.motionSafe ? 1 - Math.exp(-dt / 0.07) : 1;
    const hx = (hand.x - g.ox) / g.pitch - 0.5;
    const hy = (hand.y - g.oy) / g.pitch - 0.5;
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    const { stiffness, damping, mass } = RECOIL;
    for (let j = 0; j < g.rows; j += 1) {
      for (let i = 0; i < g.cols; i += 1) {
        const k = j * g.cols + i;
        let level = (g.level[k] ?? 0) * (g.quick[k] ? fadeQuick : fade);
        if (level < 0.003) level = 0;
        g.level[k] = level;
        let after = (g.after[k] ?? 0) * (c.motionSafe ? linger : 1);
        if (after < 0.01) after = 0;
        g.after[k] = after;
        if (level > 0 || (after > 0 && c.motionSafe)) moving = true;
        for (let ch = 0; ch < 3; ch += 1) {
          const at = k * 3 + ch;
          const now = g.rgb[at] ?? 0;
          const to = g.target[at] ?? 0;
          const next = now + (to - now) * ease;
          g.rgb[at] = Math.abs(to - next) < 0.002 ? to : next;
          if (next !== to && level > 0) moving = true;
        }
        let x = g.swell[k] ?? 0;
        let v = g.swellV[k] ?? 0;
        if (x !== 0 || v !== 0) {
          for (let s = 0; s < steps; s += 1) {
            v += ((-stiffness * x - damping * v) / mass) * h;
            x += v * h;
          }
          if (Math.abs(x) < 0.002 && Math.abs(v) < 0.02) {
            x = 0;
            v = 0;
          } else moving = true;
          g.swell[k] = x;
          g.swellV[k] = v;
        }
        const dx = i - hx;
        const dy = j - hy;
        const d2 = dx * dx + dy * dy;
        const want = hand.present && d2 < 4 ? Math.exp(-d2 / 0.6) : 0;
        const was = g.hover[k] ?? 0;
        let next = was + (want - was) * lift;
        if (Math.abs(want - next) < 0.004) next = want;
        if (next !== was) moving = true;
        g.hover[k] = next;
      }
    }
    return moving;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !visible.current || document.hidden || !gpu || gpu.lost) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const moving = step(dt);
    draw();
    if (moving) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    if (!gpu || gpu.lost || !grid) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    const count = Math.min(kids.length, 9);
    for (let i = 0; i < count; i += 1) {
      const el = kids[i];
      if (el) read(getComputedStyle(el).color, colours, i * 3);
    }
    paletteSize = Math.max(1, count - 3);
    statics();
  };

  const resize = () => {
    if (!cfg || !gpu || gpu.lost) return;
    if (!layout()) return;
    sizeCanvas();
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

  const engine: Engine = {
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
      const relay =
        was.tile !== next.tile ||
        was.gap !== next.gap ||
        was.radius !== next.radius;
      if (relay || was.dpr !== next.dpr) {
        if (relay) grid = null;
        resize();
      }
      if (was.paletteKey !== next.paletteKey) readColours();
      if (
        was.seed !== next.seed ||
        was.bars !== next.bars ||
        was.patterns.join() !== next.patterns.join()
      ) {
        sim.slot = -1;
        lay();
        if (!next.motionSafe) still();
      }
      if (was.motionSafe !== next.motionSafe) {
        if (next.motionSafe) {
          // The beat picks up from now, not from the bar line it missed.
          grid?.hold.fill(0);
          sim.slot = -1;
          lay();
        } else still();
      }
      if (!next.interactive) {
        hand.present = false;
        hand.source = null;
      }
      statics();
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      if (cfg && !cfg.motionSafe) still();
      draw();
      kick();
    },
    wake() {
      draw();
      kick();
    },
    handTo(x, y, source) {
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      kick();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      kick();
    },
    ripple(x, y, strength) {
      const g = grid;
      const c = cfg;
      if (!g || !c) return;
      // A free slot, or else the oldest ripple gives way.
      let pick = ripples[0];
      for (const r of ripples) {
        if (!r.on) {
          pick = r;
          break;
        }
        if (pick && r.radius > pick.radius) pick = r;
      }
      if (!pick) return;
      pick.on = true;
      pick.x = (x - g.ox) / g.pitch - 0.5;
      pick.y = (y - g.oy) / g.pitch - 0.5;
      pick.radius = -0.0001;
      pick.reach = 2 + 9 * clamp(c.strength, 0, 1);
      pick.strength = clamp(0.55 + 0.45 * c.strength, 0, 1) * strength;
      sim.nextRipple += 1;
      pick.colour =
        (((sim.nextRipple + sim.colourShift + 1) % paletteSize) + paletteSize) %
        paletteSize;
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };
  return engine;
}

/**
 * A background that keeps time: a grid of flat rounded tiles, with the
 * content on top in its own layer, lit by a beat. Four beats to a bar at
 * `tempo`, and on the beats the grid plays a pattern — a diagonal wave, rings
 * from a point, a checkerboard answering itself, a curled spiral arm — each
 * wave carrying the next colour of the palette. A struck tile flares, eases
 * its colour from whatever it was showing into the wave's, swells inside its
 * gap on the recoil spring so the grid visibly taps in time, blooms into the
 * gaps around it and fades over `decay`, leaving a faint residue of its last
 * colour. Every few bars the next pattern takes over.
 *
 * A hovering pointer lifts the tile under it; a press sends a ripple of the
 * next colour out from that tile. Keyboard focus on a control inside parks
 * the highlight there and sends a softer ripple from it. Drawn in one WebGL2
 * pass from a small per-tile texture; the beat runs only on screen in a
 * visible page. Under reduced motion the grid holds a still chord of colour
 * and a press lights the tiles in reach at once and lets them fade.
 */
export function PulseTiles({
  children,
  tile = 28,
  gap = 3,
  radius = 5,
  tempo = 96,
  palette = "cobalt",
  patterns = ALL_PATTERNS,
  bars = 4,
  decay = 900,
  glow = 0.6,
  pop = 0.5,
  interactive = true,
  pointerStrength = 0.7,
  paused = false,
  seed = 1,
  dpr = 2,
  onPatternChange,
  className,
}: PulseTilesProps) {
  const motionSafe = useMotionSafe();
  const paints = React.useMemo(() => {
    const list =
      typeof palette === "string"
        ? (PALETTES[palette] ?? PALETTES.cobalt)
        : palette.length >= 2
          ? palette.slice(0, 6)
          : PALETTES.cobalt;
    return list;
  }, [palette]);
  const paletteKey = paints.join("|");
  const pitch = clamp(Math.round(tile), 12, 64);
  const gapPx = clamp(gap, 0, pitch * 0.3);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef(onPatternChange);

  const config: Config = {
    tile: pitch,
    gap: gapPx,
    radius,
    tempo,
    paletteKey,
    patterns,
    bars,
    decay,
    glow,
    pop,
    interactive,
    strength: pointerStrength,
    paused,
    seed,
    dpr,
    motionSafe,
    onPatternChange: (p) => report.current?.(p),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = onPatternChange;
    latest.current = config;
    engine.current?.configure(config);
  });

  // The GPU side, bound to the canvas: built once, rebuilt after a lost
  // context, torn down with the component. StrictMode's second run builds
  // again on the same canvas, which hands back the same context.
  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const carriers = carriersRef.current;
    if (!root || !canvas || !carriers) return;
    const e = createEngine(root, canvas, carriers, visible);
    engine.current = e;
    e.configure(latest.current);
    return () => {
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

  // Size and sighting, bound to the node when it arrives.
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
    // A press on a control is the control's; only the tiles ripple.
    if (!hit || !rootRef.current?.contains(hit)) {
      engine.current?.ripple(at.x, at.y, 1);
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
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
    engine.current?.ripple(at.x, at.y, FOCUS_RIPPLE);
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
        "group/pulse-tiles relative isolate h-full w-full touch-manipulation overflow-clip",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/pulse-tiles:opacity-0"
        style={standIn(paints, pitch, gapPx)}
      />
      <span
        ref={carriersRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {[GROUND, REST, HIGHLIGHT, ...paints].map((paint, i) => (
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
 * browser without WebGL2: the resting grid in CSS, one tile centred like the
 * canvas's, with a soft diagonal sweep of the palette across it.
 */
function standIn(
  paints: readonly string[],
  pitch: number,
  gap: number,
): React.CSSProperties {
  const half = Math.round(gap * 50) / 100;
  const far = pitch - half;
  const tint = (i: number, share: number) =>
    `color-mix(in oklab, ${paints[i % paints.length] ?? REST} ${share}%, ${REST})`;
  const lines = (deg: number) =>
    `linear-gradient(${deg}deg, ${GROUND} ${half}px, transparent ${half}px, transparent ${far}px, ${GROUND} ${far}px)`;
  return {
    backgroundColor: REST,
    backgroundImage: [
      lines(90),
      lines(180),
      `linear-gradient(120deg, ${REST} 8%, ${tint(0, 55)} 30%, ${tint(1, 40)} 46%, ${REST} 64%, ${tint(2, 30)} 84%, ${REST} 100%)`,
    ].join(", "),
    backgroundSize: `${pitch}px ${pitch}px, ${pitch}px ${pitch}px, 100% 100%`,
    backgroundPosition: "center, center, 0 0",
  };
}
