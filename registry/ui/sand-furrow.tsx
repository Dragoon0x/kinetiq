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
  uploadTexture,
  type FullscreenTriangle,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { useDrag } from "@/registry/lib/tactile-gesture";
import { panFrom, useTactileSound } from "@/registry/lib/tactile-sound";
import { cn } from "@/registry/lib/utils";

export type SandFurrowProps = {
  /** The buried picture (same origin or CORS-enabled). Defaults to a drawn tile mosaic. */
  src?: string;
  /** Describes the picture. @default "A tile mosaic of a fish among waves" */
  alt?: string;
  /** Size of a grain of sand, 0.5 (silt) to 3 px (coarse). @default 1.5 */
  grainSize?: number;
  /** How quickly the banks slump back over the furrow, 0 (never) to 1. @default 0.45 */
  settle?: number;
  /** Width of the plough, 8 to 40 px. @default 24 */
  plough?: number;
  /** How much sand one pass moves, 0 to 1; 1 cuts down to the picture. @default 0.9 */
  depth?: number;
  /** The direction the light comes from, in degrees (0 is from the right, 90 from above). @default 135 */
  light?: number;
  /** The sand's colour. A pigment: the same in both themes. */
  sandColor?: string;
  /** Controlled: the sand swept clear. */
  cleared?: boolean;
  /** Initial state when uncontrolled. @default false */
  defaultCleared?: boolean;
  /** Fires from the double-click or key that swept the sand clear or poured it back. */
  onClearedChange?: (cleared: boolean) => void;
  /** Fires after each stroke, and again once the banks have settled, with the share of the picture uncovered, 0 to 1. */
  onPlough?: (uncovered: number) => void;
  /** A swish as the plough moves and as the sand is swept. @default false */
  sound?: boolean;
  /** Drag, double-click and the keys plough and sweep. @default true */
  interactive?: boolean;
  /** Seeds the dunes and the grain. @default 5 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** The tray's accessible name; the picture and how much shows are added. @default "Sand over a picture" */
  label?: string;
  /** Ploughs one furrow by itself the first time the tray is seen, so the picture shows before anyone drags (not under reduced motion). @default true */
  intro?: boolean;
  /** Sizes the tray. @default "h-56 w-full" */
  className?: string;
};

/* --------------------------------- maths --------------------------------- */

/** Simulation cell, CSS px. */
const CELL = 3;
/** Height below which the picture shows through (the sand's resting height is about 1). */
const BARE = 0.3;
const TALUS = 0.45;

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const hash2 = (x: number, y: number, seed: number) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ seed;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Seeded value noise in CSS px, so the dunes stay put when the tray resizes. */
const dune = (x: number, y: number, seed: number) => {
  const f = (s: number, px: number, py: number) => {
    const gx = px / s;
    const gy = py / s;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);
    const u = smooth(0, 1, gx - ix);
    const v = smooth(0, 1, gy - iy);
    const a = hash2(ix, iy, seed);
    const b = hash2(ix + 1, iy, seed);
    const c = hash2(ix, iy + 1, seed);
    const d = hash2(ix + 1, iy + 1, seed);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  return 0.65 * f(90, x + y * 0.4, y) + 0.35 * f(36, x, y + x * 0.2) - 0.5;
};

/* ----------------------------------- art --------------------------------- */

/**
 * The default picture: a floor of square tesserae — a key-pattern border,
 * banded waves, and a fish swimming across the middle — drawn once into a 2D
 * canvas for the GPU. Literal pigments: it is a mosaic, not interface.
 */
function drawMosaic(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const mortar = "oklch(0.83 0.03 80)";
  const sea = [
    "oklch(0.42 0.09 235)",
    "oklch(0.55 0.1 220)",
    "oklch(0.7 0.07 205)",
  ];
  const terra = "oklch(0.55 0.13 40)";
  const cream = "oklch(0.93 0.03 85)";
  const gold = "oklch(0.78 0.14 70)";
  const ink = "oklch(0.25 0.03 260)";
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, w, h);
  const t = clamp(Math.round(Math.min(w, h) / 22), 5, 16);
  const g = Math.max(1, Math.round(t * 0.12));
  const cols = Math.ceil(w / t);
  const rows = Math.ceil(h / t);
  const fish = (u: number, v: number, cx: number, cy: number, s: number) => {
    const x = (u - cx) / s;
    const y = (v - cy) / (s * 0.46);
    const body = x * x + y * y < 1;
    const tail = x > 0.82 && x < 1.55 && Math.abs(y) < (x - 0.82) * 1.5;
    const eye = Math.hypot(x + 0.58, y + 0.2) < 0.13;
    const fin = Math.abs(x + 0.05) < 0.32 && y < -0.75 && y > -1.45;
    if (eye) return 4;
    if (tail || fin) return 3;
    if (body) return x < -0.45 ? 2 : 1;
    return 0;
  };
  const aspect = w / h;
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const u = ((i + 0.5) / cols) * aspect;
      const v = (j + 0.5) / rows;
      const edge = Math.min(i, j, cols - 1 - i, rows - 1 - j);
      let fill: string;
      if (edge === 0) fill = terra;
      else if (edge === 1) fill = (i + j) % 4 < 2 ? cream : terra;
      else if (edge === 2) fill = cream;
      else {
        const f = Math.max(
          fish(u, v, 0.5 * aspect, 0.54, 0.36),
          fish(u, v, 0.2 * aspect, 0.3, 0.1),
          fish(u, v, 0.84 * aspect, 0.74, 0.08),
        );
        if (f === 4) fill = ink;
        else if (f === 3) fill = terra;
        else if (f === 2) fill = "oklch(0.64 0.16 45)";
        else if (f === 1) fill = (i + j) % 2 ? gold : "oklch(0.72 0.15 60)";
        else {
          const band = Math.floor(
            (v * 8 + Math.sin(u * 9 + v * 3) * 0.7 + 9) % 3,
          );
          fill = sea[band] ?? sea[0] ?? mortar;
        }
      }
      const jx = (hash2(i, j, 11) - 0.5) * g;
      const jy = (hash2(i, j, 23) - 0.5) * g;
      ctx.fillStyle = fill;
      ctx.fillRect(i * t + g / 2 + jx, j * t + g / 2 + jy, t - g, t - g);
    }
  }
}

