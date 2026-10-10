"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  createFullscreenTriangle,
  createGL,
  createProgram,
  FULLSCREEN_VERTEX,
  GLSL_NOISE,
  onContextLoss,
  resizeGL,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type BendGridPalette = "gallery" | "accent" | "garden" | "mono";

export type BendGridProps = {
  /** The content on top of the wall: a hero line, a heading, a call to action. */
  children?: React.ReactNode;
  /** How many tiles across, 3 to 10; rows fill the height. @default 6 */
  grid?: number;
  /** How deep the lens presses into the wall, 0 (barely) to 1 (deep). @default 0.6 */
  strength?: number;
  /** How far the lens reaches round the hand, px. @default 170 */
  radius?: number;
  /** Pictures for the tiles (URLs, cropped to fill). Without them the wall hangs its own seeded prints. */
  images?: readonly string[];
  /** The prints' five pigments: a named set, or five CSS colours of your own (paper first, ink last). @default "gallery" */
  palette?: BendGridPalette | readonly string[];
  /** The gutter between tiles, px. @default 8 */
  gap?: number;
  /** Each tile's corner radius, px. @default 6 */
  corner?: number;
  /** A thin coloured fringe where the wall bends, 0 (none) to 1. @default 0.5 */
  chroma?: number;
  /** How fast the wall pans by on its slow diagonal, 0 (still) to 1. @default 0.3 */
  drift?: number;
  /** The wall itself, seen in the gutters. @default "var(--background)" */
  wall?: string;
  /** The pointer and keyboard focus press the lens into the wall. @default true */
  interactive?: boolean;
  /** Hold the wall still; the lens still presses. @default false */
  paused?: boolean;
  /** Seeds the prints and their order, so two walls never match. @default 1 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires when the pointer or keyboard focus starts (true) or stops (false) bending the wall. */
  onActiveChange?: (active: boolean) => void;
  /** Fires when a press sinks the lens in (true) and when it lets go (false). */
  onPressChange?: (pressed: boolean) => void;
  /** Sizes and shapes the box. @default "h-full w-full" */
  className?: string;
};

/** Prints are pigment at fixed lightness: the same prints on a light wall and a dark one. Paper first, ink last. */
const PALETTES: Record<BendGridPalette, readonly string[]> = {
  gallery: [
    "oklch(0.94 0.02 85)",
    "oklch(0.62 0.13 40)",
    "oklch(0.79 0.12 80)",
    "oklch(0.52 0.08 250)",
    "oklch(0.29 0.03 260)",
  ],
  accent: [
    "oklch(from var(--accent-bright) 0.95 calc(c * 0.12) h)",
    "oklch(from var(--accent) 0.55 c h)",
    "oklch(from var(--accent-bright) 0.76 calc(c * 0.6) h)",
    "oklch(from var(--signal) 0.78 calc(c * 0.7) h)",
    "oklch(from var(--accent) 0.28 calc(c * 0.4) h)",
  ],
  garden: [
    "oklch(0.95 0.025 110)",
    "oklch(0.6 0.11 150)",
    "oklch(0.76 0.1 12)",
    "oklch(0.83 0.12 95)",
    "oklch(0.33 0.05 160)",
  ],
  mono: [
    "oklch(0.95 0 0)",
    "oklch(0.76 0 0)",
    "oklch(0.56 0 0)",
    "oklch(0.86 0.012 85)",
    "oklch(0.26 0 0)",
  ],
};

const STEP = 1 / 120;
/** The lens follows the hand on glide; its depth is rubber, on recoil. */
const GLIDE = springs.glide;
const RECOIL = springs.recoil;
/** Atlas: four by four prints, each this many px square, inset a little so mip levels do not bleed. */
const ATLAS = 4;
const TILE = 256;
const PAD = 6;
/** Pan wraps after this many cells, where the print order repeats. */
const WRAP = 64;
/** A hover rests the lens on the wall; a press sinks it. */
const HOVER = 0.42;

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
uniform float u_px;
uniform float u_cell;
uniform float u_gap;
uniform float u_corner;
uniform vec2 u_pan;
uniform vec3 u_lens;
uniform float u_radius;
uniform vec2 u_stretch;
uniform float u_chroma;
uniform vec3 u_wall;
uniform float u_tiles;
uniform float u_seed;
uniform sampler2D u_atlas;
in vec2 v_uv;
out vec4 outColor;
${GLSL_NOISE}

