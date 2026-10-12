"use client";

import * as React from "react";

import { useMotionSafe } from "@/registry/hooks/use-motion-safe";
import {
  GLSL_NOISE,
  createGL,
  createProgram,
  onContextLoss,
  resizeGL,
  type GLContext,
  type Program,
} from "@/registry/lib/glsl";
import { springs } from "@/registry/lib/motion";
import { cn } from "@/registry/lib/utils";

export type ZelligeWallProps = {
  /** A picture to set in tiles (same-origin, or served with CORS). Without one, a drawn courtyard door is used. */
  src?: string;
  /** Describes the picture. @default a description of the drawn courtyard */
  alt?: string;
  /** Tile size, px, 8 to 28. @default 14 */
  tile?: number;
  /** Glaze shine, 0 (matte clay) to 1 (wet glass). @default 0.6 */
  glaze?: number;
  /** How far a tile leans toward the pointer, degrees, 0 to 35. @default 18 */
  tilt?: number;
  /** How far from the pointer tiles lean, px. @default 90 */
  radius?: number;
  /** How fast a click's ripple crosses the wall, px per second. @default 520 */
  rippleSpeed?: number;
  /** How the tiles settle, 0 (one crisp overshoot) to 1 (a ringing wobble). @default 0.5 */
  wobble?: number;
  /** How unevenly the tiles are cut, 0 (machine-square) to 1 (hand-cut). @default 0.5 */
  jitter?: number;
  /** How far a tile is set off square, degrees. @default 2.5 */
  askew?: number;
  /** The grout between the tiles, any CSS colour. @default a mix of the page background and ink */
  grout?: string;
  /** The key light's direction, degrees (−135 is from the upper left). @default -135 */
  light?: number;
  /** Tiles answer the pointer and keys; off, the wall is a still picture. @default true */
  interactive?: boolean;
  /** Seeds the cut and set of every tile. @default 7 */
  seed?: number;
  /** Cap on the canvas's device pixel ratio, at most 2. @default 2 */
  dpr?: number;
  /** Fires from the click or key that sent a ripple, with its origin as shares of the wall (0–1). */
  onRipple?: (origin: { x: number; y: number }) => void;
  /** The wall's accessible name. @default "Glazed tile wall" */
  label?: string;
  /** No pointer, clicks or keys; the wall dims. @default false */
  disabled?: boolean;
  /** Sizes the wall; it fills its parent by default. */
  className?: string;
};

/* --------------------------------- picture -------------------------------- */

/** A pigment: a token's hue at a fixed lightness and chroma, the same in both themes. */
const pig = (token: string, l: number, c: number, dh = 0) =>
  `oklch(from var(${token}) ${l} ${c} ${dh ? `calc(h + ${dh})` : "h"})`;

/** The glazes of the drawn picture, which are also the palette tiles lean toward. */
const GLAZES = [
  pig("--warn", 0.93, 0.03, -12), // 0 lime wash
  pig("--accent", 0.8, 0.035, -10), // 1 wall in shade
  pig("--accent", 0.46, 0.16), // 2 cobalt
  pig("--accent", 0.34, 0.12), // 3 deep cobalt
  pig("--warn", 0.74, 0.13, -6), // 4 ochre
  pig("--danger", 0.56, 0.12, 18), // 5 terracotta
  pig("--success", 0.52, 0.12, -10), // 6 leaf
  pig("--success", 0.36, 0.08, -5), // 7 deep leaf
  pig("--warn", 0.42, 0.05, -30), // 8 bark
  pig("--danger", 0.6, 0.2, 2), // 9 geranium
  pig("--danger", 0.64, 0.09, 22), // 10 floor
  pig("--danger", 0.5, 0.08, 22), // 11 floor joint
  pig("--accent", 0.26, 0.03), // 12 ink
  pig("--warn", 0.97, 0.02, -12), // 13 lime light
];
const CLAY = pig("--danger", 0.62, 0.07, 30);
const DEFAULT_GROUT =
  "color-mix(in oklab, var(--background) 80%, var(--ink-3))";
const DEFAULT_ALT =
  "A lime-washed courtyard wall: a cobalt arched door in an ochre surround, a fig tree and a shuttered window on the left, terracotta pots of red geraniums on the right.";

/** r: x y w h glaze [rx] · c: cx cy r glaze · e: cx cy rx ry glaze · p: d glaze. In a 1200 × 400 box. */
type Shape =
  | ["r", number, number, number, number, number, number?]
  | ["c", number, number, number, number]
  | ["e", number, number, number, number, number]
  | ["p", string, number];

const PIC_W = 1200;
const PIC_H = 400;