/* --------------------------------- shaders ------------------------------- */

const FRAGMENT = `
uniform sampler2D u_height;
uniform sampler2D u_pic;
uniform vec2 u_grid;
uniform vec2 u_res;
uniform float u_cell;
uniform float u_grain;
uniform vec2 u_light;
uniform vec3 u_sand;
uniform float u_seed;
uniform float u_fade;
uniform float u_clear;
in vec2 v_uv;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453); }

// Height at a cell coordinate: smoothed bilinear between texels, mixed toward
// the resting sand by u_fade (the reduced-motion resettle).
float H(vec2 g) {
  vec2 c = clamp(g, vec2(0.0), u_grid - 1.0);
  vec2 i = floor(c);
  vec2 f = c - i;
  ivec2 p = ivec2(i);
  ivec2 m = ivec2(u_grid) - 1;
  vec2 a = texelFetch(u_height, p, 0).rg;
  vec2 b = texelFetch(u_height, min(p + ivec2(1, 0), m), 0).rg;
  vec2 d = texelFetch(u_height, min(p + ivec2(0, 1), m), 0).rg;
  vec2 e = texelFetch(u_height, min(p + ivec2(1, 1), m), 0).rg;
  vec2 v = mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
  return mix(v.x, v.y, u_fade);
}

void main() {
  vec2 px = v_uv * u_res;
  vec2 g = px / u_cell - 0.5;
  float h = H(g);
  float hx = (H(g + vec2(1.0, 0.0)) - H(g - vec2(1.0, 0.0))) * 0.5;
  float hy = (H(g + vec2(0.0, 1.0)) - H(g - vec2(0.0, 1.0))) * 0.5;
  vec2 gp = floor(px / max(1.0, u_grain));
  float n1 = hash(gp);
  float n2 = hash(gp + 17.31);
  vec3 nrm = normalize(vec3(-hx * 1.8 + (n1 - 0.5) * 0.3, -hy * 1.8 + (n2 - 0.5) * 0.3, 1.0));
  vec3 L = normalize(vec3(u_light, 0.9));
  float lam = clamp(dot(nrm, L), 0.0, 1.0);
  // Banks between the cell and the light cast short shadows into the furrow.
  float shade = 1.0;
  for (int k = 1; k <= 3; k++) {
    float t = float(k) * 1.3;
    float hs = H(g + u_light * t);
    shade = min(shade, 1.0 - clamp((hs - h - t * 0.12) * 1.6, 0.0, 0.34));
  }
  float cover = smoothstep(0.05, ${BARE.toFixed(2)}, h) * (1.0 - u_clear);
  vec3 sand = u_sand * (0.6 + 0.58 * lam) * shade * (0.9 + 0.16 * n1);
  float glint = step(0.986, hash(gp * 1.7 + 3.1)) * pow(lam, 5.0);
  sand += vec3(glint * 0.35);
  vec3 pic = texture(u_pic, v_uv).rgb;
  // Damp where the sand thins, and a little shadow from the banks.
  float damp = smoothstep(0.0, ${BARE.toFixed(2)}, h) * (1.0 - u_clear);
  pic = pic * (1.0 - 0.3 * damp) * mix(vec3(1.0), u_sand, 0.3 * damp) * mix(0.75, 1.0, shade);
  outColor = vec4(mix(pic, sand, cover), 1.0);
}
`;

/* --------------------------------- engine -------------------------------- */

type Config = {
  src: string | undefined;
  grainSize: number;
  settle: number;
  plough: number;
  depth: number;
  light: number;
  sandKey: string;
  cleared: boolean;
  interactive: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
};

type Callbacks = {
  /** A stroke ended, the sand settled, was swept or poured: the share that shows. */
  report: (
    uncovered: number,
    why: "stroke" | "settled" | "swept" | "poured",
  ) => void;
  /** The plough has travelled far enough for a swish. */
  swish: (speed: number, x: number) => void;
};