const float ATLAS = ${ATLAS}.0;
const float INSET = ${PAD}.0 / ${TILE}.0;

// The lens: inside its reach, the wall is drawn from nearer the centre, so
// the tiles there swell and the grid bends round in a ring of compression.
// Stretched a little along the hand's travel, like rubber dragged.
vec2 lensMap(vec2 p, float s) {
  vec2 d = p - u_lens.xy;
  float along = length(u_stretch);
  vec2 dir = along > 0.001 ? u_stretch / along : vec2(1.0, 0.0);
  float a = dot(d, dir) / (1.0 + along);
  float b = dot(d, vec2(-dir.y, dir.x));
  float r2 = (a * a + b * b) / (u_radius * u_radius);
  float k = max(0.0, 1.0 - r2);
  return u_lens.xy + d * (1.0 - s * k * k);
}

// The wall at q (wall px): the tile's print or the gutter, with an edge.
vec3 wallAt(vec2 q, vec2 grad, float aa) {
  vec2 w = q + u_pan;
  vec2 cell = floor(w / u_cell);
  vec2 f = w - cell * u_cell;
  float inner = u_cell - u_gap;
  vec2 local = f - u_gap * 0.5;
  vec2 c = local - inner * 0.5;
  vec2 qd = abs(c) - inner * 0.5 + u_corner;
  float sdf = length(max(qd, 0.0)) + min(max(qd.x, qd.y), 0.0) - u_corner;
  float cover = clamp(0.5 - sdf / aa, 0.0, 1.0);
  vec2 id = mod(cell, ${WRAP}.0);
  float pick = floor(kx_hash(id + u_seed) * u_tiles);
  vec2 slot = vec2(mod(pick, ATLAS), floor(pick / ATLAS));
  vec2 uv = clamp(local / inner, 0.0, 1.0);
  vec2 at = (slot + INSET + uv * (1.0 - 2.0 * INSET)) / ATLAS;
  vec2 g = grad / inner * (1.0 - 2.0 * INSET) / ATLAS;
  vec3 art = textureGrad(u_atlas, at, g, g).rgb;
  // A hairline of shade just inside each tile's edge, as a print casts.
  art *= 1.0 - 0.1 * smoothstep(-aa * 3.0, 0.0, sdf);
  return mix(u_wall, art, cover);
}