const PICTURE: Shape[] = [
  ["r", 0, 0, 1200, 400, 0],
  ["p", "M820 0 L1200 0 L1200 360 L1060 360 Z", 1],
  ["r", 0, 0, 1200, 12, 5],
  ["r", 0, 364, 1200, 36, 10],
  ["r", 0, 364, 1200, 5, 11],
  // a shuttered window, far left
  ["r", 70, 96, 100, 120, 12],
  ["r", 34, 96, 34, 120, 2],
  ["r", 172, 96, 34, 120, 2],
  ["r", 60, 216, 120, 12, 4],
  // the fig tree
  [
    "p",
    "M300 364 C296 318 312 286 288 244 C276 222 300 208 310 190 L328 196 C322 220 304 232 318 258 C334 290 322 322 330 364 Z",
    8,
  ],
  ["c", 250, 150, 92, 7],
  ["c", 352, 112, 104, 6],
  ["c", 430, 176, 76, 7],
  ["c", 214, 224, 62, 6],
  ["c", 372, 222, 70, 6],
  ["c", 300, 64, 64, 6],
  // the door in its surround
  ["p", "M466 364 L466 182 A134 134 0 0 1 734 182 L734 364 Z", 4],
  ["p", "M494 364 L494 184 A106 106 0 0 1 706 184 L706 364 Z", 2],
  ["r", 522, 206, 70, 140, 3, 6],
  ["r", 608, 206, 70, 140, 3, 6],
  ["c", 600, 140, 16, 3],
  ["c", 650, 276, 8, 4],
  ["r", 448, 356, 304, 14, 13],
  // pots of geraniums
  ["p", "M778 364 L858 364 L872 286 L764 286 Z", 5],
  ["p", "M890 364 L996 364 L1012 262 L874 262 Z", 5],
  ["p", "M1030 364 L1092 364 L1102 304 L1020 304 Z", 5],
  ["c", 818, 262, 50, 6],
  ["c", 944, 226, 64, 7],
  ["c", 1062, 280, 40, 6],
  ["c", 800, 240, 24, 9],
  ["c", 840, 248, 20, 9],
  ["c", 916, 196, 26, 9],
  ["c", 970, 210, 24, 9],
  ["c", 944, 168, 20, 9],
  ["c", 1058, 258, 22, 9],
  // a niche in the shade, far right
  ["p", "M1112 190 L1112 132 A40 40 0 0 1 1192 132 L1192 190 Z", 3],
  ["e", 1152, 190, 50, 8, 4],
];

function PictureSvg() {
  return (
    <svg
      viewBox={`0 0 ${PIC_W} ${PIC_H}`}
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 block size-full"
      aria-hidden
    >
      {PICTURE.map((s, i) => {
        const fill = {
          fill: GLAZES[s[0] === "p" ? s[2] : s[0] === "c" ? s[4] : s[5]],
        };
        switch (s[0]) {
          case "r":
            return (
              <rect
                key={i}
                x={s[1]}
                y={s[2]}
                width={s[3]}
                height={s[4]}
                rx={s[6]}
                style={fill}
              />
            );
          case "c":
            return <circle key={i} cx={s[1]} cy={s[2]} r={s[3]} style={fill} />;
          case "e":
            return (
              <ellipse
                key={i}
                cx={s[1]}
                cy={s[2]}
                rx={s[3]}
                ry={s[4]}
                style={fill}
              />
            );
          default:
            return <path key={i} d={s[1]} style={fill} />;
        }
      })}
    </svg>
  );
}

/* --------------------------------- shaders -------------------------------- */