type Engine = {
  configure: (c: Config) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
  start: (x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: () => void;
  keyMove: (dx: number, dy: number) => { x: number; y: number };
  marker: () => { x: number; y: number };
  sweep: () => void;
  pour: () => void;
  dispose: () => void;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  tri: FullscreenTriangle;
  height: WebGLTexture;
  pic: WebGLTexture;
  lost: boolean;
};

function createEngine(
  root: HTMLDivElement,
  canvas: HTMLCanvasElement,
  still: HTMLCanvasElement,
  carrier: HTMLSpanElement,
  visible: () => boolean,
  cb: Callbacks,
): Engine {
  let cfg: Config | null = null;
  let gpu: Gpu | null = null;
  let failed = false;
  let disposed = false;
  let detach: () => void = () => {};
  let frame = 0;
  let last = 0;

  // The picture, painted once per size.
  const picture = document.createElement("canvas");
  let image: HTMLImageElement | null = null;
  let imageSrc: string | undefined;

  // Layout and grid.
  let w = 0;
  let h = 0;
  let dpr = 1;
  let cols = 0;
  let rows = 0;
  let H = new Float32Array(0);
  let B = new Float32Array(0);
  let upload = new Float32Array(0);
  let dirty = true;
  let sand: [number, number, number] = [0.85, 0.75, 0.58];
  // Uniform arrays, filled in place each frame.
  const uGrid = new Float32Array(2);
  const uRes = new Float32Array(2);
  const uLight = new Float32Array(2);
  const uSand = new Float32Array(3);
  const sized = [0, 0];

  // What is happening.
  let ploughing = false;
  let lastX = 0;
  let lastY = 0;
  let travelled = 0;
  let lastStroke = -1e9;
  let settling = false;
  let settleClock = 0;
  let isClear = false;
  let sweepT = -1;
  let sweepFront = -4;
  let pourT = -1;
  let fade = 0;
  let fadeT = -1;
  let clearFade = 0;
  let clearDir = 0;
  let kx = -1;
  let ky = -1;
  let keyPath: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    t: number;
  } | null = null;

  const idx = (i: number, j: number) => j * cols + i;

  const buildBase = (c: Config) => {
    const s = Math.round(c.seed) * 7919 + 13;
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        B[idx(i, j)] = 1 + 0.14 * dune(i * CELL, j * CELL, s);
      }
    }
  };

  const layoutGrid = (c: Config) => {
    const nc = Math.max(4, Math.ceil(w / CELL) + 1);
    const nr = Math.max(4, Math.ceil(h / CELL) + 1);
    const oldH = H;
    const oldB = B;
    const oc = cols;
    const or = rows;
    cols = nc;
    rows = nr;
    H = new Float32Array(nc * nr);
    B = new Float32Array(nc * nr);
    upload = new Float32Array(nc * nr * 2);
    buildBase(c);
    for (let j = 0; j < nr; j += 1) {
      for (let i = 0; i < nc; i += 1) {
        const k = idx(i, j);
        if (oc > 0 && or > 0) {
          // Keep the furrows: the old surface's offset from its rest, resampled.
          const si = Math.min(
            oc - 1,
            Math.round((i / Math.max(1, nc - 1)) * (oc - 1)),
          );
          const sj = Math.min(
            or - 1,
            Math.round((j / Math.max(1, nr - 1)) * (or - 1)),
          );
          const o = sj * oc + si;
          H[k] = isClear ? 0 : (B[k] ?? 1) + ((oldH[o] ?? 1) - (oldB[o] ?? 1));
        } else {
          H[k] = isClear ? 0 : (B[k] ?? 1);
        }
      }
    }
    dirty = true;
  };

  const readColours = () => {
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 1;
    const x = c.getContext("2d", { willReadFrequently: true });
    if (!x) return;
    x.fillStyle = "rgb(0, 0, 0)";
    x.fillStyle = getComputedStyle(carrier).color;
    x.fillRect(0, 0, 1, 1);
    const d = x.getImageData(0, 0, 1, 1).data;
    sand = [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };

  const paintPicture = () => {
    const pw = Math.max(1, Math.round(w * dpr));
    const ph = Math.max(1, Math.round(h * dpr));
    picture.width = pw;
    picture.height = ph;
    const ctx = picture.getContext("2d");
    if (!ctx) return;
    if (image && image.complete && image.naturalWidth > 0) {
      const s = Math.max(pw / image.naturalWidth, ph / image.naturalHeight);
      const iw = image.naturalWidth * s;
      const ih = image.naturalHeight * s;
      ctx.drawImage(image, (pw - iw) / 2, (ph - ih) / 2, iw, ih);
    } else {
      drawMosaic(ctx, pw, ph);
    }
  };

  /** The no-WebGL still: the picture, a sand layer, one shaded furrow. */
  const paintStill = () => {
    const ctx = still.getContext("2d");
    if (!ctx || w < 1) return;
    still.width = Math.round(w * dpr);
    still.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [r, g, b] = sand.map((v) => Math.round(v * 255));
    ctx.fillStyle = `rgb(${r} ${g} ${b})`;
    ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < (w * h) / 40; k += 1) {
      const x = hash2(k, 1, 5) * w;
      const y = hash2(k, 2, 5) * h;
      ctx.fillStyle =
        hash2(k, 3, 5) > 0.5 ? "rgb(255 255 255 / 0.12)" : "rgb(0 0 0 / 0.1)";
      ctx.fillRect(x, y, 1, 1);
    }
    const path = new Path2D();
    path.moveTo(w * 0.12, h * 0.7);
    path.bezierCurveTo(
      w * 0.35,
      h * 0.2,
      w * 0.6,
      h * 0.85,
      w * 0.88,
      h * 0.35,
    );
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgb(255 255 255 / 0.25)";
    ctx.lineWidth = 34;
    ctx.stroke(path);
    ctx.strokeStyle = "rgb(0 0 0 / 0.18)";
    ctx.lineWidth = 26;
    ctx.stroke(path);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = 18;
    ctx.stroke(path);
    ctx.globalCompositeOperation = "source-over";
  };

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, FULLSCREEN_VERTEX, FRAGMENT);
    if (!program) return false;
    const tri = createFullscreenTriangle(gl, program);
    const height = gl.createTexture();
    if (!height) return false;
    let pic: WebGLTexture;
    try {
      paintPicture();
      pic = uploadTexture(gl, picture, { linear: true });
    } catch {
      // A picture from another origin cannot be read: show the still instead.
      return false;
    }
    gpu = { gl, program, tri, height, pic, lost: false };
    sized[0] = 0;
    sized[1] = 0;
    dirty = true;
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.tri.dispose();
    g.program.dispose();
    g.gl.deleteTexture(g.height);
    g.gl.deleteTexture(g.pic);
  };

  const pushHeight = () => {
    const g = gpu;
    if (!g || g.lost || !dirty) return;
    const { gl } = g;
    for (let k = 0; k < cols * rows; k += 1) {
      upload[k * 2] = H[k] ?? 0;
      upload[k * 2 + 1] = isClear ? 0 : (B[k] ?? 1);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, g.height);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (sized[0] === cols && sized[1] === rows) {
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        cols,
        rows,
        gl.RG,
        gl.FLOAT,
        upload,
      );
    } else {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RG32F,
        cols,
        rows,
        0,
        gl.RG,
        gl.FLOAT,
        upload,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      sized[0] = cols;
      sized[1] = rows;
    }
    dirty = false;
  };

  const draw = () => {
    const c = cfg;
    const g = gpu;
    if (!c || !g || g.lost || w < 1) return;
    pushHeight();
    const { gl, program } = g;
    const a = (clamp(c.light, -360, 360) * Math.PI) / 180;
    uGrid[0] = cols;
    uGrid[1] = rows;
    uRes[0] = canvas.width;
    uRes[1] = canvas.height;
    uLight[0] = Math.cos(a);
    uLight[1] = -Math.sin(a);
    uSand.set(sand);
    program.set({
      u_grid: uGrid,
      u_res: uRes,
      u_cell: CELL * dpr,
      u_grain: clamp(c.grainSize, 0.5, 3) * dpr,
      u_light: uLight,
      u_sand: uSand,
      u_seed: (Math.abs(Math.round(c.seed)) % 97) * 0.37,
      u_fade: fade,
      u_clear: clearFade,
    });
    program.texture("u_height", g.height, 0);
    program.texture("u_pic", g.pic, 1);
    gl.viewport(0, 0, canvas.width, canvas.height);
    g.tri.draw();
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  const uncovered = () => {
    if (isClear) return 1;
    let n = 0;
    for (let k = 0; k < cols * rows; k += 1) if ((H[k] ?? 1) < BARE) n += 1;
    return n / Math.max(1, cols * rows);
  };

  /** One stamp of the plough: cut the bowl, heap what it cut on each side. */
  const stamp = (x: number, y: number, dx: number, dy: number) => {
    const c = cfg;
    if (!c || isClear) return;
    const r = clamp(c.plough, 8, 40) / 2;
    const bank = r * 0.9;
    const depth = clamp01(c.depth);
    const reach = Math.ceil((r + bank) / CELL) + 1;
    const ci = Math.round(x / CELL);
    const cj = Math.round(y / CELL);
    let cutL = 0;
    let cutR = 0;
    let wL = 0;
    let wR = 0;
    for (let pass = 0; pass < 2; pass += 1) {
      for (let j = cj - reach; j <= cj + reach; j += 1) {
        if (j < 0 || j >= rows) continue;
        for (let i = ci - reach; i <= ci + reach; i += 1) {
          if (i < 0 || i >= cols) continue;
          const rx = i * CELL - x;
          const ry = j * CELL - y;
          const along = rx * dx + ry * dy;
          if (Math.abs(along) > CELL * 1.25) continue;
          const across = -rx * dy + ry * dx;
          const k = idx(i, j);
          const ad = Math.abs(across);
          if (ad < r) {
            if (pass === 1 || Math.abs(along) > CELL * 0.75) continue;
            const u = across / r;
            const floor = (B[k] ?? 1) * (1 - depth * (1 - u * u));
            const now = H[k] ?? 0;
            if (now > floor) {
              H[k] = floor;
              if (across < 0) cutL += now - floor;
              else cutR += now - floor;
            }
          } else if (ad < r + bank) {
            const t = (ad - r) / bank;
            // Smooth across the bank and along the stroke, so the ridge
            // builds evenly instead of in a ladder of stamps.
            const weight =
              (Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.05) *
              (0.5 + 0.5 * Math.cos((Math.PI * along) / (CELL * 1.25)));
            if (pass === 0) {
              if (across < 0) wL += weight;
              else wR += weight;
            } else {
              H[k] =
                (H[k] ?? 0) +
                (across < 0
                  ? (cutL * weight) / Math.max(1e-6, wL)
                  : (cutR * weight) / Math.max(1e-6, wR));
            }
          }
        }
      }
    }
    dirty = true;
  };

  const ploughTo = (x: number, y: number) => {
    const dx = x - lastX;
    const dy = y - lastY;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) return;
    const ux = dx / len;
    const uy = dy / len;
    const steps = Math.ceil(len / (CELL * 0.5));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      stamp(lastX + dx * t, lastY + dy * t, ux, uy);
    }
    travelled += len;
    if (travelled > 70) {
      travelled = 0;
      cb.swish(len, x);
    }
    lastX = x;
    lastY = y;
    lastStroke = performance.now();
    settling = true;
    settleClock = 0;
  };

  /** Angle of repose: any slope steeper than the talus slides down a little. */
  const relax = () => {
    let moved = 0;
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = idx(i, j);
        const a = H[k] ?? 0;
        if (i + 1 < cols) {
          const b = H[k + 1] ?? 0;
          const ex = Math.abs(a - b) - TALUS;
          if (ex > 0) {
            const m = (a > b ? 1 : -1) * ex * 0.2;
            H[k] = (H[k] ?? 0) - m;
            H[k + 1] = (H[k + 1] ?? 0) + m;
            moved = Math.max(moved, Math.abs(m));
          }
        }
        if (j + 1 < rows) {
          const b = H[k + cols] ?? 0;
          const ex = Math.abs((H[k] ?? 0) - b) - TALUS;
          if (ex > 0) {
            const m = ((H[k] ?? 0) > b ? 1 : -1) * ex * 0.2;
            H[k] = (H[k] ?? 0) - m;
            H[k + cols] = (H[k + cols] ?? 0) + m;
            moved = Math.max(moved, Math.abs(m));
          }
        }
      }
    }
    if (moved > 0) dirty = true;
    return moved;
  };

  /** The slump: the surface's offset from rest spreads out, filling the furrow. */
  const scratch = { e: new Float32Array(0) };
  const creep = (rate: number) => {
    if (rate <= 0) return 0;
    const n = cols * rows;
    if (scratch.e.length !== n) scratch.e = new Float32Array(n);
    const e = scratch.e;
    for (let k = 0; k < n; k += 1) e[k] = (H[k] ?? 0) - (B[k] ?? 0);
    let moved = 0;
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        const k = idx(i, j);
        const c0 = e[k] ?? 0;
        const l = i > 0 ? (e[k - 1] ?? 0) : c0;
        const r = i < cols - 1 ? (e[k + 1] ?? 0) : c0;
        const u = j > 0 ? (e[k - cols] ?? 0) : c0;
        const d = j < rows - 1 ? (e[k + cols] ?? 0) : c0;
        const delta = rate * (l + r + u + d - 4 * c0);
        H[k] = (B[k] ?? 0) + c0 + delta;
        moved = Math.max(moved, Math.abs(delta));
      }
    }
    dirty = true;
    return moved;
  };

  const step = (now: number, dt: number) => {
    const c = cfg;
    if (!c) return false;
    let busy = false;
    // A key plough draws its furrow along the move, not in one jump.
    if (keyPath) {
      const t = clamp01((now - keyPath.t) / 120);
      ploughTo(
        lerp(keyPath.x0, keyPath.x1, t),
        lerp(keyPath.y0, keyPath.y1, t),
      );
      if (t >= 1) {
        keyPath = null;
        cb.report(uncovered(), "stroke");
      }
      busy = true;
    }
    if (sweepT >= 0) {
      // The broom: a front crosses the tray, taking the sand behind it and
      // carrying it as a soft ridge just ahead, out over the far edge. It
      // moves in sub-steps under a cell, so the ridge never leaves stripes.
      const t = clamp01((now - sweepT) / 760);
      const ease = (x: number) => x * x * (3 - 2 * x);
      const to = lerp(-4, cols + 10, ease(t));
      const steps = Math.max(1, Math.ceil((to - sweepFront) / 0.75));
      for (let n = 1; n <= steps; n += 1) {
        const front = lerp(sweepFront, to, n / steps);
        const lead = Math.floor(front);
        for (let j = 0; j < rows; j += 1) {
          let carried = 0;
          for (
            let i = Math.max(0, lead - 4);
            i < Math.min(cols, lead + 2);
            i += 1
          ) {
            const k = idx(i, j);
            const take = (H[k] ?? 0) * smooth(-0.5, 1.5, front - i);
            H[k] = (H[k] ?? 0) - take;
            carried += take;
          }
          for (let i = lead; i < lead + 7; i += 1) {
            if (i < 0 || i >= cols) continue;
            const d = i - (front + 2.5);
            H[idx(i, j)] =
              (H[idx(i, j)] ?? 0) + (carried * Math.exp(-(d * d) / 3)) / 3.07;
          }
        }
      }
      sweepFront = to;
      dirty = true;
      busy = true;
      if (t >= 1) {
        sweepT = -1;
        H.fill(0);
        isClear = true;
        settling = false;
        cb.report(1, "swept");
      }
    }
    if (pourT >= 0) {
      // Sand sifts back in, each patch on its own seeded beat.
      const t = (now - pourT) / 1000;
      let done = true;
      for (let j = 0; j < rows; j += 1) {
        for (let i = 0; i < cols; i += 1) {
          const k = idx(i, j);
          const delay = hash2(i >> 2, j >> 2, 77) * 0.45;
          const p = smooth(delay, delay + 0.4, t);
          if (p < 1) done = false;
          H[k] = (B[k] ?? 1) * p;
        }
      }
      dirty = true;
      busy = true;
      if (done) {
        pourT = -1;
        cb.report(uncovered(), "poured");
      }
    }
    if (c.motionSafe) {
      if (settling && !isClear && sweepT < 0 && pourT < 0) {
        let moved = 0;
        moved = Math.max(moved, relax(), relax());
        if (!ploughing) {
          settleClock += dt;
          const ramp = smooth(0.6, 1.6, (now - lastStroke) / 1000);
          const s = clamp01(c.settle);
          const rate = Math.min(0.22, s * s * 6 * dt) * ramp;
          let left = rate;
          while (left > 1e-5) {
            const part = Math.min(0.22, left);
            left -= part;
            moved = Math.max(moved, creep(part));
          }
          const quiet = moved < 2e-4 && ramp >= 1;
          if (quiet || settleClock > 30 || (s === 0 && moved < 1e-4)) {
            settling = false;
            cb.report(uncovered(), "settled");
          }
        }
        busy = busy || settling;
      }
    } else {
      // Reduced motion: no slump. After a pause the sand fades back smooth.
      if (settling && !ploughing && !isClear && clamp01(c.settle) > 0) {
        const wait = lerp(7000, 1500, clamp01(c.settle));
        if (fadeT < 0 && now - lastStroke > wait) fadeT = now;
        if (fadeT >= 0) {
          fade = smooth(0, 400, now - fadeT);
          if (fade >= 1) {
            H.set(B);
            fade = 0;
            fadeT = -1;
            settling = false;
            dirty = true;
            cb.report(0, "settled");
          }
        }
        busy = busy || settling;
      }
      if (clearDir !== 0) {
        clearFade = clamp01(clearFade + (clearDir * dt) / 0.4);
        busy = true;
        if (clearDir > 0 && clearFade >= 1) {
          clearDir = 0;
          clearFade = 0;
          H.fill(0);
          isClear = true;
          dirty = true;
          cb.report(1, "swept");
        } else if (clearDir < 0 && clearFade <= 0) {
          clearDir = 0;
          cb.report(uncovered(), "poured");
        }
      }
    }
    return busy || ploughing;
  };

  const tick = (now: number) => {
    frame = 0;
    if (disposed || !cfg || !gpu || gpu.lost) return;
    if (!visible() || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const busy = step(now, dt);
    draw();
    if (busy) frame = window.requestAnimationFrame(tick);
    else last = 0;
  };

  const kick = () => {
    if (disposed || frame || !gpu || gpu.lost || !visible() || document.hidden)
      return;
    frame = window.requestAnimationFrame(tick);
  };

  const resize = () => {
    const c = cfg;
    if (!c) return;
    const nw = root.clientWidth;
    const nh = root.clientHeight;
    const nd = Math.min(window.devicePixelRatio || 1, clamp(c.dpr, 0.5, 2));
    if (nw < 1 || nh < 1) return;
    if (nw === w && nh === h && nd === dpr && cols > 0) return;
    w = nw;
    h = nh;
    dpr = nd;
    layoutGrid(c);
    if (kx < 0) {
      kx = w * 0.18;
      ky = h * 0.5;
    }
    if (failed) {
      paintStill();
      return;
    }
    const g = gpu;
    if (!g || g.lost) return;
    resizeGL(g.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
    paintPicture();
    try {
      g.pic = uploadTexture(g.gl, picture, { linear: true }, g.pic);
    } catch {
      // Keeps the last picture it could read.
    }
    draw();
  };

  const startGpu = () => {
    if (!build()) return false;
    resize();
    draw();
    return true;
  };

  const loadImage = (src: string | undefined) => {
    imageSrc = src;
    image = null;
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (disposed || imageSrc !== src) return;
      image = img;
      const g = gpu;
      if (!g || g.lost) return;
      paintPicture();
      try {
        g.pic = uploadTexture(g.gl, picture, { linear: true }, g.pic);
        draw();
      } catch {
        // Another origin without CORS: the still shows the picture instead.
        failed = true;
        root.setAttribute("data-fallback", "");
        paintStill();
      }
    };
    img.src = src;
  };

  return {
    configure(next) {
      const was = cfg;
      cfg = next;
      if (!was) {
        isClear = next.cleared;
        readColours();
        loadImage(next.src);
        w = 0;
        if (!startGpu()) {
          failed = true;
          root.setAttribute("data-fallback", "");
          resize();
          paintStill();
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
            if (!disposed && startGpu()) kick();
          },
        );
        return;
      }
      if (was.src !== next.src) loadImage(next.src);
      if (was.sandKey !== next.sandKey) {
        readColours();
        if (failed) paintStill();
      }
      if (was.seed !== next.seed) {
        // New dunes: the sand is laid fresh.
        cols = 0;
        rows = 0;
        layoutGrid(next);
      }
      if (was.dpr !== next.dpr) {
        w = 0;
        resize();
      }
      if (was.motionSafe !== next.motionSafe) {
        fade = 0;
        fadeT = -1;
        clearFade = 0;
        clearDir = 0;
      }
      draw();
      kick();
    },
    resize,
    readColours() {
      readColours();
      if (failed) paintStill();
      draw();
    },
    wake() {
      draw();
      if (
        ploughing ||
        settling ||
        sweepT >= 0 ||
        pourT >= 0 ||
        keyPath ||
        clearDir
      )
        kick();
    },
    start(x, y) {
      ploughing = true;
      lastX = x;
      lastY = y;
      travelled = 0;
      fade = 0;
      fadeT = -1;
      kick();
    },
    move(x, y) {
      if (!ploughing) return;
      ploughTo(x, y);
      kx = x;
      ky = y;
      draw();
      kick();
    },
    end() {
      ploughing = false;
      cb.report(uncovered(), "stroke");
      kick();
    },
    keyMove(dx, dy) {
      const x0 = clamp(kx, 4, w - 4);
      const y0 = clamp(ky, 4, h - 4);
      const x1 = clamp(x0 + dx, 4, w - 4);
      const y1 = clamp(y0 + dy, 4, h - 4);
      lastX = x0;
      lastY = y0;
      kx = x1;
      ky = y1;
      fade = 0;
      fadeT = -1;
      keyPath = { x0, y0, x1, y1, t: performance.now() };
      kick();
      return { x: x1, y: y1 };
    },
    marker() {
      return { x: kx, y: ky };
    },
    sweep() {
      if (isClear || sweepT >= 0) return;
      pourT = -1;
      if (failed) {
        isClear = true;
        cb.report(1, "swept");
        return;
      }
      if (cfg?.motionSafe) {
        sweepT = performance.now();
        sweepFront = -4;
      } else clearDir = 1;
      kick();
    },
    pour() {
      if (!isClear && pourT < 0) return;
      sweepT = -1;
      isClear = false;
      if (failed) {
        H.set(B);
        cb.report(0, "poured");
        return;
      }
      if (cfg?.motionSafe) {
        pourT = performance.now();
      } else {
        H.set(B);
        clearFade = 1;
        clearDir = -1;
        dirty = true;
      }
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
      image = null;
    },
  };
}