void main() {
  vec2 p = v_uv * u_size;
  float s = u_lens.z;
  vec2 qg = lensMap(p, s);
  // The footprint of one pixel on the wall, taken before any branching.
  vec2 grad = vec2(length(dFdx(qg)), length(dFdy(qg)));
  float aa = max(grad.x, grad.y) + 1e-3;
  vec3 col;
  float fringe = u_chroma * 0.07;
  if (abs(s) * fringe > 0.0005) {
    // Red and blue bend a touch more and less than green.
    vec2 qr = lensMap(p, s * (1.0 + fringe));
    vec2 qb = lensMap(p, s * (1.0 - fringe));
    col = vec3(wallAt(qr, grad, aa).r, wallAt(qg, grad, aa).g, wallAt(qb, grad, aa).b);
  } else {
    col = wallAt(qg, grad, aa);
  }
  // Where the rubber stretches round the lens it falls a little into shade.
  vec2 d = p - u_lens.xy;
  float r2 = dot(d, d) / (u_radius * u_radius);
  float k = max(0.0, 1.0 - r2);
  col *= 1.0 - 0.16 * clamp(s, 0.0, 1.0) * k * (1.0 - k) * 4.0;
  outColor = vec4(col, 1.0);
}
`;

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  atlas: WebGLTexture;
  lost: boolean;
};

type Config = {
  grid: number;
  strength: number;
  radius: number;
  imagesKey: string;
  images: readonly string[];
  colorKey: string;
  gap: number;
  corner: number;
  chroma: number;
  drift: number;
  interactive: boolean;
  paused: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  onActive: (active: boolean) => void;
  onPress: (pressed: boolean) => void;
};

type Engine = {
  configure: (next: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  handTo: (x: number, y: number, source: "pointer" | "focus") => void;
  handAway: (source: "pointer" | "focus") => void;
  press: (on: boolean) => void;
  dispose: () => void;
};

/** Sixteen seeded prints, painted once into the atlas. */
function paintPrints(
  ctx: CanvasRenderingContext2D,
  inks: readonly string[],
  seed: number,
) {
  const rand = lcg(seed * 23 + 9);
  const [
    paper = "white",
    c1 = "gray",
    c2 = "gray",
    c3 = "gray",
    ink = "black",
  ] = inks;
  const hues = [c1, c2, c3];
  for (let n = 0; n < ATLAS * ATLAS; n += 1) {
    const x0 = (n % ATLAS) * TILE;
    const y0 = Math.floor(n / ATLAS) * TILE;
    const pick = () => hues[Math.floor(rand() * 3)] ?? c1;
    const a = pick();
    let b = pick();
    if (b === a) b = hues[(hues.indexOf(a) + 1) % 3] ?? c2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, TILE, TILE);
    ctx.clip();
    ctx.translate(x0 + TILE / 2, y0 + TILE / 2);
    ctx.rotate(Math.floor(rand() * 4) * (Math.PI / 2));
    ctx.translate(-TILE / 2, -TILE / 2);
    const T = TILE;
    const motif = (n + Math.floor(rand() * 8)) % 8;
    const fill = (c: string) => {
      ctx.fillStyle = c;
      ctx.fill();
    };
    if (motif === 0) {
      // A sun over banded hills.
      ctx.fillStyle = a;
      ctx.fillRect(0, 0, T, T);
      ctx.beginPath();
      ctx.arc(T * (0.35 + rand() * 0.3), T * 0.42, T * 0.18, 0, Math.PI * 2);
      fill(paper);
      const bands = [b, ink, pick()];
      for (let k = 0; k < 3; k += 1) {
        ctx.fillStyle = bands[k] ?? ink;
        ctx.fillRect(0, T * (0.62 + k * 0.13), T, T * 0.13);
      }
    } else if (motif === 1) {
      // Arches stacked from the foot.
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, T, T);
      const arcs = [a, b, ink];
      for (let k = 0; k < 3; k += 1) {
        ctx.beginPath();
        ctx.arc(T / 2, T, T * (0.46 - k * 0.13), Math.PI, 0);
        ctx.closePath();
        fill(arcs[k] ?? a);
      }
    } else if (motif === 2) {
      // Rings off centre.
      ctx.fillStyle = b;
      ctx.fillRect(0, 0, T, T);
      const cx = T * (0.25 + rand() * 0.2);
      const cy = T * (0.25 + rand() * 0.2);
      for (let k = 5; k >= 1; k -= 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, T * 0.16 * k, 0, Math.PI * 2);
        fill(k % 2 ? paper : a);
      }
    } else if (motif === 3) {
      // A split diagonal and a stone.
      ctx.fillStyle = a;
      ctx.fillRect(0, 0, T, T);
      ctx.beginPath();
      ctx.moveTo(0, T);
      ctx.lineTo(T, 0);
      ctx.lineTo(T, T);
      ctx.closePath();
      fill(b);
      ctx.beginPath();
      ctx.arc(T * 0.3, T * 0.3, T * 0.11, 0, Math.PI * 2);
      fill(ink);
    } else if (motif === 4) {
      // A field of dots, one of them inked.
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, T, T);
      const odd = Math.floor(rand() * 16);
      for (let k = 0; k < 16; k += 1) {
        ctx.beginPath();
        ctx.arc(
          T * (0.17 + (k % 4) * 0.22),
          T * (0.17 + Math.floor(k / 4) * 0.22),
          T * 0.075,
          0,
          Math.PI * 2,
        );
        fill(k === odd ? ink : k % 2 ? a : b);
      }
    } else if (motif === 5) {
      // Quarter circles, four to a print.
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, T, T);
      const q = [a, b, ink, pick()];
      for (let k = 0; k < 4; k += 1) {
        const qx = (k % 2) * (T / 2);
        const qy = Math.floor(k / 2) * (T / 2);
        ctx.beginPath();
        ctx.moveTo(qx, qy);
        ctx.arc(qx, qy, T / 2, 0, Math.PI / 2);
        ctx.closePath();
        fill(q[k] ?? a);
      }
    } else if (motif === 6) {
      // Wave lines.
      ctx.fillStyle = a;
      ctx.fillRect(0, 0, T, T);
      ctx.strokeStyle = paper;
      ctx.lineWidth = T * 0.045;
      ctx.lineCap = "round";
      for (let k = 0; k < 5; k += 1) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i += 1) {
          const x = (i / 24) * T;
          const y =
            T * (0.2 + k * 0.15) + Math.sin((i / 24) * Math.PI * 3) * T * 0.04;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    } else {
      // A half moon over a small sun.
      ctx.fillStyle = ink;
      ctx.fillRect(0, 0, T, T);
      ctx.beginPath();
      ctx.arc(T / 2, T * 0.58, T * 0.3, Math.PI, 0);
      ctx.closePath();
      fill(a);
      ctx.beginPath();
      ctx.arc(T / 2, T * 0.3, T * 0.08, 0, Math.PI * 2);
      fill(b);
    }
    ctx.restore();
  }
}

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
  let pressing = false;
  let tiles = ATLAS * ATLAS;
  /** Images in flight for the current `images` prop: dropped when it changes. */
  let loading: HTMLImageElement[] = [];
  const read = rgbReader();
  const wall = new Float32Array(3);
  const size = { w: 0, h: 0 };
  const sheet = document.createElement("canvas");
  sheet.width = ATLAS * TILE;
  sheet.height = ATLAS * TILE;
  const sim = {
    panX: 0,
    panY: 0,
    depth: 0,
    depthV: 0,
  };
  const hand = {
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    present: false,
    source: null as "pointer" | "focus" | null,
  };

  const setActive = (next: boolean) => {
    if (active === next) return;
    active = next;
    cfg?.onActive(next);
  };

  const cellOf = (c: Config) => size.w / clamp(Math.round(c.grid), 3, 10);
  const reach = (c: Config) =>
    clamp(c.radius, 24, Math.max(24, Math.min(size.w, size.h) * 0.45));

  /** How deep the lens wants to be: resting on the wall under a hover, sunk under a press. */
  const depthTarget = (c: Config) => {
    if (!c.interactive || !hand.present) return 0;
    const k = clamp(c.strength, 0, 1) * 0.55;
    return pressing ? k : k * HOVER;
  };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    const atlas = gl.createTexture();
    if (!atlas) {
      tri.dispose();
      program.dispose();
      return false;
    }
    gpu = { gl, program, tri, atlas, lost: false };
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.gl.deleteTexture(g.atlas);
    g.tri.dispose();
    g.program.dispose();
  };

  /** Uploads the atlas canvas with mipmaps, kept to a few levels so prints never bleed together. */
  const upload = () => {
    const p = gpu;
    if (!p || p.lost) return;
    const { gl } = p;
    gl.bindTexture(gl.TEXTURE_2D, p.atlas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sheet);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 3);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  };

  /** The seeded prints, or the host's pictures cropped to fill as they arrive. */
  const paintAtlas = () => {
    const c = cfg;
    const ctx = sheet.getContext("2d");
    if (!c || !ctx) return;
    const kids = carriers.children;
    const inks: string[] = [];
    for (let i = 1; i < 6; i += 1) {
      const el = kids[i];
      inks.push(el ? getComputedStyle(el).color : "gray");
    }
    ctx.clearRect(0, 0, sheet.width, sheet.height);
    paintPrints(ctx, inks, c.seed);
    tiles = ATLAS * ATLAS;
    for (const img of loading) img.onload = null;
    loading = [];
    const list = c.images.slice(0, ATLAS * ATLAS);
    if (list.length > 0) {
      tiles = list.length;
      list.forEach((src, n) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => {
          if (!loading.includes(img)) return;
          const g = sheet.getContext("2d");
          if (!g) return;
          const k = Math.max(TILE / img.naturalWidth, TILE / img.naturalHeight);
          const w = img.naturalWidth * k;
          const h = img.naturalHeight * k;
          const x0 = (n % ATLAS) * TILE;
          const y0 = Math.floor(n / ATLAS) * TILE;
          g.save();
          g.beginPath();
          g.rect(x0, y0, TILE, TILE);
          g.clip();
          g.drawImage(img, x0 + (TILE - w) / 2, y0 + (TILE - h) / 2, w, h);
          g.restore();
          upload();
          draw();
        };
        img.src = src;
        loading.push(img);
      });
    }
    upload();
  };

  const statics = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    const cell = cellOf(c);
    gl.uniform2f(u.u_size ?? null, size.w, size.h);
    gl.uniform1f(u.u_px ?? null, canvas.width / Math.max(1, size.w));
    gl.uniform1f(u.u_cell ?? null, cell);
    gl.uniform1f(u.u_gap ?? null, clamp(c.gap, 0, cell * 0.4));
    gl.uniform1f(
      u.u_corner ?? null,
      clamp(c.corner, 0, (cell - clamp(c.gap, 0, cell * 0.4)) * 0.5),
    );
    gl.uniform1f(u.u_radius ?? null, reach(c));
    gl.uniform1f(u.u_chroma ?? null, clamp(c.chroma, 0, 1));
    gl.uniform3f(u.u_wall ?? null, wall[0] ?? 0, wall[1] ?? 0, wall[2] ?? 0);
    gl.uniform1f(u.u_tiles ?? null, tiles);
    gl.uniform1f(u.u_seed ?? null, (Math.abs(Math.round(c.seed)) % 89) * 1.37);
    program.texture("u_atlas", p.atlas, 0);
  };

  const draw = () => {
    const c = cfg;
    const p = gpu;
    if (!c || !p || p.lost || !visible.current || size.w < 1) return;
    const { gl, program } = p;
    const u = program.uniforms;
    program.use();
    gl.uniform1f(u.u_tiles ?? null, tiles);
    gl.uniform2f(u.u_pan ?? null, sim.panX, sim.panY);
    gl.uniform3f(u.u_lens ?? null, hand.px, hand.py, sim.depth);
    // Rubber dragged: the lens stretches along the hand's travel.
    const speed = Math.hypot(hand.vx, hand.vy);
    const k = Math.min(0.45, speed / 2400);
    gl.uniform2f(
      u.u_stretch ?? null,
      speed > 1 ? (hand.vx / speed) * k : 0,
      speed > 1 ? (hand.vy / speed) * k : 0,
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, p.atlas);
    gl.viewport(0, 0, canvas.width, canvas.height);
    p.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** Pans the wall and moves the lens. Returns whether anything still moves. */
  const step = (dt: number): boolean => {
    const c = cfg;
    if (!c) return false;
    let moving = false;
    const drift = clamp(c.drift, 0, 1);
    if (!c.paused && drift > 0) {
      const span = cellOf(c) * WRAP;
      sim.panX = (sim.panX + dt * drift * 22) % span;
      sim.panY = (sim.panY + dt * drift * 13) % span;
      moving = true;
    }
    const want = depthTarget(c);
    const steps = Math.max(1, Math.ceil(dt / STEP));
    const h = dt / steps;
    for (let s = 0; s < steps; s += 1) {
      hand.vx +=
        ((GLIDE.stiffness * (hand.x - hand.px) - GLIDE.damping * hand.vx) /
          GLIDE.mass) *
        h;
      hand.vy +=
        ((GLIDE.stiffness * (hand.y - hand.py) - GLIDE.damping * hand.vy) /
          GLIDE.mass) *
        h;
      hand.px += hand.vx * h;
      hand.py += hand.vy * h;
      sim.depthV +=
        ((RECOIL.stiffness * (want - sim.depth) - RECOIL.damping * sim.depthV) /
          RECOIL.mass) *
        h;
      sim.depth += sim.depthV * h;
    }
    const handMoving =
      Math.abs(hand.x - hand.px) + Math.abs(hand.y - hand.py) > 0.1 ||
      Math.abs(hand.vx) + Math.abs(hand.vy) > 0.5;
    if (!handMoving) {
      hand.px = hand.x;
      hand.py = hand.y;
      hand.vx = 0;
      hand.vy = 0;
    }
    const pressingIn =
      Math.abs(want - sim.depth) > 0.0008 || Math.abs(sim.depthV) > 0.004;
    if (!pressingIn) {
      sim.depth = want;
      sim.depthV = 0;
    }
    return moving || (handMoving && Math.abs(sim.depth) > 0.0005) || pressingIn;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !visible.current || document.hidden || !c || !gpu) {
      last = 0;
      return;
    }
    // Panning alone, the wall moves slowly enough for thirty frames a
    // second; the lens gets every frame.
    const calm = !hand.present && sim.depth === 0 && sim.depthV === 0;
    if (calm && last && now - drawnAt < 31) {
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

  /** Reduced motion: the lens lands where the hand is, at its resting depth, with no spring. */
  const still = () => {
    const c = cfg;
    if (!c || c.motionSafe) return;
    hand.px = hand.x;
    hand.py = hand.y;
    hand.vx = 0;
    hand.vy = 0;
    sim.depth = depthTarget(c);
    sim.depthV = 0;
  };

  const readColours = () => {
    const el = carriers.children[0];
    if (el) read(getComputedStyle(el).color, wall, 0);
    paintAtlas();
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
    resizeGL(p.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
    statics();
    draw();
    kick();
  };

  const placeAt = (c: Config) => {
    const rand = lcg(c.seed * 3 + 17);
    sim.panX = Math.round(rand() * 400);
    sim.panY = Math.round(rand() * 400);
  };

  const startGpu = () => {
    if (!build()) return false;
    readColours();
    resize();
    return true;
  };

  const answer = () => {
    still();
    draw();
    kick();
  };

  let detach: () => void = () => {};

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (failed) return;
      if (!was || was.seed !== next.seed) placeAt(next);
      if (!gpu) {
        if (!startGpu()) {
          // No WebGL2 here: the CSS wall stays, and nothing retries.
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
        answer();
        return;
      }
      if (!was) return;
      if (was.dpr !== next.dpr) resize();
      if (
        was.colorKey !== next.colorKey ||
        was.imagesKey !== next.imagesKey ||
        was.seed !== next.seed
      )
        readColours();
      else statics();
      if (!next.interactive) {
        if (hand.present) {
          hand.present = false;
          hand.source = null;
          setActive(false);
        }
        if (pressing) {
          pressing = false;
          next.onPress(false);
        }
      }
      answer();
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
      if (!hand.present || Math.abs(sim.depth) < 0.002) {
        hand.px = x;
        hand.py = y;
        hand.vx = 0;
        hand.vy = 0;
      }
      hand.x = x;
      hand.y = y;
      hand.present = true;
      hand.source = source;
      setActive(true);
      answer();
    },
    handAway(source) {
      if (hand.source !== source) return;
      hand.present = false;
      hand.source = null;
      setActive(false);
      answer();
    },
    press(on) {
      if (pressing === on) return;
      pressing = on;
      cfg?.onPress(on);
      answer();
    },
    dispose() {
      disposed = true;
      for (const img of loading) img.onload = null;
      loading = [];
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
    },
  };
}

/**
 * A background of square prints hung on a wall in a grid, with the content on
 * top in its own layer, that bends under the hand as if a lens were pressed
 * into rubber. One WebGL2 pass draws every pixel through the lens: inside its
 * reach the wall is drawn from nearer the centre, so the tiles under the hand
 * swell and the gutters bend round them, with a thin coloured fringe where
 * the bend is steepest. The prints are sixteen seeded compositions painted
 * once into an atlas in five pigments, or your own pictures; the wall pans
 * slowly on a diagonal.
 *
 * The lens follows the hand on glide and rests on the wall under a hover; a
 * press sinks it, its depth on the recoil spring, so it overshoots once on
 * the way in and, when the hand lifts or leaves, springs back flat through
 * two small bounces like rubber. Keyboard focus on a control inside presses
 * the lens gently behind it. Thirty frames a second while it only pans; only
 * on screen in a visible page. Without WebGL2 a CSS wall stands in, and under
 * reduced motion the wall is still and the lens lands where the hand is with
 * no spring.
 */
export function BendGrid({
  children,
  grid = 6,
  strength = 0.6,
  radius = 170,
  images,
  palette = "gallery",
  gap = 8,
  corner = 6,
  chroma = 0.5,
  drift = 0.3,
  wall = "var(--background)",
  interactive = true,
  paused = false,
  seed = 1,
  dpr = 2,
  onActiveChange,
  onPressChange,
  className,
}: BendGridProps) {
  const motionSafe = useMotionSafe();
  const inks = React.useMemo(
    () =>
      typeof palette === "string"
        ? (PALETTES[palette as BendGridPalette] ?? PALETTES.gallery)
        : palette.length >= 5
          ? palette.slice(0, 5)
          : PALETTES.gallery,
    [palette],
  );
  const paints = React.useMemo(() => [wall, ...inks], [wall, inks]);
  const colorKey = paints.join("|");
  const imageList = React.useMemo(() => images ?? [], [images]);
  const imagesKey = imageList.join("\n");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(true);
  const report = React.useRef({ onActiveChange, onPressChange });
  /** Stops listening for the end of the current press, and lets go. */
  const unlisten = React.useRef<(() => void) | null>(null);
  /** The keyboard's one-beat press. */
  const beat = React.useRef(0);

  const config: Config = {
    grid,
    strength,
    radius,
    imagesKey,
    images: imageList,
    colorKey,
    gap,
    corner,
    chroma,
    drift,
    interactive,
    paused,
    seed,
    dpr,
    motionSafe,
    onActive: (a) => report.current.onActiveChange?.(a),
    onPress: (p) => report.current.onPressChange?.(p),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
    report.current = { onActiveChange, onPressChange };
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
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
    };
  }, []);

  React.useEffect(() => {
    const listening = unlisten;
    const timer = beat;
    return () => {
      listening.current?.();
      window.clearTimeout(timer.current);
    };
  }, []);

  React.useEffect(() => {
    const onVisibility = () => {
      // A hidden page never hears the release: let go now.
      if (document.hidden) unlisten.current?.();
      else engine.current?.wake();
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
    // A press on a control is the control's; the lens only follows.
    if (hit && rootRef.current?.contains(hit)) return;
    window.clearTimeout(beat.current);
    // A second finger takes over from the first.
    unlisten.current?.();
    engine.current?.press(true);
    const id = event.pointerId;
    const touch = event.pointerType === "touch";
    const done = (e: PointerEvent) => {
      if (e.pointerId === id) unlisten.current?.();
    };
    window.addEventListener("pointerup", done);
    window.addEventListener("pointercancel", done);
    unlisten.current = () => {
      window.removeEventListener("pointerup", done);
      window.removeEventListener("pointercancel", done);
      unlisten.current = null;
      engine.current?.press(false);
      // A finger that lifts takes the lens with it; a mouse rests on.
      if (touch) engine.current?.handAway("pointer");
    };
  };

  const onPointerLeave = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") engine.current?.handAway("pointer");
  };

  // Keyboard focus on a control inside presses the lens gently behind it.
  const onFocus = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!interactive) return;
    const el = event.target;
    if (!(el instanceof Element) || !el.matches(":focus-visible")) return;
    const r = el.getBoundingClientRect();
    const at = local(r.left + r.width / 2, r.top + r.height / 2);
    engine.current?.handTo(at.x, at.y, "focus");
    // One beat pressed in, then the rubber lets go: the same end state a
    // press and release reach.
    if (unlisten.current) return;
    window.clearTimeout(beat.current);
    engine.current?.press(true);
    beat.current = window.setTimeout(() => engine.current?.press(false), 450);
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
      onPointerLeave={onPointerLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        // A sideways finger moves the lens; an upright swipe scrolls the page.
        "group/bend-grid relative isolate h-full w-full touch-pan-y overflow-clip [-webkit-touch-callout:none]",
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
        className="pointer-events-none absolute inset-0 transition-opacity duration-400 group-data-live/bend-grid:opacity-0"
        style={standIn(paints, gap)}
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
 * browser without WebGL2: a wall of tiles in two of the palette's pigments,
 * with the gutters in the wall's colour.
 */
function standIn(paints: readonly string[], gap: number): React.CSSProperties {
  const [wallColour, , a, b] = paints;
  const g = Math.round(clamp(gap, 0, 24));
  return {
    backgroundColor: wallColour,
    backgroundImage: [
      `linear-gradient(90deg, ${wallColour} 0 ${g}px, transparent ${g}px)`,
      `linear-gradient(180deg, ${wallColour} 0 ${g}px, transparent ${g}px)`,
      `conic-gradient(${a} 0 25%, ${b} 0 50%, ${a} 0 75%, ${b} 0)`,
    ].join(", "),
    backgroundSize: "112px 112px, 112px 112px, 224px 224px",
  };
}