const VERTEX = /* glsl */ `#version 300 es
in vec4 a_tile;
in vec4 a_jitA;
in vec4 a_jitB;
in vec4 a_color;
in vec2 a_tilt;
uniform vec2 u_size;
uniform vec2 u_offset;
out vec2 v_local;
out vec3 v_color;
out vec2 v_tilt;
out float v_seed;
out vec2 v_pos;

void main() {
  int id = gl_VertexID;
  vec2 corner = vec2((id & 1) == 1 ? 0.5 : -0.5, (id & 2) == 2 ? 0.5 : -0.5);
  vec2 j = id == 0 ? a_jitA.xy : id == 1 ? a_jitA.zw : id == 2 ? a_jitB.xy : a_jitB.zw;
  vec2 local = (corner + j) * a_tile.z;
  float c = cos(a_tile.w);
  float s = sin(a_tile.w);
  local = vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  // A small rigid tilt: the edge it leans toward sinks, the far edge lifts
  // toward the eye, under a soft perspective.
  float z = -dot(local, a_tilt);
  float persp = 1.0 / (1.0 - z / 900.0);
  vec2 p = a_tile.xy + local * vec2(cos(a_tilt.x), cos(a_tilt.y)) * persp + u_offset;
  v_local = corner;
  v_color = a_color.rgb;
  v_seed = a_color.a;
  v_tilt = a_tilt;
  v_pos = p;
  vec2 clip = p / u_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
in vec2 v_local;
in vec3 v_color;
in vec2 v_tilt;
in float v_seed;
in vec2 v_pos;
uniform vec3 u_light;
uniform vec3 u_lamp;
uniform float u_lampOn;
uniform float u_glaze;
uniform vec3 u_clay;
uniform float u_flash;
uniform float u_shadow;
out vec4 o_color;

${GLSL_NOISE}

void main() {
  vec2 e = v_local * 2.0;
  float edge = max(abs(e.x), abs(e.y));
  float aa = fwidth(edge) * 1.3;
  float alpha = 1.0 - smoothstep(1.0 - aa, 1.0, edge);
  if (u_shadow > 0.5) {
    o_color = vec4(0.0, 0.0, 0.0, 0.26 * alpha);
    return;
  }
  // The face is a shallow pillow and the glaze rolls over the edge, so the
  // normal leans outward toward the rim and a highlight is a spot on each
  // tile, never the whole tile; the hand-glazed face is never quite flat.
  float roll = smoothstep(0.6, 1.0, edge);
  float n1 = kx_noise(v_local * 3.1 + v_seed * 17.0) - 0.5;
  float n2 = kx_noise(v_local * 3.7 + v_seed * 29.0 + 4.0) - 0.5;
  vec3 N = normalize(vec3(v_tilt + e * (0.3 + roll * 0.7) + vec2(n1, n2) * 0.22, 1.0));
  vec3 V = vec3(0.0, 0.0, 1.0);
  float shin = mix(24.0, 190.0, u_glaze);
  float diff = max(dot(N, u_light), 0.0);
  float spec = pow(max(dot(N, normalize(u_light + V)), 0.0), shin) * (0.1 + 0.95 * u_glaze);
  vec3 toLamp = vec3(u_lamp.xy - v_pos, u_lamp.z);
  float near = exp(-dot(toLamp.xy, toLamp.xy) / (u_lamp.z * u_lamp.z * 9.0));
  vec3 Lp = normalize(toLamp);
  float specP = pow(max(dot(N, normalize(Lp + V)), 0.0), shin * 0.8) * u_lampOn * near * (0.26 + 1.05 * u_glaze);
  vec3 base = v_color;
  // Glaze pools in the middle and thins over the rim.
  base *= 0.95 + 0.07 * roll;
  float chip = smoothstep(0.92, 1.0, edge + n1 * 0.1);
  base = mix(base, u_clay, chip * 0.5);
  vec3 lit = base * (0.68 + 0.4 * diff + 0.05 * u_lampOn * near);
  // A glint is a mix toward warm white, capped so the glaze keeps its colour.
  vec3 col = mix(lit, vec3(1.0, 0.97, 0.92), clamp((spec + specP) * (1.0 - chip), 0.0, 0.82));
  col += u_flash * 0.14;
  o_color = vec4(clamp(col, 0.0, 1.0) * alpha, alpha);
}
`;

/* --------------------------------- engine --------------------------------- */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