/* ------------------------------- component ------------------------------- */

/**
 * A picture buried under fine sand. The sand is a heightfield simulated on a
 * coarse grid and shaded per pixel in WebGL2 — light from `light`, grain at
 * `grainSize`, glints, short shadows cast into the furrow, damp edges where it
 * thins. Drag to plough: a bowl-shaped plough cuts down toward the picture and
 * heaps what it cuts onto a bank on each side, the banks round off at their
 * angle of repose, and about a second later they begin to slump back in at
 * `settle`'s pace until the sand lies smooth and the loop stops. Double-click
 * (or Enter) sweeps it clear with a broom front; Backspace pours it back.
 *
 * Keyboard: arrows plough from a marker. Under reduced motion ploughing still
 * cuts, nothing slumps on its own, and the sand fades back after a pause;
 * sweeping and pouring are cross-fades. Without WebGL2 a drawn still shows the
 * picture under sand with one furrow.
 */
export function SandFurrow({
  src,
  alt = "A tile mosaic of a fish among waves",
  grainSize = 1.5,
  settle = 0.45,
  plough = 24,
  depth = 0.9,
  light = 135,
  sandColor = "oklch(from var(--warn) 0.82 0.055 calc(h - 8))",
  cleared,
  defaultCleared = false,
  onClearedChange,
  onPlough,
  sound = false,
  interactive = true,
  seed = 5,
  dpr = 2,
  label = "Sand over a picture",
  intro = true,
  className,
}: SandFurrowProps) {
  const motionSafe = useMotionSafe();
  const audio = useTactileSound(sound);
  const hintId = React.useId();
  const [own, setOwn] = React.useState(defaultCleared);
  const isCleared = cleared ?? own;
  const [shown, setShown] = React.useState(defaultCleared ? 100 : 0);
  const [said, setSaid] = React.useState("");

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const stillRef = React.useRef<HTMLCanvasElement | null>(null);
  const carrierRef = React.useRef<HTMLSpanElement | null>(null);
  const markerRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const heard = React.useRef({ audio, onPlough });
  // The first-view furrow: whether it has run, its frame, and whether a
  // stroke in flight is the tray's own (no sound, no announcement for it).
  const introWanted = React.useRef(intro && motionSafe);
  const introDone = React.useRef(false);
  const introFrame = React.useRef(0);
  const auto = React.useRef(false);

  const config: Config = {
    src,
    grainSize,
    settle,
    plough,
    depth,
    light,
    sandKey: sandColor,
    cleared: isCleared,
    interactive,
    seed,
    dpr,
    motionSafe,
  };
  const latest = React.useRef(config);
  React.useEffect(() => {
    heard.current = { audio, onPlough };
    introWanted.current = intro && motionSafe;
    latest.current = config;
    engine.current?.configure(config);
  });

  React.useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const still = stillRef.current;
    const carrier = carrierRef.current;
    if (!root || !canvas || !still || !carrier) return;
    const e = createEngine(
      root,
      canvas,
      still,
      carrier,
      () => visible.current,
      {
        report: (share, why) => {
          const percent = Math.round(share * 100);
          setShown(percent);
          if (why === "stroke" || why === "settled") {
            heard.current.onPlough?.(Math.round(share * 100) / 100);
          }
          if (auto.current && (why === "stroke" || why === "settled")) {
            if (why === "settled") auto.current = false;
            return;
          }
          if (why === "stroke") {
            setSaid(`${percent} percent uncovered.`);
          } else if (why === "settled") {
            setSaid(
              percent === 0
                ? "Covered again."
                : `${percent} percent uncovered.`,
            );
          } else if (why === "swept") {
            setSaid("Swept clear. Backspace pours the sand back.");
          } else {
            setSaid("Covered with sand again.");
          }
        },
        swish: (speed, x) => {
          if (auto.current) return;
          heard.current.audio.play("swish", {
            pitch: clamp(0.8 + speed / 60, 0.8, 1.4),
            gain: clamp(0.25 + speed / 120, 0.25, 0.55),
            pan: panFrom(
              x + (rootRef.current?.getBoundingClientRect().left ?? 0),
              rootRef.current,
            ),
          });
        },
      },
    );
    engine.current = e;
    e.configure(latest.current);
    return () => {
      e.dispose();
      if (engine.current === e) engine.current = null;
      root.removeAttribute("data-live");
      root.removeAttribute("data-fallback");
    };
  }, []);

  // A host that flips `cleared` gets the same sweep or pour a gesture would.
  const shownClear = React.useRef(isCleared);
  React.useEffect(() => {
    if (shownClear.current === isCleared) return;
    shownClear.current = isCleared;
    if (isCleared) engine.current?.sweep();
    else engine.current?.pour();
  }, [isCleared]);

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
    let introTimer = 0;
    const watcher = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      visible.current = Boolean(entry?.isIntersecting);
      if (visible.current) engine.current?.wake();
      if (
        visible.current &&
        !introDone.current &&
        introWanted.current &&
        engine.current
      ) {
        introDone.current = true;
        introTimer = window.setTimeout(() => runIntro(node), 450);
      }
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      window.clearTimeout(introTimer);
      stopIntro();
      visible.current = false;
    };
  }, []);

  /** One gentle S-shaped furrow across the tray, ploughed by the tray itself. */
  function runIntro(node: HTMLDivElement) {
    const e = engine.current;
    if (!e) return;
    const w = node.clientWidth;
    const h = node.clientHeight;
    if (w < 40 || h < 40) return;
    const at = (t: number) => ({
      x: w * (0.1 + 0.8 * t),
      y: h * (0.64 - 0.28 * t + 0.1 * Math.sin(t * Math.PI * 2)),
    });
    const start = at(0);
    auto.current = true;
    e.start(start.x, start.y);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 1600);
      const p = at(t * t * (3 - 2 * t));
      e.move(p.x, p.y);
      if (t < 1) {
        introFrame.current = requestAnimationFrame(step);
      } else {
        introFrame.current = 0;
        e.end();
      }
    };
    introFrame.current = requestAnimationFrame(step);
  }

  /** A visitor's own stroke (or unmounting) ends the tray's. */
  function stopIntro() {
    if (!introFrame.current) return;
    cancelAnimationFrame(introFrame.current);
    introFrame.current = 0;
    engine.current?.end();
    auto.current = false;
  }

  const setClear = (next: boolean) => {
    if (next === isCleared) return;
    shownClear.current = next;
    if (next) {
      engine.current?.sweep();
      audio.play("swish", { pitch: 0.7, gain: 0.6 });
    } else {
      engine.current?.pour();
      audio.play("swish", { pitch: 0.55, gain: 0.4 });
    }
    if (cleared === undefined) setOwn(next);
    onClearedChange?.(next);
  };

  const local = (x: number, y: number) => {
    const rect = rootRef.current?.getBoundingClientRect();
    return rect ? { x: x - rect.left, y: y - rect.top } : { x, y };
  };

  const placeMarker = (p: { x: number; y: number }) => {
    const el = markerRef.current;
    if (el)
      el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
  };

  const drag = useDrag({
    threshold: 2,
    disabled: !interactive,
    onStart: ({ point, offset }) => {
      stopIntro();
      auto.current = false;
      const a = local(point.x - offset.x, point.y - offset.y);
      engine.current?.start(a.x, a.y);
      const b = local(point.x, point.y);
      engine.current?.move(b.x, b.y);
    },
    onMove: ({ point }) => {
      const b = local(point.x, point.y);
      engine.current?.move(b.x, b.y);
    },
    onEnd: () => {
      engine.current?.end();
      const m = engine.current?.marker();
      if (m) placeMarker(m);
    },
    onCancel: () => engine.current?.end(),
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    stopIntro();
    auto.current = false;
    const by = event.shiftKey ? 42 : 14;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-by, 0],
      ArrowRight: [by, 0],
      ArrowUp: [0, -by],
      ArrowDown: [0, by],
    };
    const mv = moves[event.key];
    if (mv) {
      event.preventDefault();
      const p = engine.current?.keyMove(mv[0], mv[1]);
      if (p) placeMarker(p);
      audio.play("swish", { pitch: 1, gain: 0.3 });
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setClear(true);
    } else if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      setClear(false);
    }
  };

  const name = `${label}: ${alt}. ${
    isCleared ? "Swept clear." : `${shown} percent uncovered.`
  }`;

  return (
    <div
      ref={bindRoot}
      role="group"
      aria-roledescription="sand tray"
      aria-label={name}
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKeyDown}
      onFocus={() => {
        const m = engine.current?.marker();
        if (m) placeMarker(m);
      }}
      onDoubleClick={() => {
        if (interactive) setClear(true);
      }}
      {...(interactive ? drag : {})}
      className={cn(
        "group/sand-furrow relative isolate h-56 w-full overflow-clip rounded-3 outline-none select-none",
        interactive && "cursor-crosshair touch-none",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 transition-opacity duration-300 group-data-live/sand-furrow:opacity-0"
        style={{
          backgroundColor: sandColor,
          backgroundImage:
            "radial-gradient(120% 80% at 20% 30%, oklch(1 0 0 / 0.14), transparent 60%), radial-gradient(90% 70% at 80% 75%, oklch(0 0 0 / 0.1), transparent 65%)",
        }}
      />
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-300 group-data-live/sand-furrow:opacity-100"
      />
      <canvas
        ref={stillRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 hidden size-full transition-opacity duration-300 group-data-fallback/sand-furrow:block",
          isCleared && "opacity-0",
        )}
      />
      <span
        ref={markerRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity group-focus-visible/sand-furrow:opacity-100"
      >
        <span className="absolute -top-2 -left-2 size-4 rounded-full border-2 border-foreground/80 bg-background/40" />
      </span>
      <span
        ref={carrierRef}
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: sandColor }}
      />
      {interactive ? (
        <span id={hintId} className="sr-only">
          Drag to plough the sand, or use the arrow keys to plough from the
          marker; Shift ploughs further. Double-click, Enter or Space sweeps it
          clear; Backspace pours it back.
        </span>
      ) : null}
      <span aria-live="polite" className="sr-only">
        {said}
      </span>
    </div>
  );
}