function hash(a: number, b: number): number {
  let h =
    Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^
    Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Any CSS colour, as 0–1 sRGB, by painting one pixel. */
function rgbReader() {
  const c = document.createElement("canvas");
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  return (colour: string): [number, number, number] => {
    if (!ctx) return [0.5, 0.5, 0.5];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "rgb(128, 128, 128)";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [(d[0] ?? 0) / 255, (d[1] ?? 0) / 255, (d[2] ?? 0) / 255];
  };
}

type Config = {
  tile: number;
  glaze: number;
  tilt: number;
  radius: number;
  rippleSpeed: number;
  wobble: number;
  jitter: number;
  askew: number;
  light: number;
  interactive: boolean;
  seed: number;
  dpr: number;
  motionSafe: boolean;
  src: string;
  colourKey: string;
};

type Gpu = {
  gl: GLContext;
  program: Program;
  vao: WebGLVertexArrayObject;
  statics: WebGLBuffer;
  tilts: WebGLBuffer;
  lost: boolean;
};

type Ring = { x: number; y: number; t0: number; on: boolean };

const FLOATS = 16;
const MAX_RINGS = 4;

type Engine = {
  configure: (cfg: Config) => void;
  point: (x: number, y: number, on: boolean) => void;
  ripple: (x: number, y: number) => void;
  resize: () => void;
  readColours: () => void;
  wake: () => void;
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
  let failed = false;
  let disposed = false;
  let frame = 0;
  let last = 0;
  const size = { w: 0, h: 0 };
  const read = rgbReader();
  const grout: [number, number, number] = [0.85, 0.85, 0.85];
  let clay: [number, number, number] = [0.8, 0.5, 0.4];
  let palette: [number, number, number][] = [];
  let glazeFills: string[] = [];
  let picture: HTMLImageElement | null = null;
  let pictureFor = "";

  // The grid, rebuilt on resize or a change of cut.
  let n = 0;
  let cx = new Float32Array(0);
  let cy = new Float32Array(0);
  let statics = new Float32Array(0);
  let tilt = new Float32Array(0);
  let vel = new Float32Array(0);
  let gridKey = "";
  const pointer = { x: 0, y: 0, on: false };
  let lamp = 0;
  let flash = 0;
  const rings: Ring[] = Array.from({ length: MAX_RINGS }, () => ({
    x: 0,
    y: 0,
    t0: 0,
    on: false,
  }));

  const build = (): boolean => {
    const gl = createGL(canvas, { alpha: false });
    if (!gl) return false;
    const program = createProgram(gl, VERTEX, FRAGMENT);
    if (!program) return false;
    const vao = gl.createVertexArray();
    const staticBuf = gl.createBuffer();
    const tiltBuf = gl.createBuffer();
    if (!vao || !staticBuf || !tiltBuf) return false;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, staticBuf);
    const attr = (
      name: string,
      count: number,
      offset: number,
      stride: number,
    ) => {
      const at = program.attributes[name];
      if (at === undefined || at < 0) return;
      gl.enableVertexAttribArray(at);
      gl.vertexAttribPointer(at, count, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(at, 1);
    };
    attr("a_tile", 4, 0, FLOATS * 4);
    attr("a_jitA", 4, 16, FLOATS * 4);
    attr("a_jitB", 4, 32, FLOATS * 4);
    attr("a_color", 4, 48, FLOATS * 4);
    gl.bindBuffer(gl.ARRAY_BUFFER, tiltBuf);
    attr("a_tilt", 2, 0, 8);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gpu = { gl, program, vao, statics: staticBuf, tilts: tiltBuf, lost: false };
    return true;
  };

  const release = () => {
    const g = gpu;
    gpu = null;
    if (!g || g.lost) return;
    g.gl.deleteVertexArray(g.vao);
    g.gl.deleteBuffer(g.statics);
    g.gl.deleteBuffer(g.tilts);
    g.program.dispose();
  };

  /** The picture drawn into a small canvas at `cols × rows` × 4, cover-fitted. */
  const samplePicture = (cols: number, rows: number) => {
    const sw = cols * 4;
    const sh = rows * 4;
    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const draw = (srcW: number, srcH: number, paint: () => void) => {
      const scale = Math.max(sw / srcW, sh / srcH);
      ctx.save();
      ctx.translate((sw - srcW * scale) / 2, (sh - srcH * scale) / 2);
      ctx.scale(scale, scale);
      paint();
      ctx.restore();
    };
    let ok = false;
    if (picture && picture.complete && picture.naturalWidth > 0) {
      const img = picture;
      draw(img.naturalWidth, img.naturalHeight, () => ctx.drawImage(img, 0, 0));
      try {
        ctx.getImageData(0, 0, 1, 1);
        ok = true;
      } catch {
        // A picture from another origin without CORS cannot be read back.
        ctx.clearRect(0, 0, sw, sh);
      }
    }
    if (!ok) {
      draw(PIC_W, PIC_H, () => {
        for (const s of PICTURE) {
          const gi = s[0] === "p" ? s[2] : s[0] === "c" ? s[4] : s[5];
          ctx.fillStyle = glazeFills[gi] ?? "grey";
          ctx.beginPath();
          if (s[0] === "r") {
            if (s[6]) ctx.roundRect(s[1], s[2], s[3], s[4], s[6]);
            else ctx.rect(s[1], s[2], s[3], s[4]);
            ctx.fill();
          } else if (s[0] === "c") {
            ctx.arc(s[1], s[2], s[3], 0, Math.PI * 2);
            ctx.fill();
          } else if (s[0] === "e") {
            ctx.ellipse(s[1], s[2], s[3], s[4], 0, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fill(new Path2D(s[1]));
          }
        }
      });
    }
    try {
      return ctx.getImageData(0, 0, sw, sh).data;
    } catch {
      return null;
    }
  };

  /** Lays out the tiles and their colours for the current size and cut. */
  const layout = (force = false) => {
    const c = cfg;
    if (!c || size.w < 1 || size.h < 1) return;
    const t = clamp(c.tile, 6, 40);
    const key = `${size.w}x${size.h}|${t}|${c.jitter}|${c.askew}|${c.seed}|${c.colourKey}|${c.src}|${picture?.complete ? 1 : 0}`;
    if (!force && key === gridKey) return;
    gridKey = key;
    const cols = Math.ceil(size.w / t) + 1;
    const rows = Math.ceil(size.h / t) + 1;
    const ox = (size.w - cols * t) / 2;
    const oy = (size.h - rows * t) / 2;
    const count = cols * rows;
    if (count !== n) {
      n = count;
      cx = new Float32Array(n);
      cy = new Float32Array(n);
      statics = new Float32Array(n * FLOATS);
      tilt = new Float32Array(n * 2);
      vel = new Float32Array(n * 2);
    }
    const pixels = samplePicture(cols, rows);
    const gap = Math.max(1.4, t * 0.11);
    const seed = Math.round(c.seed);
    const jit = clamp(c.jitter, 0, 1) * 0.07;
    const skew = (clamp(c.askew, 0, 12) * Math.PI) / 180;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const i = row * cols + col;
        const h = (k: number) => hash(seed * 7919 + i, k);
        cx[i] = ox + (col + 0.5) * t;
        cy[i] = oy + (row + 0.5) * t;
        const o = i * FLOATS;
        statics[o] = cx[i] ?? 0;
        statics[o + 1] = cy[i] ?? 0;
        statics[o + 2] = (t - gap) * (0.97 + h(1) * 0.05);
        statics[o + 3] = (h(2) - 0.5) * 2 * skew;
        for (let k = 0; k < 8; k += 1)
          statics[o + 4 + k] = (h(3 + k) - 0.5) * 2 * jit;
        // Box-average the tile's 4 × 4 block of the picture.
        let r = 0;
        let g = 0;
        let b = 0;
        if (pixels) {
          for (let y = 0; y < 4; y += 1) {
            for (let x = 0; x < 4; x += 1) {
              const p = ((row * 4 + y) * cols * 4 + col * 4 + x) * 4;
              r += pixels[p] ?? 0;
              g += pixels[p + 1] ?? 0;
              b += pixels[p + 2] ?? 0;
            }
          }
          r /= 16 * 255;
          g /= 16 * 255;
          b /= 16 * 255;
        } else {
          r = g = b = 0.8;
        }
        // Pulled toward the nearest glaze, as a glazer would match it.
        let best = 0;
        let bestD = Infinity;
        for (let k = 0; k < palette.length; k += 1) {
          const q = palette[k];
          if (!q) continue;
          const d = (q[0] - r) ** 2 + (q[1] - g) ** 2 + (q[2] - b) ** 2;
          if (d < bestD) {
            bestD = d;
            best = k;
          }
        }
        const q = palette[best];
        const pull = c.src && picture ? 0.35 : 0.7;
        if (q) {
          r = lerp(r, q[0], pull);
          g = lerp(g, q[1], pull);
          b = lerp(b, q[2], pull);
        }
        // Each tile's glaze came out of the kiln a little different.
        const shade = 0.94 + h(12) * 0.1;
        const warm = (h(13) - 0.5) * 0.03;
        statics[o + 12] = clamp(r * shade + warm, 0, 1);
        statics[o + 13] = clamp(g * shade, 0, 1);
        statics[o + 14] = clamp(b * shade - warm, 0, 1);
        statics[o + 15] = h(14);
      }
    }
    tilt.fill(0);
    vel.fill(0);
    upload();
  };

  const upload = () => {
    const g = gpu;
    if (!g || g.lost) return;
    const { gl } = g;
    gl.bindBuffer(gl.ARRAY_BUFFER, g.statics);
    gl.bufferData(gl.ARRAY_BUFFER, statics, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.tilts);
    gl.bufferData(gl.ARRAY_BUFFER, tilt, gl.DYNAMIC_DRAW);
  };

  const draw = () => {
    const g = gpu;
    const c = cfg;
    if (!c || !g || g.lost || size.w < 1 || n === 0) return;
    const { gl, program } = g;
    const u = program.uniforms;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(grout[0], grout[1], grout[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.tilts);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, tilt);
    const a = (c.light * Math.PI) / 180;
    const lx = Math.cos(a) * 0.62;
    const ly = Math.sin(a) * 0.62;
    const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
    if (u.u_size) gl.uniform2f(u.u_size, size.w, size.h);
    if (u.u_light) gl.uniform3f(u.u_light, lx, ly, lz);
    if (u.u_lamp)
      gl.uniform3f(
        u.u_lamp,
        pointer.x,
        pointer.y,
        Math.max(60, c.radius * 1.4),
      );
    if (u.u_lampOn) gl.uniform1f(u.u_lampOn, lamp);
    if (u.u_glaze) gl.uniform1f(u.u_glaze, clamp(c.glaze, 0, 1));
    if (u.u_clay) gl.uniform3f(u.u_clay, clay[0], clay[1], clay[2]);
    if (u.u_flash) gl.uniform1f(u.u_flash, flash);
    gl.bindVertexArray(g.vao);
    // A soft shadow first: each tile sits proud of the grout.
    if (u.u_shadow) gl.uniform1f(u.u_shadow, 1);
    if (u.u_offset) gl.uniform2f(u.u_offset, 0.7, 1.3);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    if (u.u_shadow) gl.uniform1f(u.u_shadow, 0);
    if (u.u_offset) gl.uniform2f(u.u_offset, 0, 0);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
    if (!root.hasAttribute("data-live")) root.setAttribute("data-live", "");
  };

  /** One step of every tile's tilt spring; returns whether anything still moves. */
  const step = (dt: number, now: number) => {
    const c = cfg;
    if (!c) return false;
    const amp = (clamp(c.tilt, 0, 35) * Math.PI) / 180;
    const R = Math.max(10, c.radius);
    const R2 = R * R;
    const w = clamp(c.wobble, 0, 1);
    const k = lerp(springs.snap.stiffness, springs.recoil.stiffness, w);
    const damp = lerp(springs.snap.damping, springs.recoil.damping, w);
    const band = Math.max(26, c.tile * 2.2);
    const speed = Math.max(60, c.rippleSpeed);
    const live = pointer.on && c.interactive;
    let moving = false;
    for (let i = 0; i < n; i += 1) {
      const x = cx[i] ?? 0;
      const y = cy[i] ?? 0;
      let tx = 0;
      let ty = 0;
      if (live) {
        const dx = pointer.x - x;
        const dy = pointer.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1;
          const f = 1 - d2 / R2;
          const lean = amp * f * f;
          tx += (dx / d) * lean;
          ty += (dy / d) * lean;
        }
      }
      for (let r = 0; r < MAX_RINGS; r += 1) {
        const ring = rings[r];
        if (!ring?.on) continue;
        const dx = x - ring.x;
        const dy = y - ring.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const front = (speed * (now - ring.t0)) / 1000;
        const u = (d - front) / band;
        if (u > -2.5 && u < 2.5) {
          const g = (Math.exp(-u * u) * amp) / (1 + front / 700);
          tx += (dx / d) * g;
          ty += (dy / d) * g;
        }
      }
      const ix = i * 2;
      let px = tilt[ix] ?? 0;
      let py = tilt[ix + 1] ?? 0;
      let vx = vel[ix] ?? 0;
      let vy = vel[ix + 1] ?? 0;
      vx += (k * (tx - px) - damp * vx) * dt;
      vy += (k * (ty - py) - damp * vy) * dt;
      px += vx * dt;
      py += vy * dt;
      if (
        Math.abs(px - tx) + Math.abs(py - ty) > 2e-4 ||
        Math.abs(vx) + Math.abs(vy) > 2e-3
      ) {
        moving = true;
      } else {
        px = tx;
        py = ty;
        vx = 0;
        vy = 0;
      }
      tilt[ix] = px;
      tilt[ix + 1] = py;
      vel[ix] = vx;
      vel[ix + 1] = vy;
    }
    return moving;
  };

  const ringsLive = (now: number) => {
    const c = cfg;
    if (!c) return false;
    const reach = Math.hypot(size.w, size.h) + Math.max(26, c.tile * 2.2) * 3;
    let any = false;
    for (const ring of rings) {
      if (!ring.on) continue;
      if ((Math.max(60, c.rippleSpeed) * (now - ring.t0)) / 1000 > reach)
        ring.on = false;
      else any = true;
    }
    return any;
  };

  const tick = (now: number) => {
    frame = 0;
    const c = cfg;
    if (disposed || !c || !visible.current || document.hidden) {
      last = 0;
      return;
    }
    const dt = last ? Math.min(0.034, (now - last) / 1000) : 1 / 60;
    last = now;
    let moving = false;
    const rippling = ringsLive(now);
    if (c.motionSafe) {
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      for (let s = 0; s < steps; s += 1) moving = step(dt / steps, now);
    }
    const lampTo = pointer.on && c.interactive ? 1 : 0;
    lamp += (lampTo - lamp) * (1 - Math.exp(-dt * 9));
    if (Math.abs(lampTo - lamp) < 0.004) lamp = lampTo;
    flash = flash > 0.004 ? flash * Math.exp(-dt * 5) : 0;
    draw();
    if (moving || (rippling && c.motionSafe) || lamp !== lampTo || flash > 0) {
      frame = window.requestAnimationFrame(tick);
    } else {
      last = 0;
    }
  };

  const kick = () => {
    if (disposed || frame || !visible.current || document.hidden) return;
    frame = window.requestAnimationFrame(tick);
  };

  const readColours = () => {
    const kids = carriers.children;
    palette = [];
    glazeFills = [];
    for (let i = 0; i < kids.length; i += 1) {
      const el = kids[i];
      if (!el) continue;
      const rgb = read(getComputedStyle(el).color);
      if (i === 0) {
        grout[0] = rgb[0];
        grout[1] = rgb[1];
        grout[2] = rgb[2];
      } else if (i === 1) {
        clay = rgb;
      } else {
        palette.push(rgb);
        glazeFills.push(
          `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`,
        );
      }
    }
  };

  const loadPicture = (src: string) => {
    if (src === pictureFor) return;
    pictureFor = src;
    picture = null;
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (disposed || pictureFor !== src) return;
      picture = img;
      layout(true);
      draw();
    };
    img.src = src;
  };

  const resize = () => {
    const c = cfg;
    size.w = root.clientWidth;
    size.h = root.clientHeight;
    const g = gpu;
    if (!c || !g || g.lost || size.w < 1 || size.h < 1) return;
    resizeGL(g.gl, canvas, { dprCap: clamp(c.dpr, 0.5, 2) });
    layout();
    draw();
  };

  const start = () => {
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
      loadPicture(next.src);
      if (!gpu) {
        if (!start()) {
          // No WebGL2: the server's still stays, and nothing retries.
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
            gridKey = "";
            if (!disposed && start()) draw();
          },
        );
        return;
      }
      if (!was) return;
      if (was.motionSafe !== next.motionSafe) {
        // Reduced motion holds every tile flat.
        tilt.fill(0);
        vel.fill(0);
        for (const ring of rings) ring.on = false;
      }
      if (was.colourKey !== next.colourKey) readColours();
      if (was.dpr !== next.dpr) resize();
      else layout();
      draw();
      kick();
    },
    point(x, y, on) {
      pointer.x = x;
      pointer.y = y;
      pointer.on = on;
      kick();
    },
    ripple(x, y) {
      const c = cfg;
      if (!c) return;
      const now = performance.now();
      if (!c.motionSafe) {
        flash = 1;
        kick();
        return;
      }
      // The oldest ring makes way for the new one.
      let slot = rings[0];
      for (const ring of rings) {
        if (!ring.on) {
          slot = ring;
          break;
        }
        if (slot && ring.t0 < slot.t0) slot = ring;
      }
      if (!slot) return;
      slot.x = x;
      slot.y = y;
      slot.t0 = now;
      slot.on = true;
      kick();
    },
    resize,
    readColours() {
      readColours();
      layout(true);
      draw();
    },
    wake() {
      draw();
      kick();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      detach();
      release();
      root.removeAttribute("data-live");
    },
  };
}

/* -------------------------------- component ------------------------------- */

const sideOf = (x: number, y: number) => {
  const h = x < 0.36 ? "left" : x > 0.64 ? "right" : "";
  const v = y < 0.36 ? "top" : y > 0.64 ? "bottom" : "";
  if (!h && !v) return "the centre";
  return `the ${[v, h].filter(Boolean).join(" ")}`;
};

/**
 * A picture rebuilt from small glazed ceramic tiles. Each tile is an uneven
 * square — its corners nudged by a seeded jitter, so no two are cut alike —
 * set a hair askew in grout, its colour box-averaged from the picture and
 * pulled toward the nearest of the picture's own glazes, with each tile's
 * glaze a touch lighter or darker, the way a kiln batch varies. One instanced
 * WebGL2 draw lights every tile per pixel: a pooled centre, a rolled rim that
 * catches the light, faint handmade unevenness and a hairline of bare clay.
 *
 * Every tile has its own tilt spring, between the springs.snap and
 * springs.recoil constants by `wobble`. Under the pointer the tiles lean
 * toward it, so the glaze catches the key light and a lamp at the pointer in
 * a ring of glints that runs after the hand; as it moves on they spring back
 * through rest. A click sends a ring across the whole wall: each tile it
 * crosses is kicked outward and rings back, so a band of highlights travels
 * to the edges. Arrow keys move a keyboard lamp, Enter or Space sends the
 * ripple. The loop runs only while tiles move; under reduced motion the
 * tiles never tilt — the lamp still lights them, and a ripple is a brief glow.
 */
export function ZelligeWall({
  src,
  alt = DEFAULT_ALT,
  tile = 14,
  glaze = 0.6,
  tilt = 18,
  radius = 90,
  rippleSpeed = 520,
  wobble = 0.5,
  jitter = 0.5,
  askew = 2.5,
  grout = DEFAULT_GROUT,
  light = -135,
  interactive = true,
  seed = 7,
  dpr = 2,
  onRipple,
  label = "Glazed tile wall",
  disabled = false,
  className,
}: ZelligeWallProps) {
  const motionSafe = useMotionSafe();
  const uid = React.useId();
  const hintId = `${uid}-hint`;
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const carriersRef = React.useRef<HTMLSpanElement | null>(null);
  const engine = React.useRef<Engine | null>(null);
  const visible = React.useRef(false);
  const keyLamp = React.useRef<{ x: number; y: number } | null>(null);
  const [lampAt, setLampAt] = React.useState<{ x: number; y: number } | null>(
    null,
  );
  const [said, setSaid] = React.useState("");
  const count = React.useRef(0);
  const active = interactive && !disabled;

  const colours = [grout, CLAY, ...GLAZES];
  const config: Config = {
    tile,
    glaze,
    tilt,
    radius,
    rippleSpeed,
    wobble,
    jitter,
    askew,
    light,
    interactive: active,
    seed,
    dpr,
    motionSafe,
    src: src ?? "",
    colourKey: colours.join("|"),
  };
  const latest = React.useRef(config);

  React.useEffect(() => {
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
      visible.current = Boolean(entries[entries.length - 1]?.isIntersecting);
      if (visible.current) engine.current?.wake();
    });
    watcher.observe(node);
    return () => {
      sizer.disconnect();
      watcher.disconnect();
      visible.current = false;
    };
  }, []);

  const local = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0, w: 1, h: 1 };
    return { x: clientX - r.left, y: clientY - r.top, w: r.width, h: r.height };
  };

  const sendRipple = (x: number, y: number, w: number, h: number) => {
    engine.current?.ripple(x, y);
    const sx = Math.round((x / Math.max(1, w)) * 1000) / 1000;
    const sy = Math.round((y / Math.max(1, h)) * 1000) / 1000;
    count.current += 1;
    setSaid(
      `Ripple sent from ${sideOf(sx, sy)}${count.current % 2 ? "." : " again."}`,
    );
    onRipple?.({ x: sx, y: sy });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;
    const w = root.clientWidth;
    const h = root.clientHeight;
    const stepPx = Math.max(tile * 2, Math.min(w, h) * 0.08);
    const at = keyLamp.current ?? { x: w / 2, y: h / 2 };
    let next: { x: number; y: number } | null = null;
    if (event.key === "ArrowLeft") next = { x: at.x - stepPx, y: at.y };
    else if (event.key === "ArrowRight") next = { x: at.x + stepPx, y: at.y };
    else if (event.key === "ArrowUp") next = { x: at.x, y: at.y - stepPx };
    else if (event.key === "ArrowDown") next = { x: at.x, y: at.y + stepPx };
    else if (event.key === "Home") next = { x: w / 2, y: h / 2 };
    if (next) {
      event.preventDefault();
      const lamp = {
        x: Math.round(clamp(next.x, 0, w)),
        y: Math.round(clamp(next.y, 0, h)),
      };
      keyLamp.current = lamp;
      setLampAt({
        x: r3(lamp.x / Math.max(1, w)),
        y: r3(lamp.y / Math.max(1, h)),
      });
      engine.current?.point(lamp.x, lamp.y, true);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.repeat) return;
      sendRipple(at.x, at.y, w, h);
    }
  };

  const groutStep = Math.max(6, Math.round(tile));

  return (
    <div
      ref={bindRoot}
      role={active ? "group" : "img"}
      aria-roledescription={active ? "tile wall" : undefined}
      aria-label={active ? label : `${label}: ${alt}`}
      aria-describedby={active ? hintId : undefined}
      tabIndex={active ? 0 : undefined}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (!keyLamp.current) return;
        keyLamp.current = null;
        setLampAt(null);
        engine.current?.point(0, 0, false);
      }}
      onPointerMove={(event) => {
        if (!active) return;
        const p = local(event.clientX, event.clientY);
        engine.current?.point(p.x, p.y, true);
      }}
      onPointerLeave={() => {
        if (!active) return;
        const k = keyLamp.current;
        engine.current?.point(k?.x ?? 0, k?.y ?? 0, Boolean(k));
      }}
      onClick={(event) => {
        if (!active || event.detail === 0) return;
        const p = local(event.clientX, event.clientY);
        sendRipple(p.x, p.y, p.w, p.h);
      }}
      className={cn(
        "group/zellige-wall relative isolate h-full w-full overflow-clip rounded-3 [contain:paint] select-none",
        active && "cursor-pointer touch-pan-y",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
        disabled && "opacity-60",
        className,
      )}
      style={{ backgroundColor: grout }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 group-data-live/zellige-wall:opacity-0"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <PictureSvg />
        )}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `linear-gradient(to right, ${grout} 0 1.5px, transparent 1.5px), linear-gradient(to bottom, ${grout} 0 1.5px, transparent 1.5px), linear-gradient(135deg, oklch(1 0 0 / 0.16), transparent 45%, oklch(0 0 0 / 0.06))`,
            backgroundSize: `${groutStep}px ${groutStep}px, ${groutStep}px ${groutStep}px, 100% 100%`,
            backgroundPosition: "center, center, center",
          }}
        />
      </div>
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full opacity-0 transition-opacity duration-500 group-data-live/zellige-wall:opacity-100"
      />
      <span
        ref={carriersRef}
        aria-hidden
        className="pointer-events-none absolute size-0 overflow-hidden"
      >
        {colours.map((c, i) => (
          <span key={i} style={{ color: c }} />
        ))}
      </span>
      <span
        aria-hidden
        onTransitionEnd={() => engine.current?.readColours()}
        className="pointer-events-none absolute size-0 overflow-hidden transition-colors duration-1"
        style={{ color: grout }}
      />
      {lampAt ? (
        <span
          aria-hidden
          className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[oklch(1_0_0/0.85)] opacity-0 shadow-[0_0_0_1px_oklch(0_0_0/0.25)] group-focus-visible/zellige-wall:opacity-100"
          style={{ left: `${lampAt.x * 100}%`, top: `${lampAt.y * 100}%` }}
        />
      ) : null}
      {active ? (
        <>
          <span role="img" aria-label={alt} className="sr-only" />
          <p id={hintId} className="sr-only">
            Move the pointer over the tiles, or use the arrow keys to move a
            lamp, and the tiles lean toward it. Click, or press Enter or Space,
            to send a ripple across the wall.
          </p>
          <span aria-live="polite" className="sr-only">
            {said}
          </span>
        </>
      ) : null}
    </div>
  );
}
